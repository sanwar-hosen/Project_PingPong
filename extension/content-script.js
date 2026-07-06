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
// ─────────────────────────────────────────────────────────────────────────────

// Configuration
// Local development base URL. Changed to Railway domain in Phase 6.
const BASE_URL = 'http://localhost:3000';

console.log('[PingPong] Content script loaded. Ready to track emails.');

// ── Helper: UUID v4 generator fallback ───────────────────────────────────────
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

// ── Core: Process send action and inject pixel ────────────────────────────────
function handleSendAction(event, composeContainer) {
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
      // Accessing a method like getManifest throws an error if the context is invalidated
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
  // Gather from chips containing the [email] attribute
  const emailChips = composeContainer.querySelectorAll('[email]');
  const recipients = Array.from(emailChips)
    .map((el) => el.getAttribute('email').trim())
    .filter(Boolean);

  // Fallback/Supplement: check any input field values for raw typed email addresses
  const textInputs = composeContainer.querySelectorAll(
    'input[type="text"], input[type="email"], input:not([type])'
  );
  textInputs.forEach((input) => {
    const val = input.value.trim();
    if (val && val.includes('@')) {
      // Split by common delimiters in case of multiple addresses
      const parsed = val.split(/[,;\s]+/).map((p) => p.trim()).filter((p) => p.includes('@'));
      recipients.push(...parsed);
    }
  });

  // Unique list of recipient email addresses
  const uniqueRecipients = [...new Set(recipients)].join(', ');

  // 4. Generate unique tracking ID
  const trackingId = generateUUID();

  // 5. Build and inject tracking pixel <img> tag
  const pixelUrl = `${BASE_URL}/pixel/${trackingId}.gif`;
  
  const img = document.createElement('img');
  img.src = pixelUrl;
  img.width = 1;
  img.height = 1;
  img.style.display = 'none';
  img.style.width = '0px';
  img.style.height = '0px';
  img.setAttribute('alt', '');
  img.setAttribute('data-pingpong-pixel', trackingId);

  // Append to the end of the email body
  bodyElement.appendChild(img);
  
  // Mark the compose container to prevent duplicate pixels
  composeContainer.dataset.pingpongInjected = 'true';
  
  console.log(`[PingPong] Injected pixel ${trackingId} for recipients: "${uniqueRecipients || '(none)'}"`);

  // 6. Asynchronously register email metadata to the backend via background script
  try {
    chrome.runtime.sendMessage({
      action: 'registerEmail',
      baseUrl: BASE_URL,
      data: {
        trackingId,
        subject: subject || '(No Subject)',
        recipient: uniqueRecipients || '(No Recipient)'
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[PingPong] Error sending message to background script:', chrome.runtime.lastError.message);
        return;
      }
      if (response && response.success) {
        console.log('[PingPong] Email successfully registered in backend database.');
      } else {
        console.error('[PingPong] Failed to register email metadata:', response?.error || 'Unknown error');
      }
    });
  } catch (err) {
    console.error('[PingPong] Failed to send message to background script (context invalidated):', err);
    alert('PingPong Email Tracker: The extension context was lost. Please refresh Gmail to continue tracking.');
  }
}

// ── Event Listener: Capturing clicks on Send buttons ─────────────────────────
document.addEventListener('click', (event) => {
  // Find if click target is a Gmail Send button
  // Matches aria-label containing "Send" or data-tooltip containing "Send"
  const sendButton = event.target.closest(
    'div[role="button"][aria-label*="Send"], div[role="button"][data-tooltip*="Send"], div[role="button"].T-I.J-J5-Ji.T-I-KE'
  );

  if (sendButton) {
    const composeContainer = getComposeContainer(sendButton);
    if (composeContainer) {
      console.log('[PingPong] Send button click intercepted.');
      handleSendAction(event, composeContainer);
    }
  }
}, true); // Use capture phase to run before Gmail's internal click handlers

// ── Event Listener: Keydowns for keyboard shortcuts ─────────────────────────
document.addEventListener('keydown', (event) => {
  // Detect Ctrl+Enter or Cmd+Enter
  const isSendShortcut = (event.ctrlKey || event.metaKey) && event.key === 'Enter';
  
  if (isSendShortcut) {
    const composeContainer = getComposeContainer(document.activeElement);
    if (composeContainer) {
      console.log('[PingPong] Keyboard send shortcut intercepted.');
      handleSendAction(event, composeContainer);
    }
  }
}, true); // Use capture phase to execute before send fires
