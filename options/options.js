// Options Page Script
const DEFAULT_ACCESS_WINDOW_MINUTES = 15;

document.addEventListener('DOMContentLoaded', function () {
    const newBlockedSiteInput = document.getElementById('new-blocked-site');
    const addSiteBtn = document.getElementById('add-site-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');

    loadSettings();

    addSiteBtn.addEventListener('click', addBlockedSite);

    newBlockedSiteInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            addBlockedSite();
        }
    });

    saveSettingsBtn.addEventListener('click', saveSettings);
});

function loadSettings() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, function (response) {
        if (!(response && response.settings)) {
            return;
        }

        const settings = response.settings;
        const blocklist = settings.blocklist || [];

        const accessWindowInput = document.getElementById('access-window-minutes');
        const minutes = settings.defaultAccessDuration
            || settings.challengeTypes?.typing?.duration
            || DEFAULT_ACCESS_WINDOW_MINUTES;

        accessWindowInput.value = minutes;
        loadBlockedSites(blocklist);
    });
}

function addBlockedSite() {
    const input = document.getElementById('new-blocked-site');
    const domain = input.value.trim();

    if (!domain) {
        showMessage('Please enter a valid domain', 'error');
        return;
    }

    if (!isValidDomain(domain)) {
        showMessage('Please enter a valid domain (e.g., example.com)', 'error');
        return;
    }

    chrome.runtime.sendMessage({ action: 'getSettings' }, function (response) {
        if (response && response.settings) {
            const settings = response.settings;
            settings.blocklist = settings.blocklist || [];

            if (settings.blocklist.some(site => site.urlPattern === domain)) {
                showMessage('Site already exists in FocusGate.', 'error');
                return;
            }

            const accessMinutes = getAccessWindowMinutes(settings);
            const newEntry = {
                id: Date.now().toString(),
                urlPattern: domain,
                createdAt: Date.now(),
                temporaryAccessOptions: [
                    { duration: accessMinutes, challengeType: 'typing' }
                ]
            };

            settings.blocklist.push(newEntry);

            chrome.runtime.sendMessage({
                action: 'updateSettings',
                settings: settings
            }, function (updateResponse) {
                if (updateResponse && updateResponse.success) {
                    input.value = '';
                    loadBlockedSites(settings.blocklist);
                    showMessage('Site added to FocusGate.', 'success');
                } else {
                    showMessage('Unable to add site. Try again.', 'error');
                }
            });
        } else {
            showMessage('Unable to load FocusGate settings.', 'error');
        }
    });
}

function loadBlockedSites(blocklist = []) {
    const listElement = document.getElementById('blocked-sites-list');
    listElement.innerHTML = '';

    if (blocklist.length === 0) {
        const noSitesItem = document.createElement('li');
        noSitesItem.className = 'message';
        noSitesItem.textContent = 'No sites in FocusGate yet';
        listElement.appendChild(noSitesItem);
        return;
    }

    blocklist.forEach(entry => {
        const li = document.createElement('li');
        li.className = 'blocked-site-item';

        const siteDomain = document.createElement('span');
        siteDomain.className = 'site-domain';
        siteDomain.textContent = entry.urlPattern;
        siteDomain.setAttribute('title', entry.urlPattern);

        const removeButton = document.createElement('button');
        removeButton.className = 'btn btn-danger delete-btn';
        removeButton.setAttribute('data-id', entry.id);
        removeButton.textContent = 'Remove';

        li.appendChild(siteDomain);
        li.appendChild(removeButton);

        listElement.appendChild(li);
    });

    document.querySelectorAll('.delete-btn[data-id]').forEach(button => {
        button.addEventListener('click', function () {
            const id = this.getAttribute('data-id');
            removeBlockedSite(id);
        });
    });
}

function removeBlockedSite(id) {
    chrome.runtime.sendMessage({ action: 'getSettings' }, function (response) {
        if (response && response.settings) {
            const settings = response.settings;
            settings.blocklist = (settings.blocklist || []).filter(entry => entry.id !== id);

            chrome.runtime.sendMessage({
                action: 'updateSettings',
                settings: settings
            }, function (updateResponse) {
                if (updateResponse && updateResponse.success) {
                    loadBlockedSites(settings.blocklist);
                    showMessage('Site removed from FocusGate.', 'success');
                } else {
                    showMessage('Unable to remove site. Try again.', 'error');
                }
            });
        } else {
            showMessage('Unable to load FocusGate settings.', 'error');
        }
    });
}

function saveSettings() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, function (response) {
        if (response && response.settings) {
            const settings = response.settings;
            const accessMinutes = getAccessWindowMinutes(settings);

            settings.defaultAccessDuration = accessMinutes;
            settings.challengeTypes = settings.challengeTypes || {};
            settings.challengeTypes.typing = settings.challengeTypes.typing || {};
            settings.challengeTypes.typing.difficulty = settings.challengeTypes.typing.difficulty || 3;
            settings.challengeTypes.typing.duration = accessMinutes;

            chrome.runtime.sendMessage({
                action: 'updateSettings',
                settings: settings
            }, function (saveResponse) {
                if (saveResponse && saveResponse.success) {
                    showMessage('FocusGate settings saved.', 'success');
                } else {
                    showMessage('Unable to save settings. Try again.', 'error');
                }
            });
        } else {
            showMessage('Unable to load FocusGate settings.', 'error');
        }
    });
}

function getAccessWindowMinutes(settings) {
    const accessWindowInput = document.getElementById('access-window-minutes');
    const parsed = parseInt(accessWindowInput.value, 10);

    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }

    return settings.defaultAccessDuration
        || settings.challengeTypes?.typing?.duration
        || DEFAULT_ACCESS_WINDOW_MINUTES;
}

function isValidDomain(domain) {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](\.[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9])*.?$/;
    return domainRegex.test(domain);
}

function showMessage(text, type = 'info') {
    const existingMessage = document.querySelector('.message:not(.blocked-site-item)');
    if (existingMessage) {
        existingMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = text;

    document.querySelector('.container').appendChild(messageDiv);

    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 3000);
}
