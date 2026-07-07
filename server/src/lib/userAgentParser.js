'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// userAgentParser.js
//
// Three responsibilities:
//   1. parseUserAgent(ua)  → human-readable { device, client, label }
//   2. isBot(ua)           → boolean — definitively non-human pixel fetchers
//   3. getConfidence(ua)   → 'HIGH' | 'MEDIUM' | 'LOW'
//
// Confidence Levels (Option C):
//   HIGH   — Strong signal of deliberate human interaction. Desktop email
//             clients (Outlook, Thunderbird, Apple Mail on macOS) and
//             webmail opened in a desktop browser. These clients only fetch
//             images when the user actively opens the message.
//
//   MEDIUM — Plausible human open, but the client or environment is known to
//             sometimes auto-fetch images without explicit user interaction.
//             Examples: mobile Gmail app, mobile Apple Mail, Samsung Email,
//             Outlook for iOS/Android. Notification previews and background
//             sync can both produce these, so confidence is lower.
//
//   LOW    — Almost certainly not a deliberate human open. Includes confirmed
//             proxy servers (Google Image Proxy, Apple MPP relay, Yahoo proxy),
//             security-scanner UAs, and any UA that matches a known bot pattern
//             but slipped through the isBot() hard filter (belt-and-suspenders).
//
// Bot filter (Option A):
//   isBot() covers every known non-human category:
//     • Email image proxies  (GoogleImageProxy, Apple Privacy relay, Yahoo proxy…)
//     • Email security/AV scanners (Barracuda, Proofpoint, Mimecast, Symantec…)
//     • Generic HTTP clients used by automated systems (curl, wget, Python…)
//     • Web crawlers and monitoring tools (Googlebot, Pingdom, UptimeRobot…)
//   These are blocked from being counted as opens at all.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Bot / non-human UA patterns
//
// Every pattern here represents a request that definitively did NOT come from
// a human reading an email. We block these at the pixel route before any open
// event is created.
//
// Organised into named groups for maintainability:
// ─────────────────────────────────────────────────────────────────────────────

const BOT_PATTERNS = [
  // ── Email image proxies ─────────────────────────────────────────────────
  // These services pre-fetch / cache images server-side on behalf of the client.
  // The IP and location belong to the proxy, NOT the human recipient.
  /GoogleImageProxy/i,          // Gmail's image proxy (all Gmail clients)
  /GoogleProxy/i,               // Generic Google proxy variant
  /YahooMailProxy/i,            // Yahoo Mail image proxy
  /\bYahoo!\s*Mail\b.*Proxy/i,  // Yahoo Mail proxy variant
  /Poczta\b/i,                  // Apple Privacy Relay (MPP) — Polish word, used by Apple
  /\bAppleProxy\b/i,            // Apple MPP relay variant
  /\bAppleExchangeWebServices\b/i, // Apple Exchange image prefetch
  /\biCloud\b.*\bProxy\b/i,     // iCloud relay
  /\bMicrosoftSafeLinks\b/i,    // Microsoft Safe Links scanner
  /\bOutlookBot\b/i,            // Outlook server-side preview bot
  /\bOfficeAccessService\b/i,   // Microsoft Office 365 access service
  /\bMailruImageProxy\b/i,      // Mail.ru image proxy
  /\bFastmail.*Proxy\b/i,       // Fastmail image proxy

  // ── Email security scanners / AV gateways ───────────────────────────────
  // Corporate email security products scan links and images automatically
  // before the message reaches the inbox. IP = the company's AV gateway.
  /\bBarracuda\b/i,             // Barracuda Email Security Gateway
  /\bProofpoint\b/i,            // Proofpoint Email Protection
  /\bMimecast\b/i,              // Mimecast Secure Email Gateway
  /\bSymantec.*Mail/i,          // Symantec Email Security
  /\bMessageLabs\b/i,           // Symantec MessageLabs (legacy)
  /\bIronPort\b/i,              // Cisco IronPort Email Security
  /\bCiscoEmail\b/i,            // Cisco Email Security Appliance
  /\bSophosGateway\b/i,         // Sophos Email Gateway
  /\bTrendMicro.*Mail/i,        // Trend Micro Email Security
  /\bFortiMail\b/i,             // Fortinet FortiMail
  /\bCheckpoint.*Mail/i,        // Check Point Email Security
  /\bVadeSecure\b/i,            // Vade Secure
  /\bAgariEmail\b/i,            // Agari (Phishing Defense)
  /\bReturnPath\b/i,            // Return Path / Validity
  /\bSpamAssassin\b/i,          // SpamAssassin scanner
  /\bRSPAMD\b/i,                // rspamd spam filter
  /\bAmazonSES.*scan/i,         // Amazon SES link checker
  /\bSendgrid.*bot/i,           // SendGrid link validation bot
  /\bMandrill.*check/i,         // Mandrill link checker

  // ── Generic automated HTTP clients ──────────────────────────────────────
  // Programmatic fetchers — never a human email client.
  /\bcurl\b/i,
  /\bwget\b/i,
  /python-requests/i,
  /python-urllib/i,
  /Go-http-client/i,
  /\bHTTPie\b/i,
  /\bokhttp\b/i,                // Android OkHttp (automation, not Mail app)
  /\bAxios\b/i,
  /\bnode-fetch\b/i,
  /\bGot\b\/\d/i,               // Got HTTP library
  /\bSuperagent\b/i,
  /\bRestTemplate\b/i,          // Spring RestTemplate (Java)
  /\bApache-HttpClient\b/i,
  /\bJava\/\d/i,                // Raw Java HTTP
  /\bRuby\b.*\bHTTP\b/i,
  /\bphp-curl\b/i,
  /\bGuzzle\b/i,                // PHP Guzzle
  /\blibcurl\b/i,

  // ── Web crawlers / monitoring tools ─────────────────────────────────────
  /Googlebot/i,
  /Bingbot/i,
  /Slurp/i,                     // Yahoo Search crawler
  /DuckDuckBot/i,
  /facebookexternalhit/i,
  /Twitterbot/i,
  /LinkedInBot/i,
  /WhatsApp\//i,
  /Slackbot/i,
  /TelegramBot/i,
  /Pingdom/i,
  /UptimeRobot/i,
  /StatusCake/i,
  /NewRelic/i,
  /Datadog/i,
  /\bmonitor\b.*\bbot\b/i,
  /\bsitechecker\b/i,
  /\bSemrushBot\b/i,
  /\bAhrefsBot\b/i,
  /\bMajestic\b/i,
  /\bMJ12bot\b/i,

  // ── Catch-all bot signals ────────────────────────────────────────────────
  // Any UA explicitly declaring itself a bot/crawler/spider.
  /\bbot\b/i,
  /\bcrawler\b/i,
  /\bspider\b/i,
  /\bscraper\b/i,
  /\bfetcher\b/i,
  /\bpreview\b.*\bbot\b/i,
  /\blink.*checker\b/i,
  /\bheadless\b/i,             // Headless Chrome/Firefox automation
  /PhantomJS/i,
  /Selenium/i,
  /Puppeteer/i,
  /Playwright/i,
];

/**
 * Returns true if the User-Agent is definitively a non-human fetcher
 * (proxy, scanner, crawler, automated tool) and should NOT be counted
 * as an email open event.
 *
 * @param {string} ua — raw User-Agent header value
 * @returns {boolean}
 */
function isBot(ua) {
  if (!ua || ua === 'unknown' || ua.trim() === '') {
    // No UA at all — almost certainly an automated probe
    return true;
  }
  return BOT_PATTERNS.some((pattern) => pattern.test(ua));
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — UA string → { device, client, label }
//
// Lightweight regex-based parser. Order of checks matters — more specific
// clients must be checked before generic browsers, because email apps often
// include browser-like tokens in their UA strings.
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
  } else if (/YahooMobile/i.test(ua) || (/Yahoo/i.test(ua) && /Mail/i.test(ua))) {
    client = 'Yahoo Mail';
  } else if (/GoogleImageProxy/i.test(ua)) {
    // Caught by isBot() first; label kept here for legacy data display
    client = 'Gmail (Proxy)';
  } else if (/Gmail/i.test(ua)) {
    client = 'Gmail App';
  } else if (/\bEM\b.*Client/i.test(ua) || /eM Client/i.test(ua)) {
    client = 'eM Client';
  } else if (/Spark/i.test(ua)) {
    client = 'Spark';
  } else if (/Airmail/i.test(ua)) {
    client = 'Airmail';
  } else if (/Postbox/i.test(ua)) {
    client = 'Postbox';
  } else if (/Mailspring/i.test(ua)) {
    client = 'Mailspring';
  } else if (/Mimestream/i.test(ua)) {
    client = 'Mimestream';
  } else if (/Superhuman/i.test(ua)) {
    client = 'Superhuman';
  } else if (/HEY/i.test(ua)) {
    client = 'HEY Mail';
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


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Confidence scoring
//
// Assigns HIGH / MEDIUM / LOW based on the combination of client and device.
//
// Decision rationale:
//
//   HIGH — Desktop-only email clients that load images only on explicit open.
//          Outlook (Windows/macOS), Thunderbird, eM Client, Postbox, Mailspring,
//          Mimestream, Superhuman (desktop), HEY (desktop). Also: webmail
//          opened in a desktop browser (Chrome, Edge, Firefox, Safari/macOS)
//          because clicking "show images" or having images enabled is still
//          an affirmative user action on desktop.
//
//   MEDIUM — Mobile clients. Both the Gmail and Apple Mail mobile apps are
//            documented to prefetch email bodies (including images) when a
//            push notification arrives or the inbox auto-syncs. The open may
//            be real, but there's a meaningful chance it was triggered by the
//            OS or the app's background sync rather than the user reading it.
//            Outlook for iOS/Android has the same issue. Samsung Email,
//            Yahoo Mail mobile — same category.
//
//   LOW — Proxy UAs that weren't caught by isBot() (edge cases in known
//         proxy products, or new proxy variants we haven't seen before),
//         and completely unknown UA strings. These should be treated with
//         scepticism. If isBot() already caught it, the event is marked
//         `isFiltered=true` and this confidence level is mostly academic.
// ─────────────────────────────────────────────────────────────────────────────

const HIGH_CONFIDENCE_CLIENTS = new Set([
  'Outlook',
  'Thunderbird',
  'eM Client',
  'Postbox',
  'Mailspring',
  'Mimestream',
  'Superhuman',
  'HEY Mail',
  'Airmail',      // Desktop version; mobile handled separately below
  'Spark',        // Desktop version; mobile handled separately below
  'Chrome',
  'Edge',
  'Opera',
  'Firefox',
  'Safari / Mail',  // macOS desktop Safari / Apple Mail
]);

const HIGH_CONFIDENCE_DEVICES = new Set([
  'Windows',
  'macOS',
  'Linux',
  'ChromeOS',
]);

const MEDIUM_CONFIDENCE_CLIENTS = new Set([
  'Gmail App',
  'Mail App',        // iOS/iPadOS Apple Mail
  'Outlook (iOS)',
  'Outlook (Android)',
  'Yahoo Mail',
  'Safari',          // Mobile Safari (non-desktop) — ambiguous
]);

const MEDIUM_CONFIDENCE_DEVICES = new Set([
  'iPhone',
  'iPad',
  'Android',
]);

/**
 * Assigns a confidence level (HIGH / MEDIUM / LOW) to a pixel hit based on
 * the parsed User-Agent.
 *
 * This is called AFTER isBot() returns false — meaning we already know this
 * is not a definitively-blocked non-human agent. The confidence score
 * expresses how likely it is that this pixel hit corresponds to a real human
 * reading the email.
 *
 * @param {string} ua — raw User-Agent header value
 * @param {{ device: string, client: string, label: string }} parsedUA
 *   — result of parseUserAgent(ua) for the same UA string
 * @returns {'HIGH' | 'MEDIUM' | 'LOW'}
 */
function getConfidence(ua, parsedUA) {
  const { device, client } = parsedUA;

  // ── Proxy patterns that slipped isBot() → LOW ────────────────────────────
  // Belt-and-suspenders check for proxy/relay UAs that our blocklist might
  // have missed (e.g. new proxy products, slight UA variations).
  if (
    /proxy/i.test(ua) ||
    /relay/i.test(ua) ||
    /prefetch/i.test(ua) ||
    /scanner/i.test(ua) ||
    /\bcheck\b/i.test(ua)
  ) {
    return 'LOW';
  }

  // ── No UA at all → LOW ───────────────────────────────────────────────────
  if (!ua || ua === 'unknown' || ua.trim() === '') {
    return 'LOW';
  }

  // ── Gmail Proxy label (from parseUserAgent) → LOW ────────────────────────
  // The isBot() filter catches GoogleImageProxy before we reach this point,
  // but guard here too for any existing DB rows that were logged before the
  // filter was introduced.
  if (client === 'Gmail (Proxy)') {
    return 'LOW';
  }

  // ── Desktop clients → HIGH ───────────────────────────────────────────────
  // Client is in the HIGH set, OR the device is clearly desktop.
  // A desktop browser viewing webmail is HIGH — clicking "load images" or
  // having images auto-load on desktop is still an intentional open.
  if (HIGH_CONFIDENCE_CLIENTS.has(client)) {
    return 'HIGH';
  }

  if (HIGH_CONFIDENCE_DEVICES.has(device) && client !== 'Unknown') {
    // Known desktop OS with a recognised client — HIGH
    return 'HIGH';
  }

  // ── Mobile clients → MEDIUM ─────────────────────────────────────────────
  // Mobile apps are susceptible to notification-preview and background-sync
  // prefetches. We can't distinguish those from genuine opens.
  if (MEDIUM_CONFIDENCE_CLIENTS.has(client)) {
    return 'MEDIUM';
  }

  if (MEDIUM_CONFIDENCE_DEVICES.has(device)) {
    return 'MEDIUM';
  }

  // ── Everything else → LOW ────────────────────────────────────────────────
  // Completely unrecognised UA, desktop OS but unknown client, or any other
  // combination we haven't explicitly classified. Treat conservatively.
  return 'LOW';
}


module.exports = { parseUserAgent, isBot, getConfidence };
