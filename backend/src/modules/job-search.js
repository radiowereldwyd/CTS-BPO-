/**
 * AI Job Search Engine
 * Scans the web for BPO job opportunities using SerpApi.
 * Stores discovered leads in the job_leads table.
 */

const axios   = require('axios');
const cheerio = require('cheerio');
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
  // Major BPO giants
  'accenture.com','teleperformance.com','concentrix.com','genpact.com','wipro.com',
  'cognizant.com','infosys.com','tcs.com','capgemini.com','ibm.com','atos.net',
  'sitel.com','taskus.com','supportninja.com','helpware.com','influx.com',
  'magellan-solutions.com','tcwglobal.com','bruntwork.co','auxis.com','ardem.com',
  'bigoutsource.com','outsourcely.com','datamatics.com','igate.com','mphasis.com',
  'hexaware.com','firstsource.com','exlservice.com','wns.com','startek.com',
  'sutherland.com','ienergizer.com','ttec.com','synnex.com','conduent.com',
  'avidxchange.com','bolsterbiz.com','wow24-7.com','wowcustomersupport.com',
  // Mid-tier BPO / VA providers
  'microsourcing.com','milengo.com','movate.com','myoutdesk.com','neowork.com',
  'invensis.net','invedus.com','managedoutsource.com','metasource.com',
  'oceanstalent.com','officebeacon.com','onbrand24.com','outbooks.com',
  'outsource-bookkeeper.com','intellectoutsource.com','infocapsol.com',
  'scribemedics.com','noota.io','wishup.co','wervas.com','ossisto.com',
  'belay.com','woodbows.com','timeetc.com','getfriday.com','uassist.me',
  'delegated.com','prialto.com','1840andco.com','wing.ai','boldly.com',
  'virtually.com','equivity.com','vanadis.com','remotecoworker.com',
  // Translation / transcription service PROVIDERS
  'stepes.com','unbabel.com','milengo.com','languageline.com','transperfect.com',
  'lionbridge.com','welocalize.com','moravia.com','sdl.com','thebigword.com',
  'translations.com','language-reach.com','pairaphrase.com','usatranslate.com',
  'alllanguages.com','laoret.com','palexgroup.com','globalinterpreting.com',
  'rapidtranslate.co','bluente.com','gothamlab.com','dittotranscripts.com',
  'flatworldsolutions.com','workplacelanguages.com','timedoctor.com',
  'waywithwords.net','wizscribe.com','voicescript.ai','transcriptionhub.com',
  'vitalrecordscontrol.com','zydoc.com','scribie.com','gotranscript.com',
  'rev.com','otter.ai','trint.com','verbit.ai','happyscribe.com','sonix.ai',
  // Content moderation / virtual assistant service providers
  'zenius.co','zeni.ai','ziloservices.com','vservesolution.com','vitalitybss.com',
  'virtualeases.com','velan-virtualassistants.com','workstaff360.com',
  'yourccsteam.com','vocal.media','wishup.co','wervas.com',
  // Job boards, directories, social (not clients)
  'linkedin.com','indeed.com','glassdoor.com','upwork.com','fiverr.com',
  'clutch.co','goodfirms.co','youtube.com','facebook.com','twitter.com',
  'instagram.com','google.com','yelp.com','yellowpages.com','reddit.com',
  'wikipedia.org','trustpilot.com','g2.com','capterra.com','sortlist.com',
]);

// Domain/name keyword patterns that indicate a BPO/service PROVIDER (not a client)
const BPO_PROVIDER_KEYWORDS = [
  'outsourc','bponet','callcenter','callcentre','offshoring','nearshore','offshore',
  'virtual-assistant','virtualassist','remoteteam','staffoutsource',
  'transcription-service','transcriptionserv','translation-service','translationserv',
  'dataentry-serv','data-entry-serv','backoffice-serv','back-office-serv',
  'contentmoderat','moderationserv','multilingual-serv',
];

function isBpoProvider(domain) {
  if (!domain) return false;
  const d = domain.toLowerCase();
  if (BPO_PROVIDER_DOMAINS.has(d)) return true;
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

// ── Platform Job Scanner ──────────────────────────────────────────────────────
// Searches Upwork, Freelancer.com, and Guru for live BPO job postings via SerpAPI.
// These are ACTIVE BUYERS — highest-conversion leads possible.
// Stored separately in platform_jobs — admin clicks the link to submit a proposal.

const PLATFORM_QUERIES = [
  // ── Upwork ────────────────────────────────────────────────────────────────
  { q: 'site:upwork.com/jobs "data entry" "fixed price" OR "hourly"',        type: 'data-entry',           platform: 'Upwork' },
  { q: 'site:upwork.com/jobs "virtual assistant" "admin"',                   type: 'virtual-assistant',    platform: 'Upwork' },
  { q: 'site:upwork.com/jobs "transcription" "audio" OR "video"',            type: 'transcription',        platform: 'Upwork' },
  { q: 'site:upwork.com/jobs "translation" "document" OR "website"',         type: 'translation',          platform: 'Upwork' },
  { q: 'site:upwork.com/jobs "bookkeeping" OR "accounts payable" "remote"',  type: 'finance-admin',        platform: 'Upwork' },
  { q: 'site:upwork.com/jobs "customer support" "outsource" OR "remote"',    type: 'customer-support',     platform: 'Upwork' },
  { q: 'site:upwork.com/jobs "invoice processing" OR "document processing"', type: 'document-processing',  platform: 'Upwork' },
  { q: 'site:upwork.com/jobs "content moderation" "images" OR "text"',       type: 'content-moderation',   platform: 'Upwork' },

  // ── Freelancer.com ────────────────────────────────────────────────────────
  { q: 'site:freelancer.com/projects "data entry" "budget"',                 type: 'data-entry',           platform: 'Freelancer' },
  { q: 'site:freelancer.com/projects "virtual assistant" "looking for"',     type: 'virtual-assistant',    platform: 'Freelancer' },
  { q: 'site:freelancer.com/projects "transcription" "audio"',               type: 'transcription',        platform: 'Freelancer' },
  { q: 'site:freelancer.com/projects "translation" "document"',              type: 'translation',          platform: 'Freelancer' },
  { q: 'site:freelancer.com/projects "bookkeeping" OR "payroll"',            type: 'finance-admin',        platform: 'Freelancer' },
  { q: 'site:freelancer.com/projects "customer service" "support"',          type: 'customer-support',     platform: 'Freelancer' },

  // ── Guru.com ──────────────────────────────────────────────────────────────
  { q: 'site:guru.com/jobs "data entry" "ongoing"',                          type: 'data-entry',           platform: 'Guru' },
  { q: 'site:guru.com/jobs "virtual assistant" "admin"',                     type: 'virtual-assistant',    platform: 'Guru' },
  { q: 'site:guru.com/jobs "transcription" OR "translation"',                type: 'transcription',        platform: 'Guru' },

  // ── PeoplePerHour ─────────────────────────────────────────────────────────
  { q: 'site:peopleperhour.com "data entry" OR "virtual assistant" "needed"',type: 'data-entry',           platform: 'PeoplePerHour' },
  { q: 'site:peopleperhour.com "transcription" OR "translation" "needed"',   type: 'transcription',        platform: 'PeoplePerHour' },
];

// ── DuckDuckGo platform scanner — no SerpAPI key needed ──────────────────────
// Used as fallback when SerpAPI is rate-limited.
const DDG_PLATFORM_QUERIES = [
  { q: 'site:upwork.com/jobs "data entry" "fixed price"',          type: 'data-entry',        platform: 'Upwork' },
  { q: 'site:upwork.com/jobs "virtual assistant" "admin"',         type: 'virtual-assistant', platform: 'Upwork' },
  { q: 'site:upwork.com/jobs "transcription" "audio"',             type: 'transcription',     platform: 'Upwork' },
  { q: 'site:upwork.com/jobs "translation" "document"',            type: 'translation',       platform: 'Upwork' },
  { q: 'site:upwork.com/jobs "bookkeeping" OR "data entry"',       type: 'finance-admin',     platform: 'Upwork' },
  { q: 'site:upwork.com/jobs "customer support" remote',           type: 'customer-support',  platform: 'Upwork' },
  { q: 'site:freelancer.com/projects "data entry" budget',         type: 'data-entry',        platform: 'Freelancer' },
  { q: 'site:freelancer.com/projects "virtual assistant"',         type: 'virtual-assistant', platform: 'Freelancer' },
  { q: 'site:freelancer.com/projects "transcription" audio',       type: 'transcription',     platform: 'Freelancer' },
  { q: 'site:freelancer.com/projects "translation" document',      type: 'translation',       platform: 'Freelancer' },
  { q: 'site:guru.com/jobs "data entry"',                          type: 'data-entry',        platform: 'Guru' },
  { q: 'site:peopleperhour.com "data entry" OR "virtual assistant"',type: 'data-entry',       platform: 'PeoplePerHour' },
];

// ── Freelancer.com public API scraper ─────────────────────────────────────────
// Free, no API key needed, returns live active projects
const FREELANCER_QUERIES = [
  { q: 'data entry',           type: 'data-entry'        },
  { q: 'virtual assistant',    type: 'virtual-assistant' },
  { q: 'transcription',        type: 'transcription'     },
  { q: 'translation',          type: 'translation'       },
  { q: 'bookkeeping',          type: 'finance-admin'     },
  { q: 'customer support',     type: 'customer-support'  },
  { q: 'data processing',      type: 'data-entry'        },
  { q: 'document processing',  type: 'document-processing' },
  { q: 'invoice processing',   type: 'document-processing' },
  { q: 'content moderation',   type: 'content-moderation' },
];

async function scrapeFreelancerAPI() {
  const found = [];
  // Scan both hourly AND fixed-price — hourly means recurring/ongoing BPO work
  const PROJECT_TYPES = ['hourly', 'fixed'];
  for (const projectType of PROJECT_TYPES) {
    for (const { q, type } of FREELANCER_QUERIES) {
      try {
        const res = await axios.get('https://www.freelancer.com/api/projects/0.1/projects/active', {
          params: {
            job_details:       true,
            full_description:  true,
            limit:             20,
            query:             q,
            'project_types[]': projectType,
          },
          headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          timeout: 15000,
        });
        const projects = res.data?.result?.projects || [];
        for (const p of projects) {
          if (!p.title || !p.id) continue;
          const isHourly  = projectType === 'hourly';
          const budgetMin = isHourly ? p.hourly_project_info?.hourly_rate_min : p.budget?.minimum;
          const budgetMax = isHourly ? p.hourly_project_info?.hourly_rate_max : p.budget?.maximum;
          const currency  = p.currency?.sign || '$';
          const budget    = budgetMin
            ? `${isHourly ? '⏱ ' : ''}${currency}${budgetMin}${budgetMax ? `–${currency}${budgetMax}` : ''}${isHourly ? '/hr' : ''}`
            : null;
          const url  = p.seo_url ? `https://www.freelancer.com/projects/${p.seo_url}` : `https://www.freelancer.com/projects/${p.id}`;
          const desc = (p.description || '').slice(0, 400);
          found.push({
            platform: 'Freelancer', type,
            title: p.title.slice(0, 200), url, snippet: desc,
            budget, q, projectId: p.id, budgetMin, budgetMax,
            jobType: isHourly ? 'hourly' : 'fixed',
          });
        }
        await new Promise(r => setTimeout(r, 800));
      } catch { /* continue */ }
    }
  }
  return found;
}

// ── PeoplePerHour public scraper ──────────────────────────────────────────────
const PPH_SEARCHES = [
  { path: 'data-entry',        type: 'data-entry'        },
  { path: 'virtual-assistant', type: 'virtual-assistant' },
  { path: 'transcription',     type: 'transcription'     },
  { path: 'translation',       type: 'translation'       },
  { path: 'bookkeeping',       type: 'finance-admin'     },
];

async function scrapePeoplePerHour() {
  const found = [];
  for (const { path, type } of PPH_SEARCHES) {
    try {
      const res = await axios.get(`https://www.peopleperhour.com/freelance-${path}-jobs`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: 15000,
      });
      const $ = cheerio.load(res.data);
      $('li.hourlies--item, .job-list-item, article[class*="job"], .job-card, li[class*="job"]').each((_, el) => {
        const titleEl = $(el).find('a[href*="/job/"], h2 a, h3 a, .job-title a').first();
        const title   = titleEl.text().trim();
        let   url     = titleEl.attr('href') || '';
        if (url && !url.startsWith('http')) url = 'https://www.peopleperhour.com' + url;
        const snippet = $(el).find('p, .description, .job-desc').first().text().trim().slice(0, 300);
        const budget  = $(el).text().match(/£[\d,]+(?:\s*[-–]\s*£[\d,]+)?|\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?/)?.[0] || null;
        if (title && url) found.push({ platform: 'PeoplePerHour', type, title: title.slice(0, 200), url, snippet, budget, q: `pph:${path}` });
      });
      await new Promise(r => setTimeout(r, 2000));
    } catch { /* continue */ }
  }
  return found;
}

async function runPlatformJobScanDDG() {
  await ensurePlatformTable();
  let found = 0;
  const errors = [];
  const allResults = [];

  // ── Source 1: Freelancer.com public API (confirmed working) ──────────────
  try {
    console.log('[PLATFORM] Scanning Freelancer.com API...');
    const fl = await scrapeFreelancerAPI();
    allResults.push(...fl);
    console.log(`[PLATFORM] Freelancer API: ${fl.length} jobs found`);
  } catch (e) {
    errors.push({ platform: 'Freelancer', query: 'api', error: e.message });
  }

  // ── Source 2: PeoplePerHour public pages ──────────────────────────────────
  try {
    console.log('[PLATFORM] Scanning PeoplePerHour...');
    const pph = await scrapePeoplePerHour();
    allResults.push(...pph);
    console.log(`[PLATFORM] PeoplePerHour: ${pph.length} jobs found`);
  } catch (e) {
    errors.push({ platform: 'PeoplePerHour', query: 'scrape', error: e.message });
  }

  // ── Deduplicate and insert ────────────────────────────────────────────────
  const seen = new Set();
  for (const job of allResults) {
    if (!job.url || seen.has(job.url)) continue;
    seen.add(job.url);
    const cleanTitle = (job.title || '').replace(/\s*[|\-–].*$/, '').trim().slice(0, 200);
    try {
      const ins = await db.query(
        `INSERT INTO platform_jobs (platform, job_type, title, snippet, job_url, budget, search_query, freelancer_project_id, budget_min, budget_max)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (job_url) DO NOTHING RETURNING id`,
        [job.platform, job.type, cleanTitle, (job.snippet || '').slice(0, 500), job.url, job.budget, job.q,
         job.projectId || null, job.budgetMin || null, job.budgetMax || null]
      );
      if (ins.rows[0]) found++;
    } catch { /* skip duplicate or error */ }
  }

  console.log(`[PLATFORM] Scan complete — ${found} new jobs added (${allResults.length} total scraped)`);
  return { found, errors, source: 'freelancer-api+pph', total: allResults.length };
}

async function ensurePlatformTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS platform_jobs (
      id                    SERIAL PRIMARY KEY,
      platform              TEXT NOT NULL,
      job_type              TEXT DEFAULT 'general',
      title                 TEXT NOT NULL,
      snippet               TEXT,
      job_url               TEXT UNIQUE NOT NULL,
      budget                TEXT,
      status                TEXT DEFAULT 'new',
      bid_sent_at           TIMESTAMPTZ,
      search_query          TEXT,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS freelancer_project_id BIGINT`);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS budget_min NUMERIC`);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS budget_max NUMERIC`);
}

async function runPlatformJobScan() {
  if (!SERPAPI_KEY) throw new Error('SERPAPI_KEY not set');
  await ensurePlatformTable();

  let found = 0;
  const errors = [];

  for (const { q, type, platform } of PLATFORM_QUERIES) {
    try {
      const res = await axios.get('https://serpapi.com/search.json', {
        params: { engine: 'google', q, num: 10, api_key: SERPAPI_KEY, gl: 'us', hl: 'en' },
        timeout: 15000,
      });
      const results = res.data.organic_results || [];

      for (const r of results) {
        const url = r.link;
        if (!url) continue;

        // Extract budget hint from snippet
        const budgetMatch = (r.snippet || '').match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?|\bR[\d,]+\b/);
        const budget = budgetMatch ? budgetMatch[0] : null;

        // Clean up title — remove platform suffix noise
        const title = (r.title || 'BPO Job Opportunity').replace(/\s*[|\-–].*$/, '').trim();

        try {
          const ins = await db.query(
            `INSERT INTO platform_jobs (platform, job_type, title, snippet, job_url, budget, search_query)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (job_url) DO NOTHING
             RETURNING id`,
            [platform, type, title, r.snippet || '', url, budget, q]
          );
          if (ins.rows[0]) found++;
        } catch (_) { /* duplicate */ }
      }

      await new Promise(r => setTimeout(r, 1200)); // rate-limit: 1.2s between queries
    } catch (err) {
      const is429 = err?.response?.status === 429 || (err.message || '').includes('429');
      errors.push({ platform, query: q, error: err.message });
      if (is429) break; // stop on rate limit
    }
  }

  return { found, errors };
}

async function getPlatformJobs({ platform, type, status, limit = 200 } = {}) {
  await ensurePlatformTable();
  let sql = 'SELECT * FROM platform_jobs WHERE 1=1';
  const params = [];
  if (platform) { params.push(platform); sql += ` AND platform = $${params.length}`; }
  if (type)     { params.push(type);     sql += ` AND job_type = $${params.length}`; }
  if (status)   { params.push(status);   sql += ` AND status = $${params.length}`; }
  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  const res = await db.query(sql, params);
  return res.rows;
}

async function getPlatformStats() {
  await ensurePlatformTable();
  const res = await db.query(`
    SELECT
      COUNT(*)                                        AS total,
      COUNT(*) FILTER (WHERE status='new')            AS new_jobs,
      COUNT(*) FILTER (WHERE status='bid_sent')       AS bids_sent,
      COUNT(*) FILTER (WHERE status='won')            AS won,
      COUNT(DISTINCT platform)                        AS platforms,
      MAX(created_at)                                 AS last_scanned
    FROM platform_jobs
  `);
  return res.rows[0];
}

module.exports = {
  scanForJobs, getLeads, updateLead, markContacted, getStats, BPO_QUERIES, ensureTable,
  runPlatformJobScan, runPlatformJobScanDDG, getPlatformJobs, getPlatformStats, ensurePlatformTable,
};
