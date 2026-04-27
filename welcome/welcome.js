// ResistGate Welcome Page

document.addEventListener('DOMContentLoaded', () => {
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
