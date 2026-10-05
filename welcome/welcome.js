// Settings and reminders stay inside the extension. The preview has no runtime writes.
const DEMO_PHRASE = 'I am choosing this visit intentionally.';
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
    DEMO_PHRASE
  };
}
