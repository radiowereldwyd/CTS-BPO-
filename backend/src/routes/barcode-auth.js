/**
 * Barcode / passwordless token authentication routes
 *
 * GET  /login?token=<hex>
 *   Validates the token against admin_tokens, issues a JWT, and redirects
 *   the browser to /operations (the admin dashboard).
 *
 * GET  /admin/barcode
 *   Returns the active barcode token and a QR-code data URL for the admin.
 *   Protected — requires a valid JWT (requireAuth + requireAdmin).
 */

const express  = require('express');
const jwt      = require('jsonwebtoken');
const db       = require('../db');
const { requireAuth, requireAdmin, JWT_SECRET } = require('../middleware/auth');
const auditLogger = require('../modules/audit-logger');

const router = express.Router();

// ─── Token login ──────────────────────────────────────────────────────────────

/**
 * GET /login?token=<hex>
 *
 * Validates the barcode token, creates a 24-hour JWT, and either:
 *   • Redirects the browser to the dashboard (HTML request / no Accept:json)
 *   • Returns JSON { token, user } (API / Accept:application/json request)
 */
router.get('/login', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'token query parameter is required' });
  }

  // In-memory fallback — DB not available
  if (!db.isConnected()) {
    return res.status(503).json({ error: 'Database not available — token login requires a database connection' });
  }

  try {
    // Look up the token
    const result = await db.query(
      `SELECT at.id AS token_id, at.token, at.user_id, at.is_active, at.expires_at,
              u.id, u.name, u.email, u.role, u.is_active AS user_active
       FROM admin_tokens at
       JOIN users u ON u.id = at.user_id
       WHERE at.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or unknown token' });
    }

    const row = result.rows[0];

    if (!row.is_active) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Token has expired' });
    }

    if (!row.user_active) {
      return res.status(401).json({ error: 'User account is disabled' });
    }

    // Update usage stats
    await db.query(
      `UPDATE admin_tokens
       SET used_count = used_count + 1, last_used_at = NOW()
       WHERE id = $1`,
      [row.token_id]
    );

    // Issue JWT (same shape as the password login)
    const payload = {
      id:       row.id,
      name:     row.name,
      email:    row.email,
      role:     row.role,
      clientId: null,
    };

    const jwtToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    await auditLogger.log(
      'auth.barcode_login', 'user', row.id,
      `Passwordless barcode login for ${row.email}`,
      row.id, 'info'
    );

    // Detect whether the caller wants JSON or a browser redirect
    const wantsJson = (req.headers['accept'] || '').includes('application/json');

    if (wantsJson) {
      return res.json({
        token: jwtToken,
        user:  { id: row.id, name: row.name, email: row.email, role: row.role },
      });
    }

    // Browser redirect — embed token in the URL fragment so React can pick it up
    // The frontend reads #token=... on the /operations route and stores it.
    return res.redirect(`/operations#token=${jwtToken}&user=${encodeURIComponent(JSON.stringify({ id: row.id, name: row.name, email: row.email, role: row.role }))}`);

  } catch (err) {
    console.error('Barcode login error:', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ─── Barcode info endpoint ────────────────────────────────────────────────────

/**
 * GET /admin/barcode
 *
 * Returns the active barcode token for the authenticated admin, plus a
 * QR-code data URL (generated server-side using the `qrcode` npm package
 * if available, otherwise returns the raw URL for the client to render).
 */
router.get('/admin/barcode', requireAuth, requireAdmin, async (req, res) => {
  if (!db.isConnected()) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const result = await db.query(
      `SELECT token, label, used_count, created_at, last_used_at
       FROM admin_tokens
       WHERE user_id = $1 AND is_active = true AND label = 'barcode'
       ORDER BY created_at ASC
       LIMIT 1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active barcode token found for this user. Run DB init to generate one.' });
    }

    const row = result.rows[0];

    // Build the full login URL
    const appBase = process.env.APP_URL
      || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
      || `http://localhost:${process.env.PORT || 3000}`;

    const loginUrl = `${appBase}/login?token=${row.token}`;

    // Try to generate a QR code data URL (package is optional)
    let qrDataUrl = null;
    try {
      const QRCode = require('qrcode');
      qrDataUrl = await QRCode.toDataURL(loginUrl, { width: 300, margin: 2 });
    } catch {
      // qrcode package not installed — client can use the raw URL
    }

    return res.json({
      token:      row.token,
      loginUrl,
      qrDataUrl,
      label:      row.label,
      usedCount:  row.used_count,
      createdAt:  row.created_at,
      lastUsedAt: row.last_used_at,
    });
  } catch (err) {
    console.error('Barcode endpoint error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
