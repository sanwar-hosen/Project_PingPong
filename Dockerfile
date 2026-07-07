# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files from the server subdirectory
COPY server/package*.json ./
RUN npm ci --only=production

# Copy the rest of the server source
COPY server/ ./

# Generate Prisma client
RUN npx prisma generate

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder /app ./

# Expose port (Railway sets PORT env var automatically)
EXPOSE 3000

# Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
