// Popup Script
const POPUP_PREVIEW_LIMIT = 5;
let popupCommitmentTimer = null;
let workTimerPollInterval = null;

document.addEventListener('DOMContentLoaded', function () {
    const newBlockedSiteInput = document.getElementById('new-blocked-site');
    const openOptionsBtn = document.getElementById('open-options-btn');

    loadBlockedSites();
    loadWorkTimerUI();

    const blockCurrentTabBtn = document.getElementById('block-current-tab-btn');
    if (blockCurrentTabBtn) {
        blockCurrentTabBtn.addEventListener('click', blockCurrentTab);
    }

    const commitmentActivateBtn = document.getElementById('commitment-mode-activate-btn');
    if (commitmentActivateBtn) {
        commitmentActivateBtn.addEventListener('click', activateCommitmentMode);
    }

    const workTimerToggleBtn = document.getElementById('work-timer-toggle-btn');
    if (workTimerToggleBtn) {
        workTimerToggleBtn.addEventListener('click', toggleWorkTimer);
    }

    const openFeedbackBtn = document.getElementById('open-feedback-btn');
    if (openFeedbackBtn) {
        openFeedbackBtn.addEventListener('click', openFeedbackPage);
    }

    newBlockedSiteInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            addBlockedSite();
        }
    });

    openOptionsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('options/options.html'));
        }
    });

    chrome.storage.local.get(['pendingOutcomeTap'], function (result) {
        const tap = result.pendingOutcomeTap;
        if (!tap || typeof tap !== 'object') return;
        const domain = typeof tap.domain === 'string' ? tap.domain : null;
        const expiredAt = Number(tap.expiredAt);
        if (!domain || !Number.isFinite(expiredAt)) return;
        if (Date.now() - expiredAt > 86400000) {
            chrome.storage.local.remove('pendingOutcomeTap');
            return;
        }
        showOutcomeTap(domain);
    });
});

function openFeedbackPage() {
    chrome.runtime.sendMessage({
        action: 'openFeedbackPage',
        surface: 'extension_popup'
    }, function (response) {
        if (!(response && response.success)) {
            showMessage(response?.error || 'Unable to open feedback page.', 'error');
        }
    });
}

function addBlockedSite() {
    const input = document.getElementById('new-blocked-site');
    const domain = normalizeDomainInput(input.value);

    if (!domain) {
        showMessage('Please enter a valid domain', 'error');
        return;
    }

    chrome.runtime.sendMessage({
        action: 'getSettings'
    }, function (response) {
        if (response && response.settings) {
            const settings = response.settings;
            settings.blocklist = settings.blocklist || [];

            if (settings.blocklist.some(site => normalizeDomainInput(site.urlPattern) === domain)) {
                showMessage('Site already exists in ResistGate.', 'error');
                return;
            }

            const defaultDuration = settings.defaultAccessDuration || 15;
            const newEntry = {
                id: Date.now().toString(),
                urlPattern: domain,
                createdAt: Date.now(),
                temporaryAccessOptions: [
                    { duration: defaultDuration, challengeType: 'typing' }
                ]
            };

            settings.blocklist.push(newEntry);

            chrome.runtime.sendMessage({
                action: 'updateSettings',
                settings: settings
            }, function (updateResponse) {
                if (updateResponse && updateResponse.success) {
                    input.value = '';
                    loadBlockedSites();
                    showMessage('Site added to ResistGate.', 'success');
                } else {
                    showMessage('Unable to add site. Try again.', 'error');
                }
            });
        } else {
            showMessage('Unable to load ResistGate settings.', 'error');
        }
    });
}

function blockCurrentTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const tab = tabs && tabs[0];
        if (!tab || !tab.url) {
            showMessage('No active tab found.', 'error');
            return;
        }

        let hostname;
        try {
            const url = new URL(tab.url);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                showMessage('Cannot block this type of page.', 'error');
                return;
            }
            hostname = url.hostname;
        } catch {
            showMessage('Cannot read this tab\'s URL.', 'error');
            return;
        }

        const input = document.getElementById('new-blocked-site');
        input.value = hostname;
        addBlockedSite();
    });
}

function loadBlockedSites() {
    chrome.runtime.sendMessage({
        action: 'getSettings'
    }, function (response) {
        if (!(response && response.settings)) {
            return;
        }

        renderCommitmentPopupStatus(response.settings);

        const blocklist = response.settings.blocklist || [];
        const listElement = document.getElementById('blocked-sites-list');
        const emptyMsg = document.getElementById('empty-blocklist-msg');
        const countBadge = document.getElementById('blocked-count-badge');

        if (countBadge) {
            const countMeta = getBlockedCountMeta(blocklist.length);
            countBadge.textContent = countMeta;
            countBadge.hidden = !countMeta;
        }

        listElement.innerHTML = '';

        if (blocklist.length === 0) {
            emptyMsg.style.display = 'block';
            return;
        }

        emptyMsg.style.display = 'none';

        const preview = blocklist.slice(0, POPUP_PREVIEW_LIMIT);
        preview.forEach(entry => {
            const li = document.createElement('li');
            li.className = 'blocked-site-item';

            const domainSpan = document.createElement('span');
            domainSpan.className = 'blocked-site-domain';
            domainSpan.textContent = entry.urlPattern;
            domainSpan.setAttribute('title', entry.urlPattern);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-site-btn';
            removeBtn.type = 'button';
            removeBtn.setAttribute('aria-label', `Remove ${entry.urlPattern}`);
            removeBtn.title = `Remove ${entry.urlPattern}`;
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', function () {
                removeBlockedSite(entry.id, entry.urlPattern);
            });

            li.appendChild(domainSpan);
            li.appendChild(removeBtn);
            listElement.appendChild(li);
        });

        if (blocklist.length > POPUP_PREVIEW_LIMIT) {
            const more = document.createElement('li');
            more.className = 'list-more';
            more.textContent = `+${blocklist.length - POPUP_PREVIEW_LIMIT} more`;
            listElement.appendChild(more);
        }
    });
}

function removeBlockedSite(siteId, domainLabel) {
    chrome.runtime.sendMessage({
        action: 'getSettings'
    }, function (response) {
        if (!(response && response.settings)) {
            showMessage('Unable to load ResistGate settings.', 'error');
            return;
        }

        const settings = response.settings;
        const blocklist = settings.blocklist || [];
        settings.blocklist = blocklist.filter((entry) => entry.id !== siteId);

        chrome.runtime.sendMessage({
            action: 'updateSettings',
            settings: settings
        }, function (updateResponse) {
            if (updateResponse && updateResponse.success) {
                loadBlockedSites();
                showMessage(`${domainLabel} removed from blocklist.`, 'success');
            } else {
                showMessage(updateResponse?.error || 'Unable to remove site. Try again.', 'error');
            }
        });
    });
}

function normalizeDomainInput(value) {
    if (typeof value !== 'string') {
        return null;
    }

    let domain = value.trim().toLowerCase();
    if (!domain) {
        return null;
    }

    if (domain.startsWith('http://') || domain.startsWith('https://')) {
        try {
            domain = new URL(domain).hostname.toLowerCase();
        } catch {
            return null;
        }
    }

    domain = domain
        .replace(/^\*\./, '')
        .replace(/^\.+/, '')
        .replace(/\.+$/, '')
        .replace(/\/.*$/, '');

    if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(domain) || !domain.includes('.')) {
        return null;
    }

    return domain;
}

function getBlockedCountMeta(count) {
    const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
    if (safeCount <= 0) {
        return '';
    }
    return `${safeCount} blocked`;
}

function showMessage(text, type = 'info') {
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
        existingMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = text;

    document.querySelector('.container').appendChild(messageDiv);

    // Announce to screen readers via aria-live region
    const announcement = document.getElementById('status-announcement');
    if (announcement) {
        announcement.textContent = '';
        setTimeout(() => { announcement.textContent = text; }, 50);
    }

    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 3000);
}

function isPopupProUser(settings) {
    return settings?.subscription?.tier === 'pro';
}

function formatPopupCountdown(remainingMs) {
    const totalSecs = Math.max(0, Math.ceil(remainingMs / 1000));
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) {
        return `${h}h ${m}m`;
    }
    if (m > 0) {
        return `${m}m ${String(s).padStart(2, '0')}s`;
    }
    return `${s}s`;
}

function renderCommitmentPopupStatus(settings) {
    const statusEl = document.getElementById('commitment-mode-popup-status');
    const textEl = document.getElementById('commitment-popup-text');
    const activateBtn = document.getElementById('commitment-mode-activate-btn');
    if (!statusEl || !textEl || !activateBtn) return;

    // Clear any existing countdown
    if (popupCommitmentTimer !== null) {
        clearInterval(popupCommitmentTimer);
        popupCommitmentTimer = null;
    }

    // Non-Pro users see neither the banner nor the button
    if (!isPopupProUser(settings)) {
        statusEl.classList.add('hidden');
        activateBtn.classList.add('hidden');
        return;
    }

    chrome.runtime.sendMessage({ action: 'getCommitmentModeStatus' }, function (response) {
        if (response && response.success && response.status?.active && response.status.expiresAt) {
            // Active — show countdown banner, hide activate button
            const expiresAt = response.status.expiresAt;
            activateBtn.classList.add('hidden');
            statusEl.classList.remove('hidden');

            function tickCountdown() {
                const remainingMs = expiresAt - Date.now();
                if (remainingMs <= 0) {
                    clearInterval(popupCommitmentTimer);
                    popupCommitmentTimer = null;
                    statusEl.classList.add('hidden');
                    activateBtn.classList.remove('hidden');
                    return;
                }
                textEl.textContent = `🔒 Commitment Mode — ${formatPopupCountdown(remainingMs)} remaining`;
            }

            tickCountdown();
            popupCommitmentTimer = setInterval(tickCountdown, 1000);
        } else {
            // Pro user, commitment mode inactive — show activate button
            statusEl.classList.add('hidden');
            activateBtn.classList.remove('hidden');
        }
    });
}

function activateCommitmentMode() {
    const hours = 2; // default 2-hour commitment session
    chrome.runtime.sendMessage({ action: 'activateCommitmentMode', durationHours: hours }, function (response) {
        if (response && response.success) {
            chrome.runtime.sendMessage({ action: 'getSettings' }, function (r) {
                if (r && r.settings) renderCommitmentPopupStatus(r.settings);
            });
        } else {
            showMessage(response?.error || 'Could not activate Commitment Mode.', 'error');
        }
    });
}

function loadWorkTimerUI() {
    // Only show the work timer section if at least one site uses the work_timer bundle
    chrome.runtime.sendMessage({ action: 'getSettings' }, function (response) {
        if (!response || !response.settings) return;
        const workTimerSites = (response.settings.blocklist || [])
            .filter((e) => e.temptationBundle?.enabled && e.temptationBundle.conditionType === 'work_timer')
            .map((e) => e.urlPattern);
        const section = document.getElementById('work-timer-section');
        if (!section) return;
        if (workTimerSites.length === 0) {
            section.classList.add('hidden');
            return;
        }
        section.classList.remove('hidden');
        renderWorkTimerSites(workTimerSites);
        fetchAndRenderWorkTimer();
    });
}

function renderWorkTimerSites(sites) {
    const el = document.getElementById('work-timer-sites');
    if (!el) return;
    if (!sites || sites.length === 0) {
        el.textContent = '';
        return;
    }
    el.textContent = `Unlocks when met: ${sites.join(', ')}`;
}

function fetchAndRenderWorkTimer() {
    chrome.runtime.sendMessage({ action: 'getWorkTimerState' }, function (response) {
        if (response && response.success) {
            renderWorkTimerUI(response.state);
        }
    });
}

function renderWorkTimerUI(state) {
    const display = document.getElementById('work-timer-display');
    const btn = document.getElementById('work-timer-toggle-btn');
    if (!display || !btn) return;

    const mins = state.effectiveMinutes ?? Math.floor(state.todayMinutes || 0);
    display.textContent = `${mins} min today`;

    if (state.running) {
        btn.textContent = '⏹ Stop timer';
        btn.classList.add('running');
        // Poll every 30s while running so the display stays fresh
        if (!workTimerPollInterval) {
            workTimerPollInterval = setInterval(fetchAndRenderWorkTimer, 30000);
        }
    } else {
        btn.textContent = '▶ Start timer';
        btn.classList.remove('running');
        if (workTimerPollInterval) {
            clearInterval(workTimerPollInterval);
            workTimerPollInterval = null;
        }
    }
}

function toggleWorkTimer() {
    const btn = document.getElementById('work-timer-toggle-btn');
    const isRunning = btn && btn.classList.contains('running');
    const action = isRunning ? 'stopWorkTimer' : 'startWorkTimer';
    chrome.runtime.sendMessage({ action }, function (response) {
        if (response && response.success) {
            renderWorkTimerUI(response.state);
        }
    });
}

function showOutcomeTap(domain) {
    const existing = document.getElementById('outcome-tap-banner');
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = 'outcome-tap-banner';
    banner.style.cssText = 'padding:10px 12px;background:#f0f4ff;border-top:1px solid #c7d2fe;font-size:13px;';

    const label = document.createElement('p');
    label.style.cssText = 'margin:0 0 8px 0;';
    label.textContent = `Did your visit to ${domain} serve you?`;
    banner.appendChild(label);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';

    ['Yes', 'No'].forEach(function (answer) {
        const btn = document.createElement('button');
        btn.textContent = answer;
        btn.style.cssText = 'flex:1;padding:4px 0;cursor:pointer;';
        btn.addEventListener('click', function () {
            chrome.runtime.sendMessage({
                action: 'recordAnalyticsEvent',
                event: { type: 'outcome_tap_response', domain: domain, response: answer.toLowerCase() }
            });
            chrome.storage.local.remove('pendingOutcomeTap');
            banner.remove();
        });
        btnRow.appendChild(btn);
    });

    banner.appendChild(btnRow);
    document.body.insertBefore(banner, document.body.firstChild);
}

if (typeof globalThis !== 'undefined') {
    globalThis.__RESISTGATE_POPUP_TEST_HOOKS__ = {
        normalizeDomainInput,
        getBlockedCountMeta,
        showOutcomeTap
    };
}
