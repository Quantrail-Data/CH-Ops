# CHOps - Multi-stage Docker build
# Stage 1: Install dependencies and build the frontend
# Stage 2: Copy only what's needed into a slim runtime image
#
# Build:  docker build -t chops .
# Run:    docker run -p 3000:3000 --env-file .env chops
# Or:     docker compose up

# --- Stage 1: Build ---
FROM oven/bun:1.3.13-alpine AS builder
WORKDIR /app
# Install dependencies first (cached unless package.json changes)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
# Copy source and build the frontend
COPY . .
RUN bun run build
# Remove dev dependencies after build
RUN rm -rf node_modules && bun install --frozen-lockfile --production

# --- Stage 2: Runtime ---
FROM oven/bun:1.3.13-alpine
WORKDIR /app
# Non-root user for security
RUN addgroup -S chops && adduser -S chops -G chops
# Copy built app and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src/backend ./src/backend
COPY --from=builder /app/src/shared ./src/shared
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/version.json ./version.json
COPY --from=builder /app/package.json ./package.json
# Create data directory for SQLite (persisted via volume)
RUN mkdir -p /app/data && chown -R chops:chops /app
USER chops
# Default environment
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
# Start the server
CMD ["bun", "run", "src/backend/server.js"]
