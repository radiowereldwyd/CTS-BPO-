// CTS BPO - Database Connection (Supabase / PostgreSQL)
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

let pool = null;
let connected = false;

if (connectionString) {
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Supabase requires SSL
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err.message);
    connected = false;
  });

  // Test the connection right away
  pool
    .query('SELECT NOW() as time')
    .then((res) => {
      connected = true;
      console.log('✅ Connected to Supabase PostgreSQL database');
      console.log('🟢 Database server time:', res.rows[0].time);
    })
    .catch((err) => {
      connected = false;
      console.error('🔴 Database connection FAILED:', err.message);
      console.error('   → Running in IN-MEMORY mode (no DB saved).');
    });
} else {
  console.log('⚠️  No DATABASE_URL set. Running in IN-MEMORY mode.');
}

// Helper to run a query
async function query(text, params) {
  if (!pool) throw new Error('Database not configured (DATABASE_URL missing)');
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('📊 Query OK', { ms: duration, rows: res.rowCount });
    return res;
  } catch (err) {
    console.error('❌ Query error:', err.message);
    throw err;
  }
}

// Tells the rest of the app whether the DB is up
function isConnected() {
  return connected;
}

// Manual test (kept for compatibility)
async function testConnection() {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    connected = true;
    return true;
  } catch (err) {
    connected = false;
    return false;
  }
}

module.exports = { pool, query, isConnected, testConnection };
