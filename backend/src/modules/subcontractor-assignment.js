/**
 * AI Subcontractor Assignment Module
 * Selects the optimal subcontractor based on capacity, performance, and availability.
 */

const auditLogger = require('./audit-logger');

// In-memory subcontractor registry (replace with DB in production)
const subcontractors = [
  { id: 1, name: 'Sub A', specializations: ['data-entry', 'transcription'], capacity: 10, activeJobs: 2, successRate: 0.95 },
  { id: 2, name: 'Sub B', specializations: ['customer-support', 'data-entry'], capacity: 8, activeJobs: 5, successRate: 0.88 },
  { id: 3, name: 'Sub C', specializations: ['accounting', 'reporting'], capacity: 5, activeJobs: 1, successRate: 0.97 },
];

/**
 * Assign the best available subcontractor for a contract.
 * @param {object} params
 * @param {string|number} params.contractId - Contract ID
 * @param {string} params.contractType - Type of work required
 * @param {number} params.complexity - Complexity score 1-10
 * @returns {object} assignment result
 */
function assign({ contractId, contractType, complexity }) {
  const available = subcontractors.filter(
    (s) => s.activeJobs < s.capacity
  );

  if (available.length === 0) {
    auditLogger.log('contract.failed', 'contract', contractId, 'No available subcontractors', null, 'error');
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
  const sub = subcontractors.find((s) => s.id === selected.id);
  if (sub) sub.activeJobs++;

  auditLogger.log(
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
function releaseSlot(subcontractorId) {
  const sub = subcontractors.find((s) => s.id === subcontractorId);
  if (sub && sub.activeJobs > 0) sub.activeJobs--;
}

/**
 * Get the current list of subcontractors with their availability.
 * @returns {Array} subcontractor list
 */
function getSubcontractors() {
  return subcontractors.map((s) => ({
    id: s.id,
    name: s.name,
    specializations: s.specializations,
    availableSlots: s.capacity - s.activeJobs,
    successRate: s.successRate,
  }));
}

module.exports = { assign, releaseSlot, getSubcontractors };
