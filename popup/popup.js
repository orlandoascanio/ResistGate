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
    const domain = input.value.trim();

    if (!domain) {
        showMessage('Please enter a valid domain', 'error');
        return;
    }

    if (!isValidDomain(domain)) {
        showMessage('Please enter a valid domain (e.g., example.com)', 'error');
        return;
    }

    chrome.runtime.sendMessage({
        action: 'getSettings'
    }, function (response) {
        if (response && response.settings) {
            const settings = response.settings;
            settings.blocklist = settings.blocklist || [];

            if (settings.blocklist.some(site => site.urlPattern === domain)) {
                showMessage('Site already exists in FocusGate.', 'error');
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
            li.innerHTML = `<span class="blocked-site-domain" title="${entry.urlPattern}">${entry.urlPattern}</span>`;
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

function isValidDomain(domain) {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](\.[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9])*.?$/;
    return domainRegex.test(domain);
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

    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 3000);
}
