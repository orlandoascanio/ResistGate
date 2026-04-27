// ResistGate — What's New page

document.addEventListener('DOMContentLoaded', () => {
  const version = chrome.runtime.getManifest().version;

  // Populate version badge
  const versionBadge = document.getElementById('version-badge');
  if (versionBadge) {
    versionBadge.textContent = `v${version}`;
  }

  // Check Pro status and update footer CTA
  void checkProStatusAndUpdateFooter();

  // Button: Open Settings
  const openOptionsBtn = document.getElementById('open-options-btn');
  if (openOptionsBtn) {
    openOptionsBtn.addEventListener('click', handleOpenOptions);
  }

  // Button: Close
  const closeBtn = document.getElementById('close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', handleClose);
  }

  // Upgrade link
  const upgradeLink = document.getElementById('upgrade-link');
  if (upgradeLink) {
    upgradeLink.addEventListener('click', handleUpgrade);
  }
});

/**
 * Handle open settings button click
 * @param {Event} e
 */
function handleOpenOptions(e) {
  const btn = e.currentTarget;
  setButtonLoading(btn, true);

  try {
    chrome.runtime.openOptionsPage();
    // Delay close to give visual feedback
    setTimeout(() => {
      window.close();
    }, 150);
  } catch (err) {
    console.warn('[ResistGate] Failed to open options:', err);
    setButtonLoading(btn, false);
    showButtonError(btn);
  }
}

/**
 * Handle close button click
 * @param {Event} e
 */
function handleClose(e) {
  const btn = e.currentTarget;
  btn.classList.add('active');

  // Visual feedback before closing
  requestAnimationFrame(() => {
    window.close();
  });
}

/**
 * Handle upgrade link click
 * @param {Event} e
 */
function handleUpgrade(e) {
  e.preventDefault();
  const link = e.currentTarget;

  link.style.pointerEvents = 'none';
  link.style.opacity = '0.6';

  chrome.runtime.sendMessage({ action: 'openPricingPage' }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[ResistGate] Pricing page error:', chrome.runtime.lastError);
      link.style.pointerEvents = '';
      link.style.opacity = '';
      return;
    }

    // Delay close to give visual feedback
    setTimeout(() => {
      window.close();
    }, 150);
  });
}

/**
 * Set button loading state
 * @param {HTMLButtonElement} btn
 * @param {boolean} isLoading
 */
function setButtonLoading(btn, isLoading) {
  if (isLoading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.textContent = 'Opening...';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || btn.textContent;
  }
}

/**
 * Show error state on button
 * @param {HTMLButtonElement} btn
 */
function showButtonError(btn) {
  const originalText = btn.textContent;
  btn.textContent = 'Error — try again';
  btn.style.background = '#dc2626';

  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = '';
  }, 2000);
}

/**
 * Check Pro status and hide upgrade CTA if user is Pro
 */
function checkProStatusAndUpdateFooter() {
  return new Promise((resolve) => {
    const footerCta = document.getElementById('footer-cta');
    if (!footerCta) {
      resolve(false);
      return;
    }

    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[ResistGate] Failed to get settings:', chrome.runtime.lastError);
        resolve(false);
        return;
      }

      const isPro = response?.settings?.subscription?.tier === 'pro';
      if (isPro) {
        footerCta.classList.add('hidden');
      }
      resolve(isPro);
    });
  });
}

// Expose for testing
if (typeof globalThis !== 'undefined') {
  globalThis.__RESISTGATE_WHATSNEW_TEST_HOOKS__ = {
    handleOpenOptions,
    handleClose,
    handleUpgrade,
    checkProStatusAndUpdateFooter,
    setButtonLoading,
    showButtonError
  };
}
