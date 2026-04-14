// ResistGate — What's New page

/**
 * Hardcoded changelog. Each entry maps a version string to an array of
 * { category, label, detail } items displayed on the page.
 *
 * Categories: 'new' | 'changed' | 'fixed' | 'security'
 *
 * When shipping a new version, add a block here matching the version in
 * manifest.json before tagging and releasing. The first entry in each
 * version array is displayed as the primary highlight card.
 */
const changelogEntries = {
  '1.1.0': [
    {
      category: 'new',
      label: 'Commitment Mode',
      detail: 'Total lockout for 1–24 hours with no overrides. When you say you\'re done, you\'re done.'
    },
    {
      category: 'new',
      label: 'Intention Page',
      detail: 'Replace the default friction screen with your personal goal. A reminder of why you started.'
    },
    {
      category: 'changed',
      label: 'New pricing',
      detail: 'Monthly at $3.99, Annual at $29.99, Lifetime at $49.99. More value, lower barrier.'
    }
  ],
  '1.0.0': [
    {
      category: 'new',
      label: 'Stronger blocking engine',
      detail: 'Nowhere to slip through. Sites stay blocked—no workarounds.'
    },
    {
      category: 'new',
      label: 'Typing challenge',
      detail: 'Prove you\'re serious. Complete a typing challenge to unlock blocked sites on your terms.'
    },
    {
      category: 'new',
      label: 'Quick access control',
      detail: 'Adjustable delay (10–15s) before you can bypass. Time to reconsider your choices.'
    },
    {
      category: 'new',
      label: 'Time-based blocking',
      detail: 'Block by hour or day. Build discipline on your schedule, not theirs.'
    },
    {
      category: 'fixed',
      label: 'Strict Mode reliability',
      detail: 'Now works everywhere, even without a schedule. No more exceptions to your own rules.'
    },
    {
      category: 'security',
      label: 'License verification',
      detail: 'Your Pro status is verified every 24 hours. Security you can trust.'
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
      entries.forEach(({ category, label, detail }, index) => {
        const card = document.createElement('div');
        // First entry is the primary highlight card
        card.className = index === 0 ? 'changelog-entry primary' : 'changelog-entry';
        card.setAttribute('role', 'listitem');
        card.style.animationDelay = `${0.15 + index * 0.06}s`;

        const pill = document.createElement('span');
        pill.className = 'category-pill';
        pill.dataset.category = category;
        pill.textContent = category.charAt(0).toUpperCase() + category.slice(1);

        const textNode = document.createElement('p');
        textNode.className = 'entry-text';

        const bold = document.createElement('strong');
        bold.textContent = label;

        const detailSpan = document.createElement('span');
        detailSpan.textContent = ` — ${detail}`;

        textNode.appendChild(bold);
        textNode.appendChild(detailSpan);

        card.appendChild(pill);
        card.appendChild(textNode);
        body.appendChild(card);
      });
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'changelog-fallback';
      fallback.textContent = `You're on v${version}. Check the release notes for full details.`;
      body.appendChild(fallback);
    }
  }

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
});
