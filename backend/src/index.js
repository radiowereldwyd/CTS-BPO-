require('dotenv').config();
const express = require('express');

const negotiation = require('./modules/negotiation');
const contractManager = require('./modules/contract-manager');
const subcontractorAssignment = require('./modules/subcontractor-assignment');
const paymentGateway = require('./modules/payment-gateway');
const auditLogger = require('./modules/audit-logger');
const emailOutreach = require('./modules/email-outreach');
const db = require('./db');
const authRouter = require('./routes/auth');
const { requireAuth, requireAdmin } = require('./middleware/auth');

const app = express();
app.use(express.json());

// CORS – allow frontend dev server
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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
app.use('/api/auth', authRouter);

// ─── Protected routes (require JWT) ──────────────────────────────────────────

// Dashboard metrics
app.get('/api/metrics', requireAuth, async (req, res) => {
  try {
    if (db.isConnected()) {
      const [contracts, revenue, successRate] = await Promise.all([
        db.query(`SELECT
            COUNT(*) FILTER (WHERE status = 'active')  AS "activeContracts",
            COUNT(*) FILTER (WHERE status = 'completed' AND updated_at >= CURRENT_DATE) AS "completedToday"
          FROM contracts`),
        db.query(`SELECT COALESCE(SUM(amount_zar),0) AS revenue FROM transactions WHERE status='succeeded' AND EXTRACT(MONTH FROM paid_at)=EXTRACT(MONTH FROM NOW())`),
        db.query(`SELECT COALESCE(AVG(success_rate),0.89) AS rate FROM contracts WHERE status='completed'`),
      ]);
      return res.json({
        activeContracts: parseInt(contracts.rows[0].activeContracts, 10),
        completedToday: parseInt(contracts.rows[0].completedToday, 10),
        revenue: parseFloat(revenue.rows[0].revenue),
        successRate: Math.round(parseFloat(successRate.rows[0].rate) * 100),
        aiStatus: 'running',
      });
    }
    // Placeholder when no DB
    res.json({ activeContracts: 12, completedToday: 5, revenue: 225000, successRate: 89, aiStatus: 'running' });
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

// Payment routes
app.post('/api/payments/initiate', requireAuth, async (req, res) => {
  try {
    const result = await paymentGateway.initiatePayment(req.body);
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

// Audit logs (admin only)
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

