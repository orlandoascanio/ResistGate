// Friction Page Script - Phased Progressive Disclosure
let startTime = null;
let accessDurationMinutes = 15;
let accessCountdownInterval = null;
let waitCountdownInterval = null;
let overrideCountdownInterval = null;
let unlockCountdownInterval = null;
let breathingAnimationInterval = null;
let breathingPhaseInterval = null;
let breathingPhaseTimeout = null;
let currentOriginalUrl = null;
let skipIntentionPage = false;
let skipBlockedVisitRecord = false;
let currentSettings = null;
let currentWorkTimer = null;
let selectedAccessMinutes = null;
let gateExitRecorded = false;
let grantedAccessDomain = null;
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
    precheck: (size) => `Easy drill: type a ${size}-character code with full accuracy.`,
    instruction: 'Type the code exactly as shown to continue.',
    unitLabel: 'Code'
  },
  moderate: {
    badge: 'Moderate drill',
    precheck: (size) => `Moderate drill: type ${size === 1 ? 'one focus sentence' : `${size} focus sentences`} with full accuracy.`,
    instruction: 'Type the sentences exactly as shown to continue.',
    unitLabel: 'Prompt'
  },
  hard: {
    badge: 'Hard mode',
    precheck: (size) => `Hard mode: complete ${size} paragraphs with full accuracy.`,
    instruction: 'Type the text exactly as shown to continue.',
    unitLabel: 'Paragraph'
  },
  custom: {
    badge: 'Your phrase',
    precheck: (size) => (size === 1
      ? 'Your phrase: type the line you wrote, with full accuracy.'
      : `Your phrase: type the line you wrote ${size} times, with full accuracy.`),
    instruction: 'Type your phrase exactly as you wrote it to continue.',
    unitLabel: 'Phrase'
  }
};

// Picking a shorter visit than the default earns a lighter challenge; a longer one costs
// more typing. Sizes are code characters (easy), sentences (moderate), paragraphs (hard),
// or repetitions of the custom phrase.
const ACCESS_DURATION_CHOICES = [5, 15, 30];
const CHALLENGE_SIZES = {
  easy: { light: 8, standard: 12, heavy: 16 },
  moderate: { light: 1, standard: 2, heavy: 3 },
  hard: { light: 3, standard: 5, heavy: 8 },
  custom: { light: 1, standard: 1, heavy: 2 }
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

  const blockedSite = document.getElementById('blocked-site');
  const hostname = getTargetHostname();

  if (hostname) {
    blockedSite.textContent = hostname;
    loadVisitStats(hostname);
  } else {
    blockedSite.textContent = 'Unknown destination';
  }

  loadSettings();

  // Phase 1: Continue to Challenge
  document.getElementById('continue-to-challenge').addEventListener('click', function () {
    transitionToPhase(PHASES.PRECHECK);
  });

  // Every step has a way out, and every way out counts as a resisted visit.
  ['go-back-btn', 'precheck-go-back-btn'].forEach(function (id) {
    document.getElementById(id).addEventListener('click', function () {
      leaveGate();
    });
  });

  ['remind-later-btn', 'precheck-remind-later-btn'].forEach(function (id) {
    document.getElementById(id).addEventListener('click', function () {
      handleRemindLater();
    });
  });

  // Phase 2: Start Challenge
  document.getElementById('start-unlock-challenge').addEventListener('click', function () {
    handleStartChallenge();
  });

  // Manual Override
  document.getElementById('manual-override-btn').addEventListener('click', function () {
    handleManualOverride();
  });

  // Phase 4: Success
  document.getElementById('never-mind-btn').addEventListener('click', function () {
    handleNeverMind();
  });

  document.getElementById('close-tab-btn').addEventListener('click', function () {
    closeCurrentTab();
  });

  document.addEventListener('keydown', handleGlobalKeydown);
});

function loadVisitStats(hostname) {
  if (skipBlockedVisitRecord) {
    // The Intention Page already counted this arrival; just read the count back.
    chrome.runtime.sendMessage({ action: 'getResistanceCount', domain: hostname }, function (response) {
      renderResistanceCount(hostname, response && response.success ? response.count : 0);
    });
  } else {
    chrome.runtime.sendMessage({
      action: 'recordBlockedVisit',
      urlPattern: hostname
    }, function (response) {
      renderResistanceCount(hostname, response ? response.resistanceCount : 0);
    });
  }

  chrome.runtime.sendMessage({ action: 'getGateOutcomeSummary' }, function (response) {
    renderGateStreak(response && response.success ? response.summary : null);
  });
}

function renderResistanceCount(hostname, count) {
  const n = Number(count) || 0;
  const text = n > 0
    ? `You've resisted ${hostname} ${n} ${n === 1 ? 'time' : 'times'} today.`
    : '';

  ['resistance-count', 'precheck-resistance-count'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text;
    }
  });
}

function getGateStreakText(summary) {
  const total = Number(summary?.total) || 0;
  const resisted = Number(summary?.resisted) || 0;
  if (total < 2 || resisted < 1) {
    return '';
  }

  return `You've gone back ${resisted} of the last ${total} times today.`;
}

function renderGateStreak(summary) {
  const text = getGateStreakText(summary);
  ['gate-streak', 'precheck-gate-streak'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text;
    }
  });
}

function getTargetHostname({ stripWww = false } = {}) {
  const safeTargetUrl = getSafeTargetUrl(currentOriginalUrl);
  if (!safeTargetUrl) {
    return '';
  }

  const hostname = new URL(safeTargetUrl).hostname.toLowerCase();
  return stripWww ? hostname.replace(/^www\./, '') : hostname;
}

function normalizeBlocklistPattern(pattern) {
  return String(pattern || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^\*\./, '')
    .replace(/^www\./, '')
    .replace(/^\.+|\.+$/g, '');
}

// A pattern matches its own host and its subdomains, never a lookalike: "x.com" covers
// "www.x.com" and "m.x.com" but not "box.com". The most specific pattern wins.
function findBlocklistEntry(hostname, blocklist = currentSettings?.blocklist) {
  const host = normalizeBlocklistPattern(hostname);
  if (!host || !Array.isArray(blocklist)) {
    return null;
  }

  let best = null;
  let bestLength = 0;
  for (const entry of blocklist) {
    const pattern = normalizeBlocklistPattern(entry?.urlPattern);
    if (!pattern) {
      continue;
    }

    if ((host === pattern || host.endsWith(`.${pattern}`)) && pattern.length > bestLength) {
      best = entry;
      bestLength = pattern.length;
    }
  }

  return best;
}

function announce(message) {
  const status = document.getElementById('status-announcement');
  if (status) {
    status.textContent = message || '';
  }
}

function handleGlobalKeydown(event) {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  if (event.key === 'Escape') {
    // On the success screen access is already granted; leaving there is "never mind",
    // which should be a deliberate click.
    if (currentPhase === PHASES.SUCCESS) {
      return;
    }

    event.preventDefault();
    if (currentPhase === PHASES.CHALLENGE) {
      reportAnalyticsEvent('challenge_failed');
    }
    leaveGate();
    return;
  }

  if (event.key !== 'Enter' || event.shiftKey || currentPhase === PHASES.CHALLENGE) {
    return;
  }

  const tagName = String(event.target?.tagName || '').toLowerCase();
  if (tagName === 'button' || tagName === 'a') {
    return;
  }

  const primaryIds = {
    [PHASES.INTENTION]: 'continue-to-challenge',
    [PHASES.PRECHECK]: 'start-unlock-challenge',
    [PHASES.SUCCESS]: 'continue-to-site'
  };
  const primary = document.getElementById(primaryIds[currentPhase]);
  if (!primary || primary.disabled || primary.classList?.contains('hidden')) {
    return;
  }

  event.preventDefault();
  primary.click();
}

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
    renderDurationPicker();
    renderChallengeSummary();
    renderBundlePanel();
    renderProPrecheck();
    refreshManualOverrideStatus();
  }
}

function goBack() {
  // Arriving from the Intention Page adds one history entry; stepping back once would
  // land on that pause screen again instead of where the user came from.
  const steps = skipIntentionPage ? 2 : 1;
  if (window.history && window.history.length > steps) {
    window.history.go(-steps);
    return;
  }

  closeCurrentTab();
}

function closeCurrentTab() {
  if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.getCurrent === 'function') {
    chrome.tabs.getCurrent(function (tab) {
      if (tab && tab.id !== undefined) {
        chrome.tabs.remove(tab.id);
        return;
      }
      window.close();
    });
    return;
  }

  window.close();
}

// Records the exit as a resisted visit, then leaves. Recording is best-effort: the page
// never waits more than a moment for it.
function leaveGate({ reversesAccess = false } = {}) {
  stopAllCountdowns();
  recordResistedOutcome({ reversesAccess }, goBack);
}

function recordResistedOutcome({ reversesAccess = false } = {}, onDone = function () {}) {
  const domain = getTargetHostname();
  if (gateExitRecorded || !domain) {
    onDone();
    return;
  }

  gateExitRecorded = true;
  let finished = false;
  const finish = function () {
    if (!finished) {
      finished = true;
      onDone();
    }
  };

  setTimeout(finish, 400);
  chrome.runtime.sendMessage({ action: 'recordGateOutcome', domain, reversesAccess }, finish);
}

function setRemindButtonsDisabled(disabled) {
  ['remind-later-btn', 'precheck-remind-later-btn'].forEach(function (id) {
    const button = document.getElementById(id);
    if (button) {
      button.disabled = disabled;
    }
  });
}

function handleRemindLater() {
  const safeTargetUrl = getSafeTargetUrl(currentOriginalUrl);
  if (!safeTargetUrl) {
    showPageError('This destination cannot be reopened later.');
    return;
  }

  setRemindButtonsDisabled(true);
  chrome.runtime.sendMessage({ action: 'scheduleGateReminder', originalUrl: safeTargetUrl }, function (response) {
    if (!(response && response.success)) {
      setRemindButtonsDisabled(false);
      showPageError(response?.error || 'ResistGate could not set a reminder. Try again.');
      return;
    }

    // The background already recorded this as a resisted visit.
    gateExitRecorded = true;
    stopAllCountdowns();
    announce('Reminder set. This site will reopen in 10 minutes.');
    goBack();
  });
}

function handleNeverMind() {
  const domain = grantedAccessDomain || getTargetHostname();
  const button = document.getElementById('never-mind-btn');
  if (button) {
    button.disabled = true;
  }

  chrome.runtime.sendMessage({ action: 'revokeTemporaryAccess', domain }, function (response) {
    const alreadyEnded = /no longer active/i.test(response?.error || '');
    if (!(response && response.success) && !alreadyEnded) {
      if (button) {
        button.disabled = false;
      }
      showPageError(response?.error || 'ResistGate could not close access. Try again.');
      return;
    }

    leaveGate({ reversesAccess: true });
  });
}

function stopAllCountdowns() {
  [waitCountdownInterval, overrideCountdownInterval, unlockCountdownInterval, accessCountdownInterval]
    .forEach(function (interval) {
      if (interval) {
        clearInterval(interval);
      }
    });
  waitCountdownInterval = null;
  overrideCountdownInterval = null;
  unlockCountdownInterval = null;
  accessCountdownInterval = null;
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
  const barWrap = document.getElementById('bundle-progress-wrap');
  const bar = document.getElementById('bundle-progress-bar');
  const progressText = document.getElementById('bundle-progress-text');
  if (!panel || !labelEl || !bar || !progressText) return;

  const entry = currentSettings ? findBlocklistEntry(getTargetHostname()) : null;
  const copy = getBundlePanelCopy(entry?.temptationBundle, currentWorkTimer, new Date());
  if (!copy) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  labelEl.textContent = copy.label;
  progressText.textContent = copy.progressText;

  // A time-of-day condition has no meaningful start, so a bar would only measure how far
  // we are from midnight. Only work-timer progress gets one.
  if (copy.progressPercent === null) {
    if (barWrap) barWrap.classList.add('hidden');
    bar.style.width = '0%';
  } else {
    if (barWrap) barWrap.classList.remove('hidden');
    bar.style.width = `${copy.progressPercent}%`;
  }
}

// The access condition makes the site free once it is met; before that, the challenge
// is still available. The copy says both, so it never reads as "you can't come in yet".
function getBundlePanelCopy(bundle, workTimer, now) {
  if (!bundle || bundle.enabled !== true) {
    return null;
  }

  const metText = 'Condition met — this site is unlocked. Reload it to continue.';

  if (bundle.conditionType === 'time_of_day') {
    const [h, m] = (bundle.afterTime || '17:00').split(':').map(Number);
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const minsLeft = Math.max(0, (h * 60 + m) - currentMins);
    return {
      label: `Free access after ${formatTime12(h, m)} — or earn it now.`,
      progressText: minsLeft > 0
        ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m until free access.`
        : metText,
      progressPercent: null
    };
  }

  if (bundle.conditionType === 'work_timer') {
    const required = bundle.requiredMinutes || 60;
    const done = workTimer ? Math.floor(workTimer.effectiveMinutes) || 0 : 0;
    const left = Math.max(0, required - done);
    return {
      label: `Free access after ${required} min of focused work — or earn it now.`,
      progressText: done >= required
        ? metText
        : `${done} / ${required} min logged — ${left} min to go.`,
      progressPercent: Math.min(100, Math.round((done / required) * 100))
    };
  }

  return null;
}

function formatTime12(h, m) {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

function renderIntentionPage() {
  const intentionPage = currentSettings?.proFeatures?.intentionPage || {};
  const personalGoalDisplay = document.getElementById('personal-goal-display');
  const breathingExercise = document.getElementById('breathing-exercise');
  const intentionLabel = document.getElementById('intention-label');

  const entry = findBlocklistEntry(getTargetHostname());
  const perDomainGoal = typeof entry?.personalGoal === 'string' ? entry.personalGoal.trim() : '';

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

  const friction = currentSettings.proFeatures?.behavioralFriction || {};
  const intentionPrecheck = getIntentionPrecheck();

  if (friction.enabled !== true) {
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

  if (overrideCountdownInterval) {
    // A running countdown owns the button: it stays clickable so it can be cancelled.
    return;
  }

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

  // Even without a timed wait, a short 3-second beat separates "decide" from "type".
  const waitSeconds = precheck.timedWaitSeconds > 0 ? precheck.timedWaitSeconds : 3;
  startTimedWait(waitSeconds, function () {
    startTypingChallenge(currentOriginalUrl);
  });
}

function getAccessDurationOptions(defaultMinutes = accessDurationMinutes) {
  const parsed = Math.round(Number(defaultMinutes));
  const base = Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
  return [...new Set([...ACCESS_DURATION_CHOICES, base])].sort((a, b) => a - b);
}

function getSelectedAccessMinutes() {
  return selectedAccessMinutes || accessDurationMinutes;
}

function getChallengeWeight(minutes = getSelectedAccessMinutes(), defaultMinutes = accessDurationMinutes) {
  if (minutes < defaultMinutes) {
    return 'light';
  }
  if (minutes > defaultMinutes) {
    return 'heavy';
  }
  return 'standard';
}

function getChallengeSize(level, weight = 'standard') {
  const sizes = CHALLENGE_SIZES[level] || CHALLENGE_SIZES[DEFAULT_CHALLENGE_LEVEL];
  return sizes[weight] || sizes.standard;
}

function getDurationHint(level = getEffectiveChallengeLevel(), weight = getChallengeWeight()) {
  const size = getChallengeSize(level, weight);
  const standardSize = getChallengeSize(level, 'standard');
  if (size < standardSize) {
    return 'Shorter visit, lighter challenge.';
  }
  if (size > standardSize) {
    return 'Longer visit, longer challenge.';
  }
  return weight === 'standard' ? 'Your usual access window.' : '';
}

function renderDurationPicker() {
  const picker = document.getElementById('duration-picker');
  const optionsEl = document.getElementById('duration-options');
  if (!picker || !optionsEl || typeof document.createElement !== 'function') {
    return;
  }

  optionsEl.textContent = '';
  getAccessDurationOptions().forEach(function (minutes) {
    const id = `access-duration-${minutes}`;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'access-duration';
    input.id = id;
    input.value = String(minutes);
    input.className = 'duration-input';
    input.checked = minutes === getSelectedAccessMinutes();
    input.addEventListener('change', function () {
      selectedAccessMinutes = minutes;
      renderChallengeSummary();
      renderDurationHint();
    });

    const label = document.createElement('label');
    label.htmlFor = id;
    label.className = 'duration-option';
    label.textContent = `${minutes} min`;

    optionsEl.appendChild(input);
    optionsEl.appendChild(label);
  });

  picker.classList.remove('hidden');
  renderDurationHint();
}

function renderDurationHint() {
  const hint = document.getElementById('duration-hint');
  if (hint) {
    hint.textContent = getDurationHint();
  }
}

function setDurationPickerDisabled(disabled) {
  const picker = document.getElementById('duration-picker');
  if (picker) {
    picker.disabled = disabled;
  }
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
  setDurationPickerDisabled(true);
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
      setDurationPickerDisabled(false);
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
  if (overrideCountdownInterval) {
    cancelManualOverride();
    return;
  }

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
      showPrecheckError('This destination is not a valid web address.');
      return;
    }

    const delaySeconds = manualOverrideState.requiredDelaySeconds || getManualOverrideDelaySeconds();
    const manualBtn = document.getElementById('manual-override-btn');
    const challengeBtn = document.getElementById('start-unlock-challenge');

    // The button stays enabled as a way out of the countdown.
    manualBtn.disabled = false;
    challengeBtn.disabled = true;
    setDurationPickerDisabled(true);

    let remaining = delaySeconds;
    manualBtn.textContent = `Cancel (${remaining}s)`;
    announce(`Manual override opens access in ${remaining} seconds. Press the button again to cancel.`);

    overrideCountdownInterval = setInterval(function () {
      remaining -= 1;

      if (remaining <= 0) {
        clearInterval(overrideCountdownInterval);
        overrideCountdownInterval = null;

        manualBtn.textContent = 'Manual Override';
        manualBtn.disabled = true;

        requestTemporaryAccess({
          targetUrl: safeTargetUrl,
          // An override skips the challenge, so it cannot buy a longer window than the default.
          duration: Math.min(getSelectedAccessMinutes(), accessDurationMinutes),
          timeSpent: 0,
          meta: {
            method: 'manualOverride',
            waitedSeconds: delaySeconds,
            taskIntent: '',
            customChallengeAnswered: false,
            earnAccessEnabled: false
          },
          onFailure: function () {
            challengeBtn.disabled = false;
            setDurationPickerDisabled(false);
            renderManualOverrideState();
          }
        });
        return;
      }

      manualBtn.textContent = `Cancel (${remaining}s)`;
    }, 1000);
  });
}

function cancelManualOverride() {
  if (overrideCountdownInterval) {
    clearInterval(overrideCountdownInterval);
    overrideCountdownInterval = null;
  }

  const manualBtn = document.getElementById('manual-override-btn');
  const challengeBtn = document.getElementById('start-unlock-challenge');
  if (manualBtn) {
    manualBtn.textContent = 'Manual Override';
  }
  if (challengeBtn) {
    challengeBtn.disabled = false;
  }
  setDurationPickerDisabled(false);
  renderManualOverrideState();
  announce('Manual override cancelled.');
}

function collectPrecheckMeta() {
  const friction = currentSettings?.proFeatures?.behavioralFriction || {};
  const intentionPrecheck = getIntentionPrecheck();

  if (friction.enabled !== true) {
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

const BLOCKED_INPUT_TYPES = new Set(['insertFromPaste', 'insertFromDrop', 'insertFromYank', 'insertReplacementText']);
const SHORTCUT_MESSAGE = 'No shortcuts in ResistGate. Earn it.';

function showTypingChallenge(originalUrl) {
  const container = document.getElementById('phase-challenge');
  container.innerHTML = '';
  clearUnlockCountdown();

  const challengeLevel = getEffectiveChallengeLevel();
  const challengeCopy = getChallengeLevelCopy(challengeLevel);
  const selectedSegments = buildTypingChallengeSegments(challengeLevel, getChallengeWeight());
  const totalSegments = selectedSegments.length;
  const contextLine = getChallengeContextLine();
  let currentSegmentIndex = 0;

  function displayCurrentParagraph() {
    clearUnlockCountdown();

    const currentText = selectedSegments[currentSegmentIndex].text;
    const isLastSegment = currentSegmentIndex === totalSegments - 1;
    const stepBadge = totalSegments === 1
      ? challengeCopy.badge
      : `${challengeCopy.unitLabel} ${currentSegmentIndex + 1} of ${totalSegments}`;
    const quoteClass = challengeLevel === 'easy' ? 'quote-text challenge-code' : 'quote-text';

    container.innerHTML = `
      <div class="challenge-container">
        <header class="challenge-header">
          <span class="step-badge">${escapeHtml(stepBadge)}</span>
          <p class="instruction-text">${escapeHtml(challengeCopy.instruction)}</p>
          ${contextLine ? `<p class="challenge-context">${escapeHtml(contextLine)}</p>` : ''}
        </header>
        ${totalSegments > 1 ? `
        <div class="segment-progress" role="progressbar" aria-label="Challenge progress" aria-valuemin="0" aria-valuemax="${totalSegments}" aria-valuenow="${currentSegmentIndex}">
          <span class="segment-progress-bar" style="width: ${Math.round((currentSegmentIndex / totalSegments) * 100)}%"></span>
        </div>` : ''}

        <div class="quote-box">
          <p id="challenge-quote" class="${quoteClass}">${escapeHtml(currentText)}</p>
        </div>

        <label class="typing-label" for="typing-input">Type exactly</label>
        <textarea id="typing-input" class="challenge-typing-input" placeholder="Start typing here..." spellcheck="false" autocomplete="off" aria-describedby="typing-error challenge-stats"></textarea>
        <p id="typing-error" class="typing-error" role="alert"></p>

        <div class="challenge-stats" id="challenge-stats">
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
          <button id="cancel-challenge" class="btn btn-secondary" type="button">Quit</button>
          <button id="submit-typing" class="btn btn-primary" type="button" disabled>Continue</button>
        </div>
      </div>
    `;

    const typingInput = document.getElementById('typing-input');
    const quoteEl = document.getElementById('challenge-quote');
    const charCount = document.getElementById('char-count');
    const accuracySpan = document.getElementById('accuracy');
    const submitBtn = document.getElementById('submit-typing');
    const errorText = document.getElementById('typing-error');

    function rejectShortcut(event) {
      event.preventDefault();
      errorText.textContent = SHORTCUT_MESSAGE;
    }

    function updateSubmitState() {
      if (typingInput.value !== currentText) {
        clearUnlockCountdown();
        submitBtn.disabled = true;
        submitBtn.textContent = 'Continue';
        return;
      }

      // Earn-Access: finishing early doesn't throw the work away, it just waits.
      if (isLastSegment && getEarnAccessRemainingSeconds() > 0) {
        startUnlockCountdown(submitBtn);
        return;
      }

      submitBtn.disabled = false;
      submitBtn.textContent = 'Continue';
    }

    renderQuoteHighlight(quoteEl, currentText, '');
    typingInput.focus();
    typingInput.addEventListener('contextmenu', (e) => e.preventDefault());
    typingInput.addEventListener('paste', rejectShortcut);
    typingInput.addEventListener('drop', rejectShortcut);
    typingInput.addEventListener('beforeinput', function (e) {
      if (BLOCKED_INPUT_TYPES.has(e.inputType)) {
        rejectShortcut(e);
      }
    });

    typingInput.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(String(e.key).toLowerCase())) {
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
      const diff = computeTypingDiff(currentText, typedText);
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

      renderQuoteHighlight(quoteEl, currentText, typedText);
      typingInput.classList.toggle('has-error', diff.hasError);
      errorText.textContent = diff.hasError
        ? 'You have a mismatch, marked in red above. Correct it to continue.'
        : '';

      updateSubmitState();
    });

    submitBtn.addEventListener('click', function () {
      if (submitBtn.disabled || typingInput.value !== currentText) {
        return;
      }

      if (!isLastSegment) {
        announce(`${challengeCopy.unitLabel} ${currentSegmentIndex + 1} of ${totalSegments} done.`);
        currentSegmentIndex++;
        displayCurrentParagraph();
        return;
      }

      submitBtn.disabled = true;
      completeChallenge(getSelectedAccessMinutes(), originalUrl, {
        onFailure: function () {
          submitBtn.disabled = false;
        }
      });
    });

    document.getElementById('cancel-challenge').addEventListener('click', function () {
      reportAnalyticsEvent('challenge_failed');
      leaveGate();
    });
  }

  displayCurrentParagraph();
}

// Where the typed text first diverges from the target. Everything before
// `correctLength` matches; target characters from there up to `errorEnd` sit under
// mistyped input.
function computeTypingDiff(target, typed) {
  const limit = Math.min(target.length, typed.length);
  let correctLength = 0;
  while (correctLength < limit && typed[correctLength] === target[correctLength]) {
    correctLength++;
  }

  const hasError = typed.length > correctLength;
  return {
    correctLength,
    errorEnd: hasError ? Math.min(target.length, typed.length) : correctLength,
    hasError,
    complete: !hasError && typed.length === target.length
  };
}

function getQuoteHighlightParts(target, typed) {
  const diff = computeTypingDiff(target, typed);
  const parts = [{ className: 'qc-done', text: target.slice(0, diff.correctLength) }];

  if (diff.hasError) {
    parts.push({ className: 'qc-error', text: target.slice(diff.correctLength, diff.errorEnd) });
    parts.push({ className: '', text: target.slice(diff.errorEnd) });
  } else {
    parts.push({ className: 'qc-current', text: target.slice(diff.correctLength, diff.correctLength + 1) });
    parts.push({ className: '', text: target.slice(diff.correctLength + 1) });
  }

  return parts.filter((part) => part.text);
}

function renderQuoteHighlight(quoteEl, target, typed) {
  if (!quoteEl || typeof document.createElement !== 'function') {
    return;
  }

  quoteEl.textContent = '';
  getQuoteHighlightParts(target, typed).forEach(function (part) {
    if (!part.className) {
      quoteEl.appendChild(document.createTextNode(part.text));
      return;
    }

    const span = document.createElement('span');
    span.className = part.className;
    span.textContent = part.text;
    quoteEl.appendChild(span);
  });
}

function getChallengeContextLine() {
  const hostname = getTargetHostname({ stripWww: true });
  if (!hostname) {
    return '';
  }

  const reason = getStatedIntent();
  if (!reason) {
    return `→ ${hostname}`;
  }

  const shortReason = reason.length > 80 ? `${reason.slice(0, 79).trimEnd()}…` : reason;
  return `→ ${hostname} · “${shortReason}”`;
}

function getStatedIntent() {
  const fromPrecheck = typeof challengeMeta.taskIntent === 'string' ? challengeMeta.taskIntent.trim() : '';
  if (fromPrecheck) {
    return fromPrecheck;
  }

  return getIntentionPrecheck()?.taskIntent || '';
}

function getEarnAccessRemainingSeconds(now = Date.now()) {
  if (!isEarnAccessRuleActive() || !startTime) {
    return 0;
  }

  const elapsed = Math.floor((now - startTime) / 1000);
  return Math.max(0, getEarnAccessMinChallengeSeconds() - elapsed);
}

function formatCountdown(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function startUnlockCountdown(submitBtn) {
  if (unlockCountdownInterval) {
    return;
  }

  const remaining = getEarnAccessRemainingSeconds();
  submitBtn.disabled = true;
  submitBtn.textContent = `Unlocks in ${formatCountdown(remaining)}`;
  announce(`Done. Earn-Access unlocks in ${remaining} seconds.`);

  unlockCountdownInterval = setInterval(function () {
    const left = getEarnAccessRemainingSeconds();
    if (left > 0) {
      submitBtn.textContent = `Unlocks in ${formatCountdown(left)}`;
      return;
    }

    clearUnlockCountdown();
    submitBtn.disabled = false;
    submitBtn.textContent = 'Continue';
    announce('Access unlocked. Press Enter to continue.');
  }, 1000);
}

function clearUnlockCountdown() {
  if (unlockCountdownInterval) {
    clearInterval(unlockCountdownInterval);
    unlockCountdownInterval = null;
  }
}

function renderChallengeSummary() {
  const subtitle = document.getElementById('precheck-subtitle');
  if (!subtitle) {
    return;
  }

  const level = getEffectiveChallengeLevel();
  subtitle.textContent = getChallengeLevelCopy(level).precheck(getChallengeSize(level, getChallengeWeight()));
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
  if (level === 'custom') {
    return CHALLENGE_LEVEL_COPY.custom;
  }
  return CHALLENGE_LEVEL_COPY[sanitizeChallengeLevel(level)];
}

function getCustomChallengePhrase(settings = currentSettings) {
  const custom = settings?.proFeatures?.customChallengePhrase;
  if (custom?.enabled !== true || typeof custom.text !== 'string') {
    return '';
  }

  return custom.text.trim();
}

// A custom phrase replaces the level's text bank entirely: the phrase is typed once,
// whatever the level says.
function getEffectiveChallengeLevel(settings = currentSettings) {
  if (getCustomChallengePhrase(settings)) {
    return 'custom';
  }
  return getTypingChallengeLevel(settings);
}

function buildTypingChallengeSegments(level = getEffectiveChallengeLevel(), weight = 'standard') {
  if (level === 'custom') {
    const phrase = getCustomChallengePhrase();
    if (phrase) {
      return Array.from({ length: getChallengeSize('custom', weight) }, () => ({ text: phrase }));
    }
  }

  const selectedLevel = sanitizeChallengeLevel(level);
  const size = getChallengeSize(selectedLevel, weight);
  if (selectedLevel === 'easy') {
    return [{ text: generateRandomCharacterSequence(size) }];
  }

  if (selectedLevel === 'moderate') {
    return [{ text: getRandomItems(MODERATE_CHALLENGE_SENTENCES).slice(0, size).join(' ') }];
  }

  return getRandomItems(PRODUCTIVITY_TEXTS).slice(0, size).map((text) => ({ text }));
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

function completeChallenge(duration, originalUrl, { onFailure } = {}) {
  const timeSpent = Math.floor((Date.now() - startTime) / 1000);
  const safeTargetUrl = getSafeTargetUrl(originalUrl);
  if (!safeTargetUrl) {
    showPageError('This destination is not a valid web address.');
    if (typeof onFailure === 'function') onFailure();
    return;
  }

  // The button already waits out Earn-Access; this only guards a clock that drifted.
  if (isEarnAccessRuleActive() && timeSpent < getEarnAccessMinChallengeSeconds()) {
    showPageError(`Earn-Access needs ${getEarnAccessRemainingSeconds()} more seconds. Your typing is kept.`);
    if (typeof onFailure === 'function') onFailure();
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
    },
    onFailure
  });
}

function requestTemporaryAccess({ targetUrl, duration, timeSpent, meta, successDetails, onFailure }) {
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
        domain: response.access?.domain || domain,
        duration,
        timeSpent: successDetails?.timeSpent || 0,
        bonusMinutes: successDetails?.bonusMinutes || 0,
        expiresAt: response.access?.expiresAt
      });
      return;
    }

    // Stay put: the typed work and the current step are kept, so the user can retry.
    showPageError(response?.error || 'ResistGate could not grant access. Please try again.');
    if (typeof onFailure === 'function') {
      onFailure();
    }
  });
}

function renderSuccessState({ targetUrl, domain, duration, timeSpent, bonusMinutes, expiresAt }) {
  transitionToPhase(PHASES.SUCCESS);
  grantedAccessDomain = domain;

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

  const intentEl = document.getElementById('success-intent');
  const intent = getStatedIntent();
  if (intentEl) {
    intentEl.textContent = intent ? `You said you're here to: ${intent}` : '';
    intentEl.classList.toggle('hidden', !intent);
  }

  const continueLink = document.getElementById('continue-to-site');
  continueLink.href = targetUrl;
  continueLink.classList.remove('hidden');
  document.getElementById('close-tab-btn').classList.add('hidden');
  document.getElementById('never-mind-btn').classList.remove('hidden');
  document.getElementById('success-prompt').classList.remove('hidden');

  const timerEl = document.getElementById('access-timer');
  const resolvedExpiry = expiresAt || (Date.now() + (parseInt(duration, 10) * 60 * 1000));
  startAccessCountdown(timerEl, resolvedExpiry, renderAccessExpired);
}

// The window closed while the user was still on this page. The link would only bounce
// back to the gate now, so offer to close the tab instead.
function renderAccessExpired() {
  const timerEl = document.getElementById('access-timer');
  if (timerEl) {
    timerEl.textContent = 'Time\'s up — close the tab?';
  }

  document.getElementById('continue-to-site').classList.add('hidden');
  document.getElementById('never-mind-btn').classList.add('hidden');
  document.getElementById('success-prompt').classList.add('hidden');
  document.getElementById('close-tab-btn').classList.remove('hidden');
  announce('Access has ended. Close the tab?');
}

function getEarnAccessBonus(timeSpentSeconds) {
  const friction = currentSettings?.proFeatures?.behavioralFriction || {};
  if (friction.enabled !== true || friction.earnAccessEnabled === false) {
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
  const friction = currentSettings?.proFeatures?.behavioralFriction || {};
  return friction.enabled === true && friction.earnAccessEnabled !== false;
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
  if (currentSettings?.proFeatures?.strictModeEnabled !== true) {
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

// Errors show where the user is looking: each phase has its own message slot.
function showPageError(message) {
  const errorIds = {
    [PHASES.INTENTION]: 'intention-error',
    [PHASES.CHALLENGE]: 'typing-error',
    [PHASES.SUCCESS]: 'success-error'
  };
  const el = document.getElementById(errorIds[currentPhase] || 'precheck-error');
  if (el) {
    el.textContent = message || '';
  }
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

function startAccessCountdown(targetElement, expiresAt, onExpire) {
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
      if (typeof onExpire === 'function') {
        onExpire();
      }
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
    getEffectiveChallengeLevel,
    getCustomChallengePhrase,
    getChallengeLevelCopy,
    buildTypingChallengeSegments,
    canUseIntentionPage,
    isIntentionPageEnabled,
    getIntentionPrecheck,
    goBack,
    leaveGate,
    handleRemindLater,
    handleNeverMind,
    handleManualOverride,
    cancelManualOverride,
    handleGlobalKeydown,
    showPageError,
    computeTypingDiff,
    getQuoteHighlightParts,
    getEarnAccessRemainingSeconds,
    formatCountdown,
    findBlocklistEntry,
    normalizeBlocklistPattern,
    getBundlePanelCopy,
    getAccessDurationOptions,
    getChallengeWeight,
    getChallengeSize,
    getDurationHint,
    getGateStreakText,
    getChallengeContextLine,
    requestTemporaryAccess,
    completeChallenge,
    startAccessCountdown,
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
    },
    __setStartTimeForTest: (value) => {
      startTime = value;
    },
    __setChallengeMetaForTest: (meta) => {
      challengeMeta = { ...challengeMeta, ...meta };
    },
    __setSelectedAccessMinutesForTest: (minutes) => {
      selectedAccessMinutes = minutes;
    },
    __setAccessDurationForTest: (minutes) => {
      accessDurationMinutes = minutes;
    },
    __getCurrentPhase: () => currentPhase
  };
}
