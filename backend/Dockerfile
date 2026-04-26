# Use official Node.js LTS image (small Alpine variant for fast startup)
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install ONLY production dependencies
RUN npm ci --only=production

# Copy the rest of the backend source code
COPY . .

# Cloud Run will inject PORT env var, but default to 8000
ENV PORT=8000
EXPOSE 8000

# Health check (Cloud Run uses HTTP probes)
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Start the backend
CMD ["node", "server.js"]