'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// PingPong — Extension Popup Script
//
// Responsible for:
//   1. Displaying the configured backend URL.
//   2. Verifying backend connectivity via GET /health.
//   3. Opening the secure dashboard with the hardcoded DASHBOARD_SECRET.
// ─────────────────────────────────────────────────────────────────────────────

// Configuration
// Local development values. Changed to Railway domain in Phase 6.
const BASE_URL = 'http://localhost:3000';
const DASHBOARD_SECRET = 'pingpong_dev_secret_key_77a9d28eef6412';

document.addEventListener('DOMContentLoaded', () => {
  const statusText = document.getElementById('status-text');
  const statusDot = document.getElementById('status-dot');
  const serverUrlEl = document.getElementById('server-url');
  const dashboardBtn = document.getElementById('dashboard-btn');

  // Display current backend URL
  serverUrlEl.textContent = BASE_URL.replace(/^https?:\/\//, '');
  serverUrlEl.title = BASE_URL;

  // Check health status of the backend server
  function checkServerHealth() {
    statusText.textContent = 'Checking';
    statusDot.className = 'status-dot';

    fetch(`${BASE_URL}/health`)
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

  // Initial check
  checkServerHealth();

  // Handle opening the dashboard in a new tab
  dashboardBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const dashboardUrl = `${BASE_URL}/dashboard?key=${DASHBOARD_SECRET}`;
    
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: dashboardUrl });
    } else {
      // Fallback for standard web-preview environments
      window.open(dashboardUrl, '_blank');
    }
  });
});
