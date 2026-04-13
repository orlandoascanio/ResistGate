// ResistGate — What's New page

/**
 * Hardcoded changelog. Each entry maps a version string to an array of
 * { category, label, detail } items displayed on the page.
 *
 * Categories: 'new' | 'changed' | 'fixed' | 'security'
 *
 * When shipping a new version, add a block here matching the version in
 * manifest.json before tagging and releasing.
 */
const changelogEntries = {
  '1.1.0': [
    {
      category: 'new',
      label: 'Commitment Mode (Pro)',
      detail: '— Total lockout for 1–24 hours with no overrides. Auto-expires via Chrome alarm.'
    },
    {
      category: 'new',
      label: 'Intention Page (Pro)',
      detail: '— Replaces the generic friction message with your personal goal and an optional 4-7-8 breathing animation.'
    },
    {
      category: 'changed',
      label: 'Pricing',
      detail: '— Monthly dropped to $3.99/mo, Annual to $29.99/yr, Lifetime to $49.99.'
    },
    {
      category: 'changed',
      label: 'Paywall',
      detail: '— Added Commitment Mode and Intention Page to the Pro feature highlights.'
    }
  ],
  '1.0.0': [
    {
      category: 'new',
      label: 'Core Engine',
      detail: '— Manifest V3 declarativeNetRequest-based domain blocking.'
    },
    {
      category: 'new',
      label: 'Friction Flow',
      detail: '— Interactive typing challenge (5 paragraphs) for unlocking blocked sites.'
    },
    {
      category: 'new',
      label: 'Manual Override',
      detail: '— Configurable 10–15 s delay fallback for quick access.'
    },
    {
      category: 'new',
      label: 'Scheduling',
      detail: '— Day/time-based blocking windows.'
    },
    {
      category: 'fixed',
      label: 'Strict Mode Reliability',
      detail: '— Strict Mode now activates globally even without a schedule.'
    },
    {
      category: 'security',
      label: 'Pro Entitlement',
      detail: '— Cryptographic JWT license validation (RS256) via Web Crypto API with 24-hour periodic refresh.'
    }
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  const version = chrome.runtime.getManifest().version;

  // Populate version badge
  const versionBadge = document.getElementById('version-badge');
  if (versionBadge) {
    versionBadge.textContent = `v${version}`;
  }

  // Render changelog entries
  const body = document.getElementById('changelog-body');
  const entries = changelogEntries[version];

  if (body) {
    if (entries && entries.length > 0) {
      entries.forEach(({ category, label, detail }) => {
        const row = document.createElement('div');
        row.className = 'changelog-entry';
        row.setAttribute('role', 'listitem');

        const pill = document.createElement('span');
        pill.className = 'category-pill';
        pill.dataset.category = category;
        pill.textContent = category.charAt(0).toUpperCase() + category.slice(1);

        const textNode = document.createElement('p');
        textNode.className = 'entry-text';

        const bold = document.createElement('strong');
        bold.textContent = label;

        textNode.appendChild(bold);
        textNode.appendChild(document.createTextNode(` ${detail}`));

        row.appendChild(pill);
        row.appendChild(textNode);
        body.appendChild(row);
      });
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'changelog-fallback';
      fallback.textContent = `You're on v${version}. Check the changelog for full release notes.`;
      body.appendChild(fallback);
    }
  }

  // Buttons
  const openOptionsBtn = document.getElementById('open-options-btn');
  if (openOptionsBtn) {
    openOptionsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });
  }

  const closeBtn = document.getElementById('close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.close();
    });
  }
});
