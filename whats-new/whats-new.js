// ResistGate — What's New page

document.addEventListener('DOMContentLoaded', () => {
  const version = chrome.runtime.getManifest().version;

  // Populate version badge
  const versionBadge = document.getElementById('version-badge');
  if (versionBadge) {
    versionBadge.textContent = `v${version}`;
  }

  // Check Pro status and update footer CTA
  checkProStatusAndUpdateFooter();

  // Button: Open Settings
  const openOptionsBtn = document.getElementById('open-options-btn');
  if (openOptionsBtn) {
    openOptionsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });
  }

  // Button: Close
  const closeBtn = document.getElementById('close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.close();
    });
  }

  // Upgrade link
  const upgradeLink = document.getElementById('upgrade-link');
  if (upgradeLink) {
    upgradeLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'openPricingPage' }, () => {
        window.close();
      });
    });
  }
});

function checkProStatusAndUpdateFooter() {
  chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
    const footerCta = document.getElementById('footer-cta');
    if (!footerCta) return;

    const isPro = response?.settings?.subscription?.tier === 'pro';
    if (isPro) {
      footerCta.classList.add('hidden');
    }
  });
}
