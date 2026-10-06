// Settings and reminders stay inside the extension. The preview has no runtime writes.
const DEMO_PHRASE = 'I am choosing this visit intentionally.';
// Screenshots of the real challenge at each level, for the gate the user will actually hit.
const LEVEL_PREVIEWS = {
  gate: {
    easy: { src: 'images/challenge-easy.webp', height: 957, title: 'Easy: a 12-character code', caption: 'Type a random code exactly. Quick, but not something you can do on autopilot.' },
    moderate: { src: 'images/challenge-moderate.webp', height: 911, title: 'Moderate: two sentences', caption: 'Copy two short sentences with full accuracy. Mistakes are highlighted as you type.' },
    hard: { src: 'images/challenge-hard.webp', height: 950, title: 'Hard: five paragraphs', caption: 'Five paragraphs, one at a time. For the sites you most want to stay off.' }
  },
  intention: {
    easy: { src: 'images/intention-challenge-easy.webp', height: 948, title: 'Easy: one short line', caption: 'Your reminder comes first, then one short line to type.' },
    moderate: { src: 'images/intention-challenge-moderate.webp', height: 948, title: 'Moderate: a longer line', caption: 'Your reminder comes first, then a full sentence to type.' },
    hard: { src: 'images/intention-challenge-hard.webp', height: 994, title: 'Hard: the longest line', caption: 'Your reminder comes first, then the longest line to type.' }
  }
};
// The three screens of each gate, in order. The typing step uses the level preview's screenshot.
const TOUR_STEPS = {
  gate: [
    { src: 'images/friction-prepare.webp', width: 1040, height: 869, title: 'The page doesn’t load', body: 'You land on the gate instead. It shows how often you’ve already walked away today and asks how long you actually need.', alt: 'The gate page: Ready to earn access? It shows how many times you resisted youtube.com today and lets you pick a 5, 10, 15, or 30 minute visit.' },
    { typing: true, title: 'You type to earn it', body: 'Copy the text exactly. Pasting is blocked, and the harder the level, the more you type.', alt: 'The typing challenge: the text to copy is highlighted as you type, with progress and accuracy below.' },
    { src: 'images/friction-success.webp', width: 1040, height: 837, title: 'The visit has a timer', body: 'You get the window you picked. When it runs out, the site is blocked again. Changed your mind? “Actually, never mind” closes it early.', alt: 'Access Ready: access is open for 10 minutes, with a countdown and an Actually, never mind link.' }
  ],
  intention: [
    { src: 'images/intention-pause.webp', width: 1200, height: 738, title: 'You get a pause, not the page', body: 'Your reminder for that site shows first, with how many times you’ve already walked away today.', alt: 'The pause page for youtube.com, showing the reminder Finish the chem lab write-up first and an optional list of reasons.' },
    { typing: true, title: 'You type to earn it', body: 'Copy one line exactly. Pasting is blocked, and harder levels use a longer line.', alt: 'The challenge: type one line exactly to earn the visit, with progress and accuracy below.' },
    { src: 'images/intention-success.webp', width: 1040, height: 494, title: 'The visit has a timer', body: 'You get a set number of minutes. When they run out, the site is blocked again.', alt: 'Access granted: the visit is open for 10 minutes.' }
  ]
};
let previewSwapTimer = null;
let welcomeState = null;
let reminderDomain = '';
let setupDirty = false;
let reminderDirty = false;
let reminderDraftDomain = '';
let busy = false;
let refreshVersion = 0;

function welcomeRequest(request) {
  return new Promise((resolve, reject) => {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      reject(new Error('Open this setup page from ResistGate in Chrome.'));
      return;
    }
    const timeout = setTimeout(() => reject(new Error('The extension did not respond. Retry to check your saved setup.')), 6000);
    try {
      chrome.runtime.sendMessage(request, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError || !response?.success) {
          reject(new Error(response?.error || 'Could not connect to ResistGate. Reload the extension and retry.'));
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

function showWelcomeStatus(message, error = false) {
  const status = document.getElementById('welcome-status');
  status.textContent = message;
  status.dataset.error = String(error);
}

function getWelcomeSummary(state, domain) {
  const sites = state.settings.blocklist;
  const target = sites.find((entry) => entry.urlPattern === domain) || sites[0];
  if (!target) return { title: 'Installed. Now add your first distraction.', detail: '', target: null, active: false };
  const active = state.activeDomains.includes(target.urlPattern);
  return {
    title: active ? `${target.urlPattern} is now blocked.` : `${target.urlPattern} is saved.`,
    detail: active
      ? `${sites.length} ${sites.length === 1 ? 'site' : 'sites'} saved. Test it to experience your current gate.`
      : 'This site is not blocking right now. Check Settings for paused blocking, schedules, temporary access, or access conditions.',
    target,
    active
  };
}

function renderWelcomeState(state) {
  welcomeState = state;
  const settings = state.settings;
  const summary = getWelcomeSummary(state, reminderDomain);
  reminderDomain = summary.target?.urlPattern || '';
  document.getElementById('setup-fields').disabled = false;
  document.getElementById('retry-btn').hidden = true;
  document.getElementById('saved-setup').hidden = !summary.target;
  document.getElementById('saved-title').textContent = summary.title;
  document.getElementById('saved-summary').textContent = summary.detail;
  const minutes = settings.defaultAccessDuration;
  document.getElementById('access-summary').textContent = `Configured access: ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}. After access expires, blocking resumes while your blocking rules apply.`;
  document.getElementById('test-site-btn').hidden = !summary.active;
  if (summary.active) document.getElementById('test-site-btn').textContent = `Test it: open ${summary.target.urlPattern}`;
  document.getElementById('site-step-title').textContent = summary.target ? 'Add another site (optional)' : 'Add your first site';
  document.getElementById('setup-title').textContent = summary.target ? 'Continue your setup' : 'Set up your first distraction';
  document.getElementById('save-setup-btn').textContent = summary.target ? 'Save setup' : 'Add site and save';
  document.getElementById('site-help').textContent = summary.target
    ? 'Leave this empty to change only the difficulty. Your existing sites stay saved.'
    : 'Enter a domain or paste a website address. Nothing is selected for you.';
  const intention = settings.proFeatures.intentionPage.enabled;
  const descriptions = intention ? ['Short line', 'Medium line', 'Longer line'] : ['Random code', '1–2 sentences', '5 paragraphs'];
  ['easy', 'moderate', 'hard'].forEach((level, index) => {
    document.getElementById(`${level}-description`).textContent = descriptions[index];
    if (!setupDirty) document.querySelector(`input[name="level"][value="${level}"]`).checked = settings.challengeTypes.typing.level === level;
  });
  const level = settings.challengeTypes.typing.level;
  document.getElementById('difficulty-help').textContent = `Currently ${level[0].toUpperCase() + level.slice(1)}. ${intention ? 'The intention page asks you to type a line after a pause.' : 'The typing gate opens directly, without an intention pause.'}`;
  updateLevelPreview();
  renderTour(intention, level);
  const reminderTarget = reminderDirty ? reminderDraftDomain : reminderDomain;
  const draftSiteExists = settings.blocklist.some((entry) => entry.urlPattern === reminderTarget);
  document.getElementById('reminder-section').hidden = !summary.target && !reminderDirty;
  document.getElementById('reminder-label').textContent = `Reminder for ${reminderTarget}`;
  document.getElementById('save-reminder-btn').disabled = !draftSiteExists;
  if (reminderDirty && !draftSiteExists) {
    document.getElementById('reminder-status').textContent = 'This site was removed elsewhere. Your draft is still here; add the site again before saving it.';
  }
  document.getElementById('reminder-help').textContent = intention
    ? 'Optional. Shown when you pause before this site. Saved only on this device.'
    : 'Optional. To see this reminder at the gate, enable the Intention Page in Settings.';
  if (!reminderDirty) document.getElementById('reminder-input').value = summary.target?.personalGoal || '';
}

async function loadWelcomeState() {
  if (busy) return;
  const version = ++refreshVersion;
  try {
    const state = await welcomeRequest({ action: 'getWelcomeState' });
    if (version !== refreshVersion || busy) return;
    renderWelcomeState(state);
    showWelcomeStatus(state.settings.blocklist.length ? 'Your saved setup is loaded.' : 'Installed. Now add your first distraction.');
  } catch (error) {
    if (version !== refreshVersion || busy) return;
    document.getElementById('setup-fields').disabled = true;
    document.getElementById('retry-btn').hidden = false;
    document.getElementById('test-site-btn').hidden = true;
    document.getElementById('saved-setup').hidden = true;
    showWelcomeStatus(error.message, true);
  }
}

async function saveWelcomeSetup(event) {
  event.preventDefault();
  if (busy || !welcomeState) return;
  const level = document.querySelector('input[name="level"]:checked')?.value;
  if (!level) return showWelcomeStatus('Choose a challenge level before saving.', true);
  busy = true;
  ++refreshVersion;
  document.getElementById('setup-fields').disabled = true;
  showWelcomeStatus('Saving your setup…');
  try {
    const domain = document.getElementById('site-input').value.trim();
    const state = await welcomeRequest({ action: 'saveWelcomeSetup', domain, level });
    reminderDomain = state.savedDomain || reminderDomain;
    setupDirty = false;
    reminderDirty = false;
    document.getElementById('site-input').value = '';
    updateSuggestionState();
    renderWelcomeState(state);
    showWelcomeStatus('Setup saved.');
    document.getElementById('saved-title').focus();
  } catch (error) {
    document.getElementById('saved-setup').hidden = true;
    document.getElementById('retry-btn').hidden = false;
    showWelcomeStatus(`${error.message} Your entries are still here.`, true);
  } finally {
    busy = false;
    document.getElementById('setup-fields').disabled = false;
  }
}

async function saveWelcomeReminder(event) {
  event.preventDefault();
  if (busy || !reminderDomain) return;
  busy = true;
  ++refreshVersion;
  const button = document.getElementById('save-reminder-btn');
  const status = document.getElementById('reminder-status');
  button.disabled = true;
  status.textContent = 'Saving reminder…';
  try {
    const state = await welcomeRequest({ action: 'saveWelcomeReminder', domain: reminderDirty ? reminderDraftDomain : reminderDomain, personalGoal: document.getElementById('reminder-input').value });
    reminderDirty = false;
    renderWelcomeState(state);
    status.textContent = 'Reminder saved.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    busy = false;
    button.disabled = false;
  }
}

function getLevelPreview(level, intentionEnabled) {
  return (intentionEnabled ? LEVEL_PREVIEWS.intention : LEVEL_PREVIEWS.gate)[level] || null;
}

function updateLevelPreview() {
  const level = document.querySelector('input[name="level"]:checked')?.value;
  const preview = getLevelPreview(level, welcomeState?.settings.proFeatures.intentionPage.enabled === true);
  if (!preview) return;
  document.getElementById('level-preview-title').textContent = preview.title;
  document.getElementById('level-preview-caption').textContent = preview.caption;
  const img = document.getElementById('level-preview-img');
  if (img.dataset.src === preview.src) return;
  const firstRender = !img.dataset.src;
  img.dataset.src = preview.src;
  img.alt = `The ${level} challenge. ${preview.caption}`;
  const show = () => {
    img.height = preview.height;
    img.src = preview.src;
  };
  if (firstRender) return show();
  // Fade between screenshots so the change reads as a response to the choice.
  const figure = document.getElementById('level-preview');
  figure.classList?.add('is-swapping');
  clearTimeout(previewSwapTimer);
  previewSwapTimer = setTimeout(() => {
    img.onload = () => figure.classList?.remove('is-swapping');
    show();
  }, 120);
}

function getTourSteps(intentionEnabled, level) {
  const typing = getLevelPreview(level, intentionEnabled) || getLevelPreview('hard', intentionEnabled);
  return TOUR_STEPS[intentionEnabled ? 'intention' : 'gate'].map((step) => (
    step.typing ? { ...step, src: typing.src, width: 1040, height: typing.height } : step
  ));
}

// Match the tour to the gate and level this person will actually hit.
function renderTour(intentionEnabled, level) {
  const steps = getTourSteps(intentionEnabled, level);
  const tabs = [...document.querySelectorAll('.tour-steps [role="tab"]')];
  tabs.forEach((tab, index) => {
    const step = steps[index];
    Object.assign(tab.dataset, { src: step.src, width: String(step.width), height: String(step.height), alt: step.alt });
    tab.querySelector('strong').textContent = step.title;
    tab.querySelector('span').textContent = step.body;
  });
  const selected = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
  if (selected) selectTourStep(selected);
}

function selectTourStep(tab) {
  const tabs = [...document.querySelectorAll('.tour-steps [role="tab"]')];
  tabs.forEach((item) => {
    item.setAttribute('aria-selected', String(item === tab));
    item.tabIndex = item === tab ? 0 : -1;
  });
  const stage = document.getElementById('tour-stage');
  const img = document.getElementById('tour-img');
  stage.setAttribute('aria-labelledby', tab.id);
  if (img.getAttribute('src') === tab.dataset.src) return;
  stage.classList.add('is-swapping');
  setTimeout(() => {
    img.onload = () => stage.classList.remove('is-swapping');
    img.width = Number(tab.dataset.width);
    img.height = Number(tab.dataset.height);
    img.alt = tab.dataset.alt;
    img.src = tab.dataset.src;
  }, 120);
}

function handleTourKeydown(event) {
  const tabs = [...document.querySelectorAll('.tour-steps [role="tab"]')];
  const index = tabs.indexOf(event.currentTarget);
  const next = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  const target = tabs[(next + tabs.length) % tabs.length];
  target.focus();
  selectTourStep(target);
}

function updateSuggestionState() {
  const domain = document.getElementById('site-input').value.trim();
  document.querySelectorAll('[data-domain]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.domain === domain)));
}

function showDemoPanel(panel) {
  ['pause', 'challenge', 'success'].forEach((name) => {
    document.getElementById(`demo-${name}`).hidden = name !== panel;
  });
  document.getElementById('demo-reset-btn').hidden = panel === 'pause';
  document.getElementById(`demo-${panel}-title`).focus();
}

function updateDemoProgress() {
  const value = document.getElementById('demo-input').value;
  const complete = value === DEMO_PHRASE;
  document.getElementById('demo-finish-btn').disabled = !complete;
  document.getElementById('demo-progress').textContent = complete
    ? 'Exact match. You can finish the preview.'
    : `${value.length} / ${DEMO_PHRASE.length} characters. ${DEMO_PHRASE.startsWith(value) ? 'Keep typing.' : 'Check your text; it must match exactly.'}`;
}

async function openWelcomeOptions() {
  try {
    if (!globalThis.chrome?.runtime?.openOptionsPage) throw new Error('Open ResistGate from Chrome’s Extensions menu to access Settings.');
    await chrome.runtime.openOptionsPage();
  } catch (error) {
    showWelcomeStatus(error.message, true);
  }
}

function openWelcomeSection() {
  const section = window.location.hash.slice(1);
  if (section === 'preview') document.getElementById('preview').open = true;
  if (['setup', 'difficulty', 'preview'].includes(section)) document.getElementById(section).scrollIntoView({ block: 'start' });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('setup-form').addEventListener('submit', (event) => void saveWelcomeSetup(event));
  document.getElementById('reminder-form').addEventListener('submit', (event) => void saveWelcomeReminder(event));
  document.getElementById('setup-form').addEventListener('input', () => { setupDirty = true; });
  document.getElementById('reminder-input').addEventListener('input', () => {
    if (!reminderDirty) reminderDraftDomain = reminderDomain;
    reminderDirty = true;
  });
  document.getElementById('site-input').addEventListener('input', updateSuggestionState);
  document.querySelectorAll('input[name="level"]').forEach((radio) => radio.addEventListener('change', updateLevelPreview));
  document.querySelectorAll('.tour-steps [role="tab"]').forEach((tab) => {
    tab.addEventListener('click', () => selectTourStep(tab));
    tab.addEventListener('keydown', handleTourKeydown);
  });
  document.querySelectorAll('[data-domain]').forEach((button) => button.addEventListener('click', () => {
    document.getElementById('site-input').value = button.dataset.domain;
    setupDirty = true;
    updateSuggestionState();
  }));
  ['open-options-btn', 'saved-options-btn'].forEach((id) => document.getElementById(id).addEventListener('click', () => void openWelcomeOptions()));
  document.getElementById('retry-btn').addEventListener('click', () => void loadWelcomeState());
  document.getElementById('test-site-btn').addEventListener('click', () => {
    if (!reminderDomain) return;
    void chrome.tabs.create({ url: `https://${reminderDomain}` }).catch((error) => showWelcomeStatus(error.message, true));
  });
  document.getElementById('close-welcome-btn').addEventListener('click', () => {
    window.close();
    showWelcomeStatus('You can close this tab. Your saved sites and reminders will be here when you return.');
  });
  document.getElementById('demo-continue-btn').addEventListener('click', () => showDemoPanel('challenge'));
  document.getElementById('demo-input').addEventListener('input', updateDemoProgress);
  ['paste', 'drop'].forEach((name) => document.getElementById('demo-input').addEventListener(name, (event) => {
    event.preventDefault();
    document.getElementById('demo-progress').textContent = 'Type the line yourself to try the challenge.';
  }));
  document.getElementById('demo-finish-btn').addEventListener('click', () => {
    if (document.getElementById('demo-input').value === DEMO_PHRASE) showDemoPanel('success');
  });
  document.getElementById('demo-reset-btn').addEventListener('click', () => {
    document.getElementById('demo-input').value = '';
    updateDemoProgress();
    showDemoPanel('pause');
  });
  window.addEventListener('focus', () => void loadWelcomeState());
  window.addEventListener('hashchange', openWelcomeSection);
  void loadWelcomeState().then(openWelcomeSection);
});

if (typeof globalThis !== 'undefined') {
  globalThis.__RESISTGATE_WELCOME_TEST_HOOKS__ = {
    welcomeRequest, getWelcomeSummary, loadWelcomeState, saveWelcomeSetup,
    saveWelcomeReminder, renderWelcomeState, updateDemoProgress, showDemoPanel,
    getLevelPreview, updateLevelPreview, getTourSteps, DEMO_PHRASE, LEVEL_PREVIEWS
  };
}
