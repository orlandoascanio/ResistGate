import { describe, it, expect, beforeEach } from 'vitest';
import { createChromeMock, loadScriptInVm } from './helpers/vm-env.js';

describe('ResistGate background integration', () => {
  let env;

  beforeEach(async () => {
    env = createChromeMock();
    await loadScriptInVm('background.js', { chrome: env.chrome });
  });

  async function activateProForTest(targetEnv = env) {
    const response = await targetEnv.sendExternalMessage(
      { action: 'activateProFromWebsite' },
      { url: 'https://www.orlandoascanio.com/en/pricing' }
    );

    expect(response.success).toBe(true);
  }

  it('normalizes and saves free settings for blocklist/schedule', async () => {
    const settingsRes = await env.sendMessage({ action: 'getSettings' });
    expect(settingsRes.success).toBe(true);

    const next = settingsRes.settings;
    next.blocklist = [
      { id: '1', urlPattern: 'HTTPS://WWW.YouTube.com/' },
      { id: '2', urlPattern: 'youtube.com' },
      { id: '3', urlPattern: '*.reddit.com/' }
    ];
    next.freeExperience.schedule = {
      enabled: true,
      days: [1, 2, 6],
      startTime: '08:30',
      endTime: '18:00'
    };

    const updateRes = await env.sendMessage({ action: 'updateSettings', settings: next });
    expect(updateRes.success).toBe(true);

    const saved = await env.sendMessage({ action: 'getSettings' });
    expect(saved.settings.blocklist.map((entry) => entry.urlPattern)).toEqual([
      'www.youtube.com',
      'youtube.com',
      'reddit.com'
    ]);
    expect(saved.settings.freeExperience.schedule.enabled).toBe(true);
    expect(saved.settings.freeExperience.schedule.days).toEqual([1, 2, 6]);
  });

  it('opens pricing page via message handler', async () => {
    const response = await env.sendMessage({ action: 'openPricingPage' });
    expect(response.success).toBe(true);
    expect(response.url).toContain('https://www.orlandoascanio.com/en/pricing');
    expect(response.url).toContain('source=extension');
    expect(env.createdTabs).toHaveLength(1);
    expect(env.createdTabs[0].url).toContain('https://www.orlandoascanio.com/en/pricing');
  });

  it('opens feedback page via message handler', async () => {
    const response = await env.sendMessage({
      action: 'openFeedbackPage',
      surface: 'extension_popup'
    });

    expect(response.success).toBe(true);
    expect(response.url).toContain('https://www.orlandoascanio.com/en/resistgate/feedback');
    expect(response.url).toContain('source=extension_popup');
    expect(env.createdTabs.at(-1).url).toBe(response.url);
  });

  it('activates Pro automatically from a trusted website message', async () => {
    const activationEnv = createChromeMock();
    await loadScriptInVm('background.js', {
      chrome: activationEnv.chrome
    });

    const response = await activationEnv.sendExternalMessage(
      { action: 'activateProFromWebsite' },
      { url: 'https://www.orlandoascanio.com/en/pricing' }
    );

    expect(response.success).toBe(true);
    expect(response.subscription.tier).toBe('pro');
    expect(activationEnv.storageData.settings.subscription.tier).toBe('pro');
    expect(activationEnv.createdTabs.at(-1).url).toContain('options/options.html?activation=success');
  });

  it('enforces strict mode lock during active schedule', async () => {
    await activateProForTest();

    const initial = (await env.sendMessage({ action: 'getSettings' })).settings;
    initial.proFeatures.strictModeEnabled = true;
    initial.freeExperience.schedule = {
      enabled: true,
      days: [new Date().getDay()],
      startTime: '00:00',
      endTime: '00:00'
    };

    const enableRes = await env.sendMessage({ action: 'updateSettings', settings: initial });
    expect(enableRes.success).toBe(true);

    const lockedUpdate = JSON.parse(JSON.stringify(initial));
    lockedUpdate.defaultAccessDuration = 25;

    const lockedRes = await env.sendMessage({ action: 'updateSettings', settings: lockedUpdate });
    expect(lockedRes.success).toBe(false);
    expect(lockedRes.error).toContain('Strict Mode is active');
  });

  it('applies strict mode disable cooldown before turning off', async () => {
    await activateProForTest();

    const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
    settings.proFeatures.strictModeEnabled = true;
    settings.proFeatures.strictModeDisableDelaySeconds = 30;
    settings.freeExperience.schedule.enabled = false;

    // We shouldn't assert success here since turning it on when it's disabled now starts locking right away
    await env.sendMessage({ action: 'updateSettings', settings });

    const firstAttempt = JSON.parse(JSON.stringify(settings));
    firstAttempt.proFeatures.strictModeEnabled = false;

    const pending = await env.sendMessage({ action: 'updateSettings', settings: firstAttempt });
    expect(pending.success).toBe(false);
    expect(pending.cooldownPending).toBe(true);

    env.storageData.settings.proFeatures.strictModeDisableRequestedAt = Date.now() - 31_000;

    const confirmDisable = (await env.sendMessage({ action: 'getSettings' })).settings;
    confirmDisable.proFeatures.strictModeEnabled = false;
    expect((await env.sendMessage({ action: 'updateSettings', settings: confirmDisable })).success).toBe(true);

    const finalSettings = (await env.sendMessage({ action: 'getSettings' })).settings;
    expect(finalSettings.proFeatures.strictModeEnabled).toBe(false);
  });

  it('enforces override cooldown policy and lock windows', async () => {
    await activateProForTest();

    const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
    settings.blocklist = [{ id: 'x1', urlPattern: 'reddit.com', createdAt: Date.now() }];
    settings.freeExperience.schedule.enabled = false;
    settings.proFeatures.overrideCooldown = {
      enabled: true,
      thresholdCount: 2,
      windowHours: 24,
      delayStepSeconds: 10,
      maxDelaySeconds: 90,
      lockMinutes: 30
    };

    expect((await env.sendMessage({ action: 'updateSettings', settings })).success).toBe(true);

    const status1 = await env.sendMessage({ action: 'getManualOverrideStatus' });
    expect(status1.status.requiredDelaySeconds).toBe(12);

    const firstOverride = await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'reddit.com',
      duration: 10,
      meta: { method: 'manualOverride', waitedSeconds: 12 }
    });
    expect(firstOverride.success).toBe(true);

    const status2 = await env.sendMessage({ action: 'getManualOverrideStatus' });
    expect(status2.status.requiredDelaySeconds).toBe(22);

    const tooFast = await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'reddit.com',
      duration: 10,
      meta: { method: 'manualOverride', waitedSeconds: 12 }
    });
    expect(tooFast.success).toBe(false);
    expect(tooFast.error).toContain('requires a 22s delay');

    const secondOverride = await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'reddit.com',
      duration: 10,
      meta: { method: 'manualOverride', waitedSeconds: 22 }
    });
    expect(secondOverride.success).toBe(true);

    const thirdOverride = await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'reddit.com',
      duration: 10,
      meta: { method: 'manualOverride', waitedSeconds: 32 }
    });
    expect(thirdOverride.success).toBe(true);

    const lockedStatus = await env.sendMessage({ action: 'getManualOverrideStatus' });
    expect(lockedStatus.status.locked).toBe(true);
  });

  it('enforces earn-access rule for manual override and minimum challenge time', async () => {
    await activateProForTest();

    const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
    settings.blocklist = [{ id: 'x2', urlPattern: 'youtube.com', createdAt: Date.now() }];
    settings.proFeatures.behavioralFriction.enabled = true;
    settings.proFeatures.behavioralFriction.earnAccessEnabled = true;
    settings.proFeatures.behavioralFriction.earnAccessMinChallengeSeconds = 120;
    settings.freeExperience.schedule.enabled = false;

    expect((await env.sendMessage({ action: 'updateSettings', settings })).success).toBe(true);

    const manualDenied = await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'youtube.com',
      duration: 10,
      meta: { method: 'manualOverride', waitedSeconds: 12 }
    });
    expect(manualDenied.success).toBe(false);
    expect(manualDenied.error).toContain('Earn-Access is active');

    const shortChallenge = await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'youtube.com',
      duration: 10,
      timeSpent: 90,
      meta: { method: 'challenge' }
    });
    expect(shortChallenge.success).toBe(false);
    expect(shortChallenge.error).toContain('requires at least 120s');

    const validChallenge = await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'youtube.com',
      duration: 10,
      timeSpent: 130,
      meta: { method: 'challenge' }
    });
    expect(validChallenge.success).toBe(true);
  });

  it('generates weekly report with correct score formula and trend', async () => {
    await activateProForTest();

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    env.storageData.analytics = {
      events: [
        { type: 'override_triggered', timestamp: now - dayMs, domain: 'example.com' },
        { type: 'override_triggered', timestamp: now - (2 * dayMs), domain: 'example.com' },
        { type: 'manual_disable', timestamp: now - (3 * dayMs), domain: 'settings' },
        { type: 'blocked_visit', timestamp: now - dayMs, domain: 'youtube.com' },
        { type: 'blocked_visit', timestamp: now - dayMs, domain: 'youtube.com' },
        { type: 'blocked_visit', timestamp: now - dayMs, domain: 'reddit.com' },
        { type: 'override_triggered', timestamp: now - (8 * dayMs), domain: 'example.com' }
      ]
    };

    const reportRes = await env.sendMessage({ action: 'getWeeklyReport' });
    expect(reportRes.success).toBe(true);
    expect(reportRes.report.focusScore).toBe(80);
    expect(reportRes.report.overridesThisWeek).toBe(2);
    expect(reportRes.report.topDistractionDomains[0].domain).toBe('youtube.com');
    expect(reportRes.report.feedbackLine.length).toBeGreaterThan(0);
  });

  it('activates and enforces commitment mode lockout', async () => {
    await activateProForTest();

    const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
    settingsObj.blocklist = [{ id: 'c1', urlPattern: 'reddit.com', createdAt: Date.now() }];
    await env.sendMessage({ action: 'updateSettings', settings: settingsObj });

    // Activate commitment mode for 2 hours
    const activateRes = await env.sendMessage({ action: 'activateCommitmentMode', durationHours: 2 });
    expect(activateRes.success).toBe(true);
    expect(activateRes.expiresAt).toBeGreaterThan(Date.now());

    // Status should report active
    const statusRes = await env.sendMessage({ action: 'getCommitmentModeStatus' });
    expect(statusRes.success).toBe(true);
    expect(statusRes.status.active).toBe(true);
    expect(statusRes.status.remainingSeconds).toBeGreaterThan(0);

    // Double activation should fail
    const doubleActivate = await env.sendMessage({ action: 'activateCommitmentMode', durationHours: 1 });
    expect(doubleActivate.success).toBe(false);

    // Manual override should be blocked
    const overrideBlocked = await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'reddit.com',
      duration: 10,
      meta: { method: 'manualOverride', waitedSeconds: 15 }
    });
    expect(overrideBlocked.success).toBe(false);
    expect(overrideBlocked.error).toContain('Commitment Mode');

    // Challenge should also be blocked
    const challengeBlocked = await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'reddit.com',
      duration: 10,
      timeSpent: 200,
      meta: { method: 'challenge' }
    });
    expect(challengeBlocked.success).toBe(false);
    expect(challengeBlocked.error).toContain('Commitment Mode');

    // Settings changes should be blocked
    const settingsBlocked = await env.sendMessage({
      action: 'updateSettings',
      settings: { ...settingsObj, defaultAccessDuration: 30 }
    });
    expect(settingsBlocked.success).toBe(false);
    expect(settingsBlocked.error).toContain('Commitment Mode');

    // Deactivation should be refused
    const deactivate = await env.sendMessage({ action: 'deactivateCommitmentMode' });
    expect(deactivate.success).toBe(false);
    expect(deactivate.error).toContain('cannot be deactivated early');
  });

  it('requires Pro for commitment mode activation', async () => {
    const res = await env.sendMessage({ action: 'activateCommitmentMode', durationHours: 2 });
    expect(res.success).toBe(false);
    expect(res.proRequired).toBe(true);
  });

  it('does not allow updateSettings to self-upgrade to Pro', async () => {
    const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
    settings.subscription = { tier: 'pro' };
    settings.proFeatures.strictModeEnabled = true;

    const updateRes = await env.sendMessage({ action: 'updateSettings', settings });
    expect(updateRes.success).toBe(true);

    const saved = (await env.sendMessage({ action: 'getSettings' })).settings;
    expect(saved.subscription.tier).toBe('free');
    expect(saved.proFeatures.strictModeEnabled).toBe(false);

    const dashboardRes = await env.sendMessage({ action: 'getAnalyticsDashboard' });
    expect(dashboardRes.success).toBe(false);
    expect(dashboardRes.proRequired).toBe(true);
  });

  it('captures the PostHog funnel milestones exactly once', async () => {
    const posthogCalls = [];
    const fetchMock = async (url, init = {}) => {
      posthogCalls.push({
        url,
        body: init.body ? JSON.parse(init.body) : null
      });

      return {
        status: 200,
        headers: {
          get: () => null
        }
      };
    };

    const posthogEnv = createChromeMock();
    posthogEnv.storageData.installation = {
      deviceId: 'device-test-123',
      firstSeenAt: Date.now() - (25 * 60 * 60 * 1000),
      posthogSentEvents: {}
    };

    const context = await loadScriptInVm('background.js', {
      chrome: posthogEnv.chrome,
      fetch: fetchMock,
      __RESISTGATE_POSTHOG_API_KEY__: 'phc_test_key',
      __RESISTGATE_POSTHOG_HOST__: 'https://us.i.posthog.com'
    });

    const posthogHooks = context.__RESISTGATE_TEST_HOOKS__;
    expect(posthogCalls[0].body.event).toBe('return_day_1');

    await posthogEnv.sendMessage({
      action: 'recordAnalyticsEvent',
      type: 'onboarding_start',
      domain: 'welcome'
    });

    let settings = (await posthogEnv.sendMessage({ action: 'getSettings' })).settings;
    settings.blocklist = [
      { id: '1', urlPattern: 'youtube.com', createdAt: Date.now() },
      { id: '2', urlPattern: 'reddit.com', createdAt: Date.now() },
      { id: '3', urlPattern: 'x.com', createdAt: Date.now() }
    ];
    await posthogEnv.sendMessage({ action: 'updateSettings', settings });

    await posthogEnv.sendMessage({ action: 'recordBlockedVisit', urlPattern: 'youtube.com' });
    await posthogEnv.sendMessage({ action: 'recordBlockedVisit', urlPattern: 'youtube.com' });

    await posthogEnv.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'youtube.com',
      duration: 10,
      meta: { method: 'challenge', waitedSeconds: 12 }
    });

    await posthogHooks.trackPosthogEventOnce('install', {
      installReason: 'install'
    });
    await posthogHooks.trackPosthogEventOnce('install', {
      installReason: 'install'
    });

    const eventNames = posthogCalls.map((entry) => entry.body.event);
    expect(eventNames).toContain('return_day_1');
    expect(eventNames).toContain('onboarding_start');
    expect(eventNames).toContain('blocklist_created');
    expect(eventNames).toContain('first_block_hit');
    expect(eventNames).toContain('access_granted');
    expect(eventNames).toContain('install');

    expect(eventNames.filter((event) => event === 'install')).toHaveLength(1);
    expect(eventNames.filter((event) => event === 'first_block_hit')).toHaveLength(1);

    const onboardingCall = posthogCalls.find((entry) => entry.body.event === 'onboarding_start');
    expect(onboardingCall.body.properties.surface).toBe('welcome');

    const accessCall = posthogCalls.find((entry) => entry.body.event === 'access_granted');
    expect(accessCall.body.properties.domain).toBe('youtube.com');
  });
});
