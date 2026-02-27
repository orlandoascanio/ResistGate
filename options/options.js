// Options Page Script
const DEFAULT_ACCESS_WINDOW_MINUTES = 15;
const DEFAULT_OVERRIDE_DELAY_SECONDS = 12;
const DEFAULT_STRICT_DISABLE_DELAY_SECONDS = 30;
const DEFAULT_PRO_PRESET = 'balanced';

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

document.addEventListener('DOMContentLoaded', function () {
  const newBlockedSiteInput = document.getElementById('new-blocked-site');
  const addSiteBtn = document.getElementById('add-site-btn');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const scheduleEnabledToggle = document.getElementById('schedule-enabled');

  addSiteBtn.addEventListener('click', addBlockedSite);
  newBlockedSiteInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      addBlockedSite();
    }
  });

  saveSettingsBtn.addEventListener('click', saveSettings);
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
    showPricingScreen();
  });

  document.getElementById('view-pricing-btn').addEventListener('click', function () {
    hidePaywall();
    showPricingScreen();
  });

  document.getElementById('close-paywall-btn').addEventListener('click', hidePaywall);
  document.getElementById('close-pricing-btn').addEventListener('click', hidePricingScreen);

  document.getElementById('start-yearly-btn').addEventListener('click', function () {
    activateProPlan('yearly');
  });

  document.getElementById('start-monthly-btn').addEventListener('click', function () {
    activateProPlan('monthly');
  });

  loadSettings();
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

  document.getElementById('manual-override-delay').value =
    settings.freeExperience?.manualOverrideDelaySeconds || DEFAULT_OVERRIDE_DELAY_SECONDS;

  renderScheduleInputs(settings.freeExperience?.schedule || {});
  renderPlanPill();
  loadBlockedSites(blocklist);
  renderProFeatureInputs();

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
    const cycleLabel = cachedSettings.subscription?.billingCycle === 'monthly' ? 'Monthly' : 'Yearly';
    planPill.textContent = `Pro ${cycleLabel}`;
    planPill.classList.add('pro');
    openPricingBtn.textContent = 'Manage Pro';
    return;
  }

  planPill.textContent = 'Free';
  planPill.classList.remove('pro');
  openPricingBtn.textContent = 'See Pro Plans';
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
}

function handleTabRequest(requestedTab) {
  if (!requestedTab) {
    return;
  }

  if (requestedTab !== 'general' && !isProUser()) {
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
    button.classList.toggle('active', button.getAttribute('data-tab') === tabName);
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${tabName}`);
  });
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
    noSitesItem.textContent = 'No sites in ResistGate yet';
    listElement.appendChild(noSitesItem);
    return;
  }

  blocklist.forEach((entry) => {
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

  document.querySelectorAll('.delete-btn[data-id]').forEach((button) => {
    button.addEventListener('click', function () {
      const id = this.getAttribute('data-id');
      removeBlockedSite(id);
    });
  });
}

function removeBlockedSite(id) {
  withLatestSettings(function (settings) {
    settings.blocklist = (settings.blocklist || []).filter((entry) => entry.id !== id);

    chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: settings
    }, function (updateResponse) {
      if (updateResponse && updateResponse.success) {
        cachedSettings = settings;
        loadBlockedSites(settings.blocklist);
        showMessage('Site removed from ResistGate.', 'success');
      } else {
        showMessage(updateResponse?.error || 'Unable to remove site. Try again.', 'error');
      }
    });
  });
}

function saveSettings() {
  withLatestSettings(function (settings) {
    const accessMinutes = getAccessWindowMinutes(settings);
    const manualDelay = getManualOverrideDelay();

    settings.defaultAccessDuration = accessMinutes;
    settings.challengeTypes = settings.challengeTypes || {};
    settings.challengeTypes.typing = settings.challengeTypes.typing || {};
    settings.challengeTypes.typing.difficulty = settings.challengeTypes.typing.difficulty || 3;
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
        showMessage(saveResponse.error || 'Strict Mode disable is cooling down.', 'info');
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

function renderAnalyticsDashboard(dashboard) {
  const blockedAttempts = Number(dashboard?.totals?.blockedAttempts) || 0;
  const overrides = Number(dashboard?.totals?.overrides) || 0;
  const strictMinutes = Number(dashboard?.totals?.strictSessionMinutes) || 0;

  document.getElementById('blocked-attempts-value').textContent = `${blockedAttempts}`;
  document.getElementById('overrides-value').textContent = `${overrides}`;
  document.getElementById('strict-session-minutes-value').textContent =
    `${strictMinutes} min`;
  document.getElementById('analytics-period-value').textContent = dashboard.periodLabel || '--';
  document.getElementById('blocked-attempts-insight').textContent = getBlockedAttemptsInsight(blockedAttempts);
  document.getElementById('overrides-insight').textContent = getOverridesInsight(overrides);
  document.getElementById('strict-session-insight').textContent = getStrictSessionInsight(strictMinutes);

  const domainList = document.getElementById('top-blocked-domains-list');
  domainList.innerHTML = '';

  if (!dashboard.topBlockedDomains.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No blocked domain attempts in this period.';
    domainList.appendChild(empty);
  } else {
    dashboard.topBlockedDomains.forEach((entry) => {
      const li = document.createElement('li');
      li.textContent = `${entry.domain}: ${entry.count} block(s)`;
      domainList.appendChild(li);
    });
  }

  const trendList = document.getElementById('override-trend-list');
  trendList.innerHTML = '';
  if (!dashboard.overrideFrequencyTrend.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No override trend data available.';
    trendList.appendChild(empty);
    return;
  }

  dashboard.overrideFrequencyTrend.forEach((point) => {
    const li = document.createElement('li');
    li.textContent = `${point.date}: ${point.count} override(s)`;
    trendList.appendChild(li);
  });
}

function getBlockedAttemptsInsight(value) {
  if (value >= 25) {
    return 'High distraction pressure.';
  }
  if (value >= 10) {
    return 'You faced many distractions.';
  }
  if (value >= 1) {
    return 'You handled distractions well.';
  }
  return 'Great control this week.';
}

function getOverridesInsight(value) {
  if (value >= 8) {
    return 'Room to improve.';
  }
  if (value >= 3) {
    return 'Try fewer manual unlocks.';
  }
  if (value >= 1) {
    return 'Good self-control overall.';
  }
  return 'Excellent discipline this week.';
}

function getStrictSessionInsight(value) {
  if (value >= 180) {
    return 'Great time spent in strict mode.';
  }
  if (value >= 60) {
    return 'Good progress this week.';
  }
  if (value >= 1) {
    return 'Try longer strict sessions.';
  }
  return 'No strict sessions logged yet.';
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
  document.getElementById('weekly-overrides-value').textContent =
    Number.isFinite(Number(report.overridesThisWeek)) ? `${report.overridesThisWeek}` : '--';
  document.getElementById('weekly-trend-value').textContent =
    Number.isFinite(Number(report.trendVsLastWeek))
      ? `${report.trendVsLastWeek > 0 ? '+' : ''}${report.trendVsLastWeek}`
      : '--';
  document.getElementById('weekly-feedback-line').textContent = report.feedbackLine || '--';

  const topDomainsList = document.getElementById('weekly-top-domains');
  topDomainsList.innerHTML = '';
  (report.topDistractionDomains || []).forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = `${entry.domain}: ${entry.count} block(s)`;
    topDomainsList.appendChild(li);
  });

  if (!(report.topDistractionDomains || []).length) {
    const li = document.createElement('li');
    li.textContent = 'No blocked-domain activity this week.';
    topDomainsList.appendChild(li);
  }

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
    li.textContent = 'No big issues this week. Keep going.';
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
  const modal = document.getElementById('paywall-modal');
  modal.dataset.source = source || 'unknown';
  modal.classList.remove('hidden');
}

function hidePaywall() {
  document.getElementById('paywall-modal').classList.add('hidden');
}

function showPricingScreen() {
  hidePaywall();
  document.getElementById('pricing-screen').classList.remove('hidden');
}

function hidePricingScreen() {
  document.getElementById('pricing-screen').classList.add('hidden');
}

function activateProPlan(cycle) {
  chrome.runtime.sendMessage({ action: 'activateProPlan', billingCycle: cycle }, function (response) {
    if (!(response && response.success)) {
      showMessage(response?.error || 'Unable to start Pro. Try again.', 'error');
      return;
    }

    hidePricingScreen();
    hidePaywall();

    loadSettings(function (loaded) {
      if (!loaded) {
        return;
      }

      showMessage(`Pro ${cycle === 'monthly' ? 'Monthly' : 'Yearly'} is active.`, 'success');

      if (queuedProScreen) {
        const target = queuedProScreen;
        queuedProScreen = null;
        handleTabRequest(target);
      }
    });
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
    sanitizePreset,
    getEarnAccessMinChallengeSeconds
  };
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

  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.remove();
    }
  }, 3200);
}
