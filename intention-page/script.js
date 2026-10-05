let currentOriginalUrl = null;
let currentSettings = null;
let selectedReason = '';
let breathingCountdownInterval = null;
let breathingPauseComplete = true;
let challengeStartTime = 0;
let currentChallengeText = '';

const INTENTION_PRECHECK_KEY = 'resistgateIntentionPrecheck';
const BREATHING_COUNTDOWN_SECONDS = 10;
const DEFAULT_ACCESS_MINUTES = 5;
const CHALLENGE_TEXT = {
  easy: 'I am choosing this visit intentionally.',
  moderate: 'I will use this site for my stated purpose, then leave.',
  hard: 'I will use this site for my stated purpose, avoid autopilot, and leave when my access window ends.'
};

document.addEventListener('DOMContentLoaded', function () {
  const urlParams = new URLSearchParams(window.location.search);
  currentOriginalUrl = urlParams.get('originalUrl');

  const continueButton = document.getElementById('continue-to-challenge');
  const closeButton = document.getElementById('close-page');
  const backButton = document.getElementById('back-to-intention');
  const submitButton = document.getElementById('submit-challenge');
  const typingInput = document.getElementById('typing-input');

  continueButton.addEventListener('click', handleContinueToChallenge);
  closeButton.addEventListener('click', leavePage);
  backButton.addEventListener('click', function () {
    setActivePanel('pause');
  });
  submitButton.addEventListener('click', completeChallenge);
  typingInput.addEventListener('contextmenu', (event) => event.preventDefault());
  typingInput.addEventListener('paste', function (event) {
    event.preventDefault();
    document.getElementById('typing-error').textContent = 'No shortcuts in ResistGate. Earn it.';
  });
  typingInput.addEventListener('input', updateChallengeState);
  typingInput.addEventListener('keydown', function (event) {
    if (event.ctrlKey && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) {
      event.preventDefault();
    }
  });
  document.getElementById('task-intent-input').addEventListener('input', updateDecisionState);
  document.querySelectorAll('[data-reason]').forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', function () {
      selectReason(button.getAttribute('data-reason'));
    });
  });

  renderTarget();
  loadSettings();
});

function loadSettings() {
  chrome.runtime.sendMessage({ action: 'getSettings' }, function (response) {
    if (!(response && response.settings)) {
      openChallengePage(false);
      return;
    }

    currentSettings = response.settings;

    if (!isIntentionPageEnabled()) {
      openChallengePage(false);
      return;
    }

    renderIntentionPage();
    recordBlockedVisit();
  });
}

function renderTarget() {
  const blockedSite = document.getElementById('blocked-site');
  const safeTargetUrl = getSafeTargetUrl(currentOriginalUrl);
  blockedSite.textContent = safeTargetUrl
    ? new URL(safeTargetUrl).hostname.replace(/^www\./, '')
    : 'Unknown destination';
}

function renderIntentionPage() {
  const goal = getPerDomainGoal();
  const intentionPage = currentSettings?.proFeatures?.intentionPage || {};
  const personalGoalDisplay = document.getElementById('personal-goal-display');
  const breathingExercise = document.getElementById('breathing-exercise');

  personalGoalDisplay.textContent = goal || 'You blocked this for a reason.';
  renderProIntentPrompt();

  if (intentionPage.showBreathingExercise === true) {
    breathingPauseComplete = false;
    breathingExercise.classList.remove('hidden');
    startBreathingCountdown();
  } else {
    breathingPauseComplete = true;
    stopBreathingCountdown();
    breathingExercise.classList.add('hidden');
  }

  updateDecisionState();
}

function renderProIntentPrompt() {
  const proIntentCard = document.getElementById('pro-intent-card');
  if (isProBehavioralFrictionActive()) {
    proIntentCard.classList.remove('hidden');
  } else {
    proIntentCard.classList.add('hidden');
  }
}

function selectReason(reason) {
  selectedReason = reason || '';
  document.querySelectorAll('[data-reason]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.getAttribute('data-reason') === selectedReason));
  });
  announce(selectedReason ? 'Intent noted. Continue when ready.' : 'Continue when ready.');
  updateDecisionState();
}

function updateDecisionState() {
  const continueButton = document.getElementById('continue-to-challenge');
  const taskIntent = getTaskIntent();
  const hasRequiredProIntent = !isProBehavioralFrictionActive() || taskIntent.length >= 4;
  const canContinue = breathingPauseComplete && hasRequiredProIntent;

  continueButton.disabled = !canContinue;
}

function handleContinueToChallenge() {
  if (document.getElementById('continue-to-challenge').disabled) {
    return;
  }

  persistIntentionPrecheck();
  startInPageChallenge();
}

function startInPageChallenge() {
  stopBreathingCountdown();
  currentChallengeText = getChallengeText();
  challengeStartTime = Date.now();

  document.getElementById('challenge-text').textContent = currentChallengeText;
  document.getElementById('challenge-length').textContent = currentChallengeText.length;
  document.getElementById('typing-input').value = '';
  document.getElementById('typing-error').textContent = '';
  updateChallengeState();
  setActivePanel('challenge');
  announce('Typing challenge ready. Type the line exactly.');
  document.getElementById('typing-input').focus();
}

function updateChallengeState() {
  const typingInput = document.getElementById('typing-input');
  const typedText = typingInput.value;
  const challengeText = currentChallengeText || getChallengeText();
  const charCount = document.getElementById('char-count');
  const accuracyEl = document.getElementById('accuracy');
  const errorEl = document.getElementById('typing-error');
  const submitButton = document.getElementById('submit-challenge');

  charCount.textContent = typedText.length;

  let correctChars = 0;
  for (let i = 0; i < typedText.length; i++) {
    if (i < challengeText.length && typedText[i] === challengeText[i]) {
      correctChars++;
    }
  }

  const accuracy = typedText.length > 0 ? Math.round((correctChars / typedText.length) * 100) : 100;
  const hasError = typedText !== challengeText.slice(0, typedText.length);
  const complete = typedText === challengeText;

  accuracyEl.textContent = `${accuracy}%`;
  typingInput.classList.toggle('has-error', hasError);
  errorEl.textContent = hasError ? 'You have a mismatch. Correct it to continue.' : '';
  submitButton.disabled = !complete;
}

function completeChallenge() {
  const submitButton = document.getElementById('submit-challenge');
  if (submitButton.disabled) {
    return;
  }

  const safeTargetUrl = getSafeTargetUrl(currentOriginalUrl);
  if (!safeTargetUrl) {
    alert('Invalid destination URL.');
    return;
  }

  const duration = getAccessDurationMinutes();
  const timeSpent = Math.max(0, Math.round((Date.now() - challengeStartTime) / 1000));
  const domain = new URL(safeTargetUrl).hostname;

  submitButton.disabled = true;
  submitButton.textContent = 'Granting access...';
  announce('Granting temporary access.');

  chrome.runtime.sendMessage({
    action: 'grantTemporaryAccess',
    urlPattern: domain,
    duration,
    timeSpent,
    meta: {
      method: 'challenge',
      taskIntent: getTaskIntent(),
      customChallengeAnswered: false,
      earnAccessEnabled: true
    }
  }, function (response) {
    if (response && response.success) {
      renderSuccessState(safeTargetUrl, duration);
      return;
    }

    submitButton.disabled = false;
    submitButton.textContent = 'Grant access';
    alert(response?.error || 'ResistGate could not grant access. Please try again.');
  });
}

function renderSuccessState(targetUrl, duration) {
  document.getElementById('success-duration').textContent = `Access is open for ${duration} minutes.`;
  document.getElementById('continue-to-site').href = targetUrl;
  setActivePanel('success');
  announce(`Access granted for ${duration} minutes.`);
}

function setActivePanel(panel) {
  document.getElementById('pause-panel').classList.toggle('hidden', panel !== 'pause');
  document.getElementById('challenge-panel').classList.toggle('hidden', panel !== 'challenge');
  document.getElementById('success-panel').classList.toggle('hidden', panel !== 'success');

  const titleId = panel === 'challenge'
    ? 'challenge-title'
    : panel === 'success'
      ? 'success-title'
      : 'intention-title';
  const title = document.getElementById(titleId);
  if (title && typeof title.focus === 'function') {
    title.focus({ preventScroll: true });
  }
}

function getChallengeText() {
  const customPhrase = getCustomChallengePhrase();
  if (customPhrase) {
    return customPhrase;
  }

  const level = currentSettings?.challengeTypes?.typing?.level;
  if (level === 'easy' || level === 'moderate' || level === 'hard') {
    return CHALLENGE_TEXT[level];
  }
  return CHALLENGE_TEXT.hard;
}

function getCustomChallengePhrase(settings = currentSettings) {
  const custom = settings?.proFeatures?.customChallengePhrase;
  if (custom?.enabled !== true || typeof custom.text !== 'string') {
    return '';
  }

  return custom.text.trim();
}

function getAccessDurationMinutes() {
  const duration = Number(currentSettings?.defaultAccessDuration || currentSettings?.challengeTypes?.typing?.duration);
  if (!Number.isFinite(duration)) {
    return DEFAULT_ACCESS_MINUTES;
  }
  return Math.max(1, Math.min(120, Math.round(duration)));
}

function persistIntentionPrecheck() {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    sessionStorage.setItem(INTENTION_PRECHECK_KEY, JSON.stringify({
      originalUrl: currentOriginalUrl,
      reason: selectedReason,
      taskIntent: getTaskIntent(),
      timestamp: Date.now()
    }));
  } catch (err) {
    console.warn('Unable to store intention precheck:', err);
  }
}

function getTaskIntent() {
  const input = document.getElementById('task-intent-input');
  return input ? input.value.trim() : '';
}

// Leaving the pause is a resisted visit; it feeds the "gone back N of the last M times"
// line on the friction page. Recording is best-effort and never holds the user up.
function leavePage() {
  const safeTargetUrl = getSafeTargetUrl(currentOriginalUrl);
  if (!safeTargetUrl) {
    goBack();
    return;
  }

  let finished = false;
  const finish = function () {
    if (!finished) {
      finished = true;
      goBack();
    }
  };

  setTimeout(finish, 400);
  chrome.runtime.sendMessage({
    action: 'recordGateOutcome',
    domain: new URL(safeTargetUrl).hostname
  }, finish);
}

function goBack() {
  if (window.history && window.history.length > 1) {
    window.history.back();
    return;
  }

  window.close();
}

function announce(message) {
  const status = document.getElementById('status-announcement');
  if (status) {
    status.textContent = message;
  }
}

function recordBlockedVisit() {
  const safeTargetUrl = getSafeTargetUrl(currentOriginalUrl);
  if (!safeTargetUrl) {
    return;
  }

  const hostname = new URL(safeTargetUrl).hostname;
  chrome.runtime.sendMessage({
    action: 'recordBlockedVisit',
    urlPattern: hostname
  }, function (response) {
    if (response && response.resistanceCount > 0) {
      const n = response.resistanceCount;
      document.getElementById('resistance-count').textContent =
        `Resisted ${n} ${n === 1 ? 'time' : 'times'} today.`;
    }
  });
}

function openChallengePage(skipRecord = true) {
  const safeTargetUrl = getSafeTargetUrl(currentOriginalUrl);
  const originalUrl = safeTargetUrl || currentOriginalUrl || '';
  const params = new URLSearchParams({
    originalUrl,
    skipIntention: '1'
  });

  if (skipRecord) {
    params.set('skipRecord', '1');
  }

  window.location.href = chrome.runtime.getURL(`friction-page/index.html?${params.toString()}`);
}

function getPerDomainGoal() {
  const safeTargetUrl = getSafeTargetUrl(currentOriginalUrl);
  if (!safeTargetUrl) {
    return '';
  }

  const hostname = new URL(safeTargetUrl).hostname.replace(/^www\./, '');
  const entry = (currentSettings?.blocklist || []).find((item) => {
    const pattern = (item.urlPattern || '').toLowerCase();
    return hostname.endsWith(pattern) || pattern.endsWith(hostname);
  });

  return entry?.personalGoal?.trim() || '';
}

function isIntentionPageEnabled(settings = currentSettings) {
  return settings?.proFeatures?.intentionPage?.enabled === true;
}

function isProBehavioralFrictionActive(settings = currentSettings) {
  return settings?.proFeatures?.behavioralFriction?.enabled === true
    && settings?.proFeatures?.behavioralFriction?.requireTaskIntent !== false;
}

function getSafeTargetUrl(originalUrl) {
  try {
    const parsed = new URL(originalUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}

function startBreathingCountdown() {
  const countEl = document.getElementById('breathing-count');
  const phaseLabelEl = document.getElementById('breathing-phase-label');
  if (!countEl || !phaseLabelEl) return;

  stopBreathingCountdown();

  let remaining = BREATHING_COUNTDOWN_SECONDS;
  countEl.textContent = remaining;
  phaseLabelEl.textContent = 'Take 10 seconds.';

  breathingCountdownInterval = setInterval(function () {
    remaining -= 1;
    countEl.textContent = Math.max(remaining, 0);

    if (remaining <= 0) {
      stopBreathingCountdown();
      breathingPauseComplete = true;
      phaseLabelEl.textContent = 'Now choose deliberately.';
      updateDecisionState();
    }
  }, 1000);
}

function stopBreathingCountdown() {
  if (breathingCountdownInterval) {
    clearInterval(breathingCountdownInterval);
    breathingCountdownInterval = null;
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.__RESISTGATE_INTENTION_TEST_HOOKS__ = {
    leavePage,
    getSafeTargetUrl,
    isIntentionPageEnabled,
    isProBehavioralFrictionActive,
    getPerDomainGoal,
    handleContinueToChallenge,
    startInPageChallenge,
    updateChallengeState,
    completeChallenge,
    getChallengeText,
    getCustomChallengePhrase,
    getAccessDurationMinutes,
    openChallengePage,
    renderIntentionPage,
    selectReason,
    updateDecisionState,
    startBreathingCountdown,
    stopBreathingCountdown,
    __setCurrentSettingsForTest: (settings) => {
      currentSettings = settings;
    },
    __setOriginalUrlForTest: (url) => {
      currentOriginalUrl = url;
    },
    __setBreathingPauseCompleteForTest: (value) => {
      breathingPauseComplete = value === true;
    }
  };
}
