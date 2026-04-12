// Friction Page Script
let startTime = null;
let accessDurationMinutes = 15;
let accessCountdownInterval = null;
let waitCountdownInterval = null;
let breathingAnimationTimeout = null;
let currentOriginalUrl = null;
let currentSettings = null;
let manualOverrideState = {
  requiredDelaySeconds: 12,
  locked: false,
  remainingSeconds: 0
};
let challengeMeta = {
  taskIntent: '',
  customChallengeAnswered: false,
  earnAccessEnabled: true
};

document.addEventListener('DOMContentLoaded', function () {
  const urlParams = new URLSearchParams(window.location.search);
  currentOriginalUrl = urlParams.get('originalUrl');

  const safeTargetUrl = getSafeTargetUrl(currentOriginalUrl);
  const blockedSite = document.getElementById('blocked-site');

  if (safeTargetUrl) {
    const hostname = new URL(safeTargetUrl).hostname;
    blockedSite.textContent = hostname;
    chrome.runtime.sendMessage({
      action: 'recordBlockedVisit',
      urlPattern: hostname
    });
    const searchBtn = document.getElementById('search-instead-btn');
    if (searchBtn) {
      searchBtn.href = 'https://www.google.com/search?q=' + encodeURIComponent(hostname);
    }
  } else {
    blockedSite.textContent = 'Unknown destination or unparseable URL.';
    document.querySelector('.message').textContent = 'The requested URL could not be verified. You can still complete the challenge if you believe this is correct.';
  }

  loadSettings();

  document.getElementById('start-unlock-challenge').addEventListener('click', function () {
    handleStartChallenge();
  });

  document.getElementById('manual-override-btn').addEventListener('click', function () {
    handleManualOverride();
  });

  document.getElementById('close-tab-btn').addEventListener('click', function () {
    window.close();
  });

  document.getElementById('confirm-start-challenge').addEventListener('click', function () {
    startTime = Date.now();
    startTypingChallenge(currentOriginalUrl);
  });

  document.getElementById('cancel-start-challenge').addEventListener('click', function () {
    document.getElementById('ready-confirmation').classList.add('hidden');
    document.getElementById('primary-actions-group').classList.remove('hidden');
    clearPrecheckError();
  });
});

function loadSettings() {
  chrome.runtime.sendMessage({ action: 'getSettings' }, function (response) {
    if (!(response && response.settings)) {
      return;
    }

    currentSettings = response.settings;

    accessDurationMinutes = currentSettings.defaultAccessDuration
      || currentSettings.challengeTypes?.typing?.duration
      || accessDurationMinutes;

    renderIntentionPage();
    renderCommitmentModeLock();
    renderProPrecheck();
    refreshManualOverrideStatus();
  });
}

function refreshManualOverrideStatus(onReady) {
  chrome.runtime.sendMessage({ action: 'getManualOverrideStatus' }, function (response) {
    if (response && response.success && response.status) {
      manualOverrideState = {
        requiredDelaySeconds: Number(response.status.requiredDelaySeconds) || getManualOverrideDelaySeconds(),
        locked: response.status.locked === true,
        remainingSeconds: Number(response.status.remainingSeconds) || 0
      };
    } else {
      manualOverrideState = {
        requiredDelaySeconds: getManualOverrideDelaySeconds(),
        locked: false,
        remainingSeconds: 0
      };
    }

    renderManualOverrideState();

    if (typeof onReady === 'function') {
      onReady();
    }
  });
}

function renderIntentionPage() {
  const isPro = currentSettings?.subscription?.tier === 'pro';
  const intentionPage = currentSettings?.proFeatures?.intentionPage || {};
  const intentionSection = document.getElementById('intention-section');
  const goalDisplay = document.getElementById('personal-goal-display');
  const breathingExercise = document.getElementById('breathing-exercise');
  const pageTitle = document.getElementById('page-title');

  if (!isPro || intentionPage.enabled !== true) {
    if (intentionSection) intentionSection.classList.add('hidden');
    return;
  }

  let hasContent = false;

  if (intentionPage.personalGoal) {
    pageTitle.textContent = 'Remember your goal.';
    goalDisplay.textContent = intentionPage.personalGoal;
    goalDisplay.classList.remove('hidden');
    hasContent = true;
  } else {
    goalDisplay.classList.add('hidden');
  }

  if (intentionPage.showBreathingExercise) {
    breathingExercise.classList.remove('hidden');
    startBreathingAnimation();
    hasContent = true;
  } else {
    breathingExercise.classList.add('hidden');
  }

  if (hasContent) {
    intentionSection.classList.remove('hidden');
  } else {
    intentionSection.classList.add('hidden');
  }
}

function startBreathingAnimation() {
  const circle = document.getElementById('breathing-circle');
  const text = document.getElementById('breathing-text');
  if (!circle || !text) return;

  if (breathingAnimationTimeout) {
    clearTimeout(breathingAnimationTimeout);
    breathingAnimationTimeout = null;
  }

  const phases = [
    { label: 'Breathe in', duration: 4000, className: 'breathe-in' },
    { label: 'Hold', duration: 7000, className: 'breathe-hold' },
    { label: 'Breathe out', duration: 8000, className: 'breathe-out' }
  ];

  let phaseIndex = 0;

  function runPhase() {
    if (!document.getElementById('breathing-circle')) return;
    const phase = phases[phaseIndex % phases.length];
    text.textContent = phase.label;
    circle.className = 'breathing-circle ' + phase.className;
    phaseIndex++;
    breathingAnimationTimeout = setTimeout(runPhase, phase.duration);
  }

  runPhase();
}

function renderCommitmentModeLock() {
  const banner = document.getElementById('commitment-lock-banner');
  const bannerText = document.getElementById('commitment-lock-text');
  if (!banner || !bannerText) return;

  chrome.runtime.sendMessage({ action: 'getCommitmentModeStatus' }, function (response) {
    if (response && response.success && response.status?.active) {
      const remainMin = Math.ceil(response.status.remainingSeconds / 60);
      bannerText.textContent = `Commitment Mode is active. All access is locked for ${remainMin} more minute${remainMin === 1 ? '' : 's'}.`;
      banner.classList.remove('hidden');

      // Disable all unlock buttons
      const challengeBtn = document.getElementById('start-unlock-challenge');
      const manualBtn = document.getElementById('manual-override-btn');
      if (challengeBtn) challengeBtn.disabled = true;
      if (manualBtn) manualBtn.disabled = true;

      const hint = document.getElementById('manual-override-hint');
      if (hint) hint.textContent = 'Commitment Mode is active. No access is possible until it expires.';
    } else {
      banner.classList.add('hidden');
    }
  });
}

function renderProPrecheck() {
  const proPrecheck = document.getElementById('pro-precheck');
  if (!currentSettings) {
    proPrecheck.classList.add('hidden');
    return;
  }

  const isPro = currentSettings.subscription?.tier === 'pro';
  const friction = currentSettings.proFeatures?.behavioralFriction || {};

  if (!isPro || friction.enabled !== true) {
    proPrecheck.classList.add('hidden');
    proPrecheck.innerHTML = '';
    return;
  }

  const sections = [];

  if (friction.requireTaskIntent !== false) {
    sections.push(`
      <label for="task-intent-input">What do you need to do here?</label>
      <textarea id="task-intent-input" class="typing-input precheck-input" rows="3" placeholder="Describe your specific goal on this site"></textarea>
    `);
  }

  if (friction.customChallengePrompt) {
    sections.push(`
      <label for="custom-challenge-input">Quick Check</label>
      <p class="helper-text">${escapeHtml(friction.customChallengePrompt)}</p>
      <input id="custom-challenge-input" class="precheck-input" type="text" maxlength="120" placeholder="Type your answer" />
    `);
  }

  if (friction.timedWaitEnabled === true) {
    sections.push(`
      <p class="helper-text">A ${friction.timedWaitSeconds || 20}-second pause will run before the challenge. Use this time to reconsider.</p>
    `);
  }

  if (isEarnAccessRuleActive()) {
    sections.push(`
      <p class="helper-text">Manual override is disabled. Complete at least ${getEarnAccessMinChallengeSeconds()} seconds of the challenge to unlock.</p>
    `);
  }

  if (sections.length === 0) {
    proPrecheck.classList.add('hidden');
    proPrecheck.innerHTML = '';
    return;
  }

  proPrecheck.innerHTML = sections.join('');
  proPrecheck.classList.remove('hidden');
}

function renderManualOverrideState() {
  const manualOverrideButton = document.getElementById('manual-override-btn');
  const hint = document.getElementById('manual-override-hint');

  if (!manualOverrideButton || !hint) {
    return;
  }

  const delaySeconds = manualOverrideState.requiredDelaySeconds || getManualOverrideDelaySeconds();
  const strictActive = isStrictFocusWindowActive();
  const locked = manualOverrideState.locked === true;
  const earnAccessActive = isEarnAccessRuleActive();

  manualOverrideButton.disabled = strictActive || locked || earnAccessActive;

  if (strictActive) {
    hint.textContent = 'Strict Mode is active. Manual override is disabled for this blocking window.';
    return;
  }

  if (earnAccessActive) {
    hint.textContent = `Manual override is disabled. Complete at least ${getEarnAccessMinChallengeSeconds()} seconds of the challenge to unlock access.`;
    return;
  }

  if (locked) {
    hint.textContent = `Manual override is temporarily locked. Try again in ${manualOverrideState.remainingSeconds}s.`;
    return;
  }

  hint.textContent = `Manual override unlocks access after ${delaySeconds} seconds.`;
}

function handleStartChallenge() {
  clearPrecheckError();

  const precheck = collectPrecheckMeta();
  if (!precheck.valid) {
    showPrecheckError(precheck.error);
    return;
  }

  challengeMeta = {
    taskIntent: precheck.taskIntent,
    customChallengeAnswered: precheck.customChallengeAnswered,
    earnAccessEnabled: precheck.earnAccessEnabled
  };

  let waitSeconds = precheck.timedWaitSeconds;

  // Apply a default 5 second countdown if no timed wait is configured
  // (i.e. free tier or timed wait not active on pro)
  if (waitSeconds <= 0) {
    waitSeconds = 5;
  }

  if (waitSeconds > 0) {
    startTimedWait(waitSeconds, function () {
      startChallengeFlow();
    });
    return;
  }

  startChallengeFlow();
}

function startChallengeFlow() {
  document.getElementById('primary-actions-group').classList.add('hidden');
  document.getElementById('ready-confirmation').classList.remove('hidden');
}

function handleManualOverride() {
  refreshManualOverrideStatus(function () {
    clearPrecheckError();

    if (isStrictFocusWindowActive()) {
      showPrecheckError('Strict Mode is active. Manual override is disabled right now.');
      return;
    }

    if (manualOverrideState.locked) {
      showPrecheckError(`Manual override is locked for ${manualOverrideState.remainingSeconds}s.`);
      return;
    }

    if (isEarnAccessRuleActive()) {
      showPrecheckError('Earn-Access is active. Complete the challenge to unlock access.');
      return;
    }

    const safeTargetUrl = getSafeTargetUrl(currentOriginalUrl);
    if (!safeTargetUrl) {
      alert('Invalid destination URL.');
      return;
    }

    const delaySeconds = manualOverrideState.requiredDelaySeconds || getManualOverrideDelaySeconds();
    const manualBtn = document.getElementById('manual-override-btn');
    const challengeBtn = document.getElementById('start-unlock-challenge');

    manualBtn.disabled = true;
    challengeBtn.disabled = true;

    let remaining = delaySeconds;
    manualBtn.textContent = `Manual Override (${remaining}s)`;

    if (waitCountdownInterval) {
      clearInterval(waitCountdownInterval);
    }

    waitCountdownInterval = setInterval(function () {
      remaining -= 1;

      if (remaining <= 0) {
        clearInterval(waitCountdownInterval);
        waitCountdownInterval = null;

        manualBtn.textContent = 'Manual Override';
        challengeBtn.disabled = false;

        requestTemporaryAccess({
          targetUrl: safeTargetUrl,
          duration: accessDurationMinutes,
          timeSpent: 0,
          meta: {
            method: 'manualOverride',
            waitedSeconds: delaySeconds,
            taskIntent: '',
            customChallengeAnswered: false,
            earnAccessEnabled: false
          }
        });
        return;
      }

      manualBtn.textContent = `Manual Override (${remaining}s)`;
    }, 1000);
  });
}

function collectPrecheckMeta() {
  const isPro = currentSettings?.subscription?.tier === 'pro';
  const friction = currentSettings?.proFeatures?.behavioralFriction || {};

  if (!isPro || friction.enabled !== true) {
    return {
      valid: true,
      timedWaitSeconds: 0,
      taskIntent: '',
      customChallengeAnswered: false,
      earnAccessEnabled: true
    };
  }

  const requireTaskIntent = friction.requireTaskIntent !== false;
  const taskIntentInput = document.getElementById('task-intent-input');
  const taskIntent = taskIntentInput ? taskIntentInput.value.trim() : '';

  if (requireTaskIntent && taskIntent.length < 4) {
    return {
      valid: false,
      error: 'Type a specific task before starting.',
      timedWaitSeconds: 0
    };
  }

  let customChallengeAnswered = false;
  if (friction.customChallengePrompt) {
    const customInput = document.getElementById('custom-challenge-input');
    const customAnswer = customInput ? customInput.value.trim() : '';

    if (customAnswer.length < 2) {
      return {
        valid: false,
        error: 'Answer the custom prompt before continuing.',
        timedWaitSeconds: 0
      };
    }

    customChallengeAnswered = true;
  }

  const timedWaitSeconds = friction.timedWaitEnabled === true
    ? (parseInt(friction.timedWaitSeconds, 10) || 20)
    : 0;

  return {
    valid: true,
    timedWaitSeconds,
    taskIntent,
    customChallengeAnswered,
    earnAccessEnabled: friction.earnAccessEnabled !== false
  };
}

function startTimedWait(seconds, onComplete) {
  const challengeBtn = document.getElementById('start-unlock-challenge');
  const manualBtn = document.getElementById('manual-override-btn');

  challengeBtn.disabled = true;
  manualBtn.disabled = true;

  let remaining = seconds;
  showPrecheckError(`Timed wait: ${remaining}s before challenge can begin.`);

  if (waitCountdownInterval) {
    clearInterval(waitCountdownInterval);
  }

  waitCountdownInterval = setInterval(function () {
    remaining -= 1;

    if (remaining <= 0) {
      clearInterval(waitCountdownInterval);
      waitCountdownInterval = null;

      clearPrecheckError();
      challengeBtn.disabled = false;
      manualBtn.disabled = isStrictFocusWindowActive();
      onComplete();
      return;
    }

    showPrecheckError(`Timed wait: ${remaining}s before challenge can begin.`);
  }, 1000);
}

function startTypingChallenge(originalUrl) {
  document.querySelector('.challenge-selection').style.display = 'none';
  showTypingChallenge(originalUrl);
}

function showTypingChallenge(originalUrl) {
  const container = document.querySelector('.content');
  container.innerHTML = '';

  const challengeDiv = document.createElement('div');
  challengeDiv.className = 'challenge-container';

  const productivityTexts = [
    'Every minute wasted on distractions is a minute stolen from your potential. Protect your time like it is your most valuable asset.',
    'Focus is a muscle. The more you practice resisting trivial distractions, the stronger it becomes.',
    'Discipline is choosing what you want most over what you want now.',
    'Your attention is valuable currency. Spend it deliberately.',
    'Progress requires focus. Each time you redirect attention, you grow stronger.',
    'Time is irreversible. Choose actions that build momentum toward meaningful outcomes.',
    'Purpose-driven effort beats busywork. Ask if this action aligns with your goals.',
    'Self-mastery is built one decision at a time.',
    'Small actions, consistently taken, shape identity and outcomes.',
    'Distraction is the enemy of progress. Confront it with deliberate resistance.'
  ];

  function getRandomParagraphs() {
    const shuffled = [...productivityTexts].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 5);
  }

  const selectedParagraphs = getRandomParagraphs();
  let currentParagraphIndex = 0;
  let completedParagraphs = 0;

  function displayCurrentParagraph() {
    const currentText = selectedParagraphs[currentParagraphIndex];

    challengeDiv.innerHTML = `
      <div style="text-align: center; margin-bottom: 20px;">
        <span class="step-badge">Challenge ${currentParagraphIndex + 1} of 5</span>
        <p class="instruction-text">Type the paragraph exactly as shown to continue.</p>
      </div>

      <div class="quote-box">
        <p class="quote-text">${currentText}</p>
      </div>

      <textarea id="typing-input" class="typing-input" placeholder="Start typing here..."></textarea>
      <p id="typing-error" class="error-text"></p>

      <div class="stats-row">
        <div class="stat-item">
          <span>Progress:</span>
          <span class="stat-value"><span id="char-count">0</span> / ${currentText.length}</span>
        </div>
        <div class="stat-item">
          <span>Accuracy:</span>
          <span id="accuracy" class="stat-value">100%</span>
        </div>
      </div>

      <div class="challenge-actions">
        <button id="cancel-challenge" class="btn btn-secondary">Quit</button>
        <button id="reset-typing" class="btn btn-secondary">Reset</button>
        <button id="submit-typing" class="unlock-btn" disabled>Submit</button>
      </div>
    `;

    container.innerHTML = '';
    container.appendChild(challengeDiv);

    const typingInput = document.getElementById('typing-input');
    const charCount = document.getElementById('char-count');
    const accuracySpan = document.getElementById('accuracy');
    const submitBtn = document.getElementById('submit-typing');
    const errorText = document.getElementById('typing-error');

    typingInput.focus();
    typingInput.addEventListener('contextmenu', (e) => e.preventDefault());
    typingInput.addEventListener('paste', (e) => {
      e.preventDefault();
      alert('No shortcuts in ResistGate. Earn it.');
    });

    typingInput.addEventListener('keydown', function (e) {
      if (e.ctrlKey && (['a', 'c', 'v', 'x'].includes(e.key.toLowerCase()))) {
        e.preventDefault();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!submitBtn.disabled) {
          submitBtn.click();
        }
      }
    });

    typingInput.addEventListener('input', function () {
      const typedText = typingInput.value;
      charCount.textContent = typedText.length;

      let correctChars = 0;
      for (let i = 0; i < typedText.length; i++) {
        if (i < currentText.length && typedText[i] === currentText[i]) {
          correctChars++;
        }
      }

      const accuracy = typedText.length > 0 ? Math.round((correctChars / typedText.length) * 100) : 100;
      accuracySpan.textContent = `${accuracy}%`;
      accuracySpan.style.color = accuracy === 100 ? 'var(--ok)' : 'var(--err)';

      const prefix = currentText.slice(0, typedText.length);
      const hasError = typedText !== prefix;

      typingInput.classList.toggle('has-error', hasError);
      errorText.textContent = hasError ? 'You have a mismatch. Correct it to continue.' : '';

      const isCorrect = typedText === currentText;
      submitBtn.disabled = !isCorrect;
      submitBtn.textContent = isCorrect ? 'Continue' : 'Submit';
    });

    submitBtn.addEventListener('click', function () {
      if (typingInput.value === currentText) {
        completedParagraphs++;
        if (completedParagraphs === 5) {
          completeChallenge(accessDurationMinutes, originalUrl);
        } else {
          currentParagraphIndex++;
          displayCurrentParagraph();
        }
      }
    });

    document.getElementById('reset-typing').addEventListener('click', function () {
      typingInput.value = '';
      typingInput.focus();
      charCount.textContent = '0';
      accuracySpan.textContent = '100%';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submit';
      typingInput.classList.remove('has-error');
      errorText.textContent = '';
    });

    document.getElementById('cancel-challenge').addEventListener('click', function () {
      reportAnalyticsEvent('challenge_failed');
      location.reload();
    });
  }

  displayCurrentParagraph();
}

function completeChallenge(duration, originalUrl) {
  const timeSpent = Math.floor((Date.now() - startTime) / 1000);
  const safeTargetUrl = getSafeTargetUrl(originalUrl);
  if (!safeTargetUrl) {
    alert('Invalid destination URL.');
    return;
  }

  if (isEarnAccessRuleActive() && timeSpent < getEarnAccessMinChallengeSeconds()) {
    reportAnalyticsEvent('challenge_failed');
    alert(`Earn-Access requires at least ${getEarnAccessMinChallengeSeconds()}s challenge time. Try again.`);
    location.reload();
    return;
  }

  const bonusMinutes = getEarnAccessBonus(timeSpent);
  const grantedDuration = duration + bonusMinutes;

  requestTemporaryAccess({
    targetUrl: safeTargetUrl,
    duration: grantedDuration,
    timeSpent,
    meta: {
      method: 'challenge',
      taskIntent: challengeMeta.taskIntent,
      customChallengeAnswered: challengeMeta.customChallengeAnswered,
      earnAccessEnabled: challengeMeta.earnAccessEnabled
    },
    successDetails: {
      bonusMinutes,
      timeSpent
    }
  });
}

function requestTemporaryAccess({ targetUrl, duration, timeSpent, meta, successDetails }) {
  const domain = new URL(targetUrl).hostname;

  chrome.runtime.sendMessage({
    action: 'grantTemporaryAccess',
    urlPattern: domain,
    duration: parseInt(duration, 10),
    timeSpent: timeSpent || 0,
    meta: meta || {}
  }, function (response) {
    if (response && response.success) {
      if (meta?.method === 'challenge') {
        reportAnalyticsEvent('challenge_completed');
      }
      renderSuccessState({
        targetUrl,
        duration,
        timeSpent: successDetails?.timeSpent || 0,
        bonusMinutes: successDetails?.bonusMinutes || 0,
        expiresAt: response.access?.expiresAt
      });
      return;
    }

    alert(response?.error || 'ResistGate could not grant access. Please try again.');
    location.reload();
  });
}

function renderSuccessState({ targetUrl, duration, timeSpent, bonusMinutes, expiresAt }) {
  const content = document.querySelector('.content');
  content.innerHTML = '';

  const successMessage = document.createElement('div');
  successMessage.className = 'success-message';

  const title = document.createElement('h2');
  title.textContent = 'Access Ready';
  successMessage.appendChild(title);

  const completedText = document.createElement('p');
  completedText.textContent = 'You earned access to this site.';
  successMessage.appendChild(completedText);

  const durationText = document.createElement('p');
  durationText.textContent = `Access is open for ${duration} minutes.`;
  successMessage.appendChild(durationText);

  if (bonusMinutes > 0) {
    const bonusText = document.createElement('p');
    bonusText.textContent = `Bonus time added: +${bonusMinutes} min.`;
    successMessage.appendChild(bonusText);
  }

  const accessTimerText = document.createElement('p');
  accessTimerText.className = 'access-timer';
  successMessage.appendChild(accessTimerText);

  const timeText = document.createElement('p');
  if (timeSpent > 0) {
    timeText.textContent = `Time invested: ${formatTime(timeSpent)}`;
  } else {
    timeText.textContent = 'Access granted via manual override.';
  }
  successMessage.appendChild(timeText);

  const promptText = document.createElement('p');
  promptText.textContent = 'Open the site when you are ready.';
  successMessage.appendChild(promptText);

  const continueLink = document.createElement('a');
  continueLink.className = 'btn btn-primary';
  continueLink.style.display = 'inline-block';
  continueLink.style.marginTop = '20px';
  continueLink.href = targetUrl;
  continueLink.textContent = 'Continue to Site';
  successMessage.appendChild(continueLink);

  content.appendChild(successMessage);

  const resolvedExpiry = expiresAt || (Date.now() + (parseInt(duration, 10) * 60 * 1000));
  startAccessCountdown(accessTimerText, resolvedExpiry);
}

function getEarnAccessBonus(timeSpentSeconds) {
  const isPro = currentSettings?.subscription?.tier === 'pro';
  const friction = currentSettings?.proFeatures?.behavioralFriction || {};
  if (!isPro || friction.enabled !== true || friction.earnAccessEnabled === false) {
    return 0;
  }

  if (timeSpentSeconds <= 240) {
    return 5;
  }

  if (timeSpentSeconds <= 360) {
    return 2;
  }

  return 0;
}

function isEarnAccessRuleActive() {
  const isPro = currentSettings?.subscription?.tier === 'pro';
  const friction = currentSettings?.proFeatures?.behavioralFriction || {};
  return isPro && friction.enabled === true && friction.earnAccessEnabled !== false;
}

function getEarnAccessMinChallengeSeconds() {
  const min = Number(currentSettings?.proFeatures?.behavioralFriction?.earnAccessMinChallengeSeconds);
  if (!Number.isFinite(min)) {
    return 90;
  }

  return Math.max(30, Math.min(900, Math.round(min)));
}

function getManualOverrideDelaySeconds() {
  const delay = Number(currentSettings?.freeExperience?.manualOverrideDelaySeconds);
  if (!Number.isFinite(delay)) {
    return 12;
  }

  return Math.max(10, Math.min(15, Math.round(delay)));
}

function isStrictFocusWindowActive() {
  if (!currentSettings || currentSettings.subscription?.tier !== 'pro') {
    return false;
  }

  if (currentSettings.proFeatures?.strictModeEnabled !== true) {
    return false;
  }

  const schedule = currentSettings.freeExperience?.schedule;
  if (!schedule || schedule.enabled !== true) {
    // No schedule configured means strict mode is always active (matches background.js:isStrictFocusActive).
    return true;
  }

  return isWithinSchedule(schedule, Date.now());
}

function isWithinSchedule(schedule, timestamp) {
  const days = Array.isArray(schedule.days) && schedule.days.length
    ? schedule.days.map(Number)
    : [1, 2, 3, 4, 5];

  const now = new Date(timestamp);
  if (!days.includes(now.getDay())) {
    return false;
  }

  const [startHours, startMinutes] = (schedule.startTime || '09:00').split(':').map(Number);
  const [endHours, endMinutes] = (schedule.endTime || '17:00').split(':').map(Number);

  const currentMinutes = (now.getHours() * 60) + now.getMinutes();
  const startTotal = (startHours * 60) + startMinutes;
  const endTotal = (endHours * 60) + endMinutes;

  if (startTotal === endTotal) {
    return true;
  }

  if (startTotal < endTotal) {
    return currentMinutes >= startTotal && currentMinutes < endTotal;
  }

  return currentMinutes >= startTotal || currentMinutes < endTotal;
}

function showPrecheckError(message) {
  document.getElementById('precheck-error').textContent = message || '';
}

function clearPrecheckError() {
  document.getElementById('precheck-error').textContent = '';
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function startAccessCountdown(targetElement, expiresAt) {
  if (!targetElement || !Number.isFinite(expiresAt)) {
    return;
  }

  if (accessCountdownInterval) {
    clearInterval(accessCountdownInterval);
  }

  function render() {
    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) {
      targetElement.textContent = 'Access ends in: 00:00';
      clearInterval(accessCountdownInterval);
      accessCountdownInterval = null;
      return;
    }

    const remainingSeconds = Math.ceil(remainingMs / 1000);
    targetElement.textContent = `Access ends in: ${formatTime(remainingSeconds)}`;
  }

  render();
  accessCountdownInterval = setInterval(render, 1000);
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

function reportAnalyticsEvent(type) {
  const safeTargetUrl = getSafeTargetUrl(currentOriginalUrl);
  const domain = safeTargetUrl ? new URL(safeTargetUrl).hostname : undefined;

  chrome.runtime.sendMessage({
    action: 'recordAnalyticsEvent',
    type,
    domain
  });
}

if (typeof globalThis !== 'undefined') {
  globalThis.__RESISTGATE_FRICTION_TEST_HOOKS__ = {
    collectPrecheckMeta,
    isEarnAccessRuleActive,
    getEarnAccessMinChallengeSeconds,
    getEarnAccessBonus,
    getSafeTargetUrl,
    formatTime,
    renderIntentionPage,
    startBreathingAnimation,
    __setCurrentSettingsForTest: (settings) => {
      currentSettings = settings;
    }
  };
}
