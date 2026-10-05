import { describe, expect, it } from 'vitest';
import { createChromeMock, createBillingApiMock, loadScriptInVm } from './helpers/vm-env.js';

async function setupPage() {
  const env = createChromeMock();
  const api = createBillingApiMock();
  await loadScriptInVm('background.js', { chrome: env.chrome, fetch: api.fetch });
  const requests = [];
  env.chrome.runtime.sendMessage = (message, callback) => {
    requests.push(message);
    void env.sendMessage(message).then(callback);
  };
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', hidden: false, disabled: false, checked: false,
      dataset: {}, handlers: {}, focus() {}, scrollIntoView() {},
      addEventListener(name, fn) { this.handlers[name] = fn; }, setAttribute() {}
    });
    return elements.get(id);
  }
  const radios = ['easy', 'moderate', 'hard'].map((level) => Object.assign(element(level), { value: level }));
  const document = {
    addEventListener: (name, fn) => { document[name] = fn; },
    getElementById: element,
    querySelectorAll: () => [],
    querySelector: (selector) => selector.includes(':checked') ? radios.find((radio) => radio.checked)
      : radios.find((radio) => selector.includes(`"${radio.value}"`))
  };
  const context = await loadScriptInVm('welcome/welcome.js', {
    chrome: env.chrome, document,
    window: { addEventListener() {}, location: { hash: '' }, close() {} }
  });
  const hooks = context.__RESISTGATE_WELCOME_TEST_HOOKS__;
  return { env, hooks, element, document, requests, radios };
}

const event = { preventDefault() {} };

describe('Welcome page flow', () => {
  it('loads the actual difficulty, adds a selected site, and shows confirmed blocking', async () => {
    const page = await setupPage();
    await page.hooks.loadWelcomeState();
    expect(page.radios.find((radio) => radio.checked).value).toBe('hard');
    expect(page.element('site-input').value).toBe('');
    expect(page.element('saved-setup').hidden).toBe(true);
    page.element('site-input').value = 'reddit.com';
    await page.hooks.saveWelcomeSetup(event);
    expect(page.element('saved-title').textContent).toBe('reddit.com is now blocked.');
    expect(page.element('test-site-btn').hidden).toBe(false);
    expect(page.element('access-summary').textContent).toContain('15 minutes');
    page.element('reminder-input').value = 'Finish my assignment';
    await page.hooks.saveWelcomeReminder(event);
    expect(page.element('reminder-status').textContent).toBe('Reminder saved.');
    await page.hooks.loadWelcomeState();
    expect(page.element('reminder-input').value).toBe('Finish my assignment');
  });

  it('preserves input and offers retry instead of success after enforcement failure', async () => {
    const page = await setupPage();
    await page.hooks.loadWelcomeState();
    const update = page.env.chrome.declarativeNetRequest.updateSessionRules;
    page.env.chrome.declarativeNetRequest.updateSessionRules = async () => { throw new Error('Rules unavailable'); };
    page.element('site-input').value = 'reddit.com';
    await page.hooks.saveWelcomeSetup(event);
    expect(page.element('welcome-status').textContent).toContain('Rules unavailable');
    expect(page.element('site-input').value).toBe('reddit.com');
    expect(page.element('saved-setup').hidden).toBe(true);
    expect(page.element('retry-btn').hidden).toBe(false);
    page.env.chrome.declarativeNetRequest.updateSessionRules = update;
    await page.hooks.loadWelcomeState();
    expect(page.element('saved-title').textContent).toBe('reddit.com is now blocked.');
  });

  it('never claims a saved site is blocking during temporary access or paused settings', async () => {
    const page = await setupPage();
    await page.env.sendMessage({ action: 'saveWelcomeSetup', domain: 'reddit.com', level: 'easy' });
    await page.env.sendMessage({ action: 'grantTemporaryAccess', urlPattern: 'reddit.com', duration: 5 });
    await page.hooks.loadWelcomeState();
    expect(page.element('saved-title').textContent).toBe('reddit.com is saved.');
    expect(page.element('test-site-btn').hidden).toBe(true);
    expect(page.element('saved-summary').textContent).toContain('not blocking right now');
  });

  it('keeps a dirty reminder bound to its original site after removal in Settings', async () => {
    const page = await setupPage();
    await page.env.sendMessage({ action: 'saveWelcomeSetup', domain: 'reddit.com', level: 'easy' });
    await page.env.sendMessage({ action: 'saveWelcomeSetup', domain: 'youtube.com', level: 'easy' });
    page.document.DOMContentLoaded();
    await page.hooks.loadWelcomeState();
    page.element('reminder-input').value = 'Draft for reddit';
    page.element('reminder-input').handlers.input();
    const { settings } = await page.env.sendMessage({ action: 'getSettings' });
    settings.blocklist = settings.blocklist.filter((entry) => entry.urlPattern !== 'reddit.com');
    await page.env.sendMessage({ action: 'updateSettings', settings });
    await page.hooks.loadWelcomeState();
    expect(page.element('reminder-label').textContent).toBe('Reminder for reddit.com');
    expect(page.element('reminder-input').value).toBe('Draft for reddit');
    expect(page.element('save-reminder-btn').disabled).toBe(true);
    await page.hooks.saveWelcomeReminder(event);
    const current = await page.env.sendMessage({ action: 'getSettings' });
    expect(current.settings.blocklist[0].personalGoal).toBeUndefined();
  });

  it('the demo matches the real Easy intention challenge and never requests access or saves settings', async () => {
    const page = await setupPage();
    const real = await loadScriptInVm('intention-page/script.js', { document: { addEventListener() {} } });
    real.__RESISTGATE_INTENTION_TEST_HOOKS__.__setCurrentSettingsForTest({ challengeTypes: { typing: { level: 'easy' } } });
    expect(page.hooks.DEMO_PHRASE).toBe(real.__RESISTGATE_INTENTION_TEST_HOOKS__.getChallengeText());
    page.hooks.showDemoPanel('challenge');
    page.element('demo-input').value = `${page.hooks.DEMO_PHRASE} `;
    page.hooks.updateDemoProgress();
    expect(page.element('demo-finish-btn').disabled).toBe(true);
    page.element('demo-input').value = page.hooks.DEMO_PHRASE;
    page.hooks.updateDemoProgress();
    expect(page.element('demo-finish-btn').disabled).toBe(false);
    page.hooks.showDemoPanel('success');
    expect(page.element('demo-success').hidden).toBe(false);
    expect(page.requests).toEqual([]);
    expect((await page.env.sendMessage({ action: 'getSettings' })).settings.blocklist).toEqual([]);
  });
});
