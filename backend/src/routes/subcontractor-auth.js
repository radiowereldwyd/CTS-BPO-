/**
 * Subcontractor Authentication Routes
 * POST /api/sub/auth/login        — login with email + password
 * POST /api/sub/auth/set-password — set password via email token
 * GET  /api/sub/auth/me           — get current sub profile
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db       = require('../db');
const { JWT_SECRET } = require('../middleware/auth');
const auditLogger = require('../modules/audit-logger');
const emailOutreach = require('../modules/email-outreach');

const router = express.Router();

/* ── POST /login ─────────────────────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    if (!db.isConnected()) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const r = await db.query(
      `SELECT id, name, email, password_hash, status, payment_confirmed
       FROM subcontractor_applications
       WHERE LOWER(email) = LOWER($1) AND password_hash IS NOT NULL`,
      [email]
    );

    const sub = r.rows[0];
    if (!sub) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (sub.status !== 'approved' || !sub.payment_confirmed) {
      return res.status(403).json({
        error: sub.status !== 'approved'
          ? 'Your application has not been approved yet. Please wait for confirmation.'
          : 'Your enrolment payment has not been confirmed yet. Please contact support.'
      });
    }

    const match = await bcrypt.compare(password, sub.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const payload = {
      sub_id: sub.id,
      name:   sub.name,
      email:  sub.email,
      role:   'subcontractor',
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
    await auditLogger.log('sub.login', 'subcontractor', sub.id, `Subcontractor ${sub.email} logged in`, null, 'info');

    res.json({ token, user: { id: sub.id, name: sub.name, email: sub.email, role: 'subcontractor' } });
  } catch (err) {
    console.error('Sub login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

/* ── POST /request-setup — admin sends set-password email to a sub ─────── */
router.post('/request-setup', async (req, res) => {
  const { sub_id } = req.body;
  if (!sub_id) return res.status(400).json({ error: 'sub_id required' });

  try {
    if (!db.isConnected()) return res.status(503).json({ error: 'Database unavailable' });

    const r = await db.query(
      `SELECT id, name, email FROM subcontractor_applications WHERE id=$1 AND status='approved' AND payment_confirmed=TRUE`,
      [sub_id]
    );
    const sub = r.rows[0];
    if (!sub) return res.status(404).json({ error: 'Approved, paid subcontractor not found' });

    const token   = uuidv4();
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    await db.query(
      `INSERT INTO set_password_tokens (sub_application_id, token, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [sub.id, token, expires]
    );

    const appBase = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : (process.env.APP_URL || 'http://localhost:5000');

    await emailOutreach.sendPortalSetupEmail(sub.email, sub.name, `${appBase}/subcontractor/set-password?token=${token}`);
    res.json({ success: true, message: `Setup email sent to ${sub.email}` });
  } catch (err) {
    console.error('Setup email error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /set-password — subcontractor sets their password via token ─────── */
router.post('/set-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    if (!db.isConnected()) return res.status(503).json({ error: 'Database unavailable' });

    const tr = await db.query(
      `SELECT spt.sub_application_id, sa.name, sa.email
       FROM set_password_tokens spt
       JOIN subcontractor_applications sa ON sa.id = spt.sub_application_id
       WHERE spt.token = $1 AND spt.used = FALSE AND spt.expires_at > NOW()`,
      [token]
    );

    const row = tr.rows[0];
    if (!row) return res.status(400).json({ error: 'Invalid or expired setup link. Please contact support for a new one.' });

    const hash = await bcrypt.hash(password, 10);

    await db.query(`UPDATE subcontractor_applications SET password_hash=$1 WHERE id=$2`, [hash, row.sub_application_id]);
    await db.query(`UPDATE set_password_tokens SET used=TRUE WHERE token=$1`, [token]);

    await auditLogger.log('sub.password_set', 'subcontractor', row.sub_application_id, `${row.email} set portal password`, null, 'info');

    res.json({ success: true, message: 'Password set successfully. You can now log in.' });
  } catch (err) {
    console.error('Set-password error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /me ─────────────────────────────────────────────────────────────── */
router.get('/me', require('../middleware/auth').requireSubcontractor, (req, res) => {
  res.json({ user: req.subUser });
});

module.exports = router;
