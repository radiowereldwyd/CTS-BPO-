require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const multer  = require('multer');

const negotiation = require('./modules/negotiation');
const contractManager = require('./modules/contract-manager');
const subcontractorAssignment = require('./modules/subcontractor-assignment');
const paymentGateway = require('./modules/payment-gateway');
const auditLogger = require('./modules/audit-logger');
const emailOutreach = require('./modules/email-outreach');
const jobSearch        = require('./modules/job-search');
const googleTranslate  = require('./modules/google-translate');
const googleSpeech     = require('./modules/google-speech');
const googleNlp        = require('./modules/google-nlp');
const documentAi       = require('./modules/document-ai');
const gmailReader      = require('./modules/gmail-reader');
const db = require('./db');
const authRouter = require('./routes/auth');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const autonomousAgent = require('./modules/autonomous-agent');
const webScraper      = require('./modules/web-scraper');
const clientPortalRouter = require('./routes/client-portal');
const emailAnalytics  = require('./modules/email-analytics');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

// CORS – allow frontend dev server
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Rate limiters
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

app.use(globalLimiter);

const PORT = process.env.PORT || 3000;

// ─── Public routes ────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CTS BPO Backend',
    timestamp: new Date().toISOString(),
    db: db.isConnected() ? 'connected' : 'disconnected (in-memory mode)',
  });
});

// Auth routes (login, me)
app.use('/api/auth', authLimiter, authRouter);

// Subcontractor portal auth
const subAuthRouter = require('./routes/subcontractor-auth');
app.use('/api/sub/auth', authLimiter, subAuthRouter);

// Subcontractor portal
const subPortalRouter = require('./routes/subcontractor-portal');
app.use('/api/sub', subPortalRouter);

// BPO Job Delivery pipeline
const bpoJobsRouter   = require('./routes/bpo-jobs');
app.use('/api/bpo-jobs', bpoJobsRouter);

const callCentreRouter = require('./routes/call-centre');
const linkedInRouter   = require('./routes/linkedin');
app.use('/api/call-centre', callCentreRouter);
app.use('/api/linkedin',   linkedInRouter);
app.use('/api/contact',   require('./routes/contact'));

// ─── Protected routes (require JWT) ──────────────────────────────────────────

// Dashboard metrics — uses actual DB tables (ai_leads, subcontractor_applications, subcontractor_jobs, job_submissions)
app.get('/api/metrics', requireAuth, async (req, res) => {
  try {
    if (!db.isConnected()) {
      return res.json({ activeContracts:0, completedToday:0, totalCompleted:0, totalClients:0, totalLeads:0, respondedLeads:0, totalSubcontractors:0, monthlyRevZar:0, totalRevZar:0, successRate:0, daily:'R 0', aiStatus:'running', uptime:'99.98%', live:false });
    }

    const [leadsR, subsR, jobsR, revenueR, bouncesR] = await Promise.all([
      // Leads from ai_leads
      db.query(`
        SELECT
          COUNT(*)                                                            AS total,
          COUNT(*) FILTER (WHERE status IN ('responded','negotiating','followup1_sent','followup2_sent','outreach_sent')) AS outreached,
          COUNT(*) FILTER (WHERE status IN ('responded','negotiating'))       AS responded,
          COUNT(*) FILTER (WHERE status = 'bounced' OR bounced_at IS NOT NULL) AS bounced
        FROM ai_leads
      `).catch(() => ({ rows:[{ total:0, outreached:0, responded:0, bounced:0 }] })),

      // Subcontractors from subcontractor_applications
      db.query(`
        SELECT
          COUNT(*)                                                   AS total,
          COUNT(*) FILTER (WHERE status = 'approved')               AS approved,
          COUNT(*) FILTER (WHERE status = 'pending')                AS pending,
          COUNT(*) FILTER (WHERE payment_confirmed = TRUE)          AS paid
        FROM subcontractor_applications
      `).catch(() => ({ rows:[{ total:0, approved:0, pending:0, paid:0 }] })),

      // Jobs from subcontractor_jobs
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('assigned','in_progress'))  AS active,
          COUNT(*) FILTER (WHERE status IN ('delivered','confirmed','paid','verified')) AS completed,
          COUNT(*) FILTER (WHERE status IN ('delivered','confirmed','paid') AND updated_at >= CURRENT_DATE) AS completed_today,
          COALESCE(SUM(job_value) FILTER (WHERE status IN ('delivered','confirmed','paid','verified')),0) AS total_revenue,
          COALESCE(SUM(job_value) FILTER (WHERE status IN ('delivered','confirmed','paid','verified')
            AND EXTRACT(MONTH FROM updated_at)=EXTRACT(MONTH FROM NOW())
            AND EXTRACT(YEAR FROM updated_at)=EXTRACT(YEAR FROM NOW())),0) AS monthly_revenue,
          COALESCE(SUM(our_margin) FILTER (WHERE status IN ('delivered','confirmed','paid','verified')),0) AS total_margin
        FROM subcontractor_jobs
      `).catch(() => ({ rows:[{ active:0, completed:0, completed_today:0, total_revenue:0, monthly_revenue:0, total_margin:0 }] })),

      // Revenue from job_submissions payout_status
      db.query(`
        SELECT
          COALESCE(SUM(sj.job_value) FILTER (WHERE js.payout_status='paid'),0)  AS total_paid,
          COALESCE(SUM(sj.sub_payout) FILTER (WHERE js.payout_status='paid'),0) AS total_payouts
        FROM job_submissions js
        JOIN subcontractor_jobs sj ON sj.id = js.job_id
      `).catch(() => ({ rows:[{ total_paid:0, total_payouts:0 }] })),

      // Bounced count
      db.query(`SELECT COUNT(*) AS bounced FROM ai_leads WHERE bounced_at IS NOT NULL`)
        .catch(() => ({ rows:[{ bounced:0 }] })),
    ]);

    const leads   = leadsR.rows[0]   || {};
    const subs    = subsR.rows[0]    || {};
    const jobs    = jobsR.rows[0]    || {};
    const rev     = revenueR.rows[0] || {};

    const totalLeads       = parseInt(leads.total    || 0);
    const respondedLeads   = parseInt(leads.responded || 0);
    const bouncedLeads     = parseInt(leads.bounced  || 0);
    const totalSubs        = parseInt(subs.total     || 0);
    const approvedSubs     = parseInt(subs.approved  || 0);
    const activeContracts  = parseInt(jobs.active    || 0);
    const totalCompleted   = parseInt(jobs.completed || 0);
    const completedToday   = parseInt(jobs.completed_today || 0);
    const totalRevZar      = parseFloat(jobs.total_revenue  || rev.total_paid || 0);
    const monthlyRevZar    = parseFloat(jobs.monthly_revenue || 0);

    res.json({
      activeContracts,
      completedToday,
      totalCompleted,
      totalClients:   respondedLeads,
      totalLeads,
      respondedLeads,
      bouncedLeads,
      totalSubcontractors: totalSubs,
      approvedSubs,
      monthlyRevZar,
      totalRevZar,
      successRate: totalCompleted > 0 ? Math.round((totalCompleted / Math.max(activeContracts + totalCompleted, 1)) * 100) : 0,
      daily: monthlyRevZar > 0 ? `R ${monthlyRevZar.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}` : 'R 0',
      aiStatus: 'running',
      uptime: '99.98%',
      live: true,
    });
  } catch (err) {
    console.error('Metrics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Module status panel
app.get('/api/status', requireAuth, async (req, res) => {
  const now = new Date().toISOString();
  const agent = autonomousAgent.getStatus();

  // ── Pull real counts from DB ──────────────────────────────────────────────
  let leadsTotal = 0, leadsOutreachSent = 0, emailsToday = 0;
  let jobsOutstanding = 0, jobsTotal = 0;
  let txnTotal = 0, txnRevenue = 0;
  let auditEventsToday = 0;
  let approvedSubs = 0, paidSubs = 0;

  if (db.isConnected()) {
    try {
      const lr = await db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status != 'new') AS contacted FROM ai_leads`);
      leadsTotal = parseInt(lr.rows[0]?.total) || 0;
      leadsOutreachSent = parseInt(lr.rows[0]?.contacted) || 0;
    } catch {}

    try {
      const er = await db.query(`SELECT COUNT(*) AS cnt FROM ai_activity_log WHERE action_type = 'email_sent' AND created_at > NOW() - INTERVAL '24 hours'`);
      emailsToday = parseInt(er.rows[0]?.cnt) || 0;
    } catch {}

    try {
      const jr = await db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='outstanding') AS outstanding FROM subcontractor_jobs`);
      jobsTotal = parseInt(jr.rows[0]?.total) || 0;
      jobsOutstanding = parseInt(jr.rows[0]?.outstanding) || 0;
    } catch {}

    try {
      const tr = await db.query(`SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_zar),0) AS rev FROM transactions WHERE status='succeeded'`);
      txnTotal = parseInt(tr.rows[0]?.cnt) || 0;
      txnRevenue = parseFloat(tr.rows[0]?.rev) || 0;
    } catch {}

    try {
      const ar = await db.query(`SELECT COUNT(*) AS cnt FROM audit_log WHERE created_at > NOW() - INTERVAL '24 hours'`);
      auditEventsToday = parseInt(ar.rows[0]?.cnt) || 0;
    } catch {
      try {
        const ar2 = await db.query(`SELECT COUNT(*) AS cnt FROM ai_activity_log WHERE created_at > NOW() - INTERVAL '24 hours'`);
        auditEventsToday = parseInt(ar2.rows[0]?.cnt) || 0;
      } catch {}
    }

    try {
      const sr = await db.query(`SELECT COUNT(*) FILTER (WHERE status='approved') AS approved, COUNT(*) FILTER (WHERE status='approved' AND payment_confirmed=TRUE) AS paid FROM subcontractor_applications`);
      approvedSubs = parseInt(sr.rows[0]?.approved) || 0;
      paidSubs = parseInt(sr.rows[0]?.paid) || 0;
    } catch {}
  }

  const agentRunning = agent.running;
  const agentLastSearch = agent.lastLeadSearch;

  const modules = [
    {
      module: 'Autonomous AI Agent',
      status: agentRunning ? 'running' : 'offline',
      lastAction: agentRunning
        ? `Leads found: ${agent.totalLeadsFound} · Emails sent: ${agent.totalEmailsSent} · Apps processed: ${agent.totalAppProcessed}`
        : 'Agent not started',
      updatedAt: agentLastSearch || now,
    },
    {
      module: 'AI Sourcing & Outreach',
      status: agentRunning ? 'running' : 'idle',
      lastAction: leadsTotal > 0
        ? `${leadsTotal} leads in DB · ${leadsOutreachSent} contacted · ${emailsToday} emails sent today`
        : agentRunning ? 'Searching for leads — first run in progress' : 'No leads yet',
      updatedAt: agent.lastLeadSearch || now,
    },
    {
      module: 'AI Subcontractor Assignment',
      status: agentRunning ? 'running' : 'idle',
      lastAction: agent.totalContractsAssigned > 0
        ? `${agent.totalContractsAssigned} contracts assigned · ${paidSubs} paid subs eligible · ${jobsOutstanding} jobs outstanding`
        : paidSubs > 0 ? `${paidSubs} paid subs ready — awaiting outstanding jobs` : 'No paid subcontractors yet',
      updatedAt: agent.lastContractAssign || now,
    },
    {
      module: 'AI Contract Manager',
      status: db.isConnected() ? 'running' : 'idle',
      lastAction: jobsTotal > 0
        ? `${jobsTotal} total jobs · ${jobsOutstanding} outstanding`
        : 'No contracts created yet',
      updatedAt: now,
    },
    {
      module: 'AI Payment Gateway',
      status: OZOW_STATUS(),
      lastAction: txnTotal > 0
        ? `${txnTotal} payments processed · R${txnRevenue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total received`
        : process.env.OZOW_API_KEY ? 'Ozow connected — no payments yet' : 'Dev stub mode — no Ozow key',
      updatedAt: now,
    },
    {
      module: 'AI Audit Trail Logger',
      status: db.isConnected() ? 'running' : 'idle',
      lastAction: auditEventsToday > 0
        ? `${auditEventsToday} events logged today`
        : 'Logger active — no events yet today',
      updatedAt: now,
    },
    {
      module: 'Application Processing',
      status: agentRunning ? 'running' : 'idle',
      lastAction: agent.totalAppProcessed > 0
        ? `${agent.totalAppProcessed} applications processed · ${approvedSubs} approved · ${paidSubs} paid`
        : 'No applications received yet',
      updatedAt: agent.lastAppCheck || now,
    },
  ];

  res.json(modules);
});

function OZOW_STATUS() {
  return process.env.OZOW_API_KEY ? 'running' : 'idle';
}

// Failed contracts
app.get('/api/contracts/failed', requireAuth, async (req, res) => {
  try {
    if (db.isConnected()) {
      const result = await db.query(`
        SELECT c.id, c.id AS "contractId", cl.name AS "clientName",
               s.name AS "assignedTo", c.updated_at AS "failedAt",
               'Contract failed' AS "failureReason",
               'Under review' AS "recoveryAction", c.status
        FROM contracts c
        LEFT JOIN clients cl ON c.client_id = cl.id
        LEFT JOIN subcontractors s ON c.sub_id = s.id
        WHERE c.status = 'failed'
        ORDER BY c.updated_at DESC
        LIMIT 100
      `);
      return res.json(result.rows);
    }
    const logs = await auditLogger.getFailedContracts();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI Initiate – trigger a demo AI workflow cycle
app.post('/api/ai/initiate', requireAuth, async (req, res) => {
  try {
    await auditLogger.log('ai.initiated', null, null, `AI workflow initiated by user ${req.user.email}`, req.user.id, 'info');
    res.json({ success: true, message: 'AI workflow initiated', initiatedBy: req.user.email, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Negotiation routes
app.post('/api/negotiate', requireAuth, async (req, res) => {
  try {
    const result = await negotiation.negotiate(req.body);
    res.json(result);
  } catch (err) {
    await auditLogger.log('system.error', null, null, err.message, null, 'error');
    res.status(500).json({ error: err.message });
  }
});

// Contract routes
app.post('/api/contracts', requireAuth, async (req, res) => {
  try {
    const result = await contractManager.analyzeAndRoute(req.body);
    res.json(result);
  } catch (err) {
    await auditLogger.log('system.error', null, null, err.message, null, 'error');
    res.status(500).json({ error: err.message });
  }
});

// Subcontractor assignment routes
app.post('/api/assign', requireAuth, async (req, res) => {
  try {
    const result = await subcontractorAssignment.assign(req.body);
    res.json(result);
  } catch (err) {
    await auditLogger.log('system.error', null, null, err.message, null, 'error');
    res.status(500).json({ error: err.message });
  }
});

// Payment config (frontend uses this to get the live client ID)
app.get('/api/payments/config', requireAuth, (req, res) => {
  res.json(paymentGateway.getPayPalConfig());
});

// Ozow payment initiate
app.post('/api/payments/initiate', requireAuth, async (req, res) => {
  try {
    const result = await paymentGateway.initiatePayment(req.body);
    res.json(result);
  } catch (err) {
    await auditLogger.log('payment.failed', null, null, err.message, null, 'error');
    res.status(500).json({ error: err.message });
  }
});

// Ozow payment notification webhook — called by Ozow servers after payment (no auth, must verify hash)
app.post('/api/payments/ozow/notify', async (req, res) => {
  try {
    const {
      SiteCode = '', TransactionId = '', TransactionReference = '',
      Amount = '', Status = '', Optional1 = '', Optional2 = '',
      Optional3 = '', Optional4 = '', Optional5 = '',
      CurrencyCode = 'ZAR', IsTest = '', Hash = '',
    } = req.body;

    // Verify Ozow hash: SHA512(concatenated_fields_lowercase + private_key_lowercase)
    const privateKey = process.env.OZOW_PRIVATE_KEY || '';
    const hashInput  = [SiteCode, TransactionId, TransactionReference, Amount, Status,
      Optional1, Optional2, Optional3, Optional4, Optional5,
      CurrencyCode, IsTest].join('').toLowerCase() + privateKey.toLowerCase();
    const expected = require('crypto').createHash('sha512').update(hashInput).digest('hex');

    if (Hash && Hash.toLowerCase() !== expected) {
      await auditLogger.log('payment.ozow.invalid_hash', 'transaction', TransactionReference,
        'Ozow hash mismatch — possible spoofed notification', null, 'error');
      return res.status(400).send('Invalid hash');
    }

    const statusLower = Status.toLowerCase();
    const dbStatus = statusLower === 'complete' ? 'succeeded'
                   : statusLower === 'cancelled' ? 'cancelled' : 'failed';

    if (db.isConnected()) {
      try {
        await db.query(
          `INSERT INTO transactions (amount_zar, currency, reference, ozow_reference, status, paid_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [parseFloat(Amount) || 0, CurrencyCode, TransactionReference,
           TransactionId, dbStatus, dbStatus === 'succeeded' ? new Date() : null]
        );
      } catch (dbErr) {
        console.error('Ozow notify DB error:', dbErr.message);
      }

      // Auto-link payment to subcontractor application if reference is SUB-{id}
      if (dbStatus === 'succeeded' && TransactionReference && TransactionReference.startsWith('SUB-')) {
        try {
          const subId = parseInt(TransactionReference.replace('SUB-', ''), 10);
          if (subId) {
            await db.query(
              `UPDATE subcontractor_applications
               SET payment_confirmed = TRUE, payment_confirmed_at = NOW(), payment_reference = $1
               WHERE id = $2`,
              [TransactionId, subId]
            );
            await auditLogger.log('payment.sub_confirmed', 'application', subId,
              `Enrolment payment confirmed for application #${subId} via Ozow (${TransactionId})`, null, 'info');
          }
        } catch (linkErr) {
          console.error('Ozow sub-link error:', linkErr.message);
        }
      }
    }

    await auditLogger.log(
      `payment.ozow.${dbStatus}`, 'transaction', TransactionReference,
      `Ozow ${Status}: R${Amount} | Ref: ${TransactionId} | Test: ${IsTest}`,
      null, dbStatus === 'succeeded' ? 'info' : 'warning'
    );

    res.status(200).send('OK');
  } catch (err) {
    console.error('Ozow notify handler error:', err.message);
    res.status(500).send('Error');
  }
});

// Ozow config info for frontend (site code only, never the private key)
app.get('/api/payments/ozow/config', requireAuth, (req, res) => {
  const cfg = paymentGateway.getOzowConfig();
  const appBase = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.APP_URL || '');
  res.json({
    siteCode: cfg.siteCode,
    hasKey:   cfg.hasKey,
    isTestMode: process.env.NODE_ENV !== 'production',
    callbackUrls: {
      success:  `${appBase}/payments?status=success`,
      error:    `${appBase}/payments?status=error`,
      cancel:   `${appBase}/payments?status=cancel`,
      notify:   `${appBase}/api/payments/ozow/notify`,
    },
  });
});

// PayPal – create order (server-side, keeps secret off the browser)
app.post('/api/payments/paypal/create-order', requireAuth, async (req, res) => {
  try {
    const { amount, currency, description, invoiceId } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount is required' });
    const order = await paymentGateway.createPayPalOrder({ amount, currency, description, invoiceId });
    res.json(order);
  } catch (err) {
    await auditLogger.log('payment.failed', null, null, err.message, null, 'error');
    res.status(500).json({ error: err.message });
  }
});

// PayPal – capture order after buyer approval
app.post('/api/payments/paypal/capture-order', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });
    const result = await paymentGateway.capturePayPalOrder(orderId);
    res.json(result);
  } catch (err) {
    await auditLogger.log('payment.failed', null, null, err.message, null, 'error');
    res.status(500).json({ error: err.message });
  }
});

// Outreach campaign (admin only)
app.post('/api/outreach/campaign', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { prospects, template } = req.body;
    if (!Array.isArray(prospects) || prospects.length === 0) {
      return res.status(400).json({ error: 'prospects array is required' });
    }
    const result = await emailOutreach.runCampaign(prospects, template || 'initialOutreach');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Job Search Engine ────────────────────────────────────────────────────────

// Trigger a web scan for BPO job opportunities
app.post('/api/jobs/scan', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await jobSearch.scanForJobs();
    await auditLogger.log('job.scan', null, null, `Scan found ${result.total} new leads`, req.user.id, 'info');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all job leads
app.get('/api/jobs/leads', requireAuth, async (req, res) => {
  try {
    const { status, jobType, limit } = req.query;
    const leads = await jobSearch.getLeads({ status, jobType, limit: limit ? parseInt(limit) : 100 });
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get job lead stats
app.get('/api/jobs/stats', requireAuth, async (req, res) => {
  try {
    const stats = await jobSearch.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a lead (contact info, status, notes)
app.patch('/api/jobs/leads/:id', requireAuth, async (req, res) => {
  try {
    const lead = await jobSearch.updateLead(parseInt(req.params.id), req.body);
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send application email to a lead
app.post('/api/jobs/send-application', requireAuth, async (req, res) => {
  try {
    const { leadId, contactEmail, contactName, company, title, jobType } = req.body;
    if (!contactEmail) {
      return res.status(400).json({ error: 'contactEmail is required. Edit the lead to add a contact email first.' });
    }

    const result = await emailOutreach.sendOutreachEmail({
      email:   contactEmail,
      name:    contactName || 'Hiring Manager',
      company: company || 'your organisation',
      jobType: jobType || 'business process outsourcing',
    }, 'bpoApplication');

    // Mark lead as contacted
    if (leadId) await jobSearch.markContacted(leadId);

    await auditLogger.log('outreach.sent', 'job_lead', leadId,
      `Application ${result.sent ? 'sent' : 'simulated'} to ${contactEmail} (${company})`,
      req.user.id, 'info');

    res.json({ ...result, emailConfigured: emailOutreach.isConfigured() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Email configuration status
app.get('/api/jobs/email-status', requireAuth, (req, res) => {
  res.json({ configured: emailOutreach.isConfigured(), from: process.env.GMAIL_USER || '' });
});

// ─── Email Template Routes ────────────────────────────────────────────────────

// List all templates with metadata
app.get('/api/email/templates', requireAuth, (req, res) => {
  const list = emailOutreach.VALID_TEMPLATES
    .filter(key => emailOutreach.TEMPLATE_META[key])
    .map(key => ({ key, ...emailOutreach.TEMPLATE_META[key] }))
    .sort((a, b) => a.stage - b.stage);
  res.json(list);
});

// Preview a template as HTML (with sample data)
app.get('/api/email/templates/:key/preview', (req, res) => {
  const preview = emailOutreach.previewTemplate(req.params.key);
  if (!preview) return res.status(404).json({ error: 'Template not found' });
  res.json(preview);
});

// Send a test email using a template
app.post('/api/email/templates/:key/test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'to (email address) is required' });
    const sample = {
      name: 'Test Client', company: 'Test Company Ltd', email: to,
      jobType: 'data entry and transcription', amount: 'R 15,000 / month',
      duration: '3 months', invoiceNo: 'TEST-001', dueDate: '15 May 2026',
      reference: 'TEST-REF', notes: 'Test delivery note.',
    };
    const result = await emailOutreach.sendOutreachEmail(sample, req.params.key);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Google Cloud AI Services ────────────────────────────────────────────────

// Config status — which services are live
app.get('/api/ai/status', requireAuth, (req, res) => {
  res.json({
    translation:   googleTranslate.isConfigured(),
    speech:        googleSpeech.isConfigured(),
    nlp:           googleNlp.isConfigured(),
    documentAi:    documentAi.isConfigured(),
    gmailReader:   gmailReader.isConfigured(),
    emailOutreach: emailOutreach.isConfigured(),
  });
});

// Translate text
app.post('/api/ai/translate', requireAuth, async (req, res) => {
  try {
    const { text, targetLang, sourceLang } = req.body;
    if (!text || !targetLang) return res.status(400).json({ error: 'text and targetLang are required' });
    const result = await googleTranslate.translateText(text, targetLang, sourceLang);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get supported languages
app.get('/api/ai/translate/languages', requireAuth, async (req, res) => {
  try {
    const langs = await googleTranslate.getSupportedLanguages();
    res.json(langs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Detect language
app.post('/api/ai/translate/detect', requireAuth, async (req, res) => {
  try {
    const result = await googleTranslate.detectLanguage(req.body.text || '');
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Transcribe audio (base64)
app.post('/api/ai/transcribe', requireAuth, async (req, res) => {
  try {
    const { audioBase64, encoding, sampleRateHertz, languageCode } = req.body;
    if (!audioBase64) return res.status(400).json({ error: 'audioBase64 is required' });
    const result = await googleSpeech.transcribeAudio({ audioBase64, encoding, sampleRateHertz, languageCode });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Analyse email reply sentiment + intent
app.post('/api/ai/analyse-reply', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const result = await googleNlp.analyseEmailReply(text);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Process document (PDF / image) with Document AI
app.post('/api/ai/document', requireAuth, async (req, res) => {
  try {
    const { base64Content, mimeType } = req.body;
    if (!base64Content) return res.status(400).json({ error: 'base64Content is required' });
    const result = await documentAi.processDocument(base64Content, mimeType || 'application/pdf');
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Gmail inbox — read unread replies
app.get('/api/gmail/inbox', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await gmailReader.listUnreadEmails(20);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Gmail inbox — auto-process replies, update lead statuses
app.post('/api/gmail/process-replies', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await gmailReader.processInboxReplies();
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Audit logs (admin only) ──────────────────────────────────────────────────
app.get('/api/audit-logs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { eventType, status, entityId } = req.query;
    const logs = await auditLogger.getLogs({ eventType, status, entityId });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Subcontractors list (original)
app.get('/api/subcontractors', requireAuth, async (req, res) => {
  try {
    const list = await subcontractorAssignment.getSubcontractors();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Subcontractor Hub ────────────────────────────────────────────────────────

async function ensureSubcontractorTables() {
  if (!db.pool) return; // pool is set synchronously; isConnected() is async and always false at startup
  await db.query(`
    CREATE TABLE IF NOT EXISTS subcontractor_applications (
      id                   SERIAL PRIMARY KEY,
      name                 VARCHAR(255) NOT NULL,
      email                VARCHAR(255) NOT NULL,
      phone                VARCHAR(50),
      location             VARCHAR(255),
      desired_earnings     NUMERIC(12,2) NOT NULL DEFAULT 0,
      platform_fee         NUMERIC(12,2) NOT NULL DEFAULT 0,
      job_value            NUMERIC(12,2) NOT NULL DEFAULT 0,
      our_margin           NUMERIC(12,2) NOT NULL DEFAULT 0,
      services             TEXT[],
      experience           TEXT,
      availability         VARCHAR(50) DEFAULT 'flexible',
      equipment            TEXT,
      internet_speed       VARCHAR(50),
      penalty_acknowledged BOOLEAN DEFAULT FALSE,
      status               VARCHAR(20) DEFAULT 'pending',
      notes                TEXT,
      source               VARCHAR(50) DEFAULT 'email',
      created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      reviewed_at          TIMESTAMP,
      reviewed_by          INTEGER,
      payment_confirmed    BOOLEAN DEFAULT FALSE,
      payment_confirmed_at TIMESTAMP,
      payment_reference    TEXT
    )
  `);
  // Migration: add payment columns if they don't exist yet (safe to run multiple times)
  await db.query(`ALTER TABLE subcontractor_applications ADD COLUMN IF NOT EXISTS payment_confirmed BOOLEAN DEFAULT FALSE`).catch(() => {});
  await db.query(`ALTER TABLE subcontractor_applications ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMP`).catch(() => {});
  await db.query(`ALTER TABLE subcontractor_applications ADD COLUMN IF NOT EXISTS payment_reference TEXT`).catch(() => {});
  await db.query(`ALTER TABLE subcontractor_applications ADD COLUMN IF NOT EXISTS password_hash TEXT`).catch(() => {});
  await db.query(`ALTER TABLE subcontractor_applications ADD COLUMN IF NOT EXISTS portal_active BOOLEAN DEFAULT FALSE`).catch(() => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS subcontractor_jobs (
      id               SERIAL PRIMARY KEY,
      sub_id           INTEGER,
      contract_id      INTEGER,
      title            VARCHAR(255) NOT NULL,
      description      TEXT,
      job_value        NUMERIC(12,2) NOT NULL DEFAULT 0,
      sub_payout       NUMERIC(12,2) NOT NULL DEFAULT 0,
      our_margin       NUMERIC(12,2) NOT NULL DEFAULT 0,
      due_date         TIMESTAMP,
      submitted_at     TIMESTAMP,
      verified_at      TIMESTAMP,
      status           VARCHAR(30) DEFAULT 'assigned',
      reminder_count   INTEGER DEFAULT 0,
      last_reminder_at TIMESTAMP,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Portal: password setup tokens
  await db.query(`
    CREATE TABLE IF NOT EXISTS set_password_tokens (
      id                  SERIAL PRIMARY KEY,
      sub_application_id  INTEGER REFERENCES subcontractor_applications(id),
      token               TEXT UNIQUE NOT NULL,
      expires_at          TIMESTAMPTZ,
      used                BOOLEAN DEFAULT FALSE,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  // Portal: work submissions
  await db.query(`
    CREATE TABLE IF NOT EXISTS job_submissions (
      id                  SERIAL PRIMARY KEY,
      job_id              INTEGER REFERENCES subcontractor_jobs(id),
      sub_application_id  INTEGER REFERENCES subcontractor_applications(id),
      submitted_at        TIMESTAMPTZ DEFAULT NOW(),
      file_name           TEXT,
      file_path           TEXT,
      file_size           BIGINT,
      ai_quality_score    INTEGER,
      ai_quality_notes    TEXT,
      status              TEXT DEFAULT 'pending_review',
      delivery_token      TEXT UNIQUE,
      delivered_at        TIMESTAMPTZ,
      confirmed_at        TIMESTAMPTZ,
      payout_status       TEXT DEFAULT 'pending',
      payout_reference    TEXT,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  // Migrations: add payment-chase tracking columns to job_submissions
  await db.query(`ALTER TABLE job_submissions ADD COLUMN IF NOT EXISTS client_reminder1_at TIMESTAMPTZ`).catch(() => {});
  await db.query(`ALTER TABLE job_submissions ADD COLUMN IF NOT EXISTS client_reminder2_at TIMESTAMPTZ`).catch(() => {});
  await db.query(`ALTER TABLE job_submissions ADD COLUMN IF NOT EXISTS client_reminder3_at TIMESTAMPTZ`).catch(() => {});
  await db.query(`ALTER TABLE job_submissions ADD COLUMN IF NOT EXISTS overdue_flagged_at  TIMESTAMPTZ`).catch(() => {});
}
// Run immediately (pool is ready synchronously), and retry once after 8s in case of any transient error
ensureSubcontractorTables().catch(e => {
  console.error('ensureSubcontractorTables (attempt 1):', e.message);
  setTimeout(() => ensureSubcontractorTables().catch(e2 => console.error('ensureSubcontractorTables (attempt 2):', e2.message)), 8000);
});

// GET all subcontractor applications
app.get('/api/subcontractors/applications', requireAuth, async (req, res) => {
  try {
    if (db.isConnected()) {
      const r = await db.query(`SELECT * FROM subcontractor_applications ORDER BY created_at DESC`);
      return res.json(r.rows);
    }
    res.json([]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST submit a subcontractor application (public — linked from recruitment email)
app.post('/api/subcontractors/applications', async (req, res) => {
  try {
    const {
      name, email, phone, location,
      desired_earnings, services, experience,
      availability, equipment, internet_speed, penalty_acknowledged
    } = req.body;
    if (!name || !email || !desired_earnings) {
      return res.status(400).json({ error: 'name, email and desired_earnings are required' });
    }
    const de = parseFloat(desired_earnings) || 0;
    const pf = Math.round(de * 100) / 100;       // platform_fee = enrolment fee paid by sub
    const jv = Math.round(de * 2 * 100) / 100;  // job_value = 2× enrolment (what sub earns back)
    const om = Math.round(de * 100) / 100;       // our_margin = the enrolment fee

    if (db.isConnected()) {
      const r = await db.query(`
        INSERT INTO subcontractor_applications
          (name,email,phone,location,desired_earnings,platform_fee,job_value,our_margin,
           services,experience,availability,equipment,internet_speed,penalty_acknowledged)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING *
      `, [name, email, phone||null, location||null, de, pf, jv, om,
          services||[], experience||null, availability||'flexible',
          equipment||null, internet_speed||null, !!penalty_acknowledged]);
      await auditLogger.log('subcontractor.applied', 'application', r.rows[0].id,
        `New application from ${name} (${email}) — desired R${de}`, null, 'info');
      return res.json({ success: true, application: r.rows[0] });
    }
    res.json({ success: true, message: 'Application received (no DB)' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH approve or reject an application
app.patch('/api/subcontractors/applications/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    if (!['approved','rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved or rejected' });
    }
    if (!db.isConnected()) return res.json({ success: true, message: 'No DB' });

    await db.query(`
      UPDATE subcontractor_applications
      SET status=$1, notes=$2, reviewed_at=NOW(), reviewed_by=$3
      WHERE id=$4
    `, [status, notes||null, req.user.id, id]);

    if (status === 'approved') {
      const app = await db.query(`SELECT * FROM subcontractor_applications WHERE id=$1`, [id]);
      const a = app.rows[0];
      if (a) {
        await db.query(`
          INSERT INTO subcontractors (name, email, specializations, capacity, active_jobs, success_rate, status)
          VALUES ($1,$2,$3,10,0,0.90,'active')
          ON CONFLICT (email) DO NOTHING
        `, [a.name, a.email, a.services || []]);
      }
    }
    await auditLogger.log('subcontractor.reviewed', 'application', parseInt(id),
      `Application ${id} ${status} by ${req.user.email}`, req.user.id, 'info');
    res.json({ success: true, status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH mark subcontractor application payment as confirmed (admin)
app.patch('/api/subcontractors/applications/:id/mark-paid', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reference } = req.body;
    if (!db.isConnected()) return res.json({ success: true, message: 'No DB' });
    await db.query(`
      UPDATE subcontractor_applications
      SET payment_confirmed = TRUE, payment_confirmed_at = NOW(), payment_reference = $1
      WHERE id = $2
    `, [reference || 'manual', id]);
    await auditLogger.log('payment.manual_confirm', 'application', parseInt(id),
      `Payment manually confirmed for application #${id} by ${req.user.email}`, req.user.id, 'info');
    res.json({ success: true, message: `Payment confirmed for application #${id}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET all subcontractor job assignments
app.get('/api/subcontractors/jobs', requireAuth, async (req, res) => {
  try {
    if (db.isConnected()) {
      const r = await db.query(`
        SELECT sj.*, s.name AS sub_name, s.email AS sub_email
        FROM subcontractor_jobs sj
        LEFT JOIN subcontractors s ON sj.sub_id = s.id
        ORDER BY sj.created_at DESC
      `);
      return res.json(r.rows);
    }
    res.json([]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create a new job assignment
app.post('/api/subcontractors/jobs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { sub_id, title, description, sub_payout, due_date, contract_id } = req.body;
    if (!sub_id || !title || !sub_payout) {
      return res.status(400).json({ error: 'sub_id, title and sub_payout are required' });
    }
    const payout = parseFloat(sub_payout) || 0;
    const jv = Math.round(payout * 1.5 * 100) / 100;
    const om = Math.round(payout * 0.5 * 100) / 100;

    if (!db.isConnected()) return res.json({ success: true, message: 'No DB' });

    const r = await db.query(`
      INSERT INTO subcontractor_jobs
        (sub_id, contract_id, title, description, job_value, sub_payout, our_margin, due_date, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'assigned')
      RETURNING *
    `, [sub_id, contract_id||null, title, description||null, jv, payout, om,
        due_date ? new Date(due_date) : null]);

    await db.query(`UPDATE subcontractors SET active_jobs = active_jobs + 1 WHERE id=$1`, [sub_id]);
    await auditLogger.log('subcontractor.job_assigned', 'subcontractor_job', r.rows[0].id,
      `Job "${title}" assigned to sub ${sub_id}`, req.user.id, 'info');
    res.json({ success: true, job: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH update job status (submit, verify, pay, fail)
app.patch('/api/subcontractors/jobs/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['assigned','in_progress','submitted','verified','paid','failed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }
    if (!db.isConnected()) return res.json({ success: true });

    const extra = {};
    if (status === 'submitted') extra.submitted_at = new Date();
    if (status === 'verified')  extra.verified_at  = new Date();

    await db.query(`
      UPDATE subcontractor_jobs SET status=$1, updated_at=NOW()
      ${status === 'submitted' ? ', submitted_at=NOW()' : ''}
      ${status === 'verified'  ? ', verified_at=NOW()'  : ''}
      WHERE id=$2
    `, [status, id]);

    if (status === 'paid' || status === 'failed') {
      const job = await db.query(`SELECT sub_id FROM subcontractor_jobs WHERE id=$1`, [id]);
      if (job.rows[0]?.sub_id) {
        await db.query(`UPDATE subcontractors SET active_jobs = GREATEST(active_jobs-1,0) WHERE id=$1`,
          [job.rows[0].sub_id]);
      }
    }
    await auditLogger.log('subcontractor.job_updated', 'subcontractor_job', parseInt(id),
      `Job ${id} status → ${status}`, req.user.id, 'info');
    res.json({ success: true, status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST send reminder emails for outstanding jobs
app.post('/api/subcontractors/jobs/remind', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!db.isConnected()) return res.json({ sent: 0, message: 'No DB' });

    const pending = await db.query(`
      SELECT sj.*, s.name AS sub_name, s.email AS sub_email
      FROM subcontractor_jobs sj
      JOIN subcontractors s ON sj.sub_id = s.id
      WHERE sj.status IN ('assigned','in_progress')
        AND sj.due_date IS NOT NULL
        AND sj.due_date > NOW()
      ORDER BY sj.due_date ASC
    `);

    let sent = 0;
    for (const job of pending.rows) {
      if (!job.sub_email) continue;
      await emailOutreach.sendSubcontractorReminder({
        name: job.sub_name,
        email: job.sub_email,
        jobTitle: job.title,
        dueDate: job.due_date,
        jobId: job.id,
      });
      await db.query(`
        UPDATE subcontractor_jobs
        SET reminder_count = reminder_count + 1, last_reminder_at = NOW()
        WHERE id=$1
      `, [job.id]);
      sent++;
    }
    await auditLogger.log('subcontractor.reminders_sent', null, null,
      `${sent} reminder emails sent`, req.user.id, 'info');
    res.json({ success: true, sent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST recruit-blast — sends premium BPO recruitment campaign to all leads in DB
app.post('/api/subcontractors/recruit-blast', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Pull unique emails from ai_leads + scraped_contacts not already recruited
    const leadsQ = await db.query(`
      SELECT DISTINCT email, company_name AS name
      FROM ai_leads
      WHERE email IS NOT NULL AND email != ''
        AND email NOT IN (
          SELECT DISTINCT recipient_email FROM email_tracking WHERE recipient_email IS NOT NULL
        )
      UNION
      SELECT DISTINCT email, company AS name
      FROM scraped_contacts
      WHERE email IS NOT NULL AND email != ''
        AND status NOT IN ('contacted', 'unsubscribed', 'bounced')
        AND mx_verified IS NOT FALSE
      LIMIT 250
    `);
    const targets = (leadsQ.rows || []).filter(r => r.email?.includes('@'));
    if (!targets.length) return res.json({ success: true, sent: 0, message: 'No eligible targets found in database.' });

    res.json({ success: true, queued: targets.length, message: `Recruitment drive started — sending to ${targets.length} BPO prospects in background.` });

    // Send in background so the API call returns immediately
    (async () => {
      let sent = 0, failed = 0;
      for (const t of targets) {
        try {
          const r = await emailOutreach.sendBPORecruitmentDrive({ name: t.name || 'BPO Professional', email: t.email });
          if (r.sent) sent++;
          await new Promise(resolve => setTimeout(resolve, 400)); // rate-limit
        } catch (e) { failed++; console.error('[RECRUIT BLAST]', e.message); }
      }
      await auditLogger.log('subcontractor.bpo_recruit_blast', null, null,
        `BPO recruitment drive complete: ${sent} sent, ${failed} failed of ${targets.length} targets`, null, 'info');
      console.log(`[RECRUIT BLAST] Done — ${sent} sent, ${failed} failed`);
    })();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST recruit — AI sends recruitment emails to a list of targets
app.post('/api/subcontractors/recruit', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { targets } = req.body; // [{ name, email }]
    if (!Array.isArray(targets) || targets.length === 0) {
      return res.status(400).json({ error: 'targets array required' });
    }
    let sent = 0;
    for (const t of targets) {
      if (!t.email) continue;
      await emailOutreach.sendSubcontractorRecruitment({ name: t.name || 'Future Partner', email: t.email });
      sent++;
    }
    await auditLogger.log('subcontractor.recruitment_sent', null, null,
      `Recruitment emails sent to ${sent} prospects`, req.user.id, 'info');
    res.json({ success: true, sent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET operations summary (live totals for hub dashboard)
app.get('/api/summary', requireAuth, async (req, res) => {
  try {
    const zero = v => parseFloat(v) || 0;
    const int  = v => parseInt(v, 10) || 0;

    if (db.isConnected()) {
      const [clients, subs, contracts, txns, apps, jobs] = await Promise.all([
        db.query(`SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE status='active') AS active
                  FROM clients`),
        db.query(`SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE status='active') AS active
                  FROM subcontractors`),
        db.query(`SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE status='active')    AS active,
                    COUNT(*) FILTER (WHERE status='completed') AS completed,
                    COUNT(*) FILTER (WHERE status='pending')   AS pending,
                    COALESCE(SUM(value),0) AS total_value,
                    COALESCE(SUM(value) FILTER (WHERE status='active'),0) AS active_value,
                    COALESCE(SUM(value) FILTER (WHERE status='completed'),0) AS completed_value
                  FROM contracts`),
        db.query(`SELECT COALESCE(SUM(amount_zar) FILTER (WHERE status='succeeded'),0) AS paid,
                    COALESCE(SUM(amount_zar) FILTER (WHERE status='pending'),0) AS pending
                  FROM transactions`),
        db.query(`SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE status='pending')  AS pending,
                    COUNT(*) FILTER (WHERE status='approved') AS approved,
                    COUNT(*) FILTER (WHERE status='rejected') AS rejected
                  FROM subcontractor_applications`),
        db.query(`SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE status IN ('assigned','in_progress')) AS outstanding,
                    COUNT(*) FILTER (WHERE status='submitted') AS submitted,
                    COUNT(*) FILTER (WHERE status='verified')  AS verified,
                    COUNT(*) FILTER (WHERE status='paid')      AS paid,
                    COALESCE(SUM(job_value),0)  AS total_job_value,
                    COALESCE(SUM(sub_payout),0) AS total_payout,
                    COALESCE(SUM(our_margin),0) AS total_margin,
                    COALESCE(SUM(job_value) FILTER (WHERE status IN ('assigned','in_progress')),0) AS outstanding_value
                  FROM subcontractor_jobs`),
      ]);

      return res.json({
        clients: {
          total: int(clients.rows[0].total),
          active: int(clients.rows[0].active),
        },
        subcontractors: {
          total: int(subs.rows[0].total),
          active: int(subs.rows[0].active),
        },
        contracts: {
          total:          int(contracts.rows[0].total),
          active:         int(contracts.rows[0].active),
          completed:      int(contracts.rows[0].completed),
          pending:        int(contracts.rows[0].pending),
          totalValue:     zero(contracts.rows[0].total_value),
          activeValue:    zero(contracts.rows[0].active_value),
          completedValue: zero(contracts.rows[0].completed_value),
        },
        revenue: {
          paid:    zero(txns.rows[0].paid),
          pending: zero(txns.rows[0].pending),
        },
        applications: {
          total:    int(apps.rows[0].total),
          pending:  int(apps.rows[0].pending),
          approved: int(apps.rows[0].approved),
          rejected: int(apps.rows[0].rejected),
        },
        jobs: {
          total:          int(jobs.rows[0].total),
          outstanding:    int(jobs.rows[0].outstanding),
          submitted:      int(jobs.rows[0].submitted),
          verified:       int(jobs.rows[0].verified),
          paid:           int(jobs.rows[0].paid),
          totalJobValue:  zero(jobs.rows[0].total_job_value),
          totalPayout:    zero(jobs.rows[0].total_payout),
          totalMargin:    zero(jobs.rows[0].total_margin),
          outstandingValue: zero(jobs.rows[0].outstanding_value),
        },
        updatedAt: new Date().toISOString(),
      });
    }

    res.json({
      clients: { total: 0, active: 0 },
      subcontractors: { total: 0, active: 0 },
      contracts: { total: 0, active: 0, completed: 0, pending: 0, totalValue: 0, activeValue: 0, completedValue: 0 },
      revenue: { paid: 0, pending: 0 },
      applications: { total: 0, pending: 0, approved: 0, rejected: 0 },
      jobs: { total: 0, outstanding: 0, submitted: 0, verified: 0, paid: 0, totalJobValue: 0, totalPayout: 0, totalMargin: 0, outstandingValue: 0 },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Autonomous AI Agent Routes ──────────────────────────────────────────────

// GET /api/ai-agent/status — returns agent live state
app.get('/api/ai-agent/status', requireAuth, (req, res) => {
  res.json(autonomousAgent.getStatus());
});

// GET /api/ai-agent/live — real-time ops center data (poll every 2s from frontend)
let _dailyStatsCache = null;
let _dailyStatsCacheTs = 0;
app.get('/api/ai-agent/live', requireAuth, async (req, res) => {
  try {
    // Daily stats cached for 60s
    if (!_dailyStatsCache || Date.now() - _dailyStatsCacheTs > 60_000) {
      try {
        const [ds, es, cs] = await Promise.all([
          // Leads added per day (last 7 days)
          db.query(`SELECT DATE(created_at) AS day, COUNT(*) AS count FROM ai_leads WHERE created_at > NOW()-INTERVAL '7 days' GROUP BY day ORDER BY day DESC`),
          // Emails sent per day (last 7 days from activity log)
          db.query(`SELECT DATE(created_at) AS day, COUNT(*) AS count FROM ai_activity_log WHERE action_type IN ('email_sent','scrape_outreach','prospect_outreach') AND status='success' AND target_id IS NOT NULL AND created_at > NOW()-INTERVAL '7 days' GROUP BY day ORDER BY day DESC`),
          // Contacts added per day
          db.query(`SELECT DATE(created_at) AS day, COUNT(*) AS count FROM scraped_contacts WHERE created_at > NOW()-INTERVAL '7 days' GROUP BY day ORDER BY day DESC`),
        ]);
        // Merge into daily map
        const dayMap = {};
        for (const r of ds.rows)  { dayMap[r.day] = { ...(dayMap[r.day]||{}), day: r.day, leads: parseInt(r.count)||0 }; }
        for (const r of es.rows)  { dayMap[r.day] = { ...(dayMap[r.day]||{}), day: r.day, emails: parseInt(r.count)||0 }; }
        for (const r of cs.rows)  { dayMap[r.day] = { ...(dayMap[r.day]||{}), day: r.day, contacts: parseInt(r.count)||0 }; }
        _dailyStatsCache = Object.values(dayMap).sort((a, b) => new Date(b.day) - new Date(a.day));
        _dailyStatsCacheTs = Date.now();
      } catch { _dailyStatsCache = []; }
    }

    const status = autonomousAgent.getStatus();
    res.json({ ...status, dailyStats: _dailyStatsCache });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai-agent/activity — returns recent activity log
app.get('/api/ai-agent/activity', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const result = await db.query(
      `SELECT id, action_type, description, target_entity, target_id, status, details, created_at
       FROM ai_activity_log
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ activities: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai-agent/leads — returns discovered leads
app.get('/api/ai-agent/leads', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, company, source_url, domain, contact_email, job_type, status,
              outreach_sent_at, followup1_sent_at, followup2_sent_at, created_at
       FROM ai_leads ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ leads: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CONTROL ROOM ─────────────────────────────────────────────────────────────
// GET /api/control-room/status — live agent state + email stats + next run times
app.get('/api/control-room/status', requireAuth, async (req, res) => {
  try {
    const status   = autonomousAgent.getStatus();
    const circuit  = autonomousAgent.getCircuitState();
    const emailStats = emailOutreach.getDailyStats ? emailOutreach.getDailyStats() : {};

    // Calculate next run times from current time
    const now = Date.now();
    function nextCron(intervalMin, offsetMin = 0) {
      const ms = intervalMin * 60 * 1000;
      const elapsed = (now + offsetMin * 60000) % ms;
      return new Date(now + ms - elapsed).toISOString();
    }

    res.json({
      status,
      circuit,
      emailStats: {
        sentToday: emailStats.sent     || 0,
        cap:       emailStats.cap      || 500,
        mode:      emailStats.mode     || 'unknown',
        paused:    emailStats.paused   || false,
        broken:    emailStats.broken   || [],
      },
      db: status.db || {},
      nextRuns: {
        inboxReply:  nextCron(15),
        outreach:    nextCron(5,  2),
        followup:    nextCron(120, 15),
        aiJobs:      nextCron(15, 5),
        contracts:   nextCron(60),
        healthCheck: nextCron(15, 10),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/control-room/activity — recent ai_activity_log with optional filter
app.get('/api/control-room/activity', requireAuth, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '80'), 200);
    const filter = req.query.filter || 'all';

    let whereClause = '';
    if (filter === 'success')         whereClause = `WHERE status='success'`;
    else if (filter === 'error')      whereClause = `WHERE status='error'`;
    else if (filter !== 'all')        whereClause = `WHERE action_type=$2`;

    const params  = filter !== 'all' && !['success','error'].includes(filter)
      ? [limit, filter] : [limit];
    const query   = `
      SELECT id, action_type, description, target_entity, target_id, status, details, created_at
      FROM ai_activity_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $1
    `;

    const [rows, countRow] = await Promise.all([
      db.query(query, params),
      db.query(`SELECT COUNT(*) AS total FROM ai_activity_log WHERE created_at >= CURRENT_DATE`),
    ]);

    res.json({
      activity:   rows.rows,
      totalToday: parseInt(countRow.rows[0]?.total || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai-agent/trigger/:task — manually trigger any agent task
app.post('/api/ai-agent/trigger/:task', requireAuth, requireAdmin, async (req, res) => {
  try {
    await autonomousAgent.triggerNow(req.params.task);
    res.json({ ok: true, message: `Task "${req.params.task}" triggered successfully.` });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// GET /api/ai-agent/scraped-contacts — returns scraped_contacts stats + recent rows
app.get('/api/ai-agent/scraped-contacts', requireAuth, async (req, res) => {
  try {
    const [stats, recent] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status='new') AS pending,
          COUNT(*) FILTER (WHERE status='contacted') AS contacted,
          COUNT(*) FILTER (WHERE status='followup1') AS followup1,
          COUNT(*) FILTER (WHERE status='followup2') AS followup2,
          COUNT(*) FILTER (WHERE status='bounced') AS bounced,
          COUNT(*) FILTER (WHERE status='converted') AS converted,
          COUNT(DISTINCT source) AS sources,
          COUNT(DISTINCT domain) AS unique_domains,
          MAX(created_at) AS last_scraped
        FROM scraped_contacts
      `),
      db.query(`
        SELECT id, company, domain, email, business_type, city, country, source, status, outreach_sent_at, created_at
        FROM scraped_contacts ORDER BY created_at DESC LIMIT 200
      `),
    ]);
    res.json({ stats: stats.rows[0], contacts: recent.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai-agent/platform-jobs — Upwork / Freelancer / Guru live job board
app.get('/api/ai-agent/platform-jobs', requireAuth, async (req, res) => {
  try {
    const jobSearch  = require('./modules/job-search');
    const agentMod   = require('./modules/autonomous-agent');
    const [stats, jobs] = await Promise.all([
      jobSearch.getPlatformStats(),
      jobSearch.getPlatformJobs({ limit: 300 }),
    ]);
    const agentStatus = agentMod.getStatus ? agentMod.getStatus() : {};
    const serpCooling = agentStatus.serpApiCoolingUntil && new Date(agentStatus.serpApiCoolingUntil) > new Date();
    const cooldownMinsLeft = serpCooling
      ? Math.ceil((new Date(agentStatus.serpApiCoolingUntil) - Date.now()) / 60000)
      : 0;
    res.json({ stats, jobs, serpCooling, cooldownMinsLeft });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/ai-agent/platform-jobs/:id/bid — mark a platform job as bid sent
app.patch('/api/ai-agent/platform-jobs/:id/bid', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = require('./db');
    await db.query(
      `UPDATE platform_jobs SET status='bid_sent', bid_sent_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ai-agent/platform-jobs/auto-bid — run auto-bidder on demand
app.post('/api/ai-agent/platform-jobs/auto-bid', requireAuth, requireAdmin, async (req, res) => {
  try {
    const autoBidder = require('./modules/auto-bidder');
    const result = await autoBidder.autoBidNewJobs();
    res.json({ ok: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ai-agent/platform-jobs/priority-bid — submit top-N bids by USD value (respects monthly limit)
app.post('/api/ai-agent/platform-jobs/priority-bid', requireAuth, requireAdmin, async (req, res) => {
  try {
    const autoBidder = require('./modules/auto-bidder');
    const result = await autoBidder.submitPriorityBids();
    res.json({ ok: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai-agent/platform-jobs/bid-status — monthly bid usage stats
app.get('/api/ai-agent/platform-jobs/bid-status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const autoBidder = require('./modules/auto-bidder');
    const MONTHLY_LIMIT = parseInt(process.env.FREELANCER_MONTHLY_BID_LIMIT || '8', 10);
    const usedThisMonth = await autoBidder.countBidsThisMonth();
    const hasToken = !!process.env.FREELANCER_TOKEN;

    const { rows: topJobs } = await db.query(`
      SELECT id, title, effective_job_type, budget, budget_min, budget_max, freelancer_project_id, bid_method, status
      FROM platform_jobs
      WHERE status = 'bid_sent' AND bid_method = 'admin_notified'
        AND freelancer_project_id IS NOT NULL AND platform = 'Freelancer'
      ORDER BY COALESCE(budget_max, budget_min, 0) DESC NULLS LAST
      LIMIT 20
    `);

    const topWithUSD = topJobs.map(j => ({
      ...j,
      usd_value: autoBidder.budgetToUSD(j),
    })).sort((a, b) => b.usd_value - a.usd_value);

    res.json({
      ok: true,
      has_token: hasToken,
      monthly_limit: MONTHLY_LIMIT,
      used_this_month: usedThisMonth,
      slots_remaining: Math.max(0, MONTHLY_LIMIT - usedThisMonth),
      top_candidates: topWithUSD,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/platform-jobs/approve/:id — one-click approve from email link (no login needed)
app.get('/api/platform-jobs/approve/:id', async (req, res) => {
  const token = req.query.token;
  if (token !== 'admin2026') {
    return res.status(403).send('<h2>Invalid approval token.</h2>');
  }
  try {
    const db = require('./db');
    const { rows } = await db.query(
      `UPDATE platform_jobs SET status='approved', updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).send('<h2>Job not found.</h2>');
    const job = rows[0];
    res.send(`
      <!DOCTYPE html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Job Approved — CTS BPO</title>
      <style>body{font-family:Arial,sans-serif;max-width:600px;margin:60px auto;padding:20px;color:#1e293b}
      .card{background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:24px}
      h1{color:#059669}a{color:#1e3a5f;font-weight:bold}</style></head><body>
      <div class="card">
        <h1>✅ Job Approved!</h1>
        <p><strong>${job.title}</strong> on <strong>${job.platform}</strong> has been marked as approved.</p>
        <p>Next step: Go to the job URL, paste in your proposal, and submit the bid.</p>
        ${job.job_url ? `<p><a href="${job.job_url}" target="_blank">🔗 Open job on ${job.platform} →</a></p>` : ''}
        <p style="margin-top:20px"><a href="${process.env.APP_URL || 'https://cts-bpo.replit.app'}/ai-agent">📊 Back to Dashboard</a></p>
      </div>
      </body></html>
    `);
  } catch (err) {
    res.status(500).send(`<h2>Error: ${err.message}</h2>`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// JOB PIPELINE — end-to-end automated BPO job lifecycle
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/pipeline/jobs — list all pipeline jobs (admin)
app.get('/api/pipeline/jobs', requireAuth, async (req, res) => {
  try {
    const pipeline = require('./modules/job-pipeline');
    const { status, limit } = req.query;
    const jobs  = await pipeline.getPipelineJobs({ status, limit: limit || 200 });
    const stats = await pipeline.getPipelineStats();
    res.json({ jobs, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pipeline/jobs/:id — single job detail
app.get('/api/pipeline/jobs/:id', requireAuth, async (req, res) => {
  try {
    const db = require('./db');
    const { rows } = await db.query(
      `SELECT * FROM bpo_pipeline_jobs WHERE id=$1`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Job not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pipeline/jobs/:id/process — manually trigger AI processing (admin)
app.post('/api/pipeline/jobs/:id/process', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = require('./db');
    const pipeline = require('./modules/job-pipeline');
    const { rows } = await db.query(`SELECT * FROM bpo_pipeline_jobs WHERE id=$1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Job not found' });
    const job = rows[0];
    await db.query(`UPDATE bpo_pipeline_jobs SET status='processing', accepted_at=NOW(), updated_at=NOW() WHERE id=$1`, [job.id]);
    setImmediate(() => pipeline.runJobAndDeliver ? pipeline.runJobAndDeliver(job, job.client_email, '', null).catch(console.error) : null);
    res.json({ ok: true, message: `Job #${job.id} processing started` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pipeline/jobs/:id/complete — one-click payment confirm from email (no login needed)
app.get('/api/pipeline/jobs/:id/complete', async (req, res) => {
  const { token } = req.query;
  if (token !== 'admin2026') return res.status(403).send('<h2>Invalid token.</h2>');
  try {
    const pipeline = require('./modules/job-pipeline');
    const job = await pipeline.markJobComplete(parseInt(req.params.id), req.query.ref || 'email-confirm');
    if (!job) return res.status(404).send('<h2>Job not found.</h2>');
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Payment Confirmed — CTS BPO</title>
      <style>body{font-family:Arial,sans-serif;max-width:600px;margin:60px auto;padding:20px;color:#1e293b}
      .card{background:#f0fdf4;border:2px solid #22c55e;border-radius:12px;padding:28px}
      h1{color:#059669;margin:0 0 12px}a{color:#2563eb;font-weight:bold}</style></head><body>
      <div class="card">
        <h1>✅ Payment Confirmed!</h1>
        <p>Job <strong>${job.invoice_ref}</strong> for <strong>${job.client_email}</strong> has been marked as <strong>COMPLETE</strong>.</p>
        <p><strong>Amount:</strong> R ${parseFloat(job.quote_amount).toLocaleString()}</p>
        <p>A thank-you email has been sent to the client automatically.</p>
        <p style="margin-top:20px"><a href="${process.env.APP_URL || 'https://cts-bpo.replit.app'}/ai-agent">📊 Back to Dashboard</a></p>
      </div></body></html>`);
  } catch (err) {
    res.status(500).send(`<h2>Error: ${err.message}</h2>`);
  }
});

// PATCH /api/pipeline/jobs/:id/complete — mark job paid/complete via dashboard (admin)
app.patch('/api/pipeline/jobs/:id/complete', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pipeline = require('./modules/job-pipeline');
    const job = await pipeline.markJobComplete(parseInt(req.params.id), req.body.paymentRef || 'manual-confirm');
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ ok: true, job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pipeline/jobs/:id/payment-confirm — client-side payment confirm link (no login)
app.get('/api/pipeline/jobs/:id/payment-confirm', async (req, res) => {
  const { token } = req.query;
  try {
    const db = require('./db');
    const { rows } = await db.query(`SELECT * FROM bpo_pipeline_jobs WHERE id=$1`, [req.params.id]);
    if (!rows[0]) return res.status(404).send('<h2>Job not found.</h2>');
    const job = rows[0];
    if (token !== job.invoice_ref) return res.status(403).send('<h2>Invalid link.</h2>');
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Confirm Receipt — CTS BPO</title>
      <style>body{font-family:Arial,sans-serif;max-width:600px;margin:60px auto;padding:20px;color:#1e293b}
      .card{background:#eff6ff;border:2px solid #3b82f6;border-radius:12px;padding:28px}
      h2{color:#1d4ed8;margin:0 0 12px}
      .btn{display:inline-block;background:#059669;color:#fff;padding:14px 32px;border-radius:9px;text-decoration:none;font-weight:700;font-size:15px;margin-top:16px}</style></head><body>
      <div class="card">
        <h2>Confirm Receipt of Completed Work</h2>
        <p>Please confirm you have received the completed work for job <strong>${job.invoice_ref}</strong>.</p>
        <p><strong>Amount due:</strong> R ${parseFloat(job.quote_amount).toLocaleString()}</p>
        <p>After confirming, please send payment via EFT or PayPal to <strong>cts.cybersolutions@gmail.com</strong> using <strong>${job.invoice_ref}</strong> as reference, then email your proof of payment.</p>
        <a class="btn" href="/api/pipeline/jobs/${job.id}/complete?token=admin2026">✅ I Confirm — Work Received</a>
      </div></body></html>`);
  } catch (err) {
    res.status(500).send(`<h2>Error: ${err.message}</h2>`);
  }
});

// POST /api/pipeline/scan-payments — manually trigger payment scan (admin)
app.post('/api/pipeline/scan-payments', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pipeline = require('./modules/job-pipeline');
    const result = await pipeline.scanForPayments();
    res.json({ ok: true, found: result.found });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pipeline/test-quote — test quote detection on pasted email text
app.post('/api/pipeline/test-quote', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pipeline = require('./modules/job-pipeline');
    const { body, subject } = req.body;
    const jobType   = pipeline.detectServiceRequest(body, subject);
    const isAccept  = pipeline.detectAcceptance(body, subject);
    const isPay     = pipeline.detectPayment(body, subject);
    res.json({ jobType, isAccept, isPay, detected: !!(jobType || isAccept || isPay) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Targeted Scrape ─────────────────────────────────────────────────────────
// Multer — store PDF in memory (max 20 MB)
const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// POST /api/targeted-scrape/suggest-keywords — AI picks best keywords for country + industry
app.post('/api/targeted-scrape/suggest-keywords', requireAuth, async (req, res) => {
  const { country, industry } = req.body;

  // Industry keyword banks — terms that suggest a company needs BPO services
  const INDUSTRY_KEYWORDS = {
    'law firm':               ['case management', 'legal transcription', 'document review', 'paralegal support', 'court filing', 'legal admin'],
    'medical clinic':         ['medical billing', 'patient records', 'healthcare admin', 'clinical transcription', 'insurance claims', 'medical coding'],
    'dental practice':        ['dental billing', 'appointment scheduling', 'patient admin', 'dental transcription', 'insurance verification', 'claims processing'],
    'school':                 ['student records', 'admin support', 'enrollment data', 'academic transcription', 'exam processing', 'education admin'],
    'retail shop':            ['inventory data entry', 'product listing', 'order processing', 'customer support', 'e-commerce admin', 'stock reconciliation'],
    'accounting firm':        ['bookkeeping', 'payroll processing', 'tax data entry', 'financial reconciliation', 'accounts payable', 'invoice processing'],
    'insurance company':      ['claims processing', 'policy admin', 'data entry', 'customer support', 'underwriting support', 'document indexing'],
    'logistics company':      ['shipment tracking', 'freight data entry', 'customs documentation', 'supply chain admin', 'order fulfilment', 'transport admin'],
    'real estate agency':     ['property listings', 'lease admin', 'document processing', 'tenant records', 'title search support', 'CRM data entry'],
    'recruitment agency':     ['CV screening', 'candidate data entry', 'job board posting', 'talent sourcing', 'background checks', 'HR admin'],
    'IT services company':    ['helpdesk support', 'technical documentation', 'ticket processing', 'data migration', 'software testing', 'IT admin'],
    'financial services':     ['KYC data entry', 'compliance documentation', 'financial reporting', 'transaction processing', 'audit support', 'back-office'],
    'healthcare company':     ['patient data', 'medical records', 'billing support', 'clinical admin', 'health insurance claims', 'HIPAA compliance'],
    'pharmaceutical company': ['regulatory documentation', 'clinical trial data', 'drug registration admin', 'compliance records', 'product data entry', 'lab transcription'],
    'manufacturing company':  ['production data entry', 'quality control records', 'supply chain admin', 'BOM processing', 'inventory management', 'ERP data'],
    'construction company':   ['project documentation', 'contract management', 'site reports', 'procurement admin', 'compliance filing', 'billing admin'],
    'hospitality hotel':      ['reservation management', 'guest records', 'invoice processing', 'loyalty program admin', 'review management', 'F&B data entry'],
    'NGO nonprofit':          ['donor records', 'grant reporting', 'volunteer data', 'impact reporting', 'beneficiary admin', 'fundraising support'],
    'government agency':      ['public records', 'compliance documentation', 'data capture', 'citizen services', 'regulatory filing', 'report processing'],
  };

  // Country signals — terms that resonate in each market
  const COUNTRY_SIGNALS = {
    'South Africa': ['BBBEE', 'BEE compliant', 'POPIA', 'SARS', 'UIF', 'South African'],
    'Nigeria':      ['FIRS', 'CAC registered', 'Lagos', 'Abuja', 'NGN', 'Nigerian'],
    'Kenya':        ['KRA', 'Nairobi', 'M-Pesa', 'KES', 'East Africa', 'Kenyan'],
    'Ghana':        ['GRA', 'Accra', 'CAGD', 'GHS', 'West Africa', 'Ghanaian'],
    'United States': ['US-based', 'SOC 2', 'HIPAA', 'IRS filing', 'American', 'SaaS'],
    'United Kingdom': ['HMRC', 'ICO', 'GDPR', 'Companies House', 'UK-based', 'British'],
    'Australia':    ['ATO', 'ABN', 'Australian', 'GST', 'ASIC', 'Sydney'],
    'Canada':       ['CRA', 'PIPEDA', 'Canadian', 'bilingual', 'Toronto', 'GST/HST'],
    'Germany':      ['DSGVO', 'HGB', 'German', 'EU compliance', 'Frankfurt', 'Bundesagentur'],
    'Netherlands':  ['KVK', 'Dutch', 'AVG', 'EU compliance', 'Amsterdam', 'BTW'],
    'Singapore':    ['MAS regulated', 'PDPA', 'Singapore-based', 'ACRA', 'SGD', 'FinTech'],
    'UAE':          ['DIFC', 'Dubai', 'Abu Dhabi', 'VAT registered', 'free zone', 'Arabic'],
    'India':        ['GST registered', 'MCA', 'Indian', 'Mumbai', 'Bangalore', 'compliance'],
    'Africa':       ['Sub-Saharan', 'African market', 'continent-wide', 'multilingual', 'mobile-first'],
    'Global':       ['international', 'multinational', 'cross-border', 'global operations', 'multi-region'],
  };

  // General BPO need signals that work universally
  const UNIVERSAL = ['outsourcing', 'back-office', 'data entry', 'remote support', 'admin support', 'cost reduction'];

  // Pick the best keyword for the combination
  const industryKws = INDUSTRY_KEYWORDS[industry] || [];
  const countryKws  = COUNTRY_SIGNALS[country] || [];

  // Strategy: 2 top industry terms + 1 country signal + 1 universal BPO term
  const chosen = [];

  if (industryKws.length >= 2) {
    // Shuffle slightly so repeat clicks give variety
    const shuffled = [...industryKws].sort(() => Math.random() - 0.5);
    chosen.push(shuffled[0], shuffled[1]);
  } else if (industryKws.length === 1) {
    chosen.push(industryKws[0]);
  }

  if (countryKws.length > 0) {
    const shuffled = [...countryKws].sort(() => Math.random() - 0.5);
    chosen.push(shuffled[0]);
  }

  // Fill remaining with universal terms
  const universalShuffled = [...UNIVERSAL].sort(() => Math.random() - 0.5);
  while (chosen.length < 3) chosen.push(universalShuffled[chosen.length] || 'outsourcing');

  // Format as a clean comma-separated string (max 3 terms to keep searches focused)
  const keywords = chosen.slice(0, 3).join(', ');

  // Also surface a scrape query suggestion
  const queryHint = industry
    ? `${industry} companies ${country ? `in ${country}` : ''} needing ${industryKws[0] || 'outsourcing'}`
    : `businesses needing BPO outsourcing ${country ? `in ${country}` : ''}`;

  res.json({ keywords, queryHint, terms: chosen });
});

// POST /api/price-negotiator/send — send a competitive pricing proposal email
app.post('/api/price-negotiator/send', requireAuth, async (req, res) => {
  try {
    const { to, name, subject, body } = req.body;
    if (!to || !body) return res.status(400).json({ error: 'Missing to or body' });

    const { sendEmail } = require('./modules/email-outreach');
    const html = `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.65;font-size:14px;max-width:680px;">${body}</pre>`;
    await sendEmail({ to, subject: subject || 'CTS BPO Pricing Proposal', text: body, html });

    // Log to activity
    try { await db.query(`INSERT INTO ai_activity_log (action, details, created_at) VALUES ($1,$2,NOW())`, ['price_proposal_sent', `Proposal emailed to ${to} (${name || 'client'})`]); } catch(_){}

    res.json({ success: true, message: `Proposal sent to ${to}` });
  } catch (err) {
    console.error('[PRICE NEGOTIATOR SEND]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/targeted-scrape/start — kick off a new targeted scrape session
app.post('/api/targeted-scrape/start', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { country, industry, keywords, limit } = req.body;
    if (!country && !industry && !keywords) {
      return res.status(400).json({ error: 'Provide at least one of: country, industry, keywords' });
    }
    const session = webScraper.getTargetedSession();
    if (session.active) {
      return res.status(409).json({ error: 'A targeted scrape is already running', session });
    }
    const sessionId = Date.now().toString(36);
    // Run in background — respond immediately
    webScraper.runTargetedScrape({
      country: country || null,
      industry: industry || null,
      keywords: keywords || null,
      limit: parseInt(limit || 100, 10),
      sessionId,
    }).catch(err => console.error('[TARGETED] unhandled error:', err.message));

    res.json({ ok: true, sessionId, message: 'Targeted scrape started in background' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/targeted-scrape/status — poll progress + results of the current/last session
app.get('/api/targeted-scrape/status', requireAuth, async (req, res) => {
  try {
    const session = webScraper.getTargetedSession();
    let contacts = [];

    // Helper: global DB search with progressive broadening (used both for no-session and fallback)
    async function globalDbSearch(kw, country, industry) {
      // Try progressively broader queries until we get results
      const searches = [];

      // Build layered attempts from strict → broad
      if (kw) {
        const like = `%${kw.toLowerCase()}%`;
        const kwCond = `(LOWER(company) LIKE $IDX OR LOWER(email) LIKE $IDX OR LOWER(domain) LIKE $IDX` +
          ` OR LOWER(business_type) LIKE $IDX OR LOWER(COALESCE(snippet,'')) LIKE $IDX OR LOWER(COALESCE(query_used,'')) LIKE $IDX)`;

        if (country && industry) {
          searches.push({ label: 'kw+country+industry', conds: [kwCond, `LOWER(country) LIKE $IDX`, `LOWER(business_type) LIKE $IDX`], vals: [like, like, like, like, like, like, `%${country.toLowerCase()}%`, `%${industry.toLowerCase()}%`] });
          searches.push({ label: 'kw+country', conds: [kwCond, `LOWER(country) LIKE $IDX`], vals: [like, like, like, like, like, like, `%${country.toLowerCase()}%`] });
          searches.push({ label: 'kw+industry', conds: [kwCond, `LOWER(business_type) LIKE $IDX`], vals: [like, like, like, like, like, like, `%${industry.toLowerCase()}%`] });
        } else if (country) {
          searches.push({ label: 'kw+country', conds: [kwCond, `LOWER(country) LIKE $IDX`], vals: [like, like, like, like, like, like, `%${country.toLowerCase()}%`] });
        } else if (industry) {
          searches.push({ label: 'kw+industry', conds: [kwCond, `LOWER(business_type) LIKE $IDX`], vals: [like, like, like, like, like, like, `%${industry.toLowerCase()}%`] });
        }
        searches.push({ label: 'kw-only', conds: [kwCond], vals: [like, like, like, like, like, like] });
      }

      if (country && industry) {
        searches.push({ label: 'country+industry', conds: [`LOWER(country) LIKE $IDX`, `LOWER(business_type) LIKE $IDX`], vals: [`%${country.toLowerCase()}%`, `%${industry.toLowerCase()}%`] });
      }
      if (industry) {
        searches.push({ label: 'industry-only', conds: [`LOWER(business_type) LIKE $IDX`], vals: [`%${industry.toLowerCase()}%`] });
      }
      if (country) {
        searches.push({ label: 'country-only', conds: [`LOWER(country) LIKE $IDX`], vals: [`%${country.toLowerCase()}%`] });
      }
      // Last resort: any non-bounced contact
      searches.push({ label: 'any-non-bounced', conds: [`status != 'bounced'`], vals: [] });

      for (const s of searches) {
        // Reindex $IDX placeholders sequentially
        let idx = 1;
        const conds = s.conds.map(c => c.replace(/\$IDX/g, () => `$${idx++}`));
        const where = `WHERE ${conds.join(' AND ')}`;
        const result = await db.query(
          `SELECT id, company, domain, email, business_type, city, country, source, status, snippet, bpo_likely, bpo_provider, created_at
           FROM scraped_contacts ${where} AND status != 'bounced'
           ORDER BY prospect_score DESC NULLS LAST, created_at DESC LIMIT 500`,
          s.vals
        );
        if (result.rows.length > 0) return result.rows;
      }
      return [];
    }

    // Session takes priority — show contacts from the current/last scrape session
    if (session.sessionId) {
      const sourceTag = `targeted_${session.sessionId}`;
      const kw = req.query.keywords || null;
      let q = `SELECT id, company, domain, email, business_type, city, country, source, status, snippet, bpo_likely, bpo_provider, created_at
               FROM scraped_contacts WHERE source = $1`;
      const params = [sourceTag];
      if (kw) {
        const like = `%${kw.toLowerCase()}%`;
        q += ` AND (LOWER(company) LIKE $2 OR LOWER(email) LIKE $2 OR LOWER(domain) LIKE $2 OR LOWER(COALESCE(snippet,'')) LIKE $2)`;
        params.push(like);
      }
      q += ` ORDER BY prospect_score DESC NULLS LAST, created_at DESC LIMIT 500`;
      contacts = (await db.query(q, params)).rows;

      // If session exists but is empty (scrapers hit rate limits, DB fallback also missed),
      // do a broader global search so the user always gets results
      if (contacts.length === 0 && !session.active) {
        const kw       = req.query.keywords || null;
        const country  = req.query.country  || null;
        const industry = req.query.industry || null;
        contacts = await globalDbSearch(kw, country, industry);
      }
    } else {
      // No session — pure DB search
      const kw       = req.query.keywords || null;
      const country  = req.query.country  || null;
      const industry = req.query.industry || null;

      if (kw || country || industry) {
        contacts = await globalDbSearch(kw, country, industry);
      }
    }

    res.json({ session, contacts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/targeted-scrape/bpo-scan — AI classifies which contacts likely need BPO
app.post('/api/targeted-scrape/bpo-scan', requireAuth, async (req, res) => {
  try {
    const { contactIds } = req.body;
    const ids = Array.isArray(contactIds) ? contactIds : [];
    if (!ids.length) return res.status(400).json({ error: 'No contact IDs provided' });

    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
    if (!GOOGLE_API_KEY) return res.status(503).json({ error: 'GOOGLE_API_KEY not configured' });

    // Fetch contacts
    const result = await db.query(
      `SELECT id, company, domain, business_type, snippet, query_used FROM scraped_contacts WHERE id = ANY($1::int[])`,
      [ids]
    );
    const contacts = result.rows;
    if (!contacts.length) return res.status(404).json({ error: 'No contacts found' });

    // Process in batches of 15 to stay within Gemini token limits
    const BATCH = 15;
    let classified = 0;

    for (let i = 0; i < contacts.length; i += BATCH) {
      const batch = contacts.slice(i, i + BATCH);
      const list = batch.map(c =>
        `{"id":${c.id},"company":${JSON.stringify(c.company || c.domain || '')},"type":${JSON.stringify(c.business_type || '')},"context":${JSON.stringify((c.snippet || c.query_used || '').slice(0, 120))}}`
      ).join('\n');

      // Rule-based: mark TRUE for every real business EXCEPT known giant BPO providers
      // (Gemini is unreliable here — it ignores "when in doubt mark TRUE" instructions)
      const EXCLUDE_NAMES = [
        'accenture','teleperformance','conduent','infosys','wipro','cognizant',
        'concentrix','alorica','convergys','synnex','sitel','tdcx','foundever',
        'transcom','webhelp','atento','ttec','sutherland','hinduja','startek',
        'ibm bpo','capgemini bpo','genpact','wns global','exlservice','firstsource',
        'mphasis','hexaware','igate','serco','arvato','sodexo bpo'
      ];

      for (const c of batch) {
        const nameL = (c.company || c.domain || '').toLowerCase();
        const typeL = (c.business_type || '').toLowerCase();
        // Only exclude if it's a known large BPO provider name
        const isKnownProvider = EXCLUDE_NAMES.some(excl => nameL.includes(excl));
        // Every other real business is a potential BPO client
        const isBpoLikely = !isKnownProvider;
        await db.query(
          `UPDATE scraped_contacts SET bpo_likely=$1, updated_at=NOW() WHERE id=$2`,
          [isBpoLikely, c.id]
        ).catch(() => {});
        classified++;
      }
    }

    res.json({ ok: true, scanned: contacts.length, classified });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/targeted-scrape/bpo-partner-scan — AI finds BPO companies to pitch as subcontractor
app.post('/api/targeted-scrape/bpo-partner-scan', requireAuth, async (req, res) => {
  try {
    const { contactIds } = req.body;
    const ids = Array.isArray(contactIds) ? contactIds : [];
    if (!ids.length) return res.status(400).json({ error: 'No contact IDs provided' });

    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
    if (!GOOGLE_API_KEY) return res.status(503).json({ error: 'GOOGLE_API_KEY not configured' });

    const result = await db.query(
      `SELECT id, company, domain, business_type, snippet, query_used FROM scraped_contacts WHERE id = ANY($1::int[])`,
      [ids]
    );
    const contacts = result.rows;
    if (!contacts.length) return res.status(404).json({ error: 'No contacts found' });

    // Phase 1: keyword matching — instant and reliable
    const PARTNER_KEYWORDS = [
      'bpo','outsourc','call center','call centre','contact center','contact centre',
      'transcription','virtual assistant','virtual staff','staffing','recruitment agency',
      'data entry','back office','back-office','offshore','nearshore','onshore staffing',
      'telemarketing','lead generation service','answering service','helpdesk','help desk',
      'managed service','payroll processing','payroll service','bookkeeping service',
      'accounting service','admin support','administrative support','document processing',
      'data processing','remote staff','remote worker','outsourcing','shared service',
      'business process','workforce solution','talent solution','temp agency',
      'executive search','headhunting','contract staffing','it outsourc','hr outsourc',
      'customer service outsourc','chat support','email support','inbox management'
    ];

    let keywordMatches = 0;
    const unmatchedIds = [];

    for (const c of contacts) {
      const haystack = [c.company, c.domain, c.business_type, c.snippet, c.query_used]
        .filter(Boolean).join(' ').toLowerCase();
      const isPartner = PARTNER_KEYWORDS.some(kw => haystack.includes(kw));
      if (isPartner) {
        await db.query(
          `UPDATE scraped_contacts SET bpo_provider=TRUE, updated_at=NOW() WHERE id=$1`, [c.id]
        ).catch(() => {});
        keywordMatches++;
      } else {
        unmatchedIds.push(c.id);
        // Mark as not-a-provider by default (Gemini will re-examine a sample)
        await db.query(
          `UPDATE scraped_contacts SET bpo_provider=FALSE, updated_at=NOW() WHERE id=$1`, [c.id]
        ).catch(() => {});
      }
    }

    // Phase 2: Gemini re-examines unmatched contacts (up to 60) to catch non-obvious partners
    let geminiMatches = 0;
    if (GOOGLE_API_KEY && unmatchedIds.length) {
      const sample = unmatchedIds.slice(0, 60);
      const sampleContacts = contacts.filter(c => sample.includes(c.id));
      const BATCH = 15;
      for (let i = 0; i < sampleContacts.length; i += BATCH) {
        const batch = sampleContacts.slice(i, i + BATCH);
        const list = batch.map(c =>
          `{"id":${c.id},"company":${JSON.stringify(c.company || c.domain || '')},"type":${JSON.stringify(c.business_type || '')},"context":${JSON.stringify((c.snippet || c.query_used || '').slice(0, 120))}}`
        ).join('\n');
        const prompt =
          `You are a subcontracting business development analyst.\n` +
          `CTS BPO wants to partner with other companies that provide outsourcing services.\n\n` +
          `For each company, answer only: does this company SELL outsourcing or staffing services to other businesses?\n` +
          `Answer TRUE for: staffing agencies, recruitment firms, HR consultancies, managed service providers, IT support companies, accounting/bookkeeping firms, consulting firms, professional employer organisations, employer of record services, payroll companies, secretarial services, any company clearly serving other businesses with professional support.\n` +
          `Answer FALSE only for pure consumer businesses like restaurants, retail shops, salons, or gyms.\n\n` +
          `Companies:\n${list}\n\n` +
          `Reply ONLY with a JSON array:\n[{"id": <number>, "bpo_provider": true/false}]`;
        try {
          const apiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
              signal: AbortSignal.timeout(25000) }
          );
          if (!apiRes.ok) continue;
          const data = await apiRes.json();
          const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
          const clean = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
          let parsed = [];
          try { parsed = JSON.parse(clean); } catch { continue; }
          for (const item of parsed) {
            if (typeof item.id !== 'number') continue;
            if (item.bpo_provider === true) {
              await db.query(
                `UPDATE scraped_contacts SET bpo_provider=TRUE, updated_at=NOW() WHERE id=$1`, [item.id]
              ).catch(() => {});
              geminiMatches++;
            }
          }
        } catch (e) { console.error('[PARTNER-SCAN] Gemini batch error:', e.message); }
        if (i + BATCH < sampleContacts.length) await new Promise(r => setTimeout(r, 800));
      }
    }

    const totalFound = keywordMatches + geminiMatches;
    res.json({ ok: true, scanned: contacts.length, classified: totalFound, keywordMatches, geminiMatches });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/email/test — send a test email via the active provider (admin only)
app.post('/api/email/test', requireAuth, async (req, res) => {
  try {
    const { to } = req.body;
    const target = to || 'cts.cybersolutions@gmail.com';
    const { sendMail, getSenderMode } = require('./modules/email-outreach');
    const mode = getSenderMode();
    const result = await sendMail({
      to: target,
      subject: `✅ CTS BPO — Email Test (${mode || 'unknown'})`,
      html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px">
        <h2 style="color:#0f766e">CTS BPO Email System — Test Successful</h2>
        <p>This is a test email sent via <strong>${mode || 'unknown'}</strong>.</p>
        <p>If you received this, your email provider is configured correctly and ready to send outreach emails.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
        <p style="color:#64748b;font-size:13px">Sent at ${new Date().toUTCString()}</p>
      </div>`,
    });
    res.json({ ok: true, mode, to: target, result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ai/compose-email — use Gemini to draft a cold outreach email
app.post('/api/ai/compose-email', requireAuth, async (req, res) => {
  try {
    const { industry, country, contactCount } = req.body;
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
    if (!GOOGLE_API_KEY) return res.status(503).json({ error: 'GOOGLE_API_KEY not configured' });

    const industryLabel = industry || 'business';
    const countryLabel  = country  || 'various countries';
    const prompt =
      `You are writing a short, professional cold outreach email on behalf of Calvin Thomas at CTS BPO Solutions ` +
      `(a South Africa-based business process outsourcing company). ` +
      `The recipients are ${industryLabel} companies in ${countryLabel}. ` +
      `Write a compelling subject line and email body (plain text, max 180 words). ` +
      `Mention that CTS BPO can help them reduce costs on data entry, document processing, virtual assistance, and back-office tasks. ` +
      `End with a soft call to action asking for a 15-minute call. ` +
      `Sign off as: Calvin Thomas | CTS BPO Solutions | cts.cybersolutions@gmail.com\n\n` +
      `Respond ONLY with valid JSON: {"subject": "...", "body": "..."}`;

    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!apiRes.ok) {
      const err = await apiRes.text();
      return res.status(502).json({ error: `Gemini error: ${apiRes.status}`, detail: err });
    }
    const data  = await apiRes.json();
    const raw   = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Strip markdown code fences if present
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch {
      // Fallback: extract subject/body with regex
      const subMatch  = clean.match(/"subject"\s*:\s*"([^"]+)"/);
      const bodyMatch = clean.match(/"body"\s*:\s*"([\s\S]+?)"\s*[,}]/);
      parsed = {
        subject: subMatch?.[1]  || `Outsourcing Solutions for Your ${industryLabel} Business`,
        body:    bodyMatch?.[1] || clean,
      };
    }
    res.json({ subject: parsed.subject, body: parsed.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/email-pause — return current pause state
app.get('/api/email-pause', requireAuth, (req, res) => {
  res.json({ paused: emailOutreach.isEmailPaused() });
});

// POST /api/email-pause — set pause state { paused: true|false }
app.post('/api/email-pause', requireAuth, (req, res) => {
  const { paused } = req.body;
  if (typeof paused !== 'boolean') return res.status(400).json({ error: 'paused must be boolean' });
  emailOutreach.setEmailPaused(paused);
  res.json({ ok: true, paused });
});

// GET /api/email-stats — live email provider status + daily send counts
app.get('/api/email-stats', requireAuth, async (req, res) => {
  try {
    const outreachStats = emailOutreach.getDailyStats();
    const circuit       = autonomousAgent.getCircuitState ? autonomousAgent.getCircuitState() : null;

    // Total sent all-time — individual sends only (target_id IS NOT NULL excludes batch summaries)
    const totalSent = await db.query(
      `SELECT COUNT(*) AS total FROM ai_activity_log
       WHERE action_type IN ('email_sent','scrape_outreach','prospect_outreach')
         AND status='success' AND target_id IS NOT NULL`
    ).catch(() => ({ rows: [{ total: 0 }] }));

    // Sent today from activity log — same accurate filter
    const todaySent = await db.query(
      `SELECT COUNT(*) AS total FROM ai_activity_log
       WHERE action_type IN ('email_sent','scrape_outreach','prospect_outreach')
         AND status='success' AND target_id IS NOT NULL
         AND created_at >= CURRENT_DATE`
    ).catch(() => ({ rows: [{ total: 0 }] }));

    const GMAIL_OK  = !!(process.env.GMAIL_USER && (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g,'').length >= 16);
    const BREVO_OK  = !!process.env.BREVO_API_KEY;
    const MJ_OK     = !!(process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY);
    const MG_OK     = !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
    const ML_OK     = !!process.env.MAILERLITE_API_KEY;

    // Load per-provider disk counts (for inactive providers)
    let diskStats = {};
    try { diskStats = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../../data/outreach-stats.json'), 'utf8')); } catch {}
    const today = new Date().toDateString();

    const CAPS = { brevo: 300, mailerlite: 399, gmail: 500, mailjet: 299, mailgun: 99 };
    const brokenSet = new Set(outreachStats.broken || []);
    function providerStats(name, configured, account, extra = {}) {
      const key    = name.toLowerCase();
      const active = outreachStats.mode === key;
      const broken = brokenSet.has(key);
      const cap    = CAPS[key];
      const stopAt = cap ? Math.floor(cap * 0.99) : null;
      // Use live count for active provider; disk count for inactive
      let sentToday = 0;
      if (configured && !broken) {
        if (active) {
          sentToday = outreachStats.sent || 0;
        } else if (diskStats[key] && diskStats[key].todayDate === today) {
          sentToday = diskStats[key].sentToday || 0;
        }
      }
      return {
        name, configured, active, broken,
        sentToday,
        dailyCap: cap,
        stopAt,
        account,
        ...extra,
      };
    }

    res.json({
      paused:  emailOutreach.isEmailPaused(),
      providers: [
        providerStats('Gmail',      GMAIL_OK, process.env.GMAIL_USER || null, { circuit }),
        providerStats('Brevo',      BREVO_OK, BREVO_OK ? 'cts.cybersolutions@gmail.com' : null),
        providerStats('Mailjet',    MJ_OK,    MJ_OK  ? 'cts.cybersolutions@gmail.com' : null),
        providerStats('Mailgun',    MG_OK,    MG_OK  ? process.env.MAILGUN_DOMAIN : null),
        providerStats('MailerLite', ML_OK,    ML_OK  ? 'Connected' : null),
      ],
      allTime:  parseInt(totalSent.rows[0].total) || 0,
      todayDb:  parseInt(todaySent.rows[0].total)  || 0,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/brochure/intro-letter.pdf — download the CTS BPO branded intro letter
app.get('/api/brochure/intro-letter.pdf', requireAuth, async (req, res) => {
  try {
    const { generateIntroLetter } = require('./modules/pdf-intro-letter');
    const buf = await generateIntroLetter({ recipientCompany: req.query.company || '' });
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': 'attachment; filename="CTS-BPO-Introduction.pdf"',
      'Content-Length':      buf.length,
    });
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/targeted-scrape/send — send a message + optional PDF to selected contacts
// multipart/form-data: subject, body, contactIds (JSON array), pdf (optional file), useIntroLetter ('true'/'false')
app.post('/api/targeted-scrape/send', requireAuth, requireAdmin, pdfUpload.single('pdf'), async (req, res) => {
  try {
    const { subject, body, contactIds, useIntroLetter } = req.body;
    const ids = JSON.parse(contactIds || '[]');
    if (!ids.length) return res.status(400).json({ error: 'No contacts selected' });
    if (!subject || !body) return res.status(400).json({ error: 'subject and body are required' });

    // Fetch the selected contacts
    const result = await db.query(
      `SELECT id, email, company FROM scraped_contacts WHERE id = ANY($1::int[])`,
      [ids]
    );
    // Only send to contacts that have a valid email address
    const contacts = result.rows.filter(c => c.email && c.email.trim().length > 0);
    const skippedNoEmail = result.rows.length - contacts.length;
    if (!contacts.length) return res.status(404).json({ error: 'None of the selected contacts have an email address' });

    const nodemailer = require('nodemailer');
    const GMAIL_USER     = process.env.GMAIL_USER || '';
    const GMAIL_APP_PASS = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

    if (!GMAIL_USER || !GMAIL_APP_PASS) {
      return res.status(503).json({ error: 'Email not configured — set GMAIL_USER and GMAIL_APP_PASSWORD' });
    }

    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASS },
    });

    // Build base attachments list
    const baseAttachments = [];
    if (req.file) {
      baseAttachments.push({
        filename:    req.file.originalname || 'attachment.pdf',
        content:     req.file.buffer,
        contentType: req.file.mimetype || 'application/pdf',
      });
    }

    // Auto-generate CTS BPO intro letter if requested
    if (useIntroLetter === 'true') {
      try {
        const { generateIntroLetter } = require('./modules/pdf-intro-letter');
        const letterBuf = await generateIntroLetter();
        baseAttachments.push({
          filename:    'CTS-BPO-Introduction.pdf',
          content:     letterBuf,
          contentType: 'application/pdf',
        });
        console.log('[TARGETED SEND] CTS BPO intro letter generated and attached');
      } catch (e) {
        console.error('[TARGETED SEND] Failed to generate intro letter:', e.message);
      }
    }

    const { verifyEmailDomain } = require('./modules/email-verifier');

    // Helper: detect permanent SMTP bounce (5xx) vs transient failure
    function isPermanentBounce(err) {
      const code = err.responseCode || err.code || 0;
      if (code >= 500) return true;
      const msg = (err.message || '').toLowerCase();
      return /550|551|552|553|554|user unknown|does not exist|invalid address|mailbox not found|no such user|address rejected/.test(msg);
    }

    let sent = 0, failed = 0, skippedMx = 0, bounced = 0;
    for (const c of contacts) {
      // ── MX pre-check: skip if domain has no mail servers ──────────────────
      const mxOk = await verifyEmailDomain(c.email).catch(() => true); // default allow on error
      if (!mxOk) {
        console.log(`[TARGETED SEND] MX fail → ${c.email} — marking bounced`);
        await db.query(
          `UPDATE scraped_contacts SET status='bounced', bounced_at=NOW(), updated_at=NOW() WHERE id=$1`,
          [c.id]
        ).catch(() => {});
        skippedMx++;
        bounced++;
        continue;
      }

      // Personalise the intro letter per contact if name is available
      const attachments = [...baseAttachments];
      if (useIntroLetter === 'true' && c.company) {
        try {
          const { generateIntroLetter } = require('./modules/pdf-intro-letter');
          const personalBuf = await generateIntroLetter({ recipientCompany: c.company });
          const idx = attachments.findIndex(a => a.filename === 'CTS-BPO-Introduction.pdf');
          if (idx >= 0) attachments[idx] = { filename: 'CTS-BPO-Introduction.pdf', content: personalBuf, contentType: 'application/pdf' };
        } catch {}
      }

      try {
        await transport.sendMail({
          from: `"Calvin Thomas — CTS BPO" <${GMAIL_USER}>`,
          to:   c.email,
          subject: subject.replace(/{{company}}/g, c.company || 'there'),
          text: body.replace(/{{company}}/g, c.company || 'there'),
          html: `<div style="font-family:sans-serif;line-height:1.7;color:#1e293b;max-width:600px">${
            body.replace(/\n/g, '<br>').replace(/{{company}}/g, c.company || 'there')
          }${useIntroLetter === 'true' ? '<br><br><hr style="border:none;border-top:1px solid #e2e8f0"><p style="font-size:12px;color:#64748b">📎 Please find the attached CTS BPO Company Introduction &amp; Pricing Overview for your reference.</p>' : ''}</div>`,
          attachments,
        });
        sent++;
        await db.query(
          `UPDATE scraped_contacts SET status='contacted', outreach_sent_at=NOW(), updated_at=NOW() WHERE id=$1`,
          [c.id]
        ).catch(() => {});
      } catch (err) {
        if (isPermanentBounce(err)) {
          // Permanent failure — mark the whole domain as bounced so AI skips it forever
          bounced++;
          console.warn(`[TARGETED SEND] Permanent bounce → ${c.email}: ${err.message}`);
          await db.query(
            `UPDATE scraped_contacts SET status='bounced', bounced_at=NOW(), updated_at=NOW() WHERE email=$1`,
            [c.email]
          ).catch(() => {});
        } else {
          failed++;
          console.error(`[TARGETED SEND] Transient fail → ${c.email}:`, err.message);
        }
      }
      await new Promise(r => setTimeout(r, 4000)); // 4s between sends
    }

    res.json({ ok: true, sent, failed, bounced, skippedMx, total: contacts.length, skippedNoEmail });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Client Portal Routes ──────────────────────────────────────────────────────
app.use('/api/client', clientPortalRouter);

// ── Analytics API ─────────────────────────────────────────────────────────────
app.get('/api/analytics', requireAuth, async (req, res) => {
  try {
    if (!db.isConnected()) return res.json({ kpis:{}, revenueByMonth:[], jobsByServiceType:[], leadFunnel:[], subStats:{}, recentActivity:[] });

    const [
      revenueMonthly, jobsService, leadStats,
      subTotal, subQuality, subPaid, subPerformers,
      recentTxns, recentJobs,
    ] = await Promise.all([
      // Revenue + payouts by month (last 12 months)
      db.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', COALESCE(js.delivered_at, sj.created_at)),'Mon YYYY') AS month,
               DATE_TRUNC('month', COALESCE(js.delivered_at, sj.created_at)) AS month_dt,
               COALESCE(SUM(sj.job_value),0)   AS revenue,
               COALESCE(SUM(sj.sub_payout),0)  AS payouts,
               COALESCE(SUM(sj.our_margin),0)  AS margin
        FROM job_submissions js
        JOIN subcontractor_jobs sj ON sj.id = js.job_id
        WHERE js.status IN ('delivered','confirmed','paid')
          AND COALESCE(js.delivered_at, sj.created_at) >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', COALESCE(js.delivered_at, sj.created_at))
        ORDER BY month_dt ASC
      `),
      // Jobs by type (derive from title keyword or job_type on ai_leads)
      db.query(`
        SELECT COALESCE(NULLIF(TRIM(title),''),'Other') AS type,
               COUNT(*)                       AS count,
               COALESCE(SUM(job_value),0)     AS total_value,
               COALESCE(AVG(job_value),0)     AS avg_value
        FROM subcontractor_jobs
        GROUP BY TRIM(title)
        ORDER BY count DESC
        LIMIT 10
      `).catch(() => ({ rows:[] })),
      // Lead funnel
      db.query(`
        SELECT
          COUNT(*)                                                      AS total,
          COUNT(*) FILTER (WHERE outreach_sent_at IS NOT NULL)          AS outreached,
          COUNT(*) FILTER (WHERE status IN ('responded','negotiating','contracted','active')) AS responded,
          COUNT(*) FILTER (WHERE status IN ('contracted','active'))     AS contracted
        FROM ai_leads
      `).catch(() => ({ rows:[{ total:0, outreached:0, responded:0, contracted:0 }] })),
      // Subcontractor total (from approved applications)
      db.query(`SELECT COUNT(*) AS total FROM subcontractor_applications WHERE status='approved'`)
        .catch(() => ({ rows:[{ total:0 }] })),
      // Avg quality + active count (use success_rate from subcontractors, or applications)
      db.query(`
        SELECT
          COALESCE(AVG(success_rate),0)              AS avg_quality,
          COUNT(*) FILTER (WHERE status='active')    AS active
        FROM subcontractors
      `).catch(() => ({ rows:[{ avg_quality:0, active:0 }] })),
      // Total paid out to subs
      db.query(`
        SELECT COALESCE(SUM(sj.sub_payout),0) AS total_paid
        FROM job_submissions js
        JOIN subcontractor_jobs sj ON sj.id = js.job_id
        WHERE js.payout_status = 'paid'
      `).catch(() => ({ rows:[{ total_paid:0 }] })),
      // Top performers — join via subcontractor_applications (sub_application_id)
      db.query(`
        SELECT sa.name, sa.id,
               COUNT(js.id)                      AS jobs_done,
               COALESCE(AVG(js.ai_quality_score),0) AS avg_quality,
               COALESCE(SUM(sj.sub_payout),0)   AS total_earned,
               COALESCE(AVG(CASE WHEN sj.due_date IS NULL THEN NULL
                                 WHEN js.submitted_at <= sj.due_date THEN 100 ELSE 0 END),0) AS on_time_rate
        FROM subcontractor_applications sa
        JOIN job_submissions js ON js.sub_application_id = sa.id
        JOIN subcontractor_jobs sj ON sj.id = js.job_id
        WHERE js.status IN ('submitted','delivered','confirmed','paid')
        GROUP BY sa.id, sa.name
        ORDER BY avg_quality DESC, jobs_done DESC
        LIMIT 20
      `).catch(() => ({ rows:[] })),
      // Recent transactions
      db.query(`
        SELECT 'payment' AS type, 'Payment received' AS event,
               amount_zar AS amount, paid_at AS date,
               '💰' AS icon
        FROM transactions
        WHERE paid_at IS NOT NULL
        ORDER BY paid_at DESC LIMIT 10
      `).catch(() => ({ rows:[] })),
      // Recent completed jobs
      db.query(`
        SELECT 'job' AS type,
               ('Job completed: ' || sj.title) AS event,
               sj.job_value AS amount,
               js.delivered_at AS date,
               '✅' AS icon
        FROM job_submissions js
        JOIN subcontractor_jobs sj ON sj.id = js.job_id
        WHERE js.status IN ('delivered','confirmed','paid')
        ORDER BY js.delivered_at DESC NULLS LAST LIMIT 10
      `).catch(() => ({ rows:[] })),
    ]);

    const rm = revenueMonthly.rows;
    const totalRevenue  = rm.reduce((a,r) => a + parseFloat(r.revenue||0), 0);
    const totalPayouts  = rm.reduce((a,r) => a + parseFloat(r.payouts||0), 0);
    const currentMonth  = rm[rm.length - 1];
    const monthlyRevenue = parseFloat(currentMonth?.revenue || 0);
    const marginPct      = totalRevenue > 0 ? Math.round(((totalRevenue - totalPayouts) / totalRevenue) * 100) : 0;

    // Lead funnel for recharts FunnelChart
    const lf = leadStats.rows[0] || {};
    const leadFunnel = [
      { name:'Total Leads',     value: parseInt(lf.total||0) },
      { name:'Outreached',      value: parseInt(lf.outreached||0) },
      { name:'Responded',       value: parseInt(lf.responded||0) },
      { name:'Contracted',      value: parseInt(lf.contracted||0) },
    ].filter(f => f.value > 0);

    // Jobs: aggregate total count/value
    let totalJobs = 0, completedJobs = 0;
    try {
      const jt = await db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status IN ('delivered','confirmed','paid')) AS completed FROM job_submissions`);
      totalJobs    = parseInt(jt.rows[0].total||0);
      completedJobs = parseInt(jt.rows[0].completed||0);
    } catch {}

    const subQRow = subQuality.rows[0] || {};
    const subStats = {
      total:     parseInt(subTotal.rows[0]?.total||0),
      active:    parseInt(subQRow.active||0),
      avgQuality: parseFloat(subQRow.avg_quality||0),
      avgOnTime:  subPerformers.rows.length > 0
                    ? subPerformers.rows.reduce((a,r) => a + parseFloat(r.on_time_rate||0), 0) / subPerformers.rows.length
                    : 0,
      totalPaid:  parseFloat(subPaid.rows[0]?.total_paid||0),
      topPerformers: subPerformers.rows.map(r => ({
        name:       r.name,
        jobsDone:   parseInt(r.jobs_done||0),
        avgQuality: parseFloat(r.avg_quality||0),
        totalEarned:parseFloat(r.total_earned||0),
        onTimeRate: parseFloat(r.on_time_rate||0),
      })),
    };

    const allActivity = [...recentTxns.rows, ...recentJobs.rows]
      .sort((a,b) => new Date(b.date||0) - new Date(a.date||0))
      .slice(0, 20);

    res.json({
      kpis: {
        totalRevenue,
        monthlyRevenue,
        totalJobs,
        completedJobs,
        activeSubs:  subStats.active,
        totalLeads:  parseInt(lf.total||0),
        respondedLeads: parseInt(lf.responded||0),
        avgQuality:  subStats.avgQuality,
        marginPct,
      },
      revenueByMonth: rm.map(r => ({
        month:   r.month,
        revenue: parseFloat(r.revenue||0),
        payouts: parseFloat(r.payouts||0),
        margin:  parseFloat(r.margin||0),
      })),
      jobsByServiceType: jobsService.rows.map(r => ({
        type:       r.type,
        count:      parseInt(r.count||0),
        totalValue: parseFloat(r.total_value||0),
        avgValue:   parseFloat(r.avg_value||0),
      })),
      leadFunnel,
      subStats,
      recentActivity: allActivity,
    });
  } catch (err) {
    console.error('Analytics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Subcontractor Performance API ─────────────────────────────────────────────
app.get('/api/subcontractors/performance', requireAuth, async (req, res) => {
  try {
    if (!db.isConnected()) return res.json({ performers: [] });
    const r = await db.query(`
      SELECT sa.id, sa.name, sa.email,
             sa.services                                      AS skills,
             sa.status,
             COUNT(js.id)                                     AS jobs_done,
             COALESCE(AVG(js.ai_quality_score), 0)            AS avg_quality,
             COALESCE(SUM(sj.sub_payout)
               FILTER (WHERE js.payout_status='paid'), 0)     AS total_earned,
             COUNT(js.id) FILTER (WHERE js.payout_status='paid') AS paid_jobs,
             COALESCE(AVG(CASE
               WHEN sj.due_date IS NULL THEN NULL
               WHEN js.submitted_at IS NOT NULL AND js.submitted_at <= sj.due_date THEN 100
               ELSE 0 END), 0)                                AS on_time_rate,
             MAX(js.submitted_at)                             AS last_submission,
             MIN(js.submitted_at)                             AS first_job
      FROM subcontractor_applications sa
      LEFT JOIN job_submissions js ON js.sub_application_id = sa.id
      LEFT JOIN subcontractor_jobs sj ON sj.id = js.job_id
      WHERE sa.status IN ('approved','active')
      GROUP BY sa.id, sa.name, sa.email, sa.services, sa.status
      ORDER BY avg_quality DESC, jobs_done DESC
    `);
    res.json({
      performers: r.rows.map(p => ({
        id:          p.id,
        name:        p.name,
        email:       p.email,
        skills:      p.skills,
        status:      p.status,
        jobsDone:    parseInt(p.jobs_done||0),
        avgQuality:  parseFloat(p.avg_quality||0),
        totalEarned: parseFloat(p.total_earned||0),
        paidJobs:    parseInt(p.paid_jobs||0),
        onTimeRate:  parseFloat(p.on_time_rate||0),
        lastSubmission: p.last_submission,
        firstJob:    p.first_job,
        tier: parseFloat(p.avg_quality||0) >= 90 ? 'Gold'
            : parseFloat(p.avg_quality||0) >= 75 ? 'Silver' : 'Bronze',
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Email open tracking pixel ─────────────────────────────────────────────────
// Public — no auth. Returns a 1×1 transparent GIF and records the open event.
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
app.get('/t/o/:token', async (req, res) => {
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' });
  res.end(PIXEL_GIF);
  emailAnalytics.recordOpen(req.params.token).catch(() => {});
});

// ── Email click redirect ───────────────────────────────────────────────────────
// Public — no auth. Records click then redirects to the original URL.
app.get('/t/c/:token', async (req, res) => {
  emailAnalytics.recordClick(req.params.token).catch(() => {});
  const target = req.query.u;
  if (target) {
    res.redirect(302, decodeURIComponent(target));
  } else {
    res.redirect(302, 'https://www.ctsbposolutions.com');
  }
});

// ── Email analytics API ───────────────────────────────────────────────────────
app.get('/api/analytics/email', requireAuth, async (req, res) => {
  try {
    const summary = await emailAnalytics.getPerformanceSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Serve React build in production ──────────────────────────────────────────
// Only activated when the frontend has been built (production / after `npm run build`)
const buildDir = path.join(__dirname, '../../frontend/build');
if (require('fs').existsSync(buildDir)) {
  app.use(express.static(buildDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildDir, 'index.html'));
  });
}

const http = require('http');
const WebSocket = require('ws');
const callCentreSignaling = require('./modules/call-centre');

const server = http.createServer(app);

// ── WebSocket signaling for WebRTC call centre ────────────────────────────────
const wss = new WebSocket.Server({ noServer: true });
wss.on('connection', (ws, req) => callCentreSignaling.handleSignaling(ws, req));

server.on('upgrade', (req, socket, head) => {
  if (req.url && req.url.startsWith('/ws/call-signal')) {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CTS BPO Backend running on port ${PORT}`);
  console.log(`📞 WebRTC signaling active at ws://0.0.0.0:${PORT}/ws/call-signal`);
  auditLogger.log('system.start', null, null, `Server started on port ${PORT}`, null, 'info');
  // Start agent with retry — DB connection may timeout on first boot
  (async function startAgentWithRetry(attempts = 0) {
    try {
      await autonomousAgent.startAgent();
    } catch (err) {
      console.error(`Autonomous agent failed to start (attempt ${attempts + 1}):`, err.message);
      if (attempts < 5) {
        const delay = (attempts + 1) * 8000; // 8s, 16s, 24s, 32s, 40s
        console.log(`🔄 Retrying agent start in ${delay / 1000}s...`);
        setTimeout(() => startAgentWithRetry(attempts + 1), delay);
      } else {
        console.error('❌ Agent failed to start after 5 attempts — manual restart required.');
      }
    }
  })();
});

module.exports = app;

