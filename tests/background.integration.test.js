import { describe, it, expect, beforeEach } from 'vitest';
import { createChromeMock, loadScriptInVm } from './helpers/vm-env.js';

describe('ResistGate background integration', () => {
  let env;
  let fetchCalls;
  let hooks;

  // ResistGate makes no network requests. Any call to fetch is recorded so tests can prove it.
  function recordingFetch(calls) {
    return async (url, init) => {
      calls.push({ url, init });
      throw new Error(`Unexpected network request: ${url}`);
    };
  }

  beforeEach(async () => {
    env = createChromeMock();
    fetchCalls = [];
    const context = await loadScriptInVm('background.js', { chrome: env.chrome, fetch: recordingFetch(fetchCalls) });
    hooks = context.__RESISTGATE_TEST_HOOKS__;
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

  it('summarizes today\'s blocked attempts', async () => {
    const empty = await env.sendMessage({ action: 'getTodaySummary' });
    expect(empty.success).toBe(true);
    expect(empty.summary.blockedToday).toBe(0);
    expect(empty.summary.topDomains).toEqual([]);

    await env.sendMessage({ action: 'recordBlockedVisit', urlPattern: 'youtube.com' });
    await env.sendMessage({ action: 'recordBlockedVisit', urlPattern: 'reddit.com' });
    await env.sendMessage({ action: 'recordBlockedVisit', urlPattern: 'youtube.com' });

    const response = await env.sendMessage({ action: 'getTodaySummary' });
    expect(response.success).toBe(true);
    expect(response.summary.blockedToday).toBe(3);
    expect(response.summary.topDomains[0]).toEqual({ domain: 'youtube.com', count: 2 });
    expect(response.summary.topDomains[1]).toEqual({ domain: 'reddit.com', count: 1 });
  });

  it('returns today\'s resistance count for one domain', async () => {
    await env.sendMessage({ action: 'recordBlockedVisit', urlPattern: 'reddit.com' });
    await env.sendMessage({ action: 'recordBlockedVisit', urlPattern: 'reddit.com' });

    const count = await env.sendMessage({ action: 'getResistanceCount', domain: 'reddit.com' });
    const other = await env.sendMessage({ action: 'getResistanceCount', domain: 'youtube.com' });

    expect(count).toEqual({ success: true, count: 2 });
    expect(other).toEqual({ success: true, count: 0 });
  });

  it('turns the last grant for a domain into a resisted visit', async () => {
    const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
    settings.blocklist = [{ id: 'r1', urlPattern: 'reddit.com', createdAt: Date.now() }];
    expect((await env.sendMessage({ action: 'updateSettings', settings })).success).toBe(true);

    const granted = await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'reddit.com',
      duration: 5,
      meta: { method: 'challenge' }
    });
    expect(granted.success).toBe(true);

    const reversed = await env.sendMessage({
      action: 'recordGateOutcome',
      domain: 'reddit.com',
      reversesAccess: true
    });
    expect(reversed.success).toBe(true);
    expect(reversed.summary).toEqual({ total: 1, resisted: 1 });

    const summary = await env.sendMessage({ action: 'getGateOutcomeSummary' });
    expect(summary).toEqual({ success: true, summary: { total: 1, resisted: 1 } });
  });

  it('reopens a blocked destination ten minutes after the user leaves the gate', async () => {
    const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
    settings.blocklist = [{ id: 'r1', urlPattern: 'reddit.com', createdAt: Date.now() }];
    expect((await env.sendMessage({ action: 'updateSettings', settings })).success).toBe(true);

    const reminder = await env.sendMessage({
      action: 'scheduleGateReminder',
      originalUrl: 'https://www.reddit.com/r/all'
    });
    expect(reminder.success).toBe(true);
    expect(reminder.reminder.domain).toBe('reddit.com');

    await env.triggerAlarm({ name: 'resistgate-gate-reminder-reddit.com' });
    expect(env.createdTabs.at(-1).url).toBe('https://www.reddit.com/r/all');
  });

  it('saves work timer minutes when a session stops', async () => {
    const started = await env.sendMessage({ action: 'startWorkTimer' });
    expect(started.success).toBe(true);
    expect(started.state.running).toBe(true);

    const stopped = await env.sendMessage({ action: 'stopWorkTimer' });
    expect(stopped.success).toBe(true);
    expect(stopped.state.running).toBe(false);
    expect(stopped.state.todayMinutes).toBeGreaterThanOrEqual(0);
  });

  it('drops the old paid tier from an imported settings object', async () => {
    const current = await env.sendMessage({ action: 'getSettings' });
    const imported = {
      ...current.settings,
      subscription: { tier: 'pro' },
      blocklist: [{ id: 'a', urlPattern: 'x.com' }]
    };

    const response = await env.sendMessage({ action: 'updateSettings', settings: imported });
    expect(response.success).toBe(true);

    const saved = await env.sendMessage({ action: 'getSettings' });
    expect(saved.settings).not.toHaveProperty('subscription');
    expect(saved.settings.blocklist.map((entry) => entry.urlPattern)).toEqual(['x.com']);
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

  it('opens the Chrome Web Store review page via message handler', async () => {
    const response = await env.sendMessage({ action: 'openReviewPage' });

    expect(response.success).toBe(true);
    expect(response.url).toBe(`https://chromewebstore.google.com/detail/${env.chrome.runtime.id}/reviews`);
    expect(env.createdTabs.at(-1).url).toBe(response.url);
  });

  it('unlocks every former Pro feature without a purchase', async () => {
    const dashboard = await env.sendMessage({ action: 'getAnalyticsDashboard' });
    expect(dashboard.success).toBe(true);

    const report = await env.sendMessage({ action: 'getWeeklyReport' });
    expect(report.success).toBe(true);

    const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
    expect(settings).not.toHaveProperty('subscription');
    settings.proFeatures.strictModeEnabled = true;
    settings.proFeatures.customChallengePhrase = { enabled: true, text: 'This can wait.' };
    expect((await env.sendMessage({ action: 'updateSettings', settings })).success).toBe(true);

    const saved = (await env.sendMessage({ action: 'getSettings' })).settings;
    expect(saved.proFeatures.strictModeEnabled).toBe(true);
    expect(saved.proFeatures.customChallengePhrase.text).toBe('This can wait.');

    const commitment = await env.sendMessage({ action: 'activateCommitmentMode', durationHours: 1 });
    expect(commitment.success).toBe(true);
  });

  it('records local analytics for every install', async () => {
    const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
    settings.blocklist = [{ id: 'a1', urlPattern: 'youtube.com', createdAt: Date.now() }];
    await env.sendMessage({ action: 'updateSettings', settings });

    await env.sendMessage({ action: 'recordBlockedVisit', urlPattern: 'youtube.com' });
    await env.sendMessage({ action: 'recordAnalyticsEvent', type: 'challenge_completed', domain: 'youtube.com' });

    const types = env.storageData.analytics.events.map((event) => event.type);
    expect(types).toEqual(['blocked_visit', 'challenge_completed']);

    const dashboard = await env.sendMessage({ action: 'getAnalyticsDashboard' });
    expect(dashboard.dashboard.totals.blockedAttempts).toBe(1);
  });

  it('makes no network requests across a full session', async () => {
    await env.triggerInstalled({ reason: 'install' });

    const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
    settings.blocklist = [
      { id: 'n1', urlPattern: 'reddit.com', createdAt: Date.now() },
      { id: 'n2', urlPattern: 'youtube.com', createdAt: Date.now() },
      { id: 'n3', urlPattern: 'x.com', createdAt: Date.now() }
    ];
    await env.sendMessage({ action: 'updateSettings', settings });
    await env.sendMessage({ action: 'recordBlockedVisit', urlPattern: 'reddit.com' });
    await env.sendMessage({ action: 'recordAnalyticsEvent', type: 'challenge_completed', domain: 'reddit.com' });
    await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'reddit.com',
      duration: 5,
      timeSpent: 30,
      meta: { method: 'challenge' }
    });
    await env.sendMessage({ action: 'getAnalyticsDashboard' });
    await env.sendMessage({ action: 'getWeeklyReport' });
    await env.triggerStartup();
    await env.triggerAlarm({ name: 'resistgate-entitlement-sync' });

    expect(fetchCalls).toEqual([]);
  });

  it('refuses the removed billing and telemetry actions', async () => {
    for (const action of ['openPricingPage', 'getBillingState', 'refreshEntitlement', 'trackPosthogEvent']) {
      const response = await env.sendMessage({ action });
      expect(response).toEqual({ success: false, error: 'Unknown action' });
    }

    expect(env.createdTabs).toHaveLength(0);
  });

  it('refuses the removed billing messages from the website', async () => {
    for (const request of [
      { action: 'activateProFromWebsite', activationToken: 'tok' },
      { action: 'getActivationState' }
    ]) {
      const response = await env.sendExternalMessage(request, {
        url: 'https://www.orlandoascanio.com/en/pricing'
      });
      expect(response).toEqual({ success: false, error: 'Unknown action' });
    }
  });

  it('deletes billing credentials and telemetry IDs left by earlier versions', async () => {
    const upgraded = createChromeMock();
    upgraded.storageData.installation = {
      deviceId: 'device-123',
      firstSeenAt: Date.now() - 1000,
      posthogSentEvents: { install: true },
      installCredential: 'a'.repeat(64),
      entitlement: { pro: true, plan: 'yearly', status: 'active', checkedAt: Date.now() }
    };
    upgraded.storageData.settings = {
      subscription: { tier: 'pro' },
      blocklist: [{ id: 'k1', urlPattern: 'reddit.com', createdAt: Date.now() }],
      proFeatures: { strictModeEnabled: true }
    };
    await upgraded.chrome.alarms.create('resistgate-entitlement-sync', { periodInMinutes: 360 });

    const calls = [];
    await loadScriptInVm('background.js', { chrome: upgraded.chrome, fetch: recordingFetch(calls) });
    await upgraded.sendMessage({ action: 'getSettings' });

    expect(upgraded.storageData).not.toHaveProperty('installation');
    expect(upgraded.storageData.settings).not.toHaveProperty('subscription');
    expect(upgraded.storageData.settings.blocklist.map((entry) => entry.urlPattern)).toEqual(['reddit.com']);
    expect(upgraded.storageData.settings.proFeatures.strictModeEnabled).toBe(true);
    expect((await upgraded.chrome.alarms.getAll()).map((alarm) => alarm.name))
      .not.toContain('resistgate-entitlement-sync');
    expect(calls).toEqual([]);
  });

  it('enforces strict mode lock during active schedule', async () => {
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

  it('lists active Free-tier access and re-blocks one domain immediately', async () => {
    const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
    settings.blocklist = [
      { id: 'active-1', urlPattern: 'reddit.com', createdAt: Date.now() },
      { id: 'active-2', urlPattern: 'youtube.com', createdAt: Date.now() }
    ];
    expect((await env.sendMessage({ action: 'updateSettings', settings })).success).toBe(true);

    expect((await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'reddit.com',
      duration: 10
    })).success).toBe(true);
    expect((await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'youtube.com',
      duration: 5
    })).success).toBe(true);

    const active = await env.sendMessage({ action: 'getActiveTemporaryAccess' });
    expect(active.success).toBe(true);
    expect(active.access.map((entry) => entry.domain)).toEqual([
      'youtube.com',
      'reddit.com'
    ]);

    const revoked = await env.sendMessage({
      action: 'revokeTemporaryAccess',
      domain: 'reddit.com'
    });
    expect(revoked).toEqual({
      success: true,
      access: { domain: 'reddit.com' }
    });
    expect(env.storageData.temporaryAccess['reddit.com']).toBeUndefined();
    expect(env.storageData.temporaryAccess['youtube.com']).toBeDefined();

    const alarms = await env.chrome.alarms.getAll();
    expect(alarms.some((alarm) => alarm.name === 'resistgate-access-expire-reddit.com')).toBe(false);
    expect(alarms.some((alarm) => alarm.name === 'resistgate-access-expire-youtube.com')).toBe(true);

    const rules = env.getSessionRules();
    expect(rules.some((rule) => rule.condition.urlFilter === '||reddit.com^')).toBe(true);
    expect(rules.some((rule) => rule.condition.urlFilter === '||youtube.com^')).toBe(false);
  });

  it('rejects invalid, missing, and removed active-access grants without touching other domains', async () => {
    const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
    settings.blocklist = [
      { id: 'active-3', urlPattern: 'reddit.com', createdAt: Date.now() },
      { id: 'active-4', urlPattern: 'youtube.com', createdAt: Date.now() }
    ];
    expect((await env.sendMessage({ action: 'updateSettings', settings })).success).toBe(true);
    expect((await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'youtube.com',
      duration: 5
    })).success).toBe(true);

    const invalid = await env.sendMessage({
      action: 'revokeTemporaryAccess',
      domain: 'not a domain'
    });
    expect(invalid.success).toBe(false);
    expect(invalid.error).toContain('Invalid domain');

    const missing = await env.sendMessage({
      action: 'revokeTemporaryAccess',
      domain: 'reddit.com'
    });
    expect(missing.success).toBe(false);
    expect(missing.error).toContain('no longer active');
    expect(env.storageData.temporaryAccess['youtube.com']).toBeDefined();

    const nextSettings = (await env.sendMessage({ action: 'getSettings' })).settings;
    nextSettings.blocklist = nextSettings.blocklist.filter(
      (entry) => entry.urlPattern !== 'youtube.com'
    );
    expect((await env.sendMessage({
      action: 'updateSettings',
      settings: nextSettings
    })).success).toBe(true);

    const active = await env.sendMessage({ action: 'getActiveTemporaryAccess' });
    expect(active.access).toEqual([]);

    const removed = await env.sendMessage({
      action: 'revokeTemporaryAccess',
      domain: 'youtube.com'
    });
    expect(removed.success).toBe(false);
    expect(removed.error).toContain('no longer in the blocklist');
  });

  it('restores temporary access when the immediate re-block rule update fails', async () => {
    const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
    settings.blocklist = [
      { id: 'active-5', urlPattern: 'reddit.com', createdAt: Date.now() }
    ];
    expect((await env.sendMessage({ action: 'updateSettings', settings })).success).toBe(true);
    expect((await env.sendMessage({
      action: 'grantTemporaryAccess',
      urlPattern: 'reddit.com',
      duration: 10
    })).success).toBe(true);

    const originalGrant = { ...env.storageData.temporaryAccess['reddit.com'] };
    env.failNextRulesUpdate('DNR unavailable');

    const response = await env.sendMessage({
      action: 'revokeTemporaryAccess',
      domain: 'reddit.com'
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('Unable to re-block');
    expect(env.storageData.temporaryAccess['reddit.com']).toEqual(originalGrant);
    expect(env.getSessionRules().some(
      (rule) => rule.condition.urlFilter === '||reddit.com^'
    )).toBe(false);
    expect((await env.chrome.alarms.getAll()).some(
      (alarm) => alarm.name === 'resistgate-access-expire-reddit.com'
    )).toBe(true);
  });

  it('generates weekly report with correct score formula and trend', async () => {
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

  it('reports per-site hold rates and urge timing in the weekly report', async () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const atHour = (daysBack, hour) => {
      const date = new Date(now - (daysBack * dayMs));
      date.setHours(hour, 0, 0, 0);
      return date.getTime();
    };

    env.storageData.analytics = {
      events: [
        // Four attempts on youtube, two of which got through (one override,
        // one completed challenge) — a 50% hold rate.
        { type: 'blocked_visit', timestamp: atHour(1, 14), domain: 'youtube.com' },
        { type: 'blocked_visit', timestamp: atHour(1, 15), domain: 'youtube.com' },
        { type: 'blocked_visit', timestamp: atHour(2, 14), domain: 'youtube.com' },
        { type: 'blocked_visit', timestamp: atHour(2, 15), domain: 'youtube.com' },
        { type: 'override_triggered', timestamp: atHour(1, 14), domain: 'youtube.com' },
        { type: 'access_granted', timestamp: atHour(2, 14), domain: 'youtube.com', method: 'challenge' },
        // One attempt on reddit that never got through.
        { type: 'blocked_visit', timestamp: atHour(3, 9), domain: 'reddit.com' }
      ]
    };

    const { report } = await env.sendMessage({ action: 'getWeeklyReport' });

    const youtube = report.siteHoldRates.find((entry) => entry.domain === 'youtube.com');
    expect(youtube).toMatchObject({ attempts: 4, gotThrough: 2, held: 2 });
    expect(youtube.holdRate).toBeCloseTo(0.5);

    const reddit = report.siteHoldRates.find((entry) => entry.domain === 'reddit.com');
    expect(reddit).toMatchObject({ attempts: 1, gotThrough: 0, held: 1 });

    expect(report.hourlyUrges).toHaveLength(24);
    expect(report.hourlyUrges[14].count).toBe(2);
    expect(report.hourlyUrges[15].count).toBe(2);
    expect(report.peakUrgeWindow.startHour).toBeLessThanOrEqual(14);
    expect(report.peakUrgeWindow.endHour).toBeGreaterThanOrEqual(16);
  });

  it('never recommends turning a schedule on, which would narrow blocking to that window', () => {
    const peakUrgeWindow = { startHour: 20, endHour: 23, count: 12, share: 60 };
    const siteHoldRates = [{ domain: 'youtube.com', attempts: 12, gotThrough: 0, held: 12, holdRate: 1 }];

    // Schedule off: blocking already runs around the clock, so the peak window
    // is covered and there is nothing to widen.
    const scheduleOff = hooks.buildWeeklyRecommendation({
      settings: {
        freeExperience: { schedule: { enabled: false, startTime: '09:00', endTime: '17:00' }, manualOverrideDelaySeconds: 15 },
        challengeTypes: { typing: { level: 'hard' } }
      },
      peakUrgeWindow,
      siteHoldRates,
      overrides: 0
    });
    expect(scheduleOff).toBeNull();

    // Schedule on and missing the peak: widen it to cover the danger window.
    const scheduleOn = hooks.buildWeeklyRecommendation({
      settings: {
        freeExperience: { schedule: { enabled: true, startTime: '09:00', endTime: '17:00' }, manualOverrideDelaySeconds: 15 },
        challengeTypes: { typing: { level: 'hard' } }
      },
      peakUrgeWindow,
      siteHoldRates,
      overrides: 0
    });
    expect(scheduleOn.action).toEqual({ type: 'extend-schedule', startTime: '09:00', endTime: '23:00' });
  });

  it('activates and enforces commitment mode lockout', async () => {
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
});
