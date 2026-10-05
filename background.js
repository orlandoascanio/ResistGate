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
const DAILY_RESET_ALARM = 'resistgate-daily-reset';
const BUNDLE_UNLOCK_ALARM_PREFIX = 'resistgate-bundle-unlock-';
const DAILY_COUNT_KEY = 'dailyBlockCount';
const RESISTANCE_COUNTERS_KEY = 'resistanceCounters';
const WORK_TIMER_KEY = 'workTimer';
const PENDING_OUTCOME_TAP_KEY = 'pendingOutcomeTap';
const GATE_OUTCOMES_KEY = 'gateOutcomes';
const GATE_REMINDERS_KEY = 'gateReminders';
const GATE_REMINDER_ALARM_PREFIX = 'resistgate-gate-reminder-';
const GATE_REMINDER_DELAY_MINUTES = 10;
const MAX_GATE_OUTCOMES = 100;
const GATE_STREAK_WINDOW = 5;
const MAX_ANALYTICS_EVENTS = 3000;
const POSTHOG_PROJECT_TOKEN = 'phc_u3HfEJ9tnozSthBr37cVGdbC6UYkR6caDHEesudUXMa3';
const POSTHOG_HOST = 'https://us.i.posthog.com';
const POSTHOG_EVENT_ALLOWLIST = new Set([
  'install',
  'update',
  'onboarding_start',
  'blocklist_created',
  'first_block_hit',
  'challenge_completed',
  'access_granted',
  'return_day_1',
  'uninstall_reason_submit'
]);
const RESISTGATE_LIFECYCLE_URLS = {
  install: 'https://orlandoascanio.com/resistgate/installed',
  update: 'https://orlandoascanio.com/resistgate/updated'
};

const RESISTGATE_SITE_ORIGIN = 'https://www.orlandoascanio.com';
const PRICING_PAGE_URL = `${RESISTGATE_SITE_ORIGIN}/en/pricing`;
const CHECKOUT_SESSION_ENDPOINT = `${RESISTGATE_SITE_ORIGIN}/api/checkout/session`;
const ACTIVATE_INSTALL_ENDPOINT = `${RESISTGATE_SITE_ORIGIN}/api/entitlement/activate-install`;
const INSTALL_STATUS_ENDPOINT = `${RESISTGATE_SITE_ORIGIN}/api/entitlement/install-status`;
const BILLING_REQUEST_TIMEOUT_MS = 15000;
const CHECKOUT_PLANS = new Set(['monthly', 'yearly', 'lifetime']);
const DEFAULT_CHECKOUT_PLAN = 'yearly';
const ENTITLEMENT_SYNC_ALARM = 'resistgate-entitlement-sync';
const ENTITLEMENT_SYNC_PERIOD_MINUTES = 360;
const ENTITLEMENT_SYNC_MIN_INTERVAL_MS = 60 * 60 * 1000;
// How long a verified grant is trusted without the server confirming it again.
//
// Transient failures preserve the last verified state so a brief outage never signs a paying
// customer out. But that trust has to end somewhere: without a ceiling, a subscription that
// lapsed at Paddle keeps Pro forever as long as the client never completes another sync —
// whether that is a week-long outage, or someone simply keeping the extension offline. At the
// ceiling the extension drops to Free and asks the user to reconnect, rather than extending
// trust indefinitely.
const ENTITLEMENT_GRACE_PERIOD_MS = 72 * 60 * 60 * 1000;
const INSTALL_CREDENTIAL_PATTERN = /^[0-9a-f]{64}$/;
const CUSTOM_CHALLENGE_PHRASE_MAX_LENGTH = 200;

const DEFAULT_SETTINGS = {
  enabled: true,
  defaultAccessDuration: 15, // minutes
  blocklist: [],
  challengeTypes: {
    typing: { difficulty: 3, duration: 15, level: 'hard' }
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
    tier: 'free'
  },
  proFeatures: {
    accountabilityPreset: 'balanced',
    customChallengePhrase: {
      enabled: false,
      text: ''
    },
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

function getLifecyclePageUrl(details, urls) {
  const ignoredReasons = chrome.runtime.OnInstalledReason || {};
  if (
    !details ||
    details.reason === ignoredReasons.CHROME_UPDATE ||
    details.reason === ignoredReasons.SHARED_MODULE_UPDATE ||
    details.reason === 'chrome_update' ||
    details.reason === 'shared_module_update'
  ) {
    return null;
  }

  if (details.reason === 'install') {
    return urls.install;
  }

  if (details.reason === 'update') {
    const currentVersion = getCurrentExtensionVersion();
    if (!isMeaningfulUpdate(details.previousVersion, currentVersion)) {
      return null;
    }

    const url = new URL(urls.update);
    if (typeof details.previousVersion === 'string' && details.previousVersion.length > 0) {
      url.searchParams.set('from', details.previousVersion);
    }
    if (currentVersion) {
      url.searchParams.set('to', currentVersion);
    }
    return url.toString();
  }

  return null;
}

function getCurrentExtensionVersion() {
  try {
    const version = chrome.runtime?.getManifest ? chrome.runtime.getManifest()?.version : null;
    return typeof version === 'string' && version ? version : null;
  } catch {
    return null;
  }
}

function parseExtensionVersion(value) {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(String(value || '').trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] || 0)] : null;
}

// Only a new minor or major version opens the "what's new" tab. Reloading an unpacked
// build (Chrome reports it as an update to the same version), a downgrade, and patch
// releases stay quiet: a tab on every release teaches people to close it unread.
// When either version can't be read, err on the side of showing the page.
function isMeaningfulUpdate(previousVersion, currentVersion) {
  const previous = parseExtensionVersion(previousVersion);
  const current = parseExtensionVersion(currentVersion);
  if (!previous || !current) {
    return true;
  }

  if (current[0] !== previous[0]) {
    return current[0] > previous[0];
  }

  return current[1] > previous[1];
}

function openLifecyclePage(details, urls) {
  const url = getLifecyclePageUrl(details, urls);
  if (!url) {
    return;
  }

  chrome.tabs.create({ url });
}

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    await initializeExtension('onInstalled');
    if (details.reason === 'install') {
      await enableIntentionPageForNewInstall();
    }
  })();
  
  // Set the survey/uninstall URL (Must be https)
  chrome.runtime.setUninstallURL('https://www.orlandoascanio.com/resistgate/uninstall');
  
  // Show welcome page on first install, what's new page on update
  if (details.reason === 'install') {
    void trackPosthogEventOnce('install', {
      installReason: details.reason
    });
    openLifecyclePage(details, RESISTGATE_LIFECYCLE_URLS);
  } else if (details.reason === 'update') {
    void trackPosthogEventOnce('update', {
      previousVersion: typeof details.previousVersion === 'string' ? details.previousVersion : null
    });
    openLifecyclePage(details, RESISTGATE_LIFECYCLE_URLS);
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

  if (alarm.name.startsWith(ACCESS_ALARM_PREFIX)) {
    const domain = alarm.name.slice(ACCESS_ALARM_PREFIX.length);
    void (async () => {
      try {
        await setInStorage({ [PENDING_OUTCOME_TAP_KEY]: { domain, expiredAt: Date.now() } });
      } catch (err) {
        console.error('Failed to write pendingOutcomeTap:', err);
      }
    })();
  }

  if (alarm.name.startsWith(GATE_REMINDER_ALARM_PREFIX)) {
    const domain = alarm.name.slice(GATE_REMINDER_ALARM_PREFIX.length);
    void openGateReminder(domain).catch((err) => {
      console.error('Gate reminder failed:', err);
    });
  }

  if (alarm.name === ENTITLEMENT_SYNC_ALARM) {
    void syncEntitlement('alarm', { force: true });
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
        case 'getWelcomeState': {
          try {
            sendResponse({ success: true, ...await getWelcomeState() });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
          return;
        }

        case 'saveWelcomeSetup':
        case 'saveWelcomeReminder': {
          try {
            const operation = welcomeWriteQueue.then(() => saveWelcomeChange(request));
            welcomeWriteQueue = operation.catch((err) => console.warn('Welcome setup failed:', err.message));
            sendResponse({ success: true, ...await operation });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
          return;
        }

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

        case 'getActiveTemporaryAccess': {
          try {
            const access = await getActiveTemporaryAccess();
            sendResponse({ success: true, access });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
          return;
        }

        case 'revokeTemporaryAccess': {
          try {
            const result = await revokeTemporaryAccess(request.domain);
            sendResponse({ success: true, access: result });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
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

        case 'recordGateOutcome': {
          const summary = await recordGateOutcome(request.domain, 'resisted', {
            reversesAccess: request.reversesAccess === true
          });
          sendResponse({ success: true, summary });
          return;
        }

        case 'getGateOutcomeSummary': {
          const summary = await getGateOutcomeSummary();
          sendResponse({ success: true, summary });
          return;
        }

        case 'scheduleGateReminder': {
          const reminder = await scheduleGateReminder(request.originalUrl);
          sendResponse({ success: true, reminder });
          return;
        }

        case 'getTodaySummary': {
          const summary = await getTodaySummary();
          sendResponse({ success: true, summary });
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
          nextSettings.subscription = currentSettings.subscription;
          if (!hasProAccess(currentSettings)) {
            const intentionPage = nextSettings.proFeatures?.intentionPage;
            nextSettings.proFeatures = currentSettings.proFeatures;
            if (canUseIntentionPage() && intentionPage) {
              nextSettings.proFeatures.intentionPage = intentionPage;
            }
          }

          const currentBlocklistLength = Array.isArray(currentSettings.blocklist)
            ? currentSettings.blocklist.length
            : 0;
          const nextBlocklistLength = Array.isArray(nextSettings.blocklist)
            ? nextSettings.blocklist.length
            : 0;

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
              nextSettings.proFeatures.customChallengePhrase = currentSettings.proFeatures.customChallengePhrase;
              nextSettings.proFeatures.strictModeDisableDelaySeconds = currentSettings.proFeatures.strictModeDisableDelaySeconds;
              nextSettings.proFeatures.behavioralFriction = currentSettings.proFeatures.behavioralFriction;
              nextSettings.proFeatures.overrideCooldown = currentSettings.proFeatures.overrideCooldown;
            }
          }

          const transition = applyStrictModeUpdate(currentSettings, nextSettings, Date.now());
          await saveSettings(transition.settings);
          if (currentBlocklistLength < 3 && nextBlocklistLength >= 3) {
            await trackPosthogEventOnce('blocklist_created', {
              blocklistSize: nextBlocklistLength
            });
          }
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

        case 'openPricingPage': {
          const plan = resolveCheckoutPlan(request.plan);
          if (!plan) {
            sendResponse({ success: false, error: 'That plan is not available.', retryable: false });
            return;
          }

          const session = await createCheckoutSession(plan);
          if (!session.ok) {
            sendResponse({ success: false, error: session.error, retryable: session.transient === true, plan });
            return;
          }

          const url = buildPricingUrl(session.checkoutId, plan);
          await chrome.tabs.create({ url });
          sendResponse({
            success: true,
            url,
            plan,
            checkoutId: session.checkoutId,
            expiresAt: session.expiresAt
          });
          return;
        }

        case 'getBillingState': {
          const [installation, settings] = await Promise.all([getInstallation(), getSettings()]);
          sendResponse({
            success: true,
            state: {
              pro: hasProAccess(settings),
              plan: installation.entitlement?.plan || null,
              status: installation.entitlement?.status || null,
              checkedAt: installation.entitlement?.checkedAt || null,
              hasCheckout: Boolean(installation.installCredential),
              // A grant that aged out of the grace window. The user paid, but we have not been
              // able to confirm it for long enough that Pro had to lapse — they need to get
              // back online and recheck, not buy again.
              needsReconnect: installation.entitlement?.stale === true
            }
          });
          return;
        }

        case 'refreshEntitlement': {
          const result = await syncEntitlement('manual', { force: true });
          if (result.skipped) {
            sendResponse({
              success: false,
              error: 'No purchase is linked to this browser yet.',
              retryable: false
            });
            return;
          }

          if (!result.ok) {
            sendResponse({ success: false, error: result.error, retryable: result.transient === true });
            return;
          }

          sendResponse({ success: true, pro: result.pro, changed: result.changed });
          return;
        }

        case 'openFeedbackPage': {
          const surface = typeof request.surface === 'string' ? request.surface : 'extension';
          const url = `https://www.orlandoascanio.com/en/resistgate/feedback?source=${encodeURIComponent(surface)}`;
          await chrome.tabs.create({ url });
          sendResponse({ success: true, url });
          return;
        }

        case 'openReviewPage': {
          const url = `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`;
          await chrome.tabs.create({ url });
          sendResponse({ success: true, url });
          return;
        }

        case 'trackPosthogEvent': {
          const eventName = typeof request.eventName === 'string' ? request.eventName.trim() : '';
          const eventProps = request.properties && typeof request.properties === 'object' ? request.properties : {};
          const tracked = await trackPosthogEventOnce(eventName, eventProps);
          sendResponse({ success: true, tracked });
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

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (!request || typeof request.action !== 'string') {
    sendResponse({ success: false, error: 'Invalid request' });
    return false;
  }

  const TRUSTED_ORIGINS = new Set([
    'https://www.orlandoascanio.com',
    'https://orlandoascanio.com'
  ]);

  try {
    if (!sender?.url || !TRUSTED_ORIGINS.has(new URL(sender.url).origin)) {
      sendResponse({ success: false, error: 'Unauthorized sender' });
      return false;
    }
  } catch {
    sendResponse({ success: false, error: 'Unauthorized sender' });
    return false;
  }

  if (request.action === 'activateProFromWebsite') {
    void (async () => {
      try {
        await initializeExtension('external-message');

        const activationToken = sanitizeOpaqueString(request.activationToken);
        if (!activationToken) {
          sendResponse({ success: false, error: 'Missing activation token', retryable: false });
          return;
        }

        const result = await activateInstallWithToken(activationToken);
        if (!result.ok) {
          sendResponse({ success: false, error: result.error, retryable: result.transient === true });
          return;
        }

        const successUrl = new URL(chrome.runtime.getURL('options/options.html'));
        successUrl.searchParams.set('activation', 'success');
        if (result.plan) {
          successUrl.searchParams.set('plan', result.plan);
        }
        await chrome.tabs.create({ url: successUrl.toString() });

        sendResponse({
          success: true,
          subscription: { tier: 'pro' },
          plan: result.plan,
          status: result.status
        });
      } catch (error) {
        console.error('Pro activation failed:', error);
        sendResponse({ success: false, error: error?.message || 'Activation failed', retryable: true });
      }
    })();
    return true;
  }

  if (request.action === 'getOnboardingState' || request.action === 'openOnboarding') {
    void (async () => {
      try {
        await initializeExtension('external-onboarding');
        if (request.action === 'openOnboarding') {
          const section = request.section ?? 'setup';
          if (!['setup', 'difficulty', 'preview'].includes(section)) {
            throw new Error('Unknown setup section');
          }
          await chrome.tabs.create({ url: `${chrome.runtime.getURL('welcome/welcome.html')}#${section}` });
          sendResponse({ success: true });
          return;
        }
        const { settings, activeDomains } = await getWelcomeState();
        sendResponse({ success: true, state: {
          siteCount: settings.blocklist.length,
          activeSiteCount: activeDomains.length,
          enabled: settings.enabled,
          level: settings.challengeTypes.typing.level,
          accessMinutes: settings.defaultAccessDuration,
          intentionEnabled: settings.proFeatures.intentionPage.enabled
        } });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // Lets the pricing page confirm the extension is reachable before it promises instant activation.
  if (request.action === 'getActivationState') {
    void (async () => {
      try {
        await initializeExtension('external-state');
        const settings = await getSettings();
        sendResponse({ success: true, installed: true, pro: hasProAccess(settings) });
      } catch (error) {
        sendResponse({ success: false, error: error?.message || 'Unavailable' });
      }
    })();
    return true;
  }

  sendResponse({ success: false, error: 'Unknown action' });
  return false;
});

// Welcome writes merge with current settings instead of sending an old full snapshot.
let welcomeWriteQueue = Promise.resolve();

async function getWelcomeState() {
  await queueRulesUpdate('welcome-state', { propagateError: true });
  const settings = await getSettings();
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const activeDomains = settings.blocklist
    .filter((entry) => rules.some((rule) => rule.condition.urlFilter === `||${entry.urlPattern}^`))
    .map((entry) => entry.urlPattern);
  return { settings, activeDomains };
}

function validateWelcomeDomain(value) {
  const domain = normalizeDomain(value);
  if (!domain || domain.length > 253 || !domain.split('.').every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error('Enter a website such as reddit.com or paste its https:// address.');
  }
  return domain.startsWith('www.') && domain.split('.').length > 2 ? domain.slice(4) : domain;
}

async function saveWelcomeChange(request) {
  const settings = await getSettings();
  let savedDomain;
  if (isCommitmentModeActive(settings, Date.now())) {
    throw new Error('Commitment Mode is active. Setup is locked until it expires.');
  }
  if (isConfigurationLocked(settings, Date.now())) {
    throw new Error('Strict Mode is active. Change setup after your focus window ends.');
  }
  if (request.action === 'saveWelcomeReminder') {
    const domain = validateWelcomeDomain(request.domain);
    const entry = settings.blocklist.find((site) => (site.urlPattern === domain || site.urlPattern === `www.${domain}`));
    if (!entry) throw new Error('This site is no longer in your blocklist. Add it again first.');
    if (typeof request.personalGoal !== 'string' || request.personalGoal.length > 200) {
      throw new Error('Keep your reminder to 200 characters or fewer.');
    }
    entry.personalGoal = request.personalGoal.trim();
    savedDomain = entry.urlPattern;
  } else {
    const levels = { easy: 1, moderate: 2, hard: 3 };
    if (!Object.hasOwn(levels, request.level)) throw new Error('Choose Easy, Moderate, or Hard.');
    if (request.domain) {
      const domain = validateWelcomeDomain(request.domain);
      const exists = settings.blocklist.some((site) => (site.urlPattern === domain || site.urlPattern === `www.${domain}`));
      if (!exists) settings.blocklist.push({ id: `${Date.now()}-${domain}`, urlPattern: domain, createdAt: Date.now() });
      savedDomain = settings.blocklist.find((site) => (site.urlPattern === domain || site.urlPattern === `www.${domain}`)).urlPattern;
    } else if (!settings.blocklist.length) {
      throw new Error('Choose or enter your first website.');
    }
    settings.challengeTypes.typing.level = request.level;
    settings.challengeTypes.typing.difficulty = levels[request.level];
  }
  await saveSettings(settings);
  return { ...await getWelcomeState(), savedDomain };
}

// ── Billing and entitlement ───────────────────────────────────────
// The extension never decides who is Pro. It creates a server checkout session,
// hands the website an opaque checkout ID, and only flips the local tier after the
// server verifies a signed activation token against this install's credential.

function resolveCheckoutPlan(rawPlan) {
  if (rawPlan === undefined || rawPlan === null || rawPlan === '') {
    return DEFAULT_CHECKOUT_PLAN;
  }

  if (typeof rawPlan !== 'string') {
    return null;
  }

  const plan = rawPlan.trim().toLowerCase();
  return CHECKOUT_PLANS.has(plan) ? plan : null;
}

function buildPricingUrl(checkoutId, plan) {
  const url = new URL(PRICING_PAGE_URL);
  url.searchParams.set('source', 'extension');
  url.searchParams.set('plan', plan);
  url.searchParams.set('checkout', checkoutId);
  return url.toString();
}

function generateInstallCredential() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  let credential = '';
  while (credential.length < 64) {
    credential += Math.floor(Math.random() * 16).toString(16);
  }
  return credential;
}

function sanitizeInstallCredential(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const credential = value.trim().toLowerCase();
  return INSTALL_CREDENTIAL_PATTERN.test(credential) ? credential : null;
}

function sanitizeEntitlement(raw) {
  const incoming = raw && typeof raw === 'object' ? raw : {};
  const checkedAt = sanitizeTimestamp(incoming.checkedAt);

  if (incoming.pro !== true && !incoming.status && !checkedAt) {
    return null;
  }

  return {
    pro: incoming.pro === true,
    plan: sanitizeOpaqueString(incoming.plan),
    status: sanitizeOpaqueString(incoming.status),
    checkedAt,
    // Set when a grant aged past the grace period without the server confirming it. Keeps
    // the options page able to say "reconnect" rather than the bare "you are on Free".
    stale: incoming.stale === true
  };
}

function fetchWithTimeout(url, init) {
  if (typeof AbortController !== 'function') {
    return fetch(url, init);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BILLING_REQUEST_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function requestBillingApi(endpoint, payload) {
  if (typeof fetch !== 'function') {
    return { ok: false, transient: true, error: 'Network unavailable in this browser.' };
  }

  let response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error(`Billing request failed (${endpoint}):`, error?.name || 'network error');
    return { ok: false, transient: true, error: 'Could not reach ResistGate. Check your connection and try again.' };
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const transient = response.status === 408 || response.status === 429 || response.status >= 500;
    return {
      ok: false,
      transient,
      status: response.status,
      error: sanitizeOpaqueString(data?.error) || `ResistGate could not complete this request (${response.status}).`
    };
  }

  return { ok: true, status: response.status, data: data || {} };
}

async function ensureInstallCredential() {
  const installation = await getInstallation();
  const existing = sanitizeInstallCredential(installation.installCredential);
  if (existing) {
    return { installation, credential: existing };
  }

  installation.installCredential = generateInstallCredential();
  await saveInstallation(installation);
  return { installation, credential: installation.installCredential };
}

// Drop the verified grant, but keep the install credential.
//
// The credential is the only handle this browser has back to its own purchase: it is what
// `install-status` is keyed on, and it exists nowhere the user can reach. Destroying it turns
// a recoverable state ("the server currently says no") into a permanent one ("this browser can
// never ask again"), which for a Lifetime buyer means losing something they own outright to a
// single bad 403. Keeping it costs nothing — a credential the server does not recognize is
// inert — and it means a later successful sync can restore access on its own.
async function clearBillingCredentials() {
  const installation = await getInstallation();
  const hadServerGrant = installation.entitlement?.pro === true;
  installation.entitlement = null;
  await saveInstallation(installation);

  if (hadServerGrant) {
    const settings = await getSettings();
    if (hasProAccess(settings)) {
      settings.subscription = { tier: 'free' };
      await saveSettings(settings);
      await queueRulesUpdate('entitlement:credential-cleared');
    }
  }
}

async function applyVerifiedEntitlement(grant, reason) {
  const pro = grant?.pro === true;

  const installation = await getInstallation();
  installation.entitlement = {
    pro,
    plan: sanitizeOpaqueString(grant?.plan),
    status: sanitizeOpaqueString(grant?.status),
    checkedAt: Date.now()
  };
  await saveInstallation(installation);

  const settings = await getSettings();
  const wasPro = hasProAccess(settings);
  if (wasPro !== pro) {
    settings.subscription = { tier: pro ? 'pro' : 'free' };
    await saveSettings(settings);
    await queueRulesUpdate(`entitlement:${reason}`);
  }

  return {
    pro,
    changed: wasPro !== pro,
    plan: installation.entitlement.plan,
    status: installation.entitlement.status
  };
}

async function createCheckoutSession(plan) {
  const { installation, credential } = await ensureInstallCredential();

  const result = await requestBillingApi(CHECKOUT_SESSION_ENDPOINT, {
    plan,
    source: 'extension',
    extensionId: chrome.runtime.id,
    deviceId: installation.deviceId,
    installCredential: credential
  });

  if (!result.ok) {
    return { ok: false, error: result.error, transient: result.transient };
  }

  const checkoutId = sanitizeOpaqueString(result.data.checkoutId);
  if (!checkoutId) {
    return { ok: false, error: 'Checkout could not be started. Please try again.', transient: true };
  }

  return { ok: true, checkoutId, expiresAt: sanitizeTimestamp(result.data.expiresAt) };
}

async function activateInstallWithToken(activationToken) {
  const installation = await getInstallation();
  const credential = sanitizeInstallCredential(installation.installCredential);
  if (!credential) {
    return {
      ok: false,
      transient: false,
      error: 'This browser has no checkout in progress. Start the upgrade from ResistGate.'
    };
  }

  const result = await requestBillingApi(ACTIVATE_INSTALL_ENDPOINT, {
    activationToken,
    installCredential: credential,
    deviceId: installation.deviceId,
    extensionId: chrome.runtime.id
  });

  if (!result.ok) {
    return { ok: false, error: result.error, transient: result.transient };
  }

  if (result.data.pro !== true) {
    return {
      ok: false,
      transient: false,
      error: sanitizeOpaqueString(result.data.error) || 'This purchase could not be confirmed yet.'
    };
  }

  const applied = await applyVerifiedEntitlement(result.data, 'activation');
  return { ok: true, plan: applied.plan, status: applied.status };
}

async function syncEntitlement(reason, { force = false } = {}) {
  const installation = await getInstallation();
  const credential = sanitizeInstallCredential(installation.installCredential);
  if (!credential) {
    return { ok: false, skipped: true, reason: 'no-credential' };
  }

  const checkedAt = installation.entitlement?.checkedAt || 0;
  if (!force && Date.now() - checkedAt < ENTITLEMENT_SYNC_MIN_INTERVAL_MS) {
    return { ok: true, skipped: true, reason: 'recently-checked' };
  }

  const result = await requestBillingApi(INSTALL_STATUS_ENDPOINT, {
    installCredential: credential,
    deviceId: installation.deviceId,
    extensionId: chrome.runtime.id
  });

  if (!result.ok) {
    // Only an explicit rejection of the credential invalidates local billing state.
    // Network failures, rate limits, and server errors preserve the last verified grant.
    if (result.status === 401 || result.status === 403) {
      await clearBillingCredentials();
      return { ok: false, cleared: true, transient: false, error: result.error };
    }

    // Transient failure. Preserve the last verified grant — unless it has now gone
    // unconfirmed for longer than the grace period, at which point trust expires.
    const expired = await expireStaleEntitlement();
    return { ok: false, transient: true, expired, error: result.error };
  }

  return { ok: true, ...(await applyVerifiedEntitlement(result.data, `sync:${reason}`)) };
}

// Returns true when a grant was too old to keep trusting and Pro was withdrawn.
//
// Only the verified grant is dropped: the install credential survives, so a single successful
// sync once the server is reachable again restores Pro with no action from the user.
async function expireStaleEntitlement() {
  const installation = await getInstallation();
  const entitlement = installation.entitlement;

  if (entitlement?.pro !== true || !entitlement.checkedAt) {
    return false;
  }

  if (Date.now() - entitlement.checkedAt <= ENTITLEMENT_GRACE_PERIOD_MS) {
    return false;
  }

  installation.entitlement = { ...entitlement, pro: false, stale: true };
  await saveInstallation(installation);

  const settings = await getSettings();
  if (hasProAccess(settings)) {
    settings.subscription = { tier: 'free' };
    await saveSettings(settings);
    await queueRulesUpdate('entitlement:grace-expired');
  }

  return true;
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
    let installationChanged = false;
    if (!normalizedInstallation.firstSeenAt) {
      normalizedInstallation.firstSeenAt = Date.now();
      installationChanged = true;
    }
    if (JSON.stringify(existingInstallation || {}) !== JSON.stringify(normalizedInstallation)) {
      await saveInstallation(normalizedInstallation);
    } else if (installationChanged) {
      await saveInstallation(normalizedInstallation);
    }

    if (
      normalizedInstallation.firstSeenAt
      && !hasTrackedPosthogEvent(normalizedInstallation, 'return_day_1')
      && isWithinReturnDayOneWindow(normalizedInstallation.firstSeenAt, Date.now())
    ) {
      await trackPosthogEventOnce('return_day_1', {
        daysSinceInstall: 1
      });
    }

    // Register daily badge reset alarm (fires at midnight, repeats every 24h)
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0);
    chrome.alarms.create(DAILY_RESET_ALARM, { when: nextMidnight.getTime(), periodInMinutes: 1440 });

    chrome.alarms.create(ENTITLEMENT_SYNC_ALARM, {
      periodInMinutes: ENTITLEMENT_SYNC_PERIOD_MINUTES
    });
    void syncEntitlement(reason);

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

async function enableIntentionPageForNewInstall() {
  const settings = await getSettings();
  settings.proFeatures = settings.proFeatures || {};
  settings.proFeatures.intentionPage = sanitizeIntentionPage({
    ...settings.proFeatures.intentionPage,
    enabled: true
  });
  await saveSettings(settings);
}

function queueRulesUpdate(reason, options = {}) {
  const pendingUpdate = updateQueue
    .then(() => updateBlockingRules(reason));

  updateQueue = pendingUpdate
    .catch((error) => {
      console.error('Rule update failed:', error);
    });

  return options.propagateError === true ? pendingUpdate : updateQueue;
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
    const intentionPageEnabled = canUseIntentionPage()
      && settings.proFeatures?.intentionPage?.enabled === true;
    const redirectPage = commitmentActive
      ? 'commitment-page/index.html'
      : intentionPageEnabled
        ? 'intention-page/index.html'
        : 'friction-page/index.html';

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

  await trackPosthogEventOnce('access_granted', {
    domain,
    method: parsedMeta.method,
    durationMinutes: duration,
    strictSessionActive: isStrictFocusActive(settings, now),
    timeSpentSeconds: positiveInt(timeSpentOnChallenge, 0),
    earnAccessEnabled: parsedMeta.earnAccessEnabled
  });

  if (parsedMeta.method === 'manualOverride' && hasProAccess(settings)) {
    await recordManualOverride(settings, now, domain);
  }

  await recordGateOutcome(domain, 'accessed');

  return { domain, duration, expiresAt };
}

async function getActiveTemporaryAccess() {
  const now = Date.now();
  const [settings, temporaryAccess] = await Promise.all([
    getSettings(),
    getTemporaryAccess()
  ]);
  const cleanedAccess = removeExpiredTemporaryAccess(temporaryAccess, now);

  if (cleanedAccess.changed) {
    await saveTemporaryAccess(cleanedAccess.value);
  }

  const blockedDomains = new Set(
    settings.blocklist
      .map((entry) => normalizeDomain(entry.urlPattern))
      .filter(Boolean)
  );

  return Object.entries(cleanedAccess.value)
    .filter(([domain]) => blockedDomains.has(domain))
    .map(([domain, entry]) => ({
      domain,
      grantedAt: entry.grantedAt,
      expiresAt: entry.expiresAt,
      duration: entry.duration
    }))
    .sort((first, second) => first.expiresAt - second.expiresAt);
}

async function revokeTemporaryAccess(urlPattern) {
  const domain = normalizeDomain(urlPattern);
  if (!domain) {
    throw new Error('Invalid domain for temporary access');
  }

  const [settings, temporaryAccess] = await Promise.all([
    getSettings(),
    getTemporaryAccess()
  ]);
  const isBlocked = settings.blocklist.some(
    (entry) => normalizeDomain(entry.urlPattern) === domain
  );

  if (!isBlocked) {
    throw new Error('Site is no longer in the blocklist');
  }

  const activeGrant = temporaryAccess[domain];
  if (!isDomainTemporarilyAccessible(domain, temporaryAccess, Date.now())) {
    throw new Error('Temporary access is no longer active');
  }

  const nextTemporaryAccess = { ...temporaryAccess };
  delete nextTemporaryAccess[domain];
  await saveTemporaryAccess(nextTemporaryAccess);

  try {
    await queueRulesUpdate(`revoke:${domain}`, { propagateError: true });
  } catch (error) {
    try {
      await saveTemporaryAccess({
        ...nextTemporaryAccess,
        [domain]: activeGrant
      });
      await queueRulesUpdate(`revoke-rollback:${domain}`, { propagateError: true });
    } catch (rollbackError) {
      console.error('Temporary access rollback failed:', rollbackError);
    }

    throw new Error('Unable to re-block this site right now. Try again.');
  }

  return { domain };
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
  if (resistanceCount === 1) {
    await trackPosthogEventOnce('first_block_hit', {
      domain
    });
  }
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

// Free-tier progress: today's blocked attempts, from the same counters that drive the badge.
// Deliberately not Pro-gated — the full dashboard is, but a free user should still see
// that the gate is doing something.
async function getTodaySummary() {
  const today = getDateKey(Date.now());
  const result = await getFromStorage([DAILY_COUNT_KEY, RESISTANCE_COUNTERS_KEY]);
  const daily = result[DAILY_COUNT_KEY] || {};
  const counters = result[RESISTANCE_COUNTERS_KEY] || {};
  const todayCounters = (counters[today] && typeof counters[today] === 'object') ? counters[today] : {};

  const topDomains = Object.entries(todayCounters)
    .map(([domain, count]) => ({ domain, count: Number(count) || 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, 3);

  return {
    date: today,
    blockedToday: daily.date === today ? (Number(daily.count) || 0) : 0,
    topDomains
  };
}

// What happened at the gate today, newest last: 'resisted' when the user left without
// access (go back, quit, never mind, remind me later), 'accessed' when access was granted.
// Blocked-visit counters only record arrivals; this is what the streak line is built from.
async function getGateOutcomes() {
  const today = getDateKey(Date.now());
  const result = await getFromStorage([GATE_OUTCOMES_KEY]);
  const data = result[GATE_OUTCOMES_KEY];
  if (!data || data.date !== today || !Array.isArray(data.outcomes)) {
    return { date: today, outcomes: [] };
  }

  return {
    date: today,
    outcomes: data.outcomes.filter((entry) => (
      entry
      && (entry.outcome === 'resisted' || entry.outcome === 'accessed')
      && typeof entry.domain === 'string'
    ))
  };
}

async function recordGateOutcome(urlPattern, outcome, { reversesAccess = false } = {}) {
  const domain = normalizeDomain(urlPattern);
  if (!domain || (outcome !== 'resisted' && outcome !== 'accessed')) {
    return getGateOutcomeSummary();
  }

  const data = await getGateOutcomes();
  const outcomes = [...data.outcomes];

  // "Actually, never mind" after access was granted turns that grant into a resisted
  // visit instead of adding a second entry for the same arrival.
  let reversedIndex = -1;
  if (reversesAccess) {
    for (let i = outcomes.length - 1; i >= 0; i--) {
      if (outcomes[i].domain === domain && outcomes[i].outcome === 'accessed') {
        reversedIndex = i;
        break;
      }
    }
  }

  if (reversedIndex >= 0) {
    outcomes[reversedIndex] = { ...outcomes[reversedIndex], outcome: 'resisted' };
  } else {
    outcomes.push({ domain, outcome, at: Date.now() });
  }

  await setInStorage({
    [GATE_OUTCOMES_KEY]: { date: data.date, outcomes: outcomes.slice(-MAX_GATE_OUTCOMES) }
  });

  return summarizeGateOutcomes(outcomes);
}

function summarizeGateOutcomes(outcomes) {
  const recent = outcomes.slice(-GATE_STREAK_WINDOW);
  return {
    total: recent.length,
    resisted: recent.filter((entry) => entry.outcome === 'resisted').length
  };
}

async function getGateOutcomeSummary() {
  const data = await getGateOutcomes();
  return summarizeGateOutcomes(data.outcomes);
}

// "Not now, remind me in 10 min": the user leaves the gate, and the same destination is
// reopened later. It goes back through the blocking rules, so it only skips the gate if
// the site is no longer blocked by then.
async function scheduleGateReminder(originalUrl) {
  let parsed;
  try {
    parsed = new URL(originalUrl);
  } catch {
    throw new Error('Invalid destination for a reminder');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Invalid destination for a reminder');
  }

  const settings = await getSettings();
  const hostname = normalizeDomain(parsed.hostname);
  const entry = settings.blocklist.find((item) => {
    const pattern = normalizeDomain(item.urlPattern);
    return pattern && hostname && (hostname === pattern || hostname.endsWith(`.${pattern}`));
  });
  if (!entry) {
    throw new Error('Domain is not in blocklist');
  }

  const domain = normalizeDomain(entry.urlPattern);
  const remindAt = Date.now() + GATE_REMINDER_DELAY_MINUTES * 60 * 1000;
  const result = await getFromStorage([GATE_REMINDERS_KEY]);
  const reminders = { ...(result[GATE_REMINDERS_KEY] || {}) };
  reminders[domain] = { url: parsed.href, remindAt };
  await setInStorage({ [GATE_REMINDERS_KEY]: reminders });
  await chrome.alarms.create(`${GATE_REMINDER_ALARM_PREFIX}${domain}`, {
    delayInMinutes: GATE_REMINDER_DELAY_MINUTES
  });
  await recordGateOutcome(domain, 'resisted');

  return { domain, remindAt };
}

async function openGateReminder(domain) {
  const result = await getFromStorage([GATE_REMINDERS_KEY]);
  const reminders = { ...(result[GATE_REMINDERS_KEY] || {}) };
  const reminder = reminders[domain];
  if (!reminder) {
    return;
  }

  delete reminders[domain];
  await setInStorage({ [GATE_REMINDERS_KEY]: reminders });

  let url;
  try {
    url = new URL(reminder.url);
  } catch {
    return;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return;
  }

  await chrome.tabs.create({ url: url.href, active: true });
}

async function recordAnalyticsEvent(type, domain) {
  const settings = await getSettings();
  const rawDomain = typeof domain === 'string' ? domain.trim().slice(0, 120) : '';
  if (POSTHOG_EVENT_ALLOWLIST.has(type)) {
    await trackPosthogEventOnce(type, {
      domain: normalizeDomain(domain) || rawDomain || 'system',
      surface: rawDomain || 'system',
      source: 'extension'
    });
  }

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
      ),
      level: sanitizeTypingChallengeLevel(
        incoming.challengeTypes?.typing?.level,
        incoming.challengeTypes?.typing?.difficulty
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

  const subscription = {
    tier: (incoming.subscription?.tier === 'pro') ? 'pro' : 'free'
  };

  const incomingBehavioral = incoming.proFeatures?.behavioralFriction || {};
  const incomingOverrideCooldown = incoming.proFeatures?.overrideCooldown || {};
  const proFeatures = {
    accountabilityPreset: sanitizeAccountabilityPreset(incoming.proFeatures?.accountabilityPreset),
    customChallengePhrase: sanitizeCustomChallengePhrase(incoming.proFeatures?.customChallengePhrase),
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

  const globalGoal = proFeatures.intentionPage.personalGoal;
  if (globalGoal) {
    for (const entry of blocklist) {
      if (!entry.personalGoal) {
        entry.personalGoal = globalGoal;
      }
    }
    proFeatures.intentionPage.personalGoal = '';
  }

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

function sanitizeTypingChallengeLevel(level, difficulty) {
  if (level === 'easy' || level === 'moderate' || level === 'hard') {
    return level;
  }

  const numericDifficulty = Number(difficulty);
  if (numericDifficulty === 1) {
    return 'easy';
  }
  if (numericDifficulty === 2) {
    return 'moderate';
  }
  return DEFAULT_SETTINGS.challengeTypes.typing.level;
}

function sanitizeInstallation(installation) {
  const incoming = installation && typeof installation === 'object' ? installation : {};
  return {
    deviceId: sanitizeOpaqueString(incoming.deviceId) || generateDeviceId(),
    firstSeenAt: sanitizeTimestamp(incoming.firstSeenAt),
    posthogSentEvents: sanitizePosthogSentEvents(incoming.posthogSentEvents),
    installCredential: sanitizeInstallCredential(incoming.installCredential),
    entitlement: sanitizeEntitlement(incoming.entitlement)
  };
}

function sanitizePosthogSentEvents(raw) {
  const incoming = raw && typeof raw === 'object' ? raw : {};
  const sanitized = {};

  for (const [key, value] of Object.entries(incoming)) {
    if (typeof key !== 'string' || !key.trim()) {
      continue;
    }

    if (value === true) {
      sanitized[key] = true;
    }
  }

  return sanitized;
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
        'challenge_completed',
        'outcome_tap_response'
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

function sanitizePendingOutcomeTap(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const domain = typeof raw.domain === 'string' && raw.domain.trim() ? raw.domain.trim().toLowerCase().slice(0, 120) : null;
  const expiredAt = Number(raw.expiredAt);
  if (!domain || !Number.isFinite(expiredAt) || expiredAt <= 0) return null;
  return { domain, expiredAt };
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

    if (typeof rawEntry.personalGoal === 'string' && rawEntry.personalGoal.trim()) {
      entry.personalGoal = rawEntry.personalGoal.trim().slice(0, 200);
    } else if (rawEntry.personalGoal !== undefined) {
      delete entry.personalGoal;
    }

    deduped.push(entry);
  }

  return deduped;
}

function hasProAccess(settings) {
  return settings?.subscription?.tier === 'pro';
}

function canUseIntentionPage() {
  // Free feature. Stored under proFeatures for backward compatibility with existing settings.
  return true;
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

function sanitizeCustomChallengePhrase(value) {
  const incoming = value && typeof value === 'object' ? value : {};
  const text = sanitizeChallengePhraseText(incoming.text);

  // A phrase-less "enabled" would silently fall back to the built-in banks, so the
  // stored flag only ever means "there is a phrase to type".
  return {
    enabled: incoming.enabled === true && text.length > 0,
    text
  };
}

function sanitizeChallengePhraseText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  // The phrase is typed back character for character, so it has to stay a single
  // line: newlines and runs of spaces are impossible to reproduce exactly.
  return value.replace(/\s+/g, ' ').trim().slice(0, CUSTOM_CHALLENGE_PHRASE_MAX_LENGTH);
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
  if (!normalizedInstallation.firstSeenAt) {
    normalizedInstallation.firstSeenAt = Date.now();
  }

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

function sanitizePosthogProperties(properties) {
  const incoming = properties && typeof properties === 'object' ? properties : {};
  const sanitized = {};

  for (const [key, value] of Object.entries(incoming)) {
    if (typeof key !== 'string' || !key.trim()) {
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'string') {
      sanitized[key] = value.trim().slice(0, 250);
      continue;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      sanitized[key] = value;
      continue;
    }

    if (typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function getPosthogConfig() {
  const apiKey = typeof globalThis !== 'undefined' && typeof globalThis.__RESISTGATE_POSTHOG_API_KEY__ === 'string'
    ? globalThis.__RESISTGATE_POSTHOG_API_KEY__.trim()
    : POSTHOG_PROJECT_TOKEN;
  const host = typeof globalThis !== 'undefined' && typeof globalThis.__RESISTGATE_POSTHOG_HOST__ === 'string'
    ? globalThis.__RESISTGATE_POSTHOG_HOST__.trim()
    : POSTHOG_HOST;

  return {
    apiKey,
    host: host || POSTHOG_HOST
  };
}

function hasTrackedPosthogEvent(installation, eventName) {
  if (!installation || typeof installation !== 'object') {
    return false;
  }

  return installation.posthogSentEvents?.[eventName] === true;
}

function isWithinReturnDayOneWindow(firstSeenAt, now) {
  if (!Number.isFinite(firstSeenAt) || !Number.isFinite(now)) {
    return false;
  }

  const elapsedMs = now - firstSeenAt;
  return elapsedMs >= 24 * 60 * 60 * 1000 && elapsedMs < 48 * 60 * 60 * 1000;
}

async function trackPosthogEventOnce(eventName, properties = {}) {
  const name = typeof eventName === 'string' ? eventName.trim() : '';
  if (!name || !POSTHOG_EVENT_ALLOWLIST.has(name)) {
    return false;
  }

  const { apiKey, host } = getPosthogConfig();
  if (!apiKey || typeof fetch !== 'function') {
    return false;
  }

  const installation = await getInstallation();
  if (hasTrackedPosthogEvent(installation, name)) {
    return false;
  }

  const manifest = chrome.runtime?.getManifest ? chrome.runtime.getManifest() : null;
  installation.posthogSentEvents = {
    ...(installation.posthogSentEvents || {}),
    [name]: true
  };
  await saveInstallation(installation);

  const payload = {
    api_key: apiKey,
    event: name,
    properties: {
      distinct_id: installation.deviceId,
      extension: 'resistgate',
      extension_version: manifest && typeof manifest.version === 'string' ? manifest.version : 'unknown',
      installation_first_seen_at: installation.firstSeenAt || null,
      ...sanitizePosthogProperties(properties)
    }
  };

  try {
    await fetch(`${host.replace(/\/+$/, '')}/capture/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      keepalive: true
    });
    return true;
  } catch (error) {
    console.warn('PostHog event capture failed:', error);
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
    periodLabel: formatPeriodLabel(last7Days[0].startMs, last7Days[last7Days.length - 1].startMs),
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

  const settings = await getSettings();
  const peakUrgeWindow = findPeakUrgeWindow(current.hourlyUrges, current.blockedAttempts);
  const recommendation = buildWeeklyRecommendation({
    settings,
    peakUrgeWindow,
    siteHoldRates: current.siteHoldRates,
    overrides: current.overrides
  });

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
    periodLabel: formatPeriodLabel(currentRange.startMs, currentRange.endMs),
    focusScore,
    overridesThisWeek: current.overrides,
    manualDisableCount: current.manualDisableCount,
    topDistractionDomains: current.topDistractionDomains,
    trendVsLastWeek,
    feedbackLine,
    hourlyUrges: current.hourlyUrges,
    peakUrgeWindow,
    siteHoldRates: current.siteHoldRates,
    scheduleWindow: getScheduleWindowMeta(settings),
    recommendation,
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

function formatPeriodLabel(startMs, endMs) {
  const start = new Date(startMs);
  const end = new Date(endMs);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  });
  const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

// The hour-of-day histogram is what makes the weekly review actionable: it turns
// "you had 34 urges" into "your urges cluster at 2pm", which maps to a setting.
function findPeakUrgeWindow(hourlyUrges, totalAttempts) {
  const hours = Array.isArray(hourlyUrges) ? hourlyUrges : [];
  if (!hours.length || !totalAttempts) {
    return null;
  }

  const WINDOW_HOURS = 3;
  let best = null;
  for (let startHour = 0; startHour <= 24 - WINDOW_HOURS; startHour++) {
    const count = hours
      .slice(startHour, startHour + WINDOW_HOURS)
      .reduce((sum, entry) => sum + (Number(entry.count) || 0), 0);
    if (!best || count > best.count) {
      best = { startHour, endHour: startHour + WINDOW_HOURS, count };
    }
  }

  if (!best || best.count < 3) {
    return null;
  }

  return {
    ...best,
    share: Math.round((best.count / totalAttempts) * 100)
  };
}

function getScheduleWindowMeta(settings) {
  const schedule = settings?.freeExperience?.schedule;
  if (!schedule || schedule.enabled !== true) {
    return { enabled: false };
  }
  return {
    enabled: true,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    startHour: parseHourFromTimeString(schedule.startTime, 9),
    endHour: parseHourFromTimeString(schedule.endTime, 17),
    days: Array.isArray(schedule.days) ? [...schedule.days] : []
  };
}

function parseHourFromTimeString(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) {
    return fallback;
  }
  return clamp(parseInt(match[1], 10), 0, 23);
}

function formatHourLabel(hour) {
  const normalized = ((Math.round(hour) % 24) + 24) % 24;
  const suffix = normalized < 12 ? 'am' : 'pm';
  const display = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${display}${suffix}`;
}

/**
 * One concrete change the user can apply from the weekly review.
 *
 * A schedule *narrows* blocking to its window, so an off schedule already means
 * round-the-clock protection — recommending "turn on a schedule" would quietly
 * reduce it. The schedule branch therefore only ever widens a window the user
 * already turned on.
 */
function buildWeeklyRecommendation({ settings, peakUrgeWindow, siteHoldRates, overrides }) {
  const schedule = getScheduleWindowMeta(settings);

  if (peakUrgeWindow && schedule.enabled) {
    const uncovered = peakUrgeWindow.startHour < schedule.startHour
      || peakUrgeWindow.endHour > schedule.endHour;
    if (uncovered) {
      const startHour = Math.min(schedule.startHour, peakUrgeWindow.startHour);
      const endHour = Math.max(schedule.endHour, peakUrgeWindow.endHour);
      return {
        id: 'extend-schedule',
        title: `Your urges peak at ${formatHourLabel(peakUrgeWindow.startHour)}–${formatHourLabel(peakUrgeWindow.endHour)}, outside your blocking hours.`,
        detail: `${peakUrgeWindow.count} of this week's attempts landed there, while your schedule only blocks ${formatHourLabel(schedule.startHour)}–${formatHourLabel(schedule.endHour)}.`,
        actionLabel: `Extend schedule to ${formatHourLabel(startHour)}–${formatHourLabel(endHour)}`,
        action: {
          type: 'extend-schedule',
          startTime: `${String(startHour).padStart(2, '0')}:00`,
          endTime: endHour >= 24 ? '23:59' : `${String(endHour).padStart(2, '0')}:00`
        }
      };
    }
  }

  const level = settings?.challengeTypes?.typing?.level;
  const leakiest = (siteHoldRates || [])
    .filter((entry) => entry.attempts >= 3)
    .sort((a, b) => a.holdRate - b.holdRate)[0];
  if (leakiest && leakiest.holdRate < 0.6 && level !== 'hard') {
    const nextLevel = level === 'easy' ? 'moderate' : 'hard';
    return {
      id: 'raise-challenge',
      title: `${leakiest.domain} gets through ${Math.round((1 - leakiest.holdRate) * 100)}% of the time.`,
      detail: `You opened it ${leakiest.attempts} times and the gate only held ${leakiest.held}. A longer challenge costs more to skip.`,
      actionLabel: `Raise entry difficulty to ${nextLevel}`,
      action: { type: 'challenge-level', level: nextLevel }
    };
  }

  const overrideDelay = Number(settings?.freeExperience?.manualOverrideDelaySeconds) || 0;
  if (overrides >= 5 && overrideDelay < 15) {
    return {
      id: 'raise-override-delay',
      title: `You skipped the challenge ${overrides} times this week.`,
      detail: `The override pause is ${overrideDelay} seconds. A longer wait gives the impulse time to pass.`,
      actionLabel: 'Raise override pause to 15 seconds',
      action: { type: 'override-delay', seconds: 15 }
    };
  }

  return null;
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

  const hourlyUrges = Array.from({ length: 24 }, (unused, hour) => ({ hour, count: 0 }));
  for (const event of blockedEvents) {
    hourlyUrges[new Date(event.timestamp).getHours()].count += 1;
  }

  // "Got through" is every gate crossing, however it was earned — an override
  // and a completed challenge both end with the site open.
  const throughByDomain = new Map();
  for (const event of windowEvents) {
    if (event.type !== 'override_triggered' && event.type !== 'access_granted') {
      continue;
    }
    const domain = normalizeDomain(event.domain) || 'unknown.com';
    throughByDomain.set(domain, (throughByDomain.get(domain) || 0) + 1);
  }

  const siteHoldRates = [...byDomain.entries()]
    .map(([domain, attempts]) => {
      const gotThrough = Math.min(attempts, throughByDomain.get(domain) || 0);
      const held = attempts - gotThrough;
      return { domain, attempts, gotThrough, held, holdRate: attempts > 0 ? held / attempts : 0 };
    })
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 5);

  return {
    blockedAttempts: blockedEvents.length,
    hourlyUrges,
    siteHoldRates,
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
    validateWelcomeDomain,
    getWelcomeState,
    saveWelcomeChange,
    sanitizeSettings,
    sanitizeTypingChallengeLevel,
    sanitizeCustomChallengePhrase,
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
    formatPeriodLabel,
    findPeakUrgeWindow,
    buildWeeklyRecommendation,
    formatHourLabel,
    getWeeklyFeedbackLine,
    hasProAccess,
    canUseIntentionPage,
    removeExpiredBlocks,
    removeExpiredTemporaryAccess,
    sanitizeCommitmentMode,
    sanitizeIntentionPage,
    isCommitmentModeActive,
    sanitizeTemptationBundle,
    sanitizeWorkTimer,
    sanitizePosthogSentEvents,
    sanitizePosthogProperties,
    isWithinReturnDayOneWindow,
    hasTrackedPosthogEvent,
    trackPosthogEventOnce,
    isBundleConditionMet,
    getEffectiveWorkMinutes,
    syncBundleUnlockAlarms,
    resolveCheckoutPlan,
    buildPricingUrl,
    sanitizeInstallation,
    sanitizeInstallCredential,
    sanitizeEntitlement,
    generateInstallCredential,
    syncEntitlement,
    BUNDLE_UNLOCK_ALARM_PREFIX,
    ENTITLEMENT_SYNC_ALARM
  };
}
