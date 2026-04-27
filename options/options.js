// Options Page Script
const DEFAULT_ACCESS_WINDOW_MINUTES = 15;
const DEFAULT_OVERRIDE_DELAY_SECONDS = 12;
const DEFAULT_STRICT_DISABLE_DELAY_SECONDS = 30;
const DEFAULT_PRO_PRESET = 'balanced';
const DEFAULT_CHALLENGE_LEVEL = 'hard';

const CHALLENGE_LEVEL_DIFFICULTY = {
  easy: 1,
  moderate: 2,
  hard: 3
};

const PRO_PRESET_VALUES = {
  light: {
    strictModeEnabled: false,
    strictModeDisableDelaySeconds: 20,
    behavioralFriction: {
      enabled: true,
      requireTaskIntent: false,
      timedWaitEnabled: false,
      timedWaitSeconds: 15,
      earnAccessEnabled: false,
      earnAccessMinChallengeSeconds: 60
    }
  },
  balanced: {
    strictModeEnabled: true,
    strictModeDisableDelaySeconds: 30,
    behavioralFriction: {
      enabled: true,
      requireTaskIntent: true,
      timedWaitEnabled: true,
      timedWaitSeconds: 20,
      earnAccessEnabled: true,
      earnAccessMinChallengeSeconds: 90
    }
  },
  strict: {
    strictModeEnabled: true,
    strictModeDisableDelaySeconds: 60,
    behavioralFriction: {
      enabled: true,
      requireTaskIntent: true,
      timedWaitEnabled: true,
      timedWaitSeconds: 45,
      earnAccessEnabled: true,
      earnAccessMinChallengeSeconds: 120
    }
  }
};

let activeTab = 'general';
let queuedProScreen = null;
let cachedSettings = null;
let _paywallReturnFocus = null;
let commitmentCountdownTimer = null;

document.addEventListener('DOMContentLoaded', function () {
  const newBlockedSiteInput = document.getElementById('new-blocked-site');
  const addSiteBtn = document.getElementById('add-site-btn');
  const scheduleEnabledToggle = document.getElementById('schedule-enabled');

  addSiteBtn.addEventListener('click', addBlockedSite);
  newBlockedSiteInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      addBlockedSite();
    }
  });

  document.querySelectorAll('[data-action="save-settings"]').forEach(function (btn) {
    btn.addEventListener('click', saveSettings);
  });
  scheduleEnabledToggle.addEventListener('change', function () {
    toggleScheduleConfig(scheduleEnabledToggle.checked);
  });

  document.querySelectorAll('.tab-btn[data-tab]').forEach((button) => {
    button.addEventListener('click', function () {
      const requestedTab = button.getAttribute('data-tab');
      handleTabRequest(requestedTab);
    });
  });

  document.querySelectorAll('[data-pro-screen]:not(.tab-btn)').forEach((element) => {
    element.addEventListener('click', function (event) {
      event.preventDefault();
      const requestedScreen = element.getAttribute('data-pro-screen');
      handleTabRequest(requestedScreen);
    });
  });

  document.querySelectorAll('[data-pro-preset]').forEach((button) => {
    button.addEventListener('click', function () {
      if (!isProUser()) {
        showPaywall('pro-preset');
        return;
      }

      const preset = sanitizePreset(button.getAttribute('data-pro-preset'));
      setActivePresetButton(preset);
      applyPresetToInputs(preset);
    });
  });

  document.querySelectorAll('[data-challenge-level]').forEach((button) => {
    button.addEventListener('click', function () {
      setActiveChallengeLevel(button.getAttribute('data-challenge-level'));
    });
  });

  const proControls = document.querySelectorAll('[data-pro-feature]');
  proControls.forEach((control) => {
    if (control.type === 'checkbox') {
      control.addEventListener('change', function () {
        if (!isProUser()) {
          renderProFeatureInputs();
          showPaywall('pro-feature-toggle');
        }
      });
    } else {
      control.addEventListener('focus', function () {
        if (!isProUser()) {
          control.blur();
          renderProFeatureInputs();
          showPaywall('pro-feature-field');
        }
      });
    }
  });

  document.getElementById('open-pricing-btn').addEventListener('click', function () {
    openPricingPage();
  });

  document.getElementById('whats-new-btn').addEventListener('click', function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('whats-new/whats-new.html') });
  });

  document.getElementById('view-pricing-btn').addEventListener('click', function () {
    hidePaywall();
    openPricingPage();
  });

  document.getElementById('close-paywall-btn').addEventListener('click', hidePaywall);
  // refresh-entitlement-btn removed

  document.getElementById('activate-commitment-btn').addEventListener('click', function () {
    if (!isProUser()) {
      showPaywall('commitment-mode');
      return;
    }

    const hours = parseInt(document.getElementById('commitment-duration-hours').value, 10) || 2;
    const confirmed = confirm(
      `Activate Commitment Mode for ${hours} hour${hours === 1 ? '' : 's'}?\n\n` +
      'This will lock ALL access to blocked sites. There is NO way to disable it early. ' +
      'Settings changes will also be blocked.\n\nAre you sure?'
    );
    if (!confirmed) {
      return;
    }

    chrome.runtime.sendMessage({
      action: 'activateCommitmentMode',
      durationHours: hours
    }, function (response) {
      if (response && response.success) {
        loadSettings();
        showMessage(`Commitment Mode activated for ${hours} hour${hours === 1 ? '' : 's'}.`, 'success');
      } else {
        showMessage(response?.error || 'Unable to activate Commitment Mode.', 'error');
      }
    });
  });

  if (chrome.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener(handleSettingsStorageChange);
  }

  loadSettings(function (loaded) {
    if (!loaded) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('activation') === 'success') {
      showMessage('Pro is now active! Your checkout went through and this browser is activated.', 'success');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  });

  initDetailsAnimation();
});

function loadSettings(callback) {
  chrome.runtime.sendMessage({ action: 'getSettings' }, function (response) {
    if (!(response && response.settings)) {
      showMessage('Unable to load ResistGate settings.', 'error');
      if (typeof callback === 'function') {
        callback(false);
      }
      return;
    }

    cachedSettings = response.settings;
    renderSettings();

    if (typeof callback === 'function') {
      callback(true);
    }
  });
}

function handleSettingsStorageChange(changes, namespace) {
  if (namespace !== 'local' || !changes?.settings?.newValue) {
    return;
  }

  const previousTier = cachedSettings?.subscription?.tier;
  cachedSettings = changes.settings.newValue;
  renderSettings();

  if (previousTier !== 'pro' && isProUser()) {
    showMessage('Pro is active. This browser synced automatically.', 'success');
  }

  if (queuedProScreen && isProUser()) {
    const target = queuedProScreen;
    queuedProScreen = null;
    handleTabRequest(target);
  }
}

function renderSettings() {
  if (!cachedSettings) {
    return;
  }

  const settings = cachedSettings;
  const blocklist = settings.blocklist || [];

  const accessWindowInput = document.getElementById('access-window-minutes');
  const minutes = settings.defaultAccessDuration
    || settings.challengeTypes?.typing?.duration
    || DEFAULT_ACCESS_WINDOW_MINUTES;

  accessWindowInput.value = minutes;
  setActiveChallengeLevel(getTypingChallengeLevel(settings));

  document.getElementById('manual-override-delay').value =
    settings.freeExperience?.manualOverrideDelaySeconds || DEFAULT_OVERRIDE_DELAY_SECONDS;

  renderScheduleInputs(settings.freeExperience?.schedule || {});
  renderPlanPill();
  renderSubscriptionStatus();
  loadBlockedSites(blocklist);
  renderProFeatureInputs();
  renderProAccessState();

  if (isProGatedTab(activeTab) && !isProUser()) {
    setActiveTab('general');
  }

  if (activeTab === 'analytics' && isProUser()) {
    loadAnalytics();
  }

  if (activeTab === 'report' && isProUser()) {
    loadWeeklyReport();
  }
}

function renderPlanPill() {
  const planPill = document.getElementById('plan-pill');
  const openPricingBtn = document.getElementById('open-pricing-btn');
  if (!planPill || !openPricingBtn) {
    return;
  }

  if (isProUser()) {
    planPill.textContent = 'Pro';
    planPill.classList.add('pro');
    openPricingBtn.style.display = 'none';
    return;
  }

  planPill.textContent = 'Free';
  planPill.classList.remove('pro');
  openPricingBtn.style.display = '';
  openPricingBtn.textContent = 'See Pro Plans';
}

function renderSubscriptionStatus() {
  const statusNode = document.getElementById('subscription-status');
  if (!statusNode || !cachedSettings) {
    return;
  }

  if (isProUser()) {
    statusNode.textContent = 'Pro is active.';
    return;
  }

  statusNode.textContent = 'Visit our pricing page to get Pro. After checkout, this browser activates automatically.';
}

function renderScheduleInputs(schedule) {
  const enabled = schedule.enabled === true;
  document.getElementById('schedule-enabled').checked = enabled;
  document.getElementById('schedule-start-time').value = schedule.startTime || '09:00';
  document.getElementById('schedule-end-time').value = schedule.endTime || '17:00';

  const selectedDays = new Set(Array.isArray(schedule.days) ? schedule.days.map(Number) : [1, 2, 3, 4, 5]);
  document.querySelectorAll('#schedule-days input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = selectedDays.has(Number(checkbox.value));
  });

  toggleScheduleConfig(enabled);
}

function toggleScheduleConfig(enabled) {
  const config = document.getElementById('schedule-config');
  if (!config) {
    return;
  }

  config.style.opacity = enabled ? '1' : '0.55';
}

function renderProFeatureInputs() {
  const proFeatures = cachedSettings?.proFeatures || {};
  const behavior = proFeatures.behavioralFriction || {};
  const preset = sanitizePreset(proFeatures.accountabilityPreset);
  const intentionPage = proFeatures.intentionPage || {};
  const commitmentMode = proFeatures.commitmentMode || {};

  document.getElementById('strict-mode-toggle').checked = proFeatures.strictModeEnabled === true;
  document.getElementById('strict-disable-delay-seconds').value =
    proFeatures.strictModeDisableDelaySeconds || DEFAULT_STRICT_DISABLE_DELAY_SECONDS;
  document.getElementById('behavioral-friction-enabled').checked = behavior.enabled === true;
  document.getElementById('require-task-intent').checked = behavior.requireTaskIntent !== false;
  document.getElementById('timed-wait-enabled').checked = behavior.timedWaitEnabled === true;
  document.getElementById('timed-wait-seconds').value = behavior.timedWaitSeconds || 20;
  document.getElementById('earn-access-enabled').checked = behavior.earnAccessEnabled !== false;
  document.getElementById('earn-access-min-seconds').value = behavior.earnAccessMinChallengeSeconds || 90;
  document.getElementById('custom-challenge-prompt').value = behavior.customChallengePrompt || '';
  setActivePresetButton(preset);

  // Intention Page
  document.getElementById('intention-page-enabled').checked = intentionPage.enabled === true;
  document.getElementById('breathing-exercise-enabled').checked = intentionPage.showBreathingExercise === true;

  // Commitment Mode
  document.getElementById('commitment-duration-hours').value = commitmentMode.durationHours || 2;
  renderCommitmentStatus();
}

function renderProAccessState() {
  const hasPro = isProUser();

  document.querySelectorAll('.tab-btn[data-pro-screen]').forEach((button) => {
    const requestedTab = button.getAttribute('data-tab');
    const isLocked = isProGatedTab(requestedTab) && !hasPro;
    button.classList.toggle('locked', isLocked);
    button.setAttribute('aria-disabled', String(isLocked));
  });

  const proPanel = document.getElementById('panel-pro');
  if (proPanel) {
    proPanel.toggleAttribute('inert', !hasPro);
    proPanel.setAttribute('aria-hidden', hasPro ? 'false' : 'true');
  }

  document.querySelectorAll('[data-pro-feature]').forEach((control) => {
    control.disabled = !hasPro;
  });
}

function formatCommitmentCountdown(remainingMs) {
  const totalSecs = Math.max(0, Math.ceil(remainingMs / 1000));
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function renderCommitmentStatus() {
  const statusEl = document.getElementById('commitment-status');
  const textEl = document.getElementById('commitment-active-text');
  const activateBtn = document.getElementById('activate-commitment-btn');
  if (!statusEl || !textEl || !activateBtn) {
    return;
  }

  // Always clear any existing countdown before starting a new one
  if (commitmentCountdownTimer !== null) {
    clearInterval(commitmentCountdownTimer);
    commitmentCountdownTimer = null;
  }

  chrome.runtime.sendMessage({ action: 'getCommitmentModeStatus' }, function (response) {
    if (response && response.success && response.status?.active && response.status.expiresAt) {
      const expiresAt = response.status.expiresAt;

      statusEl.classList.remove('hidden');
      activateBtn.disabled = true;
      activateBtn.textContent = 'Commitment Mode Active';

      function tickCountdown() {
        const remainingMs = expiresAt - Date.now();
        if (remainingMs <= 0) {
          clearInterval(commitmentCountdownTimer);
          commitmentCountdownTimer = null;
          textEl.textContent = 'Commitment Mode is active. 0m 00s remaining. All access is locked.';
          // Re-render after a brief delay to let the alarm handler clean up
          setTimeout(renderCommitmentStatus, 2000);
          return;
        }
        textEl.textContent =
          `Commitment Mode is active. ${formatCommitmentCountdown(remainingMs)} remaining. All access is locked.`;
      }

      tickCountdown();
      commitmentCountdownTimer = setInterval(tickCountdown, 1000);
    } else {
      statusEl.classList.add('hidden');
      activateBtn.disabled = !isProUser();
      activateBtn.textContent = isProUser() ? 'Activate Commitment Mode' : 'Upgrade to use Commitment Mode';
    }
  });
}

function handleTabRequest(requestedTab) {
  if (!requestedTab) {
    return;
  }

  if (isProGatedTab(requestedTab) && !isProUser()) {
    queuedProScreen = requestedTab;
    showPaywall(`tab-${requestedTab}`);
    return;
  }

  setActiveTab(requestedTab);

  if (requestedTab === 'analytics') {
    loadAnalytics();
  }

  if (requestedTab === 'report') {
    loadWeeklyReport();
  }
}

function setActiveTab(tabName) {
  activeTab = tabName;

  document.querySelectorAll('.tab-btn[data-tab]').forEach((button) => {
    const isActive = button.getAttribute('data-tab') === tabName;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${tabName}`);
  });
}

function isProGatedTab(tabName) {
  return tabName === 'analytics' || tabName === 'report' || tabName === 'pro';
}

function addBlockedSite() {
  const input = document.getElementById('new-blocked-site');
  const domain = normalizeDomainInput(input.value);

  if (!domain) {
    showMessage('Please enter a valid domain.', 'error');
    return;
  }

  withLatestSettings(function (settings) {
    settings.blocklist = settings.blocklist || [];

    if (settings.blocklist.some((site) => normalizeDomainInput(site.urlPattern) === domain)) {
      showMessage('Site already exists in ResistGate.', 'error');
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
        cachedSettings = settings;
        loadBlockedSites(settings.blocklist);
        showMessage('Site added to ResistGate.', 'success');
      } else {
        showMessage(updateResponse?.error || 'Unable to add site. Try again.', 'error');
      }
    });
  });
}

function loadBlockedSites(blocklist = []) {
  const listElement = document.getElementById('blocked-sites-list');
  listElement.innerHTML = '';

  if (blocklist.length === 0) {
    const noSitesItem = document.createElement('li');
    noSitesItem.className = 'message';
    noSitesItem.textContent = 'Add a site above to start blocking.';
    listElement.appendChild(noSitesItem);
    return;
  }

  blocklist.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'blocked-site-item';

    // Top row: domain + remove button
    const topRow = document.createElement('div');
    topRow.className = 'blocked-site-row';

    const siteDomain = document.createElement('span');
    siteDomain.className = 'site-domain';
    siteDomain.textContent = entry.urlPattern;
    siteDomain.setAttribute('title', entry.urlPattern);

    const removeButton = document.createElement('button');
    removeButton.className = 'btn btn-danger delete-btn';
    removeButton.setAttribute('data-id', entry.id);
    removeButton.textContent = 'Remove';

    topRow.appendChild(siteDomain);
    topRow.appendChild(removeButton);
    li.appendChild(topRow);

    // Temptation bundle config — badge injected into topRow, panel appended to li
    li.appendChild(buildBundleConfig(entry, topRow));

    // Personal goal config — badge injected into topRow, panel appended to li
    li.appendChild(buildPersonalGoalConfig(entry, topRow));

    listElement.appendChild(li);
  });

  document.querySelectorAll('.delete-btn[data-id]').forEach((button) => {
    button.addEventListener('click', function () {
      const id = this.getAttribute('data-id');
      removeBlockedSite(id);
    });
  });
}

function formatBundleBadge(bundle) {
  if (!bundle || bundle.enabled !== true) return '+ Earn access';
  if (bundle.conditionType === 'work_timer') {
    return `${bundle.requiredMinutes || 60} min focus`;
  }
  const [h, m] = (bundle.afterTime || '17:00').split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `After ${hour}:${String(m).padStart(2, '0')} ${period}`;
}

function buildBundleConfig(entry, topRow) {
  const bundle = entry.temptationBundle || {};
  const isEnabled = bundle.enabled === true;
  const conditionType = bundle.conditionType || 'time_of_day';
  const afterTime = bundle.afterTime || '17:00';
  const requiredMinutes = bundle.requiredMinutes || 60;

  // ── Badge in top row (always visible) ──────────────────────────
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = `bundle-badge ${isEnabled ? 'bundle-badge--on' : 'bundle-badge--off'}`;
  badge.setAttribute('title', isEnabled ? 'Edit earn-access rule' : 'Set an earn-access rule');
  badge.setAttribute('aria-expanded', 'false');

  const badgeText = document.createElement('span');
  badgeText.textContent = formatBundleBadge(isEnabled ? bundle : null);
  const badgeChevron = document.createElement('span');
  badgeChevron.className = 'bundle-badge-chevron';
  badgeChevron.textContent = '▼';
  badge.appendChild(badgeText);
  badge.appendChild(badgeChevron);
  topRow.insertBefore(badge, topRow.lastElementChild);

  // ── Config panel (expanded when enabled, collapsed otherwise) ──
  const configPanel = document.createElement('div');
  configPanel.className = 'bundle-config';
  configPanel.style.display = isEnabled ? 'grid' : 'none';
  badge.setAttribute('aria-expanded', String(isEnabled));

  badge.addEventListener('click', function () {
    const isOpen = configPanel.style.display !== 'none';
    configPanel.style.display = isOpen ? 'none' : 'grid';
    badge.setAttribute('aria-expanded', String(!isOpen));
  });

  // Helper text at top of panel
  const helpText = document.createElement('p');
  helpText.className = 'bundle-help-text';
  helpText.textContent = 'Instead of blocking, this site grants access only when your condition is met — so you decide intentionally.';

  // Enable/disable toggle inside the panel
  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'bundle-toggle-row';
  const toggleCheck = document.createElement('input');
  toggleCheck.type = 'checkbox';
  toggleCheck.checked = isEnabled;
  const toggleSpan = document.createElement('span');
  toggleSpan.textContent = 'Enable Earn Access for this site';
  toggleLabel.appendChild(toggleCheck);
  toggleLabel.appendChild(toggleSpan);

  // Condition builder row: type + time input
  const condRow = document.createElement('div');
  condRow.className = 'bundle-config-row';

  const typeWrapper = document.createElement('div');
  const typeLabel = document.createElement('label');
  typeLabel.textContent = 'Access condition';
  const typeSelect = document.createElement('select');
  typeSelect.innerHTML = `
    <option value="time_of_day">After a specific time (e.g., 5 PM)</option>
    <option value="work_timer">After focus time is earned</option>
  `;
  typeSelect.value = conditionType;
  typeWrapper.appendChild(typeLabel);
  typeWrapper.appendChild(typeSelect);

  const timeWrapper = document.createElement('div');
  const timeLabel = document.createElement('label');
  timeLabel.textContent = conditionType === 'work_timer' ? 'Focus minutes needed' : 'Access after';

  const timeInput = document.createElement('input');
  timeInput.type = conditionType === 'work_timer' ? 'number' : 'time';
  timeInput.min = conditionType === 'work_timer' ? '1' : undefined;
  timeInput.max = conditionType === 'work_timer' ? '480' : undefined;
  timeInput.value = conditionType === 'work_timer' ? String(requiredMinutes) : afterTime;

  typeSelect.addEventListener('change', function () {
    const isTimer = typeSelect.value === 'work_timer';
    timeLabel.textContent = isTimer ? 'Focus minutes needed' : 'Access after';
    timeInput.type = isTimer ? 'number' : 'time';
    timeInput.min = isTimer ? '1' : '';
    timeInput.max = isTimer ? '480' : '';
    timeInput.value = isTimer ? String(requiredMinutes) : afterTime;
  });

  timeWrapper.appendChild(timeLabel);
  timeWrapper.appendChild(timeInput);

  condRow.appendChild(typeWrapper);
  condRow.appendChild(timeWrapper);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary bundle-save-btn';
  saveBtn.textContent = 'Save rule';
  saveBtn.addEventListener('click', function () {
    const newBundle = {
      enabled: true,
      conditionType: typeSelect.value,
      afterTime: typeSelect.value === 'time_of_day' ? timeInput.value : (bundle.afterTime || '17:00'),
      requiredMinutes: typeSelect.value === 'work_timer'
        ? Math.max(1, parseInt(timeInput.value, 10) || 60)
        : (bundle.requiredMinutes || 60)
    };
    saveBundleForEntry(entry.id, newBundle);
    badge.className = 'bundle-badge bundle-badge--on';
    badgeText.textContent = formatBundleBadge(newBundle);

    // Show success feedback
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saved';
    saveBtn.classList.add('bundle-save-btn--saved');
    setTimeout(function () {
      saveBtn.textContent = originalText;
      saveBtn.classList.remove('bundle-save-btn--saved');
    }, 1500);
  });

  toggleCheck.addEventListener('change', function () {
    const showFields = toggleCheck.checked;
    condRow.style.display = showFields ? '' : 'none';
    saveBtn.style.display = showFields ? '' : 'none';
    if (!showFields) {
      badge.className = 'bundle-badge bundle-badge--off';
      badgeText.textContent = formatBundleBadge(null);
      saveBundleForEntry(entry.id, { enabled: false, conditionType, afterTime, requiredMinutes });
    }
  });

  // Hide condition fields initially if bundle is disabled
  if (!isEnabled) {
    condRow.style.display = 'none';
    saveBtn.style.display = 'none';
  }

  configPanel.appendChild(helpText);
  configPanel.appendChild(toggleLabel);
  configPanel.appendChild(condRow);
  configPanel.appendChild(saveBtn);

  return configPanel;
}

function saveBundleForEntry(entryId, bundle) {
  withLatestSettings(function (settings) {
    const entry = (settings.blocklist || []).find((e) => e.id === entryId);
    if (!entry) return;
    entry.temptationBundle = bundle;
    chrome.runtime.sendMessage({ action: 'updateSettings', settings }, function (response) {
      if (response && response.success) {
        cachedSettings = settings;
        showMessage('Earn Access rule saved.', 'success');
      } else {
        showMessage(response?.error || 'Unable to save condition.', 'error');
      }
    });
  });
}

function buildPersonalGoalConfig(entry, topRow) {
  const goal = entry.personalGoal || '';
  const hasGoal = goal.trim().length > 0;

  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = `bundle-badge ${hasGoal ? 'bundle-badge--on' : 'bundle-badge--off'}`;
  badge.setAttribute('data-pro-feature', 'intentionPage');
  badge.setAttribute('title', hasGoal ? 'Edit personal goal' : 'Set a personal goal');

  const badgeText = document.createElement('span');
  badgeText.textContent = hasGoal ? goal.slice(0, 25) + (goal.length > 25 ? '...' : '') : '+ Set goal';
  const badgeChevron = document.createElement('span');
  badgeChevron.className = 'bundle-badge-chevron';
  badgeChevron.textContent = '▼';
  badge.appendChild(badgeText);
  badge.appendChild(badgeChevron);
  topRow.insertBefore(badge, topRow.lastElementChild);

  const configPanel = document.createElement('div');
  configPanel.className = 'bundle-config';
  configPanel.style.display = 'none';

  badge.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!isProUser()) {
      showPaywall('intention-goal');
      return;
    }
    const isOpen = configPanel.style.display !== 'none';
    configPanel.style.display = isOpen ? 'none' : 'grid';
    badge.setAttribute('aria-expanded', String(!isOpen));
  });

  const goalLabel = document.createElement('label');
  goalLabel.textContent = 'Your goal for this site';
  goalLabel.className = 'bundle-goal-label';

  const goalInput = document.createElement('input');
  goalInput.type = 'text';
  goalInput.className = 'sub-field';
  goalInput.maxLength = 200;
  goalInput.value = goal;
  goalInput.placeholder = 'Example: Don\'t watch reels';

  const actions = document.createElement('div');
  actions.className = 'goal-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary bundle-save-btn';
  saveBtn.textContent = 'Save goal';
  saveBtn.addEventListener('click', function () {
    const newGoal = goalInput.value.trim().slice(0, 200);
    withLatestSettings(function (settings) {
      const blEntry = (settings.blocklist || []).find((e) => e.id === entry.id);
      if (!blEntry) return;
      if (newGoal) {
        blEntry.personalGoal = newGoal;
      } else {
        delete blEntry.personalGoal;
      }
      chrome.runtime.sendMessage({ action: 'updateSettings', settings: settings }, function (response) {
        if (response && response.success) {
          cachedSettings = settings;
          badgeText.textContent = newGoal ? newGoal.slice(0, 25) + (newGoal.length > 25 ? '...' : '') : '+ Set goal';
          badge.className = `bundle-badge ${newGoal ? 'bundle-badge--on' : 'bundle-badge--off'}`;
          badge.setAttribute('title', newGoal ? 'Edit personal goal' : 'Set a personal goal');
          configPanel.style.display = 'none';
          badge.setAttribute('aria-expanded', 'false');
          showMessage(newGoal ? 'Personal goal saved.' : 'Personal goal removed.', 'success');
          loadBlockedSites(settings.blocklist);
        } else {
          showMessage(response?.error || 'Unable to save goal.', 'error');
        }
      });
    });
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn-secondary';
  removeBtn.textContent = 'Remove';
  removeBtn.style.marginLeft = '8px';
  removeBtn.addEventListener('click', function () {
    goalInput.value = '';
    withLatestSettings(function (settings) {
      const blEntry = (settings.blocklist || []).find((e) => e.id === entry.id);
      if (blEntry) {
        delete blEntry.personalGoal;
      }
      chrome.runtime.sendMessage({ action: 'updateSettings', settings: settings }, function (response) {
        if (response && response.success) {
          cachedSettings = settings;
          configPanel.style.display = 'none';
          badge.setAttribute('aria-expanded', 'false');
          showMessage('Personal goal removed.', 'success');
          loadBlockedSites(settings.blocklist);
        } else {
          showMessage(response?.error || 'Unable to remove goal.', 'error');
        }
      });
    });
  });

  actions.appendChild(saveBtn);
  actions.appendChild(removeBtn);

  configPanel.appendChild(goalLabel);
  configPanel.appendChild(goalInput);
  configPanel.appendChild(actions);

  return configPanel;
}

function removeBlockedSite(id) {
  withLatestSettings(function (settings) {
    const removedEntry = (settings.blocklist || []).find((entry) => entry.id === id);
    settings.blocklist = (settings.blocklist || []).filter((entry) => entry.id !== id);

    chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: settings
    }, function (updateResponse) {
      if (updateResponse && updateResponse.success) {
        cachedSettings = settings;
        loadBlockedSites(settings.blocklist);
        showUndoToast(
          `${removedEntry ? removedEntry.urlPattern : 'Site'} removed.`,
          removedEntry ? function () { undoRemoveBlockedSite(removedEntry); } : null
        );
      } else {
        showMessage(updateResponse?.error || 'Unable to remove site. Try again.', 'error');
      }
    });
  });
}

function undoRemoveBlockedSite(entry) {
  withLatestSettings(function (settings) {
    settings.blocklist = settings.blocklist || [];
    settings.blocklist.push(entry);
    chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: settings
    }, function (updateResponse) {
      if (updateResponse && updateResponse.success) {
        cachedSettings = settings;
        loadBlockedSites(settings.blocklist);
        showMessage(`${entry.urlPattern} restored.`, 'success');
      } else {
        showMessage('Unable to restore site. Try again.', 'error');
      }
    });
  });
}

function showUndoToast(text, onUndo) {
  const existingBanner = document.querySelector('.message.banner');
  if (existingBanner) existingBanner.remove();

  const messageDiv = document.createElement('div');
  messageDiv.className = 'message banner success';

  const textSpan = document.createElement('span');
  textSpan.textContent = text;
  messageDiv.appendChild(textSpan);

  if (typeof onUndo === 'function') {
    const undoBtn = document.createElement('button');
    undoBtn.className = 'undo-btn';
    undoBtn.textContent = 'Undo';
    undoBtn.addEventListener('click', function () {
      messageDiv.remove();
      onUndo();
    });
    messageDiv.appendChild(undoBtn);
  }

  document.querySelector('.container').appendChild(messageDiv);

  const announcement = document.getElementById('status-announcement');
  if (announcement) {
    announcement.textContent = '';
    setTimeout(function () { announcement.textContent = text; }, 50);
  }

  setTimeout(function () {
    if (messageDiv.parentNode) messageDiv.remove();
  }, 5000);
}

function saveSettings() {
  withLatestSettings(function (settings) {
    const accessMinutes = getAccessWindowMinutes(settings);
    const manualDelay = getManualOverrideDelay();

    settings.defaultAccessDuration = accessMinutes;
    settings.challengeTypes = settings.challengeTypes || {};
    settings.challengeTypes.typing = settings.challengeTypes.typing || {};
    const challengeLevel = getSelectedChallengeLevel();
    settings.challengeTypes.typing.difficulty = CHALLENGE_LEVEL_DIFFICULTY[challengeLevel];
    settings.challengeTypes.typing.level = challengeLevel;
    settings.challengeTypes.typing.duration = accessMinutes;

    settings.freeExperience = settings.freeExperience || {};
    settings.freeExperience.manualOverrideDelaySeconds = manualDelay;
    settings.freeExperience.schedule = {
      enabled: document.getElementById('schedule-enabled').checked,
      days: getSelectedScheduleDays(),
      startTime: document.getElementById('schedule-start-time').value || '09:00',
      endTime: document.getElementById('schedule-end-time').value || '17:00'
    };

    if (isProUser()) {
      settings.proFeatures = settings.proFeatures || {};
      settings.proFeatures.accountabilityPreset = getSelectedPreset();
      settings.proFeatures.strictModeEnabled = document.getElementById('strict-mode-toggle').checked;
      settings.proFeatures.strictModeDisableDelaySeconds = getStrictDisableDelay();

      settings.proFeatures.behavioralFriction = settings.proFeatures.behavioralFriction || {};
      settings.proFeatures.behavioralFriction.enabled = document.getElementById('behavioral-friction-enabled').checked;
      settings.proFeatures.behavioralFriction.requireTaskIntent = document.getElementById('require-task-intent').checked;
      settings.proFeatures.behavioralFriction.timedWaitEnabled = document.getElementById('timed-wait-enabled').checked;
      settings.proFeatures.behavioralFriction.timedWaitSeconds = parseInt(document.getElementById('timed-wait-seconds').value, 10) || 20;
      settings.proFeatures.behavioralFriction.earnAccessEnabled = document.getElementById('earn-access-enabled').checked;
      settings.proFeatures.behavioralFriction.earnAccessMinChallengeSeconds = getEarnAccessMinChallengeSeconds();
      settings.proFeatures.behavioralFriction.customChallengePrompt = document.getElementById('custom-challenge-prompt').value.trim();

      settings.proFeatures.intentionPage = settings.proFeatures.intentionPage || {};
      settings.proFeatures.intentionPage.enabled = document.getElementById('intention-page-enabled').checked;
      settings.proFeatures.intentionPage.showBreathingExercise = document.getElementById('breathing-exercise-enabled').checked;
    }

    chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: settings
    }, function (saveResponse) {
      if (saveResponse && saveResponse.success) {
        cachedSettings = settings;
        renderSettings();
        showMessage('ResistGate settings saved.', 'success');
      } else if (saveResponse?.cooldownPending) {
        loadSettings();
        showMessage(saveResponse.error || 'Strict Mode is still counting down — try again in a moment.', 'info');
      } else {
        showMessage(saveResponse?.error || 'Unable to save settings. Try again.', 'error');
      }
    });
  });
}

function loadAnalytics() {
  chrome.runtime.sendMessage({ action: 'getAnalyticsDashboard' }, function (response) {
    if (!(response && response.success && response.dashboard)) {
      if (response?.proRequired) {
        showPaywall('analytics-load');
      } else {
        showMessage(response?.error || 'Unable to load analytics.', 'error');
      }
      return;
    }

    renderAnalyticsDashboard(response.dashboard);
  });
}

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatDayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
}

function renderDomainBars(container, entries) {
  container.innerHTML = '';
  if (!entries.length) {
    const p = document.createElement('p');
    p.className = 'empty-hint';
    p.textContent = 'No blocked-site visits yet. Add sites to your blocklist to start seeing data here.';
    container.appendChild(p);
    return;
  }
  const maxCount = Math.max(...entries.map((e) => Number(e.count)));
  entries.forEach((entry, i) => {
    const count = Number(entry.count);
    const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;

    const row = document.createElement('div');
    row.className = 'domain-bar-row';

    const name = document.createElement('span');
    name.className = 'domain-bar-name';
    name.textContent = entry.domain;
    name.title = entry.domain;

    const track = document.createElement('div');
    track.className = 'domain-bar-track';

    const fill = document.createElement('div');
    fill.className = 'domain-bar-fill';
    fill.style.setProperty('--fill-pct', `${pct}%`);
    fill.style.animationDelay = `${i * 0.07}s`;
    track.appendChild(fill);

    const countEl = document.createElement('span');
    countEl.className = 'domain-bar-count';
    countEl.textContent = pluralize(count, 'block', 'blocks');

    row.appendChild(name);
    row.appendChild(track);
    row.appendChild(countEl);
    container.appendChild(row);
  });
}

function renderTrendChart(container, points) {
  container.innerHTML = '';
  if (!points.length) {
    const p = document.createElement('p');
    p.className = 'empty-hint';
    p.textContent = 'No override activity recorded yet.';
    container.appendChild(p);
    return;
  }
  const maxCount = Math.max(...points.map((p) => Number(p.count)), 1);
  const BAR_MAX_HEIGHT = 72;

  const barsEl = document.createElement('div');
  barsEl.className = 'trend-bars';
  barsEl.setAttribute('role', 'img');
  barsEl.setAttribute('aria-label', 'Override frequency over the last 7 days');

  points.forEach((point, i) => {
    const count = Number(point.count);
    const barHeight = count === 0 ? 4 : Math.max(8, Math.round((count / maxCount) * BAR_MAX_HEIGHT));
    const intensity = count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : 4;

    const col = document.createElement('div');
    col.className = 'trend-bar-col';

    const countLabel = document.createElement('span');
    countLabel.className = 'trend-count';
    countLabel.textContent = count > 0 ? String(count) : '';

    const track = document.createElement('div');
    track.className = 'trend-bar-track';

    const bar = document.createElement('div');
    bar.className = 'trend-bar';
    bar.style.height = `${barHeight}px`;
    bar.dataset.intensity = intensity;
    bar.style.animationDelay = `${i * 0.06}s`;
    bar.setAttribute('aria-label', `${formatDayLabel(point.date)}: ${pluralize(count, 'override', 'overrides')}`);
    track.appendChild(bar);

    const dayLabel = document.createElement('span');
    dayLabel.className = 'trend-day';
    dayLabel.textContent = formatDayLabel(point.date);

    col.appendChild(countLabel);
    col.appendChild(track);
    col.appendChild(dayLabel);
    barsEl.appendChild(col);
  });

  container.appendChild(barsEl);
}

function renderAnalyticsDashboard(dashboard) {
  const blockedAttempts = Number(dashboard?.totals?.blockedAttempts) || 0;
  const overrides = Number(dashboard?.totals?.overrides) || 0;
  const strictMinutes = Number(dashboard?.totals?.strictSessionMinutes) || 0;

  document.getElementById('blocked-attempts-value').textContent = `${blockedAttempts}`;
  document.getElementById('overrides-value').textContent = `${overrides}`;
  document.getElementById('strict-session-minutes-value').textContent = `${strictMinutes} min`;
  document.getElementById('analytics-period-value').textContent = dashboard.periodLabel || '--';
  document.getElementById('blocked-attempts-insight').textContent = getBlockedAttemptsInsight(blockedAttempts);
  document.getElementById('overrides-insight').textContent = getOverridesInsight(overrides);
  document.getElementById('strict-session-insight').textContent = getStrictSessionInsight(strictMinutes);

  const overridesCard = document.getElementById('metric-card-overrides');
  if (overridesCard) {
    overridesCard.classList.remove('state-warn', 'state-ok');
    if (overrides >= 8) overridesCard.classList.add('state-warn');
    else if (overrides <= 2) overridesCard.classList.add('state-ok');
  }

  const strictCard = document.getElementById('metric-card-strict');
  if (strictCard) {
    strictCard.classList.remove('state-warn', 'state-ok');
    if (strictMinutes >= 60) strictCard.classList.add('state-ok');
  }

  renderDomainBars(
    document.getElementById('top-blocked-domains-list'),
    dashboard.topBlockedDomains || []
  );
  renderTrendChart(
    document.getElementById('override-trend-list'),
    dashboard.overrideFrequencyTrend || []
  );
}

function getBlockedAttemptsInsight(value) {
  if (value >= 50) {
    return 'Very high pressure. Consider strengthening your friction settings.';
  }
  if (value >= 25) {
    return 'High distraction pressure — your blocker is working hard.';
  }
  if (value >= 10) {
    return 'Solid resistance. The friction is doing its job.';
  }
  if (value >= 1) {
    return 'Focused week. Distractions stayed at bay.';
  }
  return 'No interruptions. Your focus game is strong.';
}

function getOverridesInsight(value) {
  if (value >= 15) {
    return 'Frequent overrides. Time to revisit your settings or blocklist.';
  }
  if (value >= 8) {
    return 'More overrides than ideal. What patterns do you notice?';
  }
  if (value >= 3) {
    return 'Some overrides — within normal range for learning.';
  }
  if (value >= 1) {
    return 'Minimal overrides. Strong self-regulation.';
  }
  return 'Perfect week — no overrides needed.';
}

function getStrictSessionInsight(value) {
  if (value >= 300) {
    return 'Exceptional. Over 5 hours of protected focus time.';
  }
  if (value >= 180) {
    return 'Strong commitment. 3+ hours of deep work.';
  }
  if (value >= 60) {
    return 'Building the habit. Aim for longer sessions next week.';
  }
  if (value >= 1) {
    return 'Good start. Consider scheduling longer blocks.';
  }
  return 'No strict sessions yet — try enabling schedule-based blocking.';
}

function loadWeeklyReport() {
  chrome.runtime.sendMessage({ action: 'getWeeklyReport' }, function (response) {
    if (!(response && response.success && response.report)) {
      if (response?.proRequired) {
        showPaywall('weekly-report-load');
      } else {
        showMessage(response?.error || 'Unable to load weekly report.', 'error');
      }
      return;
    }

    renderWeeklyReport(response.report);
  });
}

function renderWeeklyReport(report) {
  document.getElementById('weekly-report-period').textContent = report.periodLabel || '--';
  document.getElementById('weekly-focus-score-value').textContent =
    Number.isFinite(Number(report.focusScore)) ? `${report.focusScore}/100` : '--';

  const overridesCount = Number.isFinite(Number(report.overridesThisWeek))
    ? Number(report.overridesThisWeek)
    : null;
  document.getElementById('weekly-overrides-value').textContent =
    overridesCount !== null ? `${overridesCount}` : '--';

  const trendNum = Number(report.trendVsLastWeek);
  document.getElementById('weekly-trend-value').textContent =
    Number.isFinite(trendNum)
      ? `${trendNum > 0 ? '+' : ''}${trendNum}`
      : '--';

  document.getElementById('weekly-feedback-line').textContent = report.feedbackLine || '--';

  const weeklyOverridesCard = document.getElementById('metric-card-weekly-overrides');
  if (weeklyOverridesCard && overridesCount !== null) {
    weeklyOverridesCard.classList.remove('state-warn', 'state-ok');
    if (overridesCount >= 8) weeklyOverridesCard.classList.add('state-warn');
    else if (overridesCount <= 2) weeklyOverridesCard.classList.add('state-ok');
  }

  const trendCard = document.getElementById('metric-card-weekly-trend');
  if (trendCard && Number.isFinite(trendNum)) {
    trendCard.classList.remove('state-warn', 'state-ok');
    if (trendNum < 0) trendCard.classList.add('state-ok');
    else if (trendNum > 3) trendCard.classList.add('state-warn');
  }

  renderDomainBars(
    document.getElementById('weekly-top-domains'),
    report.topDistractionDomains || []
  );

  const highlightsList = document.getElementById('weekly-report-highlights');
  const riskList = document.getElementById('weekly-report-risks');
  highlightsList.innerHTML = '';
  riskList.innerHTML = '';

  (report.highlights || []).forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    highlightsList.appendChild(li);
  });

  if (!report.risks || !report.risks.length) {
    const li = document.createElement('li');
    li.textContent = 'No significant risks this week. Keep going.';
    riskList.appendChild(li);
    return;
  }

  report.risks.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    riskList.appendChild(li);
  });
}

function showPaywall(source) {
  _paywallReturnFocus = document.activeElement;
  const modal = document.getElementById('paywall-modal');
  modal.dataset.source = source || 'unknown';
  modal.classList.remove('hidden');
  // Focus the first interactive element in the modal
  const firstFocusable = modal.querySelector('input, button, [href], select, textarea, [tabindex]:not([tabindex="-1"])');
  if (firstFocusable) {
    firstFocusable.focus();
  }
  _attachModalFocusTrap(modal);
}

function hidePaywall() {
  const modal = document.getElementById('paywall-modal');
  _detachModalFocusTrap(modal);
  modal.classList.add('hidden');
  const emailInput = document.getElementById('paywall-email');
  const emailError = document.getElementById('paywall-email-error');
  if (emailInput) emailInput.value = '';
  if (emailError) emailError.classList.add('hidden');
  // Restore focus to the element that opened the modal
  if (_paywallReturnFocus && typeof _paywallReturnFocus.focus === 'function') {
    _paywallReturnFocus.focus();
  }
  _paywallReturnFocus = null;
}

function _attachModalFocusTrap(modal) {
  const focusableSelectors = 'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])';
  function getFocusable() {
    return Array.from(modal.querySelectorAll(focusableSelectors));
  }

  function handler(e) {
    if (e.key === 'Escape') {
      hidePaywall();
      return;
    }
    if (e.key === 'Tab') {
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  modal._focusTrapHandler = handler;
  modal.addEventListener('keydown', handler);
}

function _detachModalFocusTrap(modal) {
  if (modal._focusTrapHandler) {
    modal.removeEventListener('keydown', modal._focusTrapHandler);
    modal._focusTrapHandler = null;
  }
}

function getPaywallEmail() {
  const input = document.getElementById('paywall-email');
  return input ? input.value.trim() : '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function openPricingPage(email) {
  const message = { action: 'openPricingPage' };
  if (email) {
    message.email = email;
  }
  chrome.runtime.sendMessage(message, function (response) {
    if (!(response && response.success)) {
      showMessage(response?.error || 'Unable to open pricing right now.', 'error');
      return;
    }

    showMessage('Pricing opened in a new tab. Complete checkout and Pro activates here automatically.', 'success');
  });
}

function getSelectedScheduleDays() {
  const selected = [];
  document.querySelectorAll('#schedule-days input[type="checkbox"]').forEach((checkbox) => {
    if (checkbox.checked) {
      selected.push(Number(checkbox.value));
    }
  });

  return selected.length ? selected : [1, 2, 3, 4, 5];
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

function getManualOverrideDelay() {
  const input = document.getElementById('manual-override-delay');
  const parsed = parseInt(input.value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_OVERRIDE_DELAY_SECONDS;
  }

  return Math.max(10, Math.min(15, parsed));
}

function getStrictDisableDelay() {
  const input = document.getElementById('strict-disable-delay-seconds');
  const parsed = parseInt(input.value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_STRICT_DISABLE_DELAY_SECONDS;
  }

  return Math.max(10, Math.min(300, parsed));
}

function getEarnAccessMinChallengeSeconds() {
  const input = document.getElementById('earn-access-min-seconds');
  const parsed = parseInt(input.value, 10);
  if (!Number.isFinite(parsed)) {
    return 90;
  }

  return Math.max(30, Math.min(900, parsed));
}

function sanitizeChallengeLevel(level) {
  if (level === 'easy' || level === 'moderate' || level === 'hard') {
    return level;
  }
  return DEFAULT_CHALLENGE_LEVEL;
}

function getTypingChallengeLevel(settings) {
  const typing = settings?.challengeTypes?.typing || {};
  if (typing.level === 'easy' || typing.level === 'moderate' || typing.level === 'hard') {
    return typing.level;
  }

  if (Number(typing.difficulty) === 1) {
    return 'easy';
  }
  if (Number(typing.difficulty) === 2) {
    return 'moderate';
  }
  return DEFAULT_CHALLENGE_LEVEL;
}

function getSelectedChallengeLevel() {
  const active = document.querySelector('[data-challenge-level].active');
  return sanitizeChallengeLevel(active?.getAttribute('data-challenge-level'));
}

function setActiveChallengeLevel(level) {
  const selected = sanitizeChallengeLevel(level);
  document.querySelectorAll('[data-challenge-level]').forEach((button) => {
    const isActive = button.getAttribute('data-challenge-level') === selected;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-checked', String(isActive));
  });
}

function sanitizePreset(value) {
  if (value === 'light' || value === 'strict') {
    return value;
  }
  return DEFAULT_PRO_PRESET;
}

function getSelectedPreset() {
  const active = document.querySelector('[data-pro-preset].active');
  return sanitizePreset(active?.getAttribute('data-pro-preset'));
}

function setActivePresetButton(preset) {
  document.querySelectorAll('[data-pro-preset]').forEach((button) => {
    button.classList.toggle('active', button.getAttribute('data-pro-preset') === preset);
  });
}

function applyPresetToInputs(preset) {
  const values = PRO_PRESET_VALUES[sanitizePreset(preset)];
  if (!values) {
    return;
  }

  document.getElementById('strict-mode-toggle').checked = values.strictModeEnabled;
  document.getElementById('strict-disable-delay-seconds').value = values.strictModeDisableDelaySeconds;
  document.getElementById('behavioral-friction-enabled').checked = values.behavioralFriction.enabled;
  document.getElementById('require-task-intent').checked = values.behavioralFriction.requireTaskIntent;
  document.getElementById('timed-wait-enabled').checked = values.behavioralFriction.timedWaitEnabled;
  document.getElementById('timed-wait-seconds').value = values.behavioralFriction.timedWaitSeconds;
  document.getElementById('earn-access-enabled').checked = values.behavioralFriction.earnAccessEnabled;
  document.getElementById('earn-access-min-seconds').value =
    values.behavioralFriction.earnAccessMinChallengeSeconds;
}

if (typeof globalThis !== 'undefined') {
  globalThis.__RESISTGATE_OPTIONS_TEST_HOOKS__ = {
    getBlockedAttemptsInsight,
    getOverridesInsight,
    getStrictSessionInsight,
    sanitizeChallengeLevel,
    getTypingChallengeLevel,
    sanitizePreset,
    getEarnAccessMinChallengeSeconds,
    isProGatedTab
  };
}

function initDetailsAnimation() {
  document.querySelectorAll('details.advanced-tuning').forEach(function (details) {
    const body = details.querySelector('.tuning-body');
    if (!body) return;

    // Manage inert for keyboard-accessibility of collapsed content
    if (!details.open) {
      body.setAttribute('inert', '');
    }

    details.addEventListener('toggle', function () {
      if (details.open) {
        body.removeAttribute('inert');
      } else {
        body.setAttribute('inert', '');
      }
    });
  });
}

function isProUser() {
  return cachedSettings?.subscription?.tier === 'pro';
}

function withLatestSettings(onSuccess) {
  chrome.runtime.sendMessage({ action: 'getSettings' }, function (response) {
    if (!(response && response.settings)) {
      showMessage('Unable to load ResistGate settings.', 'error');
      return;
    }

    onSuccess(response.settings);
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

function showMessage(text, type = 'info') {
  const existingMessage = document.querySelector('.message.banner');
  if (existingMessage) {
    existingMessage.remove();
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `message banner ${type}`;
  messageDiv.textContent = text;

  document.querySelector('.container').appendChild(messageDiv);

  // Announce to screen readers via aria-live region
  const announcement = document.getElementById('status-announcement');
  if (announcement) {
    announcement.textContent = '';
    // Brief timeout ensures the change is detected by assistive technology
    setTimeout(() => { announcement.textContent = text; }, 50);
  }

  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.remove();
    }
  }, 3200);
}
