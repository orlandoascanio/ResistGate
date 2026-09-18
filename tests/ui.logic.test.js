import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createBrowserLikeGlobals, createChromeMock, loadScriptInVm } from './helpers/vm-env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function createPopupDomHarness() {
  function makeElement() {
    const classes = new Set();
    const listeners = new Map();
    const element = {
      attributes: {},
      children: [],
      className: '',
      disabled: false,
      hidden: false,
      parentNode: null,
      style: {},
      textContent: '',
      title: '',
      type: '',
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name),
        toggle: (name, force) => {
          const enabled = force === undefined ? !classes.has(name) : force;
          if (enabled) classes.add(name);
          else classes.delete(name);
          return enabled;
        }
      },
      addEventListener: (type, handler) => {
        listeners.set(type, handler);
      },
      appendChild: (child) => {
        child.parentNode = element;
        element.children.push(child);
        return child;
      },
      remove: () => {
        if (!element.parentNode) return;
        element.parentNode.children = element.parentNode.children.filter(
          (child) => child !== element
        );
        element.parentNode = null;
      },
      setAttribute: (name, value) => {
        element.attributes[name] = String(value);
      },
      trigger: (type) => listeners.get(type)?.()
    };

    Object.defineProperty(element, 'innerHTML', {
      get: () => '',
      set: () => {
        element.children = [];
      }
    });

    return element;
  }

  const elements = {
    'active-access-section': makeElement(),
    'active-access-list': makeElement(),
    'status-announcement': makeElement()
  };
  elements['active-access-section'].classList.add('hidden');
  const container = makeElement();

  return {
    elements,
    makeElement,
    document: {
      addEventListener: () => {},
      createElement: makeElement,
      getElementById: (id) => elements[id] || makeElement(),
      querySelector: (selector) => selector === '.container' ? container : null,
      querySelectorAll: () => []
    }
  };
}

describe('UI copy and state logic', () => {
  it('keeps key product copy aligned with discipline positioning', () => {
    const optionsHtml = fs.readFileSync(path.resolve(repoRoot, 'options/options.html'), 'utf8');
    const optionsJs = fs.readFileSync(path.resolve(repoRoot, 'options/options.js'), 'utf8');
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
    expect(optionsHtml).toContain('<h1>Settings</h1>');
    expect(optionsHtml).toContain('Block the sites you want, and decide how hard it should be to get past them.');
    expect(optionsHtml).not.toContain('Set up your blocker and choose how much friction you want before distracting sites open.');
    expect(optionsHtml).not.toContain('Plan guide');
    expect(optionsHtml).toContain('Core blocking is free');
    expect(optionsHtml).toContain('Core blocking, schedules, challenges, temporary access, intention pauses, and the work timer are free.');
    expect(optionsHtml).toContain('id="compare-plans-btn"');
    expect(optionsHtml).toContain('Compare plans');
    expect(optionsJs).toContain("return 'https://www.orlandoascanio.com/resistgate/updated';");
    expect(optionsJs).not.toContain('updated?from=');
    expect(optionsJs).not.toContain("chrome.runtime.getURL('whats-new/whats-new.html')");
    expect(optionsHtml).toContain('class="general-settings-grid"');
    expect(optionsHtml).not.toContain('id="blocking-status"');
    expect(optionsHtml).not.toContain('sidebar-brand-mark');
    expect(optionsHtml).not.toContain('>RG</');
    expect(optionsHtml).toContain('id="site-editor-modal"');
    expect(optionsHtml).toContain('id="site-editor-content"');
    expect(optionsJs).toContain('showBlockedSiteEditor(entry, toggleButton)');
    expect(optionsJs).not.toContain('setBlockedSiteExpanded(');
    expect(optionsHtml).toContain('<h2>Entry difficulty</h2>');
    expect(optionsHtml).toContain('Pick the level that interrupts autopilot without derailing real work.');
    expect(optionsHtml).toContain('Skip the challenge by waiting this many seconds.');
    expect(optionsHtml).not.toContain('Friction level');
    expect(optionsHtml).not.toContain('Start manageable, then raise the bar when distractions get too easy to bypass.');
    expect(optionsHtml).not.toContain('Free override waits 10 to 15 seconds.');
    expect(optionsHtml).toContain('id="tab-analytics" class="tab-btn" data-tab="analytics"');
    expect(optionsHtml).toContain('<span class="tab-label">Progress</span>');
    expect(optionsHtml).toContain('id="tab-pro" class="tab-btn" data-tab="pro"');
    expect(optionsHtml).toContain('<span class="tab-label">Stronger Locks</span>');
    expect(optionsHtml).toContain('Help improve ResistGate');
    expect(optionsHtml).toContain('Pick a plan and checkout opens in a new tab.');
    expect(frictionHtml).toContain('You blocked this for a reason.');
    expect(intentionHtml).toContain('Pause before you enter.');
    expect(intentionHtml).toContain('Read your reminder first.');
    expect(intentionHtml).toContain('Optional intent check');
    expect(intentionHtml).toContain('Avoidance');
    expect(intentionHtml).not.toContain('Today’s budget');
    expect(whatsNewHtml).toContain('Your intention, front and center.');
    expect(whatsNewHtml).toContain('Release highlights');
    expect(whatsNewHtml).toContain('Set your first intention');
  });

  it('lets the user pick a plan inside the extension before checkout opens', () => {
    const optionsHtml = fs.readFileSync(path.resolve(repoRoot, 'options/options.html'), 'utf8');
    const optionsJs = fs.readFileSync(path.resolve(repoRoot, 'options/options.js'), 'utf8');

    for (const plan of ['monthly', 'yearly', 'lifetime']) {
      expect(optionsHtml).toContain(`name="checkout-plan" value="${plan}"`);
    }
    expect(optionsHtml).toContain('name="checkout-plan" value="yearly" checked');
    expect(optionsHtml).toContain('id="checkout-status"');
    expect(optionsJs).toContain("chrome.runtime.sendMessage({ action: 'openPricingPage', plan }");
    expect(optionsJs).toContain('startCheckout(getSelectedPlan())');
  });

  it('offers a manual recheck when website activation does not land', () => {
    const optionsHtml = fs.readFileSync(path.resolve(repoRoot, 'options/options.html'), 'utf8');
    const optionsJs = fs.readFileSync(path.resolve(repoRoot, 'options/options.js'), 'utf8');

    expect(optionsHtml).toContain('id="refresh-entitlement-btn"');
    expect(optionsJs).toContain("action: 'refreshEntitlement'");
    expect(optionsJs).toContain("action: 'getBillingState'");
  });

  it('allows the extension to reach the ResistGate API from extension pages', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(repoRoot, 'manifest.json'), 'utf8'));
    const connectSrc = manifest.content_security_policy.extension_pages;

    expect(connectSrc).toContain('https://www.orlandoascanio.com');
    expect(manifest.externally_connectable.matches).toEqual([
      'https://www.orlandoascanio.com/*',
      'https://orlandoascanio.com/*'
    ]);
  });

  it('opens a real Free versus Pro comparison from the sidebar', () => {
    const optionsHtml = fs.readFileSync(path.resolve(repoRoot, 'options/options.html'), 'utf8');
    const optionsJs = fs.readFileSync(path.resolve(repoRoot, 'options/options.js'), 'utf8');

    expect(optionsJs).toContain('showPlanComparison()');
    expect(optionsJs).not.toContain("showPaywall('sidebar-compare-plans')");
    expect(optionsHtml).toContain('id="plan-comparison-modal"');
    expect(optionsHtml).toContain('Compare Free and Pro');
    expect(optionsHtml).toContain('Unlimited blocked sites');
    expect(optionsHtml).toContain('Progress dashboard and Focus Score');
    expect(optionsHtml).toContain('Strict Mode and override cooldowns');
    expect(optionsHtml).toContain('$0, no account required.');
    expect(optionsHtml).toContain('$3.99/month, $29.99/year, or $49.99 lifetime.');
    expect(optionsHtml).toContain('id="view-comparison-pricing-btn"');
    expect(optionsHtml).toContain('id="close-comparison-btn"');
  });

  it('labels Intention pause as available and keeps it out of paywall gating', () => {
    const optionsHtml = fs.readFileSync(path.resolve(repoRoot, 'options/options.html'), 'utf8');

    expect(optionsHtml).toContain('Intention pause');
    expect(optionsHtml).not.toContain('Intention pause <span class="panel-subtitle">· Free</span>');
    expect(optionsHtml).toContain('Show your saved site reminder before the challenge.');
    expect(optionsHtml).toContain('Reminders are saved per blocked site.');
    expect(optionsHtml).not.toContain('Add optional reminder');
    // Schedule and Intention pause are switched on by a real switch. They used to be
    // <details> elements whose open state *was* the setting, so collapsing the Schedule
    // panel to tidy the page silently turned the schedule off.
    expect(optionsHtml).not.toContain('<details id="schedule-panel"');
    expect(optionsHtml).toContain('<section id="schedule-panel" class="panel disclosure-panel toggle-panel panel-schedule">');
    expect(optionsHtml).toContain('<input id="schedule-enabled" type="checkbox" role="switch"');
    expect(optionsHtml).toContain('<div id="schedule-config" class="schedule-config" hidden>');
    expect(optionsHtml).toContain('Off - turn on to block only during chosen hours.');
    expect(optionsHtml).not.toContain('Use schedule');
    expect(optionsHtml).not.toContain('<details id="intention-panel"');
    expect(optionsHtml).toContain('<input id="intention-page-enabled" type="checkbox" role="switch"');
    expect(optionsHtml).not.toContain('Enable this pause');
    expect(optionsHtml).not.toContain('summary-state');
    expect(optionsHtml).toContain('How this works');
    expect(optionsHtml).not.toContain('data-pro-feature="intentionPage"');
    expect(optionsHtml).not.toContain('Intention Page — personal goals &amp; breathing exercises');
    expect(optionsHtml).toContain('Behavioral Friction before you open a site');
  });

  it('registers the distinct intention page as an extension resource', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(repoRoot, 'manifest.json'), 'utf8'));
    const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources || []);

    expect(resources).toContain('intention-page/index.html');
  });

function createOptionsDomHarness() {
  const elements = new Map();
  function makeElement(id = '') {
    const attributes = {};
    const element = {
      id,
      value: '',
      checked: false,
      disabled: false,
      hidden: false,
      textContent: '',
      className: '',
      type: 'text',
      min: '',
      max: '',
      dataset: {},
      style: {},
      children: [],
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      addEventListener() {},
      removeEventListener() {},
      focus() {},
      blur() {},
      click() {},
      remove() {},
      appendChild(child) {
        element.children.push(child);
        return child;
      },
      setAttribute(name, value) {
        attributes[name] = String(value);
      },
      getAttribute: (name) => attributes[name] ?? null,
      toggleAttribute() {},
      removeAttribute() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      closest: () => null
    };
    Object.defineProperty(element, 'innerHTML', {
      get: () => '',
      set: () => {
        element.children = [];
      }
    });
    return element;
  }

  const document = {
    activeElement: null,
    visibilityState: 'visible',
    body: makeElement('body'),
    addEventListener() {},
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeElement()
  };

  const timers = new Map();
  let nextTimer = 1;
  const sentMessages = [];

  return {
    elements,
    document,
    sentMessages,
    globals: {
      document,
      window: { addEventListener() {}, open() {}, location: { search: '' }, history: { replaceState() {} } },
      setTimeout: (fn) => {
        const id = nextTimer++;
        timers.set(id, fn);
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
      chrome: {
        runtime: {
          sendMessage: (message) => sentMessages.push(message),
          getManifest: () => ({ version: '1.5.0' })
        },
        storage: { onChanged: { addListener() {} } },
        tabs: { create() {} }
      }
    }
  };
}

describe('Options autosave', () => {
  const storedSettings = () => ({
    defaultAccessDuration: 15,
    blocklist: [{ id: '1', urlPattern: 'reddit.com' }],
    freeExperience: { manualOverrideDelaySeconds: 12, schedule: { enabled: false, days: [1, 2, 3, 4, 5] } },
    proFeatures: {},
    subscription: { tier: 'free' }
  });

  it('keeps an unsaved edit when a settings write from elsewhere lands mid-edit', async () => {
    const harness = createOptionsDomHarness();
    const context = await loadScriptInVm('options/options.js', harness.globals);
    const hooks = context.__RESISTGATE_OPTIONS_TEST_HOOKS__;
    const accessWindow = harness.document.getElementById('access-window-minutes');

    hooks.handleSettingsStorageChange({ settings: { newValue: storedSettings() } }, 'local');
    expect(String(accessWindow.value)).toBe('15');

    // The user changes the access window; the save is still debouncing when adding a
    // site (or a sync) writes settings and fires storage.onChanged.
    accessWindow.value = '45';
    hooks.scheduleAutosave();
    expect(hooks.hasPendingLocalEdits()).toBe(true);

    hooks.handleSettingsStorageChange({ settings: { newValue: storedSettings() } }, 'local');
    expect(String(accessWindow.value)).toBe('45');
  });

  it('re-renders from storage when nothing is waiting to save', async () => {
    const harness = createOptionsDomHarness();
    const context = await loadScriptInVm('options/options.js', harness.globals);
    const hooks = context.__RESISTGATE_OPTIONS_TEST_HOOKS__;
    const accessWindow = harness.document.getElementById('access-window-minutes');

    accessWindow.value = '45';
    expect(hooks.hasPendingLocalEdits()).toBe(false);
    hooks.handleSettingsStorageChange({ settings: { newValue: storedSettings() } }, 'local');
    expect(String(accessWindow.value)).toBe('15');
  });

  it('never overwrites the field that has focus', async () => {
    const harness = createOptionsDomHarness();
    const context = await loadScriptInVm('options/options.js', harness.globals);
    const hooks = context.__RESISTGATE_OPTIONS_TEST_HOOKS__;
    const accessWindow = harness.document.getElementById('access-window-minutes');

    accessWindow.value = '4';
    harness.document.activeElement = accessWindow;
    hooks.handleSettingsStorageChange({ settings: { newValue: storedSettings() } }, 'local');
    expect(String(accessWindow.value)).toBe('4');
  });
});

describe('Options settings helpers', () => {
  async function loadHooks() {
    const env = createChromeMock();
    const context = await loadScriptInVm('options/options.js', {
      chrome: env.chrome,
      ...createBrowserLikeGlobals()
    });
    return context.__RESISTGATE_OPTIONS_TEST_HOOKS__;
  }

  it('adds a pasted list of sites and reports duplicates and invalid entries', async () => {
    const hooks = await loadHooks();
    const plan = hooks.planSiteAdditions(
      [{ urlPattern: 'reddit.com' }],
      'https://www.YouTube.com/watch?v=1, reddit.com\nx.com; not a domain x.com'
    );

    expect(plan.domains).toEqual(['www.youtube.com', 'x.com']);
    expect(plan.duplicates).toEqual(['reddit.com', 'x.com']);
    expect(plan.invalid).toEqual(['not', 'a', 'domain']);
    expect(hooks.formatSiteAddResult(plan)).toBe(
      '2 sites blocked. Already blocked: reddit.com, x.com. Not a valid domain: not, a, domain.'
    );
    expect(hooks.formatSiteAddResult({ domains: ['x.com'], duplicates: [], invalid: [] })).toBe('x.com blocked.');
  });

  it('suggests only common sites that are not already blocked', async () => {
    const hooks = await loadHooks();
    expect(hooks.getSiteSuggestions([{ urlPattern: 'youtube.com' }, { urlPattern: 'x.com' }]))
      .toEqual(['reddit.com', 'instagram.com', 'tiktok.com', 'facebook.com', 'netflix.com']);
    expect(hooks.filterBlocklist([{ urlPattern: 'reddit.com' }, { urlPattern: 'x.com' }], 'RED'))
      .toEqual([{ urlPattern: 'reddit.com' }]);
  });

  it('explains number-field errors instead of silently clamping', async () => {
    const hooks = await loadHooks();
    expect(hooks.getNumberFieldError('12', 10, 15, 'Override pause', 'sec')).toBeNull();
    expect(hooks.getNumberFieldError('30', 10, 15, 'Override pause', 'sec'))
      .toBe('Override pause must be between 10 and 15 sec.');
    expect(hooks.getNumberFieldError('', 1, 1440, 'Access window', 'min')).toBe("Access window can't be empty.");
    expect(hooks.getNumberFieldError('2.5', 1, 1440, 'Access window', 'min')).toBe('Access window must be a whole number.');
  });

  it('flags an empty schedule and labels overnight and all-day windows', async () => {
    const hooks = await loadHooks();
    expect(hooks.getScheduleError([])).toContain('Pick at least one day');
    expect(hooks.getScheduleError([1])).toBeNull();
    expect(hooks.describeScheduleWindow('09:00', '17:00')).toBe('9:00 AM-5:00 PM');
    expect(hooks.describeScheduleWindow('22:00', '06:00')).toBe('10:00 PM-6:00 AM (overnight)');
    expect(hooks.describeScheduleWindow('08:00', '08:00')).toBe('all day');
  });

  it('formats the free Today strip', async () => {
    const hooks = await loadHooks();
    expect(hooks.formatTodaySummary({ blockedToday: 0, topDomains: [] }))
      .toBe('No blocked attempts yet. The gate is quiet.');
    expect(hooks.formatTodaySummary({ blockedToday: 7, topDomains: [{ domain: 'reddit.com', count: 4 }] }))
      .toBe('7 blocked attempts · most on reddit.com (4)');
    expect(hooks.formatTodaySummary({ blockedToday: 1, topDomains: [] })).toBe('1 blocked attempt');
  });

  it('exports settings without the tier or any live lock', async () => {
    const hooks = await loadHooks();
    const exported = hooks.buildSettingsExport({
      blocklist: [{ id: '1', urlPattern: 'x.com' }],
      subscription: { tier: 'pro' },
      proFeatures: {
        strictModeDisableRequestedAt: 123,
        commitmentMode: { active: true, durationHours: 4, activatedAt: 1, expiresAt: 9999999999999 }
      }
    }, '1.5.0', Date.UTC(2026, 8, 17));

    expect(exported.format).toBe('resistgate-settings');
    expect(exported.extensionVersion).toBe('1.5.0');
    expect(exported.exportedAt).toBe('2026-09-17T00:00:00.000Z');
    expect(exported.settings.subscription).toBeUndefined();
    expect(exported.settings.proFeatures.commitmentMode).toEqual({
      active: false, durationHours: 4, activatedAt: null, expiresAt: null
    });
    expect(exported.settings.proFeatures.strictModeDisableRequestedAt).toBeNull();
  });

  it('rejects files that are not ResistGate backups', async () => {
    const hooks = await loadHooks();
    expect(hooks.parseSettingsImport('not json').ok).toBe(false);
    expect(hooks.parseSettingsImport('{"format":"other","settings":{}}').error).toBe("That file isn't a ResistGate backup.");
    expect(hooks.parseSettingsImport('{"format":"resistgate-settings","formatVersion":99,"settings":{}}').error)
      .toContain('newer version');
    expect(hooks.parseSettingsImport('{"format":"resistgate-settings","formatVersion":1,"settings":{"blocklist":"x"}}').ok)
      .toBe(false);

    const parsed = hooks.parseSettingsImport(JSON.stringify({
      format: 'resistgate-settings',
      formatVersion: 1,
      exportedAt: '2026-09-17T00:00:00.000Z',
      settings: { blocklist: [{ urlPattern: 'x.com' }, { urlPattern: 'reddit.com' }] }
    }));
    expect(parsed.ok).toBe(true);
    expect(parsed.siteCount).toBe(2);
  });

  it('imports keep this browser\'s tier and lock state, whatever the file says', async () => {
    const hooks = await loadHooks();
    const current = {
      subscription: { tier: 'free' },
      proFeatures: { commitmentMode: { active: false, durationHours: 2 }, strictModeDisableRequestedAt: null }
    };
    const merged = hooks.mergeImportedSettings(current, {
      subscription: { tier: 'pro' },
      blocklist: [{ urlPattern: 'x.com' }],
      proFeatures: { commitmentMode: { active: true, expiresAt: 9999999999999 }, strictModeDisableRequestedAt: 5 }
    });

    expect(merged.subscription).toEqual({ tier: 'free' });
    expect(merged.proFeatures.commitmentMode).toEqual({ active: false, durationHours: 2 });
    expect(merged.proFeatures.strictModeDisableRequestedAt).toBeNull();
    expect(merged.blocklist).toEqual([{ urlPattern: 'x.com' }]);
  });

  it('describes when Commitment Mode will end', async () => {
    const hooks = await loadHooks();
    const now = new Date(2026, 8, 17, 9, 0);
    expect(hooks.formatCommitmentEnd(2, now)).toMatch(/^until .+ today$/);
    expect(hooks.formatCommitmentEnd(20, now)).toMatch(/^until .+ tomorrow$/);
  });

  it('opens What\'s New without claiming an update the user did not make', async () => {
    const hooks = await loadHooks();
    // ?from= renders as "You moved from version X"; the old hard-coded from=1.3.3 told every
    // 1.4.x user they had just upgraded from 1.3.3.
    expect(hooks.getWhatsNewUrl()).toBe('https://www.orlandoascanio.com/resistgate/updated');
  });
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

  it('renders, expires, and re-blocks active temporary access from the popup', async () => {
    const popupHtml = fs.readFileSync(path.resolve(repoRoot, 'popup/popup.html'), 'utf8');
    expect(popupHtml).toContain('id="active-access-section"');
    expect(popupHtml).toContain('id="active-access-list"');
    expect(popupHtml).toContain('Active access');

    const dom = createPopupDomHarness();
    const requests = [];
    const pendingCallbacks = [];
    const clearedIntervals = [];
    let intervalId = 0;
    const context = await loadScriptInVm('popup/popup.js', {
      chrome: {
        runtime: {
          sendMessage: (request, callback) => {
            requests.push(request);
            pendingCallbacks.push(callback);
          }
        },
        storage: {
          local: {
            get: () => {},
            remove: () => {}
          }
        },
        tabs: {
          query: () => {}
        }
      },
      document: dom.document,
      window: {
        addEventListener: () => {},
        open: () => {}
      },
      setInterval: () => {
        intervalId += 1;
        return intervalId;
      },
      clearInterval: (id) => {
        clearedIntervals.push(id);
      }
    });

    const hooks = context.__RESISTGATE_POPUP_TEST_HOOKS__;
    const now = Date.now();
    expect(hooks.formatActiveAccessCountdown(522_000)).toBe('8:42 remaining');
    expect(hooks.formatActiveAccessCountdown(3_661_000)).toBe('1:01:01 remaining');
    expect(hooks.normalizeActiveAccessGrants([
      { domain: 'reddit.com', expiresAt: now + 60_000 },
      { domain: 'expired.com', expiresAt: now - 1 },
      { domain: 'youtube.com', expiresAt: now + 30_000 }
    ], now).map((entry) => entry.domain)).toEqual([
      'youtube.com',
      'reddit.com'
    ]);

    hooks.renderActiveTemporaryAccess([
      { domain: 'www.reddit.com', expiresAt: now + 522_000 }
    ]);

    const section = dom.elements['active-access-section'];
    const list = dom.elements['active-access-list'];
    expect(section.classList.contains('hidden')).toBe(false);
    expect(list.children).toHaveLength(1);
    const row = list.children[0];
    const button = row.children[1];
    expect(button.textContent).toBe('Re-block now');
    expect(button.attributes['aria-label']).toBe('Re-block reddit.com now');
    expect(row.children[0].children[1].textContent).toMatch(/remaining$/);

    hooks.reblockTemporaryAccess('www.reddit.com', button);
    expect(requests.at(-1)).toEqual({
      action: 'revokeTemporaryAccess',
      domain: 'www.reddit.com'
    });
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Re-blocking…');

    pendingCallbacks.shift()({ success: true });
    expect(requests.at(-1)).toEqual({ action: 'getActiveTemporaryAccess' });
    pendingCallbacks.shift()({ success: true, access: [] });
    expect(section.classList.contains('hidden')).toBe(true);
    expect(clearedIntervals.length).toBeGreaterThan(0);
  });

  it('retains active access after a failed re-block and refreshes expired rows', async () => {
    const dom = createPopupDomHarness();
    const requests = [];
    const pendingCallbacks = [];
    const context = await loadScriptInVm('popup/popup.js', {
      chrome: {
        runtime: {
          sendMessage: (request, callback) => {
            requests.push(request);
            pendingCallbacks.push(callback);
          }
        },
        storage: {
          local: {
            get: () => {},
            remove: () => {}
          }
        },
        tabs: {
          query: () => {}
        }
      },
      document: dom.document,
      window: {
        addEventListener: () => {},
        open: () => {}
      },
      setInterval: () => 7,
      clearInterval: () => {}
    });

    const hooks = context.__RESISTGATE_POPUP_TEST_HOOKS__;
    const expiresAt = Date.now() + 60_000;
    hooks.renderActiveTemporaryAccess([{ domain: 'reddit.com', expiresAt }]);

    const button = dom.elements['active-access-list'].children[0].children[1];
    hooks.reblockTemporaryAccess('reddit.com', button);
    pendingCallbacks.shift()({ success: false, error: 'Unable to re-block this site right now.' });
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Re-block now');
    expect(requests.at(-1)).toEqual({ action: 'getActiveTemporaryAccess' });

    pendingCallbacks.shift()({
      success: true,
      access: [{ domain: 'reddit.com', expiresAt }]
    });
    expect(dom.elements['active-access-section'].classList.contains('hidden')).toBe(false);

    hooks.tickActiveAccessCountdowns(expiresAt + 1);
    expect(requests.at(-1)).toEqual({ action: 'getActiveTemporaryAccess' });
    hooks.clearActiveAccessCountdown();
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
