# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps --silent
COPY frontend/ .
RUN CI=false DISABLE_ESLINT_PLUGIN=true npm run build

# ── Stage 2: Production backend (serves built frontend) ───────────────────────
FROM node:20-alpine AS production
WORKDIR /app/backend

# Install production deps only
COPY backend/package*.json ./
RUN npm ci --only=production --silent

# Copy backend source
COPY backend/ .

# Copy built React app into the location the backend serves it from
COPY --from=frontend-build /app/frontend/build /app/frontend/build

# Ensure runtime data directory exists (json files are auto-created on first run)
RUN mkdir -p /app/backend/data /app/backend/uploads

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Health check — backend exposes /health
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

CMD ["node", "src/index.js"]
