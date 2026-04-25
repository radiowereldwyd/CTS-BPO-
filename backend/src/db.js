// CTS BPO - Database Connection (Supabase / PostgreSQL)
const { Pool } = require('pg');
require('dotenv').config();

// Use the full connection string from Supabase if provided,
// otherwise fall back to individual env vars (for local dev).
const connectionString = process.env.DATABASE_URL;

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }, // Supabase requires SSL
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'cts_bpo',
    });

pool.on('connect', () => {
  console.log('✅ Connected to Supabase PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err.message);
});

// Helper to run a query
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('📊 Query executed', { text: text.substring(0, 60), duration, rows: res.rowCount });
    return res;
  } catch (err) {
    console.error('❌ Query error:', err.message);
    throw err;
  }
}

// Test connection on startup
async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW() as time');
    console.log('🟢 Database test OK. Server time:', res.rows[0].time);
    return true;
  } catch (err) {
    console.error('🔴 Database test FAILED:', err.message);
    return false;
  }
}

module.exports = { pool, query, testConnection };
