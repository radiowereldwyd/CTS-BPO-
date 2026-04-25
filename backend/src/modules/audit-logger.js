/**
 * AI Audit Logger
 * Logs all system events for compliance, transparency, and audit trails.
 */

const VALID_STATUSES = ['info', 'warning', 'error', 'critical'];

// In-memory log store (replace with DB persistence in production)
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
function log(eventType, entityType, entityId, description, userId = null, status = 'info') {
  if (!VALID_STATUSES.includes(status)) {
    status = 'info';
  }

  const entry = {
    id: logs.length + 1,
    eventType,
    entityType: entityType || null,
    entityId: entityId || null,
    description,
    userId: userId || null,
    status,
    timestamp: new Date().toISOString(),
  };

  logs.push(entry);

  const prefix = status === 'error' || status === 'critical' ? '🔴' : status === 'warning' ? '🟡' : '🟢';
  console.log(`${prefix} [AUDIT] ${entry.timestamp} | ${eventType} | ${description}`);

  return entry;
}

/**
 * Retrieve all audit log entries, optionally filtered.
 * @param {object} filters
 * @param {string} [filters.eventType] - Filter by event type
 * @param {string} [filters.status] - Filter by status
 * @param {string|number} [filters.entityId] - Filter by entity ID
 * @returns {Array} filtered log entries
 */
function getLogs({ eventType, status, entityId } = {}) {
  return logs.filter((entry) => {
    if (eventType && entry.eventType !== eventType) return false;
    if (status && entry.status !== status) return false;
    if (entityId && entry.entityId !== entityId) return false;
    return true;
  });
}

/**
 * Get all failed contract log entries.
 * @returns {Array} failed contract entries
 */
function getFailedContracts() {
  return getLogs({ eventType: 'contract.failed' });
}

/**
 * Clear all logs (for testing purposes only).
 */
function clearLogs() {
  logs.length = 0;
}

module.exports = { log, getLogs, getFailedContracts, clearLogs };
