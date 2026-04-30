/**
 * Client Portal Routes — CTS BPO
 * Clients access via a secure token sent in their delivery email.
 *
 * GET  /api/client/portal/:token        — verify token, get job + invoice list
 * GET  /api/client/portal/:token/jobs   — all jobs for this client
 * POST /api/client/portal/:token/upload — upload source file for a job
 * GET  /api/client/invoice/:jobId/pdf   — download PDF invoice
 */

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const db       = require('../db');
const auditLogger = require('../modules/audit-logger');
const pdfInvoice  = require('../modules/pdf-invoice');

const router = express.Router();

// ── File upload ───────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/client-files');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `client_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// ── Helper: look up client by delivery token ──────────────────────────────
async function getClientByToken(token) {
  if (!db.isConnected()) return null;
  const r = await db.query(`
    SELECT js.id AS submission_id, js.delivery_token, js.job_id,
           js.status, js.delivered_at, js.confirmed_at, js.payout_status,
           js.file_path, js.file_name,
           sj.title, sj.description, sj.job_value, sj.sub_payout,
           sj.our_margin, sj.service_type, sj.due_date, sj.contract_id,
           sj.status AS job_status,
           al.contact_email AS client_email, al.company AS client_name,
           al.id AS lead_id
    FROM job_submissions js
    JOIN subcontractor_jobs sj ON sj.id = js.job_id
    LEFT JOIN contracts c ON c.id = sj.contract_id
    LEFT JOIN ai_leads al ON al.id = c.client_id::integer
    WHERE js.delivery_token = $1
  `, [token]);
  return r.rows[0] || null;
}

/* ── GET /portal/:token — client dashboard ───────────────────────────────── */
router.get('/portal/:token', async (req, res) => {
  try {
    const row = await getClientByToken(req.params.token);
    if (!row) return res.status(404).json({ error: 'Invalid or expired access link' });

    // Get all jobs for this client (same lead_id)
    let allJobs = [row];
    if (row.lead_id) {
      const allR = await db.query(`
        SELECT js.id AS submission_id, js.delivery_token, js.job_id,
               js.status, js.delivered_at, js.confirmed_at, js.payout_status,
               js.file_name,
               sj.title, sj.description, sj.job_value, sj.service_type,
               sj.due_date, sj.status AS job_status
        FROM job_submissions js
        JOIN subcontractor_jobs sj ON sj.id = js.job_id
        LEFT JOIN contracts c ON c.id = sj.contract_id
        WHERE c.client_id::integer = $1
        ORDER BY js.delivered_at DESC NULLS LAST
      `, [row.lead_id]);
      if (allR.rows.length > 0) allJobs = allR.rows;
    }

    await auditLogger.log('client.portal_access', 'client', row.lead_id,
      `Client accessed portal via token`, null, 'info');

    res.json({
      client: {
        name:  row.client_name || 'Valued Client',
        email: row.client_email,
      },
      currentJob: row,
      jobs: allJobs,
    });
  } catch (err) {
    console.error('Client portal error:', err.message);
    res.status(500).json({ error: 'Portal unavailable' });
  }
});

/* ── POST /portal/:token/upload — client uploads source file ─────────────── */
router.post('/portal/:token/upload', upload.single('sourceFile'), async (req, res) => {
  try {
    const row = await getClientByToken(req.params.token);
    if (!row) return res.status(404).json({ error: 'Invalid access link' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    await db.query(`
      UPDATE subcontractor_jobs
      SET notes = COALESCE(notes,'') || ' | client_file:' || $1 || ' at ' || NOW(), updated_at=NOW()
      WHERE id = $2
    `, [req.file.filename, row.job_id]);

    await auditLogger.log('client.file_upload', 'client', row.lead_id,
      `Client uploaded source file: ${req.file.originalname}`, null, 'info');

    res.json({ success: true, fileName: req.file.originalname, message: 'File received — our team will process it shortly.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /invoice/:jobId/pdf — download PDF invoice ─────────────────────── */
router.get('/invoice/:token/pdf', async (req, res) => {
  try {
    const row = await getClientByToken(req.params.token);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const ref = `INV-${String(row.job_id).padStart(5, '0')}`;
    const pdfBuffer = await pdfInvoice.generateInvoicePDF({
      jobTitle:     row.title,
      clientName:   row.client_name || 'Valued Client',
      clientEmail:  row.client_email || '',
      jobValue:     row.job_value || 0,
      reference:    ref,
      deliveryDate: row.delivered_at || new Date().toISOString(),
      description:  row.description,
      serviceType:  row.service_type || 'BPO Services',
    });

    await auditLogger.log('client.invoice_download', 'client', row.lead_id,
      `Invoice ${ref} downloaded`, null, 'info');

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${ref}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /invoice/:token/view — view invoice data as JSON ────────────────── */
router.get('/invoice/:token/view', async (req, res) => {
  try {
    const row = await getClientByToken(req.params.token);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const ref = `INV-${String(row.job_id).padStart(5, '0')}`;
    res.json({
      reference:    ref,
      jobTitle:     row.title,
      clientName:   row.client_name || 'Valued Client',
      clientEmail:  row.client_email,
      jobValue:     row.job_value,
      serviceType:  row.service_type,
      deliveredAt:  row.delivered_at,
      confirmedAt:  row.confirmed_at,
      payoutStatus: row.payout_status,
      jobStatus:    row.job_status,
      dueDate:      row.due_date,
      description:  row.description,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
