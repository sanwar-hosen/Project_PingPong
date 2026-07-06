'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// userAgentParser.js
//
// Lightweight User-Agent string → human-readable device/client label.
//
// PRD Section 8 guidance:
//   "Phase 4's 'device/client parsing' from User-Agent strings doesn't need a
//    heavy library — a small set of regex checks for common patterns (iPhone
//    Mail, Outlook, Gmail app, Chrome desktop, etc.) is sufficient; falling
//    back to 'Unknown device' is fine for anything unrecognized."
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a raw User-Agent string into a human-readable { device, client } pair.
 *
 * @param {string} ua — raw User-Agent header value
 * @returns {{ device: string, client: string, label: string }}
 *   - device: OS/hardware (e.g. "iPhone", "Windows", "macOS")
 *   - client: email client or browser (e.g. "Mail App", "Chrome", "Outlook")
 *   - label:  combined "device – client" string for display
 */
function parseUserAgent(ua) {
  if (!ua || ua === 'unknown') {
    return { device: 'Unknown', client: 'Unknown', label: 'Unknown device' };
  }

  let device = 'Unknown';
  let client = 'Unknown';

  // ── Detect device / OS ──────────────────────────────────────────────────

  if (/iPhone/i.test(ua)) {
    device = 'iPhone';
  } else if (/iPad/i.test(ua)) {
    device = 'iPad';
  } else if (/Android/i.test(ua)) {
    device = 'Android';
  } else if (/Windows/i.test(ua)) {
    device = 'Windows';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    device = 'macOS';
  } else if (/Linux/i.test(ua)) {
    device = 'Linux';
  } else if (/CrOS/i.test(ua)) {
    device = 'ChromeOS';
  }

  // ── Detect email client / browser ───────────────────────────────────────
  // Order matters — check specific email clients before generic browsers,
  // since email apps often include browser-like tokens in their UA strings.

  if (/Thunderbird/i.test(ua)) {
    client = 'Thunderbird';
  } else if (/Microsoft Outlook/i.test(ua) || /MSOffice/i.test(ua)) {
    client = 'Outlook';
  } else if (/Outlook-iOS/i.test(ua)) {
    client = 'Outlook (iOS)';
  } else if (/Outlook-Android/i.test(ua)) {
    client = 'Outlook (Android)';
  } else if (/YahooMobile/i.test(ua) || /Yahoo/i.test(ua) && /Mail/i.test(ua)) {
    client = 'Yahoo Mail';
  } else if (/GoogleImageProxy/i.test(ua)) {
    // Gmail proxies images through Google's servers — the "open" came from
    // Gmail, but the IP/location belongs to Google, not the recipient.
    client = 'Gmail (Proxy)';
  } else if (/Gmail/i.test(ua)) {
    client = 'Gmail App';
  } else if (/Spark/i.test(ua)) {
    client = 'Spark';
  } else if (/Airmail/i.test(ua)) {
    client = 'Airmail';
  } else if (/Postbox/i.test(ua)) {
    client = 'Postbox';
  } else if (/Mailspring/i.test(ua)) {
    client = 'Mailspring';
  } else if (/Edg\//i.test(ua)) {
    client = 'Edge';
  } else if (/OPR\/|Opera/i.test(ua)) {
    client = 'Opera';
  } else if (/Firefox/i.test(ua)) {
    client = 'Firefox';
  } else if (/Chrome\/.*Safari\//i.test(ua)) {
    // Chrome includes "Safari" in its UA, so check Chrome before Safari
    client = 'Chrome';
  } else if (/Safari\//i.test(ua) && /AppleWebKit/i.test(ua)) {
    // Apple Mail and Safari share similar UA strings on iOS/macOS.
    // If it's on iPhone/iPad and looks like Safari, it's likely Apple Mail.
    if (device === 'iPhone' || device === 'iPad') {
      client = 'Mail App';
    } else if (device === 'macOS') {
      client = 'Safari / Mail';
    } else {
      client = 'Safari';
    }
  }

  // ── Build combined label ────────────────────────────────────────────────
  let label;
  if (device === 'Unknown' && client === 'Unknown') {
    label = 'Unknown device';
  } else if (device === 'Unknown') {
    label = client;
  } else if (client === 'Unknown') {
    label = device;
  } else {
    label = `${device} – ${client}`;
  }

  return { device, client, label };
}

module.exports = { parseUserAgent };
