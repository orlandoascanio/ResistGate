// ResistGate Welcome Page

document.addEventListener('DOMContentLoaded', () => {
  chrome.runtime.sendMessage({
    action: 'recordAnalyticsEvent',
    type: 'onboarding_start',
    domain: 'welcome'
  });

  const openOptionsBtn = document.getElementById('open-options-btn');
  const closeWelcomeBtn = document.getElementById('close-welcome-btn');

  if (openOptionsBtn) {
    openOptionsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });
  }

  if (closeWelcomeBtn) {
    closeWelcomeBtn.addEventListener('click', () => {
      window.close();
    });
  }
});
