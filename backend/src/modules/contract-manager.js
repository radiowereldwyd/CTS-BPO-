/**
 * AI Contract Manager
 * Receives, analyzes, and routes contracts to internal handling or subcontractors.
 * Persists contracts to PostgreSQL when DB is configured.
 */

const auditLogger = require('./audit-logger');
const db = require('../db');

const INTERNAL_CAPACITY_THRESHOLD = 5; // Max concurrent contracts handled internally

let activeInternalContracts = 0;

/**
 * Analyze a contract and decide whether to handle internally or outsource.
 * @param {object} contract
 * @param {string} contract.id - Contract ID
 * @param {string} contract.clientName - Client name
 * @param {string} contract.type - Contract type
 * @param {number} contract.complexity - Complexity score 1-10
 * @param {number} contract.value - Contract value in ZAR
 * @returns {object} routing decision
 */
async function analyzeAndRoute(contract) {
  const { id, clientName, type, complexity, value } = contract;

  await auditLogger.log('contract.created', 'contract', id, `New contract received from ${clientName}`, null, 'info');

  const analysis = analyzeContract(contract);

  let routing;
  if (analysis.riskScore < 5 && activeInternalContracts < INTERNAL_CAPACITY_THRESHOLD) {
    routing = 'internal';
    activeInternalContracts++;
    await auditLogger.log('contract.analyzed', 'contract', id, 'Routed to internal handling', null, 'info');
  } else {
    routing = 'subcontractor';
    await auditLogger.log('contract.analyzed', 'contract', id, 'Routed to subcontractor', null, 'info');
  }

  const result = {
    contractId: id,
    clientName,
    type,
    complexity,
    value,
    riskScore: analysis.riskScore,
    routing,
    estimatedDelivery: analysis.estimatedDelivery,
    status: 'pending',
    analyzedAt: new Date().toISOString(),
  };

  // Persist to DB when available
  if (db.isConnected()) {
    try {
      await db.query(
        `INSERT INTO contracts (type, complexity, value, end_date, status, routing, start_date)
         VALUES ($1, $2, $3, $4, 'pending', $5, CURRENT_DATE)
         ON CONFLICT DO NOTHING`,
        [type, complexity, value, analysis.estimatedDelivery, routing]
      );
    } catch (err) {
      console.error('Contract DB insert error:', err.message);
    }
  }

  return result;
}

/**
 * Compute risk score and delivery estimate for a contract.
 * @param {object} contract
 * @returns {object} analysis result
 */
function analyzeContract(contract) {
  const { complexity = 5, value = 0 } = contract;
  const riskScore = Math.min(10, complexity + (value > 100000 ? 2 : 0));
  const baseDays = complexity * 2;
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + baseDays);

  return {
    riskScore,
    estimatedDelivery: deliveryDate.toISOString().split('T')[0],
  };
}

/**
 * Mark a contract as failed and log to audit trail.
 * @param {string|number} contractId
 * @param {string} reason
 */
async function markFailed(contractId, reason) {
  await auditLogger.log('contract.failed', 'contract', contractId, `Contract failed: ${reason}`, null, 'error');
  if (activeInternalContracts > 0) activeInternalContracts--;

  if (db.isConnected()) {
    try {
      await db.query(
        `UPDATE contracts SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [contractId]
      );
    } catch (err) {
      console.error('Contract markFailed DB error:', err.message);
    }
  }
}

/**
 * Mark a contract as completed.
 * @param {string|number} contractId
 */
async function markCompleted(contractId) {
  await auditLogger.log('contract.completed', 'contract', contractId, 'Contract completed successfully', null, 'info');
  if (activeInternalContracts > 0) activeInternalContracts--;

  if (db.isConnected()) {
    try {
      await db.query(
        `UPDATE contracts SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [contractId]
      );
    } catch (err) {
      console.error('Contract markCompleted DB error:', err.message);
    }
  }
}

module.exports = { analyzeAndRoute, analyzeContract, markFailed, markCompleted };

