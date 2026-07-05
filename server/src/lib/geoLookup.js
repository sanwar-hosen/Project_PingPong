'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// geoLookup.js
//
// Converts an IPv4/IPv6 address to an approximate human-readable location string
// using the free ip-api.com service (no API key required, 45 req/min on HTTP).
//
// At the target volume of <100 emails/month this limit will never be approached.
//
// IMPORTANT: This function MUST never throw — any failure (network error, bad
// response, rate limit) returns null silently. The caller (pixel route) still
// logs the OpenEvent even if location is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Private IP address ranges — these will never resolve to a real geo location.
 * We skip the API call entirely for these, returning null immediately.
 */
const PRIVATE_IP_RANGES = [
  /^127\./,             // IPv4 loopback
  /^10\./,              // RFC 1918 private
  /^172\.(1[6-9]|2\d|3[01])\./,  // RFC 1918 private
  /^192\.168\./,        // RFC 1918 private
  /^::1$/,              // IPv6 loopback
  /^fc00:/i,            // IPv6 unique local
  /^fe80:/i,            // IPv6 link-local
];

/**
 * Returns true if the IP address is a private/loopback address.
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIp(ip) {
  return PRIVATE_IP_RANGES.some((pattern) => pattern.test(ip));
}

/**
 * Looks up an approximate location for the given IP address.
 *
 * @param {string} ip - IPv4 or IPv6 address string
 * @returns {Promise<string|null>} - "City, Region, Country" or null on any failure
 */
async function geoLookup(ip) {
  // Skip private/loopback IPs — no meaningful location to resolve
  if (!ip || isPrivateIp(ip)) {
    return null;
  }

  try {
    // Use Node 18+ built-in fetch (no extra dependencies needed)
    // Fields param reduces response payload to only what we need
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(3000), // 3-second timeout — don't block the pixel response
    });

    if (!response.ok) {
      // Non-2xx: rate limited or server error — fail silently
      return null;
    }

    const data = await response.json();

    if (data.status !== 'success') {
      // ip-api returns { status: 'fail' } for reserved/invalid IPs
      return null;
    }

    // Build a human-readable location string, omitting empty parts
    const parts = [data.city, data.regionName, data.country].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;

  } catch (err) {
    // Network error, timeout, JSON parse failure — all handled the same way
    // Log at debug level so it's visible in dev but doesn't pollute prod logs
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[geoLookup] Failed for IP ${ip}:`, err.message);
    }
    return null;
  }
}

module.exports = { geoLookup };
