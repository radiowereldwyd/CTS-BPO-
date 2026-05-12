'use strict';

/**
 * CTS BPO — Warm Outreach Engine
 *
 * Three warm channels:
 *  1. Email opener re-engagement — someone opened our cold email → personalised warm follow-up
 *  2. Freelancer bid follow-up  — bid placed 24–72h ago, no award → chaser via FL messenger
 *  3. High-score scraped contact warm sequence — top-scored contacts get a warmer, shorter pitch
 */

const axios        = require('axios');
const db           = require('../db');
const emailOutreach = require('./email-outreach');

const APP_URL        = process.env.APP_URL || 'https://cts-bpo.replit.app';
const FROM_NAME      = 'Thandeka Mokoena — CTS BPO';
const FREELANCER_TOKEN = () => process.env.FREELANCER_TOKEN || '';
const FL_API         = 'https://www.freelancer.com/api';
const MY_FL_ID       = 92591312;

// ── Ensure warm outreach tracking tables ────────────────────────────────────
async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS warm_outreach_log (
      id           SERIAL PRIMARY KEY,
      channel      TEXT NOT NULL,          -- 'opener_reengagement' | 'fl_bid_followup' | 'high_score_warm'
      contact_ref  TEXT,                   -- email address or platform job id or scraped_contacts id
      company      TEXT,
      message_sent TEXT,
      status       TEXT DEFAULT 'sent',   -- 'sent' | 'failed' | 'replied'
      sent_at      TIMESTAMPTZ DEFAULT NOW(),
      replied_at   TIMESTAMPTZ
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_wol_channel ON warm_outreach_log(channel)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_wol_ref    ON warm_outreach_log(contact_ref)`);

  // Add warm_followup_sent_at to platform_jobs if missing
  await db.query(`
    ALTER TABLE platform_jobs
    ADD COLUMN IF NOT EXISTS warm_followup_sent_at TIMESTAMPTZ
  `).catch(() => {});

  // Add warm_outreach_sent_at to email_tracking if missing
  await db.query(`
    ALTER TABLE email_tracking
    ADD COLUMN IF NOT EXISTS warm_sent_at TIMESTAMPTZ
  `).catch(() => {});

  // Add warm_outreach columns to scraped_contacts if missing
  await db.query(`ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS warm_sent_at TIMESTAMPTZ`).catch(() => {});
}

// ── Freelancer API helpers ───────────────────────────────────────────────────
function flGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return axios.get(`${FL_API}${path}${qs ? '?' + qs : ''}`, {
    headers: { 'freelancer-oauth-v1': FREELANCER_TOKEN() },
    timeout: 12000,
    validateStatus: () => true,
  });
}

function flPost(path, data = {}) {
  return axios.post(`${FL_API}${path}`, data, {
    headers: { 'freelancer-oauth-v1': FREELANCER_TOKEN(), 'Content-Type': 'application/json' },
    timeout: 12000,
    validateStatus: () => true,
  });
}

// Fetch the project owner's user ID from Freelancer
async function getProjectOwnerId(projectId) {
  try {
    const r = await flGet(`/projects/0.1/projects/${projectId}/`);
    const owner = r.data?.result?.owner_id;
    return owner || null;
  } catch { return null; }
}

// Send a direct message via Freelancer messenger
async function sendFlMessage(toUserId, projectId, message) {
  const r = await flPost('/messages/0.1/threads/', {
    to_ids:     [toUserId],
    message,
    ...(projectId ? { context_type: 'project', context_id: projectId } : {}),
  });
  if (r.status === 200 || r.status === 201) {
    return { ok: true, thread_id: r.data?.result?.id };
  }
  return { ok: false, status: r.status, error: r.data?.message };
}

// ── 1. FREELANCER BID FOLLOW-UPS ────────────────────────────────────────────
const BID_FU_MESSAGES = [
  (job) => `Hi,

Just following up on my proposal for "${job.title}".

We're ready to start immediately — CTS BPO has handled dozens of similar projects with consistent 5-star delivery. If you have any questions about our approach, pricing, or turnaround time, I'm happy to answer them now.

We can also provide a free trial on a small batch so you can evaluate quality before committing.

Looking forward to working with you!

Best regards,
Thandeka Mokoena
CTS BPO`.trim(),

  (job) => `Hi,

I wanted to check back on the "${job.title}" posting — is this project still open?

We're fully available and can begin within 24 hours of award. If another provider was selected, no problem at all — but if you're still evaluating, I'd love the opportunity to address any concerns.

Happy to share references, do a sample, or adjust our proposal to better fit your needs.

Best,
Thandeka | CTS BPO`.trim(),
];

async function runFreelancerBidFollowUp() {
  if (!FREELANCER_TOKEN()) return { sent: 0, skipped: 0, reason: 'No FREELANCER_TOKEN' };
  await ensureTables();

  // Bids placed 24–72h ago, still in bidding status, not yet followed up
  const { rows: jobs } = await db.query(`
    SELECT id, title, freelancer_project_id, bid_sent_at
    FROM platform_jobs
    WHERE freelancer_project_id IS NOT NULL
      AND status = 'bidding'
      AND bid_sent_at IS NOT NULL
      AND bid_sent_at < NOW() - INTERVAL '24 hours'
      AND bid_sent_at > NOW() - INTERVAL '96 hours'
      AND warm_followup_sent_at IS NULL
    LIMIT 20
  `);

  let sent = 0, skipped = 0;
  for (const job of jobs) {
    try {
      const ownerId = await getProjectOwnerId(job.freelancer_project_id);
      if (!ownerId || ownerId === MY_FL_ID) { skipped++; continue; }

      // Check we haven't already messaged this owner for this project
      const already = await db.query(
        `SELECT 1 FROM warm_outreach_log WHERE contact_ref=$1 AND channel='fl_bid_followup' LIMIT 1`,
        [`fl_${job.freelancer_project_id}`]
      );
      if (already.rows.length > 0) { skipped++; continue; }

      const msgFn = BID_FU_MESSAGES[sent % BID_FU_MESSAGES.length];
      const message = msgFn(job);
      const result = await sendFlMessage(ownerId, job.freelancer_project_id, message);

      if (result.ok) {
        await db.query(
          `UPDATE platform_jobs SET warm_followup_sent_at = NOW() WHERE id = $1`,
          [job.id]
        );
        await db.query(
          `INSERT INTO warm_outreach_log (channel, contact_ref, company, message_sent)
           VALUES ('fl_bid_followup', $1, $2, $3)`,
          [`fl_${job.freelancer_project_id}`, job.title, message]
        );
        console.log(`[WARM] ✅ Freelancer bid follow-up sent — "${job.title}" (project ${job.freelancer_project_id})`);
        sent++;
      } else {
        console.warn(`[WARM] FL follow-up failed for project ${job.freelancer_project_id}: ${result.error}`);
        skipped++;
      }

      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.warn(`[WARM] FL follow-up error for job ${job.id}: ${e.message}`);
      skipped++;
    }
  }

  if (sent + skipped > 0) {
    console.log(`[WARM] Freelancer bid follow-ups: ${sent} sent, ${skipped} skipped`);
  }
  return { sent, skipped };
}

// ── 2. EMAIL OPENER WARM RE-ENGAGEMENT ──────────────────────────────────────
const OPENER_SUBJECTS = [
  'Following up — you had a look at CTS BPO',
  'Quick question about your BPO needs',
  'We noticed your interest — can we help?',
  'Still thinking it over? Here\'s a free offer',
];

const OPENER_BODIES = [
  ({ company, email }) => `
<p>Hi there,</p>

<p>I noticed you had a look at our email about CTS BPO's outsourcing services — I wanted to follow up personally.</p>

<p>We understand that choosing a BPO partner is a significant decision. To make it easier, we're offering a <strong>no-commitment free trial</strong>: send us a small batch of your work (data entry, transcription, research, customer support — whatever you need) and we'll deliver it at no cost so you can judge quality before spending a cent.</p>

<p>Just reply to this email with a brief description of your current process challenge and we'll take it from there.</p>

<p>Best regards,<br>
<strong>Thandeka Mokoena</strong><br>
CTS BPO — AI-Powered Business Process Outsourcing<br>
<a href="${APP_URL}">ctsbpo.com</a></p>
`.trim(),

  ({ company, email }) => `
<p>Hi,</p>

<p>I saw you recently checked out our BPO services — I'd love to understand what you're looking for.</p>

<p>Whether it's reducing admin overhead, handling data processing, or scaling your customer support team without the hiring headache, CTS BPO can help.</p>

<p><strong>Three things that set us apart:</strong></p>
<ul>
  <li>AI-assisted processing — we're 3× faster than traditional BPO</li>
  <li>No long-term contracts — pay per project or per hour</li>
  <li>Free trial available on your first task</li>
</ul>

<p>Can I ask — what's the biggest process bottleneck in your business right now?</p>

<p>Best,<br>
<strong>Thandeka</strong> | CTS BPO</p>
`.trim(),
];

async function runEmailOpenerWarm() {
  await ensureTables();

  // Find emails that were opened in the last 14 days but haven't had a warm follow-up
  const { rows: openers } = await db.query(`
    SELECT et.id, et.email, et.domain, et.opened_at, et.open_count
    FROM email_tracking et
    WHERE et.open_count > 0
      AND et.warm_sent_at IS NULL
      AND et.email IS NOT NULL
      AND et.opened_at > NOW() - INTERVAL '14 days'
    ORDER BY et.open_count DESC, et.opened_at DESC
    LIMIT 30
  `);

  let sent = 0, skipped = 0;
  for (const opener of openers) {
    try {
      // Don't re-email if they're already a client or have replied
      const inLeads = await db.query(
        `SELECT status FROM ai_leads WHERE contact_email = $1 AND status IN ('replied','client','closed') LIMIT 1`,
        [opener.email]
      );
      if (inLeads.rows.length > 0) {
        await db.query(`UPDATE email_tracking SET warm_sent_at = NOW() WHERE id = $1`, [opener.id]);
        skipped++;
        continue;
      }

      // Check bounce list
      if (emailOutreach.isBounced && emailOutreach.isBounced(opener.email)) {
        skipped++;
        continue;
      }

      const subjectIdx = sent % OPENER_SUBJECTS.length;
      const bodyIdx    = sent % OPENER_BODIES.length;
      const company    = opener.domain ? opener.domain.split('.')[0] : '';

      await emailOutreach.sendEmail({
        to:      opener.email,
        subject: OPENER_SUBJECTS[subjectIdx],
        html:    OPENER_BODIES[bodyIdx]({ company, email: opener.email }),
        text:    `Hi,\n\nI noticed you had a look at our BPO services email — I wanted to follow up personally.\n\nWe offer a free trial: send us a small sample task and we'll deliver it at no cost so you can judge quality first.\n\nJust reply with your biggest process challenge and we'll take it from there.\n\nBest,\nThandeka Mokoena | CTS BPO`,
      });

      await db.query(`UPDATE email_tracking SET warm_sent_at = NOW() WHERE id = $1`, [opener.id]);
      await db.query(
        `INSERT INTO warm_outreach_log (channel, contact_ref, company, message_sent)
         VALUES ('opener_reengagement', $1, $2, $3)`,
        [opener.email, company, OPENER_SUBJECTS[subjectIdx]]
      );

      console.log(`[WARM] ✅ Opener re-engagement sent → ${opener.email} (opened ${opener.open_count}×)`);
      sent++;
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.warn(`[WARM] Opener re-engagement error for ${opener.email}: ${e.message}`);
      skipped++;
    }
  }

  if (sent > 0) console.log(`[WARM] Email opener re-engagement: ${sent} sent`);
  return { sent, skipped };
}

// ── 3. HIGH-SCORE CONTACT WARM SEQUENCE ─────────────────────────────────────
// Contacts with prospect_score >= 60 that received outreach > 3 days ago
// but no follow-up yet — send a warmer, shorter, more direct email

const WARM_SUBJECTS = [
  'A quick question about your operations, {{company}}',
  'How {{company}} could save 40% on admin costs',
  'We work with businesses like {{company}} — can we help?',
  'One idea that could save {{company}} hours every week',
];

const WARM_BODIES = [
  ({ company, businessType }) => `
<p>Hi,</p>

<p>I'm reaching out because ${company || 'your company'} caught our attention as a business that could benefit from outsourced back-office support.</p>

<p>We've seen that <strong>${businessType || 'businesses in your sector'}</strong> typically spend 15–25% of operational time on tasks that can be outsourced — data processing, admin, customer follow-ups, and document handling.</p>

<p>CTS BPO handles exactly these tasks, powered by AI for speed and accuracy, at a fraction of in-house costs. No hiring, no training, no overhead — just results.</p>

<p><strong>We're offering a free pilot task</strong> so you can see the quality before making any commitment. No contracts, no minimum spend.</p>

<p>Would you be open to a quick email conversation about what you're currently managing in-house?</p>

<p>Best regards,<br>
<strong>Thandeka Mokoena</strong><br>
CTS BPO</p>
`.trim(),

  ({ company, businessType }) => `
<p>Hi,</p>

<p>Quick question: does your team currently handle any of the following manually?</p>
<ul>
  <li>Data entry or database updates</li>
  <li>Customer emails or support tickets</li>
  <li>Research or list building</li>
  <li>Document processing or filing</li>
</ul>

<p>If yes — CTS BPO can take these off your plate entirely. We're an AI-powered outsourcing team, and our clients typically save <strong>8–15 hours per week</strong> of staff time from month one.</p>

<p>We're offering a <strong>no-cost pilot</strong> to new clients: send us one task, we deliver it free so you can judge the quality yourself.</p>

<p>Interested? Just reply and I'll send over the details.</p>

<p>Regards,<br>
<strong>Thandeka</strong> | CTS BPO</p>
`.trim(),
];

async function runHighScoreWarmSequence({ maxPerRun = 20, minScore = 60 } = {}) {
  await ensureTables();

  const { rows: contacts } = await db.query(`
    SELECT id, company, email, domain, business_type, prospect_score, outreach_sent_at
    FROM scraped_contacts
    WHERE prospect_score >= $1
      AND outreach_sent_at IS NOT NULL
      AND outreach_sent_at < NOW() - INTERVAL '3 days'
      AND warm_sent_at IS NULL
      AND status NOT IN ('replied', 'client', 'bounced', 'unsubscribed')
      AND mx_verified IS NOT FALSE
      AND email IS NOT NULL
      AND bpo_provider IS NOT TRUE
    ORDER BY prospect_score DESC
    LIMIT $2
  `, [minScore, maxPerRun]);

  let sent = 0, skipped = 0;
  for (const contact of contacts) {
    try {
      if (emailOutreach.isBounced && emailOutreach.isBounced(contact.email)) {
        await db.query(`UPDATE scraped_contacts SET status='bounced', warm_sent_at=NOW() WHERE id=$1`, [contact.id]);
        skipped++;
        continue;
      }

      const idx     = sent % WARM_SUBJECTS.length;
      const company = contact.company || contact.domain?.split('.')[0] || '';
      const subject = WARM_SUBJECTS[idx].replace(/\{\{company\}\}/g, company || 'your business');
      const bodyFn  = WARM_BODIES[sent % WARM_BODIES.length];
      const html    = bodyFn({ company, businessType: contact.business_type });

      await emailOutreach.sendEmail({
        to:      contact.email,
        subject,
        html,
        text:    `Hi,\n\nWe help businesses like ${company || 'yours'} outsource admin tasks with AI-powered speed and accuracy.\n\nWe're offering a free pilot — send us one task and we'll deliver it at no cost so you can judge quality first.\n\nReply with your biggest process challenge.\n\nBest,\nThandeka Mokoena | CTS BPO`,
      });

      await db.query(
        `UPDATE scraped_contacts SET warm_sent_at = NOW(), status = 'warm_outreach' WHERE id = $1`,
        [contact.id]
      );
      await db.query(
        `INSERT INTO warm_outreach_log (channel, contact_ref, company, message_sent)
         VALUES ('high_score_warm', $1, $2, $3)`,
        [contact.email, company, subject]
      );

      console.log(`[WARM] ✅ High-score warm sent → ${contact.email} (score: ${contact.prospect_score})`);
      sent++;
      await new Promise(r => setTimeout(r, 2500));
    } catch (e) {
      console.warn(`[WARM] High-score warm error for ${contact.id}: ${e.message}`);
      skipped++;
    }
  }

  if (sent > 0) console.log(`[WARM] High-score warm sequence: ${sent} sent`);
  return { sent, skipped };
}

// ── Master warm outreach run ─────────────────────────────────────────────────
async function runAllWarmOutreach() {
  const [openers, highScore, flBids] = await Promise.allSettled([
    runEmailOpenerWarm(),
    runHighScoreWarmSequence(),
    runFreelancerBidFollowUp(),
  ]);

  const results = {
    openerReengagement: openers.status    === 'fulfilled' ? openers.value    : { sent: 0, error: openers.reason?.message },
    highScoreWarm:      highScore.status  === 'fulfilled' ? highScore.value  : { sent: 0, error: highScore.reason?.message },
    freelancerBidFu:    flBids.status     === 'fulfilled' ? flBids.value     : { sent: 0, error: flBids.reason?.message },
  };

  const totalSent = (results.openerReengagement.sent || 0)
                  + (results.highScoreWarm.sent || 0)
                  + (results.freelancerBidFu.sent || 0);

  console.log(`[WARM] Run complete — total sent: ${totalSent}`, results);
  return { totalSent, ...results };
}

// ── Stats for dashboard ──────────────────────────────────────────────────────
async function getWarmStats() {
  await ensureTables();
  const [totals, recent, openerPending, highScorePending, flPending] = await Promise.all([
    db.query(`
      SELECT channel, COUNT(*) AS total
      FROM warm_outreach_log
      GROUP BY channel
    `),
    db.query(`
      SELECT channel, contact_ref, company, message_sent, status, sent_at
      FROM warm_outreach_log
      ORDER BY sent_at DESC
      LIMIT 50
    `),
    db.query(`
      SELECT COUNT(*) AS count FROM email_tracking
      WHERE open_count > 0 AND warm_sent_at IS NULL AND email IS NOT NULL
        AND opened_at > NOW() - INTERVAL '14 days'
    `),
    db.query(`
      SELECT COUNT(*) AS count FROM scraped_contacts
      WHERE prospect_score >= 60
        AND outreach_sent_at IS NOT NULL
        AND outreach_sent_at < NOW() - INTERVAL '3 days'
        AND warm_sent_at IS NULL
        AND status NOT IN ('replied','client','bounced','unsubscribed')
        AND email IS NOT NULL
    `),
    db.query(`
      SELECT COUNT(*) AS count FROM platform_jobs
      WHERE freelancer_project_id IS NOT NULL
        AND status = 'bidding'
        AND bid_sent_at < NOW() - INTERVAL '24 hours'
        AND bid_sent_at > NOW() - INTERVAL '96 hours'
        AND warm_followup_sent_at IS NULL
    `),
  ]);

  const byChannel = {};
  for (const row of totals.rows) byChannel[row.channel] = parseInt(row.total);

  return {
    totalSent:      totals.rows.reduce((s, r) => s + parseInt(r.total), 0),
    byChannel,
    recent:         recent.rows,
    pending: {
      openerReengagement: parseInt(openerPending.rows[0]?.count || 0),
      highScoreWarm:      parseInt(highScorePending.rows[0]?.count || 0),
      freelancerBidFu:    parseInt(flPending.rows[0]?.count || 0),
    },
  };
}

module.exports = {
  ensureTables,
  runAllWarmOutreach,
  runFreelancerBidFollowUp,
  runEmailOpenerWarm,
  runHighScoreWarmSequence,
  getWarmStats,
};
