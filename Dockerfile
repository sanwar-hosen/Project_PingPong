# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files AND the prisma schema before npm install.
# The postinstall script runs "prisma generate" which needs the schema file.
COPY server/package*.json ./
COPY server/prisma ./prisma

# Install ALL deps (including devDependencies like prisma CLI) so
# postinstall can run "prisma generate" successfully.
RUN npm ci

# Copy the rest of the server source
COPY server/src ./src
COPY server/public ./public

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Copy everything from builder (node_modules, src, prisma, generated client)
COPY --from=builder /app ./

# Expose port (Railway sets PORT env var automatically)
EXPOSE 3000

# Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
