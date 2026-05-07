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

// ── Outreach stats persistence ───────────────────────────────────────────────
const OUTREACH_STATS_FILE = path.join(__dirname, '../../data/outreach-stats.json');

function loadOutreachStats() {
  try {
    if (!fs.existsSync(path.dirname(OUTREACH_STATS_FILE))) {
      fs.mkdirSync(path.dirname(OUTREACH_STATS_FILE), { recursive: true });
    }
    if (fs.existsSync(OUTREACH_STATS_FILE)) {
      const saved = JSON.parse(fs.readFileSync(OUTREACH_STATS_FILE, 'utf8'));
      // Only restore sentToday if it's the same calendar day
      const today = new Date().toDateString();
      return {
        sentToday:        saved.todayDate === today ? (parseInt(saved.sentToday) || 0) : 0,
        sentThisSession:  0,                  // always resets on restart — that's intentional
        todayDate:        today,
      };
    }
  } catch { /* start fresh */ }
  return { sentToday: 0, sentThisSession: 0, todayDate: new Date().toDateString() };
}

function saveOutreachStats(stats) {
  try {
    // Preserve existing per-provider buckets then update the active provider bucket
    // using the email-outreach module's OWN counter (not the agent's aggregate counter)
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(OUTREACH_STATS_FILE, 'utf8')); } catch {}
    const providerStats = emailOutreach.getDailyStats ? emailOutreach.getDailyStats() : null;
    const provider      = providerStats?.mode || 'gmail';
    const providerSent  = providerStats?.sent ?? stats.sentToday;
    fs.writeFileSync(OUTREACH_STATS_FILE, JSON.stringify({
      ...existing,
      sentToday:  stats.sentToday,      // agent aggregate (for backward compat)
      todayDate:  stats.todayDate,
      provider,
      savedAt:    new Date().toISOString(),
      [provider]: { sentToday: providerSent, todayDate: stats.todayDate },
    }, null, 2), 'utf8');
  } catch { /* silently skip */ }
}

const { v4: uuidv4 } = require('uuid');
const db         = require('../db');
const auditLogger = require('./audit-logger');
const emailOutreach  = require('./email-outreach');
const autoPricing    = require('./auto-pricing');
const aiProcessor    = require('./ai-job-processor');
const gmailReader    = require('./gmail-reader');
const jobSearch      = require('./job-search');
const webScraper     = require('./web-scraper');
const emailAnalytics = require('./email-analytics');

const SERPAPI_KEY = process.env.SERPAPI_KEY || '';
const APP_URL     = process.env.APP_URL || 'https://your-app.replit.app';
const AI_WORKER_ID = 0; // sentinel: sub_id=0 means the AI Worker

// SerpAPI rate-limit cooldown — set when a 429 is received; cleared after 1 hour
let _serpApiCooledUntil = 0; // epoch ms
function isSerpApiCooling() { return Date.now() < _serpApiCooledUntil; }
function serpApiRateLimit() {
  _serpApiCooledUntil = Date.now() + 60 * 60 * 1000; // 1-hour cooldown
  console.warn('⚠️ [SERPAPI] Rate limit hit — pausing all searches for 1 hour');
}

// ── BPO lead search queries ────────────────────────────────────────────────
// TARGET: companies that HIRE outsourcing (law firms, accountants, clinics, e-commerce, real estate)
// NOT: BPO companies themselves
const LEAD_QUERIES = [
  // ══ PRIORITY 1: Law firms — high-value, heavy admin burden ════════════════
  { q: 'law firm "contact us" South Africa "data entry" OR "document" OR "admin" -site:linkedin.com', type: 'document-processing' },
  { q: 'attorney "contact us" South Africa office admin -site:linkedin.com -site:indeed.com', type: 'document-processing' },
  { q: '"legal firm" "contact us" UK OR USA "document processing" OR "data entry"', type: 'document-processing' },
  { q: 'law firm "contact us" UK "admin support" OR "back office" -site:linkedin.com', type: 'document-processing' },
  { q: 'solicitors "contact us" UK "admin" OR "document" -site:linkedin.com', type: 'document-processing' },

  // ══ PRIORITY 2: Accounting & finance firms ════════════════════════════════
  { q: 'accounting firm "contact us" South Africa "data entry" OR "bookkeeping" -site:linkedin.com', type: 'finance-admin' },
  { q: '"chartered accountant" "contact us" South Africa -site:linkedin.com', type: 'finance-admin' },
  { q: 'bookkeeping company "contact us" South Africa OR UK -site:linkedin.com', type: 'finance-admin' },
  { q: '"accounts payable" "contact us" company South Africa -site:linkedin.com', type: 'finance-admin' },
  { q: 'payroll company "contact us" South Africa small business -site:linkedin.com', type: 'finance-admin' },

  // ══ PRIORITY 3: Medical & healthcare (transcription + data entry) ══════════
  { q: 'medical practice "contact us" South Africa "admin" OR "records" -site:linkedin.com', type: 'transcription' },
  { q: 'GP practice "contact us" South Africa -site:linkedin.com -site:healthsites.za', type: 'transcription' },
  { q: 'dental practice "contact us" South Africa "admin" -site:linkedin.com', type: 'transcription' },
  { q: 'private clinic "contact us" South Africa "patient records" OR "admin" -site:linkedin.com', type: 'transcription' },
  { q: 'healthcare provider "contact us" UK "medical transcription" OR "admin support"', type: 'transcription' },

  // ══ PRIORITY 4: E-commerce & retail (data entry, product listings, support) ═
  { q: 'e-commerce store "contact us" South Africa "product data" OR "catalogue" -site:linkedin.com', type: 'data-entry' },
  { q: 'online shop "contact us" South Africa -site:linkedin.com -site:takealot.com', type: 'data-entry' },
  { q: '"ecommerce" "contact us" South Africa "customer support" OR "data" -site:linkedin.com', type: 'customer-support' },
  { q: 'online retailer "contact us" UK "product listings" OR "data entry" -site:linkedin.com', type: 'data-entry' },
  { q: 'shopify store owner "contact us" South Africa -site:linkedin.com', type: 'data-entry' },

  // ══ PRIORITY 5: Real estate agencies ══════════════════════════════════════
  { q: 'real estate agency "contact us" South Africa "admin" OR "listings" -site:linkedin.com', type: 'document-processing' },
  { q: 'property management company "contact us" South Africa -site:linkedin.com', type: 'document-processing' },
  { q: '"estate agent" "contact us" South Africa "admin support" -site:linkedin.com', type: 'document-processing' },
  { q: 'real estate "contact us" UK "virtual assistant" OR "admin" -site:linkedin.com', type: 'virtual-assistant' },

  // ══ PRIORITY 6: SMEs with admin-heavy operations ══════════════════════════
  { q: 'insurance broker "contact us" South Africa -site:linkedin.com -site:indeed.com', type: 'finance-admin' },
  { q: 'logistics company "contact us" South Africa "data entry" OR "tracking" -site:linkedin.com', type: 'data-entry' },
  { q: 'recruitment agency "contact us" South Africa "admin" OR "CV" -site:linkedin.com', type: 'virtual-assistant' },
  { q: 'marketing agency "contact us" South Africa "content" OR "social media" -site:linkedin.com', type: 'social-media' },
  { q: 'consulting firm "contact us" South Africa "admin support" OR "back office" -site:linkedin.com', type: 'virtual-assistant' },
  { q: '"financial advisor" "contact us" South Africa -site:linkedin.com', type: 'finance-admin' },

  // ══ PRIORITY 7: UK/USA SME targets ════════════════════════════════════════
  { q: 'small business "contact us" UK "data entry" OR "admin support" outsource -site:linkedin.com', type: 'data-entry' },
  { q: 'startup "contact us" UK "virtual assistant" OR "admin" -site:linkedin.com', type: 'virtual-assistant' },
  { q: '"need help with admin" OR "looking for admin support" company UK -site:linkedin.com', type: 'virtual-assistant' },
  { q: 'mortgage broker "contact us" UK "admin" OR "document" -site:linkedin.com', type: 'document-processing' },
  { q: 'financial services "contact us" UK "back office" OR "admin" small firm -site:linkedin.com', type: 'finance-admin' },

  // ══ PRIORITY 8: Companies actively looking to outsource ══════════════════
  { q: '"looking to outsource" "admin" OR "data entry" "contact" -site:linkedin.com', type: 'data-entry' },
  { q: '"need to outsource" OR "want to outsource" "contact us" -site:linkedin.com', type: 'general' },
  { q: '"hire virtual assistant" "contact us" company -site:linkedin.com -site:fiverr.com', type: 'virtual-assistant' },
  { q: '"outsource admin" OR "outsource data entry" "small business" "contact" -site:linkedin.com', type: 'data-entry' },
  { q: '"reduce admin costs" OR "cut admin costs" company "contact us" -site:linkedin.com', type: 'general' },
];

// ── Known competitor domains (for intel & displacement outreach) ───────────
const COMPETITOR_DOMAINS = [
  'helpware.com', 'softtek.com', 'suntecindia.com', 'uniquesdata.com',
  'labelyourdata.com', 'oworkers.com', 'perfectdataentry.com', 'tabservice.com',
  'techspeed.com', 'insigniaresources.com', 'obiservices.com',
  'unity-connect.com', 'remotecoworker.com', 'ardem.com',
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

// ── Email circuit breaker — stops all sends if Gmail locks out ───────────────
// Activated by 454-4.7.0 (too many attempts) or 535-5.7.8 (bad credentials).
// Pauses for CIRCUIT_PAUSE_MS then auto-resets.
const CIRCUIT_PAUSE_MS = 60 * 60 * 1000; // 1 hour
const emailCircuit = {
  open:        false,   // true = paused
  failures:    0,
  pausedUntil: null,
};

function circuitTrip(errMsg, pauseMs) {
  // Daily-limit errors trip immediately on 1st failure; auth errors need 2
  const isDailyLimit = /5\.4\.5|sending limit|Daily user/i.test(errMsg || '');
  emailCircuit.failures++;
  const threshold = isDailyLimit ? 1 : 2;
  if (emailCircuit.failures >= threshold && !emailCircuit.open) {
    // Daily limit: pause until 01:00 UTC tomorrow so quota resets
    if (isDailyLimit) {
      const tomorrow = new Date();
      tomorrow.setUTCHours(25, 0, 0, 0); // next day 01:00 UTC
      emailCircuit.pausedUntil = tomorrow.getTime();
      console.warn(`🚫 [EMAIL CIRCUIT] Daily Gmail limit hit — pausing outreach until 01:00 UTC tomorrow`);
      logActivity('email_circuit', `Gmail daily limit reached — pausing until 01:00 UTC tomorrow`, null, null, 'error').catch(() => {});
    } else {
      emailCircuit.pausedUntil = Date.now() + (pauseMs || CIRCUIT_PAUSE_MS);
      console.warn(`🚫 [EMAIL CIRCUIT] Tripped after ${emailCircuit.failures} auth failures — pausing ALL outreach for 1 hour`);
      logActivity('email_circuit', `Gmail auth circuit tripped — pausing outreach for 1 hour`, null, null, 'error').catch(() => {});
    }
    emailCircuit.open = true;
  }
}

function circuitCheck() {
  if (!emailCircuit.open) return true;
  if (Date.now() > emailCircuit.pausedUntil) {
    emailCircuit.open     = false;
    emailCircuit.failures = 0;
    console.log('✅ [EMAIL CIRCUIT] Pause lifted — resuming outreach');
    return true;
  }
  const minLeft = Math.ceil((emailCircuit.pausedUntil - Date.now()) / 60000);
  const hLeft   = (minLeft / 60).toFixed(1);
  if (minLeft % 30 === 0 || minLeft < 5) { // only log occasionally to reduce noise
    console.log(`⏳ [EMAIL CIRCUIT] Open — ${hLeft}h remaining, skipping outreach`);
  }
  return false;
}

function isAuthError(err) {
  return /454|535|5\.4\.5|Too many login|Username and Password|Invalid login|sending limit|Daily user/i.test(err.message || '');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Live stats — updated in real-time by scraper callbacks + outreach
const _restoredOutreach = loadOutreachStats();
const liveStats = {
  outreach: {
    active: false,
    lastSentTo: null,
    lastSentAt: null,
    sentThisSession: 0,                          // always starts at 0 — counts only this session
    sentToday:  _restoredOutreach.sentToday,     // restored from disk — survives restarts
    todayDate:  _restoredOutreach.todayDate,
  },
  db: {
    ai_leads:         { total: 0, pending: 0 },
    job_leads:        { total: 0, pending: 0 },
    scraped_contacts: { total: 0, pending: 0 },
    grand_total: 0,
    lastRefresh: null,
  },
};

// Reset daily counters at midnight and persist the rollover
function checkDailyReset() {
  const today = new Date().toDateString();
  if (today !== liveStats.outreach.todayDate) {
    liveStats.outreach.sentToday  = 0;
    liveStats.outreach.todayDate  = today;
    saveOutreachStats(liveStats.outreach);
  }
}

// Refresh DB volumes (called every 15s) — all counters sourced directly from DB
async function refreshDbStats() {
  try {
    const [a, j, s, eAll, eToday] = await Promise.all([
      db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='new') AS pending FROM ai_leads`).catch(() => ({ rows: [{ total: 0, pending: 0 }] })),
      db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='new' OR status='pending') AS pending FROM job_leads`).catch(() => ({ rows: [{ total: 0, pending: 0 }] })),
      db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='new') AS pending FROM scraped_contacts`).catch(() => ({ rows: [{ total: 0, pending: 0 }] })),
      db.query(`SELECT COUNT(*) AS total FROM ai_activity_log WHERE action_type IN ('email_sent','scrape_outreach','prospect_outreach') AND status='success' AND target_id IS NOT NULL`).catch(() => ({ rows: [{ total: 0 }] })),
      db.query(`SELECT COUNT(*) AS total FROM ai_activity_log WHERE action_type IN ('email_sent','scrape_outreach','prospect_outreach') AND status='success' AND target_id IS NOT NULL AND created_at >= CURRENT_DATE`).catch(() => ({ rows: [{ total: 0 }] })),
    ]);
    liveStats.db.ai_leads           = { total: parseInt(a.rows[0].total) || 0, pending: parseInt(a.rows[0].pending) || 0 };
    liveStats.db.job_leads          = { total: parseInt(j.rows[0].total) || 0, pending: parseInt(j.rows[0].pending) || 0 };
    liveStats.db.scraped_contacts   = { total: parseInt(s.rows[0].total) || 0, pending: parseInt(s.rows[0].pending) || 0 };
    liveStats.db.grand_total        = liveStats.db.ai_leads.total + liveStats.db.job_leads.total + liveStats.db.scraped_contacts.total;
    liveStats.db.totalEmailsAllTime = parseInt(eAll.rows[0].total) || 0;
    liveStats.db.sentToday          = parseInt(eToday.rows[0].total) || 0;
    liveStats.db.lastRefresh        = new Date().toISOString();
    // Keep outreach.sentToday in sync with the authoritative DB value
    liveStats.outreach.sentToday    = liveStats.db.sentToday;
  } catch { /* silently skip */ }
}

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
      bounced_at       TIMESTAMPTZ,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Migration: add bounced_at if it doesn't exist yet
  await db.query(`ALTER TABLE ai_leads ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ`).catch(() => {});

  // Ensure job_leads follow-up tracking columns exist
  await jobSearch.ensureTable();
  await db.query(`ALTER TABLE job_leads ADD COLUMN IF NOT EXISTS followup1_sent_at TIMESTAMPTZ`).catch(() => {});
  await db.query(`ALTER TABLE job_leads ADD COLUMN IF NOT EXISTS followup2_sent_at TIMESTAMPTZ`).catch(() => {});

  // scraped_contacts — multi-source web scraper results
  await webScraper.ensureTable();

  // job_seeker_leads — people seeking remote/BPO work to recruit as subcontractors
  await db.query(`
    CREATE TABLE IF NOT EXISTS job_seeker_leads (
      id               SERIAL PRIMARY KEY,
      name             TEXT,
      email            TEXT UNIQUE,
      domain           TEXT,
      source_url       TEXT,
      snippet          TEXT,
      status           TEXT DEFAULT 'new',
      outreach_sent_at TIMESTAMPTZ,
      bounced_at       TIMESTAMPTZ,
      created_at       TIMESTAMPTZ DEFAULT NOW()
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

// Only two real prefixes — reduces bounces and avoids hitting BPO company support desks
const EMAIL_PREFIXES = ['info', 'contact'];

// ── Comprehensive BPO provider / competitor filter ─────────────────────────
// These are companies that SELL BPO services — NOT potential clients.
// Emailing them is a complete waste and hurts sender reputation.
const AGENT_BPO_DOMAINS = new Set([
  'wow24-7.com','wowcustomersupport.com','wishup.co','wervas.com','waywithwords.net',
  'vservesolution.com','voicescript.ai','vitalitybss.com','virtualeases.com',
  'velan-virtualassistants.com','workstaff360.com','wizscribe.com',
  'zenius.co','zeni.ai','ziloservices.com','zydoc.com','yourccsteam.com',
  'transcriptionhub.com','vocal.media','vitalrecordscontrol.com',
  'accenture.com','teleperformance.com','concentrix.com','genpact.com','wipro.com',
  'cognizant.com','infosys.com','tcs.com','capgemini.com','ibm.com','atos.net',
  'sitel.com','taskus.com','supportninja.com','helpware.com','influx.com',
  'magellan-solutions.com','tcwglobal.com','bruntwork.co','auxis.com','ardem.com',
  'bigoutsource.com','outsourcely.com','datamatics.com','hexaware.com',
  'firstsource.com','exlservice.com','wns.com','startek.com','sutherland.com',
  'ttec.com','conduent.com','invensis.net','myoutdesk.com','belay.com',
  'uassist.me','ossisto.com','iworker.com','delegated.com','prialto.com',
  'woodbows.com','timeetc.com','getfriday.com','24task.com','1840andco.com',
  'youtube.com','facebook.com','twitter.com','instagram.com','linkedin.com',
  'google.com','yelp.com','yellowpages.com','reddit.com','wikipedia.org',
]);

const AGENT_BPO_KEYWORDS = [
  'outsourc','bpo','callcenter','callcentre','virtual-assistant','virtualassist',
  'remoteteam','staffoutsourc','transcription-service','translation-service',
  'dataentry-service','offshoring','nearshore','officebeacon','backoffice-service',
];

function isAgentBpoProvider(domain) {
  if (!domain) return false;
  if (AGENT_BPO_DOMAINS.has(domain.toLowerCase())) return true;
  const d = domain.toLowerCase();
  return AGENT_BPO_KEYWORDS.some(kw => d.includes(kw));
}

function buildContactEmail(domain) {
  if (!domain) return null;
  return `info@${domain}`;
}

function buildEmailVariants(domain) {
  if (!domain) return [];
  return EMAIL_PREFIXES.map(p => `${p}@${domain}`);
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

  // Skip entire cycle if we're in the SerpAPI cooldown window
  if (isSerpApiCooling()) {
    const minsLeft = Math.ceil((_serpApiCooledUntil - Date.now()) / 60000);
    console.log(`⏳ [SERPAPI] Still cooling — ${minsLeft}m left, skipping lead search`);
    return;
  }

  const queries = LEAD_QUERIES;
  let newLeads = 0;
  let queried = 0;
  let consecutive429 = 0;

  for (const { q, type } of queries) {
    try {
      const resp = await axios.get('https://serpapi.com/search.json', {
        params: { q, api_key: SERPAPI_KEY, num: 100, hl: 'en', gl: 'za' },
        timeout: 15000,
      });
      consecutive429 = 0; // reset on success
      queried++;

      const results = resp.data?.organic_results || [];

      for (const r of results) {
        const url = r.link;
        if (!url) continue;

        const domain = extractDomain(url);
        if (!domain) continue;

        // Skip BPO service providers — we want clients, not competitors
        if (isAgentBpoProvider(domain)) continue;

        const emailFromSnippet = extractEmailFromText(r.snippet) || extractEmailFromText(r.title);

        const emailsToTry = emailFromSnippet
          ? [emailFromSnippet]
          : buildEmailVariants(domain);

        for (let i = 0; i < emailsToTry.length; i++) {
          const contactEmail = emailsToTry[i];
          const variantUrl = i === 0 ? url : `${url}#${EMAIL_PREFIXES[i]}`;
          try {
            const ins = await db.query(
              `INSERT INTO ai_leads (title, company, source_url, domain, contact_email, job_type, snippet, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'new')
               ON CONFLICT (source_url) DO NOTHING
               RETURNING id`,
              [r.title || 'BPO Lead', domain, variantUrl, domain, contactEmail, type, r.snippet || '']
            );
            if (ins.rows.length > 0) {
              newLeads++;
              agentState.totalLeadsFound++;
            }
          } catch (_) { /* duplicate — skip silently */ }
        }
      }
    } catch (err) {
      const is429 = err?.response?.status === 429 || err?.message?.includes('429');
      if (is429) {
        consecutive429++;
        if (consecutive429 >= 2) {
          // SerpAPI daily quota exhausted — bail out, set 1-hour cooldown, log once
          serpApiRateLimit();
          await logActivity('lead_search',
            `SerpAPI rate limit hit after ${queried} queries — pausing searches for 1 hour`,
            null, null, 'warning', { queriedSoFar: queried, newLeads });
          agentState.lastLeadSearch = new Date().toISOString();
          return;
        }
        // 1 consecutive 429: silently skip, try next query
        continue;
      }
      // Non-rate-limit error: log it but keep going
      console.error(`[LEAD SEARCH] Query error: ${err.message}`);
    }
  }

  agentState.lastLeadSearch = new Date().toISOString();
  await logActivity('lead_search',
    `Searched ${queried} queries — ${newLeads} new leads found`,
    null, null, 'success', { newLeads, queries: queries.map(q => q.type) });
}

// ── 2. Send Cold Outreach to Lead ─────────────────────────────────────────
async function sendLeadOutreach(leadId, prospect) {
  if (!circuitCheck()) return null;
  try {
    if (prospect.email) {
      const bounceCheck = await db.query(
        `SELECT id FROM ai_leads WHERE LOWER(contact_email)=LOWER($1) AND bounced_at IS NOT NULL LIMIT 1`,
        [prospect.email]
      ).catch(() => ({ rows: [] }));
      if (bounceCheck.rows.length > 0) {
        await db.query(`UPDATE ai_leads SET status='bounced', bounced_at=NOW(), updated_at=NOW() WHERE id=$1 AND bounced_at IS NULL`, [leadId]).catch(() => {});
        return null;
      }
    }
    const result = await emailOutreach.sendClientColdOutreach(prospect);
    if (!result || result.sent === false) {
      if (result?.skipped) return null; // daily cap or paused
      if (result?.allProvidersBroken) return { allProvidersBroken: true }; // signal to break batch
      await logActivity('email_sent', `Provider rejected send → ${prospect.email}`, 'lead', leadId, 'error');
      return null;
    }
    emailCircuit.failures = 0; // reset on success
    await db.query(
      `UPDATE ai_leads SET status='outreach_sent', outreach_sent_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [leadId]
    );
    agentState.totalEmailsSent++;
    checkDailyReset();
    liveStats.outreach.sentThisSession++;
    liveStats.outreach.sentToday++;
    liveStats.outreach.lastSentTo  = prospect.email;
    liveStats.outreach.lastSentAt  = new Date().toISOString();
    saveOutreachStats(liveStats.outreach);
    await logActivity('email_sent', `Cold outreach → ${prospect.email} [${prospect.jobType}]`, 'lead', leadId, 'success', { to: prospect.email, type: prospect.jobType });
    return result;
  } catch (err) {
    if (isAuthError(err)) {
      circuitTrip(err.message);
      // Mark lead as failed so it won't be retried on the next cycle
      await db.query(`UPDATE ai_leads SET status='email_failed', updated_at=NOW() WHERE id=$1`, [leadId]).catch(() => {});
      // Circuit-trip event is already logged inside circuitTrip(); don't spam activity log
      console.error(`[EMAIL] Auth fail for ${prospect.email}: ${err.message}`);
    } else {
      // Non-auth failure (transient) — log it but don't mark lead, allow retry
      await logActivity('email_sent', `Failed to send to ${prospect.email}: ${err.message}`, 'lead', leadId, 'error');
    }
  }
}

// ── 2b. Batch outreach to ai_leads — ONE per domain, max 10 per run ──────────
async function runAiLeadOutreach() {
  if (!circuitCheck()) return;
  if (emailOutreach.areAllProvidersBroken()) {
    console.log('[OUTREACH] All email providers down — skipping ai_leads batch');
    return;
  }

  // DISTINCT ON domain — newest leads first (Clutch/OA scrapes go to head of queue)
  const newLeads = await db.query(`
    SELECT * FROM (
      SELECT DISTINCT ON (domain) id, contact_email, company, domain, job_type, created_at
      FROM ai_leads
      WHERE status = 'new'
        AND contact_email IS NOT NULL
        AND bounced_at IS NULL
        AND domain IS NOT NULL
      ORDER BY domain, created_at DESC
    ) newest
    ORDER BY created_at DESC
    LIMIT 10
  `).catch(() => ({ rows: [] }));

  if (newLeads.rows.length === 0) return;

  let sent = 0;
  for (const lead of newLeads.rows) {
    if (!circuitCheck()) break;
    const result = await sendLeadOutreach(lead.id, {
      name:    lead.company || lead.domain,
      company: lead.company || lead.domain,
      email:   lead.contact_email,
      jobType: lead.job_type || 'business process outsourcing',
    });
    if (result?.allProvidersBroken) {
      console.log('[OUTREACH] All providers broken — stopping ai_leads batch early, leads will retry next cycle');
      break;
    }
    if (result) {
      sent++;
      // Mark ALL same-domain ai_leads as outreach_sent
      await db.query(
        `UPDATE ai_leads SET status='outreach_sent', outreach_sent_at=NOW(), updated_at=NOW() WHERE domain=$1 AND status='new'`,
        [lead.domain]
      ).catch(() => {});
    }
    await sleep(4000); // 4s between emails — stays well under Gmail rate limits
  }
  if (sent > 0) {
    await logActivity('ai_outreach', `Batch outreach: sent ${sent} emails from ai_leads`, null, null, 'success', { sent });
  }
}

// ── 2c. Web Scraper — multi-source lead discovery ─────────────────────────
async function runWebScraper() {
  try {
    const inserted = await webScraper.runAllScrapers();
    agentState.totalLeadsFound += inserted;
    await logActivity('web_scrape', `Multi-source scrape complete — ${inserted} new contacts stored`, null, null, 'success', { inserted });
  } catch (e) {
    await logActivity('web_scrape', `Scraper error: ${e.message}`, null, null, 'error');
  }
}

// ── BPO relevance regex — at least one signal required before outreach ──────
const BPO_RELEVANCE_RE = /(outsourc|data.?entr|data.?captur|transcri|translat|virtual.?assist|back.?offic|document.?process|invoice.?process|payroll|medical.?bill|claims.?process|accounts.?payable|digitiz|digitisa|bookkeep|bpo|content.?moderat|speech.?to.?text|record.?manag|data.?migrat|hr.?admin|legal.?transcri|remote.?admin)/i;

// Business types from Google Places that are HIGH-VALUE BPO prospects
const HIGH_VALUE_TYPES = new Set([
  'law firm', 'medical clinic', 'dental practice', 'accounting firm',
  'insurance company', 'financial services company', 'healthcare company',
  'pharmaceutical company', 'recruitment agency', 'it services company',
  'logistics company', 'management consulting firm', 'hr consulting firm',
  'property management company',
]);

function isContactRelevant(c) {
  // CSE / DDG / SerpAPI queries are already BPO-targeted — always eligible
  if (['google_cse', 'duckduckgo', 'serpapi_bpo'].includes(c.source)) return true;
  // Google Places: check snippet/query or high-value type
  const haystack = `${c.snippet||''} ${c.query_used||''} ${c.business_type||''}`;
  if (BPO_RELEVANCE_RE.test(haystack)) return true;
  if (HIGH_VALUE_TYPES.has((c.business_type||'').toLowerCase())) return true;
  return false;
}

// ── 2d. Batch outreach to scraped_contacts ────────────────────────────────
// ONE email per company domain, relevance-gated, marks ALL domain rows contacted.
async function runScrapedContactsOutreach() {
  if (!circuitCheck()) return;
  if (emailOutreach.areAllProvidersBroken()) {
    console.log('[OUTREACH] All email providers down — skipping scraped_contacts batch');
    return;
  }

  // ── Bounce-rate guard — protect sender reputation ─────────────────────────
  // If more than 15% of sent contacts have bounced, pause outreach and alert
  const bounceStats = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('contacted','followup1_sent','followup2_sent','replied','converted','bounced')) AS total_sent,
      COUNT(*) FILTER (WHERE status = 'bounced' OR bounced_at IS NOT NULL) AS total_bounced
    FROM scraped_contacts
  `).catch(() => null);
  if (bounceStats) {
    const totalSent    = parseInt(bounceStats.rows[0]?.total_sent   || 0);
    const totalBounced = parseInt(bounceStats.rows[0]?.total_bounced || 0);
    const bounceRate   = totalSent > 50 ? totalBounced / totalSent : 0;
    if (bounceRate > 0.15) {
      const pct = (bounceRate * 100).toFixed(1);
      console.warn(`🚫 [OUTREACH] Bounce rate ${pct}% exceeds 15% — pausing scraped_contacts outreach to protect sender reputation`);
      await logActivity('scrape_outreach', `Paused: bounce rate ${pct}% (${totalBounced}/${totalSent}) exceeds 15% safety threshold`, 'system', null, 'warning');
      return;
    }
  }

  // Pick ONE representative contact per domain (prefer info@ then contact@)
  // Only look at domains not yet outreached
  // Newest domains first — contacts from latest Clutch/OA scrapes go to head of queue
  const rows = await db.query(`
    SELECT * FROM (
      SELECT DISTINCT ON (domain)
        id, company, email, domain, business_type, city, country, source,
        snippet, query_used, mx_verified, prospect_score, created_at
      FROM scraped_contacts
      WHERE status = 'new'
        AND email IS NOT NULL
        AND bounced_at IS NULL
        AND domain IS NOT NULL
        AND (mx_verified IS NULL OR mx_verified = TRUE)
      ORDER BY domain,
        CASE WHEN email LIKE 'info@%' THEN 0
             WHEN email LIKE 'contact@%' THEN 1
             ELSE 2 END,
        created_at DESC
    ) newest
    ORDER BY COALESCE(prospect_score, 0) DESC, created_at DESC
    LIMIT 20
  `).catch(() => ({ rows: [] }));

  if (rows.rows.length === 0) return;

  let sent = 0;
  for (const c of rows.rows) {
    try {
      // Relevance gate — skip companies with no BPO need signals
      if (!isContactRelevant(c)) {
        // Mark ALL emails for this domain as irrelevant so we skip them next time
        await db.query(
          `UPDATE scraped_contacts SET status='irrelevant', updated_at=NOW() WHERE domain=$1`,
          [c.domain]
        ).catch(() => {});
        console.log(`⏭️  [OUTREACH] Skipping ${c.domain} — no BPO relevance signal`);
        continue;
      }

      if (!circuitCheck()) break;
      // ── AI Price Negotiator: detect service, build competitive quote, send proposal ──
      const proposal = autoPricing.autoPricingProposal({
        name:         c.company || c.domain,
        company:      c.company || c.domain,
        email:        c.email,
        businessType: c.business_type || '',
        jobType:      '',
        city:         c.city || null,
        country:      c.country || null,
      });
      const sendResult = await emailOutreach.sendMail({
        to:      c.email,
        subject: proposal.subject,
        text:    proposal.text,
        html:    proposal.html,
      });
      if (!sendResult || sendResult.sent === false) {
        if (sendResult?.allProvidersBroken) {
          console.log('[OUTREACH] All providers broken — stopping scraped_contacts batch early');
          break;
        }
        if (sendResult?.skipped) break; // daily cap
        await logActivity('scrape_outreach', `Provider rejected send → ${c.email}`, 'scraped_contact', c.id, 'error');
        continue;
      }
      emailCircuit.failures = 0;
      console.log(`💰 [PRICE] Auto-proposal sent to ${c.email} [${proposal.serviceName}] @ ${(proposal.quote.ourRate).toFixed(2)} ${proposal.quote.svc.unitLabel}`);

      // Mark the sent email with outreach_sent_at (used by follow-up to reach same person)
      await db.query(
        `UPDATE scraped_contacts SET status='contacted', outreach_sent_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [c.id]
      );
      // Mark ALL OTHER emails for this domain as 'contacted' WITHOUT outreach_sent_at
      // so they're skipped in future runs but don't trigger duplicate follow-ups
      await db.query(
        `UPDATE scraped_contacts SET status='contacted', updated_at=NOW() WHERE domain=$1 AND id!=$2 AND status='new'`,
        [c.domain, c.id]
      ).catch(() => {});
      agentState.totalEmailsSent++;
      sent++;
      checkDailyReset();
      liveStats.outreach.sentThisSession++;
      liveStats.outreach.sentToday++;
      liveStats.outreach.lastSentTo  = c.email;
      liveStats.outreach.lastSentAt  = new Date().toISOString();
      liveStats.outreach.active      = true;
      saveOutreachStats(liveStats.outreach);
      await logActivity('scrape_outreach', `Outreach → ${c.email} [${c.business_type || 'BPO'}]`, 'scraped_contact', c.id, 'success', { to: c.email });
      await sleep(4000); // 4s between emails
    } catch (err) {
      if (isAuthError(err)) {
        circuitTrip(err.message);
        console.error(`[EMAIL] Auth fail (scrape) for ${c.email}: ${err.message}`);
        break; // stop the batch — circuit is now open
      }
      // Detect permanent SMTP bounce (5xx) — mark contact so AI never tries again
      const code = err.responseCode || err.code || 0;
      const msg  = (err.message || '').toLowerCase();
      const isPermanent = code >= 500 ||
        /550|551|552|553|554|user unknown|does not exist|invalid address|mailbox not found|no such user|address rejected/.test(msg);
      if (isPermanent) {
        console.warn(`[OUTREACH] Permanent bounce → ${c.email}: ${err.message}`);
        await db.query(
          `UPDATE scraped_contacts SET status='bounced', bounced_at=NOW(), updated_at=NOW() WHERE email=$1`,
          [c.email]
        ).catch(() => {});
        await logActivity('scrape_outreach', `Permanent bounce → ${c.email}`, 'scraped_contact', c.id, 'warning');
      } else {
        await logActivity('scrape_outreach', `Failed → ${c.email}: ${err.message}`, 'scraped_contact', c.id, 'error');
      }
    }
  }

  if (sent > 0) {
    await logActivity('scrape_outreach', `Batch outreach: sent ${sent} emails from scraped_contacts`, null, null, 'success', { sent });
  }
}

// ── 2e. Follow-up sequence for scraped_contacts ───────────────────────────
// ONE follow-up per domain — uses the same contact that received the cold email
async function runScrapedContactsFollowUps() {
  // Day-3 follow-up: pick ONE contact per domain (the one we emailed — outreach_sent_at IS NOT NULL)
  const day3 = await db.query(`
    SELECT DISTINCT ON (domain) id, email, company, business_type, domain
    FROM scraped_contacts
    WHERE status = 'contacted'
      AND outreach_sent_at IS NOT NULL
      AND outreach_sent_at < NOW() - INTERVAL '3 days'
      AND followup1_sent_at IS NULL
      AND bounced_at IS NULL
      AND domain IS NOT NULL
    ORDER BY domain, outreach_sent_at ASC
    LIMIT 20
  `).catch(() => ({ rows: [] }));

  for (const c of day3.rows) {
    try {
      await emailOutreach.sendClientFollowUp({ email: c.email, company: c.company, jobType: c.business_type, followUpNumber: 1 });
      // Mark ALL same-domain rows so no other address gets a follow-up
      await db.query(
        `UPDATE scraped_contacts SET followup1_sent_at=NOW(), status='followup1', updated_at=NOW() WHERE domain=$1`,
        [c.domain]
      );
      agentState.totalEmailsSent++;
    } catch {}
  }

  // Day-7 follow-up
  const day7 = await db.query(`
    SELECT DISTINCT ON (domain) id, email, company, business_type, domain
    FROM scraped_contacts
    WHERE status = 'followup1'
      AND followup1_sent_at IS NOT NULL
      AND followup1_sent_at < NOW() - INTERVAL '4 days'
      AND followup2_sent_at IS NULL
      AND bounced_at IS NULL
      AND domain IS NOT NULL
    ORDER BY domain, followup1_sent_at ASC
    LIMIT 20
  `).catch(() => ({ rows: [] }));

  for (const c of day7.rows) {
    try {
      await emailOutreach.sendClientFollowUp({ email: c.email, company: c.company, jobType: c.business_type, followUpNumber: 2 });
      await db.query(
        `UPDATE scraped_contacts SET followup2_sent_at=NOW(), status='followup2', updated_at=NOW() WHERE domain=$1`,
        [c.domain]
      );
      agentState.totalEmailsSent++;
    } catch {}
  }

  const total = day3.rows.length + day7.rows.length;
  if (total > 0) await logActivity('scrape_followup', `Sent ${total} follow-ups for scraped_contacts`);
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
      AND bounced_at IS NULL
    LIMIT 500
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
      AND bounced_at IS NULL
    LIMIT 500
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

// ── Helper: derive job type keyword from title ─────────────────────────────
function deriveJobType(title = '') {
  const t = title.toLowerCase();
  if (t.includes('data entry') || t.includes('data-entry')) return 'data-entry';
  if (t.includes('transcript'))  return 'transcription';
  if (t.includes('translat'))    return 'translation';
  if (t.includes('virtual assistant') || t.includes('va ')) return 'virtual-assistant';
  if (t.includes('finance') || t.includes('accounting') || t.includes('bookkeep')) return 'finance-admin';
  if (t.includes('moderat'))     return 'content-moderation';
  if (t.includes('customer') || t.includes('support')) return 'customer-support';
  if (t.includes('document') || t.includes('pdf'))     return 'document-processing';
  if (t.includes('social') || t.includes('media'))     return 'social-media';
  return 'general';
}

// ── 5. Auto-assign Outstanding Contracts (AI-first, then human) ───────────
async function assignContracts() {
  try { await db.query(`SELECT 1 FROM subcontractor_jobs LIMIT 1`); }
  catch { return; }

  const jobs = await db.query(`
    SELECT j.id, j.title, j.job_value, j.due_date, j.description, j.sub_payout
    FROM subcontractor_jobs j
    WHERE j.status = 'outstanding'
      AND NOT EXISTS (
        SELECT 1 FROM job_submissions js2
        JOIN subcontractor_jobs sj2 ON sj2.id = js2.job_id
        WHERE sj2.contract_id = j.contract_id
          AND j.contract_id IS NOT NULL
          AND js2.overdue_flagged_at IS NOT NULL
          AND js2.confirmed_at IS NULL
      )
    LIMIT 10
  `);

  for (const job of jobs.rows) {
    try {
      const jobType = deriveJobType(job.title);

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
      if (jobType && jobType !== 'general') {
        const subRes = await db.query(`
          SELECT id, name, email FROM subcontractor_applications
          WHERE status = 'approved' AND payment_confirmed = TRUE
            AND services::text ILIKE $1
          ORDER BY payment_confirmed_at DESC LIMIT 1
        `, [`%${jobType}%`]);
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
    SELECT j.id, j.title, j.description, j.sub_payout,
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
      const jobType = deriveJobType(job.title);

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
        `Service type: ${jobType}`,
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
          `SELECT al.contact_email AS email, al.company AS company_name
           FROM ai_leads al
           JOIN contracts c ON c.client_id = al.id
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
        const portalLink = `${appBase}/client/portal/${deliveryToken}`;
        await emailOutreach.sendClientDelivery(
          clientEmail, clientName, job.title,
          `${appBase}/api/sub/client-confirm/${deliveryToken}`,
          `${appBase}/api/sub/download/${sr.rows[0].id}`,
          portalLink
        ).catch(() => {});
        // WhatsApp notification to client
        try {
          const wa = require('./whatsapp-notifier');
          if (wa.isConfigured()) {
            const phoneR = await db.query(`SELECT phone FROM ai_leads al JOIN contracts c ON c.client_id=al.id::text::integer WHERE c.id=$1`, [job.contract_id]).catch(() => ({ rows:[] }));
            if (phoneR.rows[0]?.phone) {
              await wa.notifyClientDelivery({ phone: phoneR.rows[0].phone, clientName, jobTitle: job.title, confirmLink: portalLink }).catch(() => {});
            }
          }
        } catch {}
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
// ── Auto-purge bounced contacts ───────────────────────────────────────────
// Permanently deletes bounced records from both tables once 10+ accumulate.
// Keeps the database clean and stops bounce notifications filling the inbox.
const BOUNCE_PURGE_THRESHOLD = 10;

async function autoPurgeBounced() {
  try {
    // Count bounced records across both tables
    const [leadsCount, scCount] = await Promise.all([
      db.query(`SELECT COUNT(*) AS n FROM ai_leads        WHERE bounced_at IS NOT NULL OR status='bounced'`),
      db.query(`SELECT COUNT(*) AS n FROM scraped_contacts WHERE bounced_at IS NOT NULL OR status='bounced'`),
    ]);
    const totalLeadsBounced = parseInt(leadsCount.rows[0]?.n || 0);
    const totalScBounced    = parseInt(scCount.rows[0]?.n    || 0);
    const total = totalLeadsBounced + totalScBounced;

    if (total < BOUNCE_PURGE_THRESHOLD) return; // not enough to bother yet

    // Permanently delete them from both tables
    const [delLeads, delSc] = await Promise.all([
      db.query(`DELETE FROM ai_leads        WHERE bounced_at IS NOT NULL OR status='bounced'`),
      db.query(`DELETE FROM scraped_contacts WHERE bounced_at IS NOT NULL OR status='bounced'`),
    ]);
    const deletedLeads = delLeads.rowCount || 0;
    const deletedSc    = delSc.rowCount    || 0;
    const deletedTotal = deletedLeads + deletedSc;

    await logActivity(
      'bounce_process',
      `Auto-purged ${deletedTotal} bounced contacts (${deletedLeads} leads + ${deletedSc} scraped) — inbox kept clean`,
      'system', null, 'success'
    );
    console.log(`🗑️  [BOUNCE PURGE] Deleted ${deletedTotal} bounced records (threshold: ${BOUNCE_PURGE_THRESHOLD})`);
  } catch (e) {
    console.warn('[BOUNCE PURGE] Error:', e.message);
  }
}

async function runPaymentChase() {
  if (!db.isConnected()) return;

  const appBase = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.APP_URL || '');

  // Helper: get client email + name for a job via its contract_id → contracts → ai_leads
  async function getClientInfo(contractId) {
    if (!contractId) return null;
    try {
      // Try joining through contracts table first (proper path)
      const r = await db.query(
        `SELECT al.contact_email AS email, al.company AS name
         FROM ai_leads al
         JOIN contracts c ON c.client_id = al.id
         WHERE c.id = $1`,
        [contractId]
      );
      if (r.rows[0]) return r.rows[0];
      // Fallback: try treating contract_id as a direct job contract reference
      const r2 = await db.query(
        `SELECT al.contact_email AS email, al.company AS name
         FROM ai_leads al
         JOIN subcontractor_jobs sj ON sj.contract_id = al.id::text
         WHERE sj.id = $1`,
        [contractId]
      );
      return r2.rows[0] || null;
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

// ── 7. Scan for Client Prospects (job_leads) ──────────────────────────────
// Uses the improved BPO_QUERIES from job-search.js to find businesses that
// NEED BPO services (law firms, clinics, e-commerce, startups, etc.)
// ── 7b. Freelance Platform Job Scanner ────────────────────────────────────
// Finds LIVE jobs on Upwork, Freelancer.com, Guru, PeoplePerHour via SerpAPI.
// These buyers are ACTIVELY posting right now — highest conversion rate possible.
async function runPlatformScan() {
  if (!SERPAPI_KEY) {
    await logActivity('platform_scan', 'Skipped — SERPAPI_KEY not configured', null, null, 'skipped');
    return;
  }
  if (isSerpApiCooling()) {
    const minsLeft = Math.ceil((_serpApiCooledUntil - Date.now()) / 60000);
    console.log(`⏳ [SERPAPI] Still cooling — ${minsLeft}m left, skipping platform scan`);
    return;
  }
  try {
    const result = await jobSearch.runPlatformJobScan();
    if (result.errors?.some(e => e.error?.includes('429'))) {
      serpApiRateLimit();
      await logActivity('platform_scan', 'SerpAPI rate limit hit during platform scan — pausing 1 hour', null, null, 'warning');
      return;
    }
    await logActivity(
      'platform_scan',
      `Platform job scan complete — ${result.found} new jobs found (Upwork/Freelancer/Guru/PPH)`,
      null, null, result.errors?.length > 0 ? 'warning' : 'success',
      { found: result.found, errors: result.errors?.length }
    );
    console.log(`🎯 [PLATFORM] Found ${result.found} new platform jobs`);

    // Auto-bid on all new handleable jobs immediately after scan
    if (result.found > 0 || true) { // also pick up any previously unprocessed jobs
      try {
        const autoBidder = require('./auto-bidder');
        const bidResult  = await autoBidder.autoBidNewJobs();
        if (bidResult.processed > 0) {
          await logActivity(
            'platform_scan',
            `Auto-bidder: ${bidResult.processed} proposals generated, ${bidResult.emailed} direct emails sent, ${bidResult.notified} admin digests sent`,
            null, null, 'success',
            bidResult
          );
          console.log(`🤖 [AUTO-BID] ${bidResult.processed} bids sent (${bidResult.emailed} direct, ${bidResult.notified} via admin)`);
        }
      } catch (bidErr) {
        console.warn(`[AUTO-BID] Error: ${bidErr.message}`);
        await logActivity('platform_scan', `Auto-bid error: ${bidErr.message}`, null, null, 'warning');
      }
    }
  } catch (err) {
    await logActivity('platform_scan', `Platform scan error: ${err.message}`, null, null, 'error');
  }
}

async function runJobLeadScan() {
  if (!SERPAPI_KEY) {
    await logActivity('prospect_scan', 'Skipped — SERPAPI_KEY not configured', null, null, 'skipped');
    return;
  }
  if (isSerpApiCooling()) {
    const minsLeft = Math.ceil((_serpApiCooledUntil - Date.now()) / 60000);
    console.log(`⏳ [SERPAPI] Still cooling — ${minsLeft}m left, skipping prospect scan`);
    return;
  }
  try {
    const result = await jobSearch.scanForJobs();
    // If all queries returned 429 errors, engage the cooldown
    const all429 = result.errors.length > 0 && result.errors.every(e => e.error?.includes('429'));
    if (all429) {
      serpApiRateLimit();
      await logActivity('prospect_scan', 'SerpAPI rate limit hit — pausing searches for 1 hour', null, null, 'warning');
      return;
    }
    await logActivity(
      'prospect_scan',
      `Client prospect scan complete — ${result.total} new leads found`,
      null, null, result.errors.length > 0 ? 'warning' : 'success',
      { total: result.total, errors: result.errors.length }
    );
  } catch (err) {
    await logActivity('prospect_scan', `Scan error: ${err.message}`, null, null, 'error');
  }
}

// ── 8. Send Cold Outreach to New Job Leads ────────────────────────────────
// Picks up to 10 uncontacted job_leads — ONE per domain — with circuit breaker.
async function runJobLeadOutreach() {
  if (!circuitCheck()) return;
  if (emailOutreach.areAllProvidersBroken()) {
    console.log('[OUTREACH] All email providers down — skipping job_leads batch');
    return;
  }

  const newLeads = await db.query(`
    SELECT DISTINCT ON (contact_email)
      id, title, company, contact_email, contact_name, job_type, source_url
    FROM job_leads
    WHERE status = 'new'
      AND contact_email IS NOT NULL
      AND contact_email != ''
    ORDER BY contact_email, created_at ASC
    LIMIT 10
  `).catch(() => ({ rows: [] }));

  if (newLeads.rows.length === 0) return;

  let sent = 0;
  for (const lead of newLeads.rows) {
    if (!circuitCheck()) break;
    try {
      // ── BPO competitor filter — never email BPO providers ─────────────────
      const leadDomain = lead.contact_email?.split('@')[1]?.toLowerCase() || '';
      if (isAgentBpoProvider(leadDomain)) {
        await db.query(`UPDATE job_leads SET status='blocked', updated_at=NOW() WHERE id=$1`, [lead.id]);
        console.log(`[OUTREACH] Blocked BPO competitor: ${lead.contact_email}`);
        continue;
      }

      // Bounce guard
      const bounced = await db.query(
        `SELECT id FROM ai_leads WHERE LOWER(contact_email)=LOWER($1) AND bounced_at IS NOT NULL LIMIT 1`,
        [lead.contact_email]
      ).catch(() => ({ rows: [] }));
      if (bounced.rows.length > 0) {
        await db.query(`UPDATE job_leads SET status='bounced', updated_at=NOW() WHERE id=$1`, [lead.id]);
        continue;
      }

      // ── AI Price Negotiator: detect service, build competitive quote, send proposal ──
      const proposal = autoPricing.autoPricingProposal({
        name:         lead.contact_name || lead.company || '',
        company:      lead.company || 'your organisation',
        email:        lead.contact_email,
        businessType: lead.company || '',
        jobType:      lead.job_type || '',
        city:         null,
        country:      null,
      });
      const sendResult = await emailOutreach.sendMail({
        to:      lead.contact_email,
        subject: proposal.subject,
        text:    proposal.text,
        html:    proposal.html,
      });
      if (!sendResult || sendResult.sent === false) {
        if (sendResult?.skipped) break;
        if (sendResult?.allProvidersBroken) {
          console.log('[OUTREACH] All providers broken — stopping job_leads batch early, leads will retry next cycle');
          break;
        }
        await logActivity('prospect_outreach', `Provider rejected send → ${lead.contact_email}`, 'job_lead', lead.id, 'error');
        continue;
      }
      emailCircuit.failures = 0;
      console.log(`💰 [PRICE] Auto-proposal sent to ${lead.contact_email} [${proposal.serviceName}] @ ${(proposal.quote.ourRate).toFixed(2)} ${proposal.quote.svc.unitLabel}`);

      // Mark this job_lead as contacted (job_leads has no domain column — update by id)
      await db.query(
        `UPDATE job_leads SET status='contacted', outreach_sent_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [lead.id]
      );
      sent++;
      checkDailyReset();
      liveStats.outreach.sentThisSession++;
      liveStats.outreach.sentToday++;
      liveStats.outreach.lastSentTo = lead.contact_email;
      liveStats.outreach.lastSentAt = new Date().toISOString();
      saveOutreachStats(liveStats.outreach);
      await logActivity('prospect_outreach', `Cold pitch → ${lead.contact_email} [${lead.job_type}]`, 'job_lead', lead.id, 'success', { company: lead.company, jobType: lead.job_type });
    } catch (err) {
      if (isAuthError(err)) { circuitTrip(err.message); break; }
      await logActivity('prospect_outreach', `Failed → ${lead.contact_email}: ${err.message}`, 'job_lead', lead.id, 'error');
    }
    await sleep(4000); // 4s between emails
  }

  if (sent > 0) {
    await logActivity('prospect_outreach', `Sent ${sent} cold pitch email(s) to client prospects`);
    agentState.totalEmailsSent += sent;
  }
}

// ── 9. Follow-up Sequence for Job Leads ───────────────────────────────────
// Day 3: first follow-up on contacted leads with no response yet
// Day 7: second and final follow-up
async function runJobLeadFollowUps() {
  // Day-3 follow-up
  const day3 = await db.query(`
    SELECT id, contact_email, contact_name, company, job_type
    FROM job_leads
    WHERE status = 'contacted'
      AND outreach_sent_at < NOW() - INTERVAL '3 days'
      AND followup1_sent_at IS NULL
      AND contact_email IS NOT NULL
    LIMIT 500
  `).catch(() => ({ rows: [] }));

  for (const lead of day3.rows) {
    try {
      await emailOutreach.sendClientFollowUp({
        email:         lead.contact_email,
        company:       lead.company || lead.contact_name || 'there',
        jobType:       lead.job_type || 'business process outsourcing',
        followUpNumber: 1,
      });
      await db.query(
        `UPDATE job_leads SET followup1_sent_at=NOW(), status='followup1_sent', updated_at=NOW() WHERE id=$1`,
        [lead.id]
      );
      agentState.totalEmailsSent++;
      await logActivity('prospect_followup', `Day-3 follow-up → ${lead.contact_email} (${lead.company})`, 'job_lead', lead.id);
    } catch (err) {
      await logActivity('prospect_followup', `Day-3 follow-up failed for ${lead.contact_email}: ${err.message}`, 'job_lead', lead.id, 'error');
    }
  }

  // Day-7 follow-up
  const day7 = await db.query(`
    SELECT id, contact_email, contact_name, company, job_type
    FROM job_leads
    WHERE status = 'followup1_sent'
      AND followup1_sent_at < NOW() - INTERVAL '4 days'
      AND followup2_sent_at IS NULL
      AND contact_email IS NOT NULL
    LIMIT 500
  `).catch(() => ({ rows: [] }));

  for (const lead of day7.rows) {
    try {
      await emailOutreach.sendClientFollowUp({
        email:         lead.contact_email,
        company:       lead.company || lead.contact_name || 'there',
        jobType:       lead.job_type || 'business process outsourcing',
        followUpNumber: 2,
      });
      await db.query(
        `UPDATE job_leads SET followup2_sent_at=NOW(), status='followup2_sent', updated_at=NOW() WHERE id=$1`,
        [lead.id]
      );
      agentState.totalEmailsSent++;
      await logActivity('prospect_followup', `Day-7 follow-up → ${lead.contact_email} (${lead.company})`, 'job_lead', lead.id);
    } catch (err) {
      await logActivity('prospect_followup', `Day-7 follow-up failed for ${lead.contact_email}: ${err.message}`, 'job_lead', lead.id, 'error');
    }
  }

  const total = day3.rows.length + day7.rows.length;
  if (total > 0) {
    await logActivity('prospect_followup', `Sent ${total} prospect follow-up(s) (day3: ${day3.rows.length}, day7: ${day7.rows.length})`);
  }
}

// ── Weekly client performance report ──────────────────────────────────────
async function sendWeeklyClientReports() {
  try {
    const jobDelivery = require('./job-delivery');
    const clients = await jobDelivery.getWeeklyClientSummaries();
    if (!clients.length) return;
    let sent = 0;
    for (const c of clients) {
      if (!c.client_email) continue;
      try {
        await emailOutreach.sendMail({
          to: c.client_email,
          subject: `📊 Your Weekly BPO Report — CTS BPO`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                 <div style="background:#1e3a5f;padding:24px;text-align:center;border-radius:12px 12px 0 0">
                   <h2 style="color:#fff;margin:0">📊 Weekly BPO Update</h2>
                   <p style="color:#93c5fd;margin:6px 0 0;font-size:14px">Week ending ${new Date().toLocaleDateString('en-ZA', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
                 </div>
                 <div style="padding:28px;background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
                   <p>Hi ${c.client_name || 'there'},</p>
                   <p>Here's your weekly summary of BPO activity on the CTS BPO platform:</p>
                   <div style="display:flex;gap:16px;margin:20px 0">
                     <div style="flex:1;background:#ecfdf5;border-radius:10px;padding:16px;text-align:center">
                       <div style="font-size:32px;font-weight:900;color:#10b981">${c.delivered_this_week || 0}</div>
                       <div style="font-size:12px;color:#166534;font-weight:700;text-transform:uppercase">Delivered This Week</div>
                     </div>
                     <div style="flex:1;background:#eef2ff;border-radius:10px;padding:16px;text-align:center">
                       <div style="font-size:32px;font-weight:900;color:#6366f1">${c.active_jobs || 0}</div>
                       <div style="font-size:12px;color:#4338ca;font-weight:700;text-transform:uppercase">Active Jobs</div>
                     </div>
                     <div style="flex:1;background:#f8fafc;border-radius:10px;padding:16px;text-align:center">
                       <div style="font-size:32px;font-weight:900;color:#64748b">${c.total_jobs || 0}</div>
                       <div style="font-size:12px;color:#475569;font-weight:700;text-transform:uppercase">Total All Time</div>
                     </div>
                   </div>
                   <p>Log into your client portal to view all jobs, download completed work, and submit new requests:</p>
                   <div style="text-align:center;margin:20px 0">
                     <a href="${process.env.APP_URL || ''}/client/portal" style="background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">
                       View My Portal →
                     </a>
                   </div>
                   <p style="color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:20px">
                     CTS BPO · <a href="https://wa.me/27760679100">WhatsApp: +27 76 067 9100</a> · <a href="mailto:info@ctsbpo.com">info@ctsbpo.com</a><br>
                     To unsubscribe from weekly reports, reply with "unsubscribe reports".
                   </p>
                 </div></div>`,
          text: `Weekly BPO Update: ${c.delivered_this_week || 0} delivered this week, ${c.active_jobs || 0} active jobs. Visit your portal: ${process.env.APP_URL || ''}/client/portal`,
        });
        sent++;
        await new Promise(r => setTimeout(r, 1200));
      } catch {}
    }
    logActivity('weekly_report', `Weekly reports sent to ${sent}/${clients.length} clients`, null, null, 'info');
  } catch (e) {
    console.error('[WEEKLY REPORT]', e.message);
  }
}

// ── Job Seeker Recruitment Campaign ─────────────────────────────────────────
// Searches for people actively looking for remote/BPO work and emails them
// the BPO recruitment drive template to join as CTS BPO subcontractors.
const JOB_SEEKER_QUERIES = [
  { q: '"looking for remote work" "data entry" OR "admin" email South Africa', label: 'SA remote seekers' },
  { q: '"seeking employment" "data entry" OR "transcription" South Africa email contact', label: 'SA employment seekers' },
  { q: '"available for work" "virtual assistant" OR "admin" South Africa email', label: 'SA VA seekers' },
  { q: '"BPO experience" "looking for" OR "seeking" remote job South Africa email', label: 'SA BPO experienced' },
  { q: '"data capturer" "available" OR "looking for work" South Africa email contact', label: 'SA data capturer' },
  { q: '"transcriptionist" "available" OR "freelance" South Africa email', label: 'SA transcriptionist' },
  { q: '"bookkeeper" "available" OR "seeking" remote South Africa email', label: 'SA bookkeeper' },
  { q: '"payroll administrator" "available" OR "looking for" South Africa email', label: 'SA payroll admin' },
  { q: '"virtual assistant" "available" OR "seeking" South Africa email site:gumtree.co.za OR site:careers24.com OR site:pnet.co.za', label: 'SA VA job boards' },
  { q: '"work from home" "data entry" OR "admin" "contact me" OR "email me" South Africa', label: 'SA WFH seekers' },
];

async function runJobSeekerRecruitment() {
  if (!SERPAPI_KEY) return;
  if (isSerpApiCooling()) return;
  if (!circuitCheck()) return;

  let totalSent = 0;
  let totalFound = 0;

  // 1. Search for job seekers using SerpAPI
  const selected = pickRandom(JOB_SEEKER_QUERIES, 3);
  for (const { q, label } of selected) {
    try {
      const res = await axios.get('https://serpapi.com/search', {
        params: { q, api_key: SERPAPI_KEY, engine: 'google', num: 20, hl: 'en', gl: 'za' },
        timeout: 15000,
      });

      const results = res.data.organic_results || [];
      for (const r of results) {
        // Extract email from snippet or title
        const text = `${r.snippet || ''} ${r.title || ''}`;
        const emailMatch = text.match(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,7}\b/);
        if (!emailMatch) continue;
        const email = emailMatch[0].toLowerCase();
        const domain = email.split('@')[1];

        // Skip generic/shared domains and admin-looking addresses
        const skip = ['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','me.com'];
        // For personal emails (gmail etc) we do want to reach them — they're individuals
        // Only skip our own domain and known spam traps
        if (['ctsbpo.com','cts-bpo.com'].includes(domain)) continue;

        // Extract name from title if possible
        const nameMatch = r.title?.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
        const name = nameMatch ? nameMatch[1] : 'there';

        // Store in job_seeker_leads
        try {
          await db.query(
            `INSERT INTO job_seeker_leads (name, email, domain, source_url, snippet)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (email) DO NOTHING`,
            [name, email, domain, r.link || null, text.slice(0, 300)]
          );
          totalFound++;
        } catch { /* already in db or error — skip */ }
      }

      await sleep(1500);
    } catch (err) {
      if (err.response?.status === 429) { serpApiRateLimit(); break; }
      console.error(`[JOB SEEKER] Search error for "${label}":`, err.message);
    }
  }

  // 2. Email uncontacted job seekers (up to 20 per run)
  let leads;
  try {
    leads = await db.query(
      `SELECT id, name, email FROM job_seeker_leads
       WHERE status = 'new' AND outreach_sent_at IS NULL AND bounced_at IS NULL
       ORDER BY created_at ASC LIMIT 20`
    );
  } catch { return; }

  for (const lead of (leads.rows || [])) {
    try {
      const result = await emailOutreach.sendBPORecruitmentDrive({ name: lead.name, email: lead.email });
      if (result.sent) {
        await db.query(
          `UPDATE job_seeker_leads SET status='contacted', outreach_sent_at=NOW() WHERE id=$1`,
          [lead.id]
        );
        await logActivity('job_seeker_outreach', `Recruitment email sent to job seeker: ${lead.email}`, 'job_seeker_leads', lead.id, 'success');
        totalSent++;
        liveStats.outreach.sentThisSession++;
        liveStats.outreach.sentToday++;
        await sleep(2000);
      }
    } catch (e) {
      if (isAuthError(e)) { circuitTrip(e.message); break; }
      console.error('[JOB SEEKER] Email error:', e.message);
    }
  }

  if (totalFound > 0 || totalSent > 0) {
    await logActivity('job_seeker_recruitment', `Job seeker sweep: ${totalFound} new seekers found, ${totalSent} recruitment emails sent`, null, null, 'success');
    console.log(`👥 [JOB SEEKER] Found ${totalFound} seekers, sent ${totalSent} recruitment emails`);
  }
}

// ── Start the agent ────────────────────────────────────────────────────────
// ── One-time DB cleanup at startup ────────────────────────────────────────
// Fixes existing records: marks duplicate same-domain "new" contacts as contacted
// and marks clearly irrelevant domains so they're skipped by outreach.
async function cleanupExistingContacts() {
  try {
    // 1. For each domain that already has a 'contacted' record, mark remaining 'new' ones contacted too
    await db.query(`
      UPDATE scraped_contacts sc
      SET status = 'contacted', updated_at = NOW()
      FROM (
        SELECT DISTINCT domain FROM scraped_contacts WHERE status = 'contacted' AND domain IS NOT NULL
      ) done
      WHERE sc.domain = done.domain AND sc.status = 'new'
    `);

    // 2. Deduplicate remaining 'new': keep only info@/contact@ per domain, mark others 'contacted'
    await db.query(`
      UPDATE scraped_contacts
      SET status = 'contacted', updated_at = NOW()
      WHERE status = 'new'
        AND domain IS NOT NULL
        AND id NOT IN (
          SELECT DISTINCT ON (domain) id
          FROM scraped_contacts
          WHERE status = 'new' AND domain IS NOT NULL
          ORDER BY domain,
            CASE WHEN email LIKE 'info@%' THEN 0
                 WHEN email LIKE 'contact@%' THEN 1
                 ELSE 2 END,
            created_at ASC
        )
    `);
    console.log('🧹 [AGENT] DB cleanup done — duplicate domain contacts consolidated');
  } catch (e) {
    console.warn('⚠️  [AGENT] Cleanup error (non-fatal):', e.message);
  }
}

async function startAgent() {
  // Mark running IMMEDIATELY so the dashboard shows ONLINE during DB setup
  agentState.running = true;
  agentState.startedAt = new Date().toISOString();
  await ensureTables();
  // Ensure scraped_contacts has new intelligence columns (mx_verified, prospect_score)
  // Must run BEFORE any crons or queries reference these columns
  await webScraper.ensureTable().catch(e => console.warn('[AGENT] webScraper.ensureTable():', e.message));

  // Ensure email analytics tables exist (non-blocking)
  emailAnalytics.ensureTables().catch(e => console.warn('[ANALYTICS] Table init error:', e.message));

  await logActivity('agent_start', `CTS BPO Autonomous AI Agent started — all systems active`);
  console.log('🤖 CTS BPO Autonomous AI Agent — ONLINE');

  // Clean up existing duplicate domain records
  setTimeout(() => cleanupExistingContacts().catch(console.error), 3_000);

  // Run initial MX scoring batch on any unverified contacts already in DB
  setTimeout(() => webScraper.runMxScoringBatch({ limit: 100 }).catch(() => {}), 35_000);

  // Run immediately on startup (staggered to avoid hammering)
  setTimeout(() => runLeadSearch().catch(console.error),                  5_000);
  setTimeout(() => runJobLeadScan().catch(console.error),                 15_000);
  setTimeout(() => runPlatformScan().catch(console.error),                60_000);
  setTimeout(() => processApplications().catch(console.error),           20_000);
  setTimeout(() => assignContracts().catch(console.error),               25_000);
  setTimeout(() => processAIJobs().catch(console.error),                 30_000);
  setTimeout(() => runAiLeadOutreach().catch(console.error),             40_000);
  setTimeout(() => runJobLeadOutreach().catch(console.error),            50_000);
  setTimeout(() => runScrapedContactsOutreach().catch(console.error),   120_000);

  // ── Schedules ──
  // Lead search every 30 minutes (ai_leads — runs ALL 12 queries, 100 results each)
  cron.schedule('*/30 * * * *', () => {
    runLeadSearch().catch(e => logActivity('lead_search', `Cron error: ${e.message}`, null, null, 'error'));
  });

  // Client prospect scan every 45 minutes (job_leads — all 28 buyer-targeted queries, 100 results each)
  cron.schedule('*/45 * * * *', () => {
    runJobLeadScan().catch(e => logActivity('prospect_scan', `Cron error: ${e.message}`, null, null, 'error'));
  });

  // Platform job scan every 3 hours — finds live jobs on Upwork, Freelancer, Guru, PeoplePerHour
  cron.schedule('0 */3 * * *', () => {
    runPlatformScan().catch(e => logActivity('platform_scan', `Cron error: ${e.message}`, null, null, 'error'));
  });

  // BATCH OUTREACH to ai_leads every 5 minutes — processes up to 500 uncontacted leads per run
  cron.schedule('*/5 * * * *', () => {
    runAiLeadOutreach().catch(e => logActivity('ai_outreach', `Cron error: ${e.message}`, null, null, 'error'));
  });

  // BATCH OUTREACH to job_leads every 5 minutes (offset by 2.5 min via setTimeout on startup)
  cron.schedule('*/5 * * * *', () => {
    runJobLeadOutreach().catch(e => logActivity('prospect_outreach', `Cron error: ${e.message}`, null, null, 'error'));
  });

  // Follow-up emails every 2 hours (ai_leads — day-3 and day-7)
  cron.schedule('0 */2 * * *', () => {
    runFollowUpSequence().catch(e => logActivity('followup_sequence', `Cron error: ${e.message}`, null, null, 'error'));
  });

  // Follow-up emails every 2 hours (job_leads — prospect follow-ups)
  cron.schedule('30 */2 * * *', () => {
    runJobLeadFollowUps().catch(e => logActivity('prospect_followup', `Cron error: ${e.message}`, null, null, 'error'));
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

  // ── Inbox reply responder every 15 minutes — reads replies, auto-responds, onboards clients ──
  cron.schedule('*/15 * * * *', () => {
    gmailReader.processInboxReplies()
      .then(result => {
        if (result.updates?.length > 0) {
          const onboarded = result.updates.filter(u => u.action === 'onboarded').length;
          const answered  = result.updates.filter(u => u.action === 'ai_answered').length;
          agentState.totalRepliesHandled  = (agentState.totalRepliesHandled  || 0) + result.updates.length;
          agentState.totalClientsOnboarded = (agentState.totalClientsOnboarded || 0) + onboarded;
          console.log(`📬 [INBOX] Processed ${result.updates.length} replies — ${onboarded} onboarded, ${answered} AI-answered`);
        }
      })
      .catch(e => logActivity('inbox_reply', `Cron error: ${e.message}`, null, null, 'error'));
  });
  // Run once 90s after boot so it doesn't clash with bounce check
  setTimeout(() => gmailReader.processInboxReplies().catch(() => {}), 90_000);

  // Bounce processing every 20 minutes — detect bounces, blacklist, then auto-purge
  cron.schedule('*/20 * * * *', () => {
    gmailReader.processBounces()
      .then(() => autoPurgeBounced())
      .catch(e => logActivity('bounce_process', `Cron error: ${e.message}`, null, null, 'error'));
  });
  // Run once on startup after 30s
  setTimeout(() => {
    gmailReader.processBounces()
      .then(() => autoPurgeBounced())
      .catch(console.error);
  }, 30000);

  // ── Continuous scraper (non-stop, no cron) ──
  // Starts 45s after boot, runs forever cycling through 675+ queries across 4 sources
  setTimeout(() => {
    webScraper.runContinuous((event) => {
      // Update liveStats.scraper from the scraper's own _continuousStats
      // (getContinuousStats() returns the current state)
      if (event.type === 'done') {
        agentState.totalLeadsFound += (event.found || 0);
      }
    }).catch(e => {
      console.error('[SCRAPER] Continuous loop crashed, restarting in 10s:', e.message);
      setTimeout(() => webScraper.runContinuous(() => {}).catch(() => {}), 10000);
    });
  }, 45_000);

  // DB volume refresh every 15 seconds — keeps all dashboard counters current
  setInterval(() => refreshDbStats().catch(() => {}), 15_000);
  setTimeout(() => refreshDbStats().catch(() => {}), 5_000); // initial refresh

  // Outreach to scraped_contacts every 5 minutes (offset by ~2.5 min from ai/job crons)
  cron.schedule('2-57/5 * * * *', () => {
    runScrapedContactsOutreach().catch(e => logActivity('scrape_outreach', `Cron error: ${e.message}`, null, null, 'error'));
  });

  // Follow-ups for scraped_contacts every 2 hours
  cron.schedule('15 */2 * * *', () => {
    runScrapedContactsFollowUps().catch(e => logActivity('scrape_followup', `Cron error: ${e.message}`, null, null, 'error'));
  });

  // Job seeker recruitment every 4 hours — emails people looking for remote/BPO work
  cron.schedule('0 */4 * * *', () => {
    runJobSeekerRecruitment().catch(e => logActivity('job_seeker_recruitment', `Cron error: ${e.message}`, null, null, 'error'));
  });
  // Run once 3 minutes after boot
  setTimeout(() => runJobSeekerRecruitment().catch(console.error), 180_000);

  // Daily heartbeat log
  cron.schedule('0 8 * * *', () => {
    logActivity('heartbeat', `Daily check — leads: ${agentState.totalLeadsFound}, emails: ${agentState.totalEmailsSent}, apps: ${agentState.totalAppProcessed}, contracts: ${agentState.totalContractsAssigned}`);
  });

  // ── Weekly client performance report — every Monday 8am ──────────────────
  cron.schedule('0 8 * * 1', () => {
    sendWeeklyClientReports().catch(e => logActivity('weekly_report', `Error: ${e.message}`, null, null, 'error'));
  });

  // ── AI Job Takeover — every 30 minutes check for overdue BPO jobs ─────────
  cron.schedule('*/30 * * * *', () => {
    try {
      const aiJobProcessor = require('./ai-job-processor-bpo');
      aiJobProcessor.runAIJobTakeover()
        .then(r => { if (r.processed > 0) logActivity('ai_job_takeover', `AI completed ${r.processed} overdue BPO job(s)`, null, null, 'info'); })
        .catch(e => logActivity('ai_job_takeover', `Error: ${e.message}`, null, null, 'error'));
    } catch (e) { console.error('[AGENT] AI takeover cron error:', e.message); }
  });

  // ── System health monitor every 15 minutes — auto-detects and logs issues ──
  cron.schedule('*/15 * * * *', () => {
    runSystemHealthCheck().catch(e => console.error('[MONITOR] Health check error:', e.message));
  });
  setTimeout(() => runSystemHealthCheck().catch(() => {}), 60_000);
}

// ── Auto system health monitor ───────────────────────────────────────────────
async function runSystemHealthCheck() {
  const issues  = [];
  const fixes   = [];

  // 1. Check email provider health
  try {
    const stats = emailOutreach.getOutreachStats ? emailOutreach.getOutreachStats() : null;
    const mode  = emailOutreach.getSenderMode ? emailOutreach.getSenderMode() : null;
    if (!mode) {
      issues.push('⚠️ All email providers are broken — no emails can be sent');
      // Auto-fix: try resetting broken providers so they can be retried
      if (emailOutreach.resetBrokenProviders) {
        emailOutreach.resetBrokenProviders();
        fixes.push('🔧 Auto-reset broken email providers — will retry on next send');
      }
    } else {
      const cap  = { gmail: 500, brevo: 300, mailjet: 299, mailgun: 99, mailerlite: 399 }[mode] || 500;
      const sent = stats?.sent || 0;
      const pct  = Math.round((sent / cap) * 100);
      if (pct >= 99) {
        issues.push(`📧 ${mode} at daily limit (${sent}/${cap}) — provider will auto-switch tomorrow`);
      }
    }
  } catch (e) {
    issues.push(`Email health check failed: ${e.message}`);
  }

  // 2. Check database connectivity
  try {
    await db.query('SELECT 1');
  } catch (e) {
    issues.push(`🔴 Database connection error: ${e.message}`);
  }

  // 3. Check for bounced email spike (>20% bounce rate in last 100 sends)
  try {
    const res = await db.query(
      `SELECT COUNT(*) as bounced FROM scraped_contacts WHERE bounced_at >= NOW() - INTERVAL '24 hours'`
    );
    const bounced = parseInt(res.rows[0].bounced) || 0;
    if (bounced > 50) {
      issues.push(`📭 High bounce rate: ${bounced} bounced emails in the last 24h — check sender reputation`);
    }
  } catch {}

  // 4. Check scraper is running
  try {
    const scraperStats = webScraper.getContinuousStats ? webScraper.getContinuousStats() : null;
    if (scraperStats && scraperStats.lastRunAt) {
      const lastRun = new Date(scraperStats.lastRunAt);
      const minsAgo = Math.floor((Date.now() - lastRun.getTime()) / 60000);
      if (minsAgo > 120) {
        issues.push(`🕷️ Scraper has not run in ${minsAgo} minutes — may be stalled`);
      }
    }
  } catch {}

  // 5. Log summary
  if (issues.length > 0) {
    const msg = `System Monitor: ${issues.length} issue(s) detected\n${issues.join('\n')}${fixes.length ? '\n' + fixes.join('\n') : ''}`;
    await logActivity('system_monitor', msg, null, null, issues.length > 0 && fixes.length === issues.length ? 'success' : 'warning');
    console.warn(`[MONITOR] 🔍 ${issues.length} issue(s):\n${issues.join('\n')}`);
    if (fixes.length) console.log(`[MONITOR] 🔧 Auto-fixes applied:\n${fixes.join('\n')}`);
  }
  // Always log a clean-health event once per hour (on the 00 minute)
  const min = new Date().getMinutes();
  if (issues.length === 0 && min < 15) {
    await logActivity('system_monitor', `✅ All systems healthy — email: ${emailOutreach.getSenderMode?.() || 'none'}, DB: connected`).catch(() => {});
  }
}

// ── Manual trigger (admin API) ─────────────────────────────────────────────
async function triggerNow(task) {
  switch (task) {
    case 'lead_search':       await runLeadSearch(); break;
    case 'followup':          await runFollowUpSequence(); break;
    case 'applications':      await processApplications(); break;
    case 'contracts':         await assignContracts(); break;
    case 'ai_jobs':           await processAIJobs(); break;
    case 'payment_chase':     await runPaymentChase(); break;
    case 'inbox_reply':       await gmailReader.processInboxReplies(); break;
    case 'bounce_check':      await gmailReader.processBounces(); await autoPurgeBounced(); break;
    case 'platform_scan':     await runPlatformScan(); break;
    case 'prospect_scan':     await runJobLeadScan(); break;
    case 'prospect_outreach': await runJobLeadOutreach(); break;
    case 'ai_lead_outreach':       await runAiLeadOutreach(); break;
    case 'prospect_followup':      await runJobLeadFollowUps(); break;
    case 'web_scrape':             await runWebScraper(); break;
    case 'scrape_outreach':        await runScrapedContactsOutreach(); break;
    case 'scrape_followup':        await runScrapedContactsFollowUps(); break;
    case 'all':
      await gmailReader.processInboxReplies();
      await gmailReader.processBounces();
      await runLeadSearch();
      await runJobLeadScan();
      await runWebScraper();
      await runAiLeadOutreach();
      await runJobLeadOutreach();
      await runScrapedContactsOutreach();
      await processApplications();
      await assignContracts();
      await processAIJobs();
      await runFollowUpSequence();
      await runJobLeadFollowUps();
      await runScrapedContactsFollowUps();
      await runPaymentChase();
      break;
    default: throw new Error(`Unknown task: ${task}`);
  }
}

// ── Status ─────────────────────────────────────────────────────────────────
function getStatus() {
  checkDailyReset();
  const serpCooling = isSerpApiCooling();
  return {
    ...agentState,
    scraper: {
      ...webScraper.getContinuousStats(),
      rateLimited: serpCooling,
      rateLimitedMinsLeft: serpCooling ? Math.ceil((_serpApiCooledUntil - Date.now()) / 60000) : 0,
    },
    outreach: { ...liveStats.outreach },
    db: { ...liveStats.db },
  };
}

function getCircuitState() {
  const open = emailCircuit.open;
  const minLeft = open ? Math.ceil((emailCircuit.pausedUntil - Date.now()) / 60000) : 0;
  return {
    open,
    failures:     emailCircuit.failures,
    resumeAt:     open ? new Date(emailCircuit.pausedUntil).toISOString() : null,
    minutesLeft:  open ? Math.max(0, minLeft) : 0,
  };
}

module.exports = { startAgent, triggerNow, getStatus, getCircuitState, processAIJobs, runPaymentChase, webScraper };
