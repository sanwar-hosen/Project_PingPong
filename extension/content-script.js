'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// PingPong — Content Script (Gmail Compose Window Integration)
//
// Targets: mail.google.com
// Responsible for:
//   1. Listening to "Send" actions (click on Send button or Ctrl+Enter / Cmd+Enter).
//   2. Extracting subject, recipients (To, CC, BCC), and the body editable div.
//   3. Generating a unique UUID.
//   4. Injecting the invisible tracking pixel <img> tag.
//   5. Registering the email metadata asynchronously via background service worker.
//
// BASE_URL is read from chrome.storage.local.
// Configure it once via the ⚙ Settings panel in the extension popup before use.
// Format: https://your-app.fly.dev  OR  https://your-app.up.railway.app
// ─────────────────────────────────────────────────────────────────────────────

console.log('[PingPong] Content script loaded. Ready to track emails.');

// ── Helper: UUID v4 generator ────────────────────────────────────────────────
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback RFC4122 compliance
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Helper: Find the compose container ──────────────────────────────────────
function getComposeContainer(element) {
  if (!element) return null;
  // Look for Gmail's standard compose modal, reply pane, or container
  return element.closest('div[role="dialog"], .M9, .AD, td.Hp');
}

// ── Helper: Read baseUrl from chrome.storage.local ───────────────────────────
// Returns a Promise that resolves with the stored URL, or empty string if not set.
function getBaseUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get('baseUrl', (result) => {
      resolve((result.baseUrl || '').trim());
    });
  });
}

// ── Core: Process send action and inject pixel ────────────────────────────────
// baseUrl is passed in from the storage read so this function stays synchronous.
function handleSendAction(event, composeContainer, baseUrl) {
  if (!composeContainer) return;

  // Prevent double injection if the send event is fired multiple times
  // or if Gmail's "Undo Send" lets us compose again.
  if (composeContainer.dataset.pingpongInjected === 'true') {
    console.log('[PingPong] Pixel already injected in this draft.');
    return;
  }

  // 0. Check if extension context is valid
  let isContextValid = true;
  try {
    if (!chrome.runtime || !chrome.runtime.id) {
      isContextValid = false;
    } else {
      // Accessing getManifest() throws if the context is invalidated
      chrome.runtime.getManifest();
    }
  } catch (e) {
    isContextValid = false;
  }

  if (!isContextValid) {
    console.warn('[PingPong] Extension context is invalidated. Reload required.');
    alert('PingPong Email Tracker: The extension has been updated or reloaded in the background. Please refresh Gmail to track this email.');
    return;
  }

  // 1. Locate Gmail's email body editable div
  const bodyElement = composeContainer.querySelector(
    'div[role="textbox"][contenteditable="true"], div[contenteditable="true"], div.Am.Al.editable'
  );

  if (!bodyElement) {
    console.warn('[PingPong] Could not find the email body editor.');
    return;
  }

  // 2. Extract Subject
  const subjectInput = composeContainer.querySelector('input[name="subjectbox"]');
  const subject = subjectInput ? subjectInput.value.trim() : '';

  // 3. Extract Recipients (To, CC, BCC)
  // ── Gmail DOM selectors — isolate here for easy future maintenance ──────────
  const emailChips = composeContainer.querySelectorAll('[email]');
  const recipients = Array.from(emailChips)
    .map((el) => el.getAttribute('email').trim())
    .filter(Boolean);

  // Fallback: check raw input field values
  const textInputs = composeContainer.querySelectorAll(
    'input[type="text"], input[type="email"], input:not([type])'
  );
  textInputs.forEach((input) => {
    const val = input.value.trim();
    if (val && val.includes('@')) {
      const parsed = val.split(/[,;\s]+/).map((p) => p.trim()).filter((p) => p.includes('@'));
      recipients.push(...parsed);
    }
  });
  // ── End Gmail DOM selectors ─────────────────────────────────────────────────

  const uniqueRecipients = [...new Set(recipients)].join(', ');

  // 4. Check for existing tracking pixel (e.g. draft restored after "Undo Send")
  const existingPixel = bodyElement.querySelector('img[data-pingpong-pixel]');
  let trackingId;
  let isNewPixel = true;

  if (existingPixel) {
    trackingId = existingPixel.getAttribute('data-pingpong-pixel');
    console.log(`[PingPong] Existing pixel found: ${trackingId}. Reusing.`);
    isNewPixel = false;
  } else {
    trackingId = generateUUID();
  }

  if (isNewPixel) {
    // 5. Build and inject tracking pixel <img> tag
    const pixelUrl = `${baseUrl}/pixel/${trackingId}.gif`;

    const img = document.createElement('img');
    img.src = pixelUrl;
    img.width = 1;
    img.height = 1;
    img.style.display = 'none';
    img.style.width = '0px';
    img.style.height = '0px';
    img.setAttribute('alt', '');
    img.setAttribute('data-pingpong-pixel', trackingId);

    bodyElement.appendChild(img);
    console.log(`[PingPong] Injected pixel ${trackingId} → ${pixelUrl} | recipients: "${uniqueRecipients || '(none)'}"`);
  }

  // Mark compose container to prevent duplicate pixels
  composeContainer.dataset.pingpongInjected = 'true';

  // 6. Asynchronously register email metadata via background script
  try {
    chrome.runtime.sendMessage({
      action: 'registerEmail',
      baseUrl,
      data: {
        trackingId,
        subject: subject || '(No Subject)',
        recipient: uniqueRecipients || '(No Recipient)'
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[PingPong] Error sending message to background:', chrome.runtime.lastError.message);
        return;
      }
      if (response && response.success) {
        console.log('[PingPong] Email registered in backend.');
      } else {
        console.error('[PingPong] Failed to register email:', response?.error || 'Unknown error');
      }
    });
  } catch (err) {
    console.error('[PingPong] Failed to send message to background (context invalidated):', err);
    alert('PingPong Email Tracker: The extension context was lost. Please refresh Gmail to continue tracking.');
  }
}

// ── Event Listener: Send button clicks ───────────────────────────────────────
document.addEventListener('click', (event) => {
  // ── Gmail Send button selectors — isolate here for easy future maintenance ──
  const sendButton = event.target.closest(
    'div[role="button"][aria-label*="Send"], div[role="button"][data-tooltip*="Send"], div[role="button"].T-I.J-J5-Ji.T-I-KE'
  );
  // ── End Send button selectors ───────────────────────────────────────────────

  if (sendButton) {
    const composeContainer = getComposeContainer(sendButton);
    if (composeContainer) {
      console.log('[PingPong] Send button click intercepted.');
      getBaseUrl().then((baseUrl) => {
        if (!baseUrl) {
          console.warn('[PingPong] Backend URL not configured. Open the extension popup → ⚙ Settings and set your server URL.');
          return;
        }
        handleSendAction(event, composeContainer, baseUrl);
      });
    }
  }
}, true); // Capture phase: runs before Gmail's internal click handlers

// ── Event Listener: Keyboard shortcut (Ctrl+Enter / Cmd+Enter) ───────────────
document.addEventListener('keydown', (event) => {
  const isSendShortcut = (event.ctrlKey || event.metaKey) && event.key === 'Enter';

  if (isSendShortcut) {
    const composeContainer = getComposeContainer(document.activeElement);
    if (composeContainer) {
      console.log('[PingPong] Keyboard send shortcut intercepted.');
      getBaseUrl().then((baseUrl) => {
        if (!baseUrl) {
          console.warn('[PingPong] Backend URL not configured. Open the extension popup → ⚙ Settings and set your server URL.');
          return;
        }
        handleSendAction(event, composeContainer, baseUrl);
      });
    }
  }
}, true); // Capture phase: runs before send fires
