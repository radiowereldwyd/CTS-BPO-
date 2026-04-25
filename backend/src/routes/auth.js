/**
 * Auth routes: login, me
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const auditLogger = require('../modules/audit-logger');

const router = express.Router();

// In-memory fallback users (dev mode when no DB)
const DEV_USERS = [
  {
    id: 1,
    name: 'CTS Admin',
    email: 'admin@ctsbpo.com',
    // bcrypt hash of "Admin1234!"
    password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    role: 'admin',
  },
];

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { token, user }
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    let user;

    if (db.isConnected()) {
      const result = await db.query(
        'SELECT id, name, email, password_hash, role, client_id FROM users WHERE email = $1 AND is_active = true',
        [email]
      );
      user = result.rows[0];
    } else {
      user = DEV_USERS.find((u) => u.email === email);
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      clientId: user.client_id || null,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    await auditLogger.log('auth.login', 'user', user.id, `User ${user.email} logged in`, user.id, 'info');

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user.
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
