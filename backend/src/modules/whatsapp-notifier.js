/**
 * WhatsApp / SMS Notifier — CTS BPO
 * Uses Twilio for WhatsApp and SMS notifications.
 *
 * Required environment variables:
 *   TWILIO_ACCOUNT_SID  — Twilio account SID
 *   TWILIO_AUTH_TOKEN   — Twilio auth token
 *   TWILIO_WHATSAPP_FROM — WhatsApp-enabled number e.g. whatsapp:+14155238886
 *   TWILIO_SMS_FROM      — SMS-enabled number e.g. +14155238886
 */

const auditLogger = require('./audit-logger');

const ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID  || '';
const AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN   || '';
const WA_FROM      = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
const SMS_FROM     = process.env.TWILIO_SMS_FROM      || '';

const isConfigured = () => !!(ACCOUNT_SID && AUTH_TOKEN);

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!isConfigured()) return null;
  const twilio = require('twilio');
  _client = twilio(ACCOUNT_SID, AUTH_TOKEN);
  return _client;
}

/**
 * Send a WhatsApp message. Falls back to SMS if WhatsApp fails. Stubs if unconfigured.
 */
async function sendWhatsApp(to, body) {
  if (!to) return { sent: false, reason: 'no_number' };

  const normalised = to.replace(/\s+/g, '').replace(/^0/, '+27');
  const waTo = normalised.startsWith('whatsapp:') ? normalised : `whatsapp:${normalised}`;

  const client = getClient();
  if (!client) {
    console.log(`[WHATSAPP STUB] → ${normalised}: ${body.slice(0, 80)}...`);
    return { sent: false, simulated: true, to: normalised };
  }

  try {
    const msg = await client.messages.create({ from: WA_FROM, to: waTo, body });
    await auditLogger.log('whatsapp.sent', 'notification', null, `WhatsApp → ${normalised}`, null, 'info');
    return { sent: true, sid: msg.sid, to: normalised };
  } catch (waErr) {
    // Fall back to SMS
    if (SMS_FROM) {
      try {
        const sms = await client.messages.create({ from: SMS_FROM, to: normalised, body });
        await auditLogger.log('whatsapp.sms_fallback', 'notification', null, `SMS fallback → ${normalised}`, null, 'info');
        return { sent: true, via: 'sms', sid: sms.sid, to: normalised };
      } catch {}
    }
    console.error('[WHATSAPP] Failed:', waErr.message);
    return { sent: false, error: waErr.message, to: normalised };
  }
}

// ── Notification templates ────────────────────────────────────────────────

async function notifySubJobAssigned({ phone, name, jobTitle, payout, dueDate, jobId }) {
  const due = dueDate ? new Date(dueDate).toLocaleDateString('en-ZA') : 'TBC';
  const body =
    `🎉 CTS BPO — New Job Assigned!\n\n` +
    `Hi ${name},\n` +
    `You have a new job: *${jobTitle}*\n` +
    `💰 Payout: R${parseFloat(payout).toFixed(2)}\n` +
    `📅 Due: ${due}\n\n` +
    `Log into your portal to view the full brief.\n` +
    `_CTS BPO Solutions_`;
  return sendWhatsApp(phone, body);
}

async function notifySubPayoutReleased({ phone, name, amount, jobTitle, reference }) {
  const body =
    `💸 CTS BPO — Payment Released!\n\n` +
    `Hi ${name},\n` +
    `Your payment of *R${parseFloat(amount).toFixed(2)}* for:\n` +
    `"${jobTitle}"\n` +
    `has been released. Ref: ${reference}\n\n` +
    `Log into your portal for details.\n` +
    `_CTS BPO Solutions_`;
  return sendWhatsApp(phone, body);
}

async function notifyClientDelivery({ phone, clientName, jobTitle, confirmLink }) {
  const body =
    `✅ CTS BPO — Your Job is Ready!\n\n` +
    `Hi ${clientName},\n` +
    `Your job *"${jobTitle}"* has been completed and is ready for download.\n\n` +
    `Please confirm receipt at:\n${confirmLink}\n\n` +
    `_CTS BPO Solutions_`;
  return sendWhatsApp(phone, body);
}

async function notifyClientOverdue({ phone, clientName, jobTitle, reminderNumber }) {
  const isFinal = reminderNumber >= 3;
  const body =
    `${isFinal ? '🔴 FINAL NOTICE' : '⚠️ Payment Reminder'} — CTS BPO\n\n` +
    `Hi ${clientName},\n` +
    `Your invoice for *"${jobTitle}"* is outstanding.\n` +
    `${isFinal ? 'This is our final notice before escalation.' : `This is reminder #${reminderNumber}.`}\n\n` +
    `Please check your email for the payment link or contact us at info@ctsbpo.com.\n` +
    `_CTS BPO Solutions_`;
  return sendWhatsApp(phone, body);
}

module.exports = {
  isConfigured,
  sendWhatsApp,
  notifySubJobAssigned,
  notifySubPayoutReleased,
  notifyClientDelivery,
  notifyClientOverdue,
};
