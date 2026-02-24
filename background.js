// FocusGate - Background Service Worker

const SETTINGS_KEY = 'settings';
const TEMP_ACCESS_KEY = 'temporaryAccess';

const BLOCK_ALARM_PREFIX = 'focusgate-block-expire-';
const ACCESS_ALARM_PREFIX = 'focusgate-access-expire-';

const DEFAULT_SETTINGS = {
  enabled: true,
  defaultAccessDuration: 15, // minutes
  blocklist: [],
  challengeTypes: {
    typing: { difficulty: 3, duration: 15 }
  }
};

let updateQueue = Promise.resolve();
let initialized = false;
let initializationPromise = null;

void initializeExtension('service-worker-start');

chrome.runtime.onInstalled.addListener(() => {
  void initializeExtension('onInstalled');
});

chrome.runtime.onStartup.addListener(() => {
  void initializeExtension('onStartup');
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm || !alarm.name) {
    return;
  }

  if (alarm.name.startsWith(BLOCK_ALARM_PREFIX) || alarm.name.startsWith(ACCESS_ALARM_PREFIX)) {
    void queueRulesUpdate(`alarm:${alarm.name}`);
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'local') {
    return;
  }

  if (changes[SETTINGS_KEY] || changes[TEMP_ACCESS_KEY]) {
    void queueRulesUpdate('storage-change');
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || typeof request.action !== 'string') {
    sendResponse({ success: false, error: 'Invalid request' });
    return false;
  }

  if (sender?.id && sender.id !== chrome.runtime.id) {
    sendResponse({ success: false, error: 'Unauthorized sender' });
    return false;
  }

  void (async () => {
    try {
      await initializeExtension('message');

      if (request.action === 'grantTemporaryAccess') {
        const result = await grantTemporaryAccess(
          request.urlPattern,
          request.duration,
          request.timeSpent || 0
        );
        sendResponse({ success: true, access: result });
        return;
      }

      if (request.action === 'getSettings') {
        const settings = await getSettings();
        sendResponse({ success: true, settings });
        return;
      }

      if (request.action === 'updateSettings') {
        const nextSettings = sanitizeSettings(request.settings || {});
        await saveSettings(nextSettings);
        await queueRulesUpdate('updateSettings');
        sendResponse({ success: true });
        return;
      }

      sendResponse({ success: false, error: 'Unknown action' });
    } catch (error) {
      console.error('Message handling failed:', error);
      sendResponse({ success: false, error: error?.message || 'Unexpected error' });
    }
  })();

  return true;
});

async function initializeExtension(reason) {
  if (initialized) {
    return;
  }
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const existingSettings = await getSettingsRaw();
    const normalizedSettings = sanitizeSettings(existingSettings || {});

    // Merge defaults for first run or when schema evolves.
    if (!existingSettings || JSON.stringify(existingSettings) !== JSON.stringify(normalizedSettings)) {
      await saveSettings(normalizedSettings);
    }

    const existingAccess = await getTemporaryAccessRaw();
    const normalizedAccess = sanitizeTemporaryAccess(existingAccess || {});
    if (JSON.stringify(existingAccess || {}) !== JSON.stringify(normalizedAccess)) {
      await saveTemporaryAccess(normalizedAccess);
    }

    initialized = true;
    await queueRulesUpdate(`initialize:${reason}`);
    console.log(`FocusGate initialized (${reason})`);
  })();

  try {
    await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}

async function queueRulesUpdate(reason) {
  updateQueue = updateQueue
    .then(() => updateBlockingRules(reason))
    .catch((error) => {
      console.error('Rule update failed:', error);
    });

  return updateQueue;
}

async function updateBlockingRules(reason) {
  const now = Date.now();
  const settings = await getSettings();
  const temporaryAccess = await getTemporaryAccess();

  const cleanedBlocklist = removeExpiredBlocks(settings.blocklist, now);
  const cleanedAccess = removeExpiredTemporaryAccess(temporaryAccess, now);

  if (cleanedBlocklist.changed) {
    settings.blocklist = cleanedBlocklist.value;
    await saveSettings(settings);
  }

  if (cleanedAccess.changed) {
    await saveTemporaryAccess(cleanedAccess.value);
  }

  await syncExpiryAlarms(cleanedBlocklist.value, cleanedAccess.value, now);

  const rulesToAdd = buildBlockingRules(cleanedBlocklist.value, cleanedAccess.value, now);

  const existingRules = await chrome.declarativeNetRequest.getSessionRules();
  const removeRuleIds = existingRules.map((rule) => rule.id);

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds,
    addRules: rulesToAdd
  });

  console.log(
    `Rules refreshed (${reason}): add=${rulesToAdd.length}, remove=${removeRuleIds.length}`
  );
}

function buildBlockingRules(blocklist, temporaryAccess, now) {
  const rules = [];
  let ruleId = 1;
  const seenDomains = new Set();

  for (const entry of blocklist) {
    const domain = normalizeDomain(entry?.urlPattern);
    if (!domain || seenDomains.has(domain)) {
      continue;
    }

    seenDomains.add(domain);

    if (isDomainTemporarilyAccessible(domain, temporaryAccess, now)) {
      continue;
    }

    rules.push({
      id: ruleId++,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          url:
            `${chrome.runtime.getURL('friction-page/index.html')}?originalUrl=` +
            encodeURIComponent(`https://${domain}`)
        }
      },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ['main_frame']
      }
    });
  }

  return rules;
}

async function grantTemporaryAccess(urlPattern, durationMinutes, _timeSpentOnChallenge = 0) {
  const domain = normalizeDomain(urlPattern);
  if (!domain) {
    throw new Error('Invalid domain for temporary access');
  }

  const settings = await getSettings();
  const isBlocked = settings.blocklist.some((entry) => normalizeDomain(entry.urlPattern) === domain);
  if (!isBlocked) {
    throw new Error('Domain is not in blocklist');
  }

  const parsedDuration = Number(durationMinutes);
  const duration = Number.isFinite(parsedDuration) && parsedDuration > 0
    ? parsedDuration
    : settings.defaultAccessDuration;

  const now = Date.now();
  const expiresAt = now + duration * 60 * 1000;

  const temporaryAccess = await getTemporaryAccess();
  temporaryAccess[domain] = {
    grantedAt: now,
    expiresAt,
    duration
  };

  await saveTemporaryAccess(temporaryAccess);
  await queueRulesUpdate(`grant:${domain}`);

  return { domain, duration, expiresAt };
}

function isDomainTemporarilyAccessible(domain, temporaryAccess, now) {
  const entry = temporaryAccess[domain];
  return Boolean(entry && Number.isFinite(entry.expiresAt) && entry.expiresAt > now);
}

function removeExpiredBlocks(blocklist, now) {
  const next = (Array.isArray(blocklist) ? blocklist : []).filter((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }

    if (!entry.unblockAt) {
      return true;
    }

    return Number(entry.unblockAt) > now;
  });

  return {
    value: next,
    changed: next.length !== (Array.isArray(blocklist) ? blocklist.length : 0)
  };
}

function removeExpiredTemporaryAccess(temporaryAccess, now) {
  const next = {};
  let changed = false;

  for (const [domain, entry] of Object.entries(temporaryAccess || {})) {
    if (!entry || typeof entry !== 'object') {
      changed = true;
      continue;
    }

    const expiresAt = Number(entry.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      changed = true;
      continue;
    }

    next[domain] = {
      grantedAt: Number(entry.grantedAt) || now,
      expiresAt,
      duration: Number(entry.duration) || DEFAULT_SETTINGS.defaultAccessDuration
    };
  }

  if (!changed) {
    changed = Object.keys(next).length !== Object.keys(temporaryAccess || {}).length;
  }

  return { value: next, changed };
}

async function syncExpiryAlarms(blocklist, temporaryAccess, now) {
  const allAlarms = await chrome.alarms.getAll();

  const managedAlarmNames = new Set(
    allAlarms
      .map((alarm) => alarm.name)
      .filter((name) => name.startsWith(BLOCK_ALARM_PREFIX) || name.startsWith(ACCESS_ALARM_PREFIX))
  );

  const desiredAlarms = [];

  for (const entry of blocklist) {
    if (entry?.id && entry.unblockAt && Number(entry.unblockAt) > now) {
      desiredAlarms.push({
        name: `${BLOCK_ALARM_PREFIX}${entry.id}`,
        when: Number(entry.unblockAt)
      });
    }
  }

  for (const [domain, access] of Object.entries(temporaryAccess)) {
    if (access.expiresAt > now) {
      desiredAlarms.push({
        name: `${ACCESS_ALARM_PREFIX}${domain}`,
        when: access.expiresAt
      });
    }
  }

  const desiredNames = new Set(desiredAlarms.map((alarm) => alarm.name));

  for (const name of managedAlarmNames) {
    if (!desiredNames.has(name)) {
      await chrome.alarms.clear(name);
    }
  }

  for (const alarm of desiredAlarms) {
    await chrome.alarms.create(alarm.name, { when: alarm.when });
  }
}

function sanitizeSettings(settings) {
  const incoming = settings && typeof settings === 'object' ? settings : {};
  const blocklist = sanitizeBlocklist(incoming.blocklist);

  const defaultAccessDuration = positiveInt(
    incoming.defaultAccessDuration,
    DEFAULT_SETTINGS.defaultAccessDuration
  );

  const challengeTypes = {
    typing: {
      difficulty: positiveInt(
        incoming.challengeTypes?.typing?.difficulty,
        DEFAULT_SETTINGS.challengeTypes.typing.difficulty
      ),
      duration: positiveInt(
        incoming.challengeTypes?.typing?.duration,
        defaultAccessDuration
      )
    }
  };

  return {
    enabled: incoming.enabled !== false,
    defaultAccessDuration,
    blocklist,
    challengeTypes
  };
}

function sanitizeTemporaryAccess(temporaryAccess) {
  const incoming = temporaryAccess && typeof temporaryAccess === 'object' ? temporaryAccess : {};
  const now = Date.now();
  const sanitized = {};

  for (const [domain, entry] of Object.entries(incoming)) {
    const normalized = normalizeDomain(domain);
    if (!normalized || !entry || typeof entry !== 'object') {
      continue;
    }

    const expiresAt = Number(entry.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      continue;
    }

    sanitized[normalized] = {
      grantedAt: Number(entry.grantedAt) || now,
      expiresAt,
      duration: positiveInt(entry.duration, DEFAULT_SETTINGS.defaultAccessDuration)
    };
  }

  return sanitized;
}

function sanitizeBlocklist(blocklist) {
  const input = Array.isArray(blocklist) ? blocklist : [];
  const deduped = [];
  const seenDomains = new Set();

  for (const rawEntry of input) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      continue;
    }

    const domain = normalizeDomain(rawEntry.urlPattern);
    if (!domain || seenDomains.has(domain)) {
      continue;
    }

    seenDomains.add(domain);

    const entry = {
      ...rawEntry,
      id: String(rawEntry.id || Date.now() + deduped.length),
      urlPattern: domain,
      createdAt: Number(rawEntry.createdAt) || Date.now()
    };

    if (rawEntry.unblockAt) {
      const unblockAt = Number(rawEntry.unblockAt);
      if (Number.isFinite(unblockAt) && unblockAt > 0) {
        entry.unblockAt = unblockAt;
      } else {
        delete entry.unblockAt;
      }
    } else {
      delete entry.unblockAt;
    }

    deduped.push(entry);
  }

  return deduped;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDomain(value) {
  if (typeof value !== 'string') {
    return null;
  }

  let domain = value.trim().toLowerCase();
  if (!domain) {
    return null;
  }

  if (domain.startsWith('http://') || domain.startsWith('https://')) {
    try {
      domain = new URL(domain).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  domain = domain
    .replace(/^\*\./, '')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .replace(/\/.*$/, '');

  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(domain) || !domain.includes('.')) {
    return null;
  }

  return domain;
}

async function getSettingsRaw() {
  const result = await getFromStorage([SETTINGS_KEY]);
  return result[SETTINGS_KEY] || {};
}

async function getSettings() {
  return sanitizeSettings(await getSettingsRaw());
}

async function saveSettings(settings) {
  await setInStorage({ [SETTINGS_KEY]: sanitizeSettings(settings) });
}

async function getTemporaryAccessRaw() {
  const result = await getFromStorage([TEMP_ACCESS_KEY]);
  return result[TEMP_ACCESS_KEY] || {};
}

async function getTemporaryAccess() {
  return sanitizeTemporaryAccess(await getTemporaryAccessRaw());
}

async function saveTemporaryAccess(temporaryAccess) {
  await setInStorage({ [TEMP_ACCESS_KEY]: sanitizeTemporaryAccess(temporaryAccess) });
}

function getFromStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`storage.get failed: ${chrome.runtime.lastError.message}`));
        return;
      }

      resolve(result || {});
    });
  });
}

function setInStorage(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(`storage.set failed: ${chrome.runtime.lastError.message}`));
        return;
      }

      resolve();
    });
  });
}
