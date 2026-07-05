'use strict';

const express = require('express');
const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard routes — Phase 3
//
// This file is a placeholder that will be fully implemented in Phase 3.
// The routes below return a temporary 'coming soon' response so the server
// starts cleanly and the route structure is already wired up.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Middleware: validates the DASHBOARD_SECRET token from ?key= query param.
 * Phase 3 will enforce this; for now it's a no-op stub.
 */
function requireDashboardAuth(req, res, next) {
  // TODO (Phase 3): enforce secret token check
  // const secret = process.env.DASHBOARD_SECRET;
  // if (!secret || req.query.key !== secret) {
  //   return res.status(401).send('Unauthorized');
  // }
  next();
}

// GET /dashboard
router.get('/', requireDashboardAuth, (req, res) => {
  res.status(200).send('<h1>PingPong Dashboard</h1><p>List view — coming in Phase 3.</p>');
});

// GET /dashboard/email/:id
router.get('/email/:id', requireDashboardAuth, (req, res) => {
  res.status(200).send('<h1>PingPong Dashboard</h1><p>Detail view — coming in Phase 3.</p>');
});

module.exports = router;
