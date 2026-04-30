/**
 * CTS BPO — Autonomous AI Agent
 * Runs independently on a schedule to:
 *   1. Search for BPO client leads via SerpAPI
 *   2. Send cold outreach emails to discovered leads
 *   3. Send automated follow-ups at day 3 and day 7
 *   4. Acknowledge and auto-process subcontractor applications
 *   5. Auto-assign contracts to matched subcontractors
 *   6. Log all activity to ai_activity_log
 */

const cron       = require('node-cron');
const axios      = require('axios');
const fs         = require('fs');
const path       = require('path');
const { v4: uuidv4 } = require('uuid');
const db         = require('../db');
const auditLogger = require('./audit-logger');
const emailOutreach = require('./email-outreach');
const aiProcessor   = require('./ai-job-processor');

const SERPAPI_KEY = process.env.SERPAPI_KEY || '';
const APP_URL     = process.env.APP_URL || 'https://your-app.replit.app';
const AI_WORKER_ID = 0; // sentinel: sub_id=0 means the AI Worker

// ── BPO lead search queries ────────────────────────────────────────────────
const LEAD_QUERIES = [
  { q: '"outsource" "data entry" "contact us" OR "get a quote" -site:linkedin.com -site:indeed.com', type: 'data-entry' },
  { q: '"transcription service" "outsource" OR "BPO" "company" "quote" -site:linkedin.com', type: 'transcription' },
  { q: '"translation services" "outsource" "provider" "get quote" -site:linkedin.com', type: 'translation' },
  { q: '"virtual assistant" "outsourcing" "company" "services" -site:linkedin.com', type: 'virtual-assistant' },
  { q: '"accounts payable" "outsource" "service provider" -site:linkedin.com', type: 'finance-admin' },
  { q: '"content moderation" "outsource" "company" -site:linkedin.com', type: 'content-moderation' },
  { q: '"data capture" "outsourcing company" "quote" -site:linkedin.com', type: 'data-entry' },
  { q: '"payroll processing" "outsource" "small business" -site:linkedin.com', type: 'finance-admin' },
  { q: '"customer support" "outsourcing" "BPO" "company" "contact" -site:linkedin.com', type: 'customer-support' },
  { q: 'BPO services South Africa "contact us" "get a quote" -site:linkedin.com -site:indeed.com', type: 'general' },
  { q: '"document digitization" "outsource" "service" -site:linkedin.com', type: 'document-processing' },
  { q: '"social media management" "outsource" "agency" -site:linkedin.com', type: 'social-media' },
];

// Agent state (in-memory, survives between cron ticks)
const agentState = {
  running: false,
  startedAt: null,
  lastLeadSearch: null,
  lastFollowUp: null,
  lastAppCheck: null,
  lastContractAssign: null,
  totalLeadsFound: 0,
  totalEmailsSent: 0,
  totalAppProcessed: 0,
  totalContractsAssigned: 0,
  errors: [],
};

// ── Table setup ────────────────────────────────────────────────────────────
async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_activity_log (
      id           SERIAL PRIMARY KEY,
      action_type  TEXT NOT NULL,
      description  TEXT,
      target_entity TEXT,
      target_id    INTEGER,
      status       TEXT DEFAULT 'success',
      details      JSONB,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_leads (
      id               SERIAL PRIMARY KEY,
      title            TEXT,
      company          TEXT,
      source_url       TEXT UNIQUE,
      domain           TEXT,
      contact_email    TEXT,
      job_type         TEXT DEFAULT 'general',
      snippet          TEXT,
      status           TEXT DEFAULT 'new',
      outreach_sent_at TIMESTAMPTZ,
      followup1_sent_at TIMESTAMPTZ,
      followup2_sent_at TIMESTAMPTZ,
      response_at      TIMESTAMPTZ,
      notes            TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// ── Helpers ────────────────────────────────────────────────────────────────
async function logActivity(actionType, description, targetEntity = null, targetId = null, status = 'success', details = null) {
  try {
    await db.query(
      `INSERT INTO ai_activity_log (action_type, description, target_entity, target_id, status, details)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [actionType, description, targetEntity, targetId, status, details ? JSON.stringify(details) : null]
    );
    console.log(`🤖 [AI AGENT] ${actionType}: ${description}`);
  } catch (e) {
    console.error('AI log error:', e.message);
  }
}

function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch { return null; }
}

function extractEmailFromText(text) {
  if (!text) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : null;
}

function buildContactEmail(domain) {
  if (!domain) return null;
  return `info@${domain}`;
}

function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ── 1. Lead Search ─────────────────────────────────────────────────────────
async function runLeadSearch() {
  if (!SERPAPI_KEY) {
    await logActivity('lead_search', 'Skipped — SERPAPI_KEY not configured', null, null, 'skipped');
    return;
  }

  const queries = pickRandom(LEAD_QUERIES, 3);
  let newLeads = 0;

  for (const { q, type } of queries) {
    try {
      const resp = await axios.get('https://serpapi.com/search.json', {
        params: { q, api_key: SERPAPI_KEY, num: 10, hl: 'en', gl: 'za' },
        timeout: 15000,
      });

      const results = resp.data?.organic_results || [];

      for (const r of results) {
        const url = r.link;
        if (!url) continue;

        const domain = extractDomain(url);
        const emailFromSnippet = extractEmailFromText(r.snippet) || extractEmailFromText(r.title);
        const contactEmail = emailFromSnippet || buildContactEmail(domain);

        try {
          const ins = await db.query(
            `INSERT INTO ai_leads (title, company, source_url, domain, contact_email, job_type, snippet, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'new')
             ON CONFLICT (source_url) DO NOTHING
             RETURNING id`,
            [r.title || 'BPO Lead', domain, url, domain, contactEmail, type, r.snippet || '']
          );

          if (ins.rows.length > 0) {
            newLeads++;
            agentState.totalLeadsFound++;

            // Immediately attempt outreach if we have an email
            if (contactEmail) {
              await sendLeadOutreach(ins.rows[0].id, { name: domain, company: domain, email: contactEmail, jobType: type });
            }
          }
        } catch (dbErr) {
          // Duplicate url — skip silently
        }
      }
    } catch (err) {
      await logActivity('lead_search', `Search failed: ${err.message}`, null, null, 'error');
    }
  }

  agentState.lastLeadSearch = new Date().toISOString();
  await logActivity('lead_search', `Searched ${queries.length} queries — ${newLeads} new leads found`, null, null, 'success', { newLeads, queries: queries.map(q => q.type) });
}

// ── 2. Send Cold Outreach to Lead ─────────────────────────────────────────
async function sendLeadOutreach(leadId, prospect) {
  try {
    const result = await emailOutreach.sendClientColdOutreach(prospect);
    await db.query(
      `UPDATE ai_leads SET status='outreach_sent', outreach_sent_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [leadId]
    );
    agentState.totalEmailsSent++;
    await logActivity('email_sent', `Cold outreach → ${prospect.email} [${prospect.jobType}]`, 'lead', leadId, 'success', { to: prospect.email, type: prospect.jobType });
    return result;
  } catch (err) {
    await logActivity('email_sent', `Failed to send to ${prospect.email}: ${err.message}`, 'lead', leadId, 'error');
  }
}

// ── 3. Follow-up Sequence ─────────────────────────────────────────────────
async function runFollowUpSequence() {
  // Day 3 follow-up
  const day3 = await db.query(`
    SELECT id, contact_email, company, job_type FROM ai_leads
    WHERE status = 'outreach_sent'
      AND outreach_sent_at < NOW() - INTERVAL '3 days'
      AND followup1_sent_at IS NULL
      AND contact_email IS NOT NULL
    LIMIT 20
  `);

  for (const lead of day3.rows) {
    try {
      await emailOutreach.sendClientFollowUp({ email: lead.contact_email, company: lead.company, jobType: lead.job_type, followUpNumber: 1 });
      await db.query(`UPDATE ai_leads SET followup1_sent_at=NOW(), status='followup1_sent', updated_at=NOW() WHERE id=$1`, [lead.id]);
      agentState.totalEmailsSent++;
      await logActivity('followup_sent', `Day-3 follow-up → ${lead.contact_email}`, 'lead', lead.id);
    } catch (e) {
      await logActivity('followup_sent', `Failed day-3 follow-up ${lead.contact_email}: ${e.message}`, 'lead', lead.id, 'error');
    }
  }

  // Day 7 follow-up
  const day7 = await db.query(`
    SELECT id, contact_email, company, job_type FROM ai_leads
    WHERE status = 'followup1_sent'
      AND followup1_sent_at < NOW() - INTERVAL '4 days'
      AND followup2_sent_at IS NULL
      AND contact_email IS NOT NULL
    LIMIT 20
  `);

  for (const lead of day7.rows) {
    try {
      await emailOutreach.sendClientFollowUp({ email: lead.contact_email, company: lead.company, jobType: lead.job_type, followUpNumber: 2 });
      await db.query(`UPDATE ai_leads SET followup2_sent_at=NOW(), status='followup2_sent', updated_at=NOW() WHERE id=$1`, [lead.id]);
      agentState.totalEmailsSent++;
      await logActivity('followup_sent', `Day-7 follow-up → ${lead.contact_email}`, 'lead', lead.id);
    } catch (e) {
      await logActivity('followup_sent', `Failed day-7 follow-up ${lead.contact_email}: ${e.message}`, 'lead', lead.id, 'error');
    }
  }

  agentState.lastFollowUp = new Date().toISOString();
  const total = day3.rows.length + day7.rows.length;
  if (total > 0) await logActivity('followup_sequence', `Sent ${total} follow-ups (day3: ${day3.rows.length}, day7: ${day7.rows.length})`);
}

// ── 4. Process Subcontractor Applications ────────────────────────────────
async function processApplications() {
  // Step A: Acknowledge new applications (< 1 hour old, not yet acknowledged)
  let ackTable = null;
  try {
    await db.query(`SELECT 1 FROM subcontractor_applications LIMIT 1`);
    ackTable = 'subcontractor_applications';
  } catch { return; } // Table doesn't exist yet

  const newApps = await db.query(`
    SELECT id, name, email, location, platform_fee, services
    FROM subcontractor_applications
    WHERE status = 'pending'
      AND (notes IS NULL OR notes NOT LIKE '%acknowledged%')
      AND created_at > NOW() - INTERVAL '24 hours'
    LIMIT 10
  `);

  for (const app of newApps.rows) {
    try {
      await emailOutreach.sendSubcontractorAcknowledgment({ name: app.name, email: app.email, amount: app.platform_fee });
      await db.query(`UPDATE subcontractor_applications SET notes = COALESCE(notes,'') || ' | acknowledged ' || NOW() WHERE id=$1`, [app.id]);
      agentState.totalAppProcessed++;
      await logActivity('application_acknowledged', `Auto-acknowledged application from ${app.name} (${app.email})`, 'application', app.id);
    } catch (e) {
      await logActivity('application_acknowledged', `Failed to ack ${app.email}: ${e.message}`, 'application', app.id, 'error');
    }
  }

  // Step B: Auto-approve applications that are 24h old and still pending
  const readyApps = await db.query(`
    SELECT id, name, email, platform_fee, services
    FROM subcontractor_applications
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '24 hours'
    LIMIT 10
  `);

  for (const app of readyApps.rows) {
    try {
      await db.query(`UPDATE subcontractor_applications SET status='approved', reviewed_at=NOW() WHERE id=$1`, [app.id]);
      await emailOutreach.sendSubcontractorApproval({ name: app.name, email: app.email, amount: app.platform_fee, appUrl: APP_URL });
      agentState.totalAppProcessed++;
      await logActivity('application_approved', `Auto-approved ${app.name} (${app.email}) — platform fee R${app.platform_fee}`, 'application', app.id);
    } catch (e) {
      await logActivity('application_approved', `Failed approval for ${app.email}: ${e.message}`, 'application', app.id, 'error');
    }
  }

  agentState.lastAppCheck = new Date().toISOString();
}

// ── 5. Auto-assign Outstanding Contracts (AI-first, then human) ───────────
async function assignContracts() {
  try { await db.query(`SELECT 1 FROM subcontractor_jobs LIMIT 1`); }
  catch { return; }

  const jobs = await db.query(`
    SELECT j.id, j.title, j.service_type, j.job_value, j.due_date, j.description, j.sub_payout
    FROM subcontractor_jobs j
    WHERE j.status = 'outstanding'
      AND (j.notes IS NULL OR j.notes NOT LIKE '%assigned%')
    LIMIT 10
  `);

  for (const job of jobs.rows) {
    try {
      const jobType = (job.service_type || '').toLowerCase();

      // ── Try AI first ────────────────────────────────────────────────────
      if (aiProcessor.canHandle(jobType)) {
        // Mark as assigned to AI Worker (sub_id = 0) and status 'assigned'
        await db.query(
          `UPDATE subcontractor_jobs
           SET sub_id=$1, status='assigned',
               notes = COALESCE(notes,'') || ' | assigned to AI Worker ' || NOW(),
               updated_at = NOW()
           WHERE id=$2`,
          [AI_WORKER_ID, job.id]
        );
        agentState.totalContractsAssigned++;
        await logActivity(
          'contract_assigned',
          `Job #${job.id} "${job.title}" [${jobType}] → AI Worker (auto-processing)`,
          'job', job.id, 'success', { jobType, aiCapable: true }
        );
        continue; // AI will process in the next processAIJobs() cycle
      }

      // ── Fall back to human subcontractor ────────────────────────────────
      let sub = null;
      if (job.service_type) {
        const subRes = await db.query(`
          SELECT id, name, email FROM subcontractor_applications
          WHERE status = 'approved' AND payment_confirmed = TRUE
            AND services::text ILIKE $1
          ORDER BY payment_confirmed_at DESC LIMIT 1
        `, [`%${job.service_type}%`]);
        sub = subRes.rows[0] || null;
      }
      if (!sub) {
        const fallback = await db.query(`
          SELECT id, name, email FROM subcontractor_applications
          WHERE status = 'approved' AND payment_confirmed = TRUE
          ORDER BY payment_confirmed_at DESC LIMIT 1
        `);
        sub = fallback.rows[0] || null;
      }

      if (sub) {
        await emailOutreach.sendContractAssignment({
          name: sub.name, email: sub.email,
          jobTitle: job.title, jobValue: job.job_value,
          dueDate: job.due_date, jobId: job.id, description: job.description,
        });
        await db.query(
          `UPDATE subcontractor_jobs
           SET sub_id=$1, status='assigned',
               notes = COALESCE(notes,'') || ' | assigned to ' || $2 || ' ' || NOW(),
               updated_at = NOW()
           WHERE id=$3`,
          [sub.id, sub.email, job.id]
        );
        agentState.totalContractsAssigned++;
        await logActivity('contract_assigned', `Job #${job.id} "${job.title}" → ${sub.name} (${sub.email})`, 'job', job.id, 'success', { jobValue: job.job_value });
      } else {
        await logActivity('contract_assigned', `No human sub available for job #${job.id} "${job.title}" [type=${jobType}] — will retry`, 'job', job.id, 'skipped');
      }
    } catch (e) {
      await logActivity('contract_assigned', `Failed to assign job #${job.id}: ${e.message}`, 'job', job.id, 'error');
    }
  }

  agentState.lastContractAssign = new Date().toISOString();
}

// ── 6. Process AI Worker Jobs ─────────────────────────────────────────────
async function processAIJobs() {
  try { await db.query(`SELECT 1 FROM subcontractor_jobs LIMIT 1`); }
  catch { return; }

  // Find jobs assigned to the AI Worker that haven't been submitted yet
  const jobs = await db.query(`
    SELECT j.id, j.title, j.service_type, j.description, j.sub_payout,
           j.contract_id, j.due_date
    FROM subcontractor_jobs j
    WHERE j.sub_id = $1
      AND j.status = 'assigned'
    LIMIT 5
  `, [AI_WORKER_ID]);

  if (jobs.rows.length === 0) return;

  // Ensure uploads dir
  const uploadDir = path.join(__dirname, '../../uploads/submissions');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  // Ensure job_submissions table
  try {
    await db.query(`SELECT 1 FROM job_submissions LIMIT 1`);
  } catch { return; }

  for (const job of jobs.rows) {
    try {
      const jobType = (job.service_type || 'general').toLowerCase();

      await logActivity('ai_job_start', `AI processing job #${job.id} "${job.title}" [${jobType}]`, 'job', job.id, 'success');

      // Run AI processor
      const result = await aiProcessor.processJob({
        jobType,
        title:       job.title,
        description: job.description,
        filePath:    null, // No file for autonomous jobs; client can submit files via portal later
        fileName:    null,
      });

      // Save deliverable to a text file
      const outFileName = `ai_${Date.now()}_${uuidv4().slice(0, 8)}_job${job.id}.txt`;
      const outFilePath = path.join(uploadDir, outFileName);
      const fileContent = [
        `CTS BPO AI Deliverable`,
        `Job #${job.id}: ${job.title}`,
        `Service type: ${job.service_type}`,
        `Processed by: ${result.method}`,
        `Quality level: ${result.quality}`,
        `Processed at: ${new Date().toISOString()}`,
        ``,
        `${'─'.repeat(60)}`,
        ``,
        result.deliverable,
      ].join('\n');

      fs.writeFileSync(outFilePath, fileContent, 'utf8');
      const fileSizeBytes = fs.statSync(outFilePath).size;

      // Create job submission record
      const deliveryToken = uuidv4();
      const sr = await db.query(
        `INSERT INTO job_submissions
           (job_id, sub_application_id, file_name, file_path, file_size,
            ai_quality_score, ai_quality_notes, status, delivery_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          job.id, null,
          outFileName, outFilePath, fileSizeBytes,
          result.quality === 'full' ? 90 : result.quality === 'partial' ? 70 : 50,
          `AI Worker processed via ${result.method}. Quality: ${result.quality}.`,
          'approved',
          deliveryToken,
        ]
      );

      // Mark job as delivered
      await db.query(
        `UPDATE subcontractor_jobs
         SET status='delivered', submitted_at=NOW(), verified_at=NOW(), updated_at=NOW()
         WHERE id=$1`,
        [job.id]
      );
      await db.query(
        `UPDATE job_submissions SET status='delivered', delivered_at=NOW() WHERE id=$1`,
        [sr.rows[0].id]
      );

      // Attempt to notify the client
      let clientEmail = null;
      let clientName  = 'Valued Client';
      try {
        const cr = await db.query(
          `SELECT al.email, al.company_name
           FROM ai_leads al
           JOIN contracts c ON c.client_id = al.id::text::integer
           WHERE c.id = $1`,
          [job.contract_id]
        ).catch(() => ({ rows: [] }));
        if (cr.rows[0]) {
          clientEmail = cr.rows[0].email;
          clientName  = cr.rows[0].company_name || clientName;
        }
      } catch {}

      if (clientEmail) {
        const appBase = process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : (APP_URL || '');
        await emailOutreach.sendClientDelivery(
          clientEmail, clientName, job.title,
          `${appBase}/api/sub/client-confirm/${deliveryToken}`,
          `${appBase}/api/sub/download/${sr.rows[0].id}`
        ).catch(() => {});
      }

      await logActivity(
        'ai_job_complete',
        `AI completed job #${job.id} "${job.title}" via ${result.method} [${result.quality}]${clientEmail ? ` — delivered to ${clientEmail}` : ''}`,
        'job', job.id, 'success',
        { method: result.method, quality: result.quality, fileSizeBytes }
      );

    } catch (e) {
      await logActivity('ai_job_error', `AI failed job #${job.id}: ${e.message}`, 'job', job.id, 'error');
    }
  }
}

// ── 6. Payment Chase & Auto-release ────────────────────────────────────────
// Runs every hour. Three jobs:
//   A) Auto-release payouts for delivered jobs older than 48h (cron-safe replacement for setTimeout)
//   B) Send client payment reminders: day 3, day 7, day 14
//   C) Flag jobs as overdue after 14 days with no client confirmation
async function runPaymentChase() {
  if (!db.isConnected()) return;

  const appBase = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.APP_URL || '');

  // Helper: get client email + name for a job via its contract_id → ai_leads
  async function getClientInfo(contractId) {
    if (!contractId) return null;
    try {
      const r = await db.query(
        `SELECT al.contact_email AS email, al.company AS name
         FROM ai_leads al
         WHERE al.id = $1`,
        [contractId]
      );
      return r.rows[0] || null;
    } catch { return null; }
  }

  // ── A) Auto-release payouts for jobs delivered > 48h ago, not yet paid ──
  try {
    const overdue = await db.query(`
      SELECT js.id, js.delivery_token, js.job_id, js.sub_application_id,
             sj.sub_payout, sj.contract_id,
             sa.name AS sub_name
      FROM job_submissions js
      JOIN subcontractor_jobs sj ON sj.id = js.job_id
      LEFT JOIN subcontractor_applications sa ON sa.id = js.sub_application_id
      WHERE js.status = 'delivered'
        AND js.payout_status != 'paid'
        AND js.delivered_at < NOW() - INTERVAL '48 hours'
      LIMIT 20
    `);

    for (const row of overdue.rows) {
      try {
        const ref = `AUTO-CRON-${Date.now()}`;
        await db.query(
          `UPDATE job_submissions
           SET payout_status='paid', payout_reference=$1, confirmed_at=COALESCE(confirmed_at,NOW())
           WHERE id=$2`,
          [ref, row.id]
        );
        await db.query(`UPDATE subcontractor_jobs SET status='completed', updated_at=NOW() WHERE id=$1`, [row.job_id]);

        // Notify sub
        if (row.sub_application_id) {
          const subR = await db.query(`SELECT email FROM subcontractor_applications WHERE id=$1`, [row.sub_application_id]);
          const subEmail = subR.rows[0]?.email;
          const jobR    = await db.query(`SELECT title FROM subcontractor_jobs WHERE id=$1`, [row.job_id]);
          if (subEmail) {
            await emailOutreach.sendSubcontractorPayout(subEmail, row.sub_name, row.sub_payout, jobR.rows[0]?.title || 'your job', ref).catch(() => {});
          }
        }

        await logActivity('payment_auto_release', `Cron auto-released payout for submission #${row.id} (48h rule)`, 'job_submission', row.id, 'success');
      } catch (e) {
        await logActivity('payment_auto_release', `Auto-release failed for submission #${row.id}: ${e.message}`, 'job_submission', row.id, 'error');
      }
    }
  } catch (e) {
    await logActivity('payment_chase', `Auto-release query error: ${e.message}`, null, null, 'error');
  }

  // ── B) Client payment reminders ──
  const reminderCases = [
    { day: 3,  field: 'client_reminder1_at', prevField: null,                 num: 1 },
    { day: 7,  field: 'client_reminder2_at', prevField: 'client_reminder1_at', num: 2 },
    { day: 14, field: 'client_reminder3_at', prevField: 'client_reminder2_at', num: 3 },
  ];

  for (const rc of reminderCases) {
    try {
      const prevCondition = rc.prevField
        ? `AND js.${rc.prevField} < NOW() - INTERVAL '${rc.day - (rc.num === 2 ? 3 : 7)} days'`
        : `AND js.delivered_at   < NOW() - INTERVAL '${rc.day} days'`;

      const rows = await db.query(`
        SELECT js.id, js.delivery_token, js.job_id, sj.contract_id, sj.title
        FROM job_submissions js
        JOIN subcontractor_jobs sj ON sj.id = js.job_id
        WHERE js.status = 'delivered'
          AND js.payout_status != 'paid'
          AND js.confirmed_at IS NULL
          AND js.${rc.field} IS NULL
          ${prevCondition}
        LIMIT 20
      `);

      for (const row of rows.rows) {
        try {
          const client = await getClientInfo(row.contract_id);
          if (client?.email) {
            await emailOutreach.sendClientPaymentReminder(
              client.email,
              client.name || 'Valued Client',
              row.title,
              `${appBase}/api/sub/client-confirm/${row.delivery_token}`,
              `${appBase}/api/sub/download/${row.delivery_token}`,
              rc.num
            );
            agentState.totalEmailsSent++;
          }
          // Mark reminder sent regardless (avoids hammering clients with no email on record)
          await db.query(`UPDATE job_submissions SET ${rc.field}=NOW() WHERE id=$1`, [row.id]);
          await logActivity('payment_reminder_sent', `Reminder #${rc.num} sent for job "${row.title}" (submission #${row.id})${client?.email ? ` → ${client.email}` : ' (no client email)'}`, 'job_submission', row.id);
        } catch (e) {
          await logActivity('payment_reminder_sent', `Reminder #${rc.num} failed for submission #${row.id}: ${e.message}`, 'job_submission', row.id, 'error');
        }
      }
    } catch (e) {
      await logActivity('payment_chase', `Reminder #${rc.num} query error: ${e.message}`, null, null, 'error');
    }
  }

  // ── C) Flag as overdue: delivered > 14 days, no confirmation, no flag yet ──
  try {
    const flagged = await db.query(`
      UPDATE job_submissions
      SET overdue_flagged_at = NOW()
      WHERE status = 'delivered'
        AND payout_status != 'paid'
        AND confirmed_at IS NULL
        AND overdue_flagged_at IS NULL
        AND delivered_at < NOW() - INTERVAL '14 days'
      RETURNING id, job_id
    `);
    if (flagged.rows.length > 0) {
      await db.query(`
        UPDATE subcontractor_jobs SET status='overdue', updated_at=NOW()
        WHERE id = ANY($1::int[])
      `, [flagged.rows.map(r => r.job_id)]);
      await logActivity('payment_chase', `Flagged ${flagged.rows.length} job(s) as overdue (14-day rule)`, null, null, 'warning');
    }
  } catch (e) {
    await logActivity('payment_chase', `Overdue-flag error: ${e.message}`, null, null, 'error');
  }

  agentState.lastPaymentChase = new Date().toISOString();
}

// ── Start the agent ────────────────────────────────────────────────────────
async function startAgent() {
  await ensureTables();
  agentState.running = true;
  agentState.startedAt = new Date().toISOString();

  await logActivity('agent_start', `CTS BPO Autonomous AI Agent started — all systems active`);
  console.log('🤖 CTS BPO Autonomous AI Agent — ONLINE');

  // Run immediately on startup (staggered to avoid hammering)
  setTimeout(() => runLeadSearch().catch(console.error), 5000);
  setTimeout(() => processApplications().catch(console.error), 10000);
  setTimeout(() => assignContracts().catch(console.error), 15000);
  setTimeout(() => processAIJobs().catch(console.error), 20000);

  // ── Schedules ──
  // Lead search every 2 hours
  cron.schedule('0 */2 * * *', () => {
    runLeadSearch().catch(e => logActivity('lead_search', `Cron error: ${e.message}`, null, null, 'error'));
  });

  // Follow-up emails every 6 hours
  cron.schedule('0 */6 * * *', () => {
    runFollowUpSequence().catch(e => logActivity('followup_sequence', `Cron error: ${e.message}`, null, null, 'error'));
  });

  // Application processing every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    processApplications().catch(e => logActivity('application_process', `Cron error: ${e.message}`, null, null, 'error'));
  });

  // Contract assignment every hour
  cron.schedule('0 * * * *', () => {
    assignContracts().catch(e => logActivity('contract_assign', `Cron error: ${e.message}`, null, null, 'error'));
  });

  // AI job processing every 15 minutes — processes jobs assigned to AI Worker
  cron.schedule('*/15 * * * *', () => {
    processAIJobs().catch(e => logActivity('ai_job_process', `Cron error: ${e.message}`, null, null, 'error'));
  });

  // Payment chase every hour — auto-release overdue payouts + client reminders
  cron.schedule('30 * * * *', () => {
    runPaymentChase().catch(e => logActivity('payment_chase', `Cron error: ${e.message}`, null, null, 'error'));
  });
  setTimeout(() => runPaymentChase().catch(console.error), 25000);

  // Daily heartbeat log
  cron.schedule('0 8 * * *', () => {
    logActivity('heartbeat', `Daily check — leads: ${agentState.totalLeadsFound}, emails: ${agentState.totalEmailsSent}, apps: ${agentState.totalAppProcessed}, contracts: ${agentState.totalContractsAssigned}`);
  });
}

// ── Manual trigger (admin API) ─────────────────────────────────────────────
async function triggerNow(task) {
  switch (task) {
    case 'lead_search':  await runLeadSearch(); break;
    case 'followup':     await runFollowUpSequence(); break;
    case 'applications': await processApplications(); break;
    case 'contracts':    await assignContracts(); break;
    case 'ai_jobs':      await processAIJobs(); break;
    case 'payment_chase': await runPaymentChase(); break;
    case 'all':
      await runLeadSearch();
      await processApplications();
      await assignContracts();
      await processAIJobs();
      await runFollowUpSequence();
      await runPaymentChase();
      break;
    default: throw new Error(`Unknown task: ${task}`);
  }
}

// ── Status ─────────────────────────────────────────────────────────────────
function getStatus() {
  return { ...agentState };
}

module.exports = { startAgent, triggerNow, getStatus, processAIJobs, runPaymentChase };
