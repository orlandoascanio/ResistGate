import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBillingApiMock,
  createChromeMock,
  loadScriptInVm,
  purchaseProInTest
} from './helpers/vm-env.js';

describe('ResistGate background integration', () => {
  let env;
  let api;

  beforeEach(async () => {
    env = createChromeMock();
    api = createBillingApiMock();
    await loadScriptInVm('background.js', { chrome: env.chrome, fetch: api.fetch });
  });

  async function activateProForTest(targetEnv = env, targetApi = api) {
    const { activation } = await purchaseProInTest(targetEnv, targetApi);
    expect(activation.success).toBe(true);
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

  it('opens pricing with an opaque checkout id and no device identifiers', async () => {
    const response = await env.sendMessage({ action: 'openPricingPage', plan: 'monthly' });
    expect(response.success).toBe(true);
    expect(response.plan).toBe('monthly');

    const url = new URL(response.url);
    expect(url.origin + url.pathname).toBe('https://www.orlandoascanio.com/en/pricing');
    expect(url.searchParams.get('source')).toBe('extension');
    expect(url.searchParams.get('plan')).toBe('monthly');
    expect(url.searchParams.get('checkout')).toBe(api.latestCheckoutId());

    const installation = env.storageData.installation;
    expect(response.url).not.toContain(installation.deviceId);
    expect(response.url).not.toContain(installation.installCredential);
    expect(response.url).not.toContain(env.chrome.runtime.id);
    expect(env.createdTabs.at(-1).url).toBe(response.url);
  });

  it('binds each checkout session to the validated plan and defaults generic upgrades to yearly', async () => {
    for (const plan of ['monthly', 'yearly', 'lifetime']) {
      const response = await env.sendMessage({ action: 'openPricingPage', plan });
      expect(response.success).toBe(true);
      expect(api.sessions.get(response.checkoutId).plan).toBe(plan);
    }

    const generic = await env.sendMessage({ action: 'openPricingPage' });
    expect(generic.success).toBe(true);
    expect(api.sessions.get(generic.checkoutId).plan).toBe('yearly');
  });

  it('refuses unsupported plans without opening checkout', async () => {
    const response = await env.sendMessage({ action: 'openPricingPage', plan: 'weekly' });
    expect(response.success).toBe(false);
    expect(response.retryable).toBe(false);
    expect(api.calls).toHaveLength(0);
    expect(env.createdTabs).toHaveLength(0);
  });

  it('does not open checkout when the session cannot be created', async () => {
    api.override(api.endpoints.checkout, 'network-error');

    const response = await env.sendMessage({ action: 'openPricingPage', plan: 'yearly' });
    expect(response.success).toBe(false);
    expect(response.retryable).toBe(true);
    expect(env.createdTabs).toHaveLength(0);
  });

  it('sends the install credential to the checkout API but never stores it in the URL', async () => {
    await env.sendMessage({ action: 'openPricingPage', plan: 'lifetime' });

    const checkoutCall = api.calls.find((call) => call.url === api.endpoints.checkout);
    expect(checkoutCall.body.installCredential).toMatch(/^[0-9a-f]{64}$/);
    expect(checkoutCall.body.extensionId).toBe(env.chrome.runtime.id);
    expect(checkoutCall.body.deviceId).toBe(env.storageData.installation.deviceId);
    expect(env.storageData.installation.installCredential).toBe(checkoutCall.body.installCredential);
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

  it('activates Pro after the server verifies the activation token', async () => {
    const { activation } = await purchaseProInTest(env, api, 'lifetime');

    expect(activation.success).toBe(true);
    expect(activation.subscription.tier).toBe('pro');
    expect(activation.plan).toBe('lifetime');
    expect(env.storageData.settings.subscription.tier).toBe('pro');
    expect(env.storageData.installation.entitlement).toMatchObject({
      pro: true,
      plan: 'lifetime',
      status: 'active'
    });
    expect(env.createdTabs.at(-1).url).toContain('options/options.html?activation=success');

    const activationCall = api.calls.find((call) => call.url === api.endpoints.activate);
    expect(activationCall.body.extensionId).toBe(env.chrome.runtime.id);
    expect(activationCall.body.installCredential).toBe(env.storageData.installation.installCredential);
  });

  it('rejects an external activation with no token', async () => {
    await env.sendMessage({ action: 'openPricingPage', plan: 'yearly' });

    const response = await env.sendExternalMessage(
      { action: 'activateProFromWebsite' },
      { url: 'https://www.orlandoascanio.com/en/pricing' }
    );

    expect(response.success).toBe(false);
    expect(response.error).toContain('Missing activation token');
    expect(env.storageData.settings.subscription.tier).toBe('free');
    expect(api.calls.some((call) => call.url === api.endpoints.activate)).toBe(false);
  });

  it('rejects an external activation from an untrusted origin', async () => {
    const { checkout } = { checkout: await env.sendMessage({ action: 'openPricingPage', plan: 'yearly' }) };
    const activationToken = api.issueActivationToken(checkout.checkoutId);

    const response = await env.sendExternalMessage(
      { action: 'activateProFromWebsite', activationToken },
      { url: 'https://evil.example.com/pricing' }
    );

    expect(response.success).toBe(false);
    expect(env.storageData.settings.subscription.tier).toBe('free');
  });

  it('cannot grant Pro when the server rejects the exchange', async () => {
    await env.sendMessage({ action: 'openPricingPage', plan: 'yearly' });

    const response = await env.sendExternalMessage(
      { action: 'activateProFromWebsite', activationToken: 'forged-token' },
      { url: 'https://www.orlandoascanio.com/en/pricing' }
    );

    expect(response.success).toBe(false);
    expect(env.storageData.settings.subscription.tier).toBe('free');
    expect(env.storageData.installation.entitlement).toBeNull();
  });

  it('cannot activate a token minted for another installation', async () => {
    const otherEnv = createChromeMock();
    await loadScriptInVm('background.js', { chrome: otherEnv.chrome, fetch: api.fetch });
    const otherCheckout = await otherEnv.sendMessage({ action: 'openPricingPage', plan: 'yearly' });
    const otherToken = api.issueActivationToken(otherCheckout.checkoutId);

    await env.sendMessage({ action: 'openPricingPage', plan: 'yearly' });
    const response = await env.sendExternalMessage(
      { action: 'activateProFromWebsite', activationToken: otherToken },
      { url: 'https://www.orlandoascanio.com/en/pricing' }
    );

    expect(response.success).toBe(false);
    expect(env.storageData.settings.subscription.tier).toBe('free');
  });

  it('replaying a valid activation token is idempotent', async () => {
    const { activationToken } = await purchaseProInTest(env, api, 'yearly');
    const credential = env.storageData.installation.installCredential;

    const replay = await env.sendExternalMessage(
      { action: 'activateProFromWebsite', activationToken },
      { url: 'https://www.orlandoascanio.com/en/pricing' }
    );

    expect(replay.success).toBe(true);
    expect(env.storageData.settings.subscription.tier).toBe('pro');
    expect(env.storageData.installation.installCredential).toBe(credential);
  });

  it('revokes Pro when a forced sync reports a verified inactive grant', async () => {
    await activateProForTest();

    api.setGrant({ pro: false, status: 'canceled' });
    const response = await env.sendMessage({ action: 'refreshEntitlement' });

    expect(response.success).toBe(true);
    expect(response.pro).toBe(false);
    expect(response.changed).toBe(true);
    expect(env.storageData.settings.subscription.tier).toBe('free');
  });

  it('preserves Pro when a sync fails transiently', async () => {
    await activateProForTest();

    api.override(api.endpoints.status, 'network-error');
    const response = await env.sendMessage({ action: 'refreshEntitlement' });

    expect(response.success).toBe(false);
    expect(response.retryable).toBe(true);
    expect(env.storageData.settings.subscription.tier).toBe('pro');
    expect(env.storageData.installation.entitlement.pro).toBe(true);
  });

  it('keeps Pro through a transient failure until the grace period runs out', async () => {
    await activateProForTest();

    // Age the last verified check past the 72-hour ceiling, then fail every sync. This is the
    // "server unreachable indefinitely" case: without a bound, Pro would persist forever.
    env.storageData.installation.entitlement.checkedAt = Date.now() - (73 * 60 * 60 * 1000);
    api.override(api.endpoints.status, 'network-error');

    const response = await env.sendMessage({ action: 'refreshEntitlement' });

    expect(response.success).toBe(false);
    expect(env.storageData.settings.subscription.tier).toBe('free');
    expect(env.storageData.installation.entitlement.stale).toBe(true);

    // Expiry withdraws access but not the ability to recover: the credential survives, so
    // getting back online restores Pro without a second payment.
    expect(env.storageData.installation.installCredential).toBeTruthy();
  });

  it('restores Pro after grace expiry once the server is reachable again', async () => {
    await activateProForTest();

    env.storageData.installation.entitlement.checkedAt = Date.now() - (73 * 60 * 60 * 1000);
    api.override(api.endpoints.status, 'network-error');
    await env.sendMessage({ action: 'refreshEntitlement' });
    expect(env.storageData.settings.subscription.tier).toBe('free');

    api.override(api.endpoints.status, null);
    const response = await env.sendMessage({ action: 'refreshEntitlement' });

    expect(response.success).toBe(true);
    expect(env.storageData.settings.subscription.tier).toBe('pro');
    expect(env.storageData.installation.entitlement.stale).toBe(false);
  });

  it('drops Pro but keeps the install credential when the server rejects it', async () => {
    await activateProForTest();
    const credential = env.storageData.installation.installCredential;

    api.override(api.endpoints.status, { status: 403, body: { error: 'Unknown install credential' } });
    const response = await env.sendMessage({ action: 'refreshEntitlement' });

    expect(response.success).toBe(false);
    expect(env.storageData.settings.subscription.tier).toBe('free');
    expect(env.storageData.installation.entitlement).toBeNull();

    // The credential is this browser's only handle back to its own purchase. A 403 revokes
    // access, but destroying the credential would make the revocation permanent and
    // unrecoverable — including for a Lifetime buyer hit by a single bad response.
    expect(env.storageData.installation.installCredential).toBe(credential);
  });

  it('restores Pro on a later successful sync after a rejection', async () => {
    await activateProForTest();

    api.override(api.endpoints.status, { status: 403, body: { error: 'Unknown install credential' } });
    await env.sendMessage({ action: 'refreshEntitlement' });
    expect(env.storageData.settings.subscription.tier).toBe('free');

    // The server recognizes the install again. Because the credential survived, recovery needs
    // no action from the user and no second payment.
    api.override(api.endpoints.status, null);
    const response = await env.sendMessage({ action: 'refreshEntitlement' });

    expect(response.success).toBe(true);
    expect(env.storageData.settings.subscription.tier).toBe('pro');
  });

  it('does not sync entitlement for an install that never started checkout', async () => {
    const response = await env.sendMessage({ action: 'refreshEntitlement' });

    expect(response.success).toBe(false);
    expect(api.calls.some((call) => call.url === api.endpoints.status)).toBe(false);
  });

  it('syncs entitlement on the six-hour alarm', async () => {
    await activateProForTest();
    api.setGrant({ pro: false, status: 'paused' });

    await env.triggerAlarm({ name: 'resistgate-entitlement-sync' });

    expect(env.storageData.settings.subscription.tier).toBe('free');
  });

  it('reports billing state to the options page without leaking secrets', async () => {
    await activateProForTest();

    const response = await env.sendMessage({ action: 'getBillingState' });
    expect(response.success).toBe(true);
    expect(response.state).toMatchObject({ pro: true, plan: 'yearly', hasCheckout: true });
    expect(JSON.stringify(response.state)).not.toContain(env.storageData.installation.installCredential);
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
