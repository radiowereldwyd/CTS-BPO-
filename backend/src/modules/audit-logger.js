/**
 * AI Audit Logger
 * Logs all system events for compliance, transparency, and audit trails.
 * Persists to PostgreSQL when DB is configured; falls back to in-memory store.
 */

const db = require('../db');

const VALID_STATUSES = ['info', 'warning', 'error', 'critical'];

// In-memory fallback store
const logs = [];

/**
 * Log an audit event.
 * @param {string} eventType - Type of event (e.g. 'contract.created')
 * @param {string|null} entityType - Type of entity involved (e.g. 'contract')
 * @param {string|number|null} entityId - ID of the entity involved
 * @param {string} description - Human-readable description
 * @param {string|number|null} userId - User who triggered the event (optional)
 * @param {string} status - Severity: 'info' | 'warning' | 'error' | 'critical'
 */
async function log(eventType, entityType, entityId, description, userId = null, status = 'info') {
  if (!VALID_STATUSES.includes(status)) {
    status = 'info';
  }

  const prefix = status === 'error' || status === 'critical' ? '🔴' : status === 'warning' ? '🟡' : '🟢';
  const timestamp = new Date().toISOString();
  console.log(`${prefix} [AUDIT] ${timestamp} | ${eventType} | ${description}`);

  // Persist to DB if available
  if (db.isConnected()) {
    try {
      const result = await db.query(
        `INSERT INTO audit_trails (event_type, entity_type, entity_id, description, user_id, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [eventType, entityType || null, entityId || null, description, userId || null, status]
      );
      return result.rows[0];
    } catch (err) {
      console.error('Audit log DB error:', err.message);
    }
  }

  // In-memory fallback
  const entry = {
    id: logs.length + 1,
    eventType,
    entityType: entityType || null,
    entityId: entityId || null,
    description,
    userId: userId || null,
    status,
    timestamp,
  };
  logs.push(entry);
  return entry;
}

/**
 * Retrieve all audit log entries, optionally filtered.
 * @param {object} filters
 * @param {string} [filters.eventType] - Filter by event type
 * @param {string} [filters.status] - Filter by status
 * @param {string|number} [filters.entityId] - Filter by entity ID
 * @returns {Promise<Array>} filtered log entries
 */
async function getLogs({ eventType, status, entityId } = {}) {
  if (db.isConnected()) {
    try {
      const conditions = [];
      const values = [];
      let idx = 1;
      if (eventType) { conditions.push(`event_type = $${idx++}`); values.push(eventType); }
      if (status) { conditions.push(`status = $${idx++}`); values.push(status); }
      if (entityId) { conditions.push(`entity_id = $${idx++}`); values.push(entityId); }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await db.query(
        `SELECT * FROM audit_trails ${where} ORDER BY timestamp DESC LIMIT 500`,
        values
      );
      return result.rows;
    } catch (err) {
      console.error('Audit getLogs DB error:', err.message);
    }
  }

  // In-memory fallback
  return logs.filter((entry) => {
    if (eventType && entry.eventType !== eventType) return false;
    if (status && entry.status !== status) return false;
    if (entityId && entry.entityId !== entityId) return false;
    return true;
  });
}

/**
 * Get all failed contract log entries.
 * @returns {Promise<Array>} failed contract entries
 */
async function getFailedContracts() {
  return getLogs({ eventType: 'contract.failed' });
}

/**
 * Clear all in-memory logs (for testing purposes only).
 */
function clearLogs() {
  logs.length = 0;
}

module.exports = { log, getLogs, getFailedContracts, clearLogs };

