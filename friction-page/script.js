// Friction Page Script - Phased Progressive Disclosure
let startTime = null;
let accessDurationMinutes = 15;
let accessCountdownInterval = null;
let waitCountdownInterval = null;
let breathingAnimationInterval = null;
let breathingPhaseInterval = null;
let breathingPhaseTimeout = null;
let currentOriginalUrl = null;
let skipIntentionPage = false;
let skipBlockedVisitRecord = false;
let currentSettings = null;
let currentWorkTimer = null;
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

// Phase management
const PHASES = {
  INTENTION: 'intention',
  PRECHECK: 'precheck',
  CHALLENGE: 'challenge',
  SUCCESS: 'success'
};

let currentPhase = PHASES.INTENTION;

const DEFAULT_CHALLENGE_LEVEL = 'hard';
const INTENTION_PRECHECK_KEY = 'resistgateIntentionPrecheck';
const CHALLENGE_LEVEL_COPY = {
  easy: {
    badge: 'Easy drill',
    precheck: 'Easy drill: type a short random code with full accuracy.',
    instruction: 'Type the code exactly as shown to continue.',
    unitLabel: 'Code'
  },
  moderate: {
    badge: 'Moderate drill',
    precheck: 'Moderate drill: type 1-2 focus sentences with full accuracy.',
    instruction: 'Type the sentences exactly as shown to continue.',
    unitLabel: 'Prompt'
  },
  hard: {
    badge: 'Hard mode',
    precheck: 'Hard mode: complete 5 paragraphs with full accuracy.',
    instruction: 'Type the text exactly as shown to continue.',
    unitLabel: 'Paragraph'
  }
};

const MODERATE_CHALLENGE_SENTENCES = [
  'Pause before you open the site.',
  'Choose the next action with intention.',
  'Let this moment interrupt autopilot.',
  'Your attention deserves a clear reason.',
  'One deliberate choice can protect the next hour.',
  'Slow down enough to decide.',
  'The urge can wait while you choose.',
  'Make this visit intentional, not automatic.',
  'A short pause is still real discipline.',
  'Return to the task that matters most.',
  'Notice the impulse before you follow it.',
  'You can choose access without choosing distraction.',
  'Let the friction do its job.',
  'Focus begins with one honest decision.',
  'Earn the visit before you enter.',
  'Your time deserves a boundary.',
  'Decide whether this page serves your goal.',
  'A mindful click beats a reflexive one.',
  'Choose the break instead of falling into it.',
  'Protect the promise you made to yourself.'
];

const PRODUCTIVITY_TEXTS = [
  'Every minute wasted on distractions is a minute stolen from your potential. Protect your time like it is your most valuable asset.',
  'Focus is a muscle. The more you practice resisting trivial distractions, the stronger it becomes.',
  'Discipline is choosing what you want most over what you want now.',
  'Your attention is valuable currency. Spend it deliberately.',
  'Progress requires focus. Each time you redirect attention, you grow stronger.',
  'Time is irreversible. Choose actions that build momentum toward meaningful outcomes.',
  'Purpose-driven effort beats busywork. Ask if this action aligns with your goals.',
  'Self-mastery is built one decision at a time.',
  'Small actions, consistently taken, shape identity and outcomes.',
  'Distraction is the enemy of progress. Confront it with deliberate resistance.',
  'The urge to check one more tab will pass. Your work will still matter when the urge is gone.',
  'Momentum is fragile at the beginning. Guard the next ten minutes and let the rest follow.',
  'You do not need perfect motivation to act. You only need the next honest action.',
  'Attention becomes identity through repetition. Choose what kind of person this minute is training.',
  'A small pause can rescue an entire afternoon. Let this challenge create that pause.',
  'The easy click is rarely the useful click. Slow down enough to choose on purpose.',
  'Your future self benefits from the boundary you keep right now.',
  'Focus is not a mood. It is a series of tiny returns to what matters.',
  'Avoiding discomfort teaches distraction to ask louder next time. Meeting discomfort teaches it to quiet down.',
  'You are allowed to want rest. You are also allowed to protect work from reflexive escape.',
  'The page you wanted can wait. The promise you made to yourself deserves the first word.',
  'A blocked site is not the enemy. Automatic behavior is the thing you are training out of.',
  'Good systems make better choices easier. This pause is part of the system.',
  'When the mind reaches for novelty, give it a clear reason to return.',
  'One focused interval is enough to restart trust with yourself.',
  'You can make this decision slowly. The extra few seconds are the point.',
  'The work does not need to feel exciting to be worth finishing.',
  'Every resisted impulse becomes evidence that you can steer your attention.',
  'The strongest version of you is built through ordinary moments like this.',
  'Let the friction remind you that access is a choice, not a reflex.',
  'If the visit is worth it, you can earn it with attention. If not, you just saved yourself time.',
  'Clarity often returns after the first sentence, the first file, or the first small task.',
  'Your attention deserves a destination before it deserves a distraction.',
  'Impulse says now. Discipline asks whether now is aligned with what you planned.',
  'The cost of distraction is not only time. It is the effort required to restart.',
  'A clean boundary today makes tomorrow easier to begin.',
  'You do not have to win the whole day. Win this decision.',
  'The best focus tools do not shame you. They help you notice the moment before autopilot takes over.',
  'Typing this is a deliberate signal. You are choosing awareness before access.',
  'Your goals need more than intention. They need protected attention.',
  'A short delay can reveal whether the urge was real or merely habitual.',
  'The work waiting for you is allowed to be more important than a quick scroll.',
  'Practice returning. That is the whole skill.',
  'The first resistance is usually the hardest. After that, momentum starts helping.',
  'You are not blocking fun. You are putting choice back between impulse and action.',
  'A focused mind is not empty. It is committed to one thing at a time.',
  'The longer you protect attention, the easier deep work becomes to enter.',
  'This moment is a fork. Choose the path you meant to choose before the urge arrived.',
  'A distraction promises relief, but completed work creates real calm.',
  'Your schedule is a commitment to your own priorities. Honor it with one focused return.',
  'You can still take breaks. Make them chosen breaks, not accidental ones.',
  'The challenge is not punishment. It is a small test of whether access is intentional.',
  'Every boundary feels inconvenient when it is working.',
  'You are building the ability to pause before obeying an impulse.',
  'Do the next useful thing before opening the next interesting thing.',
  'The most powerful setting is the one you keep when nobody is watching.',
  'Let this be a reset point. Breathe, decide, and move deliberately.',
  'Access feels better when it is earned instead of automatic.',
  'Protect the task that brought you here. Everything else can wait for a cleaner moment.',
  'The habit you practice now is the habit that will answer next time.'
];

document.addEventListener('DOMContentLoaded', function () {
  const urlParams = new URLSearchParams(window.location.search);
  currentOriginalUrl = urlParams.get('originalUrl');
  skipIntentionPage = urlParams.get('skipIntention') === '1';
  skipBlockedVisitRecord = urlParams.get('skipRecord') === '1';

  const safeTargetUrl = getSafeTargetUrl(currentOriginalUrl);
  const blockedSite = document.getElementById('blocked-site');

  if (safeTargetUrl) {
    const hostname = new URL(safeTargetUrl).hostname;
    blockedSite.textContent = hostname;
    if (!skipBlockedVisitRecord) {
      chrome.runtime.sendMessage({
        action: 'recordBlockedVisit',
        urlPattern: hostname
      }, function (response) {
        if (response && response.resistanceCount > 0) {
          const countEl = document.getElementById('resistance-count');
          if (countEl) {
            const n = response.resistanceCount;
            countEl.textContent = `You've resisted ${hostname} ${n} ${n === 1 ? 'time' : 'times'} today.`;
          }
        }
      });
    }
  } else {
    blockedSite.textContent = 'Unknown destination';
  }

  loadSettings();

  // Phase 1: Continue to Challenge
  document.getElementById('continue-to-challenge').addEventListener('click', function () {
    transitionToPhase(PHASES.PRECHECK);
  });

  document.getElementById('go-back-btn').addEventListener('click', function () {
    goBack();
  });

  // Phase 2: Start Challenge
  document.getElementById('start-unlock-challenge').addEventListener('click', function () {
    handleStartChallenge();
  });

  // Manual Override
  document.getElementById('manual-override-btn').addEventListener('click', function () {
    handleManualOverride();
  });
});

function setPhase(phase) {
  const container = document.getElementById('main-container');
  container.className = 'container';
  container.classList.add(`phase-${phase}`);
  currentPhase = phase;
}

function transitionToPhase(phase) {
  // Stop breathing animation when leaving intention phase
  if (currentPhase === PHASES.INTENTION && phase !== PHASES.INTENTION) {
    stopBreathingAnimation();
  }
  
  setPhase(phase);
  
  // Phase-specific initialization
  if (phase === PHASES.PRECHECK) {
    renderChallengeSummary();
    renderBundlePanel();
    renderProPrecheck();
    refreshManualOverrideStatus();
  }
}

function goBack() {
  if (window.history && window.history.length > 1) {
    window.history.back();
    return;
  }

  window.close();
}

function loadSettings() {
  chrome.runtime.sendMessage({ action: 'getSettings' }, function (response) {
    if (!(response && response.settings)) {
      return;
    }

    currentSettings = response.settings;

    accessDurationMinutes = currentSettings.defaultAccessDuration
      || currentSettings.challengeTypes?.typing?.duration
      || accessDurationMinutes;
    renderChallengeSummary();

    chrome.runtime.sendMessage({ action: 'getWorkTimerState' }, function (wtResponse) {
      currentWorkTimer = (wtResponse && wtResponse.success) ? wtResponse.state : null;
      renderInitialPhase();
    });
  });
}

function renderInitialPhase() {
  if (!skipIntentionPage && isIntentionPageEnabled()) {
    setPhase(PHASES.INTENTION);
    renderIntentionPage();
    return;
  }

  transitionToPhase(PHASES.PRECHECK);
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

function renderBundlePanel() {
  const panel = document.getElementById('bundle-panel');
  const labelEl = document.getElementById('bundle-label');
  const bar = document.getElementById('bundle-progress-bar');
  const progressText = document.getElementById('bundle-progress-text');
  if (!panel || !labelEl || !bar || !progressText) return;

  const safeTargetUrl = getSafeTargetUrl(currentOriginalUrl);
  if (!safeTargetUrl || !currentSettings) {
    panel.classList.add('hidden');
    return;
  }

  const hostname = new URL(safeTargetUrl).hostname.replace(/^www\./, '');
  const entry = (currentSettings.blocklist || []).find((e) => {
    const p = (e.urlPattern || '').toLowerCase();
    return hostname.endsWith(p) || p.endsWith(hostname);
  });

  const bundle = entry?.temptationBundle;
  if (!bundle || bundle.enabled !== true) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');

  if (bundle.conditionType === 'time_of_day') {
    const [h, m] = (bundle.afterTime || '17:00').split(':').map(Number);
    const label12 = formatTime12(h, m);
    labelEl.textContent = `You can visit this site after ${label12} today.`;
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const targetMins = h * 60 + m;
    const progress = Math.min(100, Math.round((currentMins / targetMins) * 100));
    bar.style.width = `${progress}%`;
    const minsLeft = Math.max(0, targetMins - currentMins);
    progressText.textContent = minsLeft > 0
      ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m until unlocked`
      : 'Condition met — start the challenge to access the site.';
    return;
  }

  if (bundle.conditionType === 'work_timer') {
    const required = bundle.requiredMinutes || 60;
    const done = currentWorkTimer ? Math.floor(currentWorkTimer.effectiveMinutes) : 0;
    const left = Math.max(0, required - done);
    const progress = Math.min(100, Math.round((done / required) * 100));
    labelEl.textContent = `You can visit this site after ${required} min of focused work today.`;
    bar.style.width = `${progress}%`;
    progressText.textContent = done >= required
      ? 'Condition met — start the challenge to access the site.'
      : `${done} / ${required} min logged — ${left} min to go.`;
  }
}

function formatTime12(h, m) {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

function renderIntentionPage() {
  // If intention page is disabled, go directly to precheck
  if (!isIntentionPageEnabled()) {
    transitionToPhase(PHASES.PRECHECK);
    const intentionLabel = document.getElementById('intention-label');
    const personalGoalDisplay = document.getElementById('personal-goal-display');
    const breathingExercise = document.getElementById('breathing-exercise');
    intentionLabel.textContent = 'Pause before proceeding';
    personalGoalDisplay.textContent = 'You blocked this for a reason.';
    breathingExercise.classList.add('hidden');
    return;
  }

  const intentionPage = currentSettings?.proFeatures?.intentionPage || {};
  const personalGoalDisplay = document.getElementById('personal-goal-display');
  const breathingExercise = document.getElementById('breathing-exercise');
  const intentionLabel = document.getElementById('intention-label');

  let perDomainGoal = '';

  if (isIntentionPageEnabled()) {
    const safeTargetUrl = getSafeTargetUrl(currentOriginalUrl);
    if (safeTargetUrl) {
      const hostname = new URL(safeTargetUrl).hostname.replace(/^www\./, '');
      const entry = (currentSettings.blocklist || []).find((e) => {
        const p = (e.urlPattern || '').toLowerCase();
        return hostname.endsWith(p) || p.endsWith(hostname);
      });
      if (entry?.personalGoal && entry.personalGoal.trim()) {
        perDomainGoal = entry.personalGoal.trim();
      }
    }
  }


  if (perDomainGoal) {
    intentionLabel.textContent = 'See your reminder';
    personalGoalDisplay.textContent = perDomainGoal;
  } else {
    intentionLabel.textContent = 'Pause before proceeding';
    personalGoalDisplay.textContent = 'You blocked this for a reason.';
  }

  if (intentionPage.showBreathingExercise) {
    breathingExercise.classList.remove('hidden');
    startBreathingAnimation();
  } else {
    breathingExercise.classList.add('hidden');
  }
}

function canUseIntentionPage() {
  return true;
}

function isIntentionPageEnabled(settings = currentSettings) {
  return canUseIntentionPage() && settings?.proFeatures?.intentionPage?.enabled === true;
}

const BREATHING_PHASES = [
  { name: 'Inhale', seconds: 4, pulseScale: 1.3, pulseOpacity: 0.8, coreScale: 1.1, easing: 'ease-out' },
  { name: 'Hold', seconds: 7, pulseScale: 1.3, pulseOpacity: 0.8, coreScale: 1.1, easing: 'linear' },
  { name: 'Exhale', seconds: 8, pulseScale: 1, pulseOpacity: 0.5, coreScale: 1, easing: 'ease-in' }
];

function startBreathingAnimation() {
  const pulse = document.querySelector('.breathing-ring-pulse');
  const core = document.querySelector('.breathing-ring-core');
  const countEl = document.getElementById('breathing-count');
  const phaseLabelEl = document.getElementById('breathing-phase-label');
  if (!pulse || !core || !countEl) return;

  stopBreathingAnimation();

  let phaseIndex = 0;

  function applyPhase(phase) {
    const duration = phase.seconds;
    pulse.style.transitionDuration = duration + 's';
    pulse.style.transitionTimingFunction = phase.easing;
    core.style.transitionDuration = duration + 's';
    core.style.transitionTimingFunction = phase.easing;

    pulse.style.transform = 'scale(' + phase.pulseScale + ')';
    pulse.style.opacity = String(phase.pulseOpacity);
    core.style.transform = 'scale(' + phase.coreScale + ')';
  }

  function runPhase() {
    const phase = BREATHING_PHASES[phaseIndex % BREATHING_PHASES.length];
    let remaining = phase.seconds;

    countEl.textContent = remaining;

    if (phaseLabelEl) {
      phaseLabelEl.classList.add('fading');
      requestAnimationFrame(function () {
        phaseLabelEl.textContent = phase.name;
        requestAnimationFrame(function () {
          phaseLabelEl.classList.remove('fading');
        });
      });
    }

    applyPhase(phase);

    if (breathingPhaseInterval) {
      clearInterval(breathingPhaseInterval);
    }

    breathingPhaseInterval = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(breathingPhaseInterval);
        breathingPhaseInterval = null;
        phaseIndex += 1;
        breathingPhaseTimeout = setTimeout(runPhase, 80);
        return;
      }
      countEl.textContent = remaining;
      countEl.classList.remove('tick');
      void countEl.offsetWidth;
      countEl.classList.add('tick');
    }, 1000);
  }

  pulse.style.transform = 'scale(1)';
  pulse.style.opacity = '0.5';
  core.style.transform = 'scale(1)';
  void pulse.offsetWidth;

  runPhase();
}

function stopBreathingAnimation() {
  const pulse = document.querySelector('.breathing-ring-pulse');
  const core = document.querySelector('.breathing-ring-core');
  const countEl = document.getElementById('breathing-count');
  const phaseLabelEl = document.getElementById('breathing-phase-label');

  if (breathingPhaseInterval) {
    clearInterval(breathingPhaseInterval);
    breathingPhaseInterval = null;
  }
  if (breathingPhaseTimeout) {
    clearTimeout(breathingPhaseTimeout);
    breathingPhaseTimeout = null;
  }

  if (pulse) {
    pulse.style.transitionDuration = '0s';
    pulse.style.transform = 'scale(1)';
    pulse.style.opacity = '0.5';
  }
  if (core) {
    core.style.transitionDuration = '0s';
    core.style.transform = 'scale(1)';
  }
  if (countEl) {
    countEl.textContent = '4';
  }
  if (phaseLabelEl) {
    phaseLabelEl.textContent = '';
  }
}

function renderProPrecheck() {
  const proPrecheck = document.getElementById('pro-precheck');
  const taskSection = document.getElementById('precheck-task-section');
  const challengeSection = document.getElementById('precheck-challenge-section');
  const waitSection = document.getElementById('precheck-wait-section');
  
  if (!currentSettings) {
    proPrecheck.classList.add('hidden');
    return;
  }

  const isPro = currentSettings.subscription?.tier === 'pro';
  const friction = currentSettings.proFeatures?.behavioralFriction || {};
  const intentionPrecheck = getIntentionPrecheck();

  if (!isPro || friction.enabled !== true) {
    proPrecheck.classList.add('hidden');
    return;
  }

  let hasAnySection = false;

  // Task intent section
  if (friction.requireTaskIntent !== false && !intentionPrecheck?.taskIntent) {
    taskSection.classList.remove('hidden');
    hasAnySection = true;
  } else {
    taskSection.classList.add('hidden');
  }

  // Custom challenge section
  if (friction.customChallengePrompt) {
    document.getElementById('custom-challenge-prompt').textContent = friction.customChallengePrompt;
    challengeSection.classList.remove('hidden');
    hasAnySection = true;
  } else {
    challengeSection.classList.add('hidden');
  }

  // Timed wait section
  if (friction.timedWaitEnabled === true) {
    waitSection.classList.remove('hidden');
    hasAnySection = true;
  } else {
    waitSection.classList.add('hidden');
  }

  if (hasAnySection) {
    proPrecheck.classList.remove('hidden');
  } else {
    proPrecheck.classList.add('hidden');
  }
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

  const isDisabled = strictActive || locked || earnAccessActive;
  manualOverrideButton.disabled = isDisabled;

  if (strictActive) {
    hint.textContent = 'Strict Mode is active. Manual override is disabled for this blocking window.';
    return;
  }

  if (earnAccessActive) {
    hint.textContent = `Complete at least ${getEarnAccessMinChallengeSeconds()}s of the challenge to unlock access.`;
    return;
  }

  if (locked) {
    hint.textContent = `Manual override locked. Try again in ${manualOverrideState.remainingSeconds}s.`;
    return;
  }

  hint.textContent = `Manual override requires a ${delaySeconds}-second wait.`;
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

  // Apply a default 3 second countdown for better UX
  if (waitSeconds <= 0) {
    waitSeconds = 3;
  }

  if (waitSeconds > 0) {
    startTimedWait(waitSeconds, function () {
      startTypingChallenge(currentOriginalUrl);
    });
    return;
  }

  startTypingChallenge(currentOriginalUrl);
}

function startTimedWait(seconds, onComplete) {
  const challengeBtn = document.getElementById('start-unlock-challenge');
  const waitSection = document.getElementById('precheck-wait-section');
  const waitBar = document.getElementById('wait-progress-bar');
  const waitText = document.getElementById('wait-progress-text');
  
  // Show wait section
  if (waitSection) {
    waitSection.classList.remove('hidden');
    document.getElementById('pro-precheck').classList.remove('hidden');
  }
  
  challengeBtn.disabled = true;
  challengeBtn.textContent = `Starting in ${seconds}s...`;

  let remaining = seconds;
  
  if (waitBar) {
    waitBar.style.width = '0%';
    // Force reflow
    waitBar.offsetHeight;
    waitBar.style.transition = `width ${seconds}s linear`;
    waitBar.style.width = '100%';
  }
  
  if (waitText) {
    waitText.textContent = `Pausing for ${remaining} seconds...`;
  }

  if (waitCountdownInterval) {
    clearInterval(waitCountdownInterval);
  }

  waitCountdownInterval = setInterval(function () {
    remaining -= 1;

    if (remaining <= 0) {
      clearInterval(waitCountdownInterval);
      waitCountdownInterval = null;

      challengeBtn.disabled = false;
      challengeBtn.textContent = 'Start Challenge';
      onComplete();
      return;
    }

    challengeBtn.textContent = `Starting in ${remaining}s...`;
    if (waitText) {
      waitText.textContent = `Pausing for ${remaining} seconds...`;
    }
  }, 1000);
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
    manualBtn.textContent = `Wait ${remaining}s`;

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

      manualBtn.textContent = `Wait ${remaining}s`;
    }, 1000);
  });
}

function collectPrecheckMeta() {
  const isPro = currentSettings?.subscription?.tier === 'pro';
  const friction = currentSettings?.proFeatures?.behavioralFriction || {};
  const intentionPrecheck = getIntentionPrecheck();

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
  const taskIntent = taskIntentInput
    ? taskIntentInput.value.trim()
    : (intentionPrecheck?.taskIntent || '');

  if (requireTaskIntent && taskIntent.length < 4) {
    return {
      valid: false,
      error: 'Describe what you\'re here to do.',
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
        error: 'Complete the check to continue.',
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

function getIntentionPrecheck() {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(INTENTION_PRECHECK_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const sameUrl = parsed.originalUrl === currentOriginalUrl;
    const fresh = Number(parsed.timestamp) > Date.now() - 10 * 60 * 1000;
    const taskIntent = typeof parsed.taskIntent === 'string'
      ? parsed.taskIntent.trim().slice(0, 180)
      : '';
    const reason = typeof parsed.reason === 'string'
      ? parsed.reason.trim().slice(0, 40)
      : '';

    if (!sameUrl || !fresh) {
      return null;
    }

    return { taskIntent, reason };
  } catch (err) {
    console.warn('Unable to read intention precheck:', err);
    return null;
  }
}

function startTypingChallenge(originalUrl) {
  startTime = Date.now();
  transitionToPhase(PHASES.CHALLENGE);
  showTypingChallenge(originalUrl);
}

function showTypingChallenge(originalUrl) {
  const container = document.getElementById('phase-challenge');
  container.innerHTML = '';

  const challengeLevel = getTypingChallengeLevel();
  const challengeCopy = getChallengeLevelCopy(challengeLevel);
  const selectedSegments = buildTypingChallengeSegments(challengeLevel);
  const totalSegments = selectedSegments.length;
  let currentSegmentIndex = 0;
  let completedSegments = 0;

  function displayCurrentParagraph() {
    const currentSegment = selectedSegments[currentSegmentIndex];
    const currentText = currentSegment.text;
    const stepBadge = totalSegments === 1
      ? challengeCopy.badge
      : `${challengeCopy.unitLabel} ${currentSegmentIndex + 1} of ${totalSegments}`;
    const quoteClass = challengeLevel === 'easy' ? 'quote-text challenge-code' : 'quote-text';

    container.innerHTML = `
      <div class="challenge-container">
        <header class="challenge-header">
          <span class="step-badge">${escapeHtml(stepBadge)}</span>
          <p class="instruction-text">${escapeHtml(challengeCopy.instruction)}</p>
        </header>
        <div class="segment-progress" aria-label="Challenge progress">
          <span class="segment-progress-bar" style="width: ${Math.round(((currentSegmentIndex + 1) / totalSegments) * 100)}%"></span>
        </div>
        
        <div class="quote-box">
          <p class="${quoteClass}">${escapeHtml(currentText)}</p>
        </div>
        
        <label class="typing-label" for="typing-input">Type exactly</label>
        <textarea id="typing-input" class="challenge-typing-input" placeholder="Start typing here..." spellcheck="false" aria-describedby="typing-error challenge-stats"></textarea>
        <p id="typing-error" class="typing-error" role="alert" aria-live="polite"></p>
        
        <div class="challenge-stats" id="challenge-stats" aria-live="polite">
          <div class="stat-item">
            <span class="stat-label">Progress</span>
            <span class="stat-value"><span id="char-count">0</span> / ${currentText.length}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Accuracy</span>
            <span id="accuracy" class="stat-value accurate">100%</span>
          </div>
        </div>
        
        <div class="challenge-actions">
          <button id="cancel-challenge" class="btn btn-secondary">Quit</button>
          <button id="submit-typing" class="btn btn-primary" disabled>Continue</button>
        </div>
      </div>
    `;

    const typingInput = document.getElementById('typing-input');
    const charCount = document.getElementById('char-count');
    const accuracySpan = document.getElementById('accuracy');
    const submitBtn = document.getElementById('submit-typing');
    const errorText = document.getElementById('typing-error');

    typingInput.focus();
    typingInput.addEventListener('contextmenu', (e) => e.preventDefault());
    typingInput.addEventListener('paste', (e) => {
      e.preventDefault();
      showPrecheckError('No shortcuts in ResistGate. Earn it.');
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
      accuracySpan.className = 'stat-value ' + (accuracy === 100 ? 'accurate' : 'error');

      const prefix = currentText.slice(0, typedText.length);
      const hasError = typedText !== prefix;

      typingInput.classList.toggle('has-error', hasError);
      errorText.textContent = hasError ? 'You have a mismatch. Correct it to continue.' : '';

      const isCorrect = typedText === currentText;
      submitBtn.disabled = !isCorrect;
      submitBtn.textContent = isCorrect ? 'Continue' : 'Continue';
    });

    submitBtn.addEventListener('click', function () {
      if (typingInput.value === currentText) {
        completedSegments++;
        if (completedSegments === totalSegments) {
          completeChallenge(accessDurationMinutes, originalUrl);
        } else {
          currentSegmentIndex++;
          displayCurrentParagraph();
        }
      }
    });

    document.getElementById('cancel-challenge').addEventListener('click', function () {
      reportAnalyticsEvent('challenge_failed');
      location.reload();
    });
  }

  displayCurrentParagraph();
}

function renderChallengeSummary() {
  const subtitle = document.getElementById('precheck-subtitle');
  if (!subtitle) {
    return;
  }

  subtitle.textContent = getChallengeLevelCopy(getTypingChallengeLevel()).precheck;
}

function sanitizeChallengeLevel(level) {
  if (level === 'easy' || level === 'moderate' || level === 'hard') {
    return level;
  }
  return DEFAULT_CHALLENGE_LEVEL;
}

function getTypingChallengeLevel(settings = currentSettings) {
  const typing = settings?.challengeTypes?.typing || {};
  if (typing.level === 'easy' || typing.level === 'moderate' || typing.level === 'hard') {
    return typing.level;
  }

  if (Number(typing.difficulty) === 1) {
    return 'easy';
  }
  if (Number(typing.difficulty) === 2) {
    return 'moderate';
  }
  return DEFAULT_CHALLENGE_LEVEL;
}

function getChallengeLevelCopy(level) {
  return CHALLENGE_LEVEL_COPY[sanitizeChallengeLevel(level)];
}

function buildTypingChallengeSegments(level = getTypingChallengeLevel()) {
  const selectedLevel = sanitizeChallengeLevel(level);
  if (selectedLevel === 'easy') {
    return [{ text: generateRandomCharacterSequence(12) }];
  }

  if (selectedLevel === 'moderate') {
    const sentenceCount = Math.random() < 0.5 ? 1 : 2;
    return [{ text: getRandomItems(MODERATE_CHALLENGE_SENTENCES).slice(0, sentenceCount).join(' ') }];
  }

  return getRandomItems(PRODUCTIVITY_TEXTS).slice(0, 5).map((text) => ({ text }));
}

function getRandomItems(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateRandomCharacterSequence(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let sequence = '';
  for (let i = 0; i < length; i++) {
    sequence += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return sequence;
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
    showPrecheckError(`Earn-Access requires at least ${getEarnAccessMinChallengeSeconds()}s challenge time. Try again.`);
    setTimeout(() => location.reload(), 2000);
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
  transitionToPhase(PHASES.SUCCESS);
  
  document.getElementById('success-duration').textContent = `Access is open for ${duration} minutes.`;
  
  const bonusEl = document.getElementById('success-bonus');
  if (bonusMinutes > 0) {
    bonusEl.textContent = `Bonus time added: +${bonusMinutes} min`;
    bonusEl.classList.remove('hidden');
  } else {
    bonusEl.classList.add('hidden');
  }
  
  const timeInvestedEl = document.getElementById('success-time-invested');
  if (timeSpent > 0) {
    timeInvestedEl.textContent = `Time invested: ${formatTime(timeSpent)}`;
  } else {
    timeInvestedEl.textContent = 'Access granted via manual override.';
  }
  
  const continueLink = document.getElementById('continue-to-site');
  continueLink.href = targetUrl;
  
  const timerEl = document.getElementById('access-timer');
  const resolvedExpiry = expiresAt || (Date.now() + (parseInt(duration, 10) * 60 * 1000));
  startAccessCountdown(timerEl, resolvedExpiry);
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

// Test hooks
if (typeof globalThis !== 'undefined') {
  globalThis.__RESISTGATE_FRICTION_TEST_HOOKS__ = {
    collectPrecheckMeta,
    isEarnAccessRuleActive,
    getEarnAccessMinChallengeSeconds,
    getEarnAccessBonus,
    getSafeTargetUrl,
    sanitizeChallengeLevel,
    getTypingChallengeLevel,
    getChallengeLevelCopy,
    buildTypingChallengeSegments,
    canUseIntentionPage,
    isIntentionPageEnabled,
    getIntentionPrecheck,
    goBack,
    getModerateChallengeSentenceBank: () => [...MODERATE_CHALLENGE_SENTENCES],
    getChallengePromptBank: () => [...PRODUCTIVITY_TEXTS],
    generateRandomCharacterSequence,
    formatTime,
    formatTime12,
    renderIntentionPage,
    renderInitialPhase,
    renderBundlePanel,
    startBreathingAnimation,
    stopBreathingAnimation,
    BREATHING_PHASES,
    transitionToPhase,
    PHASES,
    __setCurrentSettingsForTest: (settings) => {
      currentSettings = settings;
    },
    __setCurrentWorkTimerForTest: (wt) => {
      currentWorkTimer = wt;
    },
    __setOriginalUrlForTest: (url) => {
      currentOriginalUrl = url;
    },
    __setSkipIntentionForTest: (value) => {
      skipIntentionPage = value === true;
    }
  };
}
