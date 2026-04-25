/**
 * AI Payment Gateway – Ozow Integration
 * Handles all payment initiation, tracking, and accounting via Ozow.
 * Uses the real Ozow API when OZOW_API_KEY is configured; stubs in dev/test mode.
 */

const axios = require('axios');
const auditLogger = require('./audit-logger');
const db = require('../db');

const OZOW_API_URL = process.env.OZOW_API_URL || 'https://api.ozow.com';
const OZOW_API_KEY = process.env.OZOW_API_KEY || '';
const OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || '';
const MAX_RETRIES = 3;

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

  await auditLogger.log('payment.initiated', 'contract', contractId, `Payment of R${(amount / 100).toFixed(2)} initiated`, null, 'info');

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callOzowAPI({ contractId, amount, clientEmail, reference, attempt });
      await auditLogger.log('payment.succeeded', 'contract', contractId, `Payment confirmed. Reference: ${result.paymentReference}`, null, 'info');

      // Persist transaction to DB
      if (db.isConnected()) {
        try {
          await db.query(
            `INSERT INTO transactions (contract_id, amount_zar, currency, reference, ozow_reference, status, paid_at)
             VALUES ($1, $2, 'ZAR', $3, $4, 'succeeded', NOW())`,
            [contractId, amount / 100, reference || result.paymentReference, result.paymentReference]
          );
        } catch (dbErr) {
          console.error('Transaction DB insert error:', dbErr.message);
        }
      }

      return result;
    } catch (err) {
      lastError = err;
      await auditLogger.log(
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
 * Call the Ozow API. Uses the real API when OZOW_API_KEY is set; stubs otherwise.
 * @param {object} params
 * @returns {object} Ozow response
 */
async function callOzowAPI({ contractId, amount, clientEmail, reference }) {
  if (OZOW_API_KEY) {
    // Real Ozow API call
    const payload = {
      SiteCode: OZOW_SITE_CODE,
      CountryCode: 'ZA',
      CurrencyCode: 'ZAR',
      Amount: (amount / 100).toFixed(2),
      TransactionReference: reference || `CTS-${contractId}-${Date.now()}`,
      BankReference: `CTS-${contractId}`,
      Customer: clientEmail,
      IsTest: process.env.NODE_ENV !== 'production',
    };

    const response = await axios.post(`${OZOW_API_URL}/v1/payment`, payload, {
      headers: {
        'ApiKey': OZOW_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    return {
      success: true,
      contractId,
      amount,
      currency: 'ZAR',
      clientEmail,
      paymentReference: response.data.PaymentRequestId || payload.TransactionReference,
      paymentUrl: response.data.Url,
      paidAt: new Date().toISOString(),
    };
  }

  // Stub for dev/test mode
  if (process.env.NODE_ENV === 'production') {
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
  return {
    invoiceNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
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

