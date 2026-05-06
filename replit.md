# CTS BPO — AI Business Process Outsourcing Platform

## Stack
- **Backend:** Node.js 20 + Express (port 3001 dev / PORT env prod)
- **Frontend:** React 18 CRA (port 5000 dev)
- **Database:** Supabase PostgreSQL (pg)
- **Email:** Multi-provider: SendGrid API (SENDGRID_API_KEY) → Mailgun (MAILGUN_API_KEY + MAILGUN_DOMAIN) → Gmail SMTP (GMAIL_APP_PASSWORD) — auto-detected in priority order
- **PDF:** pdfkit (branded invoice generation)
- **WhatsApp/SMS:** Twilio (optional — needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)

## New Features (May 2026 — Intelligence Layers)

### 1. Email Domain Verification (MX Records)
- Module: `backend/src/modules/email-verifier.js`
- DNS MX record lookup for every scraped domain; 7-day in-memory + file cache
- Disposable domain blocklist (gmail.com, yahoo.com, etc.) auto-excluded
- `runMxScoringBatch()` in web-scraper.js runs every 20 queries (background, async)
- Results stored as `mx_verified BOOLEAN` on `scraped_contacts`; outreach query filters out `mx_verified = FALSE`

### 2. AI Prospect Scoring
- Module: `backend/src/modules/prospect-scorer.js`
- Each contact scored 0–100: MX verified (+35), business type (+25), source quality (+25), BPO signals (+10), name completeness (+5)
- Score stored as `prospect_score INTEGER` on `scraped_contacts`
- Outreach pipeline sorted by `prospect_score DESC` — highest-value contacts emailed first

### 3. Email Analytics & Auto-Improving Templates
- Module: `backend/src/modules/email-analytics.js`
- Tables: `email_tracking` (per-email open/click tokens), `template_performance` (per-variant aggregates)
- Every outreach email gets a unique tracking token embedded as a 1×1 pixel GIF
- Open tracking: `GET /t/o/:token` → serves pixel + records event (public, no auth)
- Click tracking: `GET /t/c/:token?u=` → redirect + records event (public, no auth)
- Auto-improve: `pickBestVariant()` uses Thompson sampling — variants with higher open+click rates chosen more often; untested variants get exploration bonus
- Analytics API: `GET /api/analytics/email` (auth required)
- Frontend: "📈 Email Analytics" tab in AI Agent Dashboard

### 4. Value Proposition Layer
- 12 rotating one-liner benefit statements injected into every cold outreach + follow-up email
- Rendered as a styled teal callout block in the HTML email
- Different prop each send — builds impression over multiple touches

## New Features (May 2026)

### Targeted Scraper Page (`/targeted-scraper`)
- Frontend: `frontend/src/components/TargetedScraper.js`
- Nav: "🎯 Targeted" link in admin header
- UI: Country dropdown (16 options), Industry dropdown (19 options), Keywords freetext, target count (25/50/100)
- Activate button kicks off a background scrape focused on the chosen parameters (up to 100 unique contacts)
- Results table appears as contacts are scraped (auto-polls every 4s); checkbox selection
- Compose area: subject + body with {{company}} placeholder; drag-and-drop PDF attachment
- Send button dispatches personalised emails to all selected contacts with the optional PDF attached
- Backend: `runTargetedScrape()` in `web-scraper.js`; contacts tagged `source=targeted_<sessionId>`
- API endpoints: `POST /api/targeted-scrape/start`, `GET /api/targeted-scrape/status`, `POST /api/targeted-scrape/send`
- Email circuit breaker (from autonomous-agent.js) protects against Gmail lockouts

### Email Circuit Breaker
- `emailCircuit` object in `autonomous-agent.js`; trips after 2 consecutive auth failures
- Pauses ALL outreach for 1 hour automatically; resets on first successful send
- Logs `🚫 [EMAIL CIRCUIT] Tripped` to console and activity log

### Web Scraper — Multi-Source Lead Acquisition
- Module: `backend/src/modules/web-scraper.js`
- Table: `scraped_contacts` (company, domain, email, phone, address, city, country, business_type, source, status)
- Sources:
  1. **Google Places API (new v1)** — 15 queries/run × 20 businesses × 7 email variants = 2,100 contacts/run. Uses existing `GOOGLE_API_KEY`. Searches 25 business types across 25 cities. Stays within $200/mo free credit.
  2. **Google Custom Search API** — 10 queries/run, 10 results each, needs `GOOGLE_API_KEY` + `GOOGLE_CSE_ID` (free: 100 queries/day)
  3. **DuckDuckGo HTML scraping** — 12 queries/run, no auth needed, cheerio parsing
  4. **SerpAPI BPO queries** — 5 additional targeted BPO prospect queries using existing `SERPAPI_KEY`
- Cron: every 6 hours; outreach from scraped_contacts: every 5 mins; follow-ups: every 2 hours
- Admin trigger: `web_scrape`, `scrape_outreach`, `scrape_followup`
- Frontend: "Scraped Contacts" tab in AIAgentDashboard with stats + full contact table
- Env vars: `PLACES_QUERIES_PER_RUN` (default 15), `CSE_QUERIES_PER_RUN` (default 10), `DDG_QUERIES_PER_RUN` (default 12), `SCRAPE_DELAY_MS` (default 1200)
- New secret needed: `GOOGLE_CSE_ID` — create at cse.google.com with your GOOGLE_API_KEY

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
