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
    expect(result.error).toContain('Type a specific task');
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
    expect(result.error).toContain('Answer the custom prompt');
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
});
