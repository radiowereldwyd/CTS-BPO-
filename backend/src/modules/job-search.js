/**
 * AI Job Search Engine
 * Scans the web for BPO job opportunities using SerpApi.
 * Stores discovered leads in the job_leads table.
 */

const axios = require('axios');
const db = require('../db');
const auditLogger = require('./audit-logger');

const SERPAPI_KEY = process.env.SERPAPI_KEY || '';

// ─────────────────────────────────────────────────────────────────────────────
// ALL ACTIVE SERVICE TYPES — AI handles every category below autonomously:
//
//  FULLY AUTOMATED (100% AI):
//   • Translation          → Google Cloud Translation API
//   • Transcription        → Google Cloud Speech-to-Text
//   • Document AI          → Google Document AI (OCR, extraction)
//   • Data Entry           → Google Document AI (form/table digitisation)
//   • Invoice Processing   → Google Document AI (invoice entity extraction)
//   • Content Moderation   → Google Cloud Vision Safe Search + Gemini
//
//  PARTIALLY AUTOMATED (AI produces professional draft):
//   • Virtual Admin        → Google Gemini AI
//   • Finance / Accounting → Document AI + Gemini analysis
//   • Customer Support     → Google Gemini AI
//   • Social Media         → Google Gemini AI
//   • General BPO          → Google Gemini AI
// ─────────────────────────────────────────────────────────────────────────────
// ── NOTE ON SEARCH STRATEGY ───────────────────────────────────────────────────
// These queries target companies that NEED to hire BPO services, NOT companies
// that provide them. Key signals: "hiring", "need a company to", "looking to outsource",
// industry sectors that typically outsource (law, healthcare, e-commerce, logistics).
// We also exclude known BPO/outsourcing provider domains to avoid competitor results.
const BPO_EXCLUDE = '-site:linkedin.com -site:indeed.com -site:glassdoor.com -site:upwork.com -site:fiverr.com -site:clutch.co -site:goodfirms.co';

const BPO_QUERIES = [
  // ── Data Entry — companies that need it done, not providers ───────────────
  { query: `"we need" OR "looking to outsource" "data entry" "contact" ${BPO_EXCLUDE}`, type: 'data-entry' },
  { query: `"hire" "data entry" "remote team" OR "outsourced" "company" ${BPO_EXCLUDE}`, type: 'data-entry' },
  { query: `"e-commerce" OR "retail" "data entry" "product listing" "outsource" "partner" ${BPO_EXCLUDE}`, type: 'data-entry' },
  { query: `"law firm" OR "legal" "data entry" "outsource" "paralegal" OR "records" ${BPO_EXCLUDE}`, type: 'data-entry' },
  { query: `"medical practice" OR "clinic" "data entry" "patient records" "outsource" ${BPO_EXCLUDE}`, type: 'data-entry' },

  // ── Transcription — companies needing content transcribed ─────────────────
  { query: `"podcast" OR "webinar" "transcription" "outsource" "affordable" OR "need" ${BPO_EXCLUDE}`, type: 'transcription' },
  { query: `"law firm" OR "court reporter" "transcription" "outsource" "reliable" ${BPO_EXCLUDE}`, type: 'transcription' },
  { query: `"insurance" OR "healthcare" "medical transcription" "partner" OR "outsource" ${BPO_EXCLUDE}`, type: 'transcription' },
  { query: `"market research" "interview transcription" "outsource" OR "hire" ${BPO_EXCLUDE}`, type: 'transcription' },

  // ── Translation — businesses needing content translated ───────────────────
  { query: `"we need" "translation" "documents" "outsource" "partner" ${BPO_EXCLUDE}`, type: 'translation' },
  { query: `"e-commerce" "product description" "translation" "outsource" "languages" ${BPO_EXCLUDE}`, type: 'translation' },
  { query: `"global expansion" "translate" "website" OR "content" "outsourced team" ${BPO_EXCLUDE}`, type: 'translation' },

  // ── Virtual Assistant — SMEs that want admin support ──────────────────────
  { query: `"small business" "virtual assistant" "hire" "remote" "admin tasks" ${BPO_EXCLUDE}`, type: 'virtual-assistant' },
  { query: `"startup" "virtual admin support" OR "executive assistant" "outsource" ${BPO_EXCLUDE}`, type: 'virtual-assistant' },
  { query: `"real estate" "virtual assistant" "outsource" "property" OR "listings" ${BPO_EXCLUDE}`, type: 'virtual-assistant' },

  // ── Finance / Bookkeeping — SMEs that need financial admin ────────────────
  { query: `"small business" "bookkeeping" "outsource" "accounting" "affordable" ${BPO_EXCLUDE}`, type: 'finance-admin' },
  { query: `"payroll" "outsource" "SME" OR "startup" "payroll processing" ${BPO_EXCLUDE}`, type: 'finance-admin' },
  { query: `"accounts receivable" OR "accounts payable" "outsource" "team" "partner" ${BPO_EXCLUDE}`, type: 'finance-admin' },

  // ── Customer Support — businesses that want outsourced support ────────────
  { query: `"we outsource" OR "looking for" "customer support" "BPO" "partner" ${BPO_EXCLUDE}`, type: 'customer-support' },
  { query: `"e-commerce" "customer service" "outsource" "team" "24/7" OR "after hours" ${BPO_EXCLUDE}`, type: 'customer-support' },
  { query: `"SaaS" OR "software company" "customer support" "outsource" "scale" ${BPO_EXCLUDE}`, type: 'customer-support' },

  // ── Document Processing — industries that generate heavy paperwork ─────────
  { query: `"insurance" OR "healthcare" "document processing" "outsource" "digitise" OR "scan" ${BPO_EXCLUDE}`, type: 'document-processing' },
  { query: `"logistics" OR "freight" "invoice processing" "outsource" "partner" ${BPO_EXCLUDE}`, type: 'invoice-processing' },
  { query: `"accounts payable" "invoice" "outsource" "processing" "company" ${BPO_EXCLUDE}`, type: 'invoice-processing' },

  // ── Content Moderation — platforms that need content reviewed ─────────────
  { query: `"marketplace" OR "platform" "content moderation" "outsource" "team" ${BPO_EXCLUDE}`, type: 'content-moderation' },

  // ── South African / African market opportunities ───────────────────────────
  { query: `"South Africa" "BPO" "outsource" "contact centre" "partner" "quote" -site:linkedin.com`, type: 'general' },
  { query: `"Johannesburg" OR "Cape Town" "outsource" "admin" OR "data entry" "company" -site:linkedin.com`, type: 'data-entry' },
];

// Ensure job_leads table exists
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS job_leads (
      id              SERIAL PRIMARY KEY,
      title           TEXT NOT NULL,
      company         TEXT,
      source_url      TEXT UNIQUE,
      snippet         TEXT,
      contact_email   TEXT,
      contact_name    TEXT,
      job_type        TEXT DEFAULT 'general',
      status          TEXT DEFAULT 'new',
      outreach_sent_at TIMESTAMPTZ,
      response_received_at TIMESTAMPTZ,
      notes           TEXT,
      search_query    TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Ensure unique index exists on existing tables (migration)
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS job_leads_source_url_unique ON job_leads (source_url)
  `).catch(() => {});
}

/**
 * Run a SerpApi Google search for a given query.
 */
async function searchSerpApi(query, numResults = 100) {
  if (!SERPAPI_KEY) {
    throw new Error('SERPAPI_KEY not set. Add it in Secrets to enable job scanning.');
  }
  const res = await axios.get('https://serpapi.com/search.json', {
    params: {
      engine: 'google',
      q: query,
      num: numResults,
      api_key: SERPAPI_KEY,
      gl: 'us',
      hl: 'en',
    },
    timeout: 15000,
  });
  return res.data.organic_results || [];
}

// Email variants — only the two most likely to exist on a real business domain
const EMAIL_PREFIXES = ['info', 'contact'];

// BPO/outsourcing provider domains — never email these (they're competitors, not clients)
const BPO_PROVIDER_DOMAINS = new Set([
  'microsourcing.com','milengo.com','movate.com','myoutdesk.com','neowork.com',
  'invensis.net','invedus.com','managedoutsource.com','metasource.com','obgoutsourcing.com',
  'oceanstalent.com','officebeacon.com','onbrand24.com','outbooks.com','outsource-bookkeeper.com',
  'intellectoutsource.com','insigniaresource.com','inteklogistics.com','influenceflow.io',
  'infocapsol.com','inputix.com','inceptiontech.com','outsourcinginsight.com',
  'scribemedics.com','scanoptics.com','naos-solutions.com','noota.io',
  'accenture.com','teleperformance.com','concentrix.com','genpact.com','wipro.com',
  'cognizant.com','infosys.com','tcs.com','capgemini.com','ibm.com','atos.net',
  'sitel.com','taskus.com','supportninja.com','helpware.com','influx.com',
  'magellan-solutions.com','tcwglobal.com','bruntwork.co','auxis.com','ardem.com',
  'bigoutsource.com','avidxchange.com','bolsterbiz.com','wow24-7.com',
  'outsourcely.com','datamatics.com','igate.com','mphasis.com','hexaware.com',
  'firstsource.com','exlservice.com','wns.com','startek.com','sutherland.com',
  'ienergizer.com','servicesource.com','ttec.com','synnex.com','conduent.com',
]);

// Domain/name keyword patterns that indicate a BPO provider (not a client)
const BPO_PROVIDER_KEYWORDS = [
  'outsourc','bponet','callcenter','callcentre','offshoring','nearshore','offshore',
  'virtual-assistant','virtualassist','remoteteam','staffoutsource','outsource',
];

function isBpoProvider(domain) {
  if (BPO_PROVIDER_DOMAINS.has(domain)) return true;
  const d = domain.toLowerCase();
  return BPO_PROVIDER_KEYWORDS.some(kw => d.includes(kw));
}

/**
 * Parse a search result into a list of job lead records (one per email variant).
 */
function parseResult(result, jobType, query) {
  const title = result.title || 'Untitled Opportunity';
  const url = result.link || '';
  const snippet = result.snippet || '';

  // Attempt to extract company name from the displayed URL or title
  let company = '';
  let domain   = '';
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    domain  = hostname;
    company = hostname.split('.')[0];
    company = company.charAt(0).toUpperCase() + company.slice(1);
  } catch { company = 'Unknown'; }

  // Skip job boards, freelance sites, directories AND BPO providers
  const skipDomains = ['linkedin.com', 'indeed.com', 'glassdoor.com', 'reed.co.uk', 'monster.com',
    'ziprecruiter.com', 'simplyhired.com', 'careerbuilder.com', 'upwork.com', 'fiverr.com', 'clutch.co'];
  if (skipDomains.some(d => url.includes(d))) return [];
  if (!url.startsWith('http')) return [];
  // Block BPO companies — we want clients, not competitors
  if (isBpoProvider(domain)) return [];

  // Extract explicit email from snippet/title
  const snippetEmail = (snippet + ' ' + title).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

  const leads = [];

  if (snippetEmail) {
    // Use the explicit email we found — single record
    leads.push({ title, company, source_url: url, snippet, job_type: jobType, search_query: query, contact_email: snippetEmail[0].toLowerCase() });
  } else if (domain) {
    // Generate multiple email variants for this domain
    EMAIL_PREFIXES.forEach((prefix, i) => {
      leads.push({
        title,
        company,
        source_url: i === 0 ? url : `${url}#${prefix}`, // first uses real url, rest have anchors
        snippet,
        job_type: jobType,
        search_query: query,
        contact_email: `${prefix}@${domain}`,
      });
    });
  }

  return leads;
}

/**
 * Scan for BPO jobs using the specified query indices (or all queries).
 * Returns newly saved leads.
 */
async function scanForJobs(queryIndices = null) {
  await ensureTable();

  const queriesToRun = queryIndices
    ? BPO_QUERIES.filter((_, i) => queryIndices.includes(i))
    : BPO_QUERIES; // run all queries for maximum lead coverage

  const newLeads = [];
  const errors = [];

  for (const { query, type } of queriesToRun) {
    try {
      const results = await searchSerpApi(query, 100);
      for (const result of results) {
        const leads = parseResult(result, type, query);
        for (const lead of leads) {
          try {
            const inserted = await db.query(
              `INSERT INTO job_leads (title, company, source_url, snippet, job_type, search_query, contact_email)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (source_url) DO NOTHING
               RETURNING *`,
              [lead.title, lead.company, lead.source_url, lead.snippet, lead.job_type, lead.search_query, lead.contact_email || null]
            );
            if (inserted.rows[0]) newLeads.push(inserted.rows[0]);
          } catch (_) { /* skip duplicate */ }
        }
      }
    } catch (err) {
      errors.push({ query, error: err.message });
    }
  }

  await auditLogger.log(
    'job.scan.complete',
    null, null,
    `Job scan complete: ${newLeads.length} new leads found, ${errors.length} errors`,
    null, 'info'
  );

  return { newLeads, errors, total: newLeads.length };
}

/**
 * Get all job leads with optional filters.
 */
async function getLeads({ status, jobType, limit = 100 } = {}) {
  await ensureTable();
  let sql = 'SELECT * FROM job_leads WHERE 1=1';
  const params = [];
  if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
  if (jobType) { params.push(jobType); sql += ` AND job_type = $${params.length}`; }
  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  const res = await db.query(sql, params);
  return res.rows;
}

/**
 * Update a lead's status or contact info.
 */
async function updateLead(id, updates) {
  const { status, contact_email, contact_name, notes } = updates;
  const res = await db.query(
    `UPDATE job_leads SET
       status = COALESCE($1, status),
       contact_email = COALESCE($2, contact_email),
       contact_name = COALESCE($3, contact_name),
       notes = COALESCE($4, notes),
       updated_at = NOW()
     WHERE id = $5 RETURNING *`,
    [status, contact_email, contact_name, notes, id]
  );
  return res.rows[0];
}

/**
 * Mark a lead as contacted and record when.
 */
async function markContacted(id) {
  const res = await db.query(
    `UPDATE job_leads SET status = 'contacted', outreach_sent_at = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id]
  );
  return res.rows[0];
}

/**
 * Get summary stats for the dashboard.
 */
async function getStats() {
  await ensureTable();
  const res = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'new')        AS new_leads,
      COUNT(*) FILTER (WHERE status = 'contacted')  AS contacted,
      COUNT(*) FILTER (WHERE status = 'responded')  AS responded,
      COUNT(*) FILTER (WHERE status = 'in-progress') AS in_progress,
      COUNT(*) FILTER (WHERE status = 'completed')  AS completed,
      COUNT(*)                                       AS total
    FROM job_leads
  `);
  return res.rows[0];
}

module.exports = { scanForJobs, getLeads, updateLead, markContacted, getStats, BPO_QUERIES, ensureTable };
