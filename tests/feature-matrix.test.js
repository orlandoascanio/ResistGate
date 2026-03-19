import { beforeEach, describe, expect, it } from 'vitest';
import { createChromeMock, loadScriptInVm } from './helpers/vm-env.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe('Feature Matrix Coverage', () => {
  let env;
  let hooks;

  function enableRuntimePro() {
    hooks.setRuntimeEntitlementForTests({ pro: true, email: 'pro@example.com' });
  }

  beforeEach(async () => {
    env = createChromeMock();
    const context = await loadScriptInVm('background.js', { chrome: env.chrome, fetch: env.fetch });
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

    it('does not unlock pro-only APIs from a local subscription flag alone', async () => {
      const settings = (await env.sendMessage({ action: 'getSettings' })).settings;
      settings.subscription = {
        tier: 'pro',
        billingCycle: 'monthly',
        upgradedAt: Date.now()
      };

      await env.sendMessage({ action: 'updateSettings', settings });
      const analytics = await env.sendMessage({ action: 'getAnalyticsDashboard' });

      expect(analytics.success).toBe(false);
      expect(analytics.proRequired).toBe(true);
    });
  });

  describe('Pro: Strict Mode Lock', () => {
    it('returns pending cooldown when trying to disable strict mode first time', () => {
      const current = hooks.sanitizeSettings({
        subscription: { tier: 'pro', billingCycle: 'monthly' },
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
        subscription: { tier: 'pro', billingCycle: 'monthly' },
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
      enableRuntimePro();
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
      enableRuntimePro();
      const status = await env.sendMessage({ action: 'getManualOverrideStatus' });
      expect(status.success).toBe(true);
      expect(status.status.requiredDelaySeconds).toBe(12);
    });

    it('increases required delay after successful overrides', async () => {
      enableRuntimePro();
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
      enableRuntimePro();
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

      enableRuntimePro();
      const proSettings = hooks.sanitizeSettings({
        subscription: { tier: 'pro', billingCycle: 'monthly' },
        proFeatures: { behavioralFriction: { enabled: true, earnAccessEnabled: true } }
      });
      expect(hooks.isEarnAccessActive(proSettings)).toBe(true);
    });

    it('rejects manual override when earn-access is active', async () => {
      enableRuntimePro();
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
      enableRuntimePro();
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
      enableRuntimePro();
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
      enableRuntimePro();
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
      enableRuntimePro();
      const res = await env.sendMessage({ action: 'getAnalyticsDashboard' });
      expect(res.dashboard.overrideFrequencyTrend).toHaveLength(7);
    });
  });

  describe('Pro: Focus Score and Weekly Report', () => {
    it('uses score formula 100 - overrides*5 - manualDisable*10', async () => {
      enableRuntimePro();
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
      enableRuntimePro();
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
      enableRuntimePro();
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
});
