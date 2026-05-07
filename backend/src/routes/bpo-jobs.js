/**
 * BPO Job Delivery Routes
 * POST   /api/bpo-jobs                        — client submits new job (token auth)
 * GET    /api/bpo-jobs                        — admin: list all jobs
 * GET    /api/bpo-jobs/stats                  — admin: pipeline counts
 * GET    /api/bpo-jobs/mine                   — sub: my assigned jobs
 * GET    /api/bpo-jobs/client/:token          — client: their jobs (no login needed)
 * GET    /api/bpo-jobs/:id                    — admin: full job detail
 * PATCH  /api/bpo-jobs/:id/assign             — admin: assign to sub
 * PATCH  /api/bpo-jobs/:id/start              — sub: mark in_progress
 * PATCH  /api/bpo-jobs/:id/submit             — sub: upload completed work
 * PATCH  /api/bpo-jobs/:id/approve            — admin: approve → deliver to client
 * PATCH  /api/bpo-jobs/:id/reject             — admin: request revision
 * GET    /api/bpo-jobs/:id/download/:type/:i  — download source or completed file
 */

const express = require('express');
const multer  = require('multer');
const { requireAuth, requireAdmin, requireSubcontractor } = require('../middleware/auth');
const jobDelivery  = require('../modules/job-delivery');
const emailOutreach = require('../modules/email-outreach');
const auditLogger  = require('../modules/audit-logger');

const router = express.Router();
const APP_URL = process.env.APP_URL || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'cts.cybersolutions@gmail.com';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(pdf|doc|docx|xls|xlsx|csv|txt|png|jpg|jpeg|mp3|mp4|wav|ogg|zip|rar|7z)$/i.test(file.originalname);
    ok ? cb(null, true) : cb(new Error(`File type not allowed: ${file.originalname}`));
  },
});

function filesToBase64(files = []) {
  return (files || []).map(f => ({
    name: f.originalname,
    type: f.mimetype,
    size: f.size,
    data: f.buffer.toString('base64'),
  }));
}

/* ── POST / — client submits job ─────────────────────────────────────────── */
router.post('/', upload.array('files', 5), async (req, res) => {
  try {
    const { clientToken, clientName, clientEmail, jobType, title, description, instructions, deadline, priority } = req.body;
    if (!clientToken) return res.status(400).json({ error: 'Access token required' });
    if (!title?.trim()) return res.status(400).json({ error: 'Job title is required' });
    if (!jobType) return res.status(400).json({ error: 'Job type is required' });

    const sourceFiles = filesToBase64(req.files || []);
    const job = await jobDelivery.createJob({ clientToken, clientName, clientEmail, jobType, title: title.trim(), description, instructions, deadline, priority: priority || 'normal', sourceFiles });

    auditLogger.log('bpo_job.created', 'client', null,
      `New BPO job: "${job.title}" [${jobType}] by ${clientEmail || 'portal client'}`, null, 'info').catch(() => {});

    emailOutreach.sendMail({
      to: ADMIN_EMAIL,
      subject: `🆕 New BPO Job Submitted: ${job.title}`,
      html: `<p>A new BPO job is waiting for assignment.</p>
             <table cellpadding="6"><tr><td><b>Job #</b></td><td>${job.id}</td></tr>
             <tr><td><b>Title</b></td><td>${job.title}</td></tr>
             <tr><td><b>Type</b></td><td>${jobType}</td></tr>
             <tr><td><b>Client</b></td><td>${clientName || '—'} &lt;${clientEmail || 'portal'}&gt;</td></tr>
             <tr><td><b>Priority</b></td><td>${priority || 'normal'}</td></tr>
             <tr><td><b>Deadline</b></td><td>${deadline || 'Not set'}</td></tr>
             <tr><td><b>Files</b></td><td>${sourceFiles.length} attached</td></tr></table>
             <p><a href="${APP_URL}/job-queue" style="background:#6366f1;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700;">View Job Queue →</a></p>`,
      text: `New BPO job #${job.id}: "${job.title}" [${jobType}] from ${clientEmail}. Login to assign.`,
    }).catch(() => {});

    res.json({ success: true, job: { id: job.id, title: job.title, status: job.status } });
  } catch (err) {
    console.error('[BPO] Create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── GET / — admin list ──────────────────────────────────────────────────── */
router.get('/', requireAuth, async (req, res) => {
  try {
    const jobs = await jobDelivery.listJobs({ status: req.query.status, limit: parseInt(req.query.limit) || 200 });
    res.json({ jobs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── GET /stats — pipeline counts ────────────────────────────────────────── */
router.get('/stats', requireAuth, async (req, res) => {
  try { res.json(await jobDelivery.getStats()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── GET /mine — sub's own jobs ──────────────────────────────────────────── */
router.get('/mine', requireSubcontractor, async (req, res) => {
  try {
    const jobs = await jobDelivery.getSubJobs(req.user.id);
    res.json({ jobs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── GET /client/:token — client's jobs (no login) ───────────────────────── */
router.get('/client/:token', async (req, res) => {
  try {
    const jobs = await jobDelivery.getJobsByToken(req.params.token);
    res.json({ jobs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── GET /:id — full job (admin) ─────────────────────────────────────────── */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const job = await jobDelivery.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ job });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── PATCH /:id/assign — admin assigns ───────────────────────────────────── */
router.patch('/:id/assign', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { subId, subName, subEmail } = req.body;
    if (!subId) return res.status(400).json({ error: 'subId required' });
    const job = await jobDelivery.assignJob(req.params.id, { subId, subName, subEmail });
    if (!job) return res.status(404).json({ error: 'Job not found or cannot be assigned now' });

    auditLogger.log('bpo_job.assigned', 'admin', null, `Job #${job.id} assigned to ${subName}`, null, 'info').catch(() => {});

    if (subEmail) {
      emailOutreach.sendMail({
        to: subEmail,
        subject: `📋 New BPO Job Assigned: ${job.title}`,
        html: `<p>Hi ${subName},</p>
               <p>You have a new BPO job assigned on the CTS BPO platform.</p>
               <table cellpadding="6">
                 <tr><td><b>Job #</b></td><td>${job.id}</td></tr>
                 <tr><td><b>Title</b></td><td>${job.title}</td></tr>
                 <tr><td><b>Type</b></td><td>${job.job_type}</td></tr>
                 <tr><td><b>Priority</b></td><td>${job.priority}</td></tr>
                 <tr><td><b>Deadline</b></td><td>${job.deadline || 'Flexible'}</td></tr>
               </table>
               ${job.instructions ? `<p><b>Instructions:</b> ${job.instructions}</p>` : ''}
               <p><a href="${APP_URL}/subcontractor/portal" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;">Open Portal & Download Files →</a></p>
               <p>WhatsApp: <a href="https://wa.me/27760679100">+27 76 067 9100</a></p>`,
        text: `New BPO job assigned: ${job.title}. Login to your portal to start.`,
      }).catch(() => {});
    }

    res.json({ success: true, job });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── PATCH /:id/start — sub starts job ───────────────────────────────────── */
router.patch('/:id/start', requireSubcontractor, async (req, res) => {
  try {
    const job = await jobDelivery.startJob(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found or not assigned to you' });
    res.json({ success: true, job });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── PATCH /:id/submit — sub submits completed work ──────────────────────── */
router.patch('/:id/submit', requireSubcontractor, upload.array('files', 5), async (req, res) => {
  try {
    const completedFiles = filesToBase64(req.files || []);
    if (completedFiles.length === 0) return res.status(400).json({ error: 'Please upload at least one completed file' });
    const job = await jobDelivery.submitWork(req.params.id, req.user.id, completedFiles);
    if (!job) return res.status(404).json({ error: 'Job not found, not assigned to you, or wrong status' });

    auditLogger.log('bpo_job.submitted', 'subcontractor', req.user.id,
      `Job #${job.id} work submitted — awaiting admin review`, null, 'info').catch(() => {});

    emailOutreach.sendMail({
      to: ADMIN_EMAIL,
      subject: `✅ Work Ready for Review: ${job.title}`,
      html: `<p><b>${req.user.name || req.user.email}</b> submitted completed work for job #${job.id} "<b>${job.title}</b>".</p>
             <p>${completedFiles.length} file(s) uploaded and ready for your review.</p>
             <p><a href="${APP_URL}/job-queue" style="background:#10b981;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700;">Review Now →</a></p>`,
      text: `Work submitted for job #${job.id}: ${job.title}. Login to review and approve.`,
    }).catch(() => {});

    res.json({ success: true, message: 'Work submitted for review!', job });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── PATCH /:id/approve — admin approves ─────────────────────────────────── */
router.patch('/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const job = await jobDelivery.approveJob(req.params.id, req.body.qualityNotes || '');
    if (!job) return res.status(404).json({ error: 'Job not found or not in review status' });

    auditLogger.log('bpo_job.delivered', 'admin', null, `Job #${job.id} approved and delivered to client`, null, 'success').catch(() => {});

    if (job.client_email) {
      const portalLink = `${APP_URL}/client/portal/${job.client_token}`;
      emailOutreach.sendMail({
        to: job.client_email,
        subject: `✅ Your BPO Job is Complete: ${job.title}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
               <div style="background:#1e3a5f;padding:24px;text-align:center;border-radius:12px 12px 0 0">
                 <h2 style="color:#fff;margin:0">✅ Job Delivered!</h2>
               </div>
               <div style="padding:28px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
                 <p>Hi ${job.client_name || 'there'},</p>
                 <p>Your BPO job <b>"${job.title}"</b> has been completed and is ready for download.</p>
                 <div style="text-align:center;margin:28px 0">
                   <a href="${portalLink}" style="background:#10b981;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
                     📥 Download Completed Work
                   </a>
                 </div>
                 ${job.quality_notes ? `<p style="background:#f0fdf4;padding:12px;border-radius:8px;color:#166534"><b>Quality notes:</b> ${job.quality_notes}</p>` : ''}
                 <p style="color:#64748b;font-size:13px">Your client portal (all jobs, files & invoices): <a href="${portalLink}">${portalLink}</a></p>
                 <p style="color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:20px">
                   CTS BPO · <a href="https://wa.me/27760679100">WhatsApp: +27 76 067 9100</a> · <a href="mailto:info@ctsbpo.com">info@ctsbpo.com</a>
                 </p>
               </div></div>`,
        text: `Your BPO job "${job.title}" is delivered. Download here: ${portalLink}`,
      }).catch(() => {});
    }

    res.json({ success: true, job });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── PATCH /:id/reject — admin requests revision ─────────────────────────── */
router.patch('/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { revisionNotes } = req.body;
    if (!revisionNotes?.trim()) return res.status(400).json({ error: 'Revision notes required' });
    const job = await jobDelivery.rejectJob(req.params.id, revisionNotes);
    if (!job) return res.status(404).json({ error: 'Job not found or not in review status' });

    auditLogger.log('bpo_job.revision', 'admin', null,
      `Job #${job.id} revision #${job.revision_count} requested`, null, 'warning').catch(() => {});

    if (job.assigned_email) {
      emailOutreach.sendMail({
        to: job.assigned_email,
        subject: `🔄 Revision Requested: ${job.title}`,
        html: `<p>Hi ${job.assigned_name},</p>
               <p>The admin has requested a revision for job #${job.id} "<b>${job.title}</b>".</p>
               <p><b>What to fix:</b></p>
               <blockquote style="border-left:3px solid #f59e0b;padding-left:14px;color:#374151">${revisionNotes}</blockquote>
               <p><a href="${APP_URL}/subcontractor/portal" style="background:#f59e0b;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;">Go to Portal & Re-submit →</a></p>`,
        text: `Revision requested for job: ${job.title}. Notes: ${revisionNotes}. Login to re-submit.`,
      }).catch(() => {});
    }

    res.json({ success: true, job });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── GET /:id/download/:type/:i — download file ──────────────────────────── */
router.get('/:id/download/:type/:fileIndex', async (req, res) => {
  try {
    const job = await jobDelivery.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const files = req.params.type === 'source' ? (job.source_files || []) : (job.completed_files || []);
    const file  = files[parseInt(req.params.fileIndex)];
    if (!file?.data) return res.status(404).json({ error: 'File not found' });
    const buf = Buffer.from(file.data, 'base64');
    res.set({
      'Content-Type': file.type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.name}"`,
      'Content-Length': buf.length,
    });
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── PATCH /:id/ai-complete — admin manually triggers AI to complete a job ── */
router.patch('/:id/ai-complete', requireAuth, requireAdmin, async (req, res) => {
  try {
    const aiProcessor = require('../modules/ai-job-processor-bpo');
    const result = await aiProcessor.aiCompleteJob(req.params.id);
    await auditLogger.log('bpo.ai_manual', null, req.user?.id,
      `Manual AI completion triggered for job #${req.params.id}`, null, 'info');
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Ensure DB tables exist when module is loaded
jobDelivery.ensureTables().catch(e => console.error('[BPO] Table setup error:', e.message));

module.exports = router;
