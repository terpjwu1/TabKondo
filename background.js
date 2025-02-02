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
          iconUrl: 'icon48.png', // ensure this icon exists in your package
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

        for (let i = 0; i < tabs.length; i += BATCH_SIZE) {
          const batch = tabs.slice(i, i + BATCH_SIZE);
          
          // Filter for valid tabs (NEW)
          const validTabs = batch.filter(tab =>
            tab.id &&
            !tab.closed &&
            !tabStatus.has(tab.id)
          );

          const results = await Promise.allSettled(
            validTabs.map(async (tab) => {
              let finalUrl = tab.url;
              
              // Handle Tab Suspender parked pages
              if (tab.url.startsWith('chrome-extension://fiabciakcmgepblmdkmemdbbkilneeeh')) {
                const urlParams = new URL(tab.url).searchParams;
                const parkedUrl = urlParams.get('url');
                // Double decoding to ensure proper URL extraction (NEW)
                finalUrl = parkedUrl ? decodeURIComponent(decodeURIComponent(parkedUrl)) : tab.url;
              }

              // Block internal URLs (NEW)
              if (finalUrl.includes('chrome-extension://') || finalUrl.includes('about:')) {
                console.log(`Blocked internal URL: ${finalUrl}`);
                return { status: 'blocked', url: finalUrl };
              }

              // Existing validation
              if (!isValidUrl(finalUrl)) {
                console.warn(`Skipping invalid URL: ${finalUrl}`);
                return { status: 'skipped', url: finalUrl };
              }

              // Mark tab as processing (NEW)
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
                      saved_from: "TabKondo" // NEW: source identifier
                    })
                  });

                  // Rate limit handling
                  if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After') || 2;
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    continue;
                  }

                  // Enhanced error handling for validation errors
                  if (response.status === 400) {
                    const errorData = await response.json();
                    console.error('Validation Error:', errorData.detail);
                    throw new Error(`API Validation Failed: ${errorData.detail}`);
                  }

                  if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorBody}`);
                  }

                  // Safe tab removal (NEW)
                  try {
                    await chrome.tabs.get(tab.id);
                    await chrome.tabs.remove(tab.id);
                    console.log(`Closed tab: ${tab.id}`);
                  } catch (error) {
                    console.log(`Tab ${tab.id} already closed`);
                  }

                  successCount++;
                  tabStatus.set(tab.id, 'completed'); // NEW: mark as complete
                  return { status: 'success', url: finalUrl };
                } catch (error) {
                  console.error(`Attempt ${attempt} failed for ${finalUrl}:`, error);
                  if (attempt === RETRY_LIMIT) {
                    failCount++;
                    tabStatus.delete(tab.id); // NEW: remove failed tab from tracker
                    return { status: 'failed', url: finalUrl, error: error.message };
                  }
                }
              }
            })
          );

          console.log(`Batch ${i / BATCH_SIZE + 1} complete:`, results);
          await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
        }

        console.log(`Process complete. Success: ${successCount}, Failed: ${failCount}`);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'TabKondo Complete',
          message: `Saved ${successCount} tabs, ${failCount} failures`
        });

      } catch (error) {
        console.error('Global error:', error);
      } finally {
        tabStatus.clear(); // NEW: clear tracker after processing
      }
    });
  }
});
