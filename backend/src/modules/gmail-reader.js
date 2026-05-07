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
 * Analyse all unread non-bounce replies with NLP, then auto-respond:
 *  - interested    → create client record + send portal welcome email
 *  - needs-info    → send AI-generated answer via Gemini
 *  - rejected/unsub → mark do-not-contact
 *  - out-of-office  → leave alone, mark read
 */
async function processInboxReplies() {
  if (!isConfigured()) return { simulated: true, processed: 0, updates: [] };

  await processBounces().catch(e => console.error('[BOUNCE] Error:', e.message));

  const { emails } = await listUnreadEmails(20);
  const updates = [];

  // Lazy-load to avoid circular deps at module load time
  const emailOutreach = require('./email-outreach');
  const axios         = require('axios');
  const crypto        = require('crypto');
  const dbMod         = require('../db');
  const APP_URL       = process.env.APP_URL || 'https://your-app.replit.app';
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';

  async function geminiReply(question, senderName) {
    if (!GOOGLE_API_KEY) return null;
    try {
      const prompt = `You are Calvin Thomas from CTS BPO Solutions (South Africa). A prospect named "${senderName}" replied to a pricing proposal email with this question:\n\n"${question}"\n\nWrite a warm, concise reply (max 120 words) that answers their question and encourages them to try the free first task. Sign off as Calvin Thomas.`;
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { timeout: 20000 }
      );
      return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch { return null; }
  }

  async function onboardClient(fromEmail, fromName) {
    // Check if already a client
    const exists = await dbMod.query(
      `SELECT id, portal_token FROM clients WHERE LOWER(email)=LOWER($1) LIMIT 1`,
      [fromEmail]
    ).catch(() => ({ rows: [] }));

    if (exists.rows.length > 0) {
      const token = exists.rows[0].portal_token;
      const portalLink = `${APP_URL}/client/portal/${token}`;
      return { alreadyClient: true, portalLink };
    }

    const token = crypto.randomBytes(24).toString('hex');
    const name  = fromName || fromEmail.split('@')[0];

    // Insert new client row (safe — only touches columns known to exist)
    await dbMod.query(
      `INSERT INTO clients (name, email, portal_token, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET portal_token=EXCLUDED.portal_token, updated_at=NOW()`,
      [name, fromEmail, token]
    ).catch(async () => {
      // Fallback without status column if schema differs
      await dbMod.query(
        `INSERT INTO clients (name, email, portal_token, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET portal_token=EXCLUDED.portal_token, updated_at=NOW()`,
        [name, fromEmail, token]
      ).catch(() => {});
    });

    const portalLink = `${APP_URL}/client/portal/${token}`;
    return { alreadyClient: false, portalLink, name, token };
  }

  for (const email of emails) {
    if (isBounceEmail(email.from, email.subject)) continue;
    if (!email.body) { await markAsRead(email.id).catch(() => {}); continue; }

    try {
      const analysis  = await nlp.analyseEmailReply(email.body).catch(() => ({ sentiment: { intent: 'unknown' } }));
      const intent    = analysis.sentiment?.intent || 'unknown';
      const firstName = (email.name || email.from.split('@')[0] || 'there').split(' ')[0];

      console.log(`📬 [INBOX] Reply from ${email.from} — intent: ${intent}`);

      if (intent === 'interested') {
        // ── Auto-onboard: create client + send portal welcome ────────────────
        const { portalLink, alreadyClient, name } = await onboardClient(email.from, email.name);

        const welcomeHtml = `
          <div style="font-family:Arial,sans-serif;max-width:600px;color:#1e293b">
            <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:28px 32px;border-radius:12px 12px 0 0;color:#fff">
              <h2 style="margin:0 0 6px">Welcome to CTS BPO Solutions, ${firstName}! 🎉</h2>
              <p style="margin:0;opacity:0.85;font-size:14px">Your free trial is ready to start</p>
            </div>
            <div style="background:#fff;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none">
              <p>Hi ${firstName},</p>
              <p>Thank you for your interest — I've set up your personal client portal where you can upload your first task, track progress, and download completed work.</p>
              <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px 20px;margin:20px 0;text-align:center">
                <strong style="color:#16a34a;font-size:15px">🎁 Your first task is completely FREE</strong><br>
                <span style="font-size:13px;color:#166534">No invoice until you approve the quality</span>
              </div>
              <div style="text-align:center;margin:24px 0">
                <a href="${portalLink}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;text-decoration:none;padding:14px 36px;border-radius:9px;font-weight:700;font-size:15px">Open My Client Portal →</a>
              </div>
              <p style="font-size:13px;color:#64748b">Or copy this link into your browser:<br><span style="color:#2563eb">${portalLink}</span></p>
              <hr style="border-color:#f1f5f9;margin:20px 0">
              <p><strong>Calvin Thomas</strong><br>CTS BPO Solutions<br>cts.bposolutions@gmail.com<br><a href="https://wa.me/27760679100" style="color:#25d366;font-weight:700;text-decoration:none">💬 WhatsApp: +27 76 067 9100</a></p>
            </div>
          </div>`;

        await emailOutreach.sendMail({
          to: email.from,
          subject: `Welcome to CTS BPO — Your portal is ready, ${firstName}!`,
          html: welcomeHtml,
          text: `Hi ${firstName},\n\nWelcome! I've set up your client portal at: ${portalLink}\n\nYour first task is completely free. Upload your files through the portal and we'll get started immediately.\n\nCalvin Thomas\nCTS BPO Solutions\ncts.bposolutions@gmail.com\nWhatsApp: +27 76 067 9100`,
        }).catch(e => console.error('[INBOX] Welcome email failed:', e.message));

        // Log to activity
        await dbMod.query(
          `INSERT INTO ai_activity_log (action_type, description, status, details)
           VALUES ('client_onboarded', $1, 'success', $2)`,
          [`New client onboarded from reply: ${email.from}${alreadyClient ? ' (returning)' : ''}`,
           JSON.stringify({ email: email.from, name, portalLink })]
        ).catch(() => {});

        await dbMod.query(
          `INSERT INTO ai_activity_log (action_type, description, status, details)
           VALUES ('inbox_reply', $1, 'success', $2)`,
          [`Interested reply → auto-onboarded: ${email.from}`,
           JSON.stringify({ email: email.from, intent, action: 'onboarded' })]
        ).catch(() => {});

        updates.push({ email: email.from, intent, action: 'onboarded', portalLink });
        console.log(`🎉 [INBOX] Client onboarded: ${email.from} → portal: ${portalLink}`);

      } else if (intent === 'needs-info') {
        // ── AI-generated answer via Gemini ───────────────────────────────────
        const aiAnswer = await geminiReply(email.body.slice(0, 800), firstName);

        if (aiAnswer) {
          const replyText = `Hi ${firstName},\n\n${aiAnswer}\n\nCalvin Thomas\nCTS BPO Solutions\ncts.bposolutions@gmail.com\nWhatsApp: +27 76 067 9100`;
          await emailOutreach.sendMail({
            to: email.from,
            subject: `Re: ${email.subject}`,
            text:    replyText,
            html:    `<div style="font-family:Arial,sans-serif;max-width:580px;color:#1e293b;line-height:1.7"><p>Hi ${firstName},</p><p>${aiAnswer.replace(/\n/g, '<br>')}</p><hr style="border-color:#f1f5f9;margin:20px 0"><p><strong>Calvin Thomas</strong><br>CTS BPO Solutions<br>cts.bposolutions@gmail.com<br><a href="https://wa.me/27760679100" style="color:#25d366;font-weight:700;text-decoration:none">💬 WhatsApp: +27 76 067 9100</a></p></div>`,
          }).catch(e => console.error('[INBOX] Info reply failed:', e.message));

          await dbMod.query(
            `INSERT INTO ai_activity_log (action_type, description, status, details)
             VALUES ('auto_response', $1, 'success', $2)`,
            [`AI answered query from ${email.from}`,
             JSON.stringify({ email: email.from, intent, action: 'ai_answered' })]
          ).catch(() => {});

          await dbMod.query(
            `INSERT INTO ai_activity_log (action_type, description, status, details)
             VALUES ('inbox_reply', $1, 'success', $2)`,
            [`Info request → AI replied: ${email.from}`,
             JSON.stringify({ email: email.from, intent, action: 'ai_answered' })]
          ).catch(() => {});

          updates.push({ email: email.from, intent, action: 'ai_answered' });
          console.log(`🤖 [INBOX] AI answered info request from ${email.from}`);
        }

      } else if (intent === 'rejected' || intent === 'unsubscribe') {
        // ── Mark as do-not-contact ────────────────────────────────────────────
        await blacklistEmail(email.from).catch(() => {});
        await dbMod.query(
          `UPDATE scraped_contacts SET status='rejected', updated_at=NOW() WHERE LOWER(email)=LOWER($1)`,
          [email.from]
        ).catch(() => {});
        await dbMod.query(
          `UPDATE ai_leads SET status='rejected', updated_at=NOW() WHERE LOWER(contact_email)=LOWER($1)`,
          [email.from]
        ).catch(() => {});
        await dbMod.query(
          `INSERT INTO ai_activity_log (action_type, description, status)
           VALUES ('inbox_reply', $1, 'info')`,
          [`Rejection/unsubscribe from ${email.from} — marked do-not-contact`]
        ).catch(() => {});
        updates.push({ email: email.from, intent, action: 'do-not-contact' });
        console.log(`🚫 [INBOX] Do-not-contact: ${email.from}`);

      } else {
        // out-of-office or unknown — just log and mark read
        await dbMod.query(
          `INSERT INTO ai_activity_log (action_type, description, status)
           VALUES ('inbox_reply', $1, 'info')`,
          [`Reply from ${email.from} — intent: ${intent}, no action needed`]
        ).catch(() => {});
        updates.push({ email: email.from, intent, action: 'logged' });
      }

      await markAsRead(email.id).catch(() => {});
      await auditLogger.log('gmail.reply', 'job_lead', null,
        `Reply from ${email.from}: intent=${intent}`, null, 'info');

    } catch (err) {
      console.error(`[INBOX] Error processing reply from ${email.from}:`, err.message);
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
