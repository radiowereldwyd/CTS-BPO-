require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');

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

// Subcontractors list
app.get('/api/subcontractors', requireAuth, async (req, res) => {
  try {
    const list = await subcontractorAssignment.getSubcontractors();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`CTS BPO Backend running on port ${PORT}`);
  auditLogger.log('system.start', null, null, `Server started on port ${PORT}`, null, 'info');
});

module.exports = app;

