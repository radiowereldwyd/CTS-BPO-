# CTS BPO – Deployment Guide

## Overview

This guide explains how to deploy CTS BPO to production using Docker and GitHub Actions.

---

## Prerequisites

- Docker and Docker Compose installed on the target server.
- Node.js 18+ for local development.
- PostgreSQL database (cloud or self-hosted).
- Redis instance for caching.
- Ozow API credentials.
- GitHub Secrets configured (see below).

---

## GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `DOCKER_USERNAME` | Docker Hub username |
| `DOCKER_PASSWORD` | Docker Hub password or access token |
| `OZOW_API_KEY` | Ozow payment gateway API key |
| `OZOW_API_URL` | Ozow API base URL |
| `DB_HOST` | PostgreSQL host |
| `DB_PORT` | PostgreSQL port (default: 5432) |
| `DB_NAME` | Database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | JWT signing secret (min 32 chars) |

---

## Local Development

```bash
# Clone the repository
git clone https://github.com/radiowereldwyd/CTS-BPO-.git
cd CTS-BPO-

# Backend setup
cd backend
cp .env.example .env   # Fill in your credentials
npm install
npm run dev

# Frontend setup (new terminal)
cd frontend
npm install
npm start
```

---

## Docker Deployment

```bash
# Build the backend image
docker build -f ci-cd/Dockerfile -t ctsbpo/backend:latest ./backend

# Run with environment variables
docker run -d \
  --name cts-bpo-backend \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DB_HOST=your-db-host \
  -e DB_NAME=ctsbpo \
  -e DB_USER=ctsbpo_user \
  -e DB_PASSWORD=your-password \
  -e OZOW_API_KEY=your-ozow-key \
  -e OZOW_API_URL=https://api.ozow.com \
  -e JWT_SECRET=your-jwt-secret \
  ctsbpo/backend:latest
```

---

## Database Setup

```bash
# Connect to your PostgreSQL instance and run:
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f database/schema.sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f database/seed-data.sql
```

---

## CI/CD Pipeline

The GitHub Actions pipeline (`ci-cd/github-actions.yml`) automatically:

1. Runs backend and frontend tests on every push and PR.
2. Builds and pushes the Docker image to Docker Hub on merge to `main`.
3. Deploys to the production server.

Configure the deploy step in `github-actions.yml` with your target server details (AWS, Azure, or GCP).

---

## Monitoring

- Access the dashboard at `http://your-server:3000` (or your configured domain).
- Health check endpoint: `GET /health`
- All events are logged in the `audit_trails` database table.
