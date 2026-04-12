// ResistGate - Background Service Worker

const SETTINGS_KEY = 'settings';
const TEMP_ACCESS_KEY = 'temporaryAccess';
const ANALYTICS_KEY = 'analytics';
const OVERRIDE_STATE_KEY = 'overrideState';
const WELCOME_SHOWN_KEY = 'welcomeShown';
const INSTALLATION_KEY = 'installation';

const BLOCK_ALARM_PREFIX = 'resistgate-block-expire-';
const ACCESS_ALARM_PREFIX = 'resistgate-access-expire-';
const COMMITMENT_ALARM = 'resistgate-commitment-expire';
const ENTITLEMENT_REFRESH_ALARM = 'resistgate-entitlement-refresh';
const DAILY_RESET_ALARM = 'resistgate-daily-reset';
const BUNDLE_UNLOCK_ALARM_PREFIX = 'resistgate-bundle-unlock-';
const DAILY_COUNT_KEY = 'dailyBlockCount';
const RESISTANCE_COUNTERS_KEY = 'resistanceCounters';
const WORK_TIMER_KEY = 'workTimer';
const MAX_ANALYTICS_EVENTS = 3000;
const RESISTGATE_SITE_URL = 'https://www.orlandoascanio.com';
const RESISTGATE_PRICING_PATH = '/en/pricing';
const RESISTGATE_PRODUCT_SLUG = 'resistgate';
const TRUSTED_EXTERNAL_ORIGINS = new Set([
  'http://localhost:3000',
  'https://www.orlandoascanio.com',
  'https://orlandoascanio.com'
]);

const DEFAULT_SETTINGS = {
  enabled: true,
  defaultAccessDuration: 15, // minutes
  blocklist: [],
  challengeTypes: {
    typing: { difficulty: 3, duration: 15 }
  },
  freeExperience: {
    manualOverrideDelaySeconds: 12,
    schedule: {
      enabled: false,
      days: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '17:00'
    }
  },
  subscription: {
    tier: 'free',
    productSlug: RESISTGATE_PRODUCT_SLUG,
    billingCycle: null,
    upgradedAt: null,
    email: null,
    subscriptionStatus: 'inactive',
    installToken: null,
    licenseKey: null,
    expiresAt: null
  },
  proFeatures: {
    accountabilityPreset: 'balanced',
    strictModeEnabled: false,
    strictModeDisableDelaySeconds: 30,
    strictModeDisableRequestedAt: null,
    behavioralFriction: {
      enabled: false,
      requireTaskIntent: true,
      customChallengePrompt: '',
      timedWaitEnabled: false,
      timedWaitSeconds: 20,
      earnAccessEnabled: true,
      earnAccessMinChallengeSeconds: 90
    },
    overrideCooldown: {
      enabled: true,
      thresholdCount: 3,
      windowHours: 6,
      delayStepSeconds: 10,
      maxDelaySeconds: 90,
      lockMinutes: 30
    },
    commitmentMode: {
      active: false,
      durationHours: 2,
      activatedAt: null,
      expiresAt: null
    },
    intentionPage: {
      enabled: false,
      personalGoal: '',
      showBreathingExercise: false
    }
  }
};

let updateQueue = Promise.resolve();
let initialized = false;
let initializationPromise = null;

void initializeExtension('service-worker-start');

chrome.runtime.onInstalled.addListener((details) => {
  void initializeExtension('onInstalled');
  
  // Set the survey/uninstall URL (Must be https)
  chrome.runtime.setUninstallURL('https://www.orlandoascanio.com/resistgate/uninstall');
  
  // Show welcome page on first install
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome/welcome.html')
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  void initializeExtension('onStartup');
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm || !alarm.name) {
    return;
  }

  if (alarm.name.startsWith(BLOCK_ALARM_PREFIX) || alarm.name.startsWith(ACCESS_ALARM_PREFIX) || alarm.name.startsWith(BUNDLE_UNLOCK_ALARM_PREFIX)) {
    void queueRulesUpdate(`alarm:${alarm.name}`);
  }

  if (alarm.name === COMMITMENT_ALARM) {
    void (async () => {
      try {
        const settings = await getSettings();
        if (settings.proFeatures?.commitmentMode?.active) {
          settings.proFeatures.commitmentMode = {
            active: false,
            durationHours: settings.proFeatures.commitmentMode.durationHours || 2,
            activatedAt: null,
            expiresAt: null
          };
          await saveSettings(settings);
          await queueRulesUpdate('commitment-expired');
        }
      } catch (err) {
        console.error('Commitment mode expiry failed:', err);
      }
    })();
  }

  if (alarm.name === ENTITLEMENT_REFRESH_ALARM) {
    void refreshEntitlement();
  }

  if (alarm.name === DAILY_RESET_ALARM) {
    void (async () => {
      try {
        const today = getDateKey(Date.now());
        await setInStorage({ [DAILY_COUNT_KEY]: { date: today, count: 0 } });
        await saveWorkTimer({ todayMinutes: 0, date: today, running: false, startedAt: null });
        chrome.action.setBadgeText({ text: '' });
        await queueRulesUpdate('daily-reset');
      } catch (err) {
        console.error('Daily badge reset failed:', err);
      }
    })();
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

      switch (request.action) {
        case 'grantTemporaryAccess': {
          const result = await grantTemporaryAccess(
            request.urlPattern,
            request.duration,
            request.timeSpent || 0,
            request.meta || {}
          );
          sendResponse({ success: true, access: result });
          return;
        }

        case 'recordBlockedVisit': {
          const resistanceCount = await recordBlockedVisit(request.urlPattern || request.domain);
          sendResponse({ success: true, resistanceCount });
          return;
        }

        case 'getResistanceCount': {
          const count = await getResistanceCount(request.domain);
          sendResponse({ success: true, count });
          return;
        }

        case 'recordAnalyticsEvent': {
          await recordAnalyticsEvent(request.type, request.domain);
          sendResponse({ success: true });
          return;
        }

        case 'getSettings': {
          const settings = await getSettings();
          sendResponse({ success: true, settings });
          return;
        }

        case 'getManualOverrideStatus': {
          const settings = await getSettings();
          const status = await getManualOverrideStatus(settings, Date.now());
          sendResponse({ success: true, status });
          return;
        }

        case 'updateSettings': {
          const currentSettings = await getSettings();
          const nextSettings = sanitizeSettings(request.settings || {});

          if (isCommitmentModeActive(currentSettings, Date.now())) {
            throw new Error('Commitment Mode is active. All settings are locked until it expires.');
          }

          if (isConfigurationLocked(currentSettings, Date.now())) {
            const isTryingToDisableStrict = currentSettings.proFeatures?.strictModeEnabled === true && nextSettings.proFeatures?.strictModeEnabled === false;
            if (!isTryingToDisableStrict) {
              throw new Error('Strict Mode is active. Configuration is locked during this focus window.');
            }

            // Only allow changing strictModeEnabled
            nextSettings.defaultAccessDuration = currentSettings.defaultAccessDuration;
            nextSettings.blocklist = currentSettings.blocklist;
            nextSettings.challengeTypes = currentSettings.challengeTypes;
            nextSettings.freeExperience = currentSettings.freeExperience;
            nextSettings.subscription = currentSettings.subscription;

            if (nextSettings.proFeatures) {
              nextSettings.proFeatures.accountabilityPreset = currentSettings.proFeatures.accountabilityPreset;
              nextSettings.proFeatures.strictModeDisableDelaySeconds = currentSettings.proFeatures.strictModeDisableDelaySeconds;
              nextSettings.proFeatures.behavioralFriction = currentSettings.proFeatures.behavioralFriction;
              nextSettings.proFeatures.overrideCooldown = currentSettings.proFeatures.overrideCooldown;
            }
          }

          const transition = applyStrictModeUpdate(currentSettings, nextSettings, Date.now());
          await saveSettings(transition.settings);
          if (transition.justDisabled && hasProAccess(transition.settings)) {
            await appendAnalyticsEvent({
              type: 'manual_disable',
              timestamp: Date.now(),
              domain: 'settings'
            });
          }
          await queueRulesUpdate('updateSettings');

          if (transition.pending) {
            sendResponse({
              success: false,
              cooldownPending: true,
              remainingSeconds: transition.remainingSeconds,
              error: `Strict Mode disable is cooling down. Wait ${transition.remainingSeconds}s, then save again to confirm.`
            });
            return;
          }

          sendResponse({ success: true });
          return;
        }

        case 'activateLicense': {
          const result = await verifyAndStoreLicense(request.licenseKey);
          sendResponse(result);
          return;
        }

        case 'openPricingPage': {
          const result = await openPricingPage(request.email);
          sendResponse(result);
          return;
        }

        case 'refreshEntitlementNow': {
          const result = await refreshEntitlement({ manual: true });
          sendResponse(result);
          return;
        }

        case 'getAnalyticsDashboard': {
          const settings = await getSettings();
          if (!hasProAccess(settings)) {
            sendResponse({ success: false, proRequired: true, error: 'Pro subscription required' });
            return;
          }

          const dashboard = await getAnalyticsDashboard();
          sendResponse({ success: true, dashboard });
          return;
        }

        case 'getWeeklyReport': {
          const settings = await getSettings();
          if (!hasProAccess(settings)) {
            sendResponse({ success: false, proRequired: true, error: 'Pro subscription required' });
            return;
          }

          const report = await getWeeklyReport();
          sendResponse({ success: true, report });
          return;
        }

        case 'activateCommitmentMode': {
          const settings = await getSettings();
          if (!hasProAccess(settings)) {
            sendResponse({ success: false, proRequired: true, error: 'Pro subscription required' });
            return;
          }

          const now = Date.now();
          if (isCommitmentModeActive(settings, now)) {
            sendResponse({ success: false, error: 'Commitment Mode is already active.' });
            return;
          }

          const hours = clamp(positiveInt(request.durationHours, 2), 1, 24);
          const expiresAt = now + hours * 60 * 60 * 1000;

          settings.proFeatures.commitmentMode = {
            active: true,
            durationHours: hours,
            activatedAt: now,
            expiresAt
          };

          await saveSettings(settings);
          chrome.alarms.create(COMMITMENT_ALARM, { when: expiresAt });
          await queueRulesUpdate('activateCommitmentMode');

          sendResponse({ success: true, expiresAt });
          return;
        }

        case 'deactivateCommitmentMode': {
          sendResponse({ success: false, error: 'Commitment Mode cannot be deactivated early. Wait for it to expire.' });
          return;
        }

        case 'getWorkTimerState': {
          const wt = await getWorkTimer();
          const effectiveMinutes = Math.floor(getEffectiveWorkMinutes(wt, Date.now()));
          sendResponse({ success: true, state: { ...wt, effectiveMinutes } });
          return;
        }

        case 'startWorkTimer': {
          const wt = await getWorkTimer();
          if (!wt.running) {
            wt.running = true;
            wt.startedAt = Date.now();
            await saveWorkTimer(wt);
          }
          const effectiveMinutes = Math.floor(getEffectiveWorkMinutes(wt, Date.now()));
          sendResponse({ success: true, state: { ...wt, effectiveMinutes } });
          return;
        }

        case 'stopWorkTimer': {
          const wt = await getWorkTimer();
          if (wt.running && wt.startedAt) {
            const elapsed = (Date.now() - wt.startedAt) / 60000;
            wt.todayMinutes = Math.round((wt.todayMinutes + elapsed) * 10) / 10;
            wt.running = false;
            wt.startedAt = null;
            await saveWorkTimer(wt);
            await queueRulesUpdate('stopWorkTimer');
          }
          const effectiveMinutes = Math.floor(getEffectiveWorkMinutes(wt, Date.now()));
          sendResponse({ success: true, state: { ...wt, effectiveMinutes } });
          return;
        }

        case 'getCommitmentModeStatus': {
          const settings = await getSettings();
          const now = Date.now();
          const active = isCommitmentModeActive(settings, now);
          const cm = settings.proFeatures?.commitmentMode || {};
          const remainingMs = active ? Math.max(0, cm.expiresAt - now) : 0;
          sendResponse({
            success: true,
            status: {
              active,
              expiresAt: active ? cm.expiresAt : null,
              remainingSeconds: Math.ceil(remainingMs / 1000)
            }
          });
          return;
        }

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Message handling failed:', error);
      sendResponse({ success: false, error: error?.message || 'Unexpected error' });
    }
  })();

  return true;
});

if (chrome.runtime?.onMessageExternal?.addListener) {
  chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (!request || request.action !== 'activateProFromWebsite') {
      sendResponse({ success: false, error: 'Unknown external action.' });
      return false;
    }

    if (!isTrustedExternalSender(sender)) {
      sendResponse({ success: false, error: 'Unauthorized activation origin.' });
      return false;
    }

    void (async () => {
      try {
        await initializeExtension('external-message');
        const result = await activateProFromWebsite(request.activationToken);
        sendResponse(result);
      } catch (error) {
        console.error('External activation failed:', error);
        sendResponse({ success: false, error: error?.message || 'Unable to activate ResistGate Pro.' });
      }
    })();

    return true;
  });
}

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

    if (!existingSettings || JSON.stringify(existingSettings) !== JSON.stringify(normalizedSettings)) {
      await saveSettings(normalizedSettings);
    }

    const existingAccess = await getTemporaryAccessRaw();
    const normalizedAccess = sanitizeTemporaryAccess(existingAccess || {});
    if (JSON.stringify(existingAccess || {}) !== JSON.stringify(normalizedAccess)) {
      await saveTemporaryAccess(normalizedAccess);
    }

    const existingAnalytics = await getAnalyticsRaw();
    const normalizedAnalytics = sanitizeAnalytics(existingAnalytics || {});
    if (JSON.stringify(existingAnalytics || {}) !== JSON.stringify(normalizedAnalytics)) {
      await saveAnalytics(normalizedAnalytics);
    }

    const existingOverrideState = await getOverrideStateRaw();
    const normalizedOverrideState = sanitizeOverrideState(existingOverrideState || {});
    if (JSON.stringify(existingOverrideState || {}) !== JSON.stringify(normalizedOverrideState)) {
      await saveOverrideState(normalizedOverrideState);
    }

    const existingInstallation = await getInstallationRaw();
    const normalizedInstallation = sanitizeInstallation(existingInstallation || {});
    if (JSON.stringify(existingInstallation || {}) !== JSON.stringify(normalizedInstallation)) {
      await saveInstallation(normalizedInstallation);
    }

    // Register daily entitlement refresh alarm
    chrome.alarms.create(ENTITLEMENT_REFRESH_ALARM, { periodInMinutes: 1440 });

    // Register daily badge reset alarm (fires at midnight, repeats every 24h)
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0);
    chrome.alarms.create(DAILY_RESET_ALARM, { when: nextMidnight.getTime(), periodInMinutes: 1440 });

    // Restore badge count for today (survives service worker restarts)
    await restoreDailyBadge();

    initialized = true;
    await queueRulesUpdate(`initialize:${reason}`);
    console.log(`ResistGate initialized (${reason})`);
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
  await syncBundleUnlockAlarms(cleanedBlocklist.value, now);

  const workTimer = await getWorkTimer();
  const rulesToAdd = buildBlockingRules(settings, cleanedBlocklist.value, cleanedAccess.value, now, workTimer);

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

function buildBlockingRules(settings, blocklist, temporaryAccess, now, workTimer) {
  if (!settings.enabled) {
    return [];
  }

  const schedule = settings.freeExperience?.schedule;
  if (schedule?.enabled && !isWithinSimpleSchedule(schedule, now)) {
    return [];
  }

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

    // Skip the block rule if the temptation bundle condition is already met
    if (entry.temptationBundle?.enabled && isBundleConditionMet(entry, workTimer ?? {}, now)) {
      continue;
    }

    const commitmentActive = isCommitmentModeActive(settings, now);
    const redirectPage = commitmentActive ? 'commitment-page/index.html' : 'friction-page/index.html';

    rules.push({
      id: ruleId++,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          url:
            `${chrome.runtime.getURL(redirectPage)}?originalUrl=` +
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

async function grantTemporaryAccess(urlPattern, durationMinutes, timeSpentOnChallenge = 0, meta = {}) {
  const domain = normalizeDomain(urlPattern);
  if (!domain) {
    throw new Error('Invalid domain for temporary access');
  }

  const settings = await getSettings();
  const isBlocked = settings.blocklist.some((entry) => normalizeDomain(entry.urlPattern) === domain);
  if (!isBlocked) {
    throw new Error('Domain is not in blocklist');
  }

  const parsedMeta = sanitizeAccessMeta(meta);
  const now = Date.now();

  if (isCommitmentModeActive(settings, now)) {
    const remainingMs = Math.max(0, (settings.proFeatures.commitmentMode.expiresAt || 0) - now);
    const remainingMin = Math.ceil(remainingMs / 60000);
    throw new Error(`Commitment Mode is active. All access is locked for ${remainingMin} more minutes.`);
  }

  if (parsedMeta.method === 'manualOverride' && isStrictFocusActive(settings, now)) {
    throw new Error('Strict Mode is active. Manual override is disabled during this focus window.');
  }

  const earnAccessActive = isEarnAccessActive(settings);
  const earnAccessMinSeconds = getEarnAccessMinChallengeSeconds(settings);

  if (parsedMeta.method === 'manualOverride' && earnAccessActive) {
    throw new Error('Earn-Access is active. Complete the challenge to unlock access.');
  }

  if (parsedMeta.method === 'manualOverride') {
    const overrideStatus = await getManualOverrideStatus(settings, now);
    if (overrideStatus.locked) {
      throw new Error(
        `Manual override is temporarily locked. Try again in ${overrideStatus.remainingSeconds}s.`
      );
    }

    if (parsedMeta.waitedSeconds < overrideStatus.requiredDelaySeconds) {
      throw new Error(
        `Manual override requires a ${overrideStatus.requiredDelaySeconds}s delay right now.`
      );
    }
  }

  if (
    parsedMeta.method === 'challenge'
    && earnAccessActive
    && positiveInt(timeSpentOnChallenge, 0) < earnAccessMinSeconds
  ) {
    throw new Error(
      `Earn-Access requires at least ${earnAccessMinSeconds}s of challenge time before access can be granted.`
    );
  }

  const parsedDuration = Number(durationMinutes);
  const duration = Number.isFinite(parsedDuration) && parsedDuration > 0
    ? parsedDuration
    : settings.defaultAccessDuration;

  const expiresAt = now + duration * 60 * 1000;

  const temporaryAccess = await getTemporaryAccess();
  temporaryAccess[domain] = {
    grantedAt: now,
    expiresAt,
    duration
  };

  await saveTemporaryAccess(temporaryAccess);
  await queueRulesUpdate(`grant:${domain}`);

  if (hasProAccess(settings)) {
    await appendAnalyticsEvent({
      type: 'access_granted',
      timestamp: now,
      domain,
      method: parsedMeta.method,
      durationMinutes: duration,
      strictSessionActive: isStrictFocusActive(settings, now),
      timeSpentSeconds: positiveInt(timeSpentOnChallenge, 0),
      taskIntentLength: parsedMeta.taskIntentLength,
      customChallengeAnswered: parsedMeta.customChallengeAnswered,
      earnAccessEnabled: parsedMeta.earnAccessEnabled
    });
  }

  if (parsedMeta.method === 'manualOverride' && hasProAccess(settings)) {
    await recordManualOverride(settings, now, domain);
  }

  return { domain, duration, expiresAt };
}

async function recordBlockedVisit(urlPattern) {
  const domain = normalizeDomain(urlPattern);
  if (!domain) {
    return 0;
  }

  // Always track for all users: badge count and per-site resistance counter
  await incrementDailyBadge();
  const resistanceCount = await incrementResistanceCount(domain);

  // Pro analytics only
  const settings = await getSettings();
  if (hasProAccess(settings)) {
    await appendAnalyticsEvent({
      type: 'blocked_visit',
      timestamp: Date.now(),
      domain
    });
  }

  return resistanceCount;
}

async function incrementDailyBadge() {
  const today = getDateKey(Date.now());
  const result = await getFromStorage([DAILY_COUNT_KEY]);
  const data = result[DAILY_COUNT_KEY] || {};
  const count = (data.date === today ? (data.count || 0) : 0) + 1;
  await setInStorage({ [DAILY_COUNT_KEY]: { date: today, count } });
  chrome.action.setBadgeText({ text: String(count) });
  chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
}

async function restoreDailyBadge() {
  const today = getDateKey(Date.now());
  const result = await getFromStorage([DAILY_COUNT_KEY]);
  const data = result[DAILY_COUNT_KEY] || {};
  if (data.date === today && data.count > 0) {
    chrome.action.setBadgeText({ text: String(data.count) });
    chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

async function incrementResistanceCount(domain) {
  if (!domain) return 0;
  const today = getDateKey(Date.now());
  const result = await getFromStorage([RESISTANCE_COUNTERS_KEY]);
  const data = result[RESISTANCE_COUNTERS_KEY] || {};
  const todayData = (data[today] && typeof data[today] === 'object') ? { ...data[today] } : {};
  const newCount = (todayData[domain] || 0) + 1;
  todayData[domain] = newCount;
  await setInStorage({ [RESISTANCE_COUNTERS_KEY]: { [today]: todayData } });
  return newCount;
}

async function getResistanceCount(domain) {
  if (!domain) return 0;
  const today = getDateKey(Date.now());
  const result = await getFromStorage([RESISTANCE_COUNTERS_KEY]);
  const data = result[RESISTANCE_COUNTERS_KEY] || {};
  const todayData = data[today] || {};
  return todayData[domain] || 0;
}

async function recordAnalyticsEvent(type, domain) {
  const settings = await getSettings();
  if (!hasProAccess(settings)) {
    return;
  }

  const allowedTypes = new Set([
    'override_triggered',
    'challenge_failed',
    'challenge_completed'
  ]);

  if (!allowedTypes.has(type)) {
    return;
  }

  await appendAnalyticsEvent({
    type,
    timestamp: Date.now(),
    domain: normalizeDomain(domain) || 'system'
  });
}

function sanitizeAccessMeta(meta) {
  const incoming = meta && typeof meta === 'object' ? meta : {};
  const method = incoming.method === 'manualOverride' ? 'manualOverride' : 'challenge';
  const taskIntent = typeof incoming.taskIntent === 'string' ? incoming.taskIntent.trim() : '';

  return {
    method,
    taskIntentLength: Math.min(taskIntent.length, 180),
    waitedSeconds: positiveInt(incoming.waitedSeconds, 0),
    customChallengeAnswered: incoming.customChallengeAnswered === true,
    earnAccessEnabled: incoming.earnAccessEnabled !== false
  };
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

async function syncBundleUnlockAlarms(blocklist, now) {
  const allAlarms = await chrome.alarms.getAll();
  const existingNames = new Set(
    allAlarms
      .map((a) => a.name)
      .filter((n) => n.startsWith(BUNDLE_UNLOCK_ALARM_PREFIX))
  );

  const desiredAlarms = [];

  for (const entry of blocklist) {
    const bundle = entry?.temptationBundle;
    if (!bundle || bundle.enabled !== true || bundle.conditionType !== 'time_of_day') continue;

    const [h, m] = (bundle.afterTime || '17:00').split(':').map(Number);
    const d = new Date(now);
    const unlock = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0).getTime();

    // Only schedule if afterTime is still in the future today
    if (unlock > now) {
      desiredAlarms.push({
        name: `${BUNDLE_UNLOCK_ALARM_PREFIX}${entry.urlPattern}`,
        when: unlock
      });
    }
  }

  const desiredNames = new Set(desiredAlarms.map((a) => a.name));

  for (const name of existingNames) {
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

  const schedule = incoming.freeExperience?.schedule || {};
  const freeExperience = {
    manualOverrideDelaySeconds: clamp(
      positiveInt(incoming.freeExperience?.manualOverrideDelaySeconds, 12),
      10,
      15
    ),
    schedule: {
      enabled: schedule.enabled === true,
      days: sanitizeScheduleDays(schedule.days),
      startTime: sanitizeTimeString(schedule.startTime, DEFAULT_SETTINGS.freeExperience.schedule.startTime),
      endTime: sanitizeTimeString(schedule.endTime, DEFAULT_SETTINGS.freeExperience.schedule.endTime)
    }
  };

  const incomingSubscription = incoming.subscription || {};
  const tier = incomingSubscription.tier === 'pro' ? 'pro' : 'free';
  const rawBillingCycle = incomingSubscription.billingCycle === 'monthly'
    ? 'monthly'
    : incomingSubscription.billingCycle === 'yearly'
      ? 'yearly'
      : incomingSubscription.billingCycle === 'lifetime'
        ? 'lifetime'
        : null;

  const subscription = {
    tier,
    productSlug: sanitizeProductSlug(incomingSubscription.productSlug) || RESISTGATE_PRODUCT_SLUG,
    billingCycle: tier === 'pro' ? rawBillingCycle : null,
    upgradedAt: tier === 'pro' ? Number(incomingSubscription.upgradedAt) || null : null,
    email: sanitizeEmail(incomingSubscription.email),
    subscriptionStatus: sanitizeSubscriptionStatus(incomingSubscription.subscriptionStatus),
    installToken: tier === 'pro' ? sanitizeOpaqueString(incomingSubscription.installToken) : null,
    licenseKey: tier === 'pro' ? sanitizeOpaqueString(incomingSubscription.licenseKey) : null,
    expiresAt: tier === 'pro' ? sanitizeTimestamp(incomingSubscription.expiresAt) : null
  };

  const incomingBehavioral = incoming.proFeatures?.behavioralFriction || {};
  const incomingOverrideCooldown = incoming.proFeatures?.overrideCooldown || {};
  const proFeatures = {
    accountabilityPreset: sanitizeAccountabilityPreset(incoming.proFeatures?.accountabilityPreset),
    strictModeEnabled: incoming.proFeatures?.strictModeEnabled === true,
    strictModeDisableDelaySeconds: clamp(
      positiveInt(
        incoming.proFeatures?.strictModeDisableDelaySeconds,
        DEFAULT_SETTINGS.proFeatures.strictModeDisableDelaySeconds
      ),
      10,
      300
    ),
    strictModeDisableRequestedAt: sanitizeTimestamp(incoming.proFeatures?.strictModeDisableRequestedAt),
    behavioralFriction: {
      enabled: incomingBehavioral.enabled === true,
      requireTaskIntent: incomingBehavioral.requireTaskIntent !== false,
      customChallengePrompt: sanitizeChallengePrompt(incomingBehavioral.customChallengePrompt),
      timedWaitEnabled: incomingBehavioral.timedWaitEnabled === true,
      timedWaitSeconds: clamp(positiveInt(incomingBehavioral.timedWaitSeconds, 20), 5, 90),
      earnAccessEnabled: incomingBehavioral.earnAccessEnabled !== false,
      earnAccessMinChallengeSeconds: clamp(
        positiveInt(incomingBehavioral.earnAccessMinChallengeSeconds, 90),
        30,
        900
      )
    },
    overrideCooldown: {
      enabled: incomingOverrideCooldown.enabled !== false,
      thresholdCount: clamp(positiveInt(incomingOverrideCooldown.thresholdCount, 3), 2, 12),
      windowHours: clamp(positiveInt(incomingOverrideCooldown.windowHours, 6), 1, 24),
      delayStepSeconds: clamp(positiveInt(incomingOverrideCooldown.delayStepSeconds, 10), 5, 45),
      maxDelaySeconds: clamp(positiveInt(incomingOverrideCooldown.maxDelaySeconds, 90), 15, 180),
      lockMinutes: clamp(positiveInt(incomingOverrideCooldown.lockMinutes, 30), 5, 180)
    },
    commitmentMode: sanitizeCommitmentMode(incoming.proFeatures?.commitmentMode),
    intentionPage: sanitizeIntentionPage(incoming.proFeatures?.intentionPage)
  };

  return {
    enabled: incoming.enabled !== false,
    defaultAccessDuration,
    blocklist,
    challengeTypes,
    freeExperience,
    subscription,
    proFeatures
  };
}

function sanitizeInstallation(installation) {
  const incoming = installation && typeof installation === 'object' ? installation : {};
  return {
    deviceId: sanitizeOpaqueString(incoming.deviceId) || generateDeviceId()
  };
}

function sanitizeTemptationBundle(bundle) {
  const incoming = bundle && typeof bundle === 'object' ? bundle : {};
  const conditionType = incoming.conditionType === 'work_timer' ? 'work_timer' : 'time_of_day';
  const afterTime = typeof incoming.afterTime === 'string' && /^\d{2}:\d{2}$/.test(incoming.afterTime)
    ? incoming.afterTime
    : '17:00';
  const requiredMinutes = Math.max(1, Math.min(480, positiveInt(incoming.requiredMinutes, 60)));
  return {
    enabled: incoming.enabled === true,
    conditionType,
    afterTime,
    requiredMinutes
  };
}

function sanitizeWorkTimer(raw) {
  const incoming = raw && typeof raw === 'object' ? raw : {};
  const today = getDateKey(Date.now());
  const sameDay = incoming.date === today;
  return {
    todayMinutes: sameDay && Number.isFinite(Number(incoming.todayMinutes))
      ? Math.max(0, Math.round(Number(incoming.todayMinutes) * 10) / 10)
      : 0,
    date: today,
    running: sameDay && incoming.running === true,
    startedAt: (sameDay && incoming.running === true && Number.isFinite(Number(incoming.startedAt)))
      ? Number(incoming.startedAt)
      : null
  };
}

async function getWorkTimer() {
  const result = await getFromStorage([WORK_TIMER_KEY]);
  return sanitizeWorkTimer(result[WORK_TIMER_KEY] ?? null);
}

async function saveWorkTimer(wt) {
  await setInStorage({ [WORK_TIMER_KEY]: wt });
}

function getEffectiveWorkMinutes(wt, now) {
  let total = Number(wt?.todayMinutes) || 0;
  if (wt?.running && wt?.startedAt) {
    total += (now - wt.startedAt) / 60000;
  }
  return total;
}

function isBundleConditionMet(entry, wt, now) {
  const bundle = entry?.temptationBundle;
  if (!bundle || bundle.enabled !== true) return false;

  if (bundle.conditionType === 'time_of_day') {
    const [h, m] = (bundle.afterTime || '17:00').split(':').map(Number);
    const d = new Date(now);
    const currentMinutes = d.getHours() * 60 + d.getMinutes();
    return currentMinutes >= (h * 60 + m);
  }

  if (bundle.conditionType === 'work_timer') {
    const required = Number(bundle.requiredMinutes) || 60;
    return getEffectiveWorkMinutes(wt, now) >= required;
  }

  return false;
}

function sanitizeCommitmentMode(commitmentMode) {
  const incoming = commitmentMode && typeof commitmentMode === 'object' ? commitmentMode : {};
  const now = Date.now();
  const expiresAt = sanitizeTimestamp(incoming.expiresAt);
  const isExpired = expiresAt !== null && expiresAt <= now;
  return {
    active: isExpired ? false : incoming.active === true,
    durationHours: clamp(positiveInt(incoming.durationHours, 2), 1, 24),
    activatedAt: isExpired ? null : sanitizeTimestamp(incoming.activatedAt),
    expiresAt: isExpired ? null : expiresAt
  };
}

function sanitizeIntentionPage(intentionPage) {
  const incoming = intentionPage && typeof intentionPage === 'object' ? intentionPage : {};
  const personalGoal = typeof incoming.personalGoal === 'string'
    ? incoming.personalGoal.trim().slice(0, 200)
    : '';
  return {
    enabled: incoming.enabled === true,
    personalGoal,
    showBreathingExercise: incoming.showBreathingExercise === true
  };
}

function isCommitmentModeActive(settings, now) {
  const cm = settings?.proFeatures?.commitmentMode;
  if (!cm || cm.active !== true) {
    return false;
  }
  if (!cm.expiresAt || cm.expiresAt <= now) {
    return false;
  }
  return true;
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

function sanitizeAnalytics(analytics) {
  const incoming = analytics && typeof analytics === 'object' ? analytics : {};
  const events = Array.isArray(incoming.events) ? incoming.events : [];
  const cleaned = events
    .filter((event) => event && typeof event === 'object')
    .map((event) => {
      const allowedTypes = new Set([
        'blocked_visit',
        'access_granted',
        'override_triggered',
        'manual_disable',
        'challenge_failed',
        'challenge_completed'
      ]);
      const type = allowedTypes.has(event.type) ? event.type : 'access_granted';
      const timestamp = Number(event.timestamp) || Date.now();
      const domain = normalizeDomain(event.domain) || 'unknown.com';

      if (type !== 'access_granted') {
        const safeDomain = typeof event.domain === 'string' && event.domain.trim()
          ? event.domain.trim().toLowerCase().slice(0, 120)
          : 'system';
        return { type, timestamp, domain: safeDomain };
      }

      return {
        type,
        timestamp,
        domain,
        method: event.method === 'manualOverride' ? 'manualOverride' : 'challenge',
        durationMinutes: positiveInt(event.durationMinutes, DEFAULT_SETTINGS.defaultAccessDuration),
        strictSessionActive: event.strictSessionActive === true,
        timeSpentSeconds: positiveInt(event.timeSpentSeconds, 0),
        taskIntentLength: positiveInt(event.taskIntentLength, 0),
        customChallengeAnswered: event.customChallengeAnswered === true,
        earnAccessEnabled: event.earnAccessEnabled !== false
      };
    })
    .slice(-MAX_ANALYTICS_EVENTS);

  return { events: cleaned };
}

function sanitizeOverrideState(state) {
  const incoming = state && typeof state === 'object' ? state : {};
  const timestamps = Array.isArray(incoming.timestamps)
    ? incoming.timestamps
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b)
      .slice(-500)
    : [];

  return {
    timestamps,
    lockUntil: sanitizeTimestamp(incoming.lockUntil)
  };
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

    if (rawEntry.temptationBundle && typeof rawEntry.temptationBundle === 'object') {
      entry.temptationBundle = sanitizeTemptationBundle(rawEntry.temptationBundle);
    } else {
      delete entry.temptationBundle;
    }

    deduped.push(entry);
  }

  return deduped;
}

function hasProAccess(settings) {
  if (settings?.subscription?.tier !== 'pro') {
    return false;
  }
  const expiresAt = settings?.subscription?.expiresAt;
  if (!expiresAt) {
    // If no expiresAt is set but it's "pro", we assume valid (e.g. legacy or test)
    // but with the new license system they should have expiresAt.
    // For local dev/testing without a key, you might want this to be true,
    // but real production would enforce it. We'll enforce it if it exists.
    return true;
  }
  return Date.now() < expiresAt;
}

// embedded public key for verification
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6F21dqquWLFFjF8rqusv
Fp4BnFxlQF5z/2Zdv9NObnCXKIPsXqGMxpaMpgX0/RzfybFfaQL51kTI720j5nHW
7JZaWQexoicYL9EK0gDBVV/kT/R2byZB9v4f6C6AASR3iXqhRmA2YYBWKC8BFGZm
zhJTx+2DnkIPF2MaeCuII83uQFtvjXm8YvCaJsVwDOCn0pNq+NOgT0CNaDvcAHM1
BekH2mKnR51IjnX0c/R31W69LsWUwh/jgSGZkh+c8kVd+3Y0D//rPBaSynxvQmrd
zH+PHyVcwgtl87P5Nc1H+/5siyxmEv29VRr9dEUNCFL6hDUvf879/9Jl7UbHF9Dh
RQIDAQAB
-----END PUBLIC KEY-----`;

function str2ab(str) {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

function base64UrlDecodeToBuffer(str) {
  const decoded = base64UrlDecode(str);
  return str2ab(decoded);
}

async function importPublicKey() {
  const pemHeader = "-----BEGIN PUBLIC KEY-----";
  const pemFooter = "-----END PUBLIC KEY-----";
  const pemContents = PUBLIC_KEY_PEM.substring(
    PUBLIC_KEY_PEM.indexOf(pemHeader) + pemHeader.length,
    PUBLIC_KEY_PEM.indexOf(pemFooter)
  ).replace(/\s/g, '');
  const binaryDer = str2ab(atob(pemContents));

  return await crypto.subtle.importKey(
    "spki",
    binaryDer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    true,
    ["verify"]
  );
}

async function verifyAndStoreLicense(rawKey) {
  try {
    if (!rawKey || typeof rawKey !== 'string') {
      throw new Error('Invalid license key format.');
    }

    const parts = rawKey.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid license key format.');
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    const dataToVerify = str2ab(`${headerB64}.${payloadB64}`);
    const signatureBuffer = base64UrlDecodeToBuffer(signatureB64);
    const publicKey = await importPublicKey();

    const isValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      signatureBuffer,
      dataToVerify
    );

    if (!isValid) {
      throw new Error('Invalid license signature.');
    }

    const payloadStr = base64UrlDecode(payloadB64);
    const payload = JSON.parse(payloadStr);

    if (payload.tier !== 'pro') {
      throw new Error('License is not for a Pro tier.');
    }

    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      throw new Error('License has expired.');
    }

    const settings = await getSettings();
    settings.subscription = {
      tier: 'pro',
      productSlug: RESISTGATE_PRODUCT_SLUG,
      billingCycle: settings.subscription.billingCycle || null,
      upgradedAt: settings.subscription.upgradedAt || Date.now(),
      email: payload.email || settings.subscription.email || null,
      subscriptionStatus: 'ACTIVE',
      installToken: settings.subscription.installToken || null,
      licenseKey: rawKey,
      expiresAt: payload.expiresAt || null
    };
    await saveSettings(settings);

    return { success: true, subscription: settings.subscription };
  } catch (error) {
    console.error('License verification failed:', error);
    return { success: false, error: error.message };
  }
}

async function refreshEntitlement(options = {}) {
  try {
    const settings = await getSettings();
    if (!settings?.subscription?.installToken) {
      if (options.manual) {
        return { success: false, error: 'No active Pro install token found yet.' };
      }
      return { success: false, skipped: true };
    }

    const result = await fetchEntitlementJson('/api/entitlement/sync', {
      installToken: settings.subscription.installToken
    });

    if (!result.pro) {
      settings.subscription = {
        tier: 'free',
        productSlug: RESISTGATE_PRODUCT_SLUG,
        billingCycle: null,
        upgradedAt: null,
        email: result.email || settings.subscription.email || null,
        subscriptionStatus: result.subscriptionStatus || 'inactive',
        installToken: null,
        licenseKey: null,
        expiresAt: null
      };
      await saveSettings(settings);
      await queueRulesUpdate('entitlement-refresh-downgrade');
      console.log('Entitlement sync downgraded this install to free tier.');
      return { success: true, pro: false, subscription: settings.subscription };
    } else {
      const resultProductSlug = sanitizeProductSlug(result.productSlug) || RESISTGATE_PRODUCT_SLUG;
      if (resultProductSlug !== RESISTGATE_PRODUCT_SLUG) {
        throw new Error('Entitlement sync returned a different product.');
      }

      settings.subscription = {
        ...settings.subscription,
        tier: 'pro',
        productSlug: resultProductSlug,
        billingCycle: result.billingCycle === 'monthly' ? 'monthly' : result.billingCycle === 'yearly' ? 'yearly' : result.billingCycle === 'lifetime' ? 'lifetime' : settings.subscription.billingCycle,
        upgradedAt: settings.subscription.upgradedAt || Date.now(),
        email: result.email || settings.subscription.email || null,
        subscriptionStatus: result.subscriptionStatus || 'ACTIVE',
        installToken: settings.subscription.installToken,
        expiresAt: result.expiresAt ? sanitizeTimestamp(result.expiresAt) : settings.subscription.expiresAt
      };
      await saveSettings(settings);
      console.log('Entitlement sync completed successfully.');
      return { success: true, pro: true, subscription: settings.subscription };
    }
  } catch (err) {
    console.error('Error refreshing entitlement:', err);
    return { success: false, error: err?.message || 'Unable to refresh Pro access.' };
  }
}

function isStrictFocusActive(settings, now) {
  if (!settings?.proFeatures?.strictModeEnabled) {
    return false;
  }

  const schedule = settings?.freeExperience?.schedule;
  if (!schedule?.enabled) {
    return true;
  }

  return isWithinSimpleSchedule(schedule, now);
}

function isConfigurationLocked(settings, now) {
  return isStrictFocusActive(settings, now);
}

function isEarnAccessActive(settings) {
  if (!hasProAccess(settings)) {
    return false;
  }

  const behavior = settings?.proFeatures?.behavioralFriction || {};
  return behavior.enabled === true && behavior.earnAccessEnabled !== false;
}

function getEarnAccessMinChallengeSeconds(settings) {
  return clamp(
    positiveInt(settings?.proFeatures?.behavioralFriction?.earnAccessMinChallengeSeconds, 90),
    30,
    900
  );
}

function applyStrictModeUpdate(currentSettings, nextSettings, now) {
  const currentPro = currentSettings.proFeatures || {};
  const nextPro = nextSettings.proFeatures || {};
  const strictCurrentlyEnabled = currentPro.strictModeEnabled === true;
  const strictRequestedEnabled = nextPro.strictModeEnabled === true;
  const cooldownDelay = clamp(
    positiveInt(
      currentPro.strictModeDisableDelaySeconds,
      DEFAULT_SETTINGS.proFeatures.strictModeDisableDelaySeconds
    ),
    10,
    300
  );
  const existingRequestAt = sanitizeTimestamp(currentPro.strictModeDisableRequestedAt);

  if (!strictCurrentlyEnabled) {
    nextPro.strictModeDisableRequestedAt = null;
    nextSettings.proFeatures = nextPro;
    return { settings: nextSettings, pending: false, remainingSeconds: 0, justDisabled: false };
  }

  if (strictRequestedEnabled) {
    nextPro.strictModeDisableRequestedAt = null;
    nextSettings.proFeatures = nextPro;
    return { settings: nextSettings, pending: false, remainingSeconds: 0, justDisabled: false };
  }

  if (!existingRequestAt) {
    nextPro.strictModeEnabled = true;
    nextPro.strictModeDisableRequestedAt = now;
    nextSettings.proFeatures = nextPro;
    return { settings: nextSettings, pending: true, remainingSeconds: cooldownDelay, justDisabled: false };
  }

  const elapsedSeconds = Math.floor((now - existingRequestAt) / 1000);
  const remainingSeconds = Math.max(0, cooldownDelay - elapsedSeconds);
  if (remainingSeconds > 0) {
    nextPro.strictModeEnabled = true;
    nextPro.strictModeDisableRequestedAt = existingRequestAt;
    nextSettings.proFeatures = nextPro;
    return { settings: nextSettings, pending: true, remainingSeconds, justDisabled: false };
  }

  nextPro.strictModeEnabled = false;
  nextPro.strictModeDisableRequestedAt = null;
  nextSettings.proFeatures = nextPro;
  return { settings: nextSettings, pending: false, remainingSeconds: 0, justDisabled: true };
}

async function getManualOverrideStatus(settings, now) {
  const baseDelay = clamp(
    positiveInt(settings?.freeExperience?.manualOverrideDelaySeconds, 12),
    10,
    15
  );
  const isPro = hasProAccess(settings);
  const policy = settings?.proFeatures?.overrideCooldown || {};
  if (!isPro || policy.enabled === false) {
    return {
      requiredDelaySeconds: baseDelay,
      locked: false,
      remainingSeconds: 0,
      recentOverrides: 0
    };
  }

  const windowMs = clamp(positiveInt(policy.windowHours, 6), 1, 24) * 60 * 60 * 1000;
  const thresholdCount = clamp(positiveInt(policy.thresholdCount, 3), 2, 12);
  const delayStepSeconds = clamp(positiveInt(policy.delayStepSeconds, 10), 5, 45);
  const maxDelaySeconds = clamp(positiveInt(policy.maxDelaySeconds, 90), 15, 180);
  const state = await getOverrideState();
  const recentTimestamps = state.timestamps.filter((timestamp) => timestamp >= (now - windowMs));

  const nextState = {
    timestamps: recentTimestamps,
    lockUntil: state.lockUntil
  };
  if (Number.isFinite(nextState.lockUntil) && nextState.lockUntil <= now) {
    nextState.lockUntil = null;
  }

  if (
    recentTimestamps.length !== state.timestamps.length
    || nextState.lockUntil !== state.lockUntil
  ) {
    await saveOverrideState(nextState);
  }

  const remainingSeconds = Number.isFinite(nextState.lockUntil) && nextState.lockUntil > now
    ? Math.max(1, Math.ceil((nextState.lockUntil - now) / 1000))
    : 0;

  return {
    requiredDelaySeconds: Math.min(maxDelaySeconds, baseDelay + (recentTimestamps.length * delayStepSeconds)),
    locked: remainingSeconds > 0,
    remainingSeconds,
    recentOverrides: recentTimestamps.length,
    thresholdCount
  };
}

async function recordManualOverride(settings, now, domain) {
  if (!hasProAccess(settings)) {
    return;
  }

  await appendAnalyticsEvent({
    type: 'override_triggered',
    timestamp: now,
    domain: normalizeDomain(domain) || 'manual-override'
  });

  const policy = settings?.proFeatures?.overrideCooldown || {};
  if (policy.enabled === false) {
    return;
  }

  const thresholdCount = clamp(positiveInt(policy.thresholdCount, 3), 2, 12);
  const windowMs = clamp(positiveInt(policy.windowHours, 6), 1, 24) * 60 * 60 * 1000;
  const lockMinutes = clamp(positiveInt(policy.lockMinutes, 30), 5, 180);
  const lockDurationMs = lockMinutes * 60 * 1000;

  const state = await getOverrideState();
  const recent = state.timestamps.filter((timestamp) => timestamp >= (now - windowMs));
  recent.push(now);

  const nextState = {
    timestamps: recent.slice(-500),
    lockUntil: state.lockUntil
  };

  if (recent.length > thresholdCount) {
    nextState.lockUntil = now + lockDurationMs;
  }

  await saveOverrideState(nextState);
}

function isWithinSimpleSchedule(schedule, timestamp) {
  if (!schedule || schedule.enabled !== true) {
    return true;
  }

  const days = sanitizeScheduleDays(schedule.days);
  const local = new Date(timestamp);
  const day = local.getDay();
  if (!days.includes(day)) {
    return false;
  }

  const minutes = local.getHours() * 60 + local.getMinutes();
  const startMinutes = timeToMinutes(schedule.startTime);
  const endMinutes = timeToMinutes(schedule.endTime);

  if (startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes;
  }

  return minutes >= startMinutes || minutes < endMinutes;
}

function sanitizeScheduleDays(days) {
  const fallback = DEFAULT_SETTINGS.freeExperience.schedule.days;
  if (!Array.isArray(days)) {
    return [...fallback];
  }

  const unique = [...new Set(days.map((day) => Number(day)).filter((day) => day >= 0 && day <= 6))];
  return unique.length > 0 ? unique.sort((a, b) => a - b) : [...fallback];
}

function sanitizeTimeString(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

function timeToMinutes(timeString) {
  const safeTime = sanitizeTimeString(timeString, '00:00');
  const [hours, minutes] = safeTime.split(':').map((part) => Number(part));
  return (hours * 60) + minutes;
}

function sanitizeChallengePrompt(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, 120);
}

function sanitizeEmail(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function sanitizeAccountabilityPreset(value) {
  if (value === 'light' || value === 'strict') {
    return value;
  }
  return 'balanced';
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function sanitizeOpaqueString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 512) : null;
}

function sanitizeProductSlug(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : null;
}

function sanitizeSubscriptionStatus(value) {
  if (typeof value !== 'string') {
    return 'inactive';
  }

  const trimmed = value.trim().toUpperCase();
  return trimmed || 'inactive';
}

function generateDeviceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

async function getInstallationRaw() {
  const result = await getFromStorage([INSTALLATION_KEY]);
  return result[INSTALLATION_KEY] || {};
}

async function getInstallation() {
  const rawInstallation = await getInstallationRaw();
  const normalizedInstallation = sanitizeInstallation(rawInstallation || {});

  if (JSON.stringify(rawInstallation || {}) !== JSON.stringify(normalizedInstallation)) {
    await saveInstallation(normalizedInstallation);
  }

  return normalizedInstallation;
}

async function saveInstallation(installation) {
  await setInStorage({ [INSTALLATION_KEY]: sanitizeInstallation(installation) });
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

async function getAnalyticsRaw() {
  const result = await getFromStorage([ANALYTICS_KEY]);
  return result[ANALYTICS_KEY] || {};
}

async function getAnalytics() {
  return sanitizeAnalytics(await getAnalyticsRaw());
}

async function saveAnalytics(analytics) {
  await setInStorage({ [ANALYTICS_KEY]: sanitizeAnalytics(analytics) });
}

async function getOverrideStateRaw() {
  const result = await getFromStorage([OVERRIDE_STATE_KEY]);
  return result[OVERRIDE_STATE_KEY] || {};
}

async function getOverrideState() {
  return sanitizeOverrideState(await getOverrideStateRaw());
}

async function saveOverrideState(state) {
  await setInStorage({ [OVERRIDE_STATE_KEY]: sanitizeOverrideState(state) });
}

async function appendAnalyticsEvent(event) {
  const analytics = await getAnalytics();
  analytics.events.push(event);
  if (analytics.events.length > MAX_ANALYTICS_EVENTS) {
    analytics.events = analytics.events.slice(-MAX_ANALYTICS_EVENTS);
  }
  await saveAnalytics(analytics);
}

async function fetchEntitlementJson(path, body) {
  const response = await fetch(`${RESISTGATE_SITE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'ResistGate could not reach the entitlement service.');
  }

  return data;
}

async function activateProFromWebsite(activationToken) {
  if (!activationToken || typeof activationToken !== 'string') {
    throw new Error('Missing activation token.');
  }

  const installation = await getInstallation();
  const result = await fetchEntitlementJson('/api/entitlement/activate-install', {
    activationToken,
    deviceId: installation.deviceId
  });

  const productSlug = sanitizeProductSlug(result.productSlug) || RESISTGATE_PRODUCT_SLUG;
  if (productSlug !== RESISTGATE_PRODUCT_SLUG) {
    throw new Error('This checkout belongs to a different product.');
  }

  if (result.pro !== true || !result.installToken) {
    throw new Error('The entitlement service did not return an active Pro install token.');
  }

  const settings = await getSettings();
  settings.subscription = {
    tier: result.pro === true ? 'pro' : 'free',
    productSlug,
    billingCycle: result.billingCycle === 'monthly' ? 'monthly' : result.billingCycle === 'yearly' ? 'yearly' : result.billingCycle === 'lifetime' ? 'lifetime' : null,
    upgradedAt: result.pro === true ? Date.now() : null,
    email: sanitizeEmail(result.email),
    subscriptionStatus: sanitizeSubscriptionStatus(result.subscriptionStatus || 'ACTIVE'),
    installToken: sanitizeOpaqueString(result.installToken),
    licenseKey: null,
    expiresAt: null
  };
  await saveSettings(settings);
  await queueRulesUpdate('activate-pro-from-website');
  await chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html?activation=success') });

  return { success: true, subscription: settings.subscription };
}

async function openPricingPage(email) {
  const installation = await getInstallation();
  const url = new URL(RESISTGATE_PRICING_PATH, RESISTGATE_SITE_URL);
  url.searchParams.set('productSlug', RESISTGATE_PRODUCT_SLUG);
  url.searchParams.set('source', 'extension');
  url.searchParams.set('extensionId', chrome.runtime.id);
  url.searchParams.set('deviceId', installation.deviceId);
  if (email && typeof email === 'string' && email.trim()) {
    url.searchParams.set('email', email.trim());
  }

  await chrome.tabs.create({ url: url.toString() });
  return { success: true, url: url.toString() };
}

function isTrustedExternalSender(sender) {
  try {
    if (!sender?.url) {
      return false;
    }

    return TRUSTED_EXTERNAL_ORIGINS.has(new URL(sender.url).origin);
  } catch {
    return false;
  }
}

async function getAnalyticsDashboard() {
  const analytics = await getAnalytics();
  const events = analytics.events;
  const now = Date.now();
  const last7Days = getLast7DaysMeta();
  const startMs = last7Days[0].startMs;
  const weeklyEvents = events.filter((event) => event.timestamp >= startMs);

  const blockedEvents = weeklyEvents.filter((event) => event.type === 'blocked_visit');
  const overrideEvents = weeklyEvents.filter((event) => event.type === 'override_triggered');
  const strictAccessEvents = weeklyEvents.filter((event) => (
    event.type === 'access_granted' && event.strictSessionActive === true
  ));

  const blockedByDomain = new Map();
  for (const event of blockedEvents) {
    const key = normalizeDomain(event.domain) || 'unknown.com';
    blockedByDomain.set(key, (blockedByDomain.get(key) || 0) + 1);
  }

  const topBlockedDomains = [...blockedByDomain.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const trendCounts = new Map(last7Days.map((entry) => [entry.dateKey, 0]));
  for (const event of overrideEvents) {
    const key = getDateKey(event.timestamp);
    if (trendCounts.has(key)) {
      trendCounts.set(key, (trendCounts.get(key) || 0) + 1);
    }
  }

  const overrideFrequencyTrend = last7Days.map((entry) => ({
    date: entry.dateKey,
    count: trendCounts.get(entry.dateKey) || 0
  }));

  const strictSessionMinutes = strictAccessEvents.reduce(
    (sum, event) => sum + positiveInt(event.durationMinutes, 0),
    0
  );

  return {
    generatedAt: now,
    periodLabel: `${last7Days[0].dateKey} to ${last7Days[last7Days.length - 1].dateKey}`,
    totals: {
      blockedAttempts: blockedEvents.length,
      overrides: overrideEvents.length,
      strictSessionMinutes
    },
    topBlockedDomains,
    overrideFrequencyTrend
  };
}

async function getWeeklyReport() {
  const analytics = await getAnalytics();
  const events = analytics.events;
  const currentRange = getRollingWeekRange(0);
  const previousRange = getRollingWeekRange(1);
  const current = buildWeekSummary(events, currentRange.startMs, currentRange.endMs);
  const previous = buildWeekSummary(events, previousRange.startMs, previousRange.endMs);

  const focusScore = clamp(
    100 - (current.overrides * 5) - (current.manualDisableCount * 10),
    0,
    100
  );
  const previousFocusScore = clamp(
    100 - (previous.overrides * 5) - (previous.manualDisableCount * 10),
    0,
    100
  );
  const trendVsLastWeek = focusScore - previousFocusScore;
  const feedbackLine = getWeeklyFeedbackLine({
    trendVsLastWeek,
    currentOverrides: current.overrides,
    previousOverrides: previous.overrides
  });

  const highlights = [
    `Discipline score: ${focusScore}/100.`,
    `Overrides this week: ${current.overrides}.`,
    `Top distraction domains: ${current.topDistractionDomains.map((entry) => entry.domain).join(', ') || 'None'}.`,
    `Trend vs last week: ${formatSignedNumber(trendVsLastWeek)} points.`
  ];
  const risks = [];
  if (current.overrides > 8) {
    risks.push('Overrides went up. Add a longer wait before manual unlock.');
  }
  if (current.manualDisableCount > 0) {
    risks.push(`Strict mode was turned off ${current.manualDisableCount} time(s).`);
  }
  if (current.blockedAttempts > 30) {
    risks.push('Many distraction attempts this week. Update your blocklist and schedule.');
  }

  return {
    periodLabel: `${currentRange.startDate} to ${currentRange.endDate}`,
    focusScore,
    overridesThisWeek: current.overrides,
    manualDisableCount: current.manualDisableCount,
    topDistractionDomains: current.topDistractionDomains,
    trendVsLastWeek,
    feedbackLine,
    highlights,
    risks,
    totals: {
      blockedAttempts: current.blockedAttempts,
      strictSessionMinutes: current.strictSessionMinutes,
      overrides: current.overrides
    }
  };
}

function getDateKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getLast7DaysMeta() {
  const days = [];
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    days.push({
      dateKey: getDateKey(date.getTime()),
      startMs: date.getTime()
    });
  }
  return days;
}

function getRollingWeekRange(weeksBack) {
  const normalizedWeeksBack = Math.max(0, Number(weeksBack) || 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() - (normalizedWeeksBack * 7));

  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);

  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    startDate: getDateKey(start.getTime()),
    endDate: getDateKey(end.getTime())
  };
}

function buildWeekSummary(events, startMs, endMs) {
  const windowEvents = (Array.isArray(events) ? events : [])
    .filter((event) => event.timestamp >= startMs && event.timestamp <= endMs);
  const blockedEvents = windowEvents.filter((event) => event.type === 'blocked_visit');
  const overrideEvents = windowEvents.filter((event) => event.type === 'override_triggered');
  const manualDisableEvents = windowEvents.filter((event) => event.type === 'manual_disable');
  const strictAccessEvents = windowEvents.filter((event) => (
    event.type === 'access_granted' && event.strictSessionActive === true
  ));

  const byDomain = new Map();
  for (const event of blockedEvents) {
    const domain = normalizeDomain(event.domain) || 'unknown.com';
    byDomain.set(domain, (byDomain.get(domain) || 0) + 1);
  }

  return {
    blockedAttempts: blockedEvents.length,
    overrides: overrideEvents.length,
    manualDisableCount: manualDisableEvents.length,
    strictSessionMinutes: strictAccessEvents.reduce(
      (sum, event) => sum + positiveInt(event.durationMinutes, 0),
      0
    ),
    topDistractionDomains: [...byDomain.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  };
}

function formatSignedNumber(value) {
  const num = Number(value) || 0;
  return num > 0 ? `+${num}` : `${num}`;
}

function getWeeklyFeedbackLine({ trendVsLastWeek, currentOverrides, previousOverrides }) {
  if ((Number(currentOverrides) || 0) > (Number(previousOverrides) || 0)) {
    return 'Overrides went up this week.';
  }

  const delta = Number(trendVsLastWeek) || 0;
  if (delta > 0) {
    return 'Solid control. Keep it.';
  }
  if (delta < 0) {
    return 'Overrides went up this week.';
  }

  return 'Strong consistency. You protected your time.';
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

if (typeof globalThis !== 'undefined') {
  globalThis.__RESISTGATE_TEST_HOOKS__ = {
    sanitizeSettings,
    sanitizeTemporaryAccess,
    sanitizeAnalytics,
    sanitizeBlocklist,
    buildBlockingRules,
    normalizeDomain,
    isWithinSimpleSchedule,
    applyStrictModeUpdate,
    isEarnAccessActive,
    getEarnAccessMinChallengeSeconds,
    getDateKey,
    getLast7DaysMeta,
    getRollingWeekRange,
    buildWeekSummary,
    getWeeklyFeedbackLine,
    hasProAccess,
    sanitizeSubscriptionStatus,
    isTrustedExternalSender,
    str2ab,
    base64UrlDecode,
    base64UrlDecodeToBuffer,
    removeExpiredBlocks,
    removeExpiredTemporaryAccess,
    sanitizeCommitmentMode,
    sanitizeIntentionPage,
    isCommitmentModeActive,
    sanitizeTemptationBundle,
    sanitizeWorkTimer,
    isBundleConditionMet,
    getEffectiveWorkMinutes,
    syncBundleUnlockAlarms,
    BUNDLE_UNLOCK_ALARM_PREFIX
  };
}
