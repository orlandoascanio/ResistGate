import { describe, expect, it } from 'vitest';
import { loadScriptInVm } from './helpers/vm-env.js';

function createIntentionDom() {
  const elements = {};
  const classSets = {};
  const reasonButtons = ['work', 'research', 'message', 'quick_break', 'avoiding_work'].map((reason) => ({
    reason,
    attrs: { 'data-reason': reason },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    getAttribute(name) {
      return this.attrs[name];
    },
    addEventListener() {}
  }));

  function makeElement(id) {
    classSets[id] = new Set(id === 'breathing-exercise' || id === 'pro-intent-card' ? ['hidden'] : []);
    return {
      id,
      textContent: '',
      value: '',
      href: '',
      disabled: false,
      style: {},
      classList: {
        add: (className) => classSets[id].add(className),
        remove: (className) => classSets[id].delete(className),
        contains: (className) => classSets[id].has(className),
        toggle: (className, force) => {
          const shouldAdd = force === undefined ? !classSets[id].has(className) : Boolean(force);
          if (shouldAdd) {
            classSets[id].add(className);
          } else {
            classSets[id].delete(className);
          }
          return shouldAdd;
        }
      },
      setAttribute() {},
      getAttribute() { return null; },
      addEventListener() {},
      focus() {}
    };
  }

  const document = {
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: (selector) => (selector === '[data-reason]' ? reasonButtons : []),
    getElementById: (id) => {
      if (!elements[id]) {
        elements[id] = makeElement(id);
      }
      return elements[id];
    }
  };

  return { document, elements, classSets, reasonButtons };
}

async function loadIntentionPage(overrides = {}) {
  const dom = createIntentionDom();
  const context = await loadScriptInVm('intention-page/script.js', {
    document: dom.document,
    window: {
      location: { search: '?originalUrl=https%3A%2F%2Fwww.reddit.com', href: '' },
      close: () => {},
      history: { length: 1, back: () => {} },
      ...overrides.window
    },
    location: { reload: () => {} },
    chrome: {
      runtime: {
        getURL: (path) => `chrome-extension://resistgate/${path}`,
        sendMessage: () => {},
        ...overrides.chromeRuntime
      }
    },
    sessionStorage: overrides.sessionStorage || {
      setItem() {},
      getItem: () => null
    },
    alert: () => {},
    confirm: () => true
  });

  return { context, ...dom };
}

describe('Intention page pause layer', () => {
  it('lets free users continue after reading the reminder without choosing a reason', async () => {
    const { context, elements } = await loadIntentionPage();
    const hooks = context.__RESISTGATE_INTENTION_TEST_HOOKS__;
    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'free' },
      proFeatures: { intentionPage: { enabled: true, showBreathingExercise: false } },
      blocklist: [{ id: '1', urlPattern: 'reddit.com', personalGoal: 'Use Reddit for research, not procrastination.' }]
    });
    hooks.__setOriginalUrlForTest('https://www.reddit.com');

    hooks.renderIntentionPage();

    expect(elements['personal-goal-display'].textContent).toBe('Use Reddit for research, not procrastination.');
    expect(elements['continue-to-challenge'].disabled).toBe(false);

    hooks.selectReason('research');

    expect(elements['continue-to-challenge'].disabled).toBe(false);
  });

  it('keeps continue disabled until the optional breathing pause completes', async () => {
    const { context, elements, classSets } = await loadIntentionPage();
    const hooks = context.__RESISTGATE_INTENTION_TEST_HOOKS__;
    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'free' },
      proFeatures: { intentionPage: { enabled: true, showBreathingExercise: true } },
      blocklist: [{ id: '1', urlPattern: 'reddit.com' }]
    });
    hooks.__setOriginalUrlForTest('https://www.reddit.com');

    hooks.renderIntentionPage();

    expect(classSets['breathing-exercise'].has('hidden')).toBe(false);
    expect(elements['continue-to-challenge'].disabled).toBe(true);

    hooks.__setBreathingPauseCompleteForTest(true);
    hooks.updateDecisionState();

    expect(elements['continue-to-challenge'].disabled).toBe(false);
    hooks.stopBreathingCountdown();
  });

  it('requires the Pro behavioral friction prompt when enabled', async () => {
    const { context, elements, classSets } = await loadIntentionPage();
    const hooks = context.__RESISTGATE_INTENTION_TEST_HOOKS__;
    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      proFeatures: {
        intentionPage: { enabled: true, showBreathingExercise: false },
        behavioralFriction: { enabled: true, requireTaskIntent: true }
      },
      blocklist: [{ id: '1', urlPattern: 'reddit.com' }]
    });
    hooks.__setOriginalUrlForTest('https://www.reddit.com');

    hooks.renderIntentionPage();

    expect(classSets['pro-intent-card'].has('hidden')).toBe(false);
    expect(elements['continue-to-challenge'].disabled).toBe(true);

    elements['task-intent-input'].value = 'Publish the launch update';
    hooks.updateDecisionState();

    expect(elements['continue-to-challenge'].disabled).toBe(false);
  });

  it('continues to the in-page challenge after the decision is valid', async () => {
    const stored = {};
    const windowState = { location: { search: '?originalUrl=https%3A%2F%2Fwww.reddit.com', href: '' } };
    const { context, elements, classSets } = await loadIntentionPage({
      window: windowState,
      sessionStorage: {
        setItem: (key, value) => { stored[key] = value; },
        getItem: (key) => stored[key] || null
      }
    });
    const hooks = context.__RESISTGATE_INTENTION_TEST_HOOKS__;
    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'free' },
      proFeatures: { intentionPage: { enabled: true, showBreathingExercise: false } },
      blocklist: [{ id: '1', urlPattern: 'reddit.com' }]
    });
    hooks.__setOriginalUrlForTest('https://www.reddit.com');

    hooks.renderIntentionPage();
    hooks.handleContinueToChallenge();

    expect(elements['continue-to-challenge'].disabled).toBe(false);
    expect(windowState.location.href).toBe('');
    expect(classSets['pause-panel'].has('hidden')).toBe(true);
    expect(classSets['challenge-panel'].has('hidden')).toBe(false);
    expect(elements['challenge-text'].textContent).toBe('I will use this site for my stated purpose, avoid autopilot, and leave when my access window ends.');
    expect(String(elements['challenge-length'].textContent)).toBe(String(elements['challenge-text'].textContent.length));
    expect(stored.resistgateIntentionPrecheck).toContain('"reason":""');
  });

  it('types the pro custom phrase instead of the built-in challenge line', async () => {
    const { context } = await loadIntentionPage();
    const hooks = context.__RESISTGATE_INTENTION_TEST_HOOKS__;
    const customChallengePhrase = { enabled: true, text: 'I promised myself deep work until noon.' };

    hooks.__setCurrentSettingsForTest({
      challengeTypes: { typing: { level: 'easy' } },
      subscription: { tier: 'pro' },
      proFeatures: { intentionPage: { enabled: true }, customChallengePhrase }
    });
    expect(hooks.getChallengeText()).toBe('I promised myself deep work until noon.');

    // A lapsed subscription must not keep the user's phrase in place of the built-in line.
    hooks.__setCurrentSettingsForTest({
      challengeTypes: { typing: { level: 'easy' } },
      subscription: { tier: 'free' },
      proFeatures: { intentionPage: { enabled: true }, customChallengePhrase }
    });
    expect(hooks.getCustomChallengePhrase()).toBe('');
    expect(hooks.getChallengeText()).toBe('I am choosing this visit intentionally.');
  });

  it('grants temporary access from the in-page challenge', async () => {
    let grantRequest = null;
    const { context, elements, classSets } = await loadIntentionPage({
      chromeRuntime: {
        sendMessage: (request, callback) => {
          if (request.action === 'grantTemporaryAccess') {
            grantRequest = request;
            callback({ success: true, access: { expiresAt: Date.now() + 300000 } });
          }
        }
      }
    });
    const hooks = context.__RESISTGATE_INTENTION_TEST_HOOKS__;
    hooks.__setCurrentSettingsForTest({
      defaultAccessDuration: 7,
      challengeTypes: { typing: { level: 'easy' } },
      subscription: { tier: 'free' },
      proFeatures: { intentionPage: { enabled: true, showBreathingExercise: false } },
      blocklist: [{ id: '1', urlPattern: 'reddit.com' }]
    });
    hooks.__setOriginalUrlForTest('https://www.reddit.com');

    hooks.startInPageChallenge();
    elements['typing-input'].value = hooks.getChallengeText();
    hooks.updateChallengeState();
    hooks.completeChallenge();

    expect(grantRequest.urlPattern).toBe('www.reddit.com');
    expect(grantRequest.duration).toBe(7);
    expect(grantRequest.meta.method).toBe('challenge');
    expect(classSets['success-panel'].has('hidden')).toBe(false);
    expect(elements['continue-to-site'].href).toBe('https://www.reddit.com/');
  });
});
