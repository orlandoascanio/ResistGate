// Popup Script
const POPUP_PREVIEW_LIMIT = 5;

document.addEventListener('DOMContentLoaded', function () {
    const newBlockedSiteInput = document.getElementById('new-blocked-site');
    const addSiteBtn = document.getElementById('add-site-btn');
    const openOptionsBtn = document.getElementById('open-options-btn');

    loadBlockedSites();

    addSiteBtn.addEventListener('click', addBlockedSite);

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
});

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

function loadBlockedSites() {
    chrome.runtime.sendMessage({
        action: 'getSettings'
    }, function (response) {
        if (!(response && response.settings)) {
            return;
        }

        const blocklist = response.settings.blocklist || [];
        const listElement = document.getElementById('blocked-sites-list');
        const emptyMsg = document.getElementById('empty-blocklist-msg');
        const countBadge = document.getElementById('blocked-count-badge');

        if (countBadge) {
            countBadge.textContent = getBlockedCountMeta(blocklist.length);
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
        return 'No sites blocked';
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

if (typeof globalThis !== 'undefined') {
    globalThis.__RESISTGATE_POPUP_TEST_HOOKS__ = {
        normalizeDomainInput,
        getBlockedCountMeta
    };
}
