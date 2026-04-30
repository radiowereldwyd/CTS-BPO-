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
const db         = require('../db');
const auditLogger = require('./audit-logger');
const emailOutreach = require('./email-outreach');

const SERPAPI_KEY = process.env.SERPAPI_KEY || '';
const APP_URL     = process.env.APP_URL || 'https://your-app.replit.app';

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

// ── 5. Auto-assign Outstanding Contracts ─────────────────────────────────
async function assignContracts() {
  let jobsTable = null;
  try {
    await db.query(`SELECT 1 FROM subcontractor_jobs LIMIT 1`);
    jobsTable = 'subcontractor_jobs';
  } catch { return; }

  // Find unassigned outstanding jobs
  const jobs = await db.query(`
    SELECT j.id, j.title, j.service_type, j.job_value, j.due_date, j.subcontractor_id,
           j.description
    FROM subcontractor_jobs j
    WHERE j.status = 'outstanding'
      AND (j.notes IS NULL OR j.notes NOT LIKE '%assigned%')
    LIMIT 5
  `);

  for (const job of jobs.rows) {
    try {
      // Find best available approved AND PAID subcontractor for this service type
      // IMPORTANT: payment_confirmed must be TRUE — no payment, no contract
      let sub = null;
      if (job.service_type) {
        const subRes = await db.query(`
          SELECT id, name, email FROM subcontractor_applications
          WHERE status = 'approved'
            AND payment_confirmed = TRUE
            AND services::text ILIKE $1
          ORDER BY payment_confirmed_at DESC
          LIMIT 1
        `, [`%${job.service_type}%`]);
        sub = subRes.rows[0] || null;
      }

      if (!sub) {
        // Fallback: any approved + paid sub
        const fallback = await db.query(`
          SELECT id, name, email FROM subcontractor_applications
          WHERE status = 'approved'
            AND payment_confirmed = TRUE
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
        await db.query(`UPDATE subcontractor_jobs SET notes = COALESCE(notes,'') || ' | assigned to ' || $1 || ' ' || NOW() WHERE id=$2`, [sub.email, job.id]);
        agentState.totalContractsAssigned++;
        await logActivity('contract_assigned', `Job #${job.id} "${job.title}" → ${sub.full_name} (${sub.email})`, 'job', job.id, 'success', { jobValue: job.job_value });
      } else {
        await logActivity('contract_assigned', `No available subcontractor for job #${job.id} "${job.title}"`, 'job', job.id, 'skipped');
      }
    } catch (e) {
      await logActivity('contract_assigned', `Failed to assign job #${job.id}: ${e.message}`, 'job', job.id, 'error');
    }
  }

  agentState.lastContractAssign = new Date().toISOString();
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
    case 'all':
      await runLeadSearch();
      await processApplications();
      await assignContracts();
      await runFollowUpSequence();
      break;
    default: throw new Error(`Unknown task: ${task}`);
  }
}

// ── Status ─────────────────────────────────────────────────────────────────
function getStatus() {
  return { ...agentState };
}

module.exports = { startAgent, triggerNow, getStatus };
