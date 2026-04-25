/**
 * AI Subcontractor Assignment Module
 * Selects the optimal subcontractor based on capacity, performance, and availability.
 * Loads data from PostgreSQL when DB is configured; falls back to in-memory registry.
 */

const auditLogger = require('./audit-logger');
const db = require('../db');

// In-memory fallback subcontractor registry
const subcontractors = [
  { id: 1, name: 'Sub A', specializations: ['data-entry', 'transcription'], capacity: 10, activeJobs: 2, successRate: 0.95 },
  { id: 2, name: 'Sub B', specializations: ['customer-support', 'data-entry'], capacity: 8, activeJobs: 5, successRate: 0.88 },
  { id: 3, name: 'Sub C', specializations: ['accounting', 'reporting'], capacity: 5, activeJobs: 1, successRate: 0.97 },
];

/**
 * Load available subcontractors from DB or in-memory fallback.
 */
async function loadAvailable() {
  if (db.isConnected()) {
    try {
      const result = await db.query(
        `SELECT id, name, specializations, capacity, active_jobs AS "activeJobs",
                success_rate AS "successRate"
         FROM subcontractors
         WHERE status = 'active' AND active_jobs < capacity
         ORDER BY success_rate DESC`
      );
      return result.rows;
    } catch (err) {
      console.error('Subcontractor DB load error:', err.message);
    }
  }
  return subcontractors.filter((s) => s.activeJobs < s.capacity);
}

/**
 * Assign the best available subcontractor for a contract.
 * @param {object} params
 * @param {string|number} params.contractId - Contract ID
 * @param {string} params.contractType - Type of work required
 * @param {number} params.complexity - Complexity score 1-10
 * @returns {object} assignment result
 */
async function assign({ contractId, contractType, complexity }) {
  const available = await loadAvailable();

  if (available.length === 0) {
    await auditLogger.log('contract.failed', 'contract', contractId, 'No available subcontractors', null, 'error');
    throw new Error('No subcontractors available at this time');
  }

  // Score: weight success rate heavily, penalize high active jobs
  const scored = available.map((s) => ({
    ...s,
    score: s.successRate * 100 - (s.activeJobs / s.capacity) * 20,
  }));

  scored.sort((a, b) => b.score - a.score);
  const selected = scored[0];

  // Increment active jobs
  if (db.isConnected()) {
    try {
      await db.query(
        `UPDATE subcontractors SET active_jobs = active_jobs + 1 WHERE id = $1`,
        [selected.id]
      );
    } catch (err) {
      console.error('Subcontractor update error:', err.message);
    }
  } else {
    const sub = subcontractors.find((s) => s.id === selected.id);
    if (sub) sub.activeJobs++;
  }

  await auditLogger.log(
    'contract.assigned',
    'contract',
    contractId,
    `Assigned to subcontractor ${selected.name} (id: ${selected.id})`,
    null,
    'info'
  );

  return {
    contractId,
    subcontractorId: selected.id,
    subcontractorName: selected.name,
    successRate: selected.successRate,
    assignedAt: new Date().toISOString(),
    status: 'assigned',
  };
}

/**
 * Release a subcontractor's job slot when a contract is finished.
 * @param {number} subcontractorId
 */
async function releaseSlot(subcontractorId) {
  if (db.isConnected()) {
    try {
      await db.query(
        `UPDATE subcontractors SET active_jobs = GREATEST(active_jobs - 1, 0) WHERE id = $1`,
        [subcontractorId]
      );
      return;
    } catch (err) {
      console.error('Subcontractor releaseSlot DB error:', err.message);
    }
  }
  const sub = subcontractors.find((s) => s.id === subcontractorId);
  if (sub && sub.activeJobs > 0) sub.activeJobs--;
}

/**
 * Get the current list of subcontractors with their availability.
 * @returns {Promise<Array>} subcontractor list
 */
async function getSubcontractors() {
  if (db.isConnected()) {
    try {
      const result = await db.query(
        `SELECT id, name, specializations,
                capacity - active_jobs AS "availableSlots",
                success_rate AS "successRate"
         FROM subcontractors
         WHERE status = 'active'
         ORDER BY id`
      );
      return result.rows;
    } catch (err) {
      console.error('getSubcontractors DB error:', err.message);
    }
  }
  return subcontractors.map((s) => ({
    id: s.id,
    name: s.name,
    specializations: s.specializations,
    availableSlots: s.capacity - s.activeJobs,
    successRate: s.successRate,
  }));
}

module.exports = { assign, releaseSlot, getSubcontractors };

