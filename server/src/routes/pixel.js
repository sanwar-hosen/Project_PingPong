'use strict';

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prismaClient');
const { geoLookup } = require('../lib/geoLookup');

// ─────────────────────────────────────────────────────────────────────────────
// 1x1 Transparent GIF — canonical 35-byte GIF89a payload
//
// This is a well-known constant. Hardcoded here to avoid any file I/O on the
// hot path. Every byte is the actual GIF89a binary for a 1x1 transparent image.
// ─────────────────────────────────────────────────────────────────────────────
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// ─────────────────────────────────────────────────────────────────────────────
// Utility: extract the real client IP, accounting for Railway's reverse proxy.
//
// Railway (and most hosting platforms) pass the original client IP in
// the x-forwarded-for header as a comma-separated list:
//   "client_ip, proxy1_ip, proxy2_ip"
// We want the FIRST (leftmost) value — that's the original requester.
// ─────────────────────────────────────────────────────────────────────────────
function extractIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // Take the first IP in the chain (the actual client)
    return forwarded.split(',')[0].trim();
  }
  // Fallback to direct socket address (works in local dev without a proxy)
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /pixel/:trackingId.gif
//
// Called by email clients when the recipient opens a tracked email.
//
// RELIABILITY GUARANTEE (PRD §6.2):
//   This route must NEVER return an error response visible to the email client.
//   Even if the database write fails, we still return the GIF.
//   The outer try/catch around the DB work ensures this.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:trackingId.gif', async (req, res) => {
  // ── Step 1: Send image headers immediately ───────────────────────────────
  // Setting headers before the async DB work ensures the response metadata
  // is correct regardless of what happens next.
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Content-Length', TRANSPARENT_GIF.length);
  // Cache-busting: force every open to re-request the pixel from the server,
  // rather than serving a cached version locally (which would skip our logging).
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const { trackingId } = req.params;
  const ipAddress = extractIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';

  // ── Step 2: Log the open event (wrapped in try/catch for reliability) ─────
  try {
    // Geo-lookup runs concurrently while we do the DB upsert.
    // We await both, but if geo fails it returns null — no blocking.
    const [approxLocation] = await Promise.allSettled([
      geoLookup(ipAddress),
    ]).then((results) => results.map((r) => (r.status === 'fulfilled' ? r.value : null)));

    // ── Upsert the Email row ──────────────────────────────────────────────
    // If the extension called POST /api/emails first (the happy path), this
    // email row already exists. If it didn't (e.g. the extension failed or
    // was disabled), we auto-create a minimal row so we don't lose the open.
    await prisma.email.upsert({
      where: { id: trackingId },
      create: {
        id: trackingId,
        sentAt: new Date(),
        // subject and recipient left null — may be backfilled later via POST /api/emails
      },
      update: {
        // Don't overwrite existing data if the email was already registered
      },
    });

    // ── Insert the OpenEvent ──────────────────────────────────────────────
    await prisma.openEvent.create({
      data: {
        emailId: trackingId,
        ipAddress,
        userAgent,
        approxLocation,   // null if lookup failed — that's fine
        recipientHint: null, // Reserved for v2 per-recipient attribution
      },
    });

    console.log(
      `[pixel] Open logged | trackingId=${trackingId} | ip=${ipAddress} | location=${approxLocation ?? 'unknown'}`
    );

  } catch (err) {
    // DB write failed — log the error server-side, but DO NOT surface it
    // to the email client. The GIF must still be returned.
    console.error(`[pixel] Failed to log open event | trackingId=${trackingId} | error:`, err.message);
  }

  // ── Step 3: Always return the GIF ────────────────────────────────────────
  // This runs regardless of whether the DB write succeeded or failed.
  res.end(TRANSPARENT_GIF);
});

module.exports = router;
