'use strict';

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prismaClient');

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard routes — Phase 3: List View
//
// Protected by DASHBOARD_SECRET. Access via:
//   GET /dashboard?key=<DASHBOARD_SECRET>
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Middleware: validates the DASHBOARD_SECRET token from ?key= query param or a session cookie.
 * The secret is read from the DASHBOARD_SECRET environment variable.
 * If missing or mismatched, responds with 401.
 */
function requireDashboardAuth(req, res, next) {
  const secret = process.env.DASHBOARD_SECRET;

  // If DASHBOARD_SECRET is not configured, deny all access as a safety measure
  if (!secret) {
    console.warn('[dashboard] DASHBOARD_SECRET is not set — denying access');
    return res.status(401).send('Unauthorized — DASHBOARD_SECRET not configured');
  }

  // Parse cookies manually to avoid external dependencies
  const cookies = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      const key = parts.shift().trim();
      const val = parts.join('=');
      try {
        cookies[key] = decodeURIComponent(val);
      } catch (e) {
        cookies[key] = val;
      }
    });
  }

  const queryKey = req.query.key;
  const cookieKey = cookies['pingpong_secret'];

  if (queryKey === secret) {
    // Set/refresh cookie (30 days expiry)
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieFlags = `Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${isProduction ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', `pingpong_secret=${secret}; ${cookieFlags}`);
    res.locals.dashboardKey = secret;
    return next();
  }

  if (cookieKey === secret) {
    res.locals.dashboardKey = secret;
    return next();
  }

  return res.status(401).send('Unauthorized — invalid or missing ?key= parameter or session cookie');
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /dashboard?key=<secret>
//
// List view: all tracked emails with open counts, sorted newest-first.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireDashboardAuth, async (req, res, next) => {
  try {
    const emails = await prisma.email.findMany({
      orderBy: { sentAt: 'desc' },
      include: {
        _count: {
          select: { opens: true },
        },
        // Fetch only the most recent open event for the "Last Opened" column
        opens: {
          orderBy: { openedAt: 'desc' },
          take: 1,
          select: { openedAt: true },
        },
      },
    });

    if (req.query.format === 'json') {
      return res.json({ emails });
    }

    res.render('list', {
      title: 'Tracked Emails',
      emails,
      dashboardKey: res.locals.dashboardKey,
    });
  } catch (err) {
    console.error('[dashboard] Failed to load email list:', err.message);
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /dashboard/email/:id?key=<secret>
//
// Detail view — Phase 4: full open history for a single tracked email.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/email/:id', requireDashboardAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch the email with ALL open events, sorted oldest-first (chronological)
    const email = await prisma.email.findUnique({
      where: { id },
      include: {
        opens: {
          orderBy: { openedAt: 'asc' },
        },
      },
    });

    if (!email) {
      return res.status(404).send('Email not found');
    }

    // Parse User-Agent strings into human-readable labels
    const { parseUserAgent } = require('../lib/userAgentParser');
    const opensWithParsedUA = email.opens.map((open, index) => ({
      ...open,
      openNumber: index + 1,
      parsedUA: parseUserAgent(open.userAgent),
    }));

    // ── Build "opens over time" data for the mini timeline chart ──────────
    // Group open events by date (YYYY-MM-DD) and count per day.
    const opensByDay = {};
    email.opens.forEach((open) => {
      const dayKey = new Date(open.openedAt).toISOString().slice(0, 10); // "2026-07-05"
      opensByDay[dayKey] = (opensByDay[dayKey] || 0) + 1;
    });

    // Convert to sorted array for the chart
    const timelineData = Object.entries(opensByDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Find the max count for scaling bar heights
    const maxDayCount = timelineData.reduce((max, d) => Math.max(max, d.count), 0);

    if (req.query.format === 'json') {
      return res.json({
        email,
        opens: opensWithParsedUA,
        timelineData,
        maxDayCount
      });
    }

    res.render('detail', {
      title: `${email.subject || '(No subject)'} — Detail`,
      email,
      opens: opensWithParsedUA,
      timelineData,
      maxDayCount,
      dashboardKey: res.locals.dashboardKey,
    });
  } catch (err) {
    console.error('[dashboard] Failed to load email detail:', err.message);
    next(err);
  }
});

module.exports = router;
