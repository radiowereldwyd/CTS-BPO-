/**
 * Subcontractor Portal API Routes
 * All routes require a valid subcontractor JWT.
 *
 * GET  /api/sub/jobs              — get own assigned jobs
 * GET  /api/sub/payments          — get payment history
 * POST /api/sub/jobs/:id/submit   — upload completed work
 * GET  /api/sub/submissions       — list own submissions
 */

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');
const db       = require('../db');
const { requireSubcontractor } = require('../middleware/auth');
const auditLogger = require('../modules/audit-logger');
const emailOutreach = require('../modules/email-outreach');

const router = express.Router();

/* ── Multer disk storage ─────────────────────────────────────────────────── */
const UPLOAD_DIR = path.join(__dirname, '../../uploads/submissions');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${uuidv4().slice(0, 8)}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      '.txt','.doc','.docx','.pdf','.xls','.xlsx','.csv',
      '.mp3','.mp4','.wav','.m4a','.ogg','.zip','.7z',
      '.jpg','.jpeg','.png','.ppt','.pptx',
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('File type not allowed. Accepted: doc, pdf, txt, audio, video, zip, images.'));
  },
});

/* ── AI Quality Check ────────────────────────────────────────────────────── */
function aiQualityCheck(filePath, fileName, fileSizeBytes) {
  const ext = path.extname(fileName).toLowerCase();
  let score = 50;
  const notes = [];

  // Size checks
  if (fileSizeBytes < 512) {
    score -= 30;
    notes.push('File is very small (< 512 bytes) — may be incomplete.');
  } else if (fileSizeBytes > 1024) {
    score += 20;
  }

  // Text file content check
  const textExts = ['.txt', '.csv', '.doc', '.docx'];
  if (textExts.includes(ext)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
      if (wordCount < 10) {
        score -= 20;
        notes.push(`Only ${wordCount} words detected — very short output.`);
      } else if (wordCount >= 50) {
        score += 15;
        notes.push(`${wordCount} words — good content volume.`);
      } else {
        notes.push(`${wordCount} words detected.`);
      }
    } catch {
      notes.push('Could not read file content for word analysis.');
    }
  }

  // Audio/video check
  const audioVideoExts = ['.mp3', '.mp4', '.wav', '.m4a', '.ogg'];
  if (audioVideoExts.includes(ext)) {
    if (fileSizeBytes > 100 * 1024) {
      score += 20;
      notes.push('Audio/video file detected — size looks valid.');
    } else {
      score -= 10;
      notes.push('Audio/video file seems very small.');
    }
  }

  // PDF check
  if (ext === '.pdf') {
    if (fileSizeBytes > 5 * 1024) {
      score += 15;
      notes.push('PDF detected with valid size.');
    }
  }

  // Bonus for spreadsheets
  if (['.xls', '.xlsx', '.csv'].includes(ext)) {
    score += 10;
    notes.push('Spreadsheet format — good for data entry jobs.');
  }

  score = Math.max(0, Math.min(100, score));
  const passed = score >= 40;

  return {
    score,
    passed,
    notes: notes.join(' '),
    verdict: passed
      ? score >= 75 ? 'Excellent — ready to deliver' : 'Acceptable — will be delivered'
      : 'Needs review — quality score too low',
  };
}

/* ── GET /jobs ───────────────────────────────────────────────────────────── */
router.get('/jobs', requireSubcontractor, async (req, res) => {
  const isAdmin = req.subUser.role === 'admin';
  const subId   = req.subUser.sub_id;
  try {
    if (!db.isConnected()) return res.json([]);
    const r = isAdmin
      ? await db.query(
          `SELECT sj.*,
                  sa.name AS subcontractor_name, sa.email AS subcontractor_email,
                  COALESCE(
                    (SELECT status FROM job_submissions WHERE job_id = sj.id ORDER BY created_at DESC LIMIT 1),
                    'not_submitted'
                  ) AS submission_status
           FROM subcontractor_jobs sj
           LEFT JOIN subcontractor_applications sa ON sa.id = sj.sub_id
           ORDER BY sj.created_at DESC`
        )
      : await db.query(
          `SELECT sj.*,
                  COALESCE(
                    (SELECT status FROM job_submissions WHERE job_id = sj.id ORDER BY created_at DESC LIMIT 1),
                    'not_submitted'
                  ) AS submission_status
           FROM subcontractor_jobs sj
           WHERE sj.sub_id = $1
           ORDER BY sj.created_at DESC`,
          [subId]
        );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /payments ──────────────────────────────────────────────────────── */
router.get('/payments', requireSubcontractor, async (req, res) => {
  const isAdmin = req.subUser.role === 'admin';
  const subId   = req.subUser.sub_id;
  try {
    if (!db.isConnected()) return res.json({ jobs: [], summary: {} });

    const r = isAdmin
      ? await db.query(
          `SELECT sj.id, sj.title, sj.sub_payout, sj.status, sj.created_at,
                  sa.name AS subcontractor_name,
                  js.payout_status, js.payout_reference, js.confirmed_at,
                  js.id AS submission_id
           FROM subcontractor_jobs sj
           LEFT JOIN subcontractor_applications sa ON sa.id = sj.sub_id
           LEFT JOIN job_submissions js ON js.job_id = sj.id AND js.status = 'delivered'
           ORDER BY sj.created_at DESC`
        )
      : await db.query(
          `SELECT sj.id, sj.title, sj.sub_payout, sj.status, sj.created_at,
                  js.payout_status, js.payout_reference, js.confirmed_at,
                  js.id AS submission_id
           FROM subcontractor_jobs sj
           LEFT JOIN job_submissions js ON js.job_id = sj.id AND js.status = 'delivered'
           WHERE sj.sub_id = $1
           ORDER BY sj.created_at DESC`,
          [subId]
        );

    const jobs = r.rows;
    const totalOwed = jobs.filter(j => ['assigned','submitted','delivered'].includes(j.status))
                          .reduce((s, j) => s + parseFloat(j.sub_payout || 0), 0);
    const totalPaid = jobs.filter(j => j.payout_status === 'paid')
                          .reduce((s, j) => s + parseFloat(j.sub_payout || 0), 0);

    res.json({
      jobs,
      summary: {
        totalOwed: totalOwed.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        jobsCompleted: jobs.filter(j => j.status === 'completed').length,
        jobsOutstanding: jobs.filter(j => j.status === 'assigned').length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /jobs/:id/submit ───────────────────────────────────────────────── */
router.post('/jobs/:id/submit', requireSubcontractor, upload.single('workFile'), async (req, res) => {
  const subId = req.subUser.sub_id;
  const jobId = parseInt(req.params.id, 10);

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Please attach your completed work.' });
  }

  try {
    if (!db.isConnected()) return res.status(503).json({ error: 'Database unavailable' });

    // Confirm job belongs to this subcontractor
    const jr = await db.query(
      `SELECT sj.*, sa.email AS client_email, sa.name AS client_name
       FROM subcontractor_jobs sj
       LEFT JOIN subcontractor_applications sa ON sa.id = $2
       WHERE sj.id = $1 AND sj.sub_id = $2`,
      [jobId, subId]
    );

    const job = jr.rows[0];
    if (!job) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Job not found or not assigned to you.' });
    }

    if (['completed', 'delivered'].includes(job.status)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'This job has already been submitted and delivered.' });
    }

    // AI quality check
    const quality = aiQualityCheck(req.file.path, req.file.originalname, req.file.size);
    const deliveryToken = uuidv4();

    // Save submission record
    const sr = await db.query(
      `INSERT INTO job_submissions
         (job_id, sub_application_id, file_name, file_path, file_size,
          ai_quality_score, ai_quality_notes, status, delivery_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        jobId, subId,
        req.file.originalname, req.file.path, req.file.size,
        quality.score, quality.notes,
        quality.passed ? 'approved' : 'pending_review',
        deliveryToken,
      ]
    );

    // Update job status
    await db.query(
      `UPDATE subcontractor_jobs SET status='submitted', submitted_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [jobId]
    );

    await auditLogger.log(
      'sub.work_submitted', 'subcontractor_job', jobId,
      `Sub ${req.subUser.email} submitted work for job #${jobId} — AI score: ${quality.score}/100`,
      null, 'info'
    );

    // If quality passes, auto-deliver to client
    if (quality.passed) {
      await db.query(
        `UPDATE subcontractor_jobs SET status='delivered', verified_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [jobId]
      );
      await db.query(
        `UPDATE job_submissions SET status='delivered', delivered_at=NOW() WHERE id=$1`,
        [sr.rows[0].id]
      );

      // Fetch client info from the linked contract/lead
      let clientEmail = null;
      let clientName  = 'Valued Client';
      try {
        const cr = await db.query(
          `SELECT al.email, al.company_name
           FROM ai_leads al
           JOIN contracts c ON c.client_id = al.id::text::integer
           WHERE c.id = $1`,
          [job.contract_id]
        ).catch(() => ({ rows: [] }));
        if (cr.rows[0]) {
          clientEmail = cr.rows[0].email;
          clientName  = cr.rows[0].company_name || clientName;
        }
      } catch {}

      const appBase = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : (process.env.APP_URL || '');

      if (clientEmail) {
        await emailOutreach.sendClientDelivery(
          clientEmail, clientName, job.title,
          `${appBase}/api/sub/client-confirm/${deliveryToken}`,
          `${appBase}/api/sub/download/${deliveryToken}`
        ).catch(e => console.error('Delivery email error:', e.message));
      }

      // Schedule 48h auto-confirm
      setTimeout(async () => {
        try {
          const check = await db.query(
            `SELECT status FROM job_submissions WHERE delivery_token=$1`, [deliveryToken]
          );
          if (check.rows[0]?.status === 'delivered') {
            await autoReleasePayout(deliveryToken, jobId, job.sub_payout, subId, req.subUser.name);
          }
        } catch {}
      }, 48 * 60 * 60 * 1000);
    }

    res.json({
      success: true,
      submissionId: sr.rows[0].id,
      quality,
      message: quality.passed
        ? 'Work submitted and AI-verified. Delivery email sent to client.'
        : 'Work submitted. Under manual review due to quality check. You will be notified.',
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Submit work error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /submissions ────────────────────────────────────────────────────── */
router.get('/submissions', requireSubcontractor, async (req, res) => {
  const subId = req.subUser.sub_id;
  try {
    if (!db.isConnected()) return res.json([]);
    const r = await db.query(
      `SELECT js.*, sj.title AS job_title
       FROM job_submissions js
       JOIN subcontractor_jobs sj ON sj.id = js.job_id
       WHERE js.sub_application_id = $1
       ORDER BY js.created_at DESC`,
      [subId]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /download/:token — client or sub downloads the file ─────────────── */
router.get('/download/:token', async (req, res) => {
  try {
    if (!db.isConnected()) return res.status(503).send('Unavailable');
    const r = await db.query(
      `SELECT file_path, file_name FROM job_submissions WHERE delivery_token=$1`,
      [req.params.token]
    );
    const row = r.rows[0];
    if (!row || !fs.existsSync(row.file_path)) {
      return res.status(404).send('File not found');
    }
    res.download(row.file_path, row.file_name);
  } catch (err) {
    res.status(500).send('Error');
  }
});

/* ── GET /client-confirm/:token — client confirms receipt ─────────────────── */
router.get('/client-confirm/:token', async (req, res) => {
  try {
    if (!db.isConnected()) return res.status(503).send('Unavailable');

    const r = await db.query(
      `SELECT js.*, sj.sub_id, sj.sub_payout, sj.title, sa.name AS sub_name
       FROM job_submissions js
       JOIN subcontractor_jobs sj ON sj.id = js.job_id
       JOIN subcontractor_applications sa ON sa.id = sj.sub_id
       WHERE js.delivery_token=$1 AND js.status='delivered'`,
      [req.params.token]
    );

    const row = r.rows[0];
    if (!row) {
      return res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a1530;color:#e2e8f0">
          <h2>⚠️ Invalid or already confirmed delivery link.</h2>
          <p>This link has already been used or is not valid.</p>
        </body></html>
      `);
    }

    await db.query(`UPDATE job_submissions SET status='confirmed', confirmed_at=NOW() WHERE delivery_token=$1`, [req.params.token]);
    await autoReleasePayout(req.params.token, row.job_id, row.sub_payout, row.sub_id, row.sub_name);

    res.send(`
      <html><head><title>CTS BPO — Delivery Confirmed</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a1530;color:#e2e8f0">
        <img src="/logo192.png" style="width:80px;margin-bottom:24px" alt="CTS BPO" />
        <h2 style="color:#10b981">✅ Delivery Confirmed!</h2>
        <p>Thank you for confirming receipt of <strong>${row.title}</strong>.</p>
        <p style="color:#64748b">Payment will be processed and released to the subcontractor within 24 hours.</p>
        <p style="margin-top:32px;color:#94a3b8">— CTS BPO Solutions</p>
      </body></html>
    `);
  } catch (err) {
    res.status(500).send('Error processing confirmation');
  }
});

/* ── ADMIN: GET /admin/submissions — all submissions (admin only) ─────────── */
router.get('/admin/submissions', require('../middleware/auth').requireAuth, require('../middleware/auth').requireAdmin, async (req, res) => {
  try {
    if (!db.isConnected()) return res.json([]);
    const r = await db.query(
      `SELECT js.*, sj.title AS job_title, sa.name AS sub_name, sa.email AS sub_email,
              sj.sub_payout
       FROM job_submissions js
       JOIN subcontractor_jobs sj ON sj.id = js.job_id
       JOIN subcontractor_applications sa ON sa.id = js.sub_application_id
       ORDER BY js.created_at DESC`
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── ADMIN: PATCH /admin/submissions/:id/release-payout ──────────────────── */
router.patch('/admin/submissions/:id/release-payout', require('../middleware/auth').requireAuth, require('../middleware/auth').requireAdmin, async (req, res) => {
  try {
    if (!db.isConnected()) return res.status(503).json({ error: 'DB unavailable' });

    const r = await db.query(
      `SELECT js.*, sj.sub_payout, sj.title, sa.name AS sub_name, sa.email AS sub_email
       FROM job_submissions js
       JOIN subcontractor_jobs sj ON sj.id = js.job_id
       JOIN subcontractor_applications sa ON sa.id = js.sub_application_id
       WHERE js.id = $1`,
      [req.params.id]
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Submission not found' });

    const ref = `PAY-${Date.now()}`;
    await db.query(
      `UPDATE job_submissions SET payout_status='paid', payout_reference=$1 WHERE id=$2`,
      [ref, req.params.id]
    );
    await db.query(
      `UPDATE subcontractor_jobs SET status='completed', updated_at=NOW() WHERE id=$1`,
      [row.job_id]
    );

    await emailOutreach.sendSubcontractorPayout(row.sub_email, row.sub_name, row.sub_payout, row.title, ref).catch(() => {});
    await auditLogger.log('payment.payout_released', 'job_submission', req.params.id,
      `Payout R${row.sub_payout} released to ${row.sub_name} for job "${row.title}"`, req.user.id, 'info');

    res.json({ success: true, reference: ref });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Helper: auto release payout after confirmation ──────────────────────── */
async function autoReleasePayout(deliveryToken, jobId, subPayout, subId, subName) {
  try {
    if (!db.isConnected()) return;
    const ref = `AUTO-${Date.now()}`;
    await db.query(
      `UPDATE job_submissions SET payout_status='paid', payout_reference=$1, confirmed_at=COALESCE(confirmed_at, NOW()) WHERE delivery_token=$2`,
      [ref, deliveryToken]
    );
    await db.query(
      `UPDATE subcontractor_jobs SET status='completed', updated_at=NOW() WHERE id=$1`,
      [jobId]
    );

    const subR = await db.query(`SELECT email FROM subcontractor_applications WHERE id=$1`, [subId]);
    const subEmail = subR.rows[0]?.email;
    if (subEmail) {
      const jobR = await db.query(`SELECT title FROM subcontractor_jobs WHERE id=$1`, [jobId]);
      const jobTitle = jobR.rows[0]?.title || 'your job';
      await emailOutreach.sendSubcontractorPayout(subEmail, subName, subPayout, jobTitle, ref).catch(() => {});
    }

    await auditLogger.log('payment.auto_payout', 'subcontractor_job', jobId,
      `Auto-payout R${subPayout} to ${subName} (token: ${deliveryToken})`, null, 'info');
  } catch (err) {
    console.error('Auto payout error:', err.message);
  }
}

module.exports = router;
