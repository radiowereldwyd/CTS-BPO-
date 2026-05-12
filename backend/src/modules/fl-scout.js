'use strict';

/**
 * CTS BPO — Freelancer.com Proactive Scout
 *
 * Infiltrates Freelancer as a buyer-first strategy:
 * 1. Scans ALL new BPO projects posted in the last 24h
 * 2. Messages the employer BEFORE placing a bid — consultative, needs-first
 * 3. AI negotiator handles all replies (via freelancer-inbox.js)
 * 4. Tracks which projects we've already messaged (no duplicates)
 *
 * This approach converts better than bidding alone because:
 * - We reach them before the bid flood (first mover advantage)
 * - We ask about their needs → personalised quote → higher trust
 * - Employers who respond to messages are pre-qualified warm leads
 */

const axios      = require('axios');
const db         = require('../db');
const negotiator = require('./ai-negotiator');

const FL_API     = 'https://www.freelancer.com/api';
const MY_FL_ID   = 92591312;
const FL_TOKEN   = () => process.env.FREELANCER_TOKEN || '';

// BPO job category IDs on Freelancer.com
// Fetched from: https://www.freelancer.com/api/projects/0.1/jobs/
const BPO_JOB_IDS = [
  110,  // Data Entry
  106,  // Transcription
  120,  // Translation
  7,    // Virtual Assistant
  118,  // Customer Service
  101,  // Research
  13,   // Excel
  5,    // Word Processing / Typing
  116,  // Data Processing
  1,    // Data Mining
  141,  // Database Management
  44,   // Copy Typing
  70,   // Form Filling
  94,   // Proofreading
  99,   // Administrative Support
];

function flGet(path, params = {}) {
  const qs = new URLSearchParams({ ...params, compact: true }).toString();
  return axios.get(`${FL_API}${path}${qs ? '?' + qs : ''}`, {
    headers: { 'freelancer-oauth-v1': FL_TOKEN() },
    timeout: 15000,
    validateStatus: () => true,
  });
}

function flPost(path, data = {}) {
  return axios.post(`${FL_API}${path}`, data, {
    headers: { 'freelancer-oauth-v1': FL_TOKEN(), 'Content-Type': 'application/json' },
    timeout: 15000,
    validateStatus: () => true,
  });
}

// Ensure scout tables
async function ensureTables() {
  await negotiator.ensureTables();
  await db.query(`
    CREATE TABLE IF NOT EXISTS fl_scout_sent (
      project_id  BIGINT PRIMARY KEY,
      sent_at     TIMESTAMPTZ DEFAULT NOW(),
      replied     BOOLEAN DEFAULT FALSE
    )
  `);
  // Add columns if missing (table may pre-exist without them)
  await db.query(`ALTER TABLE fl_scout_sent ADD COLUMN IF NOT EXISTS owner_id BIGINT`).catch(() => {});
  await db.query(`ALTER TABLE fl_scout_sent ADD COLUMN IF NOT EXISTS title TEXT`).catch(() => {});
  await db.query(`ALTER TABLE fl_scout_sent ADD COLUMN IF NOT EXISTS negotiation_id INTEGER`).catch(() => {});
}

// Fetch new BPO projects posted in the last 24h
async function fetchNewBpoProjects(limit = 50) {
  try {
    const minTime = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const r = await flGet('/projects/0.1/projects/active/', {
      'job_ids[]':    BPO_JOB_IDS.slice(0, 5).join('&job_ids[]='),
      min_time_posted: minTime,
      project_types:  'fixed,hourly',
      limit,
      offset: 0,
      full_description: false,
    });

    if (r.status !== 200) {
      console.warn(`[FL-SCOUT] API error ${r.status}: ${r.data?.message || 'unknown'}`);
      return [];
    }

    const projects = r.data?.result?.projects || [];
    return projects.map(p => ({
      id:       p.id,
      title:    p.title,
      snippet:  p.preview_description || '',
      ownerId:  p.owner_id,
      budget:   p.budget ? `${p.budget.minimum}-${p.budget.maximum}` : null,
      currency: p.currency?.sign || '$',
      budgetMin: p.budget?.minimum,
      budgetMax: p.budget?.maximum,
      posted:   p.time_submitted ? new Date(p.time_submitted * 1000).toISOString() : null,
    }));
  } catch (e) {
    console.warn(`[FL-SCOUT] fetchNewBpoProjects error: ${e.message}`);
    return [];
  }
}

// Get the display name of the project owner
async function getOwnerName(userId) {
  try {
    const r = await flGet('/users/0.1/users/', { 'ids[]': userId, display_info: true });
    const u = r.data?.result?.users?.[userId];
    return u?.display_name || u?.username || 'there';
  } catch { return 'there'; }
}

// Build a proactive opening message (needs-discovery first, not a hard pitch)
function buildScoutMessage(project, ownerName) {
  const name  = (ownerName || 'there').split(' ')[0];
  const title = project.title || 'your project';
  const budget = project.budgetMax ? `$${project.budgetMin}–$${project.budgetMax}` : 'your budget';

  const openers = [
    `Hi ${name},\n\nI noticed you just posted "${title}" — before I submit a formal bid, I wanted to reach out directly to make sure I fully understand what you need so I can give you an accurate, personalised quote.\n\nCould you share:\n• What's the total volume or scope? (e.g., number of records, pages, hours)\n• Do you have a preferred format for the output?\n• What's your target delivery date?\n\nWe're an AI-powered BPO team (data entry, transcription, VA, customer support, document processing) and we can typically turn around projects much faster than competitors at ${budget}.\n\nLooking forward to understanding your requirements better!\n\nBest regards,\nThandeka Mokoena | CTS BPO`,

    `Hi ${name},\n\nI came across "${title}" and I'd love to help — but rather than sending a generic bid, I want to make sure my proposal is exactly right for you.\n\nQuick questions:\n• What's the approximate volume of work?\n• Are there any specific quality standards or formats required?\n• Is this a one-time project or ongoing?\n\nBased on your answers, I'll send you a detailed quote with exact pricing and a timeline. We specialise in this type of work and have AI-assisted tools that let us deliver faster and more accurately than most freelancers.\n\nHappy to discuss!\n\nThandeka | CTS BPO`,

    `Hi ${name},\n\nSaw your posting for "${title}" — this is exactly our specialty at CTS BPO.\n\nBefore I bid formally, I want to ask a few quick questions to make sure I quote you accurately:\n\n1. What's the volume? (records/pages/hours/words)\n2. Any specific output format or template?\n3. What's the deadline?\n\nThis lets me give you a precise quote instead of a vague range. Our team uses AI-assisted processing which typically means 2–3× faster delivery than traditional freelancers, at competitive prices.\n\nWhat does your project look like?\n\nThandeka Mokoena\nCTS BPO Solutions`,
  ];

  return openers[project.id % openers.length];
}

// Send a direct message to the project owner via Freelancer messenger
async function sendScoutMessage(project, ownerName) {
  const message = buildScoutMessage(project, ownerName);
  const r = await flPost('/messages/0.1/threads/', {
    to_ids:      [project.ownerId],
    message,
    context_type: 'project',
    context_id:   project.id,
  });

  if (r.status === 200 || r.status === 201) {
    return { ok: true, message };
  }
  return { ok: false, status: r.status, error: r.data?.message || 'Unknown error' };
}

// Main scout run — scans new projects, messages owners we haven't contacted
async function runFreelancerScout({ maxMessages = 15 } = {}) {
  if (!FL_TOKEN()) return { sent: 0, skipped: 0, reason: 'No FREELANCER_TOKEN configured' };
  await ensureTables();

  const projects = await fetchNewBpoProjects(60);
  if (projects.length === 0) {
    console.log('[FL-SCOUT] No new BPO projects found');
    return { sent: 0, skipped: 0, reason: 'No projects found' };
  }

  console.log(`[FL-SCOUT] Found ${projects.length} new BPO projects — checking which to message`);

  let sent = 0, skipped = 0;

  for (const project of projects) {
    if (sent >= maxMessages) break;
    if (!project.ownerId || project.ownerId === MY_FL_ID) { skipped++; continue; }

    // Check if we've already messaged this project
    const already = await db.query(
      `SELECT 1 FROM fl_scout_sent WHERE project_id=$1 LIMIT 1`,
      [project.id]
    );
    if (already.rows.length > 0) { skipped++; continue; }

    // Check if this project is already in our platform_jobs (we've bid on it)
    const bid = await db.query(
      `SELECT 1 FROM platform_jobs WHERE freelancer_project_id=$1 LIMIT 1`,
      [project.id]
    );

    try {
      const ownerName = await getOwnerName(project.ownerId);
      const result    = await sendScoutMessage(project, ownerName);

      if (result.ok) {
        // Record that we scouted this project
        await db.query(
          `INSERT INTO fl_scout_sent (project_id, owner_id, title, sent_at)
           VALUES ($1,$2,$3,NOW()) ON CONFLICT (project_id) DO NOTHING`,
          [project.id, project.ownerId, project.title]
        );

        // Pre-create a negotiation record so we track the conversation
        await db.query(
          `INSERT INTO ai_negotiations (platform, contact_ref, client_name, project_title, service_type, status, last_reply)
           VALUES ('freelancer', $1, $2, $3, $4, 'quoting', 'scout_message_sent')
           ON CONFLICT DO NOTHING`,
          [`fl_${project.id}`, ownerName, project.title, negotiator.detectServiceType(project.title + ' ' + project.snippet)]
        ).catch(() => {});

        console.log(`[FL-SCOUT] ✅ Messaged owner of "${project.title}" (project ${project.id})`);
        sent++;
      } else {
        // Rate limit or API issue — stop for now
        if (result.status === 429 || result.status === 401) {
          console.warn(`[FL-SCOUT] API limit/auth error (${result.status}) — stopping scout`);
          break;
        }
        console.warn(`[FL-SCOUT] Failed to message project ${project.id}: ${result.error}`);
        skipped++;
      }

      // Delay between messages — be respectful of rate limits
      await new Promise(r => setTimeout(r, 3000));
    } catch (e) {
      console.warn(`[FL-SCOUT] Error for project ${project.id}: ${e.message}`);
      skipped++;
    }
  }

  console.log(`[FL-SCOUT] Scout run complete: ${sent} sent, ${skipped} skipped`);
  return { sent, skipped, projectsFound: projects.length };
}

// Stats for dashboard
async function getScoutStats() {
  await ensureTables();
  const [total, replied, recent] = await Promise.all([
    db.query(`SELECT COUNT(*) AS c FROM fl_scout_sent`),
    db.query(`SELECT COUNT(*) AS c FROM fl_scout_sent WHERE replied=TRUE`),
    db.query(`SELECT project_id, title, sent_at, replied FROM fl_scout_sent ORDER BY sent_at DESC LIMIT 20`),
  ]);
  return {
    totalScouted: parseInt(total.rows[0].c),
    totalReplied:  parseInt(replied.rows[0].c),
    replyRate:     total.rows[0].c > 0 ? Math.round((replied.rows[0].c / total.rows[0].c) * 100) : 0,
    recent:        recent.rows,
  };
}

module.exports = { runFreelancerScout, getScoutStats, ensureTables };
