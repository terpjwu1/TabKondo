document.getElementById('saveAll').addEventListener('click', () => {
  // Check for stored API token before starting progress bar animation
  chrome.storage.local.get(['readwiseToken'], (result) => {
    const apiToken = result.readwiseToken;
    if (!apiToken) {
      alert('Missing Readwise API key. Please right-click on the extension, go to Options, and input your API key.');
      return; // Do not trigger progress bar or send message if token is missing
    }
    
    // Token exists? Show progress bar and initiate process.
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
  
    // Reset and show the progress bar
    progressBar.style.width = '0%';
    progressContainer.style.display = 'block';
  
    // Simulate progress animation
    let width = 0;
    const interval = setInterval(() => {
      width += 10;
      if (width >= 100) {
        width = 100;
        clearInterval(interval);
        // Hide the progress bar after a short delay once complete
        setTimeout(() => {
          progressContainer.style.display = 'none';
          progressBar.style.width = '0%'; // reset for next use
        }, 500);
      }
      progressBar.style.width = width + '%';
    }, 150);
  
    // Send the message to start saving tabs
    chrome.runtime.sendMessage({ action: "saveTabs" });
  });
});

// Log the stored token for debugging (optional - remove in production)
chrome.storage.local.get(['readwiseToken'], (result) => {
  console.log('Stored Token:', result.readwiseToken);
});
