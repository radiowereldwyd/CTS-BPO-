/**
 * Gmail Inbox Reader — IMAP with App Password
 * Reads incoming replies, detects bounce notifications, and blacklists failed addresses.
 * Uses GMAIL_USER + GMAIL_APP_PASSWORD — no OAuth required.
 */

const { ImapFlow } = require('imapflow');
const nlp         = require('./google-nlp');
const auditLogger = require('./audit-logger');
const db          = require('../db');

const GMAIL_USER     = process.env.GMAIL_USER         || '';
const GMAIL_PASSWORD = process.env.GMAIL_APP_PASSWORD  || '';

function isConfigured() { return !!(GMAIL_USER && GMAIL_PASSWORD); }

function createClient() {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_PASSWORD },
    logger: false,
  });
}

// ── Bounce detection helpers ───────────────────────────────────────────────

const BOUNCE_SENDERS = [
  'mailer-daemon@',
  'mailer-daemon@googlemail.com',
  'postmaster@',
  'mail-noreply@google.com',
];

const BOUNCE_SUBJECTS = [
  'address not found',
  'delivery status notification',
  'delivery failure',
  'undeliverable',
  'mail delivery failed',
  'mail delivery subsystem',
  'returned mail',
  'failure notice',
  'undelivered mail returned',
];

function isBounceEmail(from, subject) {
  const f = (from || '').toLowerCase();
  const s = (subject || '').toLowerCase();
  if (BOUNCE_SENDERS.some(b => f.includes(b))) return true;
  if (BOUNCE_SUBJECTS.some(b => s.includes(b))) return true;
  return false;
}

/**
 * Extract the failed email address from a bounce notification body.
 * Gmail bounces typically include one of:
 *   Final-Recipient: rfc822; email@domain.com
 *   Original-Recipient: rfc822; email@domain.com
 *   or a line like "The email account email@domain.com does not exist"
 */
function extractBouncedEmail(body) {
  if (!body) return null;

  // RFC 3464 DSN headers (most reliable)
  const rfc = body.match(/Final-Recipient:\s*rfc822;\s*([^\s\r\n]+)/i)
           || body.match(/Original-Recipient:\s*rfc822;\s*([^\s\r\n]+)/i)
           || body.match(/X-Failed-Recipients:\s*([^\s\r\n,]+)/i);
  if (rfc) return rfc[1].trim().toLowerCase();

  // Gmail plain-text fallback: "The email account that you tried to reach does not exist"
  const gmailMatch = body.match(/tried to reach[^\n]*?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
  if (gmailMatch) return gmailMatch[1].trim().toLowerCase();

  // Generic email address in bounce context
  const genericMatch = body.match(/(?:does not exist|not found|invalid|no such user)[^@\n]*?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
  if (genericMatch) return genericMatch[1].trim().toLowerCase();

  return null;
}

// ── Blacklist an email address in ai_leads ─────────────────────────────────

async function blacklistEmail(email) {
  if (!email || !db.pool) return;
  try {
    const r = await db.query(
      `UPDATE ai_leads
       SET status='bounced', bounced_at=NOW(), updated_at=NOW()
       WHERE LOWER(contact_email) = LOWER($1)
         AND bounced_at IS NULL
       RETURNING id, company`,
      [email]
    );
    if (r.rowCount > 0) {
      const lead = r.rows[0];
      await auditLogger.log('bounce.blacklisted', 'lead', lead.id,
        `Bounced email blacklisted: ${email} (${lead.company || 'unknown'})`, null, 'warn');
      console.log(`[BOUNCE] Blacklisted ${email} — will never be contacted again.`);
      return { blacklisted: true, leadId: lead.id, email };
    }
    return { blacklisted: false, email };
  } catch (e) {
    console.error('[BOUNCE] Blacklist error:', e.message);
    return { blacklisted: false, error: e.message };
  }
}

// ── Delete a message from Gmail inbox ─────────────────────────────────────

async function deleteMessage(uid) {
  if (!isConfigured()) return;
  const client = createClient();
  try {
    await client.connect();
    await client.mailboxOpen('INBOX');
    // In Gmail IMAP, messageDelete moves to Trash (expunge not permanent)
    await client.messageDelete({ uid }, { uid: true });
    await client.logout();
    return { deleted: true, uid };
  } catch (err) {
    try { await client.logout(); } catch {}
    console.error('[GMAIL] Delete error:', err.message);
    return { deleted: false, error: err.message };
  }
}

// ── Move message to [Gmail]/Trash explicitly ───────────────────────────────

async function trashMessage(uid) {
  if (!isConfigured()) return;
  const client = createClient();
  try {
    await client.connect();
    await client.mailboxOpen('INBOX');
    // Copy to Trash then delete from inbox
    await client.messageMove({ uid }, '[Gmail]/Trash', { uid: true }).catch(async () => {
      // Some Gmail accounts use "Trash" not "[Gmail]/Trash"
      await client.messageMove({ uid }, 'Trash', { uid: true }).catch(() => {});
    });
    await client.logout();
    return { trashed: true, uid };
  } catch (err) {
    try { await client.logout(); } catch {}
    return { trashed: false, error: err.message };
  }
}

/**
 * List unread emails in the inbox.
 */
async function listUnreadEmails(maxResults = 20) {
  if (!isConfigured()) {
    return { simulated: true, emails: [], message: 'GMAIL credentials not set.' };
  }

  const client = createClient();
  const emails = [];

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

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
        let body = '';
        const bodyMatch = source.match(/\r\n\r\n([\s\S]*)/);
        if (bodyMatch) body = bodyMatch[1].replace(/=\r\n/g, '').slice(0, 3000);

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
 * Scan inbox for bounce (address-not-found) notifications.
 * For each bounce found:
 *   1. Extract the failed email address
 *   2. Blacklist it in ai_leads (set status=bounced)
 *   3. Delete / trash the bounce email from inbox
 * Returns a summary of what was processed.
 */
async function processBounces() {
  if (!isConfigured()) return { simulated: true, processed: 0, blacklisted: 0 };

  const client = createClient();
  let processed = 0;
  let blacklisted = 0;
  const bounces = [];

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    // Search ALL unread messages (we'll filter bounces below)
    const uids = await client.search({ seen: false }, { uid: true });
    if (uids.length === 0) { await client.logout(); return { processed: 0, blacklisted: 0, bounces: [] }; }

    const bounceUids = [];

    for await (const msg of client.fetch(uids.slice(-50), {
      envelope: true, source: true
    }, { uid: true })) {
      try {
        const from    = msg.envelope?.from?.[0]?.address || '';
        const subject = msg.envelope?.subject || '';

        if (!isBounceEmail(from, subject)) continue;

        const source  = msg.source?.toString('utf-8') || '';
        let body = '';
        const bodyMatch = source.match(/\r\n\r\n([\s\S]*)/);
        if (bodyMatch) body = bodyMatch[1].replace(/=\r\n/g, '').slice(0, 4000);

        const failedEmail = extractBouncedEmail(body) || extractBouncedEmail(source);
        processed++;

        if (failedEmail) {
          const result = await blacklistEmail(failedEmail);
          if (result?.blacklisted) blacklisted++;
          bounces.push({ uid: msg.uid, from, subject, failedEmail, blacklisted: result?.blacklisted });
        } else {
          bounces.push({ uid: msg.uid, from, subject, failedEmail: null, blacklisted: false });
        }

        bounceUids.push(msg.uid);
      } catch (msgErr) {
        console.error('[BOUNCE] Message parse error:', msgErr.message);
      }
    }

    // Mark bounce emails as read and delete them from inbox
    if (bounceUids.length > 0) {
      await client.messageFlagsAdd(bounceUids, ['\\Seen'], { uid: true }).catch(() => {});
      await client.messageDelete(bounceUids, { uid: true }).catch(() => {});
    }

    await client.logout();

    if (processed > 0) {
      await auditLogger.log('bounce.processed', 'system', null,
        `Processed ${processed} bounce(s), blacklisted ${blacklisted} address(es)`, null, 'info');
      console.log(`[BOUNCE] ${processed} bounce emails processed, ${blacklisted} addresses blacklisted.`);
    }

    return { processed, blacklisted, bounces };
  } catch (err) {
    try { await client.logout(); } catch {}
    console.error('[BOUNCE] processBounces error:', err.message);
    return { processed, blacklisted, bounces, error: err.message };
  }
}

/**
 * Analyse all unread non-bounce replies with NLP.
 */
async function processInboxReplies() {
  if (!isConfigured()) return { simulated: true, processed: 0, updates: [] };

  // First handle bounces
  await processBounces().catch(e => console.error('[BOUNCE] Error:', e.message));

  const { emails } = await listUnreadEmails(20);
  const updates = [];

  const intentColor = { interested: 'responded', 'needs-info': 'responded', rejected: 'rejected', 'out-of-office': 'contacted' };

  for (const email of emails) {
    // Skip bounce notifications — already handled
    if (isBounceEmail(email.from, email.subject)) continue;
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

  return { processed: emails.length, updates };
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

module.exports = {
  listUnreadEmails,
  processInboxReplies,
  processBounces,
  blacklistEmail,
  markAsRead,
  isConfigured,
};
