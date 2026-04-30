/**
 * Gmail Inbox Reader — IMAP with App Password
 * Reads incoming replies to CTS BPO outreach emails using Gmail IMAP.
 * Uses the existing GMAIL_USER + GMAIL_APP_PASSWORD — no OAuth required.
 * Auto-updates lead status based on NLP analysis of each reply.
 */
const { ImapFlow } = require('imapflow');
const nlp = require('./google-nlp');
const auditLogger = require('./audit-logger');

const GMAIL_USER     = process.env.GMAIL_USER         || '';
const GMAIL_PASSWORD = process.env.GMAIL_APP_PASSWORD  || '';

function isConfigured() { return !!(GMAIL_USER && GMAIL_PASSWORD); }

/**
 * Create an authenticated IMAP client.
 */
function createClient() {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_PASSWORD },
    logger: false,
  });
}

/**
 * List unread emails in the inbox.
 * @param {number} maxResults
 * @returns {{ emails: Array, total: number }}
 */
async function listUnreadEmails(maxResults = 20) {
  if (!isConfigured()) {
    return { simulated: true, emails: [], message: 'GMAIL_USER or GMAIL_APP_PASSWORD not set.' };
  }

  const client = createClient();
  const emails = [];

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    // Search for unseen messages
    const uids = await client.search({ seen: false }, { uid: true });
    const recentUids = uids.slice(-maxResults);

    if (recentUids.length === 0) {
      await client.logout();
      return { emails: [], total: 0 };
    }

    for await (const msg of client.fetch(recentUids, {
      envelope: true, bodyStructure: true, source: true
    }, { uid: true })) {
      try {
        const source = msg.source?.toString('utf-8') || '';

        // Extract plain text body
        let body = '';
        const bodyMatch = source.match(/\r\n\r\n([\s\S]*)/);
        if (bodyMatch) body = bodyMatch[1].replace(/=\r\n/g, '').slice(0, 2000);

        emails.push({
          id:      msg.uid,
          from:    msg.envelope?.from?.[0]?.address || '',
          name:    msg.envelope?.from?.[0]?.name    || '',
          subject: msg.envelope?.subject            || '',
          date:    msg.envelope?.date?.toISOString() || '',
          body:    body.trim(),
        });
      } catch (msgErr) {
        console.error('Error reading message:', msgErr.message);
      }
    }

    await client.logout();
    return { emails, total: uids.length };
  } catch (err) {
    try { await client.logout(); } catch {}
    throw err;
  }
}

/**
 * Analyse all unread replies with NLP and return a status update report.
 * Each email is analysed for sentiment and intent.
 */
async function processInboxReplies() {
  if (!isConfigured()) return { simulated: true, processed: 0, updates: [] };

  const { emails, total } = await listUnreadEmails(20);
  const updates = [];

  const intentColor = { interested: 'responded', 'needs-info': 'responded', rejected: 'rejected', 'out-of-office': 'contacted' };

  for (const email of emails) {
    if (!email.body) continue;
    try {
      const analysis = await nlp.analyseEmailReply(email.body);
      const intent   = analysis.sentiment?.intent || 'unknown';
      const newStatus = intentColor[intent] || 'responded';

      updates.push({
        email:     email.from,
        name:      email.name,
        subject:   email.subject,
        intent,
        sentiment: analysis.sentiment?.label,
        score:     analysis.sentiment?.score,
        newStatus,
        date:      email.date,
      });

      await auditLogger.log('gmail.reply', 'job_lead', null,
        `Reply from ${email.from}: intent=${intent} → status=${newStatus}`, null, 'info');
    } catch (err) {
      console.error('NLP error on reply:', err.message);
    }
  }

  return { processed: emails.length, total, updates };
}

/**
 * Mark a message as read by UID.
 */
async function markAsRead(uid) {
  if (!isConfigured()) return;
  const client = createClient();
  try {
    await client.connect();
    await client.mailboxOpen('INBOX');
    await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
    await client.logout();
  } catch (err) {
    try { await client.logout(); } catch {}
    throw err;
  }
}

module.exports = { listUnreadEmails, processInboxReplies, markAsRead, isConfigured };
