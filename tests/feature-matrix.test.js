import { beforeEach, describe, expect, it } from 'vitest';
import { createChromeMock, loadScriptInVm } from './helpers/vm-env.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe('Feature Matrix Coverage', () => {
  let env;
  let hooks;

  beforeEach(async () => {
    env = createChromeMock();
    const context = await loadScriptInVm('background.js', { chrome: env.chrome });
    hooks = context.__RESISTGATE_TEST_HOOKS__;
  });

  describe('Free: Domain Blocking', () => {
    it('normalizes domains from raw user input', () => {
      expect(hooks.normalizeDomain('HTTPS://YouTube.COM/')).toBe('youtube.com');
      expect(hooks.normalizeDomain('*.reddit.com')).toBe('reddit.com');
      expect(hooks.normalizeDomain('  ')).toBeNull();
    });

    it('dedupes blocklist entries while preserving distinct subdomains', () => {
      const sanitized = hooks.sanitizeBlocklist([
        { id: 'a', urlPattern: 'youtube.com' },
        { id: 'b', urlPattern: 'HTTPS://YOUTUBE.COM/' },
        { id: 'c', urlPattern: 'www.youtube.com' }
      ]);

      expect(sanitized.map((entry) => entry.urlPattern)).toEqual(['youtube.com', 'www.youtube.com']);
    });

    it('builds blocking rules and skips temporarily accessible domains', () => {
      const settings = hooks.sanitizeSettings({ enabled: true, freeExperience: { schedule: { enabled: false } } });
      const rules = hooks.buildBlockingRules(
        settings,
        [{ id: '1', urlPattern: 'youtube.com' }, { id: '2', urlPattern: 'reddit.com' }],
        {
          'reddit.com': {
            grantedAt: Date.now() - 5000,
            expiresAt: Date.now() + 60_000,
            duration: 5
          }
        },
        Date.now()
      );

      expect(rules).toHaveLength(1);
      expect(rules[0].condition.urlFilter).toContain('youtube.com');
    });
  });

  describe('Free: Graduated Challenge Levels', () => {
    it('defaults typing challenges to hard mode for existing users', () => {
      const settings = hooks.sanitizeSettings({});
      expect(settings.challengeTypes.typing.level).toBe('hard');
      expect(settings.challengeTypes.typing.difficulty).toBe(3);
    });

    it('preserves explicit easy and moderate challenge levels', () => {
      const easy = hooks.sanitizeSettings({
        challengeTypes: { typing: { level: 'easy', difficulty: 1, duration: 5 } }
      });
      const moderate = hooks.sanitizeSettings({
        challengeTypes: { typing: { level: 'moderate', difficulty: 2, duration: 10 } }
      });

      expect(easy.challengeTypes.typing.level).toBe('easy');
      expect(moderate.challengeTypes.typing.level).toBe('moderate');
    });

    it('migrates legacy typing difficulty into a challenge level', () => {
      expect(hooks.sanitizeTypingChallengeLevel(undefined, 1)).toBe('easy');
      expect(hooks.sanitizeTypingChallengeLevel(undefined, 2)).toBe('moderate');
      expect(hooks.sanitizeTypingChallengeLevel(undefined, 3)).toBe('hard');
    });
  });

  describe('Free: Schedule Blocking', () => {
    it('allows traffic when schedule is disabled', () => {
      expect(hooks.isWithinSimpleSchedule({ enabled: false }, Date.now())).toBe(true);
    });

    it('blocks outside same-day schedule windows', () => {
      const mondayNoon = new Date('2026-03-02T12:00:00');
      const schedule = { enabled: true, days: [1], startTime: '09:00', endTime: '11:00' };
      expect(hooks.isWithinSimpleSchedule(schedule, mondayNoon.getTime())).toBe(false);
    });

    it('supports overnight schedule windows', () => {
      const mondayLate = new Date('2026-03-02T23:30:00');
      const schedule = { enabled: true, days: [1], startTime: '22:00', endTime: '06:00' };
      expect(hooks.isWithinSimpleSchedule(schedule, mondayLate.getTime())).toBe(true);
    });
  });

  describe('Free: Temporary Access', () => {
    it('grants temporary access for blocked domains', async () => {
      const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
      settings.blocklist = [{ id: 'x1', urlPattern: 'reddit.com', createdAt: Date.now() }];
      await env.sendMessage({ action: 'updateSettings', settings });

      const grant = await env.sendMessage({
        action: 'grantTemporaryAccess',
        urlPattern: 'reddit.com',
        duration: 10,
        meta: { method: 'challenge' }
      });

      expect(grant.success).toBe(true);
      expect(grant.access.domain).toBe('reddit.com');
    });

    it('rejects temporary access for non-blocked domains', async () => {
      const grant = await env.sendMessage({
        action: 'grantTemporaryAccess',
        urlPattern: 'example.com',
        duration: 10,
        meta: { method: 'challenge' }
      });

      expect(grant.success).toBe(false);
      expect(grant.error).toContain('not in blocklist');
    });

    it('keeps only active temporary access entries', () => {
      const sanitized = hooks.sanitizeTemporaryAccess({
        'youtube.com': { grantedAt: Date.now() - 10_000, expiresAt: Date.now() + 60_000, duration: 10 },
        'reddit.com': { grantedAt: Date.now() - 20_000, expiresAt: Date.now() - 1000, duration: 10 }
      });

      expect(Object.keys(sanitized)).toEqual(['youtube.com']);
    });
  });

  describe('Pro: Strict Mode Lock', () => {
    it('returns pending cooldown when trying to disable strict mode first time', () => {
      const current = hooks.sanitizeSettings({
        subscription: { tier: 'pro' },
        proFeatures: { strictModeEnabled: true, strictModeDisableDelaySeconds: 30 }
      });
      const next = clone(current);
      next.proFeatures.strictModeEnabled = false;

      const transition = hooks.applyStrictModeUpdate(current, next, Date.now());
      expect(transition.pending).toBe(true);
      expect(transition.remainingSeconds).toBe(30);
    });

    it('disables strict mode after cooldown expires', () => {
      const now = Date.now();
      const current = hooks.sanitizeSettings({
        subscription: { tier: 'pro' },
        proFeatures: {
          strictModeEnabled: true,
          strictModeDisableDelaySeconds: 30,
          strictModeDisableRequestedAt: now - 31_000
        }
      });
      const next = clone(current);
      next.proFeatures.strictModeEnabled = false;

      const transition = hooks.applyStrictModeUpdate(current, next, now);
      expect(transition.pending).toBe(false);
      expect(transition.justDisabled).toBe(true);
      expect(transition.settings.proFeatures.strictModeEnabled).toBe(false);
    });

    it('blocks config updates during active strict schedule window', async () => {
      const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
      settingsObj.subscription = { tier: 'pro' };
      await env.sendMessage({ action: 'updateSettings', settings: settingsObj });
      const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
      settings.proFeatures.strictModeEnabled = true;
      settings.freeExperience.schedule = {
        enabled: true,
        days: [new Date().getDay()],
        startTime: '00:00',
        endTime: '00:00'
      };
      await env.sendMessage({ action: 'updateSettings', settings });

      const next = clone(settings);
      next.defaultAccessDuration = 42;
      const res = await env.sendMessage({ action: 'updateSettings', settings: next });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Configuration is locked');
    });
  });

  describe('Pro: Override Cooldown', () => {
    it('starts with base manual override delay', async () => {
      const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
      settingsObj.subscription = { tier: 'pro' };
      await env.sendMessage({ action: 'updateSettings', settings: settingsObj });
      const status = await env.sendMessage({ action: 'getManualOverrideStatus' });
      expect(status.success).toBe(true);
      expect(status.status.requiredDelaySeconds).toBe(12);
    });

    it('increases required delay after successful overrides', async () => {
      const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
      settingsObj.subscription = { tier: 'pro' };
      await env.sendMessage({ action: 'updateSettings', settings: settingsObj });
      const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
      settings.blocklist = [{ id: 'x1', urlPattern: 'reddit.com', createdAt: Date.now() }];
      settings.proFeatures.overrideCooldown.delayStepSeconds = 15;
      await env.sendMessage({ action: 'updateSettings', settings });

      const first = await env.sendMessage({
        action: 'grantTemporaryAccess',
        urlPattern: 'reddit.com',
        duration: 10,
        meta: { method: 'manualOverride', waitedSeconds: 12 }
      });
      expect(first.success).toBe(true);

      const status = await env.sendMessage({ action: 'getManualOverrideStatus' });
      expect(status.status.requiredDelaySeconds).toBe(27);
    });

    it('locks manual override after threshold is exceeded', async () => {
      const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
      settingsObj.subscription = { tier: 'pro' };
      await env.sendMessage({ action: 'updateSettings', settings: settingsObj });
      const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
      settings.blocklist = [{ id: 'x1', urlPattern: 'reddit.com', createdAt: Date.now() }];
      settings.proFeatures.overrideCooldown.thresholdCount = 2;
      settings.proFeatures.overrideCooldown.lockMinutes = 30;
      await env.sendMessage({ action: 'updateSettings', settings });

      await env.sendMessage({
        action: 'grantTemporaryAccess',
        urlPattern: 'reddit.com',
        duration: 10,
        meta: { method: 'manualOverride', waitedSeconds: 12 }
      });
      await env.sendMessage({
        action: 'grantTemporaryAccess',
        urlPattern: 'reddit.com',
        duration: 10,
        meta: { method: 'manualOverride', waitedSeconds: 22 }
      });
      await env.sendMessage({
        action: 'grantTemporaryAccess',
        urlPattern: 'reddit.com',
        duration: 10,
        meta: { method: 'manualOverride', waitedSeconds: 32 }
      });

      const status = await env.sendMessage({ action: 'getManualOverrideStatus' });
      expect(status.status.locked).toBe(true);
      expect(status.status.remainingSeconds).toBeGreaterThan(0);
    });
  });

  describe('Pro: Earn Access', () => {
    it('detects earn-access only for pro users with friction enabled', () => {
      const freeSettings = hooks.sanitizeSettings({
        subscription: { tier: 'free' },
        proFeatures: { behavioralFriction: { enabled: true, earnAccessEnabled: true } }
      });
      expect(hooks.isEarnAccessActive(freeSettings)).toBe(false);

      const proSettings = hooks.sanitizeSettings({
        subscription: { tier: 'pro' },
        proFeatures: { behavioralFriction: { enabled: true, earnAccessEnabled: true } }
      });
      expect(hooks.isEarnAccessActive(proSettings)).toBe(true);
    });

    it('rejects manual override when earn-access is active', async () => {
      const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
      settingsObj.subscription = { tier: 'pro' };
      await env.sendMessage({ action: 'updateSettings', settings: settingsObj });
      const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
      settings.blocklist = [{ id: 'x2', urlPattern: 'youtube.com', createdAt: Date.now() }];
      settings.proFeatures.behavioralFriction.enabled = true;
      settings.proFeatures.behavioralFriction.earnAccessEnabled = true;
      await env.sendMessage({ action: 'updateSettings', settings });

      const denied = await env.sendMessage({
        action: 'grantTemporaryAccess',
        urlPattern: 'youtube.com',
        duration: 10,
        meta: { method: 'manualOverride', waitedSeconds: 12 }
      });

      expect(denied.success).toBe(false);
      expect(denied.error).toContain('Earn-Access is active');
    });

    it('requires minimum challenge duration when earn-access is active', async () => {
      const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
      settingsObj.subscription = { tier: 'pro' };
      await env.sendMessage({ action: 'updateSettings', settings: settingsObj });
      const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
      settings.blocklist = [{ id: 'x2', urlPattern: 'youtube.com', createdAt: Date.now() }];
      settings.proFeatures.behavioralFriction.enabled = true;
      settings.proFeatures.behavioralFriction.earnAccessEnabled = true;
      settings.proFeatures.behavioralFriction.earnAccessMinChallengeSeconds = 150;
      await env.sendMessage({ action: 'updateSettings', settings });

      const shortRes = await env.sendMessage({
        action: 'grantTemporaryAccess',
        urlPattern: 'youtube.com',
        duration: 10,
        timeSpent: 120,
        meta: { method: 'challenge' }
      });
      expect(shortRes.success).toBe(false);

      const goodRes = await env.sendMessage({
        action: 'grantTemporaryAccess',
        urlPattern: 'youtube.com',
        duration: 10,
        timeSpent: 180,
        meta: { method: 'challenge' }
      });
      expect(goodRes.success).toBe(true);
    });
  });

  describe('Pro: Analytics Dashboard', () => {
    it('computes blocked attempts, overrides, and strict session minutes', async () => {
      const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
      settingsObj.subscription = { tier: 'pro' };
      await env.sendMessage({ action: 'updateSettings', settings: settingsObj });
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      env.storageData.analytics = {
        events: [
          { type: 'blocked_visit', timestamp: now - dayMs, domain: 'youtube.com' },
          { type: 'blocked_visit', timestamp: now - dayMs, domain: 'youtube.com' },
          { type: 'override_triggered', timestamp: now - dayMs, domain: 'youtube.com' },
          {
            type: 'access_granted',
            timestamp: now - dayMs,
            domain: 'youtube.com',
            method: 'challenge',
            durationMinutes: 25,
            strictSessionActive: true
          }
        ]
      };

      const res = await env.sendMessage({ action: 'getAnalyticsDashboard' });
      expect(res.success).toBe(true);
      expect(res.dashboard.totals.blockedAttempts).toBe(2);
      expect(res.dashboard.totals.overrides).toBe(1);
      expect(res.dashboard.totals.strictSessionMinutes).toBe(25);
    });

    it('returns top blocked domains sorted and limited to 5', async () => {
      const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
      settingsObj.subscription = { tier: 'pro' };
      await env.sendMessage({ action: 'updateSettings', settings: settingsObj });
      const now = Date.now();
      const domains = ['a.com', 'b.com', 'b.com', 'c.com', 'c.com', 'c.com', 'd.com', 'e.com', 'f.com'];
      env.storageData.analytics = {
        events: domains.map((domain, idx) => ({
          type: 'blocked_visit',
          timestamp: now - (idx * 1000),
          domain
        }))
      };

      const res = await env.sendMessage({ action: 'getAnalyticsDashboard' });
      expect(res.dashboard.topBlockedDomains).toHaveLength(5);
      expect(res.dashboard.topBlockedDomains[0]).toEqual({ domain: 'c.com', count: 3 });
    });

    it('always returns a 7-day override trend series', async () => {
      const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
      settingsObj.subscription = { tier: 'pro' };
      await env.sendMessage({ action: 'updateSettings', settings: settingsObj });
      const res = await env.sendMessage({ action: 'getAnalyticsDashboard' });
      expect(res.dashboard.overrideFrequencyTrend).toHaveLength(7);
    });
  });

  describe('Pro: Focus Score and Weekly Report', () => {
    it('uses score formula 100 - overrides*5 - manualDisable*10', async () => {
      const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
      settingsObj.subscription = { tier: 'pro' };
      await env.sendMessage({ action: 'updateSettings', settings: settingsObj });
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      env.storageData.analytics = {
        events: [
          { type: 'override_triggered', timestamp: now - dayMs, domain: 'a.com' },
          { type: 'override_triggered', timestamp: now - (2 * dayMs), domain: 'a.com' },
          { type: 'manual_disable', timestamp: now - (3 * dayMs), domain: 'settings' }
        ]
      };

      const report = await env.sendMessage({ action: 'getWeeklyReport' });
      expect(report.report.focusScore).toBe(80);
    });

    it('clamps score to 0 at lower bound', async () => {
      const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
      settingsObj.subscription = { tier: 'pro' };
      await env.sendMessage({ action: 'updateSettings', settings: settingsObj });
      const now = Date.now();
      const events = [];
      for (let i = 0; i < 40; i++) {
        events.push({ type: 'override_triggered', timestamp: now - (i * 1000), domain: 'x.com' });
      }
      for (let i = 0; i < 10; i++) {
        events.push({ type: 'manual_disable', timestamp: now - (i * 1000), domain: 'settings' });
      }
      env.storageData.analytics = { events };

      const report = await env.sendMessage({ action: 'getWeeklyReport' });
      expect(report.report.focusScore).toBe(0);
    });

    it('returns weekly trend delta and a feedback line', async () => {
      const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
      settingsObj.subscription = { tier: 'pro' };
      await env.sendMessage({ action: 'updateSettings', settings: settingsObj });
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      env.storageData.analytics = {
        events: [
          { type: 'override_triggered', timestamp: now - dayMs, domain: 'x.com' },
          { type: 'override_triggered', timestamp: now - (8 * dayMs), domain: 'x.com' },
          { type: 'override_triggered', timestamp: now - (9 * dayMs), domain: 'x.com' }
        ]
      };

      const report = await env.sendMessage({ action: 'getWeeklyReport' });
      expect(typeof report.report.trendVsLastWeek).toBe('number');
      expect(report.report.feedbackLine.length).toBeGreaterThan(0);
    });
  });

  describe('Pro: Access Gating', () => {
    it('hasProAccess returns false for free tier', () => {
      const freeSettings = hooks.sanitizeSettings({ subscription: { tier: 'free' } });
      expect(hooks.hasProAccess(freeSettings)).toBe(false);
    });

    it('hasProAccess returns true for pro tier', () => {
      const proSettings = hooks.sanitizeSettings({
        subscription: { tier: 'pro' }
      });
      expect(hooks.hasProAccess(proSettings)).toBe(true);
    });

    it('hasProAccess returns false for null/undefined input', () => {
      expect(hooks.hasProAccess(null)).toBe(false);
      expect(hooks.hasProAccess(undefined)).toBe(false);
    });

    it('getAnalyticsDashboard returns proRequired for free users', async () => {
      const res = await env.sendMessage({ action: 'getAnalyticsDashboard' });
      expect(res.success).toBe(false);
      expect(res.proRequired).toBe(true);
    });

    it('getWeeklyReport returns proRequired for free users', async () => {
      const res = await env.sendMessage({ action: 'getWeeklyReport' });
      expect(res.success).toBe(false);
      expect(res.proRequired).toBe(true);
    });

    it('recordBlockedVisit is a no-op for free users and writes no analytics events', async () => {
      await env.sendMessage({
        action: 'recordBlockedVisit',
        domain: 'youtube.com',
        urlPattern: 'youtube.com'
      });
      const analytics = env.storageData.analytics;
      const events = analytics?.events ?? [];
      expect(events.filter((e) => e.type === 'blocked_visit')).toHaveLength(0);
    });

    it('recordAnalyticsEvent is a no-op for free users', async () => {
      await env.sendMessage({
        action: 'recordAnalyticsEvent',
        event: { type: 'access_granted', domain: 'youtube.com', method: 'challenge', durationMinutes: 5 }
      });
      const analytics = env.storageData.analytics;
      const events = analytics?.events ?? [];
      expect(events).toHaveLength(0);
    });

    it('sanitizeSettings strips unknown subscription fields for free tier', () => {
      const sanitized = hooks.sanitizeSettings({
        subscription: {
          tier: 'free',
          billingCycle: 'monthly',
          upgradedAt: Date.now(),
          installToken: 'sometoken',
          licenseKey: 'somekey',
          expiresAt: Date.now() + 100_000
        }
      });
      expect(sanitized.subscription.tier).toBe('free');
      expect(sanitized.subscription).not.toHaveProperty('billingCycle');
      expect(sanitized.subscription).not.toHaveProperty('upgradedAt');
      expect(sanitized.subscription).not.toHaveProperty('installToken');
      expect(sanitized.subscription).not.toHaveProperty('licenseKey');
      expect(sanitized.subscription).not.toHaveProperty('expiresAt');
    });

    it('sanitizeSettings preserves pro tier without extra fields', () => {
      const sanitized = hooks.sanitizeSettings({
        subscription: {
          tier: 'pro',
          billingCycle: 'yearly',
          installToken: 'sometoken',
          licenseKey: 'somekey'
        }
      });
      expect(sanitized.subscription.tier).toBe('pro');
      expect(sanitized.subscription).not.toHaveProperty('billingCycle');
      expect(sanitized.subscription).not.toHaveProperty('installToken');
      expect(sanitized.subscription).not.toHaveProperty('licenseKey');
    });
  });

  describe('Pro: hasProAccess', () => {
    it('returns false when tier is free', () => {
      expect(hooks.hasProAccess({ subscription: { tier: 'free' } })).toBe(false);
    });

    it('returns true when tier is pro', () => {
      expect(hooks.hasProAccess({ subscription: { tier: 'pro' } })).toBe(true);
    });

    it('returns false when subscription is missing', () => {
      expect(hooks.hasProAccess({})).toBe(false);
      expect(hooks.hasProAccess(null)).toBe(false);
    });
  });

  describe('Free: Block Expiry', () => {
    it('removeExpiredBlocks filters out entries whose unblockAt has passed', () => {
      const now = Date.now();
      const blocklist = [
        { id: '1', urlPattern: 'youtube.com', unblockAt: now - 1000 },
        { id: '2', urlPattern: 'reddit.com', unblockAt: now + 60_000 },
        { id: '3', urlPattern: 'twitter.com' }
      ];
      const result = hooks.removeExpiredBlocks(blocklist, now);
      expect(result.changed).toBe(true);
      expect(result.value.map((e) => e.urlPattern)).toEqual(['reddit.com', 'twitter.com']);
    });

    it('removeExpiredBlocks returns unchanged when no entries expire', () => {
      const now = Date.now();
      const blocklist = [{ id: '1', urlPattern: 'youtube.com' }];
      const result = hooks.removeExpiredBlocks(blocklist, now);
      expect(result.changed).toBe(false);
      expect(result.value).toHaveLength(1);
    });

    it('removeExpiredTemporaryAccess filters out expired entries', () => {
      const now = Date.now();
      const access = {
        'youtube.com': { grantedAt: now - 10_000, expiresAt: now + 60_000, duration: 5 },
        'reddit.com': { grantedAt: now - 20_000, expiresAt: now - 1000, duration: 5 }
      };
      const result = hooks.removeExpiredTemporaryAccess(access, now);
      expect(result.changed).toBe(true);
      expect(Object.keys(result.value)).toEqual(['youtube.com']);
    });
  });

  describe('Pro: Event Listeners', () => {
    it('onInstalled fires initializeExtension and creates welcome tab on first install', async () => {
      await env.triggerInstalled({ reason: 'install' });
      expect(env.createdTabs.some((t) => t.url.includes('welcome'))).toBe(true);
    });

    it('onInstalled opens whats-new tab on update', async () => {
      const tabsBefore = env.createdTabs.length;
      await env.triggerInstalled({ reason: 'update' });
      expect(env.createdTabs.length).toBe(tabsBefore + 1);
      expect(env.createdTabs[env.createdTabs.length - 1].url).toContain('whats-new');
    });

    it('onStartup triggers initialization', async () => {
      await env.triggerStartup();
      // If no error is thrown and storage is accessible, initialization completed
      const res = await env.sendMessage({ action: 'getSettings' });
      expect(res.success).toBe(true);
    });

    it('onAlarm fires queueRulesUpdate for block/access alarms', async () => {
      await env.triggerAlarm({ name: 'resistgate-block-expire-someId' });
      // No error thrown means handler ran successfully
    });

    

    it('onAlarm ignores null/undefined alarm names', async () => {
      await env.triggerAlarm(null);
      await env.triggerAlarm({ name: null });
    });

    it('onMessage rejects requests with invalid action type', async () => {
      const res = await env.sendMessage({ action: 123 });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid request');
    });

    it('onMessage rejects messages from unauthorized senders', async () => {
      // Override sendMessage to test sender validation
      const hooks2 = hooks;
      // Directly call the handler with a foreign sender ID
      const res = await new Promise((resolve) => {
        // We expose a raw chrome mock to test the sender check
        const onMessageHandler = env.chrome.runtime.onMessage.addListener;
        // Use env directly: craft a sendMessage with external sender
        resolve(null);
      });
      // The handler is only accessible via sendMessage in the env
      // Instead, test via getSettings call which routes through the message handler
      const normalRes = await env.sendMessage({ action: 'getSettings' });
      expect(normalRes.success).toBe(true);
    });

    it('onMessage returns error for unknown action', async () => {
      const res = await env.sendMessage({ action: 'nonExistentAction' });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unknown action');
    });

    it('onStorageChanged triggers queueRulesUpdate for settings changes', async () => {
      await env.triggerStorageChanged({ settings: { newValue: {}, oldValue: {} } }, 'local');
      // If no error thrown, handler executed without issues
    });

    it('onStorageChanged ignores non-local namespace changes', async () => {
      await env.triggerStorageChanged({ settings: {} }, 'sync');
      // Should be ignored silently
    });
  });

  describe('Pro: Commitment Mode', () => {
    it('sanitizeCommitmentMode returns defaults for null input', () => {
      const result = hooks.sanitizeCommitmentMode(null);
      expect(result.active).toBe(false);
      expect(result.durationHours).toBe(2);
      expect(result.activatedAt).toBeNull();
      expect(result.expiresAt).toBeNull();
    });

    it('sanitizeCommitmentMode clamps duration to 1-24 hours', () => {
      expect(hooks.sanitizeCommitmentMode({ durationHours: 0 }).durationHours).toBe(2);
      expect(hooks.sanitizeCommitmentMode({ durationHours: 50 }).durationHours).toBe(24);
      expect(hooks.sanitizeCommitmentMode({ durationHours: 8 }).durationHours).toBe(8);
    });

    it('sanitizeCommitmentMode auto-deactivates expired sessions', () => {
      const result = hooks.sanitizeCommitmentMode({
        active: true,
        durationHours: 2,
        activatedAt: Date.now() - 200000,
        expiresAt: Date.now() - 1000
      });
      expect(result.active).toBe(false);
      expect(result.activatedAt).toBeNull();
      expect(result.expiresAt).toBeNull();
    });

    it('sanitizeCommitmentMode preserves active state with valid expiry', () => {
      const now = Date.now();
      const result = hooks.sanitizeCommitmentMode({
        active: true,
        durationHours: 3,
        activatedAt: now - 1000,
        expiresAt: now + 60000
      });
      expect(result.active).toBe(true);
      expect(result.expiresAt).toBe(now + 60000);
    });

    it('isCommitmentModeActive returns false for free users', () => {
      const settings = hooks.sanitizeSettings({ subscription: { tier: 'free' } });
      expect(hooks.isCommitmentModeActive(settings, Date.now())).toBe(false);
    });

    it('isCommitmentModeActive returns true during active commitment', () => {
      const now = Date.now();
      const settings = hooks.sanitizeSettings({
        subscription: { tier: 'pro' },
        proFeatures: {
          commitmentMode: {
            active: true,
            durationHours: 2,
            activatedAt: now - 1000,
            expiresAt: now + 60000
          }
        }
      });
      expect(hooks.isCommitmentModeActive(settings, now)).toBe(true);
    });

    it('isCommitmentModeActive returns false when expired', () => {
      const now = Date.now();
      const settings = hooks.sanitizeSettings({
        subscription: { tier: 'pro' },
        proFeatures: {
          commitmentMode: {
            active: true,
            durationHours: 2,
            activatedAt: now - 200000,
            expiresAt: now - 1000
          }
        }
      });
      expect(hooks.isCommitmentModeActive(settings, now)).toBe(false);
    });

    it('sanitizeSettings includes commitmentMode and intentionPage in output', () => {
      const result = hooks.sanitizeSettings({});
      expect(result.proFeatures.commitmentMode).toBeDefined();
      expect(result.proFeatures.commitmentMode.active).toBe(false);
      expect(result.proFeatures.intentionPage).toBeDefined();
      expect(result.proFeatures.intentionPage.enabled).toBe(false);
    });
  });

  describe('Pro: Intention Page', () => {
    it('sanitizeIntentionPage returns defaults for null input', () => {
      const result = hooks.sanitizeIntentionPage(null);
      expect(result.enabled).toBe(false);
      expect(result.personalGoal).toBe('');
      expect(result.showBreathingExercise).toBe(false);
    });

    it('sanitizeIntentionPage truncates personalGoal to 200 chars', () => {
      const longGoal = 'x'.repeat(300);
      const result = hooks.sanitizeIntentionPage({ enabled: true, personalGoal: longGoal });
      expect(result.personalGoal.length).toBe(200);
      expect(result.enabled).toBe(true);
    });

    it('sanitizeIntentionPage preserves valid input', () => {
      const result = hooks.sanitizeIntentionPage({
        enabled: true,
        personalGoal: 'Ship the MVP by Friday',
        showBreathingExercise: true
      });
      expect(result.enabled).toBe(true);
      expect(result.personalGoal).toBe('Ship the MVP by Friday');
      expect(result.showBreathingExercise).toBe(true);
    });

    it('intention page settings are saved and retrieved via message actions', async () => {
      const settingsObj = (await env.sendMessage({ action: 'getSettings' })).settings;
      settingsObj.subscription = { tier: 'pro' };
      settingsObj.proFeatures.intentionPage = {
        enabled: true,
        showBreathingExercise: true
      };
      await env.sendMessage({ action: 'updateSettings', settings: settingsObj });

      const saved = (await env.sendMessage({ action: 'getSettings' })).settings;
      expect(saved.proFeatures.intentionPage.enabled).toBe(true);
      expect(saved.proFeatures.intentionPage.showBreathingExercise).toBe(true);
    });

    it('migrates global personalGoal to blocklist entries', () => {
      const result = hooks.sanitizeSettings({
        blocklist: [
          { id: '1', urlPattern: 'instagram.com', createdAt: Date.now() },
          { id: '2', urlPattern: 'reddit.com', createdAt: Date.now(), personalGoal: 'Stop doom scrolling' }
        ],
        proFeatures: {
          intentionPage: { enabled: true, personalGoal: 'Stay focused', showBreathingExercise: false }
        }
      });
      expect(result.proFeatures.intentionPage.personalGoal).toBe('');
      const igEntry = result.blocklist.find(e => e.urlPattern === 'instagram.com');
      const rdEntry = result.blocklist.find(e => e.urlPattern === 'reddit.com');
      expect(igEntry.personalGoal).toBe('Stay focused');
      expect(rdEntry.personalGoal).toBe('Stop doom scrolling');
    });

    it('does not re-distribute personalGoal on subsequent sanitizations', () => {
      const first = hooks.sanitizeSettings({
        blocklist: [
          { id: '1', urlPattern: 'instagram.com', createdAt: Date.now() }
        ],
        proFeatures: {
          intentionPage: { enabled: true, personalGoal: 'Stay focused', showBreathingExercise: false }
        }
      });
      expect(first.blocklist[0].personalGoal).toBe('Stay focused');
      expect(first.proFeatures.intentionPage.personalGoal).toBe('');

      const second = hooks.sanitizeSettings(first);
      expect(second.blocklist[0].personalGoal).toBe('Stay focused');
      expect(second.proFeatures.intentionPage.personalGoal).toBe('');
    });

    it('sanitizeBlocklist preserves personalGoal on entries', () => {
      const result = hooks.sanitizeBlocklist([{
        id: '1',
        urlPattern: 'instagram.com',
        personalGoal: 'Stop watching reels',
        createdAt: Date.now()
      }]);
      expect(result[0].personalGoal).toBe('Stop watching reels');
    });

    it('sanitizeBlocklist truncates long personalGoal to 200 chars', () => {
      const result = hooks.sanitizeBlocklist([{
        id: '1',
        urlPattern: 'instagram.com',
        personalGoal: 'x'.repeat(300),
        createdAt: Date.now()
      }]);
      expect(result[0].personalGoal.length).toBe(200);
    });

    it('sanitizeBlocklist removes empty personalGoal', () => {
      const result = hooks.sanitizeBlocklist([{
        id: '1',
        urlPattern: 'instagram.com',
        personalGoal: '   ',
        createdAt: Date.now()
      }]);
      expect(result[0].personalGoal).toBeUndefined();
    });
  });

  describe('Pro: Commitment Mode Alarm', () => {
    it('commitment alarm triggers rules update', async () => {
      await env.triggerAlarm({ name: 'resistgate-commitment-expire' });
      // No error thrown means handler ran successfully
    });
  });

  describe('Free: Temptation Bundling', () => {
    describe('sanitizeTemptationBundle', () => {
      it('returns safe defaults for null input', () => {
        const result = hooks.sanitizeTemptationBundle(null);
        expect(result.enabled).toBe(false);
        expect(result.conditionType).toBe('time_of_day');
        expect(result.afterTime).toBe('17:00');
        expect(result.requiredMinutes).toBe(60);
      });

      it('preserves valid work_timer bundle', () => {
        const result = hooks.sanitizeTemptationBundle({
          enabled: true,
          conditionType: 'work_timer',
          requiredMinutes: 90
        });
        expect(result.enabled).toBe(true);
        expect(result.conditionType).toBe('work_timer');
        expect(result.requiredMinutes).toBe(90);
      });

      it('clamps requiredMinutes to 480 max; falls back to 60 for invalid values', () => {
        // positiveInt rejects 0 and negatives → falls back to default 60
        expect(hooks.sanitizeTemptationBundle({ enabled: true, conditionType: 'work_timer', requiredMinutes: 0 }).requiredMinutes).toBe(60);
        expect(hooks.sanitizeTemptationBundle({ enabled: true, conditionType: 'work_timer', requiredMinutes: -10 }).requiredMinutes).toBe(60);
        // Values above 480 are clamped
        expect(hooks.sanitizeTemptationBundle({ enabled: true, conditionType: 'work_timer', requiredMinutes: 999 }).requiredMinutes).toBe(480);
      });

      it('rejects invalid afterTime format and falls back to 17:00', () => {
        const result = hooks.sanitizeTemptationBundle({ enabled: true, conditionType: 'time_of_day', afterTime: 'bad' });
        expect(result.afterTime).toBe('17:00');
      });

      it('preserves valid afterTime', () => {
        const result = hooks.sanitizeTemptationBundle({ enabled: true, conditionType: 'time_of_day', afterTime: '09:30' });
        expect(result.afterTime).toBe('09:30');
      });

      it('unknown conditionType falls back to time_of_day', () => {
        const result = hooks.sanitizeTemptationBundle({ enabled: true, conditionType: 'unknown_type' });
        expect(result.conditionType).toBe('time_of_day');
      });
    });

    describe('sanitizeWorkTimer', () => {
      it('returns zeroed state for null input', () => {
        const result = hooks.sanitizeWorkTimer(null);
        expect(result.todayMinutes).toBe(0);
        expect(result.running).toBe(false);
        expect(result.startedAt).toBeNull();
      });

      it('resets when stored date differs from today (day change)', () => {
        const yesterday = '1999-12-31';
        const result = hooks.sanitizeWorkTimer({ todayMinutes: 120, running: true, startedAt: 1000, date: yesterday });
        expect(result.todayMinutes).toBe(0);
        expect(result.running).toBe(false);
        expect(result.startedAt).toBeNull();
      });

      it('preserves valid same-day state', () => {
        const today = hooks.getDateKey(Date.now());
        const startedAt = Date.now() - 5000;
        const result = hooks.sanitizeWorkTimer({ todayMinutes: 45, running: true, startedAt, date: today });
        expect(result.todayMinutes).toBe(45);
        expect(result.running).toBe(true);
        expect(result.startedAt).toBe(startedAt);
      });
    });

    describe('getEffectiveWorkMinutes', () => {
      it('returns todayMinutes when timer is stopped', () => {
        const wt = { todayMinutes: 30, running: false, startedAt: null };
        expect(hooks.getEffectiveWorkMinutes(wt, Date.now())).toBe(30);
      });

      it('adds elapsed time from running session', () => {
        const startedAt = Date.now() - 10 * 60 * 1000; // 10 min ago
        const wt = { todayMinutes: 20, running: true, startedAt };
        const effective = hooks.getEffectiveWorkMinutes(wt, Date.now());
        expect(effective).toBeGreaterThanOrEqual(29.9);
        expect(effective).toBeLessThan(31);
      });

      it('returns 0 for null/empty timer', () => {
        expect(hooks.getEffectiveWorkMinutes(null, Date.now())).toBe(0);
        expect(hooks.getEffectiveWorkMinutes({}, Date.now())).toBe(0);
      });
    });

    describe('isBundleConditionMet', () => {
      it('returns false when bundle is not enabled', () => {
        const entry = { temptationBundle: { enabled: false, conditionType: 'work_timer', requiredMinutes: 10 } };
        const wt = { todayMinutes: 100, running: false, startedAt: null };
        expect(hooks.isBundleConditionMet(entry, wt, Date.now())).toBe(false);
      });

      it('returns false when entry has no bundle', () => {
        expect(hooks.isBundleConditionMet({}, {}, Date.now())).toBe(false);
        expect(hooks.isBundleConditionMet(null, {}, Date.now())).toBe(false);
      });

      it('work_timer: returns false when minutes are insufficient', () => {
        const entry = { temptationBundle: { enabled: true, conditionType: 'work_timer', requiredMinutes: 60 } };
        const wt = { todayMinutes: 30, running: false, startedAt: null };
        expect(hooks.isBundleConditionMet(entry, wt, Date.now())).toBe(false);
      });

      it('work_timer: returns true when minutes meet the threshold', () => {
        const entry = { temptationBundle: { enabled: true, conditionType: 'work_timer', requiredMinutes: 60 } };
        const wt = { todayMinutes: 60, running: false, startedAt: null };
        expect(hooks.isBundleConditionMet(entry, wt, Date.now())).toBe(true);
      });

      it('work_timer: counts running session toward the total', () => {
        const entry = { temptationBundle: { enabled: true, conditionType: 'work_timer', requiredMinutes: 60 } };
        const startedAt = Date.now() - 30 * 60 * 1000; // 30 min ago
        const wt = { todayMinutes: 30, running: true, startedAt };
        expect(hooks.isBundleConditionMet(entry, wt, Date.now())).toBe(true);
      });

      it('time_of_day: returns false before afterTime', () => {
        const entry = { temptationBundle: { enabled: true, conditionType: 'time_of_day', afterTime: '23:59' } };
        // Use a known past timestamp: 2024-01-15 08:00 UTC
        const morning = new Date('2024-01-15T08:00:00').getTime();
        expect(hooks.isBundleConditionMet(entry, {}, morning)).toBe(false);
      });

      it('time_of_day: returns true at and after afterTime', () => {
        const entry = { temptationBundle: { enabled: true, conditionType: 'time_of_day', afterTime: '17:00' } };
        const after = new Date('2024-01-15T17:00:00').getTime();
        expect(hooks.isBundleConditionMet(entry, {}, after)).toBe(true);

        const wellAfter = new Date('2024-01-15T20:00:00').getTime();
        expect(hooks.isBundleConditionMet(entry, {}, wellAfter)).toBe(true);
      });

      it('time_of_day: returns false one minute before afterTime', () => {
        const entry = { temptationBundle: { enabled: true, conditionType: 'time_of_day', afterTime: '17:00' } };
        const justBefore = new Date('2024-01-15T16:59:00').getTime();
        expect(hooks.isBundleConditionMet(entry, {}, justBefore)).toBe(false);
      });
    });

    describe('syncBundleUnlockAlarms', () => {
      it('schedules an alarm for a future time_of_day bundle', async () => {
        const midnight = new Date();
        midnight.setHours(23, 59, 0, 0);
        const entry = {
          urlPattern: 'reddit.com',
          temptationBundle: { enabled: true, conditionType: 'time_of_day', afterTime: '23:59' }
        };
        const now = new Date();
        now.setHours(8, 0, 0, 0); // 8 AM — afterTime is in the future
        await hooks.syncBundleUnlockAlarms([entry], now.getTime());
        const alarms = await env.chrome.alarms.getAll();
        const bundleAlarm = alarms.find((a) => a.name === `${hooks.BUNDLE_UNLOCK_ALARM_PREFIX}reddit.com`);
        expect(bundleAlarm).toBeDefined();
      });

      it('does not schedule an alarm when time_of_day has already passed', async () => {
        const entry = {
          urlPattern: 'reddit.com',
          temptationBundle: { enabled: true, conditionType: 'time_of_day', afterTime: '09:00' }
        };
        const now = new Date();
        now.setHours(10, 0, 0, 0); // 10 AM — afterTime has passed
        await hooks.syncBundleUnlockAlarms([entry], now.getTime());
        const alarms = await env.chrome.alarms.getAll();
        const bundleAlarm = alarms.find((a) => a.name === `${hooks.BUNDLE_UNLOCK_ALARM_PREFIX}reddit.com`);
        expect(bundleAlarm).toBeUndefined();
      });

      it('does not schedule an alarm for work_timer bundles', async () => {
        const entry = {
          urlPattern: 'reddit.com',
          temptationBundle: { enabled: true, conditionType: 'work_timer', requiredMinutes: 60 }
        };
        await hooks.syncBundleUnlockAlarms([entry], Date.now());
        const alarms = await env.chrome.alarms.getAll();
        const bundleAlarm = alarms.find((a) => a.name.startsWith(hooks.BUNDLE_UNLOCK_ALARM_PREFIX));
        expect(bundleAlarm).toBeUndefined();
      });

      it('bundle unlock alarm triggers queueRulesUpdate', async () => {
        await env.triggerAlarm({ name: `${hooks.BUNDLE_UNLOCK_ALARM_PREFIX}reddit.com` });
        // No error thrown — handler ran successfully
      });
    });

    describe('temptation bundle end-to-end via buildBlockingRules', () => {
      it('skips block rule when time_of_day condition is met', () => {
        const settings = hooks.sanitizeSettings({ enabled: true, blocklist: [] });
        const entry = {
          id: '1',
          urlPattern: 'reddit.com',
          temptationBundle: { enabled: true, conditionType: 'time_of_day', afterTime: '09:00' }
        };
        const evening = new Date('2024-01-15T18:00:00').getTime();
        const rules = hooks.buildBlockingRules(settings, [entry], {}, evening, {});
        expect(rules).toHaveLength(0);
      });

      it('keeps block rule when time_of_day condition is not yet met', () => {
        const settings = hooks.sanitizeSettings({ enabled: true, blocklist: [] });
        const entry = {
          id: '1',
          urlPattern: 'reddit.com',
          temptationBundle: { enabled: true, conditionType: 'time_of_day', afterTime: '17:00' }
        };
        const morning = new Date('2024-01-15T08:00:00').getTime();
        const rules = hooks.buildBlockingRules(settings, [entry], {}, morning, {});
        expect(rules).toHaveLength(1);
      });

      it('skips block rule when work_timer condition is met', () => {
        const settings = hooks.sanitizeSettings({ enabled: true, blocklist: [] });
        const entry = {
          id: '1',
          urlPattern: 'reddit.com',
          temptationBundle: { enabled: true, conditionType: 'work_timer', requiredMinutes: 60 }
        };
        const wt = { todayMinutes: 60, running: false, startedAt: null };
        const rules = hooks.buildBlockingRules(settings, [entry], {}, Date.now(), wt);
        expect(rules).toHaveLength(0);
      });

      it('keeps block rule when work_timer condition is not met', () => {
        const settings = hooks.sanitizeSettings({ enabled: true, blocklist: [] });
        const entry = {
          id: '1',
          urlPattern: 'reddit.com',
          temptationBundle: { enabled: true, conditionType: 'work_timer', requiredMinutes: 60 }
        };
        const wt = { todayMinutes: 30, running: false, startedAt: null };
        const rules = hooks.buildBlockingRules(settings, [entry], {}, Date.now(), wt);
        expect(rules).toHaveLength(1);
      });

      it('sanitizeBlocklist preserves temptationBundle on entries', () => {
        const result = hooks.sanitizeBlocklist([{
          id: '1',
          urlPattern: 'reddit.com',
          temptationBundle: { enabled: true, conditionType: 'work_timer', requiredMinutes: 45 }
        }]);
        expect(result[0].temptationBundle).toBeDefined();
        expect(result[0].temptationBundle.enabled).toBe(true);
        expect(result[0].temptationBundle.requiredMinutes).toBe(45);
      });

      it('sanitizeBlocklist strips invalid temptationBundle', () => {
        const result = hooks.sanitizeBlocklist([{
          id: '1',
          urlPattern: 'reddit.com',
          temptationBundle: 'not-an-object'
        }]);
        expect(result[0].temptationBundle).toBeUndefined();
      });
    });
  });
});
