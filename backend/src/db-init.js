/**
 * CTS BPO – Database Initialisation
 *
 * Runs on every startup (idempotent — all statements use IF NOT EXISTS /
 * ON CONFLICT DO NOTHING).  Creates:
 *   • All core tables (users, subcontractors, contracts, assignments,
 *     audit_logs, payments, admin_tokens)
 *   • Admin user  admin@ctsbpo.com / admin
 *   • One persistent barcode token for passwordless login
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db     = require('./db');

// ─── DDL ─────────────────────────────────────────────────────────────────────

const CREATE_TABLES = `
-- Users
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'client',
  client_id     INTEGER,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Subcontractors
CREATE TABLE IF NOT EXISTS subcontractors (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  email          VARCHAR(255) UNIQUE NOT NULL,
  specializations TEXT[],
  capacity       INTEGER      NOT NULL DEFAULT 10,
  active_jobs    INTEGER      NOT NULL DEFAULT 0,
  success_rate   NUMERIC(5,4) NOT NULL DEFAULT 0.9000,
  status         VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Contracts
CREATE TABLE IF NOT EXISTS contracts (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER,
  sub_id      INTEGER,
  type        VARCHAR(100),
  complexity  INTEGER CHECK (complexity BETWEEN 1 AND 10),
  value       NUMERIC(12,2) NOT NULL DEFAULT 0,
  start_date  DATE,
  end_date    DATE,
  status      VARCHAR(30)  NOT NULL DEFAULT 'pending',
  success_rate NUMERIC(5,4),
  routing     VARCHAR(20)  NOT NULL DEFAULT 'internal',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Assignments
CREATE TABLE IF NOT EXISTS assignments (
  id              SERIAL PRIMARY KEY,
  contract_id     INTEGER,
  subcontractor_id INTEGER,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          VARCHAR(30) NOT NULL DEFAULT 'active',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  event_type  VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id   INTEGER,
  description TEXT         NOT NULL,
  user_id     INTEGER,
  ip_address  VARCHAR(45),
  severity    VARCHAR(20)  NOT NULL DEFAULT 'info',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id           SERIAL PRIMARY KEY,
  contract_id  INTEGER,
  amount_zar   NUMERIC(12,2) NOT NULL,
  currency     VARCHAR(10)   NOT NULL DEFAULT 'ZAR',
  reference    VARCHAR(255),
  status       VARCHAR(20)   NOT NULL DEFAULT 'pending',
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Admin barcode tokens (passwordless login)
CREATE TABLE IF NOT EXISTS admin_tokens (
  id         SERIAL PRIMARY KEY,
  token      VARCHAR(128) UNIQUE NOT NULL,
  user_id    INTEGER      NOT NULL,
  label      VARCHAR(100) NOT NULL DEFAULT 'barcode',
  used_count INTEGER      NOT NULL DEFAULT 0,
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
`;

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function ensureAdminUser() {
  const ADMIN_EMAIL    = 'admin@ctsbpo.com';
  const ADMIN_PASSWORD = 'admin';
  const ADMIN_NAME     = 'CTS Admin';

  // Check if admin already exists
  const existing = await db.query(
    'SELECT id FROM users WHERE email = $1',
    [ADMIN_EMAIL]
  );

  if (existing.rows.length > 0) {
    console.log('✅ Admin user already exists (id=' + existing.rows[0].id + ')');
    return existing.rows[0].id;
  }

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const result = await db.query(
    `INSERT INTO users (name, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'admin', true)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role          = EXCLUDED.role,
           is_active     = true,
           updated_at    = NOW()
     RETURNING id`,
    [ADMIN_NAME, ADMIN_EMAIL, hash]
  );

  const adminId = result.rows[0].id;
  console.log('✅ Admin user created (id=' + adminId + ', email=' + ADMIN_EMAIL + ')');
  return adminId;
}

async function ensureBarcodeToken(adminId) {
  // Re-use an existing active token if one already exists for this user
  const existing = await db.query(
    `SELECT token FROM admin_tokens
     WHERE user_id = $1 AND is_active = true AND label = 'barcode'
     ORDER BY created_at ASC
     LIMIT 1`,
    [adminId]
  );

  if (existing.rows.length > 0) {
    console.log('✅ Barcode token already exists for admin');
    return existing.rows[0].token;
  }

  // Generate a cryptographically random token
  const token = crypto.randomBytes(48).toString('hex'); // 96 hex chars

  await db.query(
    `INSERT INTO admin_tokens (token, user_id, label, is_active)
     VALUES ($1, $2, 'barcode', true)
     ON CONFLICT (token) DO NOTHING`,
    [token, adminId]
  );

  console.log('✅ Barcode token generated for admin');
  return token;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

async function initDatabase() {
  if (!db.isConnected()) {
    console.log('⚠️  DB not connected — skipping database initialisation');
    return;
  }

  try {
    console.log('🔧 Running database initialisation…');

    // 1. Create tables (idempotent)
    await db.query(CREATE_TABLES);
    console.log('✅ Core tables verified / created');

    // 2. Ensure admin user exists
    const adminId = await ensureAdminUser();

    // 3. Ensure barcode token exists
    const token = await ensureBarcodeToken(adminId);

    console.log('🎉 Database initialisation complete');
    console.log('   Admin email : admin@ctsbpo.com');
    console.log('   Admin pass  : admin');
    console.log('   Barcode URL : /login?token=' + token);

    return { adminId, token };
  } catch (err) {
    console.error('❌ Database initialisation error:', err.message);
    // Non-fatal — app continues without crashing
  }
}

module.exports = { initDatabase };
