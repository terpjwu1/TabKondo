// Utility function to validate URLs
const isValidUrl = (url) => {
  try {
    const parsed = new URL(url);
    const validProtocol = ['http:', 'https:'].includes(parsed.protocol);
    const validHost = parsed.hostname.includes('.');
    return validProtocol && validHost;
  } catch {
    return false;
  }
};

// Create tab status tracker outside the listener
const tabStatus = new Map();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveTabs") {
    chrome.storage.local.get(['readwiseToken'], async (result) => {
      const apiToken = result.readwiseToken;
      if (!apiToken) {
        console.error('No Readwise API token found in storage');
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'Missing API Key',
          message: 'No Readwise API key found. Right-click on the extension, go to Options, and input your API key.'
        });
        return;
      }
      
      try {
        const tabs = await chrome.tabs.query({});
        const BATCH_SIZE = 2;
        const RETRY_LIMIT = 2;
        const REQUEST_DELAY = 1500;
        let successCount = 0;
        let failCount = 0;

        console.log(`Processing ${tabs.length} tabs...`);

        // Send initial progress
        chrome.runtime.sendMessage({
          type: 'progress',
          percent: 0
        });

        for (let i = 0; i < tabs.length; i += BATCH_SIZE) {
          const batch = tabs.slice(i, i + BATCH_SIZE);
          
          // Filter for valid tabs
          const validTabs = batch.filter(tab =>
            tab.id && !tab.closed && !tabStatus.has(tab.id)
          );

          const results = await Promise.allSettled(
            validTabs.map(async (tab) => {
              let finalUrl = tab.url;
              
              // Improved Tab Suspender handling
              if (tab.url.includes('parked.html')) {
                try {
                  const urlParams = new URL(tab.url).searchParams;
                  const parkedUrl = urlParams.get('url');
                  finalUrl = parkedUrl ? decodeURIComponent(parkedUrl) : tab.url;
                } catch (e) {
                  console.warn('URL decoding failed:', e);
                }
              }

              // Platform-agnostic internal URL check
              if (/^(chrome|about):/.test(finalUrl)) {
                console.log(`Blocked internal URL: ${finalUrl}`);
                return { status: 'blocked', url: finalUrl };
              }

              if (!isValidUrl(finalUrl)) {
                console.warn(`Skipping invalid URL: ${finalUrl}`);
                return { status: 'skipped', url: finalUrl };
              }

              tabStatus.set(tab.id, 'processing');

              for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
                try {
                  const response = await fetch('https://readwise.io/api/v3/save/', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Token ${apiToken}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      url: finalUrl,
                      location: "new",
                      category: "article",
                      saved_from: "TabKondo"
                    })
                  });

                  if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After') || 2;
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    continue;
                  }

                  if (response.status === 400) {
                    const errorData = await response.json();
                    throw new Error(`API Validation Failed: ${errorData.detail}`);
                  }

                  if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                  }

                  try {
                    await chrome.tabs.remove(tab.id);
                  } catch (error) {
                    console.log(`Tab ${tab.id} already closed`);
                  }

                  successCount++;
                  tabStatus.set(tab.id, 'completed');
                  return { status: 'success', url: finalUrl };
                } catch (error) {
                  console.error(`Attempt ${attempt} failed:`, error);
                  if (attempt === RETRY_LIMIT) {
                    failCount++;
                    tabStatus.delete(tab.id);
                    return { status: 'failed', url: finalUrl, error: error.message };
                  }
                }
              }
            })
          );

          // Update progress after each batch
          const percentComplete = Math.floor((i / tabs.length) * 100);
          chrome.runtime.sendMessage({
            type: 'progress',
            percent: percentComplete
          });

          await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
        }

        // Final completion message
        chrome.runtime.sendMessage({
          type: 'complete',
          successCount: successCount,
          failCount: failCount
        });

        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'TabKondo Complete',
          message: `Saved ${successCount} tabs, ${failCount} failures`
        });

      } catch (error) {
        console.error('Global error:', error);
        chrome.runtime.sendMessage({
          type: 'error',
          error: error.message
        });
      } finally {
        tabStatus.clear();
      }
    });
  }
});
