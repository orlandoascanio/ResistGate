import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createBrowserLikeGlobals, createChromeMock, loadScriptInVm } from './helpers/vm-env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

describe('UI copy and state logic', () => {
  it('keeps key product copy aligned with discipline positioning', () => {
    const optionsHtml = fs.readFileSync(path.resolve(repoRoot, 'options/options.html'), 'utf8');
    const popupHtml = fs.readFileSync(path.resolve(repoRoot, 'popup/popup.html'), 'utf8');
    const frictionHtml = fs.readFileSync(path.resolve(repoRoot, 'friction-page/index.html'), 'utf8');
    const intentionHtml = fs.readFileSync(path.resolve(repoRoot, 'intention-page/index.html'), 'utf8');
    const whatsNewHtml = fs.readFileSync(path.resolve(repoRoot, 'whats-new/whats-new.html'), 'utf8');

    expect(popupHtml).toContain('Block distractions. Unlock intentionally.');
    expect(popupHtml).toContain('Help improve ResistGate');
    expect(optionsHtml).toContain('Weekly Review');
    expect(optionsHtml).toContain('data-tab="analytics" data-pro-screen="analytics" role="tab" aria-selected="false" aria-controls="panel-analytics">Progress</button>');
    expect(optionsHtml).toContain('data-tab="pro" data-pro-screen="pro" role="tab" aria-selected="false" aria-controls="panel-pro">Stronger Locks</button>');
    expect(optionsHtml).toContain('Help improve ResistGate');
    expect(optionsHtml).toContain('Unlock stronger locks, progress tracking, and weekly reviews.');
    expect(frictionHtml).toContain('You blocked this for a reason.');
    expect(intentionHtml).toContain('Pause before you enter.');
    expect(intentionHtml).toContain('Decision gate');
    expect(intentionHtml).toContain('Optional intent check');
    expect(intentionHtml).toContain('Avoidance');
    expect(intentionHtml).not.toContain('Today’s budget');
    expect(whatsNewHtml).toContain('Your intention, front and center.');
    expect(whatsNewHtml).toContain('Release highlights');
    expect(whatsNewHtml).toContain('Set your first intention');
  });

  it('labels Intention pause as available and keeps it out of paywall gating', () => {
    const optionsHtml = fs.readFileSync(path.resolve(repoRoot, 'options/options.html'), 'utf8');

    expect(optionsHtml).toContain('Intention pause');
    expect(optionsHtml).not.toContain('Intention pause <span class="panel-subtitle">· Free</span>');
    expect(optionsHtml).toContain('Show your saved site reminder before the challenge.');
    expect(optionsHtml).toContain('Reminders are saved per blocked site.');
    expect(optionsHtml).not.toContain('Add optional reminder');
    expect(optionsHtml).toContain('<details id="schedule-panel" class="panel disclosure-panel">');
    expect(optionsHtml).not.toContain('data-pro-feature="intentionPage"');
    expect(optionsHtml).not.toContain('Intention Page — personal goals &amp; breathing exercises');
    expect(optionsHtml).toContain('Behavioral Friction — stronger pre-entry prompts');
  });

  it('registers the distinct intention page as an extension resource', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(repoRoot, 'manifest.json'), 'utf8'));
    const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources || []);

    expect(resources).toContain('intention-page/index.html');
  });

  it('maps analytics insights to the expected user-facing guidance', async () => {
    const env = createChromeMock();
    const globals = createBrowserLikeGlobals();
    const context = await loadScriptInVm('options/options.js', {
      chrome: env.chrome,
      ...globals
    });

    const hooks = context.__RESISTGATE_OPTIONS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    expect(hooks.getBlockedAttemptsInsight(30)).toBe('High distraction pressure — your blocker is working hard.');
    expect(hooks.getBlockedAttemptsInsight(0)).toBe('No interruptions. Your focus game is strong.');
    expect(hooks.getOverridesInsight(8)).toBe('More overrides than ideal. What patterns do you notice?');
    expect(hooks.getStrictSessionInsight(180)).toBe('Strong commitment. 3+ hours of deep work.');
    expect(hooks.sanitizePreset('strict')).toBe('strict');
    expect(hooks.sanitizePreset('unknown')).toBe('balanced');
    expect(hooks.isProGatedTab('analytics')).toBe(true);
    expect(hooks.isProGatedTab('report')).toBe(true);
    expect(hooks.isProGatedTab('pro')).toBe(true);
    expect(hooks.isProGatedTab('general')).toBe(false);
  });

  it('formats popup blocked-count text cleanly', async () => {
    const env = createChromeMock();
    const globals = createBrowserLikeGlobals();
    const context = await loadScriptInVm('popup/popup.js', {
      chrome: env.chrome,
      ...globals
    });

    const hooks = context.__RESISTGATE_POPUP_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    expect(hooks.getBlockedCountMeta(0)).toBe('No sites blocked');
    expect(hooks.getBlockedCountMeta(1)).toBe('1 blocked');
    expect(hooks.getBlockedCountMeta(8)).toBe('8 blocked');
    expect(hooks.normalizeDomainInput('HTTPS://WWW.YOUTUBE.COM/')).toBe('www.youtube.com');
  });

  it('wires the whats-new buttons through an external script', async () => {
    const makeElement = () => {
      const listeners = new Map();

      return {
        disabled: false,
        hidden: false,
        textContent: '',
        dataset: {},
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {}
        },
        addEventListener: (type, handler) => {
          listeners.set(type, handler);
        },
        getHandler: (type) => listeners.get(type)
      };
    };

    const elements = {
      '#version-badge': makeElement(),
      '#release-date': makeElement(),
      '#open-options-btn': makeElement(),
      '#close-btn': makeElement(),
      '#close-icon-btn': makeElement(),
      '#upgrade-link': makeElement(),
      '#footer-cta': makeElement(),
      '#status-message': makeElement()
    };

    let domContentLoadedHandler = null;
    let windowClosed = false;
    let openOptionsCalled = false;
    const sentMessages = [];

    const context = await loadScriptInVm('whats-new/whats-new.js', {
      chrome: {
        runtime: {
          getManifest: () => ({ version: '9.9.9' }),
          openOptionsPage: (callback) => {
            openOptionsCalled = true;
            callback?.();
          },
          sendMessage: (payload, callback) => {
            sentMessages.push(payload);
            callback({ settings: { subscription: { tier: 'free' } } });
          },
          lastError: null
        }
      },
      document: {
        addEventListener: (type, handler) => {
          if (type === 'DOMContentLoaded') {
            domContentLoadedHandler = handler;
          }
        },
        querySelector: (selector) => elements[selector] || null
      },
      window: {
        close: () => {
          windowClosed = true;
        },
        setTimeout: (callback) => {
          callback();
          return 1;
        }
      }
    });

    expect(context.__RESISTGATE_WHATSNEW_TEST_HOOKS__).toBeTruthy();
    expect(typeof domContentLoadedHandler).toBe('function');

    domContentLoadedHandler();

    expect(elements['#version-badge'].textContent).toBe('v9.9.9');

    elements['#open-options-btn'].getHandler('click')({ currentTarget: elements['#open-options-btn'] });
    expect(openOptionsCalled).toBe(true);
    expect(windowClosed).toBe(true);

    windowClosed = false;
    elements['#upgrade-link'].getHandler('click')({ preventDefault: () => {}, currentTarget: elements['#upgrade-link'] });
    await Promise.resolve();
    expect(sentMessages).toContainEqual({ action: 'openPricingPage' });
    expect(windowClosed).toBe(true);

    windowClosed = false;
    context.__RESISTGATE_WHATSNEW_TEST_HOOKS__.handleClose();
    expect(windowClosed).toBe(true);
    expect(elements['#status-message'].textContent).toBe('You can close this tab now.');
  });
});
