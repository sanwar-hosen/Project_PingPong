'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// PingPong — Extension Popup Script
//
// Reads baseUrl and dashboardSecret from chrome.storage.local.
// No hardcoded URLs — configure via the settings section in the popup UI.
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const statusText = document.getElementById('status-text');
  const statusDot = document.getElementById('status-dot');
  const serverUrlEl = document.getElementById('server-url');
  const dashboardBtn = document.getElementById('dashboard-btn');
  const settingsToggle = document.getElementById('settings-toggle');
  const settingsPanel = document.getElementById('settings-panel');
  const baseUrlInput = document.getElementById('base-url-input');
  const secretInput = document.getElementById('secret-input');
  const saveBtn = document.getElementById('save-btn');
  const saveStatus = document.getElementById('save-status');

  let currentBaseUrl = '';
  let currentSecret = '';

  // ── Load saved config from storage ─────────────────────────────────────────
  chrome.storage.local.get(['baseUrl', 'dashboardSecret'], (result) => {
    currentBaseUrl = (result.baseUrl || '').trim();
    currentSecret = (result.dashboardSecret || '').trim();

    // Display current URL in the card
    if (currentBaseUrl) {
      serverUrlEl.textContent = currentBaseUrl.replace(/^https?:\/\//, '');
      serverUrlEl.title = currentBaseUrl;
      checkServerHealth(currentBaseUrl);
    } else {
      serverUrlEl.textContent = 'Not configured — open ⚙ Settings';
      serverUrlEl.title = 'Click ⚙ Settings below to set your server URL';
      statusText.textContent = 'Setup needed';
      statusDot.className = 'status-dot disconnected';
    }

    // Pre-fill settings inputs
    if (baseUrlInput) baseUrlInput.value = currentBaseUrl;
    if (secretInput) secretInput.value = currentSecret;
  });

  // ── Health check ────────────────────────────────────────────────────────────
  function checkServerHealth(baseUrl) {
    statusText.textContent = 'Checking';
    statusDot.className = 'status-dot';

    fetch(`${baseUrl}/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.status === 'ok') {
          statusText.textContent = 'Online';
          statusDot.className = 'status-dot connected';
        } else {
          statusText.textContent = 'Issue';
          statusDot.className = 'status-dot disconnected';
        }
      })
      .catch((err) => {
        console.error('[popup] Server health check failed:', err);
        statusText.textContent = 'Offline';
        statusDot.className = 'status-dot disconnected';
      });
  }

  // ── Dashboard button ────────────────────────────────────────────────────────
  dashboardBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const dashboardUrl = `${currentBaseUrl}/dashboard?key=${currentSecret}`;

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: dashboardUrl });
    } else {
      window.open(dashboardUrl, '_blank');
    }
  });

  // ── Settings toggle ─────────────────────────────────────────────────────────
  if (settingsToggle && settingsPanel) {
    settingsToggle.addEventListener('click', () => {
      const isOpen = settingsPanel.style.display === 'block';
      settingsPanel.style.display = isOpen ? 'none' : 'block';
      settingsToggle.textContent = isOpen ? '⚙ Settings' : '✕ Close';
    });
  }

  // ── Save settings ───────────────────────────────────────────────────────────
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const newUrl = (baseUrlInput.value || '').trim().replace(/\/$/, ''); // strip trailing slash
      const newSecret = (secretInput.value || '').trim();

      if (!newUrl) {
        saveStatus.textContent = 'URL cannot be empty.';
        saveStatus.style.color = '#ef4444';
        return;
      }

      chrome.storage.local.set({ baseUrl: newUrl, dashboardSecret: newSecret }, () => {
        currentBaseUrl = newUrl;
        currentSecret = newSecret;

        // Update displayed URL
        serverUrlEl.textContent = newUrl.replace(/^https?:\/\//, '');
        serverUrlEl.title = newUrl;

        saveStatus.textContent = 'Saved ✓';
        saveStatus.style.color = '#10b981';
        setTimeout(() => { saveStatus.textContent = ''; }, 2000);

        // Re-run health check with the new URL
        checkServerHealth(newUrl);
      });
    });
  }
});
