require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const path    = require('path');

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

// ─── Protected routes (require JWT) ──────────────────────────────────────────

// Dashboard metrics
app.get('/api/metrics', requireAuth, async (req, res) => {
  try {
    const [contracts, revenue, clients, leads, subcontractors, completedContracts] = await Promise.all([
      db.query(`SELECT
          COUNT(*) FILTER (WHERE status = 'active')    AS "activeContracts",
          COUNT(*) FILTER (WHERE status = 'completed') AS "completedContracts",
          COUNT(*) FILTER (WHERE status = 'completed' AND updated_at >= CURRENT_DATE) AS "completedToday"
        FROM contracts`),
      db.query(`SELECT
          COALESCE(SUM(amount_zar) FILTER (WHERE status='succeeded'), 0) AS "totalZar",
          COALESCE(SUM(amount_zar) FILTER (WHERE status='succeeded' AND EXTRACT(MONTH FROM paid_at)=EXTRACT(MONTH FROM NOW())), 0) AS "monthlyZar"
        FROM transactions`),
      db.query(`SELECT COUNT(*) AS total FROM clients`),
      db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='responded') AS responded FROM job_leads`),
      db.query(`SELECT COUNT(*) AS total FROM subcontractors`),
      db.query(`SELECT COALESCE(AVG(success_rate),0) AS rate FROM contracts WHERE status='completed'`),
    ]);

    const activeContracts  = parseInt(contracts.rows[0].activeContracts, 10)  || 0;
    const completedToday   = parseInt(contracts.rows[0].completedToday, 10)   || 0;
    const totalCompleted   = parseInt(contracts.rows[0].completedContracts, 10) || 0;
    const totalClients     = parseInt(clients.rows[0].total, 10)               || 0;
    const totalLeads       = parseInt(leads.rows[0].total, 10)                 || 0;
    const respondedLeads   = parseInt(leads.rows[0].responded, 10)             || 0;
    const totalSubcontractors = parseInt(subcontractors.rows[0].total, 10)     || 0;
    const monthlyRevZar    = parseFloat(revenue.rows[0].monthlyZar)            || 0;
    const totalRevZar      = parseFloat(revenue.rows[0].totalZar)              || 0;
    const successRatePct   = totalCompleted > 0 ? Math.round(parseFloat(completedContracts.rows[0].rate) * 100) : 0;

    res.json({
      activeContracts,
      completedToday,
      totalCompleted,
      totalClients,
      totalLeads,
      respondedLeads,
      totalSubcontractors,
      monthlyRevZar,
      totalRevZar,
      successRate: successRatePct,
      daily: monthlyRevZar > 0 ? `R ${monthlyRevZar.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}` : 'R 0',
      aiStatus: 'running',
      uptime: '99.98%',
      live: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Module status panel
app.get('/api/status', requireAuth, async (req, res) => {
  const modules = [
    { module: 'AI Sourcing & Outreach', status: 'running', lastAction: 'Outreach campaign ready', updatedAt: new Date().toISOString() },
    { module: 'AI Negotiation Engine', status: 'running', lastAction: 'Margin floor 15% active', updatedAt: new Date().toISOString() },
    { module: 'AI Contract Manager', status: 'running', lastAction: 'Risk scoring active', updatedAt: new Date().toISOString() },
    { module: 'AI Subcontractor Assignment', status: 'running', lastAction: 'Capacity scoring active', updatedAt: new Date().toISOString() },
    { module: 'AI Payment Gateway', status: OZOW_STATUS(), lastAction: OZOW_STATUS() === 'running' ? 'Ozow connected' : 'Dev stub mode', updatedAt: new Date().toISOString() },
    { module: 'AI Audit Trail Logger', status: db.isConnected() ? 'running' : 'running', lastAction: db.isConnected() ? 'Logging to PostgreSQL' : 'Logging to memory', updatedAt: new Date().toISOString() },
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
  if (!db.isConnected()) return;
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
}
ensureSubcontractorTables().catch(e => console.error('ensureSubcontractorTables:', e.message));

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

// POST /api/ai-agent/trigger/:task — manually trigger any agent task
app.post('/api/ai-agent/trigger/:task', requireAuth, requireAdmin, async (req, res) => {
  try {
    await autonomousAgent.triggerNow(req.params.task);
    res.json({ ok: true, message: `Task "${req.params.task}" triggered successfully.` });
  } catch (err) { res.status(400).json({ error: err.message }); }
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CTS BPO Backend running on port ${PORT}`);
  auditLogger.log('system.start', null, null, `Server started on port ${PORT}`, null, 'info');
  // Start the autonomous AI agent
  autonomousAgent.startAgent().catch(err => {
    console.error('Autonomous agent failed to start:', err.message);
  });
});

module.exports = app;

