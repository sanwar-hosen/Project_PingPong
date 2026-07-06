'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Load environment variables from .env (local dev only; Railway injects them)
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();

const express = require('express');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Route modules
// ─────────────────────────────────────────────────────────────────────────────
const pixelRouter = require('./routes/pixel');
const apiRouter = require('./routes/api');
const dashboardRouter = require('./routes/dashboard');

// ─────────────────────────────────────────────────────────────────────────────
// App setup
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────────────────────

// CORS Middleware to allow requests from the Chrome Extension
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin.startsWith('chrome-extension://')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Parse JSON bodies (for POST /api/emails from the extension)
app.use(express.json());

// Parse URL-encoded form bodies (not strictly needed now, but good practice)
app.use(express.urlencoded({ extended: false }));

// Serve static assets (CSS for dashboard, etc.)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Configure EJS as the view engine (used by Phase 3 dashboard)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Trust proxy ──────────────────────────────────────────────────────────────
// Railway sits behind a reverse proxy. This tells Express to trust the
// x-forwarded-for header so req.ip reflects the real client IP.
// '1' means trust one level of proxy (Railway's load balancer).
app.set('trust proxy', 1);

// ── Routes ───────────────────────────────────────────────────────────────────

// Health check — used by Railway's deployment health check (see railway.json)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Pixel tracking endpoint: GET /pixel/:trackingId.gif
app.use('/pixel', pixelRouter);

// Email pre-registration API: POST /api/emails
app.use('/api', apiRouter);

// Dashboard: GET /dashboard, GET /dashboard/email/:id (Phase 3)
app.use('/dashboard', dashboardRouter);

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ─────────────────────────────────────────────────────
// Catches any unhandled errors from route handlers
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏓 PingPong server running on port ${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/health`);
  console.log(`   Pixel:     http://localhost:${PORT}/pixel/test-id.gif`);
  console.log(`   Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`   Env:       ${process.env.NODE_ENV || 'development'}\n`);
});
