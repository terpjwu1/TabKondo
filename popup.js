// popup.js - Updated Version
const button = document.getElementById('saveAll');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');

// Configure accessibility
progressBar.setAttribute('role', 'progressbar');
progressBar.setAttribute('aria-valuemin', '0');
progressBar.setAttribute('aria-valuemax', '100');
button.setAttribute('aria-busy', 'false');

// Handle cross-platform pointer events
button.addEventListener('pointerdown', handleAction);

function handleAction(e) {
  if (e.pointerType === 'touch') e.preventDefault();
  button.setAttribute('aria-busy', 'true');
  
  chrome.storage.local.get(['readwiseToken'], (result) => {
    if (!result.readwiseToken) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'API Key Required',
        message: 'Please configure your Readwise API key in extension options.'
      });
      button.setAttribute('aria-busy', 'false');
      return;
    }

    initProgress();
    chrome.runtime.sendMessage({ action: "saveTabs" });
  });
}

function initProgress() {
  progressBar.style.width = '0%';
  progressContainer.style.display = 'block';
  progressBar.setAttribute('aria-valuenow', '0');
}

// Listen for background updates
chrome.runtime.onMessage.addListener((message) => {
  switch(message.type) {
    case 'progress':
      updateProgress(message.percent);
      break;
    case 'complete':
      handleCompletion(message.successCount, message.failCount);
      break;
    case 'error':
      handleError(message.error);
      break;
  }
});

function updateProgress(percent) {
  requestAnimationFrame(() => {
    progressBar.style.width = `${percent}%`;
    progressBar.setAttribute('aria-valuenow', percent);
  });
}

function handleCompletion(success, failed) {
  button.setAttribute('aria-busy', 'false');
  progressContainer.style.display = 'none';
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon48.png',
    title: 'Process Complete',
    message: `Saved: ${success}, Failed: ${failed}`
  });
}

function handleError(error) {
  console.error('Error:', error);
  button.setAttribute('aria-busy', 'false');
  progressContainer.style.display = 'none';
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon48.png',
    title: 'Processing Error',
    message: error.substring(0, 150) // Trim long errors
  });
}

// Cleanup on popup close
window.addEventListener('blur', () => {
  progressContainer.style.display = 'none';
  button.setAttribute('aria-busy', 'false');
});
