# ── Stage 1: Builder ──────────────────────────────────────────────────────────
# Use node:20-slim (Debian-based, not Alpine) — Alpine's musl libc causes
# Prisma engine binaries to fail with OpenSSL detection errors at runtime.
FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL — required by Prisma engine binaries on Debian slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

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
FROM node:20-slim AS production

WORKDIR /app

# Install OpenSSL — required by Prisma engine binaries at runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy everything from builder (node_modules, src, prisma, generated client)
COPY --from=builder /app ./

# Expose port (Railway sets PORT env var automatically)
EXPOSE 3000

# Run migrations then start server.
# Use node_modules/.bin/prisma directly — it's already present from the builder copy.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node src/index.js"]
