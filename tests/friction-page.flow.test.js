import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  it('uses a pro custom phrase as the whole challenge, whatever the level', () => {
    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      challengeTypes: { typing: { level: 'hard' } },
      proFeatures: {
        customChallengePhrase: { enabled: true, text: 'I promised myself deep work until noon.' }
      }
    });

    expect(hooks.getEffectiveChallengeLevel()).toBe('custom');
    const segments = hooks.buildTypingChallengeSegments();
    expect(segments).toEqual([{ text: 'I promised myself deep work until noon.' }]);
    expect(hooks.getChallengeLevelCopy('custom').unitLabel).toBe('Phrase');
  });

  it('ignores a custom phrase left behind by a lapsed pro subscription', () => {
    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'free' },
      challengeTypes: { typing: { level: 'hard' } },
      proFeatures: {
        customChallengePhrase: { enabled: true, text: 'let me in' }
      }
    });

    expect(hooks.getCustomChallengePhrase()).toBe('');
    expect(hooks.getEffectiveChallengeLevel()).toBe('hard');
    expect(hooks.buildTypingChallengeSegments()).toHaveLength(5);
  });

  it('falls back to the level bank when the custom phrase is off or empty', () => {
    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      challengeTypes: { typing: { level: 'easy' } },
      proFeatures: {
        customChallengePhrase: { enabled: false, text: 'I promised myself deep work until noon.' }
      }
    });
    expect(hooks.getEffectiveChallengeLevel()).toBe('easy');

    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      challengeTypes: { typing: { level: 'easy' } },
      proFeatures: { customChallengePhrase: { enabled: true, text: '   ' } }
    });
    expect(hooks.getEffectiveChallengeLevel()).toBe('easy');
    expect(hooks.buildTypingChallengeSegments()[0].text).toMatch(/^[A-Z2-9]{12}$/);
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
    expect(mockElements['intention-label'].textContent).toBe('See your reminder');
  });

  it('renderIntentionPage shows per-domain goal for free users', async () => {
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
      subscription: { tier: 'free' },
      proFeatures: {
        intentionPage: { enabled: true, showBreathingExercise: false }
      },
      blocklist: [
        { id: '1', urlPattern: 'instagram.com', personalGoal: 'Stop watching reels' }
      ]
    });
    localHooks.__setOriginalUrlForTest('https://www.instagram.com');

    localHooks.renderIntentionPage();

    expect(mockElements['personal-goal-display'].textContent).toBe('Stop watching reels');
    expect(mockElements['intention-label'].textContent).toBe('See your reminder');
  });

  it('renderIntentionPage shows breathing exercise for free users when enabled', async () => {
    const env = createChromeMock();
    const classSets = {};
    const mockElements = {};
    const mockDoc = {
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: (id) => {
        if (!mockElements[id]) {
          classSets[id] = new Set(['hidden']);
          mockElements[id] = {
            textContent: '',
            classList: {
              add: (className) => classSets[id].add(className),
              remove: (className) => classSets[id].delete(className)
            },
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
      confirm: () => true,
      requestAnimationFrame: (callback) => callback()
    });

    const localHooks = context.__RESISTGATE_FRICTION_TEST_HOOKS__;
    localHooks.__setCurrentSettingsForTest({
      subscription: { tier: 'free' },
      proFeatures: {
        intentionPage: { enabled: true, showBreathingExercise: true }
      },
      blocklist: [{ id: '1', urlPattern: 'reddit.com' }]
    });
    localHooks.__setOriginalUrlForTest('https://www.reddit.com');

    localHooks.renderIntentionPage();

    expect(classSets['breathing-exercise'].has('hidden')).toBe(false);
  });

  it('renderInitialPhase skips the intention screen when free intention page is disabled', async () => {
    const classSets = {};
    const mockElements = {};
    const mockDoc = {
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: (id) => {
        if (!mockElements[id]) {
          classSets[id] = new Set(id === 'breathing-exercise' ? ['hidden'] : []);
          mockElements[id] = {
            textContent: '',
            className: id === 'main-container' ? 'container phase-intention' : '',
            classList: {
              add: (className) => {
                classSets[id].add(className);
                if (id === 'main-container') {
                  mockElements[id].className += ` ${className}`;
                }
              },
              remove: (className) => classSets[id].delete(className)
            },
            style: {},
            disabled: false,
            addEventListener: () => {}
          };
        }
        return mockElements[id];
      }
    };
    const context = await loadScriptInVm('friction-page/script.js', {
      chrome: {
        runtime: {
          sendMessage: (request, callback) => {
            if (request.action === 'getManualOverrideStatus') {
              callback({ success: true, status: { requiredDelaySeconds: 12, locked: false, remainingSeconds: 0 } });
            }
          }
        }
      },
      document: mockDoc,
      window: { location: { search: '?originalUrl=https%3A%2F%2Fwww.reddit.com' }, close: () => {} },
      location: { reload: () => {} },
      alert: () => {},
      confirm: () => true
    });

    const localHooks = context.__RESISTGATE_FRICTION_TEST_HOOKS__;
    localHooks.__setCurrentSettingsForTest({
      subscription: { tier: 'free' },
      proFeatures: {
        intentionPage: { enabled: false, showBreathingExercise: true }
      },
      blocklist: [{ id: '1', urlPattern: 'reddit.com' }]
    });
    localHooks.__setOriginalUrlForTest('https://www.reddit.com');

    mockDoc.getElementById('breathing-exercise');
    localHooks.renderInitialPhase();

    expect(mockElements['main-container'].className).toContain('phase-precheck');
    expect(classSets['breathing-exercise'].has('hidden')).toBe(true);
  });

  it('renderInitialPhase shows breathing when free intention page is enabled', async () => {
    const classSets = {};
    const mockElements = {};
    const mockDoc = {
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: (id) => {
        if (!mockElements[id]) {
          classSets[id] = new Set(['hidden']);
          mockElements[id] = {
            textContent: '',
            className: id === 'main-container' ? 'container phase-precheck' : '',
            classList: {
              add: (className) => {
                classSets[id].add(className);
                if (id === 'main-container') {
                  mockElements[id].className += ` ${className}`;
                }
              },
              remove: (className) => classSets[id].delete(className)
            },
            style: {},
            disabled: false,
            addEventListener: () => {}
          };
        }
        return mockElements[id];
      }
    };
    const context = await loadScriptInVm('friction-page/script.js', {
      chrome: { runtime: { sendMessage: () => {} } },
      document: mockDoc,
      window: { location: { search: '?originalUrl=https%3A%2F%2Fwww.reddit.com' }, close: () => {} },
      location: { reload: () => {} },
      alert: () => {},
      confirm: () => true,
      requestAnimationFrame: (callback) => callback()
    });

    const localHooks = context.__RESISTGATE_FRICTION_TEST_HOOKS__;
    localHooks.__setCurrentSettingsForTest({
      subscription: { tier: 'free' },
      proFeatures: {
        intentionPage: { enabled: true, showBreathingExercise: true }
      },
      blocklist: [{ id: '1', urlPattern: 'reddit.com' }]
    });
    localHooks.__setOriginalUrlForTest('https://www.reddit.com');

    localHooks.renderInitialPhase();

    expect(mockElements['main-container'].className).toContain('phase-intention');
    expect(classSets['breathing-exercise'].has('hidden')).toBe(false);
  });

  it('renderInitialPhase skips intention when returning from the distinct intention page', async () => {
    const mockElements = {};
    const mockDoc = {
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: (id) => {
        if (!mockElements[id]) {
          mockElements[id] = {
            textContent: '',
            className: id === 'main-container' ? 'container phase-intention' : '',
            classList: {
              add: (className) => {
                if (id === 'main-container') {
                  mockElements[id].className += ` ${className}`;
                }
              },
              remove: () => {}
            },
            style: {},
            disabled: false,
            addEventListener: () => {}
          };
        }
        return mockElements[id];
      }
    };
    const context = await loadScriptInVm('friction-page/script.js', {
      chrome: {
        runtime: {
          sendMessage: (request, callback) => {
            if (request.action === 'getManualOverrideStatus') {
              callback({ success: true, status: { requiredDelaySeconds: 12, locked: false, remainingSeconds: 0 } });
            }
          }
        }
      },
      document: mockDoc,
      window: { location: { search: '?originalUrl=https%3A%2F%2Fwww.reddit.com&skipIntention=1' }, close: () => {} },
      location: { reload: () => {} },
      alert: () => {},
      confirm: () => true
    });

    const localHooks = context.__RESISTGATE_FRICTION_TEST_HOOKS__;
    localHooks.__setCurrentSettingsForTest({
      subscription: { tier: 'free' },
      proFeatures: {
        intentionPage: { enabled: true, showBreathingExercise: false }
      },
      blocklist: [{ id: '1', urlPattern: 'reddit.com' }]
    });
    localHooks.__setOriginalUrlForTest('https://www.reddit.com');
    localHooks.__setSkipIntentionForTest(true);

    localHooks.renderInitialPhase();

    expect(mockElements['main-container'].className).toContain('phase-precheck');
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

  it('builds challenge sizes from the chosen access window', () => {
    expect(hooks.getAccessDurationOptions(15)).toEqual([5, 15, 30]);
    expect(hooks.getAccessDurationOptions(45)).toEqual([5, 15, 30, 45]);
    expect(hooks.getAccessDurationOptions('nonsense')).toEqual([5, 15, 30]);

    expect(hooks.getChallengeWeight(5, 15)).toBe('light');
    expect(hooks.getChallengeWeight(15, 15)).toBe('standard');
    expect(hooks.getChallengeWeight(30, 15)).toBe('heavy');

    expect(hooks.buildTypingChallengeSegments('hard', 'light')).toHaveLength(3);
    expect(hooks.buildTypingChallengeSegments('hard', 'heavy')).toHaveLength(8);
    expect(hooks.buildTypingChallengeSegments('easy', 'light')[0].text).toMatch(/^[A-Z2-9]{8}$/);
    expect(hooks.buildTypingChallengeSegments('easy', 'heavy')[0].text).toMatch(/^[A-Z2-9]{16}$/);
    expect(hooks.getDurationHint('hard', 'light')).toBe('Shorter visit, lighter challenge.');
    expect(hooks.getDurationHint('hard', 'heavy')).toBe('Longer visit, longer challenge.');
  });

  it('gives moderate mode the same two-sentence size on every standard visit', () => {
    for (let i = 0; i < 20; i++) {
      const [{ text }] = hooks.buildTypingChallengeSegments('moderate');
      expect(text.split('.').filter(Boolean)).toHaveLength(2);
    }
    expect(hooks.buildTypingChallengeSegments('moderate', 'light')[0].text.split('.').filter(Boolean)).toHaveLength(1);
  });

  it('repeats a custom phrase for a longer visit', () => {
    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      proFeatures: { customChallengePhrase: { enabled: true, text: 'Back to the draft.' } }
    });
    expect(hooks.buildTypingChallengeSegments('custom', 'light')).toHaveLength(1);
    expect(hooks.buildTypingChallengeSegments('custom', 'heavy')).toEqual([
      { text: 'Back to the draft.' },
      { text: 'Back to the draft.' }
    ]);
    expect(hooks.getChallengeLevelCopy('custom').precheck(2)).toContain('2 times');
  });

  it('marks where typed text first goes wrong', () => {
    expect(hooks.computeTypingDiff('focus', 'foc')).toMatchObject({ correctLength: 3, hasError: false, complete: false });
    expect(hooks.computeTypingDiff('focus', 'focus')).toMatchObject({ correctLength: 5, hasError: false, complete: true });
    expect(hooks.computeTypingDiff('focus', 'fxcus')).toMatchObject({ correctLength: 1, errorEnd: 5, hasError: true });
    expect(hooks.computeTypingDiff('focus', 'focusss')).toMatchObject({ correctLength: 5, errorEnd: 5, hasError: true });

    expect(hooks.getQuoteHighlightParts('focus', '')).toEqual([
      { className: 'qc-current', text: 'f' },
      { className: '', text: 'ocus' }
    ]);
    expect(hooks.getQuoteHighlightParts('focus', 'fo')).toEqual([
      { className: 'qc-done', text: 'fo' },
      { className: 'qc-current', text: 'c' },
      { className: '', text: 'us' }
    ]);
    expect(hooks.getQuoteHighlightParts('focus', 'fx')).toEqual([
      { className: 'qc-done', text: 'f' },
      { className: 'qc-error', text: 'o' },
      { className: '', text: 'cus' }
    ]);
  });

  it('matches blocklist entries by host and subdomain, never by lookalike', () => {
    const blocklist = [
      { urlPattern: 'x.com', personalGoal: 'x' },
      { urlPattern: 'google.com', personalGoal: 'google' },
      { urlPattern: 'mail.google.com', personalGoal: 'mail' },
      { urlPattern: 'https://www.Reddit.com/r/all', personalGoal: 'reddit' }
    ];

    expect(hooks.findBlocklistEntry('box.com', blocklist)).toBeNull();
    expect(hooks.findBlocklistEntry('www.x.com', blocklist).personalGoal).toBe('x');
    expect(hooks.findBlocklistEntry('m.x.com', blocklist).personalGoal).toBe('x');
    expect(hooks.findBlocklistEntry('mail.google.com', blocklist).personalGoal).toBe('mail');
    expect(hooks.findBlocklistEntry('docs.google.com', blocklist).personalGoal).toBe('google');
    expect(hooks.findBlocklistEntry('old.reddit.com', blocklist).personalGoal).toBe('reddit');
    // The old matcher's `pattern.endsWith(hostname)` let a short hostname match a longer pattern.
    expect(hooks.findBlocklistEntry('e.com', [{ urlPattern: 'youtube.com' }])).toBeNull();
  });

  it('says an access condition makes the site free later, not that it is closed now', () => {
    const at9am = new Date(2026, 8, 18, 9, 0);
    const timeCopy = hooks.getBundlePanelCopy(
      { enabled: true, conditionType: 'time_of_day', afterTime: '17:00' },
      null,
      at9am
    );
    expect(timeCopy.label).toBe('Free access after 5:00 PM — or earn it now.');
    expect(timeCopy.progressText).toBe('8h 0m until free access.');
    // No midnight-based bar for time-of-day conditions.
    expect(timeCopy.progressPercent).toBeNull();

    const workCopy = hooks.getBundlePanelCopy(
      { enabled: true, conditionType: 'work_timer', requiredMinutes: 60 },
      { effectiveMinutes: 15 },
      at9am
    );
    expect(workCopy.label).toBe('Free access after 60 min of focused work — or earn it now.');
    expect(workCopy.progressText).toBe('15 / 60 min logged — 45 min to go.');
    expect(workCopy.progressPercent).toBe(25);

    expect(hooks.getBundlePanelCopy({ enabled: false }, null, at9am)).toBeNull();
  });

  it('only shows the streak line once there is something to celebrate', () => {
    expect(hooks.getGateStreakText(null)).toBe('');
    expect(hooks.getGateStreakText({ total: 1, resisted: 1 })).toBe('');
    expect(hooks.getGateStreakText({ total: 4, resisted: 0 })).toBe('');
    expect(hooks.getGateStreakText({ total: 5, resisted: 3 })).toBe('You\'ve gone back 3 of the last 5 times today.');
  });

  it('formats the Earn-Access unlock countdown as m:ss', () => {
    expect(hooks.formatCountdown(34)).toBe('0:34');
    expect(hooks.formatCountdown(90)).toBe('1:30');
    expect(hooks.formatCountdown(-3)).toBe('0:00');
  });
});

function createPageHarness({ search = '?originalUrl=https%3A%2F%2Fwww.reddit.com%2Fr%2Fall', responders = {}, historyLength = 3 } = {}) {
  const elements = {};
  const listeners = {};
  const messages = [];
  const historyCalls = [];
  const reloads = [];
  const alerts = [];

  function makeElement(id) {
    const classes = new Set(id === 'close-tab-btn' ? ['hidden'] : []);
    const handlers = {};
    const element = {
      id,
      textContent: '',
      innerHTML: '',
      value: '',
      className: id === 'main-container' ? 'container phase-intention' : '',
      disabled: false,
      href: '',
      style: {},
      children: [],
      classList: {
        add: (name) => {
          classes.add(name);
          if (id === 'main-container') element.className += ` ${name}`;
        },
        remove: (name) => classes.delete(name),
        toggle: (name, force) => {
          const on = force === undefined ? !classes.has(name) : force;
          if (on) classes.add(name); else classes.delete(name);
          return on;
        },
        contains: (name) => classes.has(name)
      },
      addEventListener: (type, handler) => {
        (handlers[type] ||= []).push(handler);
      },
      appendChild: (child) => element.children.push(child),
      focus: () => {},
      click: () => (handlers.click || []).forEach((handler) => handler({ preventDefault: () => {} })),
      dispatch: (type, event = {}) => (handlers[type] || []).forEach((handler) => handler({ preventDefault: () => {}, ...event }))
    };
    return element;
  }

  const document = {
    addEventListener: (type, handler) => {
      (listeners[type] ||= []).push(handler);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => makeElement(`created-${tag}`),
    createTextNode: (text) => ({ text }),
    getElementById: (id) => {
      if (!elements[id]) elements[id] = makeElement(id);
      return elements[id];
    }
  };

  const chrome = {
    runtime: {
      sendMessage: (request, callback) => {
        messages.push(request);
        const responder = responders[request.action];
        const response = typeof responder === 'function' ? responder(request) : responder;
        if (callback && response !== undefined) callback(response);
      }
    },
    tabs: {
      getCurrent: (callback) => callback({ id: 7 }),
      remove: (id) => historyCalls.push(['closeTab', id])
    }
  };

  const window = {
    location: { search },
    history: {
      length: historyLength,
      go: (steps) => historyCalls.push(['go', steps]),
      back: () => historyCalls.push(['back'])
    },
    close: () => historyCalls.push(['close'])
  };

  return {
    elements,
    messages,
    historyCalls,
    reloads,
    alerts,
    get: (id) => document.getElementById(id),
    async load() {
      const context = await loadScriptInVm('friction-page/script.js', {
        chrome,
        document,
        window,
        location: { reload: () => reloads.push(true) },
        alert: (message) => alerts.push(message),
        confirm: () => true,
        requestAnimationFrame: (callback) => callback()
      });
      const hooks = context.__RESISTGATE_FRICTION_TEST_HOOKS__;
      hooks.__setOriginalUrlForTest(new URLSearchParams(search).get('originalUrl'));
      return hooks;
    },
    fireDomReady: () => (listeners.DOMContentLoaded || []).forEach((handler) => handler()),
    keydown: (event) => (listeners.keydown || []).forEach((handler) => handler({
      preventDefault: () => {},
      target: { tagName: 'BODY' },
      ...event
    }))
  };
}

describe('Friction page interactions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const freeSettings = {
    subscription: { tier: 'free' },
    defaultAccessDuration: 15,
    proFeatures: { intentionPage: { enabled: false } },
    blocklist: [{ id: '1', urlPattern: 'reddit.com' }]
  };

  it('Quit leaves the page and records a resisted visit instead of reloading', async () => {
    const page = createPageHarness({ responders: { recordGateOutcome: { success: true } } });
    const hooks = await page.load();
    hooks.__setCurrentSettingsForTest(freeSettings);

    hooks.transitionToPhase(hooks.PHASES.CHALLENGE);
    hooks.leaveGate();

    expect(page.reloads).toHaveLength(0);
    expect(page.messages.filter((m) => m.action === 'recordBlockedVisit')).toHaveLength(0);
    expect(page.messages).toContainEqual({ action: 'recordGateOutcome', domain: 'www.reddit.com', reversesAccess: false });
    expect(page.historyCalls).toEqual([['go', -1]]);
  });

  it('records a resisted visit only once per page', async () => {
    const page = createPageHarness({ responders: { recordGateOutcome: { success: true } } });
    const hooks = await page.load();
    hooks.leaveGate();
    hooks.leaveGate();
    expect(page.messages.filter((m) => m.action === 'recordGateOutcome')).toHaveLength(1);
  });

  it('steps past the Intention Page when going back from a hand-off', async () => {
    const page = createPageHarness({
      search: '?originalUrl=https%3A%2F%2Fwww.reddit.com&skipIntention=1&skipRecord=1',
      responders: { recordGateOutcome: { success: true } }
    });
    const hooks = await page.load();
    hooks.__setSkipIntentionForTest(true);
    hooks.goBack();
    expect(page.historyCalls).toEqual([['go', -2]]);
  });

  it('closes the tab when there is no history to go back to', async () => {
    const page = createPageHarness({ historyLength: 1 });
    const hooks = await page.load();
    hooks.goBack();
    expect(page.historyCalls).toEqual([['closeTab', 7]]);
  });

  it('reads the resistance count instead of re-recording when handed off from the Intention Page', async () => {
    const page = createPageHarness({
      search: '?originalUrl=https%3A%2F%2Fwww.reddit.com&skipIntention=1&skipRecord=1',
      responders: {
        getResistanceCount: { success: true, count: 4 },
        getGateOutcomeSummary: { success: true, summary: { total: 5, resisted: 3 } }
      }
    });
    await page.load();
    page.fireDomReady();

    expect(page.messages.filter((m) => m.action === 'recordBlockedVisit')).toHaveLength(0);
    expect(page.get('precheck-resistance-count').textContent).toBe('You\'ve resisted www.reddit.com 4 times today.');
    expect(page.get('resistance-count').textContent).toBe('You\'ve resisted www.reddit.com 4 times today.');
    expect(page.get('precheck-gate-streak').textContent).toBe('You\'ve gone back 3 of the last 5 times today.');
  });

  it('shows challenge-phase errors inside the challenge, where they are visible', async () => {
    const page = createPageHarness();
    const hooks = await page.load();

    hooks.transitionToPhase(hooks.PHASES.CHALLENGE);
    hooks.showPageError('No shortcuts in ResistGate. Earn it.');

    expect(page.get('typing-error').textContent).toBe('No shortcuts in ResistGate. Earn it.');
    expect(page.get('precheck-error').textContent).toBe('');
  });

  it('keeps finished work when Earn-Access time has not passed yet', async () => {
    const page = createPageHarness();
    const hooks = await page.load();
    hooks.__setCurrentSettingsForTest({
      subscription: { tier: 'pro' },
      proFeatures: { behavioralFriction: { enabled: true, earnAccessEnabled: true, earnAccessMinChallengeSeconds: 90 } },
      blocklist: [{ id: '1', urlPattern: 'reddit.com' }]
    });
    hooks.__setStartTimeForTest(Date.now() - 30 * 1000);
    hooks.transitionToPhase(hooks.PHASES.CHALLENGE);

    expect(hooks.getEarnAccessRemainingSeconds()).toBe(60);

    let failed = false;
    hooks.completeChallenge(15, 'https://www.reddit.com/', { onFailure: () => { failed = true; } });

    expect(failed).toBe(true);
    expect(page.reloads).toHaveLength(0);
    expect(page.messages.filter((m) => m.action === 'grantTemporaryAccess')).toHaveLength(0);
    expect(page.get('typing-error').textContent).toContain('Your typing is kept');
  });

  it('shows a failed grant inline and lets the user retry, with no alert or reload', async () => {
    const page = createPageHarness({
      responders: { grantTemporaryAccess: { success: false, error: 'Commitment Mode is active.' } }
    });
    const hooks = await page.load();
    hooks.__setCurrentSettingsForTest(freeSettings);
    hooks.transitionToPhase(hooks.PHASES.CHALLENGE);

    let failed = false;
    hooks.requestTemporaryAccess({
      targetUrl: 'https://www.reddit.com/',
      duration: 15,
      meta: { method: 'challenge' },
      onFailure: () => { failed = true; }
    });

    expect(failed).toBe(true);
    expect(page.alerts).toHaveLength(0);
    expect(page.reloads).toHaveLength(0);
    expect(page.get('typing-error').textContent).toBe('Commitment Mode is active.');
  });

  it('shows the stated intent on success and a close-tab nudge once access runs out', async () => {
    const page = createPageHarness({
      responders: { grantTemporaryAccess: { success: true, access: { domain: 'reddit.com', expiresAt: Date.now() - 1 } } }
    });
    const hooks = await page.load();
    hooks.__setCurrentSettingsForTest(freeSettings);
    hooks.__setChallengeMetaForTest({ taskIntent: 'reply to Sam' });

    hooks.requestTemporaryAccess({ targetUrl: 'https://www.reddit.com/', duration: 5, meta: { method: 'challenge' } });

    expect(hooks.__getCurrentPhase()).toBe('success');
    expect(page.get('success-intent').textContent).toBe('You said you\'re here to: reply to Sam');
    expect(page.get('success-intent').classList.contains('hidden')).toBe(false);
    expect(page.get('access-timer').textContent).toBe('Time\'s up — close the tab?');
    expect(page.get('continue-to-site').classList.contains('hidden')).toBe(true);
    expect(page.get('close-tab-btn').classList.contains('hidden')).toBe(false);
  });

  it('"Actually, never mind" closes access and turns the visit into a resisted one', async () => {
    const page = createPageHarness({
      responders: {
        grantTemporaryAccess: { success: true, access: { domain: 'reddit.com', expiresAt: Date.now() + 60000 } },
        revokeTemporaryAccess: { success: true },
        recordGateOutcome: { success: true }
      }
    });
    const hooks = await page.load();
    hooks.__setCurrentSettingsForTest(freeSettings);
    hooks.requestTemporaryAccess({ targetUrl: 'https://www.reddit.com/', duration: 5, meta: { method: 'challenge' } });

    hooks.handleNeverMind();

    expect(page.messages).toContainEqual({ action: 'revokeTemporaryAccess', domain: 'reddit.com' });
    expect(page.messages).toContainEqual({ action: 'recordGateOutcome', domain: 'www.reddit.com', reversesAccess: true });
    expect(page.historyCalls).toEqual([['go', -1]]);
    hooks.startAccessCountdown(null, 0);
  });

  it('keeps the user on the page when "never mind" cannot close access', async () => {
    const page = createPageHarness({
      responders: { revokeTemporaryAccess: { success: false, error: 'Unable to re-block this site right now. Try again.' } }
    });
    const hooks = await page.load();
    hooks.transitionToPhase(hooks.PHASES.SUCCESS);
    hooks.handleNeverMind();

    expect(page.historyCalls).toHaveLength(0);
    expect(page.get('success-error').textContent).toContain('Unable to re-block');
    expect(page.get('never-mind-btn').disabled).toBe(false);
  });

  it('sets a reminder and leaves without recording the exit twice', async () => {
    const page = createPageHarness({ responders: { scheduleGateReminder: { success: true, reminder: {} } } });
    const hooks = await page.load();

    hooks.handleRemindLater();
    hooks.leaveGate();

    expect(page.messages).toContainEqual({ action: 'scheduleGateReminder', originalUrl: 'https://www.reddit.com/r/all' });
    expect(page.messages.filter((m) => m.action === 'recordGateOutcome')).toHaveLength(0);
    expect(page.historyCalls[0]).toEqual(['go', -1]);
  });

  it('lets a manual override countdown be cancelled before it grants access', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const page = createPageHarness({
      responders: {
        getManualOverrideStatus: { success: true, status: { requiredDelaySeconds: 12, locked: false, remainingSeconds: 0 } },
        grantTemporaryAccess: { success: true, access: { domain: 'reddit.com', expiresAt: Date.now() + 60000 } }
      }
    });
    const hooks = await page.load();
    hooks.__setCurrentSettingsForTest(freeSettings);
    hooks.transitionToPhase(hooks.PHASES.PRECHECK);

    hooks.handleManualOverride();
    vi.advanceTimersByTime(4000);
    expect(page.get('manual-override-btn').textContent).toBe('Cancel (8s)');
    expect(page.get('manual-override-btn').disabled).toBe(false);
    expect(page.get('start-unlock-challenge').disabled).toBe(true);

    hooks.handleManualOverride();
    vi.advanceTimersByTime(20000);

    expect(page.get('manual-override-btn').textContent).toBe('Manual Override');
    expect(page.get('start-unlock-challenge').disabled).toBe(false);
    expect(page.messages.filter((m) => m.action === 'grantTemporaryAccess')).toHaveLength(0);
  });

  it('caps a manual override at the default window even if a longer one is picked', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const page = createPageHarness({
      responders: {
        getManualOverrideStatus: { success: true, status: { requiredDelaySeconds: 10, locked: false, remainingSeconds: 0 } },
        grantTemporaryAccess: { success: true, access: { domain: 'reddit.com', expiresAt: Date.now() + 60000 } }
      }
    });
    const hooks = await page.load();
    hooks.__setCurrentSettingsForTest(freeSettings);
    hooks.__setAccessDurationForTest(15);
    hooks.__setSelectedAccessMinutesForTest(30);

    hooks.handleManualOverride();
    vi.advanceTimersByTime(10000);

    const grant = page.messages.find((m) => m.action === 'grantTemporaryAccess');
    expect(grant.duration).toBe(15);
    expect(grant.meta.method).toBe('manualOverride');
  });

  it('maps Escape to leaving and Enter to the phase\'s main action', async () => {
    const page = createPageHarness({ responders: { recordGateOutcome: { success: true } } });
    const hooks = await page.load();
    page.fireDomReady();

    let continued = 0;
    page.get('continue-to-challenge').addEventListener('click', () => { continued += 1; });
    hooks.transitionToPhase(hooks.PHASES.INTENTION);
    page.keydown({ key: 'Enter' });
    expect(continued).toBe(1);

    // Enter on a focused button is left to the browser.
    page.keydown({ key: 'Enter', target: { tagName: 'BUTTON' } });
    expect(continued).toBe(1);

    hooks.transitionToPhase(hooks.PHASES.SUCCESS);
    page.keydown({ key: 'Escape' });
    expect(page.messages.filter((m) => m.action === 'recordGateOutcome')).toHaveLength(0);

    hooks.transitionToPhase(hooks.PHASES.PRECHECK);
    page.keydown({ key: 'Escape' });
    expect(page.messages.filter((m) => m.action === 'recordGateOutcome')).toHaveLength(1);
  });

  it('keeps the destination and stated reason in view during the challenge', async () => {
    const page = createPageHarness();
    const hooks = await page.load();
    hooks.__setOriginalUrlForTest('https://www.reddit.com/r/all');
    expect(hooks.getChallengeContextLine()).toBe('→ reddit.com');

    hooks.__setChallengeMetaForTest({ taskIntent: 'Reply to the mod message' });
    expect(hooks.getChallengeContextLine()).toBe('→ reddit.com · “Reply to the mod message”');
  });
});
