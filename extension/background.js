'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// PingPong — Background Service Worker (Manifest V3)
//
// Since mail.google.com has strict Content Security Policy (CSP) rules,
// direct fetches to localhost or external backends from content scripts
// can be blocked. The background worker runs in a privileged context,
// bypassing the page's CSP, making it ideal for proxying API requests.
// ─────────────────────────────────────────────────────────────────────────────

// Set up dynamic blocking rules to prevent the sender's browser from triggering false opens.
// This blocks requests to the tracking pixel matching the pattern '*/pixel/*.gif'.
async function setupBlockingRules() {
  const rules = [
    {
      id: 1,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '*/pixel/*.gif',
        resourceTypes: ['image', 'xmlhttprequest', 'sub_frame']
      }
    }
  ];

  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existingRules.map((rule) => rule.id);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds,
      addRules: rules
    });
    console.log('[background] Dynamic blocking rules set up successfully.');
  } catch (error) {
    console.error('[background] Failed to set up dynamic blocking rules:', error);
  }
}

// Run setup immediately on load and on install/startup
setupBlockingRules();

chrome.runtime.onInstalled.addListener(() => {
  setupBlockingRules();
});

chrome.runtime.onStartup.addListener(() => {
  setupBlockingRules();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'registerEmail') {
    const { baseUrl, data } = message;
    
    console.log('[background] Registering email metadata:', data);
    
    fetch(`${baseUrl}/api/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((result) => {
        console.log('[background] Metadata registered successfully:', result);
        sendResponse({ success: true, data: result });
      })
      .catch((error) => {
        console.error('[background] Failed to register email metadata:', error);
        sendResponse({ success: false, error: error.message });
      });
      
    // Return true to indicate that response will be sent asynchronously
    return true;
  }
});
