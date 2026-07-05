'use strict';

const { PrismaClient } = require('@prisma/client');

// ─────────────────────────────────────────────────────────────────────────────
// Singleton PrismaClient
//
// In production: one instance is shared across all requests.
// In development with nodemon hot-reload: Node's module cache preserves the
// instance between file-change restarts, avoiding connection pool exhaustion.
//
// The globalThis trick is the Prisma-recommended pattern for dev environments:
// https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices
// ─────────────────────────────────────────────────────────────────────────────

/** @type {PrismaClient} */
let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error', 'warn'],
  });
} else {
  // In development, attach to globalThis so nodemon restarts don't create new clients
  if (!globalThis.__prisma) {
    globalThis.__prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
    });
  }
  prisma = globalThis.__prisma;
}

module.exports = prisma;
