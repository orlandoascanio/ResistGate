import { describe, it, expect, beforeEach } from 'vitest';
import { createChromeMock, loadScriptInVm } from './helpers/vm-env.js';

function createDocumentWithValues(values = {}) {
  return {
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: (id) => ({
      value: values[id] ?? '',
      textContent: '',
      classList: {
        add: () => {},
        remove: () => {}
      },
      style: {},
      disabled: false,
      addEventListener: () => {}
    })
  };
}

describe('Friction page flow logic', () => {
  let hooks;

  beforeEach(async () => {
    const env = createChromeMock();
    const context = await loadScriptInVm('friction-page/script.js', {
      chrome: env.chrome,
      document: createDocumentWithValues(),
      window: { location: { search: '' }, close: () => {} },
      location: { reload: () => {} },
      alert: () => {},
      confirm: () => true
    });

    hooks = context.__RESISTGATE_FRICTION_TEST_HOOKS__;
  });

  it('validates and sanitizes destination URLs safely', () => {
    expect(hooks.getSafeTargetUrl('https://example.com/path')).toBe('https://example.com/path');
    expect(hooks.getSafeTargetUrl('http://example.com')).toBe('http://example.com/');
    expect(hooks.getSafeTargetUrl('javascript:alert(1)')).toBeNull();
    expect(hooks.getSafeTargetUrl('not-a-url')).toBeNull();
  });

  it('formats challenge timer values as mm:ss', () => {
    expect(hooks.formatTime(0)).toBe('00:00');
    expect(hooks.formatTime(9)).toBe('00:09');
    expect(hooks.formatTime(125)).toBe('02:05');
  });

  it('detects earn-access activation by plan + friction settings', () => {
    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'free' },
      proFeatures: { behavioralFriction: { enabled: true, earnAccessEnabled: true } }
    });
    expect(hooks.isEarnAccessRuleActive()).toBe(false);

    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      proFeatures: { behavioralFriction: { enabled: true, earnAccessEnabled: true } }
    });
    expect(hooks.isEarnAccessRuleActive()).toBe(true);
  });

  it('clamps earn-access minimum seconds to safe bounds', () => {
    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      proFeatures: { behavioralFriction: { earnAccessMinChallengeSeconds: 10 } }
    });
    expect(hooks.getEarnAccessMinChallengeSeconds()).toBe(30);

    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      proFeatures: { behavioralFriction: { earnAccessMinChallengeSeconds: 1500 } }
    });
    expect(hooks.getEarnAccessMinChallengeSeconds()).toBe(900);
  });

  it('resolves challenge level from saved settings and legacy difficulty', () => {
    expect(hooks.getTypingChallengeLevel({
      challengeTypes: { typing: { level: 'easy', difficulty: 3 } }
    })).toBe('easy');
    expect(hooks.getTypingChallengeLevel({
      challengeTypes: { typing: { difficulty: 2 } }
    })).toBe('moderate');
    expect(hooks.getTypingChallengeLevel({
      challengeTypes: { typing: { difficulty: 3 } }
    })).toBe('hard');
  });

  it('builds graduated typing challenge segments', () => {
    const easy = hooks.buildTypingChallengeSegments('easy');
    const moderate = hooks.buildTypingChallengeSegments('moderate');
    const hard = hooks.buildTypingChallengeSegments('hard');

    expect(easy).toHaveLength(1);
    expect(easy[0].text).toMatch(/^[A-Z2-9]{12}$/);
    expect(moderate).toHaveLength(1);
    expect(moderate[0].text.split('.').filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(moderate[0].text.split('.').filter(Boolean).length).toBeLessThanOrEqual(2);
    expect(hard).toHaveLength(5);
    expect(new Set(hard.map((segment) => segment.text))).toHaveLength(5);
  });

  it('keeps a large unique bank for hard challenge paragraphs', () => {
    const promptBank = hooks.getChallengePromptBank();

    expect(promptBank.length).toBeGreaterThanOrEqual(50);
    expect(new Set(promptBank)).toHaveLength(promptBank.length);
  });

  it('keeps moderate challenge prompts to one or two sentences', () => {
    const sentenceBank = hooks.getModerateChallengeSentenceBank();

    expect(sentenceBank.length).toBeGreaterThanOrEqual(20);
    expect(sentenceBank.every((sentence) => sentence.split('.').filter(Boolean).length === 1)).toBe(true);

    for (let i = 0; i < 20; i++) {
      const [{ text }] = hooks.buildTypingChallengeSegments('moderate');
      const sentenceCount = text.split('.').filter(Boolean).length;
      expect(sentenceCount).toBeGreaterThanOrEqual(1);
      expect(sentenceCount).toBeLessThanOrEqual(2);
    }
  });

  it('varies hard challenge paragraphs across builds', async () => {
    let randomIndex = 0;
    const randomValues = [0.12, 0.77, 0.33, 0.91, 0.48, 0.04, 0.66, 0.21, 0.59, 0.83];
    const math = Object.create(Math);
    math.random = () => {
      const value = randomValues[randomIndex % randomValues.length];
      randomIndex++;
      return value;
    };

    const env = createChromeMock();
    const context = await loadScriptInVm('friction-page/script.js', {
      chrome: env.chrome,
      document: createDocumentWithValues(),
      window: { location: { search: '' }, close: () => {} },
      location: { reload: () => {} },
      alert: () => {},
      confirm: () => true,
      Math: math
    });
    const localHooks = context.__RESISTGATE_FRICTION_TEST_HOOKS__;

    const firstHardChallenge = localHooks.buildTypingChallengeSegments('hard').map((segment) => segment.text);
    const secondHardChallenge = localHooks.buildTypingChallengeSegments('hard').map((segment) => segment.text);

    expect(secondHardChallenge).not.toEqual(firstHardChallenge);
  });

  it('returns expected earn-access bonus tiers', () => {
    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      proFeatures: { behavioralFriction: { enabled: true, earnAccessEnabled: true } }
    });

    expect(hooks.getEarnAccessBonus(200)).toBe(5);
    expect(hooks.getEarnAccessBonus(300)).toBe(2);
    expect(hooks.getEarnAccessBonus(500)).toBe(0);
  });

  it('collectPrecheckMeta returns default valid flow for non-pro users', async () => {
    const env = createChromeMock();
    const context = await loadScriptInVm('friction-page/script.js', {
      chrome: env.chrome,
      document: createDocumentWithValues(),
      window: { location: { search: '' }, close: () => {} },
      location: { reload: () => {} },
      alert: () => {},
      confirm: () => true
    });

    const localHooks = context.__RESISTGATE_FRICTION_TEST_HOOKS__;
    localHooks.__setCurrentSettingsForTest({
      subscription: { tier: 'free' },
      proFeatures: { behavioralFriction: { enabled: false } }
    });

    const result = localHooks.collectPrecheckMeta();
    expect(result.valid).toBe(true);
    expect(result.timedWaitSeconds).toBe(0);
  });

  it('collectPrecheckMeta requires task intent when configured', async () => {
    const env = createChromeMock();
    const context = await loadScriptInVm('friction-page/script.js', {
      chrome: env.chrome,
      document: createDocumentWithValues({
        'task-intent-input': 'go'
      }),
      window: { location: { search: '' }, close: () => {} },
      location: { reload: () => {} },
      alert: () => {},
      confirm: () => true
    });

    const localHooks = context.__RESISTGATE_FRICTION_TEST_HOOKS__;
    localHooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      proFeatures: {
        behavioralFriction: {
          enabled: true,
          requireTaskIntent: true,
          timedWaitEnabled: false
        }
      }
    });

    const result = localHooks.collectPrecheckMeta();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Describe what you\'re here to do');
  });

  it('collectPrecheckMeta requires custom prompt answer when custom prompt is set', async () => {
    const env = createChromeMock();
    const context = await loadScriptInVm('friction-page/script.js', {
      chrome: env.chrome,
      document: createDocumentWithValues({
        'task-intent-input': 'Finish the report',
        'custom-challenge-input': ' '
      }),
      window: { location: { search: '' }, close: () => {} },
      location: { reload: () => {} },
      alert: () => {},
      confirm: () => true
    });

    const localHooks = context.__RESISTGATE_FRICTION_TEST_HOOKS__;
    localHooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      proFeatures: {
        behavioralFriction: {
          enabled: true,
          requireTaskIntent: true,
          customChallengePrompt: 'Why this task?'
        }
      }
    });

    const result = localHooks.collectPrecheckMeta();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Complete the check to continue');
  });

  it('collectPrecheckMeta returns full valid payload when inputs are complete', async () => {
    const env = createChromeMock();
    const context = await loadScriptInVm('friction-page/script.js', {
      chrome: env.chrome,
      document: createDocumentWithValues({
        'task-intent-input': 'Check one work message and leave',
        'custom-challenge-input': 'done'
      }),
      window: { location: { search: '' }, close: () => {} },
      location: { reload: () => {} },
      alert: () => {},
      confirm: () => true
    });

    const localHooks = context.__RESISTGATE_FRICTION_TEST_HOOKS__;
    localHooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      proFeatures: {
        behavioralFriction: {
          enabled: true,
          requireTaskIntent: true,
          customChallengePrompt: 'Why this task?',
          timedWaitEnabled: true,
          timedWaitSeconds: 25,
          earnAccessEnabled: true
        }
      }
    });

    const result = localHooks.collectPrecheckMeta();
    expect(result.valid).toBe(true);
    expect(result.timedWaitSeconds).toBe(25);
    expect(result.customChallengeAnswered).toBe(true);
    expect(result.earnAccessEnabled).toBe(true);
  });

  it('renderIntentionPage uses per-domain goal from blocklist entry', async () => {
    const env = createChromeMock();
    const mockElements = {};
    const mockDoc = {
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: (id) => {
        if (!mockElements[id]) {
          mockElements[id] = {
            textContent: '',
            classList: { add: () => {}, remove: () => {} },
            style: {},
            disabled: false,
            addEventListener: () => {}
          };
        }
        return mockElements[id];
      }
    };
    const context = await loadScriptInVm('friction-page/script.js', {
      chrome: env.chrome,
      document: mockDoc,
      window: { location: { search: '?originalUrl=https%3A%2F%2Fwww.instagram.com' }, close: () => {} },
      location: { reload: () => {} },
      alert: () => {},
      confirm: () => true
    });

    const localHooks = context.__RESISTGATE_FRICTION_TEST_HOOKS__;
    localHooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      proFeatures: {
        intentionPage: { enabled: true, showBreathingExercise: false }
      },
      blocklist: [
        { id: '1', urlPattern: 'instagram.com', personalGoal: 'Stop watching reels' }
      ]
    });
    localHooks.__setOriginalUrlForTest('https://www.instagram.com');

    localHooks.PHASES.INTENTION = 'intention';
    localHooks.renderIntentionPage();

    expect(mockElements['personal-goal-display'].textContent).toBe('Stop watching reels');
    expect(mockElements['intention-label'].textContent).toBe('Remember your goal');
  });

  it('renderIntentionPage shows default message when blocklist entry has no goal', async () => {
    const env = createChromeMock();
    const mockElements = {};
    const mockDoc = {
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: (id) => {
        if (!mockElements[id]) {
          mockElements[id] = {
            textContent: '',
            classList: { add: () => {}, remove: () => {} },
            style: {},
            disabled: false,
            addEventListener: () => {}
          };
        }
        return mockElements[id];
      }
    };
    const context = await loadScriptInVm('friction-page/script.js', {
      chrome: env.chrome,
      document: mockDoc,
      window: { location: { search: '?originalUrl=https%3A%2F%2Fwww.reddit.com' }, close: () => {} },
      location: { reload: () => {} },
      alert: () => {},
      confirm: () => true
    });

    const localHooks = context.__RESISTGATE_FRICTION_TEST_HOOKS__;
    localHooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      proFeatures: {
        intentionPage: { enabled: true, showBreathingExercise: false }
      },
      blocklist: [
        { id: '1', urlPattern: 'reddit.com' }
      ]
    });
    localHooks.__setOriginalUrlForTest('https://www.reddit.com');

    localHooks.PHASES.INTENTION = 'intention';
    localHooks.renderIntentionPage();

    expect(mockElements['personal-goal-display'].textContent).toBe('You blocked this for a reason.');
    expect(mockElements['intention-label'].textContent).toBe('Pause before proceeding');
  });
});
