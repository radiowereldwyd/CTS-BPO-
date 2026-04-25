/**
 * PostgreSQL connection pool.
 * Falls back to null when DB env vars are not configured (dev/test mode).
 */

const { Pool } = require('pg');

let pool = null;

if (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
  pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
  });
}

/**
 * Execute a parameterised query. Returns null result when no pool is configured.
 * @param {string} text
 * @param {Array} params
 */
async function query(text, params = []) {
  if (!pool) return null;
  return pool.query(text, params);
}

/**
 * Check whether the DB pool is active.
 */
function isConnected() {
  return pool !== null;
}

module.exports = { query, isConnected, pool };
