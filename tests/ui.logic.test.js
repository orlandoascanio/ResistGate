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

    expect(popupHtml).toContain('Block distractions before autopilot takes over.');
    expect(popupHtml).toContain('Block this tab\'s site');
    expect(popupHtml).not.toContain('Uses the active website');
    expect(popupHtml).toContain('Full settings');
    expect(popupHtml).not.toContain('Manage all');
    expect(popupHtml).toContain('I\'m improving ResistGate based on real feedback.');
    expect(popupHtml).toContain('Help improve ResistGate');
    expect(optionsHtml).toContain('Weekly Review');
    expect(optionsHtml).toContain('Block the sites you want, and decide how hard it should be to get past them.');
    expect(optionsHtml).not.toContain('Set up your blocker and choose how much friction you want before distracting sites open.');
    expect(optionsHtml).not.toContain('Plan guide');
    expect(optionsHtml).toContain('Core blocking is free');
    expect(optionsHtml).toContain('Pro adds Progress tracking, Weekly Review, and stricter lock modes for when you need more than the basics.');
    expect(optionsHtml).toContain('Block any site, on any schedule');
    expect(optionsHtml).toContain("Commit to a block you can't undo early");
    expect(optionsHtml).toContain('$3.99/mo, $29.99/yr, or $49.99 once.');
    expect(optionsHtml).toContain('<h2>Entry difficulty</h2>');
    expect(optionsHtml).toContain('Pick the level that interrupts autopilot without derailing real work.');
    expect(optionsHtml).toContain('Override pause can be 10 to 15 seconds.');
    expect(optionsHtml).not.toContain('Friction level');
    expect(optionsHtml).not.toContain('Start manageable, then raise the bar when distractions get too easy to bypass.');
    expect(optionsHtml).not.toContain('Free override waits 10 to 15 seconds.');
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
    expect(optionsHtml).toContain('<div id="schedule-config" class="schedule-config" hidden>');
    expect(optionsHtml).toContain('Off - turn on to block only during chosen hours.');
    expect(optionsHtml).not.toContain('id="schedule-enabled"');
    expect(optionsHtml).not.toContain('Use schedule');
    expect(optionsHtml).toContain('<details id="intention-panel" class="panel disclosure-panel">');
    expect(optionsHtml).toContain('How this works');
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
    expect(hooks.formatBundleSummary({ enabled: true, conditionType: 'time_of_day', afterTime: '17:00' })).toBe('Opens after 5:00 PM');
    expect(hooks.formatBundleSummary({ enabled: true, conditionType: 'work_timer', requiredMinutes: 45 })).toBe('Opens after 45 min focus');
    expect(hooks.formatBlockedSiteSummary({
      temptationBundle: { enabled: true, conditionType: 'time_of_day', afterTime: '08:30' },
      personalGoal: 'Research only'
    })).toBe('Opens after 8:30 AM · Reminder set');
    expect(hooks.formatScheduleDays([1, 2, 3, 4, 5])).toBe('Mon-Fri');
    expect(hooks.formatScheduleDays([0, 6])).toBe('Weekends');
    expect(hooks.formatTimeLabel('22:05')).toBe('10:05 PM');
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

    expect(hooks.getBlockedCountMeta(0)).toBe('');
    expect(hooks.getBlockedCountMeta(1)).toBe('1 blocked');
    expect(hooks.getBlockedCountMeta(8)).toBe('8 blocked');
    expect(hooks.normalizeDomainInput('HTTPS://WWW.YOUTUBE.COM/')).toBe('www.youtube.com');
    expect(hooks.getDisplayDomain('www.reddit.com')).toBe('reddit.com');
    expect(hooks.getDisplayDomain('m.reddit.com')).toBe('m.reddit.com');
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
