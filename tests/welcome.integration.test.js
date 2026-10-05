import { beforeEach, describe, expect, it } from 'vitest';
import { createChromeMock, loadScriptInVm } from './helpers/vm-env.js';

const trustedSender = { url: 'https://www.orlandoascanio.com/resistgate/installed' };

describe('Welcome setup and website bridge', () => {
  let env;
  beforeEach(async () => {
    env = createChromeMock();
    await loadScriptInVm('background.js', { chrome: env.chrome });
    await env.sendMessage({ action: 'getSettings' });
  });

  it('reports an empty blocklist honestly and preserves the actual Hard default', async () => {
    const response = await env.sendExternalMessage({ action: 'getOnboardingState' }, trustedSender);
    expect(response).toEqual({ success: true, state: {
      siteCount: 0, activeSiteCount: 0, enabled: true, level: 'hard', accessMinutes: 15, intentionEnabled: false
    } });
  });

  it('opens only the fixed local setup page and rejects an arbitrary destination', async () => {
    for (const section of ['setup', 'difficulty', 'preview']) {
      expect(await env.sendExternalMessage({ action: 'openOnboarding', section }, trustedSender)).toEqual({ success: true });
      expect(env.createdTabs.at(-1).url).toBe(`chrome-extension://resistgate/welcome/welcome.html#${section}`);
    }
    expect((await env.sendExternalMessage({ action: 'openOnboarding' }, trustedSender)).success).toBe(true);
    const count = env.createdTabs.length;
    expect((await env.sendExternalMessage({ action: 'openOnboarding', section: 'https://evil.example' }, trustedSender)).success).toBe(false);
    expect(env.createdTabs).toHaveLength(count);
  });

  it('rejects untrusted origins and all external writes', async () => {
    for (const url of ['https://evil.example', 'http://orlandoascanio.com', 'https://orlandoascanio.com.evil.example']) {
      for (const action of ['getOnboardingState', 'openOnboarding']) {
        expect((await env.sendExternalMessage({ action }, { url })).success).toBe(false);
      }
    }
    expect((await env.sendExternalMessage({ action: 'saveWelcomeSetup', domain: 'reddit.com', level: 'easy' }, trustedSender)).success).toBe(false);
    expect((await env.sendExternalMessage({ action: 'getWelcomeState' }, trustedSender)).success).toBe(false);
  });

  it('surfaces tab creation errors without claiming setup opened', async () => {
    env.chrome.tabs.create = async () => { throw new Error('Could not open a tab'); };
    expect(await env.sendExternalMessage({ action: 'openOnboarding' }, trustedSender)).toEqual({ success: false, error: 'Could not open a tab' });
  });

  it('saves one selected site, its chosen difficulty, and real rules before reporting success', async () => {
    await env.triggerInstalled({ reason: 'install' });
    const result = await env.sendMessage({ action: 'saveWelcomeSetup', domain: 'https://www.Reddit.com/r/focus', level: 'moderate' });
    expect(result.success).toBe(true);
    expect(result.savedDomain).toBe('reddit.com');
    expect(result.settings.blocklist.map((site) => site.urlPattern)).toEqual(['reddit.com']);
    expect(result.settings.challengeTypes.typing).toMatchObject({ difficulty: 2, level: 'moderate' });
    expect(result.activeDomains).toEqual(['reddit.com']);
    const rules = await env.chrome.declarativeNetRequest.getSessionRules();
    expect(rules[0].action.redirect.url).toContain('intention-page/index.html');
  });

  it('keeps www.com as a valid domain instead of stripping it into an empty blocklist', async () => {
    const response = await env.sendMessage({ action: 'saveWelcomeSetup', domain: 'www.com', level: 'easy' });
    expect(response.success).toBe(true);
    expect(response.savedDomain).toBe('www.com');
    expect(response.settings.blocklist[0].urlPattern).toBe('www.com');
  });

  it('keeps sites and personal reminders private in the website summary', async () => {
    await env.sendMessage({ action: 'saveWelcomeSetup', domain: 'reddit.com', level: 'easy' });
    const result = await env.sendMessage({ action: 'saveWelcomeReminder', domain: 'reddit.com', personalGoal: '  Finish my private assignment  ' });
    expect(result.settings.blocklist[0].personalGoal).toBe('Finish my private assignment');
    const publicState = await env.sendExternalMessage({ action: 'getOnboardingState' }, trustedSender);
    expect(publicState.state.siteCount).toBe(1);
    expect(JSON.stringify(publicState)).not.toContain('reddit');
    expect(JSON.stringify(publicState)).not.toContain('assignment');
    expect(Object.keys(publicState.state).sort()).toEqual(['siteCount', 'activeSiteCount', 'enabled', 'level', 'accessMinutes', 'intentionEnabled'].sort());
  });

  it('resumes actual settings and never clears existing sites, reminders, schedules, or the plan', async () => {
    const current = await env.sendMessage({ action: 'getSettings' });
    current.settings.enabled = false;
    current.settings.defaultAccessDuration = 7;
    current.settings.freeExperience.schedule.enabled = true;
    current.settings.blocklist = [{ urlPattern: 'www.youtube.com', personalGoal: 'Study', id: 'keep' }];
    await env.sendMessage({ action: 'updateSettings', settings: current.settings });
    const result = await env.sendMessage({ action: 'saveWelcomeSetup', domain: 'youtube.com', level: 'hard', subscription: { tier: 'pro' } });
    expect(result.settings.blocklist).toHaveLength(1);
    expect(result.settings.blocklist[0]).toMatchObject({ id: 'keep', personalGoal: 'Study' });
    expect(result.settings).toMatchObject({ enabled: false, defaultAccessDuration: 7 });
    expect(result.settings).not.toHaveProperty('subscription');
    expect(result.settings.freeExperience.schedule.enabled).toBe(true);
    expect(result.activeDomains).toEqual([]);
    const resumed = await env.sendMessage({ action: 'getWelcomeState' });
    expect(resumed.settings.blocklist[0].personalGoal).toBe('Study');
  });

  it('allows difficulty-only updates for existing setups and keeps temporary access intact', async () => {
    await env.sendMessage({ action: 'saveWelcomeSetup', domain: 'reddit.com', level: 'easy' });
    await env.sendMessage({ action: 'grantTemporaryAccess', urlPattern: 'reddit.com', duration: 5 });
    const result = await env.sendMessage({ action: 'saveWelcomeSetup', domain: '', level: 'hard' });
    expect(result.success).toBe(true);
    expect(result.activeDomains).toEqual([]);
    const summary = await env.sendExternalMessage({ action: 'getOnboardingState' }, trustedSender);
    expect(summary.state).toMatchObject({ siteCount: 1, activeSiteCount: 0, level: 'hard' });
  });

  it('serializes simultaneous setup saves instead of losing one site', async () => {
    const results = await Promise.all([
      env.sendMessage({ action: 'saveWelcomeSetup', domain: 'reddit.com', level: 'easy' }),
      env.sendMessage({ action: 'saveWelcomeSetup', domain: 'youtube.com', level: 'moderate' })
    ]);
    expect(results.every((result) => result.success)).toBe(true);
    const { settings } = await env.sendMessage({ action: 'getSettings' });
    expect(settings.blocklist).toHaveLength(2);
    expect(settings.challengeTypes.typing.level).toBe('moderate');
  });

  it.each(['', 'https://', 'nope', 'bad..com', '-bad.com', 'bad-.com', 'javascript:alert(1)', 'https://localhost'])('rejects invalid initial site %s without saving', async (domain) => {
    const result = await env.sendMessage({ action: 'saveWelcomeSetup', domain, level: 'easy' });
    expect(result.success).toBe(false);
    expect((await env.sendMessage({ action: 'getSettings' })).settings.blocklist).toEqual([]);
  });

  it('validates difficulty and reminders and recovers for the next valid save', async () => {
    expect((await env.sendMessage({ action: 'saveWelcomeSetup', domain: 'reddit.com', level: 'toString' })).success).toBe(false);
    expect((await env.sendMessage({ action: 'saveWelcomeSetup', domain: 'reddit.com', level: 'easy' })).success).toBe(true);
    expect((await env.sendMessage({ action: 'saveWelcomeReminder', domain: 'missing.com', personalGoal: 'Read' })).success).toBe(false);
    for (const personalGoal of [null, 'a'.repeat(201)]) {
      expect((await env.sendMessage({ action: 'saveWelcomeReminder', domain: 'reddit.com', personalGoal })).success).toBe(false);
    }
    expect((await env.sendMessage({ action: 'saveWelcomeReminder', domain: 'reddit.com', personalGoal: '' })).success).toBe(true);
  });

  it('does not claim success when rules fail, and retry can recover persisted setup', async () => {
    env.chrome.declarativeNetRequest.updateSessionRules = async () => { throw new Error('Rule update unavailable'); };
    expect(await env.sendMessage({ action: 'saveWelcomeSetup', domain: 'reddit.com', level: 'easy' })).toEqual({ success: false, error: 'Rule update unavailable' });
    expect((await env.sendExternalMessage({ action: 'getOnboardingState' }, trustedSender)).success).toBe(false);
  });

  it.each(['strict', 'commitment'])('preserves the %s lock for all welcome writes', async (mode) => {
    await env.sendMessage({ action: 'saveWelcomeSetup', domain: 'reddit.com', level: 'easy' });
    if (mode === 'strict') {
      const { settings } = await env.sendMessage({ action: 'getSettings' });
      settings.proFeatures.strictModeEnabled = true;
      await env.sendMessage({ action: 'updateSettings', settings });
    } else {
      await env.sendMessage({ action: 'activateCommitmentMode', durationHours: 1 });
    }
    expect((await env.sendMessage({ action: 'saveWelcomeSetup', domain: 'youtube.com', level: 'hard' })).success).toBe(false);
    expect((await env.sendMessage({ action: 'saveWelcomeReminder', domain: 'reddit.com', personalGoal: 'changed' })).success).toBe(false);
    expect((await env.sendMessage({ action: 'getSettings' })).settings.blocklist).toHaveLength(1);
  });
});
