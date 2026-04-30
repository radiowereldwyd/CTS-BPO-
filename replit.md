# CTS BPO — AI Business Process Outsourcing Platform

## Stack
- **Backend:** Node.js 20 + Express (port 3001 dev / PORT env prod)
- **Frontend:** React 18 CRA (port 5000 dev)
- **Database:** Supabase PostgreSQL (pg)
- **Email:** Gmail SMTP via nodemailer (GMAIL_APP_PASSWORD)

## Architecture
- Backend serves React build from `frontend/build` in production
- JWT auth via `backend/src/middleware/auth.js`
- All business logic in `backend/src/modules/`
- Frontend routes in `frontend/src/App.js`

## Key Routes (Backend)
- `GET /api/metrics` — dashboard KPIs
- `GET /api/summary` — comprehensive ops summary (clients, subs, contracts, jobs, revenue)
- `GET /api/subcontractors/applications` — list applications
- `POST /api/subcontractors/applications` — submit application (public)
- `PATCH /api/subcontractors/applications/:id` — approve/reject (admin)
- `GET /api/subcontractors/jobs` — list job assignments
- `POST /api/subcontractors/jobs` — create job assignment (admin)
- `PATCH /api/subcontractors/jobs/:id` — update job status
- `POST /api/subcontractors/jobs/remind` — send reminder emails (admin)
- `POST /api/subcontractors/recruit` — send recruitment emails (admin)

## Frontend Pages
- `/` Dashboard
- `/subcontractors` Subcontractor Hub (Summary · Recruitment · Applications · Subcontractors · Jobs)
- `/job-search` AI Job Search
- `/ai-services` Google AI Services
- `/email-templates` Email Templates
- `/payments` Payments
- `/status` Module Status
- `/failed-contracts` Failed Contracts
- `/pricing` Pricing
- `/global-markets` Global Markets
- `/profit-projection` Profit Projection

## Subcontractor Business Model
- Subcontractor desires X earnings/month
- Platform fee = X × 50% (charged to sub)
- Job value allocated = X × 1.5
- CTS margin = X × 50%
- Client identity and contract values are hidden from subcontractors

## Database Tables
- `clients`, `subcontractors`, `contracts`, `transactions`
- `ai_metrics`, `audit_trails`, `system_logs`, `users`
- `job_leads` (dynamic, created by job-search module)
- `subcontractor_applications` (dynamic, created on startup)
- `subcontractor_jobs` (dynamic, created on startup)

## Secrets Required
- `GMAIL_APP_PASSWORD` — Gmail SMTP
- `GOOGLE_API_KEY`, `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_DOCAI_PROCESSOR_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`
- `SERPAPI_KEY` — job search
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`
- `OZOW_API_KEY`, `OZOW_PRIVATE_KEY`, `OZOW_SITE_CODE` (pending Ozow activation)
- `APP_URL` — set to your published `.replit.app` URL for correct email links

## Deployment
- Build: `cd frontend && npm install && npm run build`
- Run: `node backend/src/index.js`
- Autoscale deployment configured in `.replit`
