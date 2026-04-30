# CTS BPO — AI Business Process Outsourcing Platform

## Stack
- **Backend:** Node.js 20 + Express (port 3001 dev / PORT env prod)
- **Frontend:** React 18 CRA (port 5000 dev)
- **Database:** Supabase PostgreSQL (pg)
- **Email:** Gmail SMTP via nodemailer (GMAIL_APP_PASSWORD)
- **PDF:** pdfkit (branded invoice generation)
- **WhatsApp/SMS:** Twilio (optional — needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)

## New Features (April 2026)

### 1. Analytics & Revenue Dashboard (`/analytics`)
- Frontend: `frontend/src/components/AnalyticsDashboard.js` — recharts with 5 tabs
- Backend: `GET /api/analytics` — revenue by month, jobs by service type, lead funnel, sub stats, activity
- KPI cards: Total Revenue, Monthly Revenue, Total Jobs, Active Subs, Total Leads, Profit Margin

### 2. PDF Invoice Generator
- Module: `backend/src/modules/pdf-invoice.js`
- Endpoint: `GET /api/client/invoice/:token/pdf` — downloads branded PDF invoice
- Automatically included as a link in delivery emails

### 3. Client Portal (`/client/portal/:token`)
- Public route — no login needed, accessed via token in delivery email
- Frontend: `frontend/src/components/ClientPortal.js`
- Backend: `backend/src/routes/client-portal.js` → mounted at `/api/client`
- Features: view all jobs, download completed work, download PDF invoice, upload source files
- Delivery email now includes "View Client Portal" and "Download Invoice" buttons

### 4. Subcontractor Performance Tracking
- Backend: `GET /api/subcontractors/performance` — per-sub quality scores, on-time rate, earnings, tier
- Frontend: New "⭐ Performance" tab in SubcontractorHub
- Tier system: Gold (≥90%), Silver (75–89%), Bronze (<75%)
- Visual leaderboard with quality score progress bars

### 5. WhatsApp Notifications
- Module: `backend/src/modules/whatsapp-notifier.js`
- Gracefully stubs if Twilio not configured (just logs to console)
- Functions: notifySubJobAssigned, notifySubPayoutReleased, notifyClientDelivery, notifyClientOverdue
- Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM as env secrets to activate

## Architecture
- Backend serves React build from `frontend/build` in production
- JWT auth via `backend/src/middleware/auth.js`
- All business logic in `backend/src/modules/`
- Frontend routes in `frontend/src/App.js`

## Autonomous AI Agent (`backend/src/modules/autonomous-agent.js`)
Runs on boot, no human involvement required:
- **Every 2 hours:** SerpAPI lead search (12 BPO queries) → auto cold-outreach email to every discovered lead
- **Every 6 hours:** Day-3 and day-7 follow-up emails to non-responding leads
- **Every 30 min:** Acknowledge new subcontractor applications; auto-approve applications > 24h old
- **Every 1 hour:** Match outstanding jobs to approved subcontractors and notify via email
- **Tables:** `ai_activity_log`, `ai_leads` (auto-created on startup)

### Autonomous Agent API Routes
- `GET /api/ai-agent/status` — live agent state (counts, timestamps)
- `GET /api/ai-agent/activity` — full activity log
- `GET /api/ai-agent/leads` — all discovered leads
- `POST /api/ai-agent/trigger/:task` — force run (lead_search | followup | applications | contracts | all)

### Email Functions (autonomous)
`sendClientColdOutreach`, `sendClientFollowUp`, `sendSubcontractorAcknowledgment`, `sendSubcontractorApproval`, `sendContractAssignment` — all in `email-outreach.js`

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
