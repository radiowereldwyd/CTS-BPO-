/**
 * AI Payment Gateway – Ozow Integration
 * Handles all payment initiation, tracking, and accounting via Ozow.
 */

const auditLogger = require('./audit-logger');

const OZOW_API_URL = process.env.OZOW_API_URL || 'https://api.ozow.com';
const OZOW_API_KEY = process.env.OZOW_API_KEY || '';
const MAX_RETRIES = 3;

let invoiceCounter = 0;

/**
 * Initiate a payment via Ozow for a completed contract.
 * @param {object} params
 * @param {string|number} params.contractId - Contract ID
 * @param {number} params.amount - Amount in ZAR (cents)
 * @param {string} params.clientEmail - Client email for notification
 * @param {string} params.reference - Payment reference
 * @returns {object} payment result
 */
async function initiatePayment({ contractId, amount, clientEmail, reference }) {
  if (!contractId || !amount || !clientEmail) {
    throw new Error('contractId, amount, and clientEmail are required');
  }

  auditLogger.log('payment.initiated', 'contract', contractId, `Payment of R${(amount / 100).toFixed(2)} initiated`, null, 'info');

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callOzowAPI({ contractId, amount, clientEmail, reference, attempt });
      auditLogger.log('payment.succeeded', 'contract', contractId, `Payment confirmed. Reference: ${result.paymentReference}`, null, 'info');
      return result;
    } catch (err) {
      lastError = err;
      auditLogger.log(
        'payment.failed',
        'contract',
        contractId,
        `Payment attempt ${attempt} failed: ${err.message}`,
        null,
        attempt < MAX_RETRIES ? 'warning' : 'error'
      );
    }
  }

  throw new Error(`Payment failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

/**
 * Simulate/call the Ozow API (stub — replace with real Ozow SDK in production).
 * @param {object} params
 * @returns {object} Ozow response
 */
async function callOzowAPI({ contractId, amount, clientEmail, reference }) {
  // In production, replace with actual Ozow API call using OZOW_API_KEY and OZOW_API_URL
  // Example: const response = await axios.post(`${OZOW_API_URL}/v1/payment`, { ... });

  if (!OZOW_API_KEY && process.env.NODE_ENV === 'production') {
    throw new Error('OZOW_API_KEY is not configured');
  }

  return {
    success: true,
    contractId,
    amount,
    currency: 'ZAR',
    clientEmail,
    paymentReference: reference || `CTS-${contractId}-${Date.now()}`,
    paidAt: new Date().toISOString(),
  };
}

/**
 * Generate an invoice record for a completed payment.
 * @param {object} params
 * @returns {object} invoice
 */
function generateInvoice({ contractId, clientName, amount, reference }) {
  invoiceCounter++;
  return {
    invoiceNumber: `INV-${Date.now()}-${invoiceCounter}`,
    contractId,
    clientName,
    amount,
    currency: 'ZAR',
    reference,
    issuedAt: new Date().toISOString(),
    dueAt: new Date().toISOString(),
    status: 'paid',
  };
}

module.exports = { initiatePayment, generateInvoice };
