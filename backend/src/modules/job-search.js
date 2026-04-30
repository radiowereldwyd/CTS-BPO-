/**
 * AI Job Search Engine
 * Scans the web for BPO job opportunities using SerpApi.
 * Stores discovered leads in the job_leads table.
 */

const axios = require('axios');
const db = require('../db');
const auditLogger = require('./audit-logger');

const SERPAPI_KEY = process.env.SERPAPI_KEY || '';

// BPO job types CTS can perform
const BPO_QUERIES = [
  { query: 'data entry outsourcing work available hire', type: 'data-entry' },
  { query: 'data capture service provider needed outsource', type: 'data-entry' },
  { query: 'translation services needed outsource freelance', type: 'translation' },
  { query: 'document translation outsourcing company needed', type: 'translation' },
  { query: 'transcription services outsource audio to text', type: 'transcription' },
  { query: 'virtual assistant outsourcing business services', type: 'virtual-assistant' },
  { query: 'invoice processing outsource accounts payable', type: 'finance-admin' },
  { query: 'customer support outsourcing BPO company needed', type: 'customer-support' },
  { query: 'content moderation outsource remote team', type: 'content-moderation' },
  { query: 'data cleansing database cleaning service outsource', type: 'data-entry' },
  { query: 'document digitisation scanning outsource', type: 'data-entry' },
  { query: 'spreadsheet data management outsource', type: 'data-entry' },
];

// Ensure job_leads table exists
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS job_leads (
      id              SERIAL PRIMARY KEY,
      title           TEXT NOT NULL,
      company         TEXT,
      source_url      TEXT,
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
}

/**
 * Run a SerpApi Google search for a given query.
 */
async function searchSerpApi(query, numResults = 10) {
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

/**
 * Parse a search result into a job lead record.
 */
function parseResult(result, jobType, query) {
  const title = result.title || 'Untitled Opportunity';
  const url = result.link || '';
  const snippet = result.snippet || '';

  // Attempt to extract company name from the displayed URL or title
  let company = '';
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    company = hostname.split('.')[0];
    company = company.charAt(0).toUpperCase() + company.slice(1);
  } catch { company = 'Unknown'; }

  // Skip job boards that list employee jobs (we want outsourcing opportunities)
  const skipDomains = ['linkedin.com', 'indeed.com', 'glassdoor.com', 'reed.co.uk', 'monster.com', 'ziprecruiter.com', 'careers.'];
  if (skipDomains.some(d => url.includes(d))) return null;

  return { title, company, source_url: url, snippet, job_type: jobType, search_query: query };
}

/**
 * Scan for BPO jobs using the specified query indices (or all queries).
 * Returns newly saved leads.
 */
async function scanForJobs(queryIndices = null) {
  await ensureTable();

  const queriesToRun = queryIndices
    ? BPO_QUERIES.filter((_, i) => queryIndices.includes(i))
    : BPO_QUERIES.slice(0, 5); // default: first 5 queries to conserve API quota

  const newLeads = [];
  const errors = [];

  for (const { query, type } of queriesToRun) {
    try {
      const results = await searchSerpApi(query, 8);
      for (const result of results) {
        const lead = parseResult(result, type, query);
        if (!lead) continue;

        // Deduplicate by URL
        const existing = await db.query(
          'SELECT id FROM job_leads WHERE source_url = $1 LIMIT 1',
          [lead.source_url]
        );
        if (existing.rows.length > 0) continue;

        const inserted = await db.query(
          `INSERT INTO job_leads (title, company, source_url, snippet, job_type, search_query)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [lead.title, lead.company, lead.source_url, lead.snippet, lead.job_type, lead.search_query]
        );
        newLeads.push(inserted.rows[0]);
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
