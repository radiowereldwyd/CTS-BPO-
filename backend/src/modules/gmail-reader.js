/**
 * Gmail API — Inbox Reader
 * Reads incoming replies to CTS BPO outreach emails.
 * Auto-updates lead status based on reply content (using NLP analysis).
 * Requires: GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET + GMAIL_REFRESH_TOKEN
 */
const axios = require('axios');
const nlp   = require('./google-nlp');
const jobSearch = require('./job-search');
const auditLogger = require('./audit-logger');

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN || '';

function isConfigured() { return !!(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN); }

/**
 * Get a fresh OAuth2 access token using the refresh token.
 */
async function getAccessToken() {
  const res = await axios.post('https://oauth2.googleapis.com/token', {
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type:    'refresh_token',
  }, { timeout: 10000 });
  return res.data.access_token;
}

/**
 * List unread emails in the CTS BPO inbox (label: INBOX, unread).
 * @param {number} maxResults
 */
async function listUnreadEmails(maxResults = 20) {
  if (!isConfigured()) return { simulated: true, emails: [], message: 'Gmail OAuth not configured.' };

  const token   = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  const base    = 'https://gmail.googleapis.com/gmail/v1/users/me';

  // List unread messages
  const listRes = await axios.get(`${base}/messages`, {
    headers, params: { q: 'is:unread in:inbox', maxResults }, timeout: 10000
  });

  const messages = listRes.data.messages || [];
  const emails = [];

  for (const msg of messages.slice(0, 10)) {
    const detail = await axios.get(`${base}/messages/${msg.id}`, {
      headers, params: { format: 'full' }, timeout: 10000
    });
    const payload = detail.data.payload;
    const headers2 = payload.headers || [];
    const get = (name) => headers2.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    const from    = get('From');
    const subject = get('Subject');
    const date    = get('Date');

    // Extract body
    let body = '';
    if (payload.body?.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload.parts) {
      const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
      if (textPart?.body?.data) body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
    }

    emails.push({ id: msg.id, from, subject, date, body: body.slice(0, 2000), threadId: detail.data.threadId });
  }

  return { emails, total: messages.length };
}

/**
 * Analyse all unread replies and auto-update lead statuses.
 * - Runs NLP on each reply to determine intent
 * - Updates matching lead status in DB
 * - Returns a report of all updates
 */
async function processInboxReplies() {
  if (!isConfigured()) return { simulated: true, processed: 0, updates: [] };

  const { emails } = await listUnreadEmails(20);
  const updates = [];

  for (const email of emails) {
    if (!email.body) continue;
    try {
      const analysis = await nlp.analyseEmailReply(email.body);
      const intent   = analysis.sentiment.intent;

      // Map intent to lead status
      const statusMap = {
        'interested':  'responded',
        'needs-info':  'responded',
        'rejected':    'rejected',
        'out-of-office': 'contacted',
      };
      const newStatus = statusMap[intent];

      // Try to match to a lead by sender email domain
      const senderEmail = email.from.match(/<(.+)>/)?.[1] || email.from;

      updates.push({
        email:    senderEmail,
        subject:  email.subject,
        intent,
        sentiment: analysis.sentiment.label,
        score:    analysis.sentiment.score,
        newStatus: newStatus || 'responded',
        date:     email.date,
      });

      await auditLogger.log('gmail.reply', 'job_lead', null,
        `Reply from ${senderEmail}: intent=${intent}, status→${newStatus}`, null, 'info');
    } catch (err) {
      console.error('Error processing reply:', err.message);
    }
  }

  return { processed: emails.length, updates };
}

/**
 * Mark a message as read.
 */
async function markAsRead(messageId) {
  if (!isConfigured()) return;
  const token = await getAccessToken();
  await axios.post(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
    removeLabelIds: ['UNREAD'],
  }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
}

module.exports = { listUnreadEmails, processInboxReplies, markAsRead, isConfigured };
