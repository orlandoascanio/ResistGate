// Commitment Mode Lock Page
let countdownInterval = null;
let currentOriginalUrl = null;

document.addEventListener('DOMContentLoaded', function () {
  const urlParams = new URLSearchParams(window.location.search);
  currentOriginalUrl = urlParams.get('originalUrl');

  renderBlockedSite();
  loadCommitmentStatus();

  document.getElementById('close-tab-btn').addEventListener('click', function () {
    window.close();
  });
});

function renderBlockedSite() {
  const blockedSiteEl = document.getElementById('blocked-site');
  if (!blockedSiteEl) return;

  const safeUrl = getSafeTargetUrl(currentOriginalUrl);
  if (safeUrl) {
    try {
      blockedSiteEl.textContent = new URL(safeUrl).hostname;
    } catch {
      blockedSiteEl.textContent = 'this site';
    }
  } else {
    blockedSiteEl.textContent = 'this site';
  }
}

function loadCommitmentStatus() {
  chrome.runtime.sendMessage({ action: 'getCommitmentModeStatus' }, function (response) {
    if (response && response.success && response.status?.active) {
      startCountdown(response.status.expiresAt, response.status.remainingSeconds);
    } else {
      // Commitment mode is no longer active — let the user know they can close this tab
      showExpiredState();
    }
  });
}

function startCountdown(expiresAt, initialRemaining) {
  const displayEl = document.getElementById('countdown-display');
  const expiryNoteEl = document.getElementById('expiry-note');

  if (!displayEl) return;

  // Show a human-readable expiry time if we have it
  if (expiresAt) {
    try {
      const expiryDate = new Date(expiresAt);
      expiryNoteEl.textContent = `Unlocks at ${expiryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      // ignore
    }
  }

  // Use expiresAt for precision if available, otherwise fall back to initialRemaining
  const resolvedExpiry = expiresAt || (Date.now() + (initialRemaining * 1000));

  function tick() {
    const remaining = Math.max(0, Math.ceil((resolvedExpiry - Date.now()) / 1000));

    displayEl.textContent = formatDuration(remaining);
    document.getElementById('status-announcement').textContent = remaining % 60 === 0
      ? `${Math.ceil(remaining / 60)} minutes remaining`
      : '';

    if (remaining <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      showExpiredState();
    }
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

function showExpiredState() {
  const displayEl = document.getElementById('countdown-display');
  const countdownCard = document.querySelector('.countdown-card');
  const statusMsg = document.getElementById('status-message');

  if (displayEl) displayEl.textContent = '00:00:00';

  if (countdownCard) {
    countdownCard.style.opacity = '0.5';
  }

  if (statusMsg) {
    statusMsg.textContent = 'Commitment Mode has ended. You may now navigate freely or close this tab.';
    statusMsg.classList.remove('hidden');
  }
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0')
  ].join(':');
}

function getSafeTargetUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.__RESISTGATE_COMMITMENT_TEST_HOOKS__ = {
    getSafeTargetUrl,
    formatDuration,
    showExpiredState
  };
}
