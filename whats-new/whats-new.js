(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const hasChromeRuntime = () => typeof chrome !== 'undefined' && Boolean(chrome.runtime);

  const elements = {
    versionBadge: $('#version-badge'),
    releaseDate: $('#release-date'),
    openOptionsBtn: $('#open-options-btn'),
    closeBtn: $('#close-btn'),
    closeIconBtn: $('#close-icon-btn'),
    upgradeLink: $('#upgrade-link'),
    footerCta: $('#footer-cta'),
    statusMessage: $('#status-message')
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    populateVersionBadge();
    bindActions();
    void checkProStatusAndUpdateFooter();
    void trackUpdateSeen();
  }

  async function trackUpdateSeen() {
    try {
      await sendRuntimeMessage({
        action: 'trackPosthogEvent',
        eventName: 'update_seen',
        properties: {}
      });
    } catch (error) {
      console.warn('[ResistGate] Failed to track update_seen:', error);
    }
  }

  function bindActions() {
    elements.openOptionsBtn?.addEventListener('click', handleOpenOptions);
    elements.closeBtn?.addEventListener('click', handleClose);
    elements.closeIconBtn?.addEventListener('click', handleClose);
    elements.upgradeLink?.addEventListener('click', handleUpgrade);
  }

  function populateVersionBadge() {
    if (!elements.versionBadge || !hasChromeRuntime()) return;

    try {
      const manifest = chrome.runtime.getManifest?.();
      if (manifest?.version) {
        elements.versionBadge.textContent = `v${manifest.version}`;
      }
    } catch (error) {
      console.warn('[ResistGate] Could not read manifest version:', error);
    }
  }

  function handleOpenOptions(event) {
    const button = event.currentTarget;
    setButtonLoading(button, true);
    setStatus('Opening settings...');

    if (!hasChromeRuntime() || !chrome.runtime.openOptionsPage) {
      setButtonLoading(button, false);
      setStatus('Settings can only be opened from the extension.', 'warning');
      return;
    }

    try {
      chrome.runtime.openOptionsPage(() => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.warn('[ResistGate] Failed to open options:', lastError);
          setButtonLoading(button, false);
          setStatus('Could not open settings. Try again.', 'error');
          return;
        }

        setStatus('Settings opened.');
        window.setTimeout(() => window.close(), 180);
      });
    } catch (error) {
      console.warn('[ResistGate] Failed to open options:', error);
      setButtonLoading(button, false);
      setStatus('Could not open settings. Try again.', 'error');
    }
  }

  function handleClose() {
    setStatus('Closing...');
    window.setTimeout(() => {
      window.close();
      setStatus('You can close this tab now.');
    }, 80);
  }

  function handleUpgrade(event) {
    event.preventDefault();

    if (!elements.upgradeLink) return;
    elements.upgradeLink.classList.add('is-disabled');
    setStatus('Opening upgrade options...');

    sendRuntimeMessage({ action: 'openPricingPage' })
      .then(() => {
        setStatus('Upgrade options opened.');
        window.setTimeout(() => window.close(), 180);
      })
      .catch((error) => {
        console.warn('[ResistGate] Pricing page error:', error);
        elements.upgradeLink.classList.remove('is-disabled');
        setStatus('Could not open upgrade options. Try again.', 'error');
      });
  }

  async function checkProStatusAndUpdateFooter() {
    if (!elements.footerCta) return false;

    try {
      const response = await sendRuntimeMessage({ action: 'getSettings' });
      const isPro = response?.settings?.subscription?.tier === 'pro';

      if (isPro) {
        elements.footerCta.hidden = true;
      }

      return isPro;
    } catch (error) {
      console.warn('[ResistGate] Failed to get settings:', error);
      return false;
    }
  }

  function sendRuntimeMessage(payload) {
    return new Promise((resolve, reject) => {
      if (!hasChromeRuntime() || !chrome.runtime.sendMessage) {
        reject(new Error('Chrome runtime is unavailable.'));
        return;
      }

      chrome.runtime.sendMessage(payload, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(lastError);
          return;
        }

        resolve(response);
      });
    });
  }

  function setButtonLoading(button, isLoading) {
    if (!button) return;

    button.disabled = isLoading;
    button.classList.toggle('is-loading', isLoading);
  }

  function setStatus(message, tone = 'neutral') {
    if (!elements.statusMessage) return;

    elements.statusMessage.textContent = message;
    elements.statusMessage.dataset.tone = tone;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.__RESISTGATE_WHATSNEW_TEST_HOOKS__ = {
      handleOpenOptions,
      handleClose,
      handleUpgrade,
      checkProStatusAndUpdateFooter,
      setButtonLoading,
      setStatus,
      bindActions,
      init,
      elements
    };
  }
})();
