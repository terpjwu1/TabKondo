document.getElementById('saveToken').addEventListener('click', () => {
  const token = document.getElementById('tokenInput').value.trim();
  chrome.storage.local.set({ readwiseToken: token }, () => {
    alert('Token saved successfully!');
  });
});

// In options.js
chrome.storage.local.get(['lastError'], (result) => {
  if (result.lastError) {
    document.getElementById('errorLog').textContent = result.lastError;
  }
});
