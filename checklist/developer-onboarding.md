# CTS BPO – Developer Onboarding Guide

## 🎯 Goal

This guide helps new developers get up and running quickly on the CTS BPO project. Follow the steps below to set up your environment and make your first contribution.

---

## 1️⃣ Environment Setup

- Install **Node.js v18 or higher**: https://nodejs.org
- Install **npm** (comes with Node.js) or **yarn**.
- Install **Docker**: https://docs.docker.com/get-docker/
- Install **PostgreSQL** (v14+): https://www.postgresql.org/download/
- Install **Redis**: https://redis.io/docs/getting-started/

---

## 2️⃣ Repository Setup

```bash
# Clone the repository
git clone https://github.com/radiowereldwyd/CTS-BPO-.git
cd CTS-BPO-

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

Configure your `.env` file in `backend/`:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=ctsbpo
DB_USER=postgres
DB_PASSWORD=your_password

REDIS_URL=redis://localhost:6379

OZOW_API_URL=https://api.ozow.com
OZOW_API_KEY=your_ozow_api_key

JWT_SECRET=your_jwt_secret_minimum_32_characters
```

---

## 3️⃣ Database Setup

```bash
# Create the database
createdb ctsbpo

# Run schema migration
psql -d ctsbpo -f database/schema.sql

# Load seed data
psql -d ctsbpo -f database/seed-data.sql
```

Verify that all tables have been created:
- `clients`
- `subcontractors`
- `contracts`
- `transactions`
- `ai_metrics`
- `audit_trails`
- `system_logs`
- `schema_migrations`

---

## 4️⃣ Backend

```bash
cd backend
npm run dev   # Starts the Node.js server with hot-reload (nodemon)
```

The server runs at `http://localhost:3000`.

Key modules to understand:

| Module | File | Purpose |
|--------|------|---------|
| AI Negotiation | `src/modules/negotiation.js` | Dynamic pricing and deal closing |
| Contract Manager | `src/modules/contract-manager.js` | Contract analysis and routing |
| Subcontractor Assignment | `src/modules/subcontractor-assignment.js` | Work assignment |
| Payment Gateway | `src/modules/payment-gateway.js` | Ozow payment integration |
| Audit Logger | `src/modules/audit-logger.js` | Event logging and compliance |

---

## 5️⃣ Frontend

```bash
cd frontend
npm start   # Starts the React development server
```

The app runs at `http://localhost:3001` (or `3000` if backend is on a different port).

Key components:

| Component | File | Purpose |
|-----------|------|---------|
| Dashboard | `src/components/Dashboard.js` | Main overview + AI Initiate button |
| Status Panel | `src/components/StatusPanel.js` | Live AI module status |
| Failed Contracts | `src/components/FailedContracts.js` | Failed contract audit view |
| Pricing Table | `src/components/PricingTable.js` | Tier pricing display |

---

## 6️⃣ CI/CD

- Review `ci-cd/github-actions.yml` for the full pipeline.
- Test the Docker build locally: `docker build -f ci-cd/Dockerfile -t cts-bpo-test ./backend`
- Read `ci-cd/deployment-guide.md` for production deployment steps.

---

## 7️⃣ Branding

- Use `branding/logo.png` and follow `branding/brand-kit.md` for colors and fonts.
- Keep visual identity consistent across all components.

---

## 8️⃣ Financial Documentation

- Read `finance/financial-projection.md` for the income model.
- Understand the pricing tiers: Starter (R5,000), Growth (R15,000), Enterprise (R50,000).

---

## 9️⃣ First Commit Checklist

- [ ] Repository cloned and dependencies installed
- [ ] `.env` file configured
- [ ] Database set up and seed data loaded
- [ ] Backend running locally (`npm run dev`)
- [ ] Frontend running locally (`npm start`)
- [ ] Health check passing: `GET http://localhost:3000/health`
- [ ] CI/CD pipeline reviewed
- [ ] Branding guidelines read
- [ ] README.md and this guide read

---

## 📌 Key Principles

CTS BPO is **fully AI-driven**. Your role as a developer is to build and refine the infrastructure, UI, and integrations. The AI modules handle the operational logic automatically. Maintain code quality, audit logging, and compliance at all times.
