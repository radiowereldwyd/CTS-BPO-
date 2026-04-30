/**
 * AI Payment Gateway – Ozow + PayPal Integration
 */

const axios = require('axios');
const auditLogger = require('./audit-logger');
const db = require('../db');

const OZOW_API_URL  = process.env.OZOW_API_URL    || 'https://api.ozow.com';
const OZOW_API_KEY  = process.env.OZOW_API_KEY    || '';
const OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || '';
const OZOW_PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY || '';

const PAYPAL_CLIENT_ID     = process.env.PAYPAL_CLIENT_ID     || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_BASE_URL      = process.env.NODE_ENV === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const MAX_RETRIES = 3;

/* ─── Ozow ──────────────────────────────────────────────────────────────── */

async function initiatePayment({ contractId, amount, clientEmail, reference }) {
  if (!contractId || !amount || !clientEmail) {
    throw new Error('contractId, amount, and clientEmail are required');
  }

  await auditLogger.log('payment.initiated', 'contract', contractId,
    `Ozow payment of R${(amount / 100).toFixed(2)} initiated`, null, 'info');

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callOzowAPI({ contractId, amount, clientEmail, reference, attempt });
      await auditLogger.log('payment.succeeded', 'contract', contractId,
        `Ozow payment confirmed. Ref: ${result.paymentReference}`, null, 'info');

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
      await auditLogger.log('payment.failed', 'contract', contractId,
        `Ozow attempt ${attempt} failed: ${err.message}`, null,
        attempt < MAX_RETRIES ? 'warning' : 'error');
    }
  }
  throw new Error(`Ozow payment failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

async function callOzowAPI({ contractId, amount, clientEmail, reference }) {
  if (OZOW_API_KEY) {
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
      headers: { 'ApiKey': OZOW_API_KEY, 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    return {
      success: true, contractId, amount, currency: 'ZAR', clientEmail,
      paymentReference: response.data.PaymentRequestId || payload.TransactionReference,
      paymentUrl: response.data.Url,
      paidAt: new Date().toISOString(),
    };
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('OZOW_API_KEY is not configured');
  }

  return {
    success: true, contractId, amount, currency: 'ZAR', clientEmail,
    paymentReference: reference || `CTS-${contractId}-${Date.now()}`,
    paidAt: new Date().toISOString(),
  };
}

/* ─── PayPal ─────────────────────────────────────────────────────────────── */

async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials not configured');
  }
  const resp = await axios.post(
    `${PAYPAL_BASE_URL}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      auth: { username: PAYPAL_CLIENT_ID, password: PAYPAL_CLIENT_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    }
  );
  return resp.data.access_token;
}

async function createPayPalOrder({ amount, currency = 'USD', description, invoiceId }) {
  const token = await getPayPalAccessToken();
  const resp = await axios.post(
    `${PAYPAL_BASE_URL}/v2/checkout/orders`,
    {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: currency, value: parseFloat(amount).toFixed(2) },
        description: description || `CTS BPO Invoice ${invoiceId}`,
        invoice_id: invoiceId,
      }],
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    }
  );
  return resp.data;
}

async function capturePayPalOrder(orderId) {
  const token = await getPayPalAccessToken();
  const resp = await axios.post(
    `${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`,
    {},
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    }
  );

  const capture = resp.data;
  await auditLogger.log('payment.paypal.captured', 'order', null,
    `PayPal order ${orderId} captured`, null, 'info');

  if (db.isConnected()) {
    try {
      const unit = capture.purchase_units?.[0];
      const amt  = unit?.payments?.captures?.[0]?.amount?.value || 0;
      await db.query(
        `INSERT INTO transactions (amount_zar, currency, reference, ozow_reference, status, paid_at)
         VALUES ($1, $2, $3, $4, 'succeeded', NOW())`,
        [amt, 'USD', orderId, capture.id]
      );
    } catch (dbErr) {
      console.error('PayPal DB insert error:', dbErr.message);
    }
  }
  return capture;
}

function generateInvoice({ contractId, clientName, amount, reference }) {
  return {
    invoiceNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    contractId, clientName, amount, currency: 'ZAR', reference,
    issuedAt: new Date().toISOString(),
    dueAt: new Date().toISOString(),
    status: 'paid',
  };
}

module.exports = {
  initiatePayment,
  generateInvoice,
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalConfig: () => ({ clientId: PAYPAL_CLIENT_ID, sandboxMode: process.env.NODE_ENV !== 'production' }),
  getOzowConfig:   () => ({ siteCode: OZOW_SITE_CODE, hasKey: !!OZOW_API_KEY }),
};
