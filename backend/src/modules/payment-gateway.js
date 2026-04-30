/**
 * AI Payment Gateway – Ozow + PayPal Integration
 */

const axios = require('axios');
const crypto = require('crypto');
const auditLogger = require('./audit-logger');
const db = require('../db');

const OZOW_API_URL    = process.env.OZOW_API_URL     || 'https://pay.ozow.com';
const OZOW_API_KEY    = process.env.OZOW_API_KEY     || '';
const OZOW_SITE_CODE  = process.env.OZOW_SITE_CODE   || '';
const OZOW_PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY || '';

const PAYPAL_CLIENT_ID     = process.env.PAYPAL_CLIENT_ID     || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_BASE_URL      = process.env.NODE_ENV === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const MAX_RETRIES = 3;

/* ─── Ozow ──────────────────────────────────────────────────────────────── */

function buildOzowHash(fields) {
  // Ozow hash = SHA512 of concatenated values (lowercase) + private key
  const values = Object.values(fields).join('').toLowerCase();
  return crypto.createHash('sha512').update(values + OZOW_PRIVATE_KEY.toLowerCase()).digest('hex');
}

async function initiatePayment({ contractId, amount, clientEmail, reference }) {
  if (!contractId || !amount || !clientEmail) {
    throw new Error('contractId, amount, and clientEmail are required');
  }

  await auditLogger.log('payment.initiated', 'contract', contractId,
    `Ozow payment of R${(amount / 100).toFixed(2)} initiated`, null, 'info');

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callOzowAPI({ contractId, amount, clientEmail, reference });
      await auditLogger.log('payment.succeeded', 'contract', contractId,
        `Ozow payment initiated. Ref: ${result.paymentReference}`, null, 'info');

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
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error(`Ozow payment failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

async function callOzowAPI({ contractId, amount, clientEmail, reference }) {
  const transactionRef = reference || `CTS-${contractId}-${Date.now()}`;
  const amountStr = (amount / 100).toFixed(2);
  const appDomain = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.APP_URL || 'https://ctsbpo.com');

  if (OZOW_API_KEY) {
    const fields = {
      SiteCode: OZOW_SITE_CODE,
      CountryCode: 'ZA',
      CurrencyCode: 'ZAR',
      Amount: amountStr,
      TransactionReference: transactionRef,
      BankReference: `CTS-${contractId}`,
      Optional1: clientEmail,
      Customer: clientEmail,
      IsTest: process.env.NODE_ENV !== 'production' ? 'true' : 'false',
      SuccessUrl: `${appDomain}/payments?status=success`,
      ErrorUrl: `${appDomain}/payments?status=error`,
      CancelUrl: `${appDomain}/payments?status=cancel`,
      NotifyUrl: `${appDomain}/api/payments/ozow/notify`,
    };

    fields.HashCheck = buildOzowHash(fields);

    let response;
    try {
      response = await axios.post(`${OZOW_API_URL}/v1/paymentrequest`, fields, {
        headers: {
          'ApiKey': OZOW_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 15000,
      });
    } catch (axiosErr) {
      const status = axiosErr.response?.status;
      const body   = axiosErr.response?.data;
      if (status === 500) {
        throw new Error(
          'Ozow returned a server error (500). Your site code may not be active yet — ' +
          'log in to merchant.ozow.com, confirm your site "' + OZOW_SITE_CODE +
          '" is approved, or contact Ozow support.'
        );
      }
      throw new Error(`Ozow API error (${status}): ${JSON.stringify(body) || axiosErr.message}`);
    }

    const data = response.data;
    return {
      success: true,
      contractId,
      amount,
      currency: 'ZAR',
      clientEmail,
      paymentReference: data.PaymentRequestId || transactionRef,
      paymentUrl: data.Url || data.url || null,
      paidAt: new Date().toISOString(),
    };
  }

  // Stub when no API key
  return {
    success: true,
    contractId,
    amount,
    currency: 'ZAR',
    clientEmail,
    paymentReference: transactionRef,
    paymentUrl: null,
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
