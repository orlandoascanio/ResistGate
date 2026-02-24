// Popup Script
document.addEventListener('DOMContentLoaded', function () {
    // Get DOM elements
    const newBlockedSiteInput = document.getElementById('new-blocked-site');
    const addSiteBtn = document.getElementById('add-site-btn');
    const blockedSitesList = document.getElementById('blocked-sites-list');
    const openOptionsBtn = document.getElementById('open-options-btn');

    // Load blocked sites
    loadBlockedSites();

    // Add site button event
    addSiteBtn.addEventListener('click', addBlockedSite);

    // Also allow adding with Enter key
    newBlockedSiteInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            addBlockedSite();
        }
    });

    // Open options page button
    openOptionsBtn.addEventListener('click', function () {
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

    // Basic domain validation
    if (!isValidDomain(domain)) {
        showMessage('Please enter a valid domain (e.g., example.com)', 'error');
        return;
    }

    // Get current settings
    chrome.runtime.sendMessage({
        action: "getSettings"
    }, function (response) {
        if (response && response.settings) {
            const settings = response.settings;

            // Check if already in blocklist
            if (settings.blocklist.some(site => site.urlPattern === domain)) {
                showMessage('Site already exists in FocusGate.', 'error');
                return;
            }

            // Add to blocklist
            const newEntry = {
                id: Date.now().toString(), // Simple ID generation
                urlPattern: domain,
                createdAt: Date.now(),
                temporaryAccessOptions: [
                    { duration: 1440, challengeType: 'typing' }
                ]
            };

            // Handle duration
            const durationSelect = document.getElementById('block-duration');
            const duration = durationSelect.value;

            if (duration !== 'forever') {
                const durationMinutes = parseInt(duration);
                newEntry.unblockAt = Date.now() + (durationMinutes * 60 * 1000);
            }

            settings.blocklist.push(newEntry);

            // Save updated settings
            chrome.runtime.sendMessage({
                action: "updateSettings",
                settings: settings
            }, function (response) {
                if (response && response.success) {

                    // Clear input
                    document.getElementById('new-blocked-site').value = '';

                    // Reload the blocked sites list
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
        action: "getSettings"
    }, function (response) {
        if (response && response.settings) {
            const blocklist = response.settings.blocklist || [];
            const listElement = document.getElementById('blocked-sites-list');

            // Clear current list
            listElement.innerHTML = '';

            const emptyMsg = document.getElementById('empty-blocklist-msg');

            if (blocklist.length === 0) {
                if (emptyMsg) emptyMsg.style.display = 'block';
                return;
            } else {
                if (emptyMsg) emptyMsg.style.display = 'none';
            }

            // Add each site to the list
            blocklist.forEach(entry => {
                const li = document.createElement('li');
                li.className = 'blocked-site-item';

                li.innerHTML = `
                    <span class="blocked-site-domain" title="${entry.urlPattern}">${entry.urlPattern}</span>
                    <button class="btn btn-danger delete-btn" data-id="${entry.id}">Remove</button>
                `;

                listElement.appendChild(li);
            });

            // Add event listeners to delete buttons
            document.querySelectorAll('.delete-btn').forEach(button => {
                button.addEventListener('click', function () {
                    const id = this.getAttribute('data-id');
                    removeBlockedSite(id);
                });
            });
        }
    });
}

function removeBlockedSite(id) {
    chrome.runtime.sendMessage({
        action: "getSettings"
    }, function (response) {
        if (response && response.settings) {
            const settings = response.settings;

            // Filter out the site with the specified ID
            settings.blocklist = settings.blocklist.filter(entry => entry.id !== id);

            // Update settings
            chrome.runtime.sendMessage({
                action: "updateSettings",
                settings: settings
            }, function (updateResponse) {
                if (updateResponse && updateResponse.success) {
                    // Reload the blocked sites list
                    loadBlockedSites();
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

function isValidDomain(domain) {
    // Simple domain validation regex
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](\.[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9])*.?$/;
    return domainRegex.test(domain);
}

function showMessage(text, type = 'info') {
    // Remove any existing message
    const existingMessage = document.querySelector('.message:not(.blocked-site-item)');
    if (existingMessage) {
        existingMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = text;

    document.querySelector('.container').appendChild(messageDiv);

    // Remove message after 3 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 3000);
}
