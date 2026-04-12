import { describe, it, expect, beforeEach } from 'vitest';
import { createChromeMock, loadScriptInVm } from './helpers/vm-env.js';

describe('ResistGate background integration', () => {
  let env;

  beforeEach(async () => {
    env = createChromeMock();
    await loadScriptInVm('background.js', { chrome: env.chrome });
  });

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

  it('opens pricing with the ResistGate product slug in checkout params', async () => {
    const response = await env.sendMessage({ action: 'openPricingPage' });
    expect(response.success).toBe(true);
    expect(response.url).toContain('https://www.orlandoascanio.com/en/pricing');
    expect(response.url).toContain('productSlug=resistgate');
    expect(env.createdTabs).toHaveLength(1);
    expect(env.createdTabs[0].url).toContain('https://www.orlandoascanio.com/en/pricing');
    expect(env.createdTabs[0].url).toContain('productSlug=resistgate');
    expect(env.createdTabs[0].url).toContain('source=extension');
  });

  it('activates Pro automatically from a trusted website message', async () => {
    const activationFetch = async (url, init) => {
      expect(url).toBe('https://www.orlandoascanio.com/api/entitlement/activate-install');
      expect(init?.method).toBe('POST');

      const body = JSON.parse(init.body);
      expect(body.activationToken).toBe('signed-activation-token');
      expect(typeof body.deviceId).toBe('string');
      expect(body.deviceId.length).toBeGreaterThan(0);

      return {
        ok: true,
        json: async () => ({
          pro: true,
          productSlug: 'resistgate',
          billingCycle: 'yearly',
          email: 'pro@example.com',
          subscriptionStatus: 'ACTIVE',
          installToken: 'install-token-123'
        })
      };
    };

    const activationEnv = createChromeMock();
    await loadScriptInVm('background.js', {
      chrome: activationEnv.chrome,
      fetch: activationFetch
    });

    const response = await activationEnv.sendExternalMessage(
      { action: 'activateProFromWebsite', activationToken: 'signed-activation-token' },
      { url: 'https://www.orlandoascanio.com/en/pricing' }
    );

    expect(response.success).toBe(true);
    expect(response.subscription.tier).toBe('pro');
    expect(response.subscription.billingCycle).toBe('yearly');
    expect(response.subscription.email).toBe('pro@example.com');
    expect(response.subscription.installToken).toBe('install-token-123');
    expect(activationEnv.storageData.settings.subscription.tier).toBe('pro');
    expect(activationEnv.createdTabs.at(-1).url).toContain('options/options.html?activation=success');
  });

  it('enforces strict mode lock during active schedule', async () => {
    const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
    settingsObj.subscription = { tier: 'pro', expiresAt: Date.now() + 100000 };
    await env.sendMessage({ action: 'updateSettings', settings: settingsObj });

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
    const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
    settingsObj.subscription = { tier: 'pro', expiresAt: Date.now() + 100000 };
    await env.sendMessage({ action: 'updateSettings', settings: settingsObj });

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
    // Inject mock valid license
    const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
    settingsObj.subscription = { tier: 'pro', expiresAt: Date.now() + 100000 };
    await env.sendMessage({ action: 'updateSettings', settings: settingsObj });

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
    const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
    settingsObj.subscription = { tier: 'pro', expiresAt: Date.now() + 100000 };
    await env.sendMessage({ action: 'updateSettings', settings: settingsObj });

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
    const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
    settingsObj.subscription = { tier: 'pro', expiresAt: Date.now() + 100000 };
    await env.sendMessage({ action: 'updateSettings', settings: settingsObj });

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
    const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
    settingsObj.subscription = { tier: 'pro', expiresAt: Date.now() + 100000 };
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
});
