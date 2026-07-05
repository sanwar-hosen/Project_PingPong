'use strict';

const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const prisma = require('../lib/prismaClient');

// ─────────────────────────────────────────────────────────────────────────────
// Utility: basic UUID v4 format validation
// Accepts the standard 8-4-4-4-12 hex format.
// ─────────────────────────────────────────────────────────────────────────────
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/emails
//
// Called by the Chrome extension immediately before (or at) send time to
// pre-register email metadata (subject, recipient) for a given tracking ID.
//
// This enriches the dashboard data beyond just a bare tracking ID.
//
// If called AFTER the pixel has already been hit (edge case: somehow the
// email was opened before this ran), we still update the existing row.
//
// Body: { trackingId: string, subject?: string, recipient?: string }
// Returns: { success: true, id: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/emails', async (req, res) => {
  const { trackingId, subject, recipient } = req.body ?? {};

  // ── Validation ───────────────────────────────────────────────────────────
  if (!trackingId) {
    return res.status(400).json({
      success: false,
      error: 'trackingId is required',
    });
  }

  if (!isValidUuid(trackingId)) {
    return res.status(400).json({
      success: false,
      error: 'trackingId must be a valid UUID v4',
    });
  }

  try {
    // ── Upsert Email row ─────────────────────────────────────────────────
    // create: fresh email registration (normal flow — extension registers before send)
    // update: backfill metadata if the pixel auto-created the row already
    const email = await prisma.email.upsert({
      where: { id: trackingId },
      create: {
        id: trackingId,
        subject: subject?.trim() || null,
        recipient: recipient?.trim() || null,
        sentAt: new Date(),
      },
      update: {
        // Only update subject/recipient if provided and not empty
        ...(subject?.trim() && { subject: subject.trim() }),
        ...(recipient?.trim() && { recipient: recipient.trim() }),
      },
    });

    console.log(
      `[api] Email registered | id=${email.id} | subject="${email.subject ?? '(none)'}" | recipient="${email.recipient ?? '(none)'}"`
    );

    return res.status(200).json({
      success: true,
      id: email.id,
    });

  } catch (err) {
    console.error('[api] Failed to register email:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

module.exports = router;
