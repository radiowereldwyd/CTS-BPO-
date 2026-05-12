/**
 * CTS BPO — Multi-Source Web Scraper
 *
 * Sources (all free within configured limits):
 *   1. Google Places API (New v1)  — real businesses by type+city → website → email variants
 *   2. Google Custom Search API    — 100 free queries/day (GOOGLE_API_KEY + GOOGLE_CSE_ID)
 *   3. DuckDuckGo HTML scraping    — no key, unlimited (rate-limited to be polite)
 *   4. SerpAPI BPO queries         — 5 targeted BPO prospect queries (SERPAPI_KEY)
 *   5. Bing Web Search scraping    — no key, different result pool to DDG
 *   6. YouTube Data API            — business channels with contact emails (GOOGLE_API_KEY)
 *   7. Facebook via search         — FB business pages found via DDG, emails extracted from snippets
 *   8. Business Directories        — Clutch.co, Cylex, Hotfrog SA, Bizcommunity
 *
 * All results stored in `scraped_contacts` table.
 * Outreach pipeline reads from `scraped_contacts` (status='new').
 *
 * Cost guard (Google Places):
 *   - Text Search Basic: ~$0.032/request; Contact fields (website): ~$0.003/place
 *   - This module caps at PLACES_QUERIES_PER_RUN queries per invocation.
 *   - At default 15 queries × 4 runs/day = 60/day × $0.092 ≈ $5.52/day → well within $200/mo credit.
 * YouTube API cost: 100 units/search × 8 searches = 800 units/run (free cap: 10,000/day).
 */

const axios        = require('axios');
const cheerio      = require('cheerio');
const fs           = require('fs');
const path         = require('path');
const db           = require('../db');
const emailVerifier  = require('./email-verifier');
const prospectScorer = require('./prospect-scorer');

// ── Stats persistence — survives backend restarts ────────────────────────────
const STATS_FILE    = path.join(__dirname, '../../data/scraper-stats.json');
const SEARCHED_FILE = path.join(__dirname, '../../data/scraper-searched.json');

function loadPersistedStats() {
  try {
    if (!fs.existsSync(path.dirname(STATS_FILE))) {
      fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
    }
    if (fs.existsSync(STATS_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
      return {
        totalQueries:       parseInt(saved.totalQueries)       || 0,
        totalContactsAdded: parseInt(saved.totalContactsAdded) || 0,
        cyclesCompleted:    parseInt(saved.cyclesCompleted)    || 0,
      };
    }
  } catch { /* ignore parse errors — start fresh */ }
  return { totalQueries: 0, totalContactsAdded: 0, cyclesCompleted: 0 };
}

function savePersistedStats(stats) {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify({
      totalQueries:       stats.totalQueries,
      totalContactsAdded: stats.totalContactsAdded,
      cyclesCompleted:    stats.cyclesCompleted,
      savedAt:            new Date().toISOString(),
    }, null, 2), 'utf8');
  } catch { /* silently skip */ }
}

// ── Query-history persistence (so we never repeat a query within the same cycle) ─
function searchedKey(pair) {
  return `${pair.source}::${pair.query}`;
}

function loadSearchedQueries() {
  try {
    if (fs.existsSync(SEARCHED_FILE)) {
      const arr = JSON.parse(fs.readFileSync(SEARCHED_FILE, 'utf8'));
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch { /* start fresh */ }
  return new Set();
}

function saveSearchedQueries(set) {
  try {
    fs.writeFileSync(SEARCHED_FILE, JSON.stringify([...set], null, 0), 'utf8');
  } catch { /* silently skip */ }
}

function clearSearchedQueries() {
  try { fs.writeFileSync(SEARCHED_FILE, '[]', 'utf8'); } catch {}
}

// ── Config ─────────────────────────────────────────────────────────────────
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
// Auto-clean CSE ID — handle cases where user pasted full embed script instead of just the ID
const _rawCseId      = process.env.GOOGLE_CSE_ID  || '';
const _cseMatch      = _rawCseId.match(/[?&]cx=([^'"&\s<>]+)/);
const GOOGLE_CSE_ID  = _cseMatch ? _cseMatch[1] : _rawCseId.replace(/<[^>]+>/g,'').trim();

// ── Service Account helper for Places API (API key not enabled for Places) ───
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
let _saAccessToken   = null;
let _saTokenExpiry   = 0;
async function getSaAccessToken() {
  if (_saAccessToken && Date.now() < _saTokenExpiry - 60000) return _saAccessToken;
  if (!SA_JSON) return null;
  try {
    const { GoogleAuth } = require('google-auth-library');
    const auth   = new GoogleAuth({ credentials: JSON.parse(SA_JSON), scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    const t      = await client.getAccessToken();
    _saAccessToken = t.token;
    _saTokenExpiry = Date.now() + 3600000; // 1 hour
    return _saAccessToken;
  } catch (e) {
    console.warn('[SCRAPER] SA token error:', e.message);
    return null;
  }
}

async function getPlacesHeaders() {
  const token = await getSaAccessToken();
  if (token) return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-FieldMask': 'places.displayName,places.websiteUri,places.formattedAddress,places.nationalPhoneNumber,places.businessStatus' };
  // Fallback to API key if no SA credentials
  return { 'X-Goog-Api-Key': GOOGLE_API_KEY, 'Content-Type': 'application/json', 'X-Goog-FieldMask': 'places.displayName,places.websiteUri,places.formattedAddress,places.nationalPhoneNumber,places.businessStatus' };
}

const PLACES_QUERIES_PER_RUN = parseInt(process.env.PLACES_QUERIES_PER_RUN || '15', 10);
const CSE_QUERIES_PER_RUN    = parseInt(process.env.CSE_QUERIES_PER_RUN    || '10', 10);
const DDG_QUERIES_PER_RUN    = parseInt(process.env.DDG_QUERIES_PER_RUN    || '20', 10);
const BING_QUERIES_PER_RUN   = parseInt(process.env.BING_QUERIES_PER_RUN   || '10', 10);
const YT_QUERIES_PER_RUN     = parseInt(process.env.YT_QUERIES_PER_RUN     || '8',  10);
const FB_QUERIES_PER_RUN     = parseInt(process.env.FB_QUERIES_PER_RUN     || '6',  10);
const SCRAPE_DELAY_MS        = parseInt(process.env.SCRAPE_DELAY_MS        || '1200', 10);

// Only ONE primary contact per company — no carpet-bombing all prefixes
const EMAIL_PREFIXES = ['info', 'contact'];

// ── BPO relevance keywords — a site must match at least one ────────────────
// Used to score/filter before storing; only relevant companies get outreached
const BPO_KEYWORDS = [
  'data entry', 'data capture', 'data processing', 'transcription', 'translation',
  'virtual assistant', 'back office', 'outsourc', 'bpo', 'document digitiz',
  'document processing', 'invoice processing', 'payroll', 'medical billing',
  'claims processing', 'accounts payable', 'hr admin', 'legal transcription',
  'content moderation', 'speech to text', 'digitisation', 'digitization',
  'remote admin', 'bookkeeping', 'record management', 'data migration',
];

function isRelevant(snippet, query, businessType) {
  const haystack = `${snippet || ''} ${query || ''} ${businessType || ''}`.toLowerCase();
  return BPO_KEYWORDS.some(kw => haystack.includes(kw));
}

// ── Target industries × cities ─────────────────────────────────────────────
// ONLY companies that regularly outsource back-office operations to BPO firms.
// Consumer-facing small businesses (clinics, vets, architects, non-profits etc.)
// almost never buy BPO services — removed entirely.
const BUSINESS_TYPES = [
  // ── Finance & Insurance (highest BPO adoption globally) ──────────────────
  'financial services company',
  'insurance company',
  'insurance brokerage',
  'accounting firm',
  'chartered accountant practice',
  'bookkeeping company',
  'payroll services company',
  'tax advisory firm',
  'audit firm',
  'wealth management company',
  'mortgage company',
  'fintech company',
  'credit union',
  'asset management firm',
  // ── Legal (high document & admin outsourcing) ─────────────────────────────
  'law firm',
  'legal services company',
  'solicitor firm',
  // ── Healthcare Administration (NOT consumer clinics) ──────────────────────
  'medical billing company',
  'healthcare management company',
  'health insurance company',
  'pharmacy benefits company',
  'hospital administration company',
  // ── E-Commerce & Retail (product data, customer support outsourcing) ──────
  'e-commerce company',
  'online retail company',
  'wholesale distributor',
  'retail chain',
  // ── Logistics & Supply Chain (data, invoicing, freight docs) ─────────────
  'logistics company',
  'freight forwarding company',
  'supply chain company',
  'third-party logistics company',
  'warehousing company',
  // ── Technology & IT Services (back-office, data, support) ─────────────────
  'software company',
  'IT services company',
  'managed services provider',
  'SaaS company',
  'technology company',
  // ── HR, Recruitment & Staffing (high data/admin needs) ────────────────────
  'recruitment agency',
  'staffing agency',
  'HR outsourcing company',
  'workforce management company',
  // ── Property Management (leasing admin, data entry, tenant management) ────
  'property management company',
  'commercial real estate company',
  'real estate investment company',
  // ── Business Process & Consulting ─────────────────────────────────────────
  'management consulting firm',
  'business process outsourcing company',
  'shared services company',
  'back office services company',
];

const SEARCH_CITIES = [
  // South Africa
  'Johannesburg South Africa', 'Cape Town South Africa', 'Durban South Africa',
  'Pretoria South Africa', 'Port Elizabeth South Africa', 'Bloemfontein South Africa',
  'East London South Africa', 'Polokwane South Africa', 'Nelspruit South Africa',
  'Pietermaritzburg South Africa', 'Kimberley South Africa', 'George South Africa',
  // UK
  'London UK', 'Manchester UK', 'Birmingham UK', 'Glasgow UK', 'Liverpool UK',
  'Leeds UK', 'Sheffield UK', 'Edinburgh UK', 'Bristol UK', 'Leicester UK',
  'Coventry UK', 'Bradford UK', 'Cardiff UK', 'Belfast UK', 'Nottingham UK',
  'Southampton UK', 'Portsmouth UK', 'Newcastle UK', 'Reading UK', 'Oxford UK',
  'Cambridge UK', 'Milton Keynes UK', 'Derby UK', 'Stoke-on-Trent UK',
  // USA
  'New York USA', 'Chicago USA', 'Los Angeles USA', 'Houston USA', 'Dallas USA',
  'Atlanta USA', 'Miami USA', 'Seattle USA', 'Phoenix USA', 'Philadelphia USA',
  'San Antonio USA', 'San Diego USA', 'Denver USA', 'Boston USA', 'Austin USA',
  'Charlotte USA', 'Columbus USA', 'Indianapolis USA', 'Nashville USA',
  'Portland USA', 'Las Vegas USA', 'Minneapolis USA', 'Baltimore USA',
  'San Jose USA', 'Fort Worth USA', 'Jacksonville USA', 'Memphis USA',
  'Louisville USA', 'Milwaukee USA', 'Sacramento USA', 'Kansas City USA',
  'Cleveland USA', 'Raleigh USA', 'Tampa USA', 'Tucson USA', 'Orlando USA',
  // Australia
  'Sydney Australia', 'Melbourne Australia', 'Brisbane Australia',
  'Perth Australia', 'Adelaide Australia', 'Canberra Australia',
  'Gold Coast Australia', 'Newcastle Australia', 'Wollongong Australia',
  'Hobart Australia', 'Darwin Australia',
  // Canada
  'Toronto Canada', 'Vancouver Canada', 'Montreal Canada', 'Calgary Canada',
  'Ottawa Canada', 'Edmonton Canada', 'Winnipeg Canada', 'Hamilton Canada',
  'Quebec City Canada', 'Halifax Canada',
  // Ireland
  'Dublin Ireland', 'Cork Ireland', 'Limerick Ireland', 'Galway Ireland',
  // New Zealand
  'Auckland New Zealand', 'Wellington New Zealand', 'Christchurch New Zealand',
  // Asia & Middle East
  'Singapore', 'Dubai UAE', 'Abu Dhabi UAE', 'Kuala Lumpur Malaysia',
  'Manila Philippines', 'Hong Kong', 'Mumbai India', 'Delhi India',
  'Bangalore India', 'Colombo Sri Lanka',
  // Africa
  'Nairobi Kenya', 'Lagos Nigeria', 'Accra Ghana', 'Kampala Uganda',
  'Dar es Salaam Tanzania', 'Kigali Rwanda', 'Lusaka Zambia',
  'Harare Zimbabwe', 'Gaborone Botswana',
];

// ── Junk domains to always skip — never store or email these ─────────────────
const JUNK_DOMAINS = new Set([
  // Social media & tech giants
  'twitter.com','x.com','facebook.com','instagram.com','tiktok.com','youtube.com',
  'linkedin.com','pinterest.com','snapchat.com','reddit.com','whatsapp.com',
  'telegram.org','discord.com','tumblr.com','quora.com','medium.com',
  // Microsoft / Google / Amazon
  'microsoft.com','azure.microsoft.com','google.com','googleapis.com',
  'amazon.com','aws.amazon.com','apple.com','icloud.com',
  // Email providers
  'gmail.com','yahoo.com','hotmail.com','outlook.com','live.com','aol.com','protonmail.com',
  // Job boards & freelance
  'indeed.com','glassdoor.com','upwork.com','fiverr.com','freelancer.com',
  'monster.com','ziprecruiter.com','simplyhired.com','careerbuilder.com','bark.com',
  // Directories & review sites
  'clutch.co','goodfirms.co','trustpilot.com','yelp.com','yellowpages.com',
  'g2.com','capterra.com','sitejabber.com','manta.com','bbb.org',
  'help.clutch.co','msg.clutch.co','survey.hsforms.com','shortlist.clutch.co',
  'review.clutch.co','project.clutch.co','r.clutch.co',
  // Known BPO competitors — don't pitch other BPO companies
  'ardem.com','auxis.com','avidxchange.com','bigoutsource.com','bruntwork.co',
  'afrishorebpo.com','athreon.com','audiofilesolutions.com','bolsterbiz.com',
  'wow24-7.com','agtva360.com','ahima.org','allianzegcc.com','armasourcing.com',
  'accenture.com','teleperformance.com','convergys.com','wipro.com','infosys.com',
  'tcs.com','hcltech.com','capgemini.com','cognizant.com','genpact.com',
  'ibm.com','atos.net','cgi.com','dxc.com','concentrix.com','sitel.com',
  'taskus.com','tss-services.com','remotasks.com','clickworker.com',
  'supportninja.com','helpware.com','influx.com','answerfirst.com',
  'magellan-solutions.com','tcwglobal.com','frontlogix.com','phonestaffer.com',
  'thebponetwork.com','bposearch.com','allianzebposervices.com','cion-bpo.com',
  // Additional BPO providers found in outreach logs
  'microsourcing.com','milengo.com','movate.com','myoutdesk.com','neowork.com',
  'invensis.net','invedus.com','managedoutsource.com','metasource.com',
  'obgoutsourcing.com','oceanstalent.com','officebeacon.com','onbrand24.com',
  'outbooks.com','outsource-bookkeeper.com','intellectoutsource.com',
  'insigniaresource.com','influenceflow.io','infocapsol.com','inputix.com',
  'inceptiontech.com','scribemedics.com','scanoptics.com','naos-solutions.com',
  'noota.io','datamatics.com','mphasis.com','hexaware.com','firstsource.com',
  'exlservice.com','wns.com','startek.com','sutherland.com','ttec.com',
  'synnex.com','conduent.com','ienergizer.com','servicesource.com',
  'outsourcely.com','igate.com','outsource-bookkeeper.com','obi.services',
  'officebeacon.com','oceanstalent.com','obgoutsourcing.com',
  // News & blogs
  'bizcommunity.com','forbes.com','entrepreneur.com','businessinsider.com',
  'techcrunch.com','wired.com','theguardian.com','bbc.com','cnn.com',
  'huffpost.com','inc.com','fastcompany.com',
]);

// CSE queries — find companies that NEED BPO, NOT BPO companies themselves
const CSE_QUERIES = [
  'law firm "contact us" UK "admin support" OR "document processing" -site:linkedin.com',
  'accounting firm "contact us" Australia "bookkeeping" OR "data capture" -site:linkedin.com',
  'medical practice "contact us" USA "patient records" OR "billing" -site:linkedin.com',
  'dental clinic "contact us" Canada "admin" OR "records management" -site:linkedin.com',
  'real estate agency "contact us" UK "admin" OR "listings" -site:linkedin.com',
  'insurance broker "contact us" Australia -site:linkedin.com',
  'e-commerce business "contact us" UK "product data" OR "catalogue" -site:linkedin.com',
  'recruitment agency "contact us" USA "admin" OR "data entry" -site:linkedin.com',
  'logistics company "contact us" South Africa "invoicing" OR "admin" -site:linkedin.com',
  'property management company "contact us" UK "admin" OR "tenancy" -site:linkedin.com',
  'mortgage broker "contact us" USA "documents" OR "admin" -site:linkedin.com',
  'financial advisory firm "contact us" Australia -site:linkedin.com',
  'HR consulting firm "contact us" UK "admin" OR "payroll" -site:linkedin.com',
  'manufacturing company "contact us" South Africa "invoices" OR "data" -site:linkedin.com',
  'healthcare clinic "contact us" Canada "records" OR "billing" -site:linkedin.com',
  'legal firm "contact us" Australia "documents" OR "transcription" -site:linkedin.com',
  'startup "contact us" USA "admin" OR "back office" -site:linkedin.com',
  'medical specialist "contact us" South Africa "admin" OR "records" -site:linkedin.com',
  'architectural firm "contact us" UK "admin" OR "documents" -site:linkedin.com',
  'pharmaceutical company "contact us" Australia -site:linkedin.com',
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch { return null; }
}

// ── Real email extraction from company websites ───────────────────────────
// Tries to find actual email addresses on company contact/about pages
// before falling back to guessed info@/contact@ prefixes.
const _emailCache = new Map();   // domain → real email or null
const EMAIL_REGEX  = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,7}\b/g;
const SKIP_EMAIL_DOMAINS = new Set([
  'sentry.io','wix.com','wordpress.com','shopify.com','example.com',
  'yourdomain.com','domain.com','email.com','placeholder.com','test.com',
  'google.com','facebook.com','twitter.com','instagram.com','linkedin.com',
  'schema.org','w3.org','bootstrap.com','jquery.com','cloudflare.com',
]);

async function tryExtractRealEmail(domain, pageUrl) {
  if (!domain) return null;
  if (_emailCache.has(domain)) return _emailCache.get(domain);

  const pages = [
    pageUrl,
    `https://${domain}/contact`,
    `https://${domain}/contact-us`,
    `https://${domain}/about`,
    `https://${domain}/`,
  ].filter(Boolean);

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  for (const url of pages) {
    try {
      const res = await axios.get(url, {
        headers: { 'User-Agent': ua, 'Accept': 'text/html' },
        timeout: 5000,
        maxRedirects: 3,
      });
      const html = res.data || '';
      const $ = cheerio.load(html);

      // 1. Prefer mailto: links (most reliable)
      let found = null;
      $('a[href^="mailto:"]').each((_, el) => {
        if (found) return;
        const href = $(el).attr('href') || '';
        const email = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
        if (email && email.includes('@')) {
          const emailDomain = email.split('@')[1];
          if (!SKIP_EMAIL_DOMAINS.has(emailDomain) && emailDomain === domain) {
            found = email;
          }
        }
      });
      if (found) { _emailCache.set(domain, found); return found; }

      // 2. Scan visible text for email patterns (strips scripts/styles first)
      $('script,style,noscript,iframe').remove();
      const text = $('body').text();
      const matches = text.match(EMAIL_REGEX) || [];
      for (const m of matches) {
        const em = m.toLowerCase();
        const emDomain = em.split('@')[1];
        if (emDomain === domain && !SKIP_EMAIL_DOMAINS.has(emDomain)) {
          _emailCache.set(domain, em);
          return em;
        }
      }

      // Found first page — no point checking others if it loaded and had no email
      if (url === pageUrl) break;
    } catch { /* network error or timeout — try next page */ }
  }

  _emailCache.set(domain, null);
  return null;
}

async function buildEmailList(domain, pageUrl) {
  if (!domain) return [];
  const real = await tryExtractRealEmail(domain, pageUrl);
  if (real) return [real];                                    // Use only the real address
  return EMAIL_PREFIXES.map(p => `${p}@${domain}`);          // Fallback: guessed prefixes
}

function buildEmailVariants(domain) {
  if (!domain) return [];
  return EMAIL_PREFIXES.map(p => `${p}@${domain}`);
}

function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}

// ── DB: ensure scraped_contacts table ───────────────────────────────────────
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS scraped_contacts (
      id              SERIAL PRIMARY KEY,
      company         TEXT,
      website         TEXT,
      domain          TEXT,
      email           TEXT UNIQUE,
      phone           TEXT,
      address         TEXT,
      city            TEXT,
      country         TEXT,
      business_type   TEXT,
      source          TEXT,
      query_used      TEXT,
      snippet         TEXT,
      status          TEXT DEFAULT 'new',
      mx_verified     BOOLEAN DEFAULT NULL,
      prospect_score  INTEGER DEFAULT 0,
      outreach_sent_at  TIMESTAMPTZ,
      followup1_sent_at TIMESTAMPTZ,
      followup2_sent_at TIMESTAMPTZ,
      bounced_at        TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_sc_status ON scraped_contacts(status)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_sc_domain ON scraped_contacts(domain)`);
  // Migrations — add new columns to existing tables first, THEN create indexes on them
  await db.query(`ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS mx_verified    BOOLEAN DEFAULT NULL`).catch(() => {});
  await db.query(`ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS prospect_score INTEGER DEFAULT 0`).catch(() => {});
  await db.query(`ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS bpo_likely     BOOLEAN DEFAULT NULL`).catch(() => {});
  await db.query(`ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS bpo_provider   BOOLEAN DEFAULT NULL`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_sc_score  ON scraped_contacts(prospect_score DESC)`).catch(() => {});
}

// ── Background MX verification + scoring pass ────────────────────────────────
// Runs async after each scrape cycle — verifies domains and scores contacts.
// Does NOT block the scraper; non-critical path.
let _mxBatchRunning = false;
async function runMxScoringBatch({ limit = 60 } = {}) {
  if (_mxBatchRunning) return;
  _mxBatchRunning = true;
  try {
    // Pick unverified contacts that haven't been outreached yet
    const rows = await db.query(
      `SELECT id, email, domain, company, business_type, source, snippet, query_used, city, country
       FROM scraped_contacts
       WHERE mx_verified IS NULL AND status = 'new'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    if (rows.rows.length === 0) { _mxBatchRunning = false; return; }

    let verified = 0, failed = 0;
    for (const c of rows.rows) {
      const domain = c.domain || (c.email || '').split('@')[1];
      if (!domain) continue;
      const ok    = await emailVerifier.hasMxRecords(domain);
      const score = prospectScorer.scoreContact({ ...c, mx_verified: ok });
      await db.query(
        `UPDATE scraped_contacts SET mx_verified=$1, prospect_score=$2, updated_at=NOW() WHERE id=$3`,
        [ok, score, c.id]
      ).catch(() => {});
      if (ok) verified++; else failed++;
    }
    console.log(`[MX] Batch verified ${rows.rows.length} contacts — ✅ ${verified} valid, ❌ ${failed} no-MX`);
  } catch (err) {
    console.warn('[MX] Scoring batch error:', err.message);
  } finally {
    _mxBatchRunning = false;
  }
}

// ── Infer business type from query string ─────────────────────────────────────
// Used for DDG / Bing / SerpAPI contacts that don't carry a businessType field.
function inferBusinessType(query) {
  const q = (query || '').toLowerCase();
  if (/insurance company|insurance brokerage|health insur/.test(q))  return 'insurance company';
  if (/financial services|fintech|wealth management|asset management/.test(q)) return 'financial services company';
  if (/accounting firm|chartered accountant|bookkeeping|cpa firm/.test(q)) return 'accounting firm';
  if (/payroll company|payroll services/.test(q))                     return 'payroll services company';
  if (/law firm|solicitor|attorney|legal (firm|practice|services)/.test(q)) return 'law firm';
  if (/logistics company|freight forward|supply chain|3pl|third.party logist/.test(q)) return 'logistics company';
  if (/e.commerce|online retail|wholesale distributor/.test(q))       return 'e-commerce company';
  if (/recruitment agency|staffing agency|staffing company/.test(q))  return 'recruitment agency';
  if (/hr outsourc|hr consulting|workforce management/.test(q))       return 'hr outsourcing company';
  if (/property management|commercial real estate/.test(q))           return 'property management company';
  if (/software company|saas company|technology company/.test(q))     return 'software company';
  if (/it services|managed services|it company/.test(q))              return 'it services company';
  if (/medical billing|healthcare management|health insurance/.test(q)) return 'medical billing company';
  if (/back office outsourc|bpo|data entry outsourc|outsource data|document processing outsourc/.test(q)) return 'business process outsourcing company';
  return null; // unknown — no points for type, but still stored
}

// ── Helper: is this domain junk / a competitor? ──────────────────────────────
function isJunkDomain(domain) {
  if (!domain) return true;
  if (JUNK_DOMAINS.has(domain)) return true;
  // Block known BPO keyword domains (catches variants not in the explicit list)
  const bpoPatterns = ['bpo','outsourc','virtual-assist','callcenter','call-center','transcrib','answering-service'];
  return bpoPatterns.some(p => domain.includes(p));
}

// ── Store results (continuous scraper — skip duplicates) ─────────────────────
async function storeContacts(contacts) {
  let inserted = 0;
  for (const c of contacts) {
    if (isJunkDomain(c.domain)) continue; // skip junk / competitor domains
    try {
      const res = await db.query(
        `INSERT INTO scraped_contacts
           (company, website, domain, email, phone, address, city, country, business_type, source, query_used, snippet)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [c.company||null, c.website||null, c.domain||null, c.email,
         c.phone||null, c.address||null, c.city||null, c.country||null,
         c.businessType||null, c.source, c.query||null, c.snippet||null]
      );
      if (res.rowCount > 0) inserted++;
    } catch { /* skip duplicates */ }
  }
  return inserted;
}

// ── Store results for targeted scrape — UPSERT so existing emails get re-tagged
// to the current session and filled in with country/industry if missing.
// Returns count of rows affected (inserted OR re-tagged).
async function storeContactsTargeted(contacts) {
  let affected = 0;
  for (const c of contacts) {
    if (isJunkDomain(c.domain)) continue; // skip junk / competitor domains
    try {
      const res = await db.query(
        `INSERT INTO scraped_contacts
           (company, website, domain, email, phone, address, city, country, business_type, source, query_used, snippet)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (email) DO UPDATE SET
           source        = EXCLUDED.source,
           country       = COALESCE(NULLIF(scraped_contacts.country,''),       EXCLUDED.country),
           business_type = COALESCE(NULLIF(scraped_contacts.business_type,''), EXCLUDED.business_type),
           company       = COALESCE(NULLIF(scraped_contacts.company,''),        EXCLUDED.company),
           snippet       = COALESCE(NULLIF(scraped_contacts.snippet,''),        EXCLUDED.snippet)
         WHERE scraped_contacts.status != 'bounced'
         RETURNING id`,
        [c.company||null, c.website||null, c.domain||null, c.email,
         c.phone||null, c.address||null, c.city||null, c.country||null,
         c.businessType||null, c.source, c.query||null, c.snippet||null]
      );
      if (res.rowCount > 0) affected++;
    } catch { /* skip on error */ }
  }
  return affected;
}

// ── 1. Google Places API (New v1) ───────────────────────────────────────────
async function scrapeGooglePlaces() {
  if (!GOOGLE_API_KEY) {
    console.log('⚠️  [SCRAPER] Google Places: GOOGLE_API_KEY not set — skipping');
    return 0;
  }

  const pairs = [];
  for (const city of SEARCH_CITIES) {
    for (const type of BUSINESS_TYPES) {
      pairs.push({ query: `${type} ${city}`, type, city });
    }
  }

  const selected = pickRandom(pairs, PLACES_QUERIES_PER_RUN);
  let totalInserted = 0;

  for (const { query, type, city } of selected) {
    try {
      const res = await axios.post(
        'https://places.googleapis.com/v1/places:searchText',
        { textQuery: query, languageCode: 'en', maxResultCount: 20 },
        { headers: await getPlacesHeaders(), timeout: 15000 }
      );

      const places = res.data.places || [];
      const contacts = [];

      for (const p of places) {
        if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
        const website = p.websiteUri || null;
        const domain  = extractDomain(website);
        if (!domain) continue;
        const variants = buildEmailVariants(domain);
        const name     = p.displayName?.text || '';
        const addr     = p.formattedAddress || '';
        const phone    = p.nationalPhoneNumber || null;
        const cityName = city.split(' ')[0];
        const country  = city.split(' ').slice(1).join(' ') || null;

        for (const email of variants) {
          contacts.push({
            company: name, website, domain, email, phone,
            address: addr, city: cityName, country,
            businessType: type, source: 'google_places', query, snippet: addr,
          });
        }
      }

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      console.log(`📍 [SCRAPER] Places "${query}" → ${places.length} businesses, ${inserted} new contacts`);
    } catch (err) {
      console.error(`❌ [SCRAPER] Places error for "${query}":`, err.response?.data?.error?.message || err.message);
    }
    await sleep(SCRAPE_DELAY_MS);
  }

  return totalInserted;
}

// ── 2. Google Custom Search API ─────────────────────────────────────────────
async function scrapeGoogleCSE() {
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
    console.log('⚠️  [SCRAPER] Google CSE: GOOGLE_API_KEY or GOOGLE_CSE_ID not set — skipping');
    return 0;
  }

  const selected = pickRandom(CSE_QUERIES, CSE_QUERIES_PER_RUN);
  let totalInserted = 0;

  for (const q of selected) {
    try {
      const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: { key: GOOGLE_API_KEY, cx: GOOGLE_CSE_ID, q, num: 10 },
        timeout: 15000,
      });

      const items = res.data.items || [];
      const contacts = [];

      for (const item of items) {
        const domain = extractDomain(item.link);
        if (!domain) continue;
        const emails = await buildEmailList(domain, item.link);
        for (const email of emails) {
          contacts.push({
            company: item.title || domain, website: item.link, domain, email,
            source: 'google_cse', query: q, snippet: item.snippet || null,
          });
        }
        await sleep(200);
      }

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      console.log(`🔍 [SCRAPER] CSE "${q.slice(0, 50)}..." → ${items.length} results, ${inserted} new contacts`);
    } catch (err) {
      if (err.response?.status === 429) {
        console.warn('⚠️  [SCRAPER] CSE daily quota hit — stopping CSE for this run');
        break;
      }
      if (err.response?.status === 403) {
        console.warn('⚠️  [SCRAPER] CSE access denied (account mismatch) — skipping CSE source');
        break;
      }
      console.error(`❌ [SCRAPER] CSE error:`, err.response?.data?.error?.message || err.message);
    }
    await sleep(SCRAPE_DELAY_MS * 2);
  }

  return totalInserted;
}

// ── 3. DuckDuckGo HTML scraping ─────────────────────────────────────────────
// HIGH-INTENT queries — companies actively seeking outsourcing / BPO services
const DDG_QUERIES = [
  // ── Direct buying-intent signals ─────────────────────────────────────────
  '"outsource data entry" company "contact us" -site:linkedin.com',
  '"data entry outsourcing" services "get a quote" -site:linkedin.com',
  '"back office outsourcing" company "contact" -site:linkedin.com',
  '"document processing" outsource company "contact us" -site:linkedin.com',
  '"virtual assistant" company "hire" "contact us" -site:linkedin.com',
  '"BPO services" "contact us" pricing -site:linkedin.com -site:clutch.co',
  '"outsource payroll" services "contact us" -site:linkedin.com',
  '"outsource bookkeeping" services "contact us" -site:linkedin.com',
  '"outsource invoicing" company "contact us" -site:linkedin.com',
  '"outsource admin" team "contact us" "quote" -site:linkedin.com',
  '"data capture" outsourcing "contact us" -site:linkedin.com',
  '"claims processing" outsource "contact us" -site:linkedin.com',
  '"offshore data" processing company "contact us" -site:linkedin.com',
  '"medical billing" outsource company "contact us" -site:linkedin.com',
  '"legal transcription" services "contact us" -site:linkedin.com',
  // ── Finance & Insurance — biggest BPO buyers ─────────────────────────────
  'insurance company UK "data processing" OR "outsource" "contact us" -site:linkedin.com',
  'financial services firm UK "back office" OR "outsource" "contact us" -site:linkedin.com',
  'accounting firm UK "outsource" OR "bookkeeping" "contact us" -site:linkedin.com',
  'payroll company UK "contact us" "data" -site:linkedin.com',
  'fintech company UK "contact us" "data" OR "operations" -site:linkedin.com',
  'insurance company South Africa "contact us" "admin" -site:linkedin.com',
  'accounting firm South Africa "contact us" "bookkeeping" -site:linkedin.com',
  'financial services South Africa "contact us" "data" -site:linkedin.com',
  'insurance company Australia "contact us" "claims" OR "admin" -site:linkedin.com',
  'accounting firm Australia "outsource" OR "bookkeeping" "contact us" -site:linkedin.com',
  'insurance broker USA "contact us" "admin" OR "data" -site:linkedin.com',
  'CPA firm USA "outsource" OR "bookkeeping" "contact us" -site:linkedin.com',
  'asset management company USA "contact us" "data" -site:linkedin.com',
  // ── Legal — document-heavy, high BPO adoption ────────────────────────────
  'law firm UK "outsource" OR "document" "contact us" -site:linkedin.com',
  'law firm USA "admin support" OR "outsource" "contact us" -site:linkedin.com',
  'law firm Australia "document" OR "transcription" "contact us" -site:linkedin.com',
  'law firm South Africa "admin" OR "documents" "contact us" -site:linkedin.com',
  'law firm Canada "contact us" "admin" OR "records" -site:linkedin.com',
  // ── E-Commerce — product data, order processing, customer support ─────────
  'e-commerce company UK "product data" OR "data entry" "contact us" -site:linkedin.com',
  'e-commerce brand USA "outsource" OR "catalogue" "contact us" -site:linkedin.com',
  'online retailer Australia "product listing" OR "data" "contact us" -site:linkedin.com',
  'wholesale distributor USA "data entry" OR "invoicing" "contact us" -site:linkedin.com',
  'e-commerce company South Africa "contact us" "admin" -site:linkedin.com',
  // ── Logistics — invoicing, documentation, freight data ───────────────────
  'logistics company UK "contact us" "invoicing" OR "admin" -site:linkedin.com',
  'freight forwarding company UK "documents" OR "admin" "contact us" -site:linkedin.com',
  'logistics company South Africa "contact us" "invoices" -site:linkedin.com',
  'supply chain company USA "contact us" "data" OR "admin" -site:linkedin.com',
  'third-party logistics company Australia "contact us" -site:linkedin.com',
  // ── Technology & SaaS — customer support, data ops outsourcing ───────────
  'software company UK "contact us" "back office" OR "data ops" -site:linkedin.com',
  'SaaS company USA "contact us" "support" OR "data" -site:linkedin.com',
  'IT services company UK "outsource" OR "admin" "contact us" -site:linkedin.com',
  'technology company Australia "contact us" "operations" OR "data" -site:linkedin.com',
  // ── Recruitment & HR — candidate data, onboarding, payroll ───────────────
  'recruitment agency UK "contact us" "admin" OR "data entry" -site:linkedin.com',
  'staffing agency USA "contact us" "admin" OR "payroll" -site:linkedin.com',
  'HR outsourcing company UK "contact us" -site:linkedin.com',
  'recruitment company Australia "contact us" "data" -site:linkedin.com',
  // ── Property Management — tenant data, lease admin ────────────────────────
  'property management company UK "contact us" "admin" OR "data" -site:linkedin.com',
  'property management company USA "contact us" "tenant" OR "invoices" -site:linkedin.com',
  'property management company Australia "contact us" -site:linkedin.com',
  'commercial real estate company UK "contact us" "admin" -site:linkedin.com',
  // ── Emerging markets ──────────────────────────────────────────────────────
  'financial services company Nigeria "contact us" -site:linkedin.com',
  'insurance company Kenya "contact us" "admin" -site:linkedin.com',
  'accounting firm Ghana "contact us" -site:linkedin.com',
  'logistics company East Africa "contact us" "admin" -site:linkedin.com',
  'insurance company Ireland "contact us" "claims" -site:linkedin.com',
  'financial services New Zealand "contact us" "data" -site:linkedin.com',
];

async function scrapeDuckDuckGo() {
  const selected = pickRandom(DDG_QUERIES, DDG_QUERIES_PER_RUN);
  let totalInserted = 0;

  for (const q of selected) {
    try {
      const res = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: 20000,
      });

      const $ = cheerio.load(res.data);

      // Collect domain+link pairs first, then resolve real emails in parallel
      const items = [];
      $('.result').each((_, el) => {
        const titleEl = $(el).find('.result__title a');
        const snippet = $(el).find('.result__snippet').text().trim();
        let link = titleEl.attr('href') || '';
        if (link.includes('uddg=')) {
          try { link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]); } catch {}
        }
        const domain = extractDomain(link);
        if (!domain || domain.includes('duckduckgo') || domain.includes('google')) return;
        items.push({ domain, link, title: titleEl.text().trim() || domain, snippet });
      });

      // Try real email extraction for each domain (with concurrency limit)
      const inferredType = inferBusinessType(q);
      const contacts = [];
      for (const item of items) {
        const emails = await buildEmailList(item.domain, item.link);
        for (const email of emails) {
          contacts.push({
            company: item.title, website: item.link, domain: item.domain, email,
            source: 'duckduckgo', query: q, snippet: item.snippet || null,
            businessType: inferredType || undefined,
          });
        }
        await sleep(300); // small gap between page fetches
      }

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      const realCount = contacts.filter(c => c.business_type === 'verified_email').length;
      console.log(`🦆 [SCRAPER] DDG "${q.slice(0, 50)}..." → ${items.length} sites, ${realCount} real emails found, ${inserted} new contacts`);
    } catch (err) {
      if (err.response?.status === 429 || err.response?.status === 403) {
        console.warn('⚠️  [SCRAPER] DuckDuckGo rate-limited — pausing DDG this run');
        break;
      }
      console.error(`❌ [SCRAPER] DDG error for "${q.slice(0,40)}":`, err.message);
    }
    await sleep(SCRAPE_DELAY_MS * 3);
  }

  return totalInserted;
}

// ── 4. SerpAPI extended — HIGH-VALUE BPO buyer queries ───────────────────────
// Focus: companies actively searching for outsourcing, OR in high-BPO industries
const SERP_BPO_QUERIES = [
  // Direct outsourcing intent — highest conversion rate
  '"outsource data entry" company "contact" -site:linkedin.com -site:clutch.co',
  '"back office outsourcing" services "get quote" OR "contact us" -site:linkedin.com',
  '"data entry company" "hire" OR "outsource" "contact us" -site:linkedin.com',
  '"BPO company" "contact us" "pricing" OR "quote" -site:linkedin.com -site:clutch.co',
  '"virtual assistant services" "contact us" "hire" -site:linkedin.com',
  // Finance & Insurance — highest BPO spend globally
  'insurance company "outsource claims" OR "outsource admin" "contact us" -site:linkedin.com',
  'financial services company UK "back office" "contact us" -site:linkedin.com',
  'accounting firm "outsource bookkeeping" OR "data capture" "contact" -site:linkedin.com',
  'payroll company "data entry" OR "outsource" "contact us" -site:linkedin.com',
  'fintech startup "operations" OR "back office" "contact us" -site:linkedin.com',
  // E-commerce — product data and order management
  'e-commerce company "product data entry" OR "catalogue management" "contact us" -site:linkedin.com',
  'online retailer "outsource" OR "data entry" "contact us" -site:linkedin.com',
  // Logistics — freight docs, invoicing
  'logistics company "outsource invoicing" OR "data entry" "contact us" -site:linkedin.com',
  'freight company "document processing" OR "admin" "contact us" -site:linkedin.com',
  // Healthcare admin — billing, records
  'healthcare company "medical billing" OR "outsource admin" "contact us" -site:linkedin.com',
];

async function scrapeViaSerpAPI() {
  const SERPAPI_KEY = process.env.SERPAPI_KEY;
  if (!SERPAPI_KEY) return 0;

  const selected = pickRandom(SERP_BPO_QUERIES, 5);
  let totalInserted = 0;

  for (const q of selected) {
    try {
      const res = await axios.get('https://serpapi.com/search', {
        params: { q, api_key: SERPAPI_KEY, engine: 'google', num: 100, hl: 'en', gl: 'us' },
        timeout: 20000,
      });

      const results = res.data.organic_results || [];
      const contacts = [];
      const inferredType = inferBusinessType(q);

      for (const r of results) {
        const domain = extractDomain(r.link);
        if (!domain) continue;
        const emails = await buildEmailList(domain, r.link);
        for (const email of emails) {
          contacts.push({
            company: r.title || domain, website: r.link, domain, email,
            source: 'serpapi_bpo', query: q, snippet: r.snippet || null,
            businessType: inferredType || undefined,
          });
        }
        await sleep(200);
      }

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      console.log(`🔎 [SCRAPER] SerpAPI BPO "${q.slice(0,50)}..." → ${results.length} results, ${inserted} new`);
    } catch (err) {
      console.error(`❌ [SCRAPER] SerpAPI BPO error:`, err.message);
    }
    await sleep(SCRAPE_DELAY_MS);
  }

  return totalInserted;
}

// ── Main orchestrator ────────────────────────────────────────────────────────
// ── 5. Bing Web Search scraping ─────────────────────────────────────────────
// HIGH-INTENT BPO buyer queries — companies with outsourcing needs
const BING_QUERIES = [
  // ── Direct buying-intent ──────────────────────────────────────────────────
  '"outsource data entry" company "contact us" -site:linkedin.com',
  '"back office outsourcing" "contact us" pricing -site:linkedin.com',
  '"data capture" services company "contact us" -site:linkedin.com',
  '"document processing" company "contact" "quote" -site:linkedin.com',
  '"outsource payroll" company "contact us" -site:linkedin.com',
  '"offshore back office" services "contact us" -site:linkedin.com',
  '"virtual assistant" team "hire" "contact us" -site:linkedin.com',
  '"BPO services" company "contact us" -site:linkedin.com -site:clutch.co',
  // ── Finance & Insurance — South Africa ───────────────────────────────────
  'insurance company South Africa "outsource" OR "admin" "contact us" -site:linkedin.com',
  'accounting firm South Africa "bookkeeping" OR "outsource" "contact us" -site:linkedin.com',
  'financial services company South Africa "contact us" "data" -site:linkedin.com',
  'payroll company South Africa "contact us" -site:linkedin.com',
  'asset management company South Africa "contact us" -site:linkedin.com',
  'fintech company South Africa "contact us" "operations" -site:linkedin.com',
  // ── Finance & Insurance — UK ──────────────────────────────────────────────
  'insurance company UK "outsource" OR "claims" "contact us" -site:linkedin.com',
  'accounting firm UK "outsource" OR "bookkeeping" "contact us" -site:linkedin.com',
  'financial services company UK "back office" "contact us" -site:linkedin.com',
  'payroll company UK "contact us" "data" -site:linkedin.com',
  'fintech company UK "contact us" "operations" -site:linkedin.com',
  // ── Finance & Insurance — USA ─────────────────────────────────────────────
  'insurance company USA "outsource claims" OR "admin" "contact us" -site:linkedin.com',
  'CPA firm USA "outsource" OR "bookkeeping" "contact us" -site:linkedin.com',
  'financial services company USA "back office" "contact us" -site:linkedin.com',
  'staffing agency USA "admin" OR "data" "contact us" -site:linkedin.com',
  // ── Finance & Insurance — Australia ───────────────────────────────────────
  'insurance company Australia "contact us" "admin" OR "claims" -site:linkedin.com',
  'accounting firm Australia "bookkeeping" OR "data" "contact us" -site:linkedin.com',
  // ── Legal ─────────────────────────────────────────────────────────────────
  'law firm UK "document" OR "outsource" "contact us" -site:linkedin.com',
  'law firm South Africa "admin" OR "documents" "contact us" -site:linkedin.com',
  'law firm USA "admin support" "contact us" -site:linkedin.com',
  'law firm Australia "contact us" "records" -site:linkedin.com',
  // ── E-Commerce ────────────────────────────────────────────────────────────
  'e-commerce company UK "product data" OR "data entry" "contact us" -site:linkedin.com',
  'e-commerce company USA "outsource" OR "catalogue" "contact us" -site:linkedin.com',
  'online retailer Australia "product listing" OR "data" "contact us" -site:linkedin.com',
  'wholesale distributor USA "invoicing" OR "data entry" "contact us" -site:linkedin.com',
  // ── Logistics ─────────────────────────────────────────────────────────────
  'logistics company UK "invoicing" OR "admin" "contact us" -site:linkedin.com',
  'freight forwarding UK "documents" OR "admin" "contact us" -site:linkedin.com',
  'logistics company South Africa "invoices" "contact us" -site:linkedin.com',
  'supply chain company USA "data" OR "admin" "contact us" -site:linkedin.com',
  // ── HR & Recruitment ──────────────────────────────────────────────────────
  'recruitment agency UK "admin" OR "data" "contact us" -site:linkedin.com',
  'staffing company USA "admin" OR "payroll" "contact us" -site:linkedin.com',
  'HR outsourcing company UK "contact us" -site:linkedin.com',
  // ── Technology ────────────────────────────────────────────────────────────
  'software company UK "back office" OR "data ops" "contact us" -site:linkedin.com',
  'SaaS company USA "operations" OR "data" "contact us" -site:linkedin.com',
  'IT services company Australia "outsource" OR "admin" "contact us" -site:linkedin.com',
  // ── Property Management ───────────────────────────────────────────────────
  'property management company UK "admin" OR "tenant" "contact us" -site:linkedin.com',
  'property management company USA "invoices" OR "data" "contact us" -site:linkedin.com',
  // ── Emerging Markets ──────────────────────────────────────────────────────
  'insurance company Nigeria "contact us" "admin" -site:linkedin.com',
  'accounting firm Kenya "bookkeeping" "contact us" -site:linkedin.com',
  'financial services Ghana "contact us" -site:linkedin.com',
  'logistics company East Africa "admin" "contact us" -site:linkedin.com',
  'insurance company Ireland "claims" OR "admin" "contact us" -site:linkedin.com',
];

async function scrapeBing() {
  const selected = pickRandom(BING_QUERIES, BING_QUERIES_PER_RUN);
  let totalInserted = 0;

  for (const q of selected) {
    try {
      const res = await axios.get('https://www.bing.com/search', {
        params: { q, count: 20, mkt: 'en-US' },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate',
        },
        timeout: 20000,
      });

      const $ = cheerio.load(res.data);
      const contacts = [];

      $('#b_results .b_algo').each((_, el) => {
        const link    = $(el).find('h2 a').attr('href') || '';
        const title   = $(el).find('h2 a').text().trim();
        const snippet = $(el).find('.b_caption p').text().trim();
        const domain  = extractDomain(link);
        if (!domain || domain.includes('bing') || domain.includes('microsoft') || domain.includes('linkedin')) return;
        for (const email of buildEmailVariants(domain)) {
          contacts.push({ company: title, website: link, domain, email, source: 'bing', query: q, snippet: snippet || null });
        }
      });

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      console.log(`🔷 [SCRAPER] Bing "${q.slice(0, 50)}..." → ${Math.floor(contacts.length / EMAIL_PREFIXES.length)} sites, ${inserted} new`);
    } catch (err) {
      if (err.response?.status === 429 || err.response?.status === 403) {
        console.warn('⚠️  [SCRAPER] Bing rate-limited — stopping this run');
        break;
      }
      console.error(`❌ [SCRAPER] Bing error:`, err.message);
    }
    await sleep(SCRAPE_DELAY_MS * 3);
  }

  return totalInserted;
}

// ── 6. YouTube Data API — business channels with contact emails ──────────────
const YOUTUBE_SEARCH_TERMS = [
  'accounting firm South Africa business',
  'law firm South Africa business contact',
  'medical clinic South Africa business',
  'insurance company South Africa business',
  'real estate agency South Africa business',
  'recruitment agency UK business',
  'financial services company UK',
  'HR consulting firm UK',
  'IT services company UK business',
  'logistics company USA business',
  'dental practice South Africa',
  'property management company South Africa',
  'bookkeeping service small business',
  'payroll services company',
  'virtual assistant agency business',
];

async function scrapeYouTube() {
  if (!GOOGLE_API_KEY) {
    console.log('⚠️  [SCRAPER] YouTube: GOOGLE_API_KEY not set — skipping');
    return 0;
  }
  const selected = pickRandom(YOUTUBE_SEARCH_TERMS, YT_QUERIES_PER_RUN);
  let totalInserted = 0;
  const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
  const SKIP_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'googlemail.com']);

  for (const q of selected) {
    try {
      // Step 1: search channels
      const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: { key: GOOGLE_API_KEY, q, type: 'channel', part: 'snippet', maxResults: 20, relevanceLanguage: 'en' },
        timeout: 15000,
      });
      const channelIds = (searchRes.data.items || [])
        .map(i => i.snippet?.channelId || i.id?.channelId)
        .filter(Boolean);
      if (channelIds.length === 0) continue;

      // Step 2: get channel details (description + branding)
      const detailsRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: { key: GOOGLE_API_KEY, id: channelIds.join(','), part: 'snippet,brandingSettings' },
        timeout: 15000,
      });

      const contacts = [];
      for (const ch of (detailsRes.data.items || [])) {
        const title   = ch.snippet?.title || '';
        const desc    = ch.snippet?.description || '';
        const country = ch.snippet?.country || null;

        // Extract emails directly from description
        const foundEmails = (desc.match(EMAIL_RE) || []).filter(e => !SKIP_DOMAINS.has(e.split('@')[1]));
        for (const email of foundEmails) {
          contacts.push({ company: title, website: `https://www.youtube.com/channel/${ch.id}`, domain: email.split('@')[1], email, source: 'youtube_api', query: q, snippet: desc.slice(0, 200), country });
        }

        // Also try the custom website link in branding
        const siteLink = ch.brandingSettings?.channel?.unsubscribedTrailer
          || ch.brandingSettings?.channel?.featuredChannelsUrls?.[0]
          || null;
        if (siteLink) {
          const domain = extractDomain(siteLink);
          if (domain && !SKIP_DOMAINS.has(domain)) {
            for (const email of buildEmailVariants(domain)) {
              contacts.push({ company: title, website: siteLink, domain, email, source: 'youtube_api', query: q, snippet: desc.slice(0, 200), country });
            }
          }
        }
      }

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      console.log(`📺 [SCRAPER] YouTube "${q}" → ${channelIds.length} channels, ${inserted} new contacts`);
    } catch (err) {
      if (err.response?.status === 403) {
        console.warn('⚠️  [SCRAPER] YouTube quota exceeded — stopping');
        break;
      }
      console.error(`❌ [SCRAPER] YouTube error:`, err.message);
    }
    await sleep(SCRAPE_DELAY_MS * 2);
  }

  return totalInserted;
}

// ── 7. Facebook Business Pages — found via DuckDuckGo search ────────────────
const FACEBOOK_QUERIES = [
  'site:facebook.com "accounting firm" "South Africa" "email" OR "contact"',
  'site:facebook.com "law firm" "South Africa" contact',
  'site:facebook.com "medical clinic" "South Africa" contact',
  'site:facebook.com "insurance" "South Africa" "email"',
  'site:facebook.com "recruitment agency" UK contact',
  'site:facebook.com "financial services" UK email',
  'site:facebook.com "logistics" company contact email',
  'site:facebook.com "HR consulting" "contact" "email"',
  'site:facebook.com "real estate" "South Africa" contact',
  'site:facebook.com "dental" "South Africa" contact email',
  'site:facebook.com "bookkeeping" company contact email',
  'site:facebook.com "property management" "South Africa" contact',
];

async function scrapeFacebookViaSearch() {
  const selected = pickRandom(FACEBOOK_QUERIES, FB_QUERIES_PER_RUN);
  let totalInserted = 0;
  const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
  const SKIP_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'facebook.com', 'icloud.com']);

  for (const q of selected) {
    try {
      const res = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: 20000,
      });

      const $ = cheerio.load(res.data);
      const contacts = [];

      $('.result').each((_, el) => {
        const titleEl = $(el).find('.result__title a');
        const snippet = $(el).find('.result__snippet').text().trim();
        let link = titleEl.attr('href') || '';
        if (link.includes('uddg=')) { try { link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]); } catch {} }

        const title = titleEl.text().trim();

        // Extract any business emails from the snippet
        const emails = (snippet.match(EMAIL_RE) || []).filter(e => !SKIP_DOMAINS.has(e.split('@')[1]));
        for (const email of emails) {
          contacts.push({ company: title, website: link, domain: email.split('@')[1], email, source: 'facebook_search', query: q, snippet: snippet || null });
        }

        // If no email in snippet but there's a website link in the snippet, infer email from domain
        const urlInSnippet = (snippet.match(/https?:\/\/[^\s]+/g) || []).find(u => !u.includes('facebook'));
        if (emails.length === 0 && urlInSnippet) {
          const domain = extractDomain(urlInSnippet);
          if (domain && !SKIP_DOMAINS.has(domain)) {
            for (const email of buildEmailVariants(domain)) {
              contacts.push({ company: title, website: urlInSnippet, domain, email, source: 'facebook_search', query: q, snippet: snippet || null });
            }
          }
        }
      });

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      console.log(`📘 [SCRAPER] Facebook search "${q.slice(0, 50)}..." → ${inserted} new contacts`);
    } catch (err) {
      if (err.response?.status === 429 || err.response?.status === 403) {
        console.warn('⚠️  [SCRAPER] Facebook search rate-limited — stopping');
        break;
      }
      console.error(`❌ [SCRAPER] Facebook search error:`, err.message);
    }
    await sleep(SCRAPE_DELAY_MS * 3);
  }

  return totalInserted;
}

// ── 8. Business Directories — Clutch, Cylex, Hotfrog, Manta, Yell, GoodFirms, Bark, etc ──
const DIRECTORY_TARGETS = [
  // Clutch.co — BPO & professional services
  { url: 'https://clutch.co/bpo/data-entry',                         source: 'clutch',         label: 'Clutch Data Entry' },
  { url: 'https://clutch.co/bpo/document-management',                source: 'clutch',         label: 'Clutch Doc Mgmt' },
  { url: 'https://clutch.co/bpo',                                    source: 'clutch',         label: 'Clutch BPO' },
  { url: 'https://clutch.co/bpo/customer-service',                   source: 'clutch',         label: 'Clutch CX' },
  { url: 'https://clutch.co/it-services',                            source: 'clutch',         label: 'Clutch IT Services' },
  { url: 'https://clutch.co/accounting',                             source: 'clutch',         label: 'Clutch Accounting' },
  { url: 'https://clutch.co/hr',                                     source: 'clutch',         label: 'Clutch HR' },
  // GoodFirms — outsourcing & IT companies
  { url: 'https://www.goodfirms.co/directory/services/list-of-bpo-companies', source: 'goodfirms', label: 'GoodFirms BPO' },
  { url: 'https://www.goodfirms.co/directory/services/list-of-data-entry-companies', source: 'goodfirms', label: 'GoodFirms Data Entry' },
  { url: 'https://www.goodfirms.co/directory/services/virtual-assistant-companies', source: 'goodfirms', label: 'GoodFirms VA' },
  // Manta — US small business directory
  { url: 'https://www.manta.com/mb_43_A4D7/accounting_bookkeeping_and_auditing',  source: 'manta', label: 'Manta Accounting' },
  { url: 'https://www.manta.com/mb_43_A4B7/legal_services',                       source: 'manta', label: 'Manta Legal' },
  { url: 'https://www.manta.com/mb_43_B12/insurance_carriers_and_agents',         source: 'manta', label: 'Manta Insurance' },
  { url: 'https://www.manta.com/mb_43_A4/medical_and_dental',                     source: 'manta', label: 'Manta Medical' },
  { url: 'https://www.manta.com/mb_43_A4C9/real_estate',                          source: 'manta', label: 'Manta Real Estate' },
  // Yell.com — UK business directory
  { url: 'https://www.yell.com/s/accountants-england.html',          source: 'yell_uk',        label: 'Yell UK Accountants' },
  { url: 'https://www.yell.com/s/solicitors-england.html',           source: 'yell_uk',        label: 'Yell UK Solicitors' },
  { url: 'https://www.yell.com/s/insurance+brokers-england.html',    source: 'yell_uk',        label: 'Yell UK Insurance' },
  { url: 'https://www.yell.com/s/dentists-england.html',             source: 'yell_uk',        label: 'Yell UK Dentists' },
  { url: 'https://www.yell.com/s/mortgage+brokers-england.html',     source: 'yell_uk',        label: 'Yell UK Mortgage' },
  { url: 'https://www.yell.com/s/estate+agents-england.html',        source: 'yell_uk',        label: 'Yell UK Estate Agents' },
  // Bark.com — service business leads
  { url: 'https://www.bark.com/en/gb/accountants/',                  source: 'bark',           label: 'Bark UK Accountants' },
  { url: 'https://www.bark.com/en/gb/solicitors/',                   source: 'bark',           label: 'Bark UK Solicitors' },
  { url: 'https://www.bark.com/en/gb/bookkeepers/',                  source: 'bark',           label: 'Bark UK Bookkeepers' },
  { url: 'https://www.bark.com/en/gb/hr-consultants/',               source: 'bark',           label: 'Bark UK HR' },
  { url: 'https://www.bark.com/en/us/accountants/',                  source: 'bark',           label: 'Bark US Accountants' },
  { url: 'https://www.bark.com/en/za/accountants/',                  source: 'bark',           label: 'Bark SA Accountants' },
  // Cylex directories — US & international
  { url: 'https://www.cylex.us.com/companies/outsourcing.html',      source: 'cylex',          label: 'Cylex Outsourcing' },
  { url: 'https://www.cylex.us.com/companies/accounting.html',       source: 'cylex',          label: 'Cylex Accounting' },
  { url: 'https://www.cylex.us.com/companies/law-firm.html',         source: 'cylex',          label: 'Cylex Law' },
  { url: 'https://www.cylex.us.com/companies/insurance.html',        source: 'cylex',          label: 'Cylex Insurance' },
  // Hotfrog SA
  { url: 'https://www.hotfrog.co.za/company/accounting',             source: 'hotfrog_sa',     label: 'Hotfrog SA Accounting' },
  { url: 'https://www.hotfrog.co.za/company/law-firm',               source: 'hotfrog_sa',     label: 'Hotfrog SA Law' },
  { url: 'https://www.hotfrog.co.za/company/medical',                source: 'hotfrog_sa',     label: 'Hotfrog SA Medical' },
  { url: 'https://www.hotfrog.co.za/company/insurance',              source: 'hotfrog_sa',     label: 'Hotfrog SA Insurance' },
  { url: 'https://www.hotfrog.co.za/company/real-estate',            source: 'hotfrog_sa',     label: 'Hotfrog SA Real Estate' },
  { url: 'https://www.hotfrog.co.za/company/recruitment',            source: 'hotfrog_sa',     label: 'Hotfrog SA Recruitment' },
  // Bizcommunity SA
  { url: 'https://www.bizcommunity.com/companies/',                  source: 'bizcommunity',   label: 'Bizcommunity SA' },
  { url: 'https://www.bizcommunity.com/companies/1/196/',            source: 'bizcommunity',   label: 'Bizcommunity IT' },
  { url: 'https://www.bizcommunity.com/companies/1/financ/',         source: 'bizcommunity',   label: 'Bizcommunity Finance' },
  // SA Yellow Pages
  { url: 'https://www.yellowpages.co.za/yp/accountants',             source: 'yellowpages_sa', label: 'YP SA Accountants' },
  { url: 'https://www.yellowpages.co.za/yp/attorneys',               source: 'yellowpages_sa', label: 'YP SA Attorneys' },
  { url: 'https://www.yellowpages.co.za/yp/insurance',               source: 'yellowpages_sa', label: 'YP SA Insurance' },
  { url: 'https://www.yellowpages.co.za/yp/medical-practitioners',   source: 'yellowpages_sa', label: 'YP SA Medical' },
  { url: 'https://www.yellowpages.co.za/yp/estate-agents',           source: 'yellowpages_sa', label: 'YP SA Estate Agents' },
  { url: 'https://www.yellowpages.co.za/yp/bookkeeping',             source: 'yellowpages_sa', label: 'YP SA Bookkeeping' },
  // Superpages — US businesses
  { url: 'https://www.superpages.com/accounting-firms',              source: 'superpages',     label: 'Superpages Accounting' },
  { url: 'https://www.superpages.com/insurance',                     source: 'superpages',     label: 'Superpages Insurance' },
  { url: 'https://www.superpages.com/lawyers',                       source: 'superpages',     label: 'Superpages Lawyers' },
  // Kompass — international B2B directory
  { url: 'https://za.kompass.com/s/business-services/2/',            source: 'kompass',        label: 'Kompass SA Business' },
  { url: 'https://gb.kompass.com/s/accounting-auditing-taxation/040601/', source: 'kompass',  label: 'Kompass UK Accounting' },
  { url: 'https://us.kompass.com/s/outsourcing/020501/',             source: 'kompass',        label: 'Kompass US Outsourcing' },
  // Thomasnet — US industrial & service businesses
  { url: 'https://www.thomasnet.com/nsearch.html?cov=NA&what=data+entry+services', source: 'thomasnet', label: 'Thomasnet Data Entry' },
  { url: 'https://www.thomasnet.com/nsearch.html?cov=NA&what=business+process+outsourcing', source: 'thomasnet', label: 'Thomasnet BPO' },
  // Expertise.com — US local professional services
  { url: 'https://www.expertise.com/accounting',                     source: 'expertise',      label: 'Expertise Accounting' },
  { url: 'https://www.expertise.com/legal',                          source: 'expertise',      label: 'Expertise Legal' },
  // Approved Business (UK)
  { url: 'https://www.approvedbusiness.co.uk/category/accountants',  source: 'approved_biz',   label: 'Approved Biz Accountants UK' },
  { url: 'https://www.approvedbusiness.co.uk/category/solicitors',   source: 'approved_biz',   label: 'Approved Biz Solicitors UK' },
  // FreeIndex (UK)
  { url: 'https://www.freeindex.co.uk/category/accountants/',        source: 'freeindex',      label: 'FreeIndex UK Accountants' },
  { url: 'https://www.freeindex.co.uk/category/solicitors/',         source: 'freeindex',      label: 'FreeIndex UK Solicitors' },
  { url: 'https://www.freeindex.co.uk/category/recruitment-agencies/', source: 'freeindex',    label: 'FreeIndex UK Recruitment' },
];

async function scrapeBusinessDirectories() {
  let totalInserted = 0;
  const selected = pickRandom(DIRECTORY_TARGETS, 8);

  for (const target of selected) {
    try {
      const res = await axios.get(target.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 25000,
      });

      const $ = cheerio.load(res.data);
      const contacts = [];
      const baseDomain = extractDomain(target.url) || '';
      const seen = new Set();

      // Generic approach: extract any external links pointing to company websites
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        if (!href.startsWith('http')) return;
        const domain = extractDomain(href);
        if (!domain || domain === baseDomain || domain.includes('google') || domain.includes('linkedin') || domain.includes('facebook')) return;
        if (seen.has(domain)) return;
        seen.add(domain);
        for (const email of buildEmailVariants(domain)) {
          contacts.push({ company: text || domain, website: href, domain, email, source: target.source, query: target.url, snippet: `Listed on ${target.label}` });
        }
      });

      // Also try to find any emails directly on the page
      const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
      const pageText = $.text();
      const SKIP_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', baseDomain]);
      const foundEmails = (pageText.match(EMAIL_RE) || []).filter(e => !SKIP_DOMAINS.has(e.split('@')[1]));
      for (const email of foundEmails) {
        const domain = email.split('@')[1];
        if (!seen.has(email)) {
          seen.add(email);
          contacts.push({ company: domain, website: null, domain, email, source: target.source, query: target.url, snippet: `Found on ${target.label}` });
        }
      }

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      console.log(`📂 [SCRAPER] Directory ${target.label} → ${contacts.length} candidates, ${inserted} new contacts`);
    } catch (err) {
      if (err.response?.status === 429 || err.response?.status === 403) {
        console.warn(`⚠️  [SCRAPER] Directory ${target.label} blocked — skipping`);
        continue;
      }
      console.error(`❌ [SCRAPER] Directory ${target.label} error:`, err.message);
    }
    await sleep(SCRAPE_DELAY_MS * 4);
  }

  return totalInserted;
}

// ── 9. Instagram Business Profiles ──────────────────────────────────────────
const INSTAGRAM_QUERIES = [
  'site:instagram.com "accounting firm" "South Africa" "email"',
  'site:instagram.com "law firm" "South Africa" contact email',
  'site:instagram.com "medical clinic" "South Africa" "email"',
  'site:instagram.com "insurance" "South Africa" "contact" "email"',
  'site:instagram.com "real estate" "South Africa" "email" contact',
  'site:instagram.com "recruitment agency" UK "email" contact',
  'site:instagram.com "financial services" UK "email"',
  'site:instagram.com "dental" "South Africa" "contact" email',
  'site:instagram.com "bookkeeping" company "email"',
  'site:instagram.com "property management" "South Africa" "email"',
  'site:instagram.com "HR consulting" company "email" contact',
  'site:instagram.com "logistics" company "South Africa" "email"',
  'site:instagram.com "IT services" company "South Africa" email',
  'site:instagram.com "accounting" firm UK "email" "contact"',
  'site:instagram.com "mortgage broker" UK "email" contact',
];

async function scrapeInstagramViaSearch() {
  const IG_QUERIES_PER_RUN = parseInt(process.env.IG_QUERIES_PER_RUN || '8', 10);
  const selected = pickRandom(INSTAGRAM_QUERIES, IG_QUERIES_PER_RUN);
  let totalInserted = 0;
  const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
  const SKIP = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'instagram.com', 'icloud.com']);

  for (const q of selected) {
    try {
      const res = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: 20000,
      });

      const $ = cheerio.load(res.data);
      const contacts = [];

      $('.result').each((_, el) => {
        const titleEl = $(el).find('.result__title a');
        const snippet = $(el).find('.result__snippet').text().trim();
        let link = titleEl.attr('href') || '';
        if (link.includes('uddg=')) { try { link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]); } catch {} }
        const title = titleEl.text().trim();

        // Emails in snippet
        const emails = (snippet.match(EMAIL_RE) || []).filter(e => !SKIP.has(e.split('@')[1]));
        for (const email of emails) {
          contacts.push({ company: title, website: link, domain: email.split('@')[1], email, source: 'instagram_search', query: q, snippet: snippet || null });
        }

        // Website URL in snippet (linktree, bio links, etc.)
        const urlMatch = (snippet.match(/https?:\/\/(?!instagram)[^\s,)]+/g) || []).find(u => u.length > 10);
        if (emails.length === 0 && urlMatch) {
          const domain = extractDomain(urlMatch);
          if (domain && !SKIP.has(domain)) {
            for (const email of buildEmailVariants(domain)) {
              contacts.push({ company: title, website: urlMatch, domain, email, source: 'instagram_search', query: q, snippet: snippet || null });
            }
          }
        }
      });

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      console.log(`📸 [SCRAPER] Instagram search "${q.slice(0, 50)}..." → ${inserted} new contacts`);
    } catch (err) {
      if (err.response?.status === 429 || err.response?.status === 403) { console.warn('⚠️  [SCRAPER] Instagram search rate-limited'); break; }
      console.error(`❌ [SCRAPER] Instagram search error:`, err.message);
    }
    await sleep(SCRAPE_DELAY_MS * 3);
  }
  return totalInserted;
}

// ── 10. TikTok Business Profiles ─────────────────────────────────────────────
const TIKTOK_QUERIES = [
  'site:tiktok.com "accounting firm" "South Africa" "email" OR "contact"',
  'site:tiktok.com "law firm" "South Africa" contact email',
  'site:tiktok.com "medical" "South Africa" "email" contact',
  'site:tiktok.com "insurance" "South Africa" "email"',
  'site:tiktok.com "real estate" "South Africa" "email"',
  'site:tiktok.com "recruitment" agency UK "email"',
  'site:tiktok.com "financial services" UK "email" contact',
  'site:tiktok.com "dental" "South Africa" "contact" email',
  'site:tiktok.com "bookkeeping" "email" contact',
  'site:tiktok.com "property management" "email" contact',
  'site:tiktok.com "HR" company "South Africa" email',
  'site:tiktok.com "logistics" company "email" contact',
  'site:tiktok.com "IT services" "South Africa" email',
];

async function scrapeTikTokViaSearch() {
  const TT_QUERIES_PER_RUN = parseInt(process.env.TT_QUERIES_PER_RUN || '7', 10);
  const selected = pickRandom(TIKTOK_QUERIES, TT_QUERIES_PER_RUN);
  let totalInserted = 0;
  const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
  const SKIP = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'tiktok.com', 'icloud.com']);

  for (const q of selected) {
    try {
      const res = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: 20000,
      });

      const $ = cheerio.load(res.data);
      const contacts = [];

      $('.result').each((_, el) => {
        const titleEl = $(el).find('.result__title a');
        const snippet = $(el).find('.result__snippet').text().trim();
        let link = titleEl.attr('href') || '';
        if (link.includes('uddg=')) { try { link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]); } catch {} }
        const title = titleEl.text().trim();

        const emails = (snippet.match(EMAIL_RE) || []).filter(e => !SKIP.has(e.split('@')[1]));
        for (const email of emails) {
          contacts.push({ company: title, website: link, domain: email.split('@')[1], email, source: 'tiktok_search', query: q, snippet: snippet || null });
        }

        const urlMatch = (snippet.match(/https?:\/\/(?!tiktok)[^\s,)]+/g) || []).find(u => u.length > 10);
        if (emails.length === 0 && urlMatch) {
          const domain = extractDomain(urlMatch);
          if (domain && !SKIP.has(domain)) {
            for (const email of buildEmailVariants(domain)) {
              contacts.push({ company: title, website: urlMatch, domain, email, source: 'tiktok_search', query: q, snippet: snippet || null });
            }
          }
        }
      });

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      console.log(`🎵 [SCRAPER] TikTok search "${q.slice(0, 50)}..." → ${inserted} new contacts`);
    } catch (err) {
      if (err.response?.status === 429 || err.response?.status === 403) { console.warn('⚠️  [SCRAPER] TikTok search rate-limited'); break; }
      console.error(`❌ [SCRAPER] TikTok search error:`, err.message);
    }
    await sleep(SCRAPE_DELAY_MS * 3);
  }
  return totalInserted;
}

// ── 11. LinkedIn Company Pages ────────────────────────────────────────────────
// Search LinkedIn company pages via DDG — extract website from snippet/description
const LINKEDIN_QUERIES = [
  'site:linkedin.com/company "accounting firm" "South Africa" -jobs',
  'site:linkedin.com/company "law firm" "South Africa" -jobs',
  'site:linkedin.com/company "medical clinic" "South Africa" -jobs',
  'site:linkedin.com/company "insurance" "South Africa" -jobs',
  'site:linkedin.com/company "real estate" "South Africa" -jobs',
  'site:linkedin.com/company "recruitment agency" UK -jobs',
  'site:linkedin.com/company "financial services" UK -jobs',
  'site:linkedin.com/company "IT services" "South Africa" -jobs',
  'site:linkedin.com/company "logistics" "South Africa" -jobs',
  'site:linkedin.com/company "dental" "South Africa" -jobs',
  'site:linkedin.com/company "bookkeeping" "South Africa" -jobs',
  'site:linkedin.com/company "HR consulting" "South Africa" -jobs',
  'site:linkedin.com/company "property management" "South Africa" -jobs',
  'site:linkedin.com/company "accounting" UK -jobs',
  'site:linkedin.com/company "mortgage broker" UK -jobs',
  'site:linkedin.com/company "pharmaceutical" "South Africa" -jobs',
  'site:linkedin.com/company "management consulting" "South Africa" -jobs',
];

async function scrapeLinkedInViaSearch() {
  const LI_QUERIES_PER_RUN = parseInt(process.env.LI_QUERIES_PER_RUN || '8', 10);
  const selected = pickRandom(LINKEDIN_QUERIES, LI_QUERIES_PER_RUN);
  let totalInserted = 0;
  // LinkedIn snippets sometimes contain website URLs or company domains
  const URL_RE = /https?:\/\/(?!linkedin|lnkd\.in)[^\s,)>]+/g;
  const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
  const SKIP = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'linkedin.com', 'lnkd.in']);

  for (const q of selected) {
    try {
      const res = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: 20000,
      });

      const $ = cheerio.load(res.data);
      const contacts = [];

      $('.result').each((_, el) => {
        const titleEl = $(el).find('.result__title a');
        const snippet = $(el).find('.result__snippet').text().trim();
        let link = titleEl.attr('href') || '';
        if (link.includes('uddg=')) { try { link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]); } catch {} }
        const title = titleEl.text().trim();

        // Emails directly in snippet
        const emails = (snippet.match(EMAIL_RE) || []).filter(e => !SKIP.has(e.split('@')[1]));
        for (const email of emails) {
          contacts.push({ company: title, website: link, domain: email.split('@')[1], email, source: 'linkedin_search', query: q, snippet: snippet || null });
        }

        // Extract any website URLs mentioned in the LinkedIn snippet/description
        const urls = (snippet.match(URL_RE) || []).filter(u => u.length > 12);
        if (emails.length === 0) {
          for (const url of urls.slice(0, 2)) {
            const domain = extractDomain(url);
            if (!domain || SKIP.has(domain)) continue;
            for (const email of buildEmailVariants(domain)) {
              contacts.push({ company: title, website: url, domain, email, source: 'linkedin_search', query: q, snippet: snippet || null });
            }
          }
        }

        // If nothing found but we have a company name, try to guess domain from title
        if (emails.length === 0 && urls.length === 0 && title) {
          const guessed = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
          if (guessed.length > 4) {
            for (const tld of ['.com', '.co.za', '.co.uk']) {
              const domain = guessed + tld;
              for (const email of buildEmailVariants(domain)) {
                contacts.push({ company: title, website: null, domain, email, source: 'linkedin_search', query: q, snippet: snippet || null });
              }
            }
          }
        }
      });

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      console.log(`💼 [SCRAPER] LinkedIn search "${q.slice(0, 50)}..." → ${inserted} new contacts`);
    } catch (err) {
      if (err.response?.status === 429 || err.response?.status === 403) { console.warn('⚠️  [SCRAPER] LinkedIn search rate-limited'); break; }
      console.error(`❌ [SCRAPER] LinkedIn search error:`, err.message);
    }
    await sleep(SCRAPE_DELAY_MS * 3);
  }
  return totalInserted;
}

// ── 12. Twitter / X Business Accounts ────────────────────────────────────────
const TWITTER_QUERIES = [
  'site:twitter.com "accounting firm" "South Africa" "email" OR "contact"',
  'site:x.com "accounting firm" "South Africa" email contact',
  'site:twitter.com "law firm" "South Africa" email contact',
  'site:twitter.com "medical clinic" "South Africa" email',
  'site:twitter.com "insurance" "South Africa" "email"',
  'site:twitter.com "real estate agency" "South Africa" email',
  'site:twitter.com "recruitment agency" UK email contact',
  'site:twitter.com "financial services" UK email',
  'site:twitter.com "IT services" "South Africa" email contact',
  'site:twitter.com "logistics" company "South Africa" email',
  'site:twitter.com "bookkeeping" company "email" contact',
  'site:twitter.com "HR consulting" "South Africa" email',
];

async function scrapeTwitterViaSearch() {
  const TW_QUERIES_PER_RUN = parseInt(process.env.TW_QUERIES_PER_RUN || '7', 10);
  const selected = pickRandom(TWITTER_QUERIES, TW_QUERIES_PER_RUN);
  let totalInserted = 0;
  const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
  const SKIP = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'twitter.com', 'x.com', 't.co', 'icloud.com']);

  for (const q of selected) {
    try {
      const res = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: 20000,
      });

      const $ = cheerio.load(res.data);
      const contacts = [];

      $('.result').each((_, el) => {
        const titleEl = $(el).find('.result__title a');
        const snippet = $(el).find('.result__snippet').text().trim();
        let link = titleEl.attr('href') || '';
        if (link.includes('uddg=')) { try { link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]); } catch {} }
        const title = titleEl.text().trim();

        const emails = (snippet.match(EMAIL_RE) || []).filter(e => !SKIP.has(e.split('@')[1]));
        for (const email of emails) {
          contacts.push({ company: title, website: link, domain: email.split('@')[1], email, source: 'twitter_search', query: q, snippet: snippet || null });
        }

        // Twitter/X bios often contain website URLs
        const urlMatch = (snippet.match(/https?:\/\/(?!twitter|t\.co|x\.com)[^\s,)]+/g) || []).find(u => u.length > 10);
        if (emails.length === 0 && urlMatch) {
          const domain = extractDomain(urlMatch);
          if (domain && !SKIP.has(domain)) {
            for (const email of buildEmailVariants(domain)) {
              contacts.push({ company: title, website: urlMatch, domain, email, source: 'twitter_search', query: q, snippet: snippet || null });
            }
          }
        }
      });

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      console.log(`🐦 [SCRAPER] Twitter/X search "${q.slice(0, 50)}..." → ${inserted} new contacts`);
    } catch (err) {
      if (err.response?.status === 429 || err.response?.status === 403) { console.warn('⚠️  [SCRAPER] Twitter search rate-limited'); break; }
      console.error(`❌ [SCRAPER] Twitter search error:`, err.message);
    }
    await sleep(SCRAPE_DELAY_MS * 3);
  }
  return totalInserted;
}

// ── 13. Trustpilot Business Directory ────────────────────────────────────────
const TRUSTPILOT_TARGETS = [
  { url: 'https://www.trustpilot.com/categories/accountant',          source: 'trustpilot', label: 'Trustpilot Accountants'    },
  { url: 'https://www.trustpilot.com/categories/legal_services',      source: 'trustpilot', label: 'Trustpilot Legal'          },
  { url: 'https://www.trustpilot.com/categories/hr',                  source: 'trustpilot', label: 'Trustpilot HR'             },
  { url: 'https://www.trustpilot.com/categories/insurance_agency',    source: 'trustpilot', label: 'Trustpilot Insurance'      },
  { url: 'https://www.trustpilot.com/categories/financial_services',  source: 'trustpilot', label: 'Trustpilot Finance'        },
  { url: 'https://www.trustpilot.com/categories/it_services',         source: 'trustpilot', label: 'Trustpilot IT'             },
  { url: 'https://www.trustpilot.com/categories/real_estate_agency',  source: 'trustpilot', label: 'Trustpilot Real Estate'    },
  { url: 'https://www.trustpilot.com/categories/logistics_service',   source: 'trustpilot', label: 'Trustpilot Logistics'      },
  { url: 'https://www.trustpilot.com/categories/staffing_agency',     source: 'trustpilot', label: 'Trustpilot Staffing'       },
  { url: 'https://www.trustpilot.com/categories/medical_clinic',      source: 'trustpilot', label: 'Trustpilot Medical'        },
  { url: 'https://www.trustpilot.com/categories/bookkeeper',          source: 'trustpilot', label: 'Trustpilot Bookkeeping'    },
  { url: 'https://www.trustpilot.com/categories/payroll_service',     source: 'trustpilot', label: 'Trustpilot Payroll'        },
];

async function scrapeTrustpilot() {
  const TP_PAGES_PER_RUN = parseInt(process.env.TP_PAGES_PER_RUN || '4', 10);
  const selected = pickRandom(TRUSTPILOT_TARGETS, TP_PAGES_PER_RUN);
  let totalInserted = 0;

  for (const target of selected) {
    try {
      const res = await axios.get(target.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 25000,
      });

      const $ = cheerio.load(res.data);
      const contacts = [];
      const seen = new Set();

      // Trustpilot business cards have links to their profile pages
      // and often embed the business website URL
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        if (!href.startsWith('http')) return;
        const domain = extractDomain(href);
        if (!domain || domain.includes('trustpilot') || domain.includes('google') || domain.includes('linkedin') || domain.includes('facebook')) return;
        if (seen.has(domain)) return;
        seen.add(domain);
        for (const email of buildEmailVariants(domain)) {
          contacts.push({ company: text || domain, website: href, domain, email, source: 'trustpilot', query: target.url, snippet: `Listed on ${target.label}` });
        }
      });

      // Also grab any data-business-unit or data-website attributes
      $('[data-business-website-url], [href*="//"]').each((_, el) => {
        const siteUrl = $(el).attr('data-business-website-url') || '';
        if (!siteUrl.startsWith('http')) return;
        const domain = extractDomain(siteUrl);
        if (!domain || seen.has(domain) || domain.includes('trustpilot')) return;
        seen.add(domain);
        const company = $(el).attr('data-business-display-name') || $(el).text().trim() || domain;
        for (const email of buildEmailVariants(domain)) {
          contacts.push({ company, website: siteUrl, domain, email, source: 'trustpilot', query: target.url, snippet: `Listed on ${target.label}` });
        }
      });

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      console.log(`⭐ [SCRAPER] Trustpilot ${target.label} → ${contacts.length} candidates, ${inserted} new contacts`);
    } catch (err) {
      if (err.response?.status === 429 || err.response?.status === 403 || err.response?.status === 451) {
        console.warn(`⚠️  [SCRAPER] Trustpilot blocked — skipping ${target.label}`);
        continue;
      }
      console.error(`❌ [SCRAPER] Trustpilot ${target.label} error:`, err.message);
    }
    await sleep(SCRAPE_DELAY_MS * 4);
  }
  return totalInserted;
}

async function runAllScrapers() {
  console.log('🕷️  [SCRAPER] Starting multi-source scrape run (13 sources + 57 directories)...');
  let total = 0;

  try { total += await scrapeGooglePlaces(); }        catch (e) { console.error('[SCRAPER] Places failed:', e.message); }
  try { total += await scrapeGoogleCSE(); }            catch (e) { console.error('[SCRAPER] CSE failed:', e.message); }
  try { total += await scrapeDuckDuckGo(); }           catch (e) { console.error('[SCRAPER] DDG failed:', e.message); }
  try { total += await scrapeViaSerpAPI(); }           catch (e) { console.error('[SCRAPER] SerpAPI BPO failed:', e.message); }
  try { total += await scrapeBing(); }                 catch (e) { console.error('[SCRAPER] Bing failed:', e.message); }
  try { total += await scrapeYouTube(); }              catch (e) { console.error('[SCRAPER] YouTube failed:', e.message); }
  try { total += await scrapeFacebookViaSearch(); }    catch (e) { console.error('[SCRAPER] Facebook search failed:', e.message); }
  try { total += await scrapeBusinessDirectories(); }  catch (e) { console.error('[SCRAPER] Directories failed:', e.message); }
  try { total += await scrapeInstagramViaSearch(); }   catch (e) { console.error('[SCRAPER] Instagram failed:', e.message); }
  try { total += await scrapeTikTokViaSearch(); }      catch (e) { console.error('[SCRAPER] TikTok failed:', e.message); }
  try { total += await scrapeLinkedInViaSearch(); }    catch (e) { console.error('[SCRAPER] LinkedIn failed:', e.message); }
  try { total += await scrapeTwitterViaSearch(); }     catch (e) { console.error('[SCRAPER] Twitter/X failed:', e.message); }
  try { total += await scrapeTrustpilot(); }           catch (e) { console.error('[SCRAPER] Trustpilot failed:', e.message); }

  console.log(`✅ [SCRAPER] Run complete — ${total} new contacts stored in scraped_contacts`);
  return total;
}

// ── Continuous mode: per-query engine ────────────────────────────────────────

// Build master flat list of ALL queries across every source
function buildAllPairs() {
  const pairs = [];
  // Google Places: types × cities
  for (const city of SEARCH_CITIES) {
    for (const type of BUSINESS_TYPES) {
      pairs.push({ source: 'google_places', query: `${type} ${city}`, type, city });
    }
  }
  // Google CSE
  for (const q of CSE_QUERIES)       pairs.push({ source: 'google_cse',      query: q });
  // DuckDuckGo
  for (const q of DDG_QUERIES)        pairs.push({ source: 'duckduckgo',       query: q });
  // SerpAPI BPO
  for (const q of SERP_BPO_QUERIES)   pairs.push({ source: 'serpapi_bpo',      query: q });
  // Bing
  for (const q of BING_QUERIES)       pairs.push({ source: 'bing',             query: q });
  // YouTube
  for (const q of YOUTUBE_SEARCH_TERMS) pairs.push({ source: 'youtube_api',   query: q });
  // Facebook via search
  for (const q of FACEBOOK_QUERIES)   pairs.push({ source: 'facebook_search',  query: q });
  // Business directories (each URL is a pair)
  for (const t of DIRECTORY_TARGETS)  pairs.push({ source: t.source, query: t.url, url: t.url, label: t.label });
  // Instagram
  for (const q of INSTAGRAM_QUERIES)  pairs.push({ source: 'instagram_search', query: q });
  // TikTok
  for (const q of TIKTOK_QUERIES)     pairs.push({ source: 'tiktok_search',    query: q });
  // LinkedIn
  for (const q of LINKEDIN_QUERIES)   pairs.push({ source: 'linkedin_search',  query: q });
  // Twitter/X
  for (const q of TWITTER_QUERIES)    pairs.push({ source: 'twitter_search',   query: q });
  // Trustpilot (each category URL is a pair)
  for (const t of TRUSTPILOT_TARGETS) pairs.push({ source: 'trustpilot', query: t.url, url: t.url, label: t.label });
  return pairs;
}

// Execute exactly ONE query for any source — returns count of new contacts stored
async function runOnePair(pair) {
  try {
    if (pair.source === 'google_places') {
      if (!GOOGLE_API_KEY && !SA_JSON) return 0;
      const res = await axios.post(
        'https://places.googleapis.com/v1/places:searchText',
        { textQuery: pair.query, languageCode: 'en', maxResultCount: 20 },
        { headers: await getPlacesHeaders(), timeout: 15000 }
      );
      const places = res.data.places || [];
      const contacts = [];
      for (const p of places) {
        if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
        const website = p.websiteUri || null;
        const domain  = extractDomain(website);
        if (!domain) continue;
        const cityName = (pair.city || '').split(' ')[0];
        const country  = (pair.city || '').split(' ').slice(1).join(' ') || null;
        for (const email of buildEmailVariants(domain)) {
          contacts.push({
            company: p.displayName?.text || '', website, domain, email,
            phone: p.nationalPhoneNumber || null, address: p.formattedAddress || '',
            city: cityName, country, businessType: pair.type || null,
            source: 'google_places', query: pair.query, snippet: p.formattedAddress || null,
          });
        }
      }
      return await storeContacts(contacts);
    }

    if (pair.source === 'google_cse') {
      if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) return 0;
      try {
        const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params: { key: GOOGLE_API_KEY, cx: GOOGLE_CSE_ID, q: pair.query, num: 10 },
          timeout: 15000,
        });
        const items = res.data.items || [];
        const contacts = [];
        for (const item of items) {
          const domain = extractDomain(item.link);
          if (!domain) continue;
          for (const email of buildEmailVariants(domain)) {
            contacts.push({ company: item.title || domain, website: item.link, domain, email, source: 'google_cse', query: pair.query, snippet: item.snippet || null });
          }
        }
        return await storeContacts(contacts);
      } catch (err) {
        if (err.response?.status === 403) return 0;
        throw err;
      }
    }

    if (pair.source === 'duckduckgo') {
      const res = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q: pair.query },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 20000,
      });
      const $ = cheerio.load(res.data);
      const contacts = [];
      $('.result').each((_, el) => {
        let link = $(el).find('.result__title a').attr('href') || '';
        if (link.includes('uddg=')) { try { link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]); } catch {} }
        const domain = extractDomain(link);
        if (!domain || domain.includes('duckduckgo') || domain.includes('google')) return;
        const title   = $(el).find('.result__title a').text().trim() || domain;
        const snippet = $(el).find('.result__snippet').text().trim();
        for (const email of buildEmailVariants(domain)) {
          contacts.push({ company: title, website: link, domain, email, source: 'duckduckgo', query: pair.query, snippet: snippet || null });
        }
      });
      return await storeContacts(contacts);
    }

    if (pair.source === 'serpapi_bpo') {
      const SERPAPI_KEY = process.env.SERPAPI_KEY;
      if (!SERPAPI_KEY) return 0;
      const res = await axios.get('https://serpapi.com/search', {
        params: { q: pair.query, api_key: SERPAPI_KEY, engine: 'google', num: 100, hl: 'en', gl: 'us' },
        timeout: 20000,
      });
      const results = res.data.organic_results || [];
      const contacts = [];
      for (const r of results) {
        const domain = extractDomain(r.link);
        if (!domain) continue;
        for (const email of buildEmailVariants(domain)) {
          contacts.push({ company: r.title || domain, website: r.link, domain, email, source: 'serpapi_bpo', query: pair.query, snippet: r.snippet || null });
        }
      }
      return await storeContacts(contacts);
    }

    if (pair.source === 'bing') {
      const res = await axios.get('https://www.bing.com/search', {
        params: { q: pair.query, count: 20, mkt: 'en-US' },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 20000,
      });
      const $ = cheerio.load(res.data);
      const contacts = [];
      $('#b_results .b_algo').each((_, el) => {
        const link    = $(el).find('h2 a').attr('href') || '';
        const title   = $(el).find('h2 a').text().trim();
        const snippet = $(el).find('.b_caption p').text().trim();
        const domain  = extractDomain(link);
        if (!domain || domain.includes('bing') || domain.includes('microsoft') || domain.includes('linkedin')) return;
        for (const email of buildEmailVariants(domain)) {
          contacts.push({ company: title, website: link, domain, email, source: 'bing', query: pair.query, snippet: snippet || null });
        }
      });
      return await storeContacts(contacts);
    }

    if (pair.source === 'youtube_api') {
      if (!GOOGLE_API_KEY) return 0;
      const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
      const SKIP = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com']);
      const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: { key: GOOGLE_API_KEY, q: pair.query, type: 'channel', part: 'snippet', maxResults: 20, relevanceLanguage: 'en' },
        timeout: 15000,
      });
      const channelIds = (searchRes.data.items || []).map(i => i.snippet?.channelId || i.id?.channelId).filter(Boolean);
      if (channelIds.length === 0) return 0;
      const detailsRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: { key: GOOGLE_API_KEY, id: channelIds.join(','), part: 'snippet,brandingSettings' },
        timeout: 15000,
      });
      const contacts = [];
      for (const ch of (detailsRes.data.items || [])) {
        const title = ch.snippet?.title || '';
        const desc  = ch.snippet?.description || '';
        const country = ch.snippet?.country || null;
        const emails = (desc.match(EMAIL_RE) || []).filter(e => !SKIP.has(e.split('@')[1]));
        for (const email of emails) {
          contacts.push({ company: title, website: `https://www.youtube.com/channel/${ch.id}`, domain: email.split('@')[1], email, source: 'youtube_api', query: pair.query, snippet: desc.slice(0, 200), country });
        }
        const siteLink = ch.brandingSettings?.channel?.unsubscribedTrailer || null;
        if (siteLink) {
          const domain = extractDomain(siteLink);
          if (domain && !SKIP.has(domain)) {
            for (const email of buildEmailVariants(domain)) {
              contacts.push({ company: title, website: siteLink, domain, email, source: 'youtube_api', query: pair.query, snippet: desc.slice(0, 200), country });
            }
          }
        }
      }
      return await storeContacts(contacts);
    }

    if (pair.source === 'facebook_search') {
      const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
      const SKIP = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'facebook.com', 'outlook.com']);
      const res = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q: pair.query },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 20000,
      });
      const $ = cheerio.load(res.data);
      const contacts = [];
      $('.result').each((_, el) => {
        const titleEl = $(el).find('.result__title a');
        const snippet = $(el).find('.result__snippet').text().trim();
        let link = titleEl.attr('href') || '';
        if (link.includes('uddg=')) { try { link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]); } catch {} }
        const title = titleEl.text().trim();
        const emails = (snippet.match(EMAIL_RE) || []).filter(e => !SKIP.has(e.split('@')[1]));
        for (const email of emails) {
          contacts.push({ company: title, website: link, domain: email.split('@')[1], email, source: 'facebook_search', query: pair.query, snippet: snippet || null });
        }
        const urlInSnippet = (snippet.match(/https?:\/\/[^\s]+/g) || []).find(u => !u.includes('facebook') && !u.includes('duckduckgo'));
        if (emails.length === 0 && urlInSnippet) {
          const domain = extractDomain(urlInSnippet);
          if (domain && !SKIP.has(domain)) {
            for (const email of buildEmailVariants(domain)) {
              contacts.push({ company: title, website: urlInSnippet, domain, email, source: 'facebook_search', query: pair.query, snippet: snippet || null });
            }
          }
        }
      });
      return await storeContacts(contacts);
    }

    if (pair.source === 'instagram_search' || pair.source === 'tiktok_search' || pair.source === 'twitter_search') {
      const PLATFORM_SKIP = {
        instagram_search: new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','instagram.com','icloud.com']),
        tiktok_search:    new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','tiktok.com','icloud.com']),
        twitter_search:   new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','twitter.com','x.com','t.co','icloud.com']),
      };
      const SKIP = PLATFORM_SKIP[pair.source];
      const SKIP_HOST = { instagram_search: 'instagram', tiktok_search: 'tiktok', twitter_search: 'twitter|x\\.com|t\\.co' }[pair.source];
      const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
      const res = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q: pair.query },
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 20000,
      });
      const $ = cheerio.load(res.data);
      const contacts = [];
      $('.result').each((_, el) => {
        const titleEl = $(el).find('.result__title a');
        const snippet = $(el).find('.result__snippet').text().trim();
        let link = titleEl.attr('href') || '';
        if (link.includes('uddg=')) { try { link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]); } catch {} }
        const title = titleEl.text().trim();
        const emails = (snippet.match(EMAIL_RE) || []).filter(e => !SKIP.has(e.split('@')[1]));
        for (const email of emails) { contacts.push({ company: title, website: link, domain: email.split('@')[1], email, source: pair.source, query: pair.query, snippet: snippet || null }); }
        const skipRe = new RegExp(`https?://(${SKIP_HOST})`);
        const urlMatch = (snippet.match(/https?:\/\/[^\s,)]+/g) || []).find(u => u.length > 10 && !skipRe.test(u));
        if (emails.length === 0 && urlMatch) {
          const domain = extractDomain(urlMatch);
          if (domain && !SKIP.has(domain)) { for (const email of buildEmailVariants(domain)) { contacts.push({ company: title, website: urlMatch, domain, email, source: pair.source, query: pair.query, snippet: snippet || null }); } }
        }
      });
      return await storeContacts(contacts);
    }

    if (pair.source === 'linkedin_search') {
      const SKIP = new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','linkedin.com','lnkd.in']);
      const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
      const URL_RE   = /https?:\/\/(?!linkedin|lnkd\.in)[^\s,)>]+/g;
      const res = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q: pair.query },
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 20000,
      });
      const $ = cheerio.load(res.data);
      const contacts = [];
      $('.result').each((_, el) => {
        const titleEl = $(el).find('.result__title a');
        const snippet = $(el).find('.result__snippet').text().trim();
        let link = titleEl.attr('href') || '';
        if (link.includes('uddg=')) { try { link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]); } catch {} }
        const title = titleEl.text().trim();
        const emails = (snippet.match(EMAIL_RE) || []).filter(e => !SKIP.has(e.split('@')[1]));
        for (const email of emails) { contacts.push({ company: title, website: link, domain: email.split('@')[1], email, source: 'linkedin_search', query: pair.query, snippet: snippet || null }); }
        if (emails.length === 0) {
          for (const url of (snippet.match(URL_RE) || []).slice(0, 2)) {
            const domain = extractDomain(url);
            if (domain && !SKIP.has(domain)) { for (const email of buildEmailVariants(domain)) { contacts.push({ company: title, website: url, domain, email, source: 'linkedin_search', query: pair.query, snippet: snippet || null }); } }
          }
        }
      });
      return await storeContacts(contacts);
    }

    if (pair.source === 'trustpilot') {
      const target = TRUSTPILOT_TARGETS.find(t => t.url === (pair.url || pair.query));
      if (!target) return 0;
      const res = await axios.get(pair.url || pair.query, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 25000,
      });
      const $ = cheerio.load(res.data);
      const contacts = [];
      const baseDomain = 'trustpilot.com';
      const seen = new Set();
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        if (!href.startsWith('http')) return;
        const domain = extractDomain(href);
        if (!domain || domain === baseDomain || domain.includes('google') || domain.includes('linkedin') || domain.includes('facebook')) return;
        if (seen.has(domain)) return;
        seen.add(domain);
        for (const email of buildEmailVariants(domain)) { contacts.push({ company: text || domain, website: href, domain, email, source: 'trustpilot', query: pair.query, snippet: `Listed on ${target.label}` }); }
      });
      return await storeContacts(contacts);
    }

    if (['clutch', 'cylex', 'hotfrog_sa', 'bizcommunity', 'yellowpages_sa'].includes(pair.source)) {
      const target = DIRECTORY_TARGETS.find(t => t.url === pair.url || t.url === pair.query);
      if (!target) return 0;
      const res = await axios.get(pair.url || pair.query, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 25000,
      });
      const $ = cheerio.load(res.data);
      const contacts = [];
      const baseDomain = extractDomain(pair.url || pair.query) || '';
      const seen = new Set();
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        if (!href.startsWith('http')) return;
        const domain = extractDomain(href);
        if (!domain || domain === baseDomain || domain.includes('google') || domain.includes('linkedin') || domain.includes('facebook')) return;
        if (seen.has(domain)) return;
        seen.add(domain);
        for (const email of buildEmailVariants(domain)) {
          contacts.push({ company: text || domain, website: href, domain, email, source: pair.source, query: pair.query, snippet: `Listed on ${target.label}` });
        }
      });
      const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
      const SKIP = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', baseDomain]);
      const found = ($.text().match(EMAIL_RE) || []).filter(e => !SKIP.has(e.split('@')[1]));
      for (const email of found) {
        if (!seen.has(email)) { seen.add(email); contacts.push({ company: email.split('@')[1], website: null, domain: email.split('@')[1], email, source: pair.source, query: pair.query, snippet: `Found on ${target.label}` }); }
      }
      return await storeContacts(contacts);
    }

  } catch (err) {
    if (err.response?.status === 429 || err.response?.status === 403) return -429;
    return 0;
  }
  return 0;
}

// ── Continuous loop (runs forever until stopContinuous()) ─────────────────────
let _continuousRunning = false;
const _saved = loadPersistedStats();
const _continuousStats = {
  running: false,
  source: null,
  sourceLabel: null,
  query: null,
  lastFound: 0,
  totalQueries:       _saved.totalQueries,
  totalContactsAdded: _saved.totalContactsAdded,
  cyclesCompleted:    _saved.cyclesCompleted,
  lastQueryTs: null,
  queriesDoneThisCycle: 0,  // how many unique queries run in the current cycle
  queriesPerCycle: 0,       // total unique queries available (set at startup)
  recentQueries: [], // last 50 [{source, query, found, ts}]
  sourceStats: {     // cumulative per-source totals for this session
    google_places:    { queries: 0, found: 0 },
    google_cse:       { queries: 0, found: 0 },
    duckduckgo:       { queries: 0, found: 0 },
    serpapi_bpo:      { queries: 0, found: 0 },
    bing:             { queries: 0, found: 0 },
    youtube_api:      { queries: 0, found: 0 },
    facebook_search:  { queries: 0, found: 0 },
    clutch:           { queries: 0, found: 0 },
    cylex:            { queries: 0, found: 0 },
    hotfrog_sa:       { queries: 0, found: 0 },
    bizcommunity:     { queries: 0, found: 0 },
    yellowpages_sa:   { queries: 0, found: 0 },
    instagram_search: { queries: 0, found: 0 },
    tiktok_search:    { queries: 0, found: 0 },
    linkedin_search:  { queries: 0, found: 0 },
    twitter_search:   { queries: 0, found: 0 },
    trustpilot:       { queries: 0, found: 0 },
  },
};

const SOURCE_LABELS = {
  google_places:    'Google Places',
  google_cse:       'Google CSE',
  duckduckgo:       'DuckDuckGo',
  serpapi_bpo:      'SerpAPI',
  bing:             'Bing',
  youtube_api:      'YouTube',
  facebook_search:  'Facebook',
  clutch:           'Clutch.co',
  cylex:            'Cylex',
  hotfrog_sa:       'Hotfrog SA',
  bizcommunity:     'Bizcommunity',
  yellowpages_sa:   'Yellow Pages SA',
  instagram_search: 'Instagram',
  tiktok_search:    'TikTok',
  linkedin_search:  'LinkedIn',
  twitter_search:   'Twitter/X',
  trustpilot:       'Trustpilot',
};
const SOURCE_DELAYS = {
  google_places:    1200,
  google_cse:       2500,
  duckduckgo:       3500,
  serpapi_bpo:      1500,
  bing:             3500,
  youtube_api:      2000,
  facebook_search:  3500,
  clutch:           4000,
  cylex:            4000,
  hotfrog_sa:       4000,
  bizcommunity:     4000,
  yellowpages_sa:   3500,
  instagram_search: 3500,
  tiktok_search:    3500,
  linkedin_search:  3500,
  twitter_search:   3500,
  trustpilot:       4000,
};

async function runContinuous(onUpdate) {
  if (_continuousRunning) return;
  _continuousRunning = true;
  _continuousStats.running = true;

  // Load query history so we don't repeat searches within the same cycle
  const searchedQueries = loadSearchedQueries();
  const allPairs = buildAllPairs();
  const totalPairs = allPairs.length;
  _continuousStats.queriesPerCycle = totalPairs;

  // Filter out any queries already done this cycle, then shuffle the remainder
  let remaining = allPairs.filter(p => !searchedQueries.has(searchedKey(p)));
  remaining.sort(() => 0.5 - Math.random());
  let idx = 0;

  _continuousStats.queriesDoneThisCycle = searchedQueries.size;
  const skipped = totalPairs - remaining.length;
  if (skipped > 0) {
    console.log(`[SCRAPER] Resuming cycle — ${skipped}/${totalPairs} queries already done, ${remaining.length} remaining`);
  }

  while (_continuousRunning) {
    if (idx >= remaining.length) {
      // All queries for this cycle are done — start a fresh cycle
      _continuousStats.cyclesCompleted++;
      _continuousStats.queriesDoneThisCycle = 0;
      searchedQueries.clear();
      clearSearchedQueries();
      console.log(`[SCRAPER] Full cycle complete (cycle #${_continuousStats.cyclesCompleted}) — resetting query history and starting fresh`);
      // Rebuild and re-shuffle the full list
      remaining = [...allPairs].sort(() => 0.5 - Math.random());
      idx = 0;
    }

    const pair = remaining[idx++];
    _continuousStats.source      = pair.source;
    _continuousStats.sourceLabel = SOURCE_LABELS[pair.source] || pair.source;
    _continuousStats.query       = pair.query;
    _continuousStats.lastQueryTs = new Date().toISOString();

    if (onUpdate) onUpdate({ type: 'start', ...pair });

    const found = await runOnePair(pair);
    const realFound = found < 0 ? 0 : found;

    // Mark this query as done for the current cycle (rate-limit hits still count as done)
    searchedQueries.add(searchedKey(pair));
    _continuousStats.queriesDoneThisCycle = searchedQueries.size;
    // Save every 10 searches (or on every find) to avoid hitting disk too hard
    if (searchedQueries.size % 10 === 0 || realFound > 0) {
      saveSearchedQueries(searchedQueries);
    }

    _continuousStats.totalQueries++;
    _continuousStats.lastFound = realFound;
    if (realFound > 0) _continuousStats.totalContactsAdded += realFound;

    // Per-source session totals
    if (!_continuousStats.sourceStats[pair.source]) {
      _continuousStats.sourceStats[pair.source] = { queries: 0, found: 0 };
    }
    _continuousStats.sourceStats[pair.source].queries++;
    if (realFound > 0) _continuousStats.sourceStats[pair.source].found += realFound;

    // Push to recent queries log (keep last 50)
    _continuousStats.recentQueries.unshift({
      source: pair.source,
      sourceLabel: SOURCE_LABELS[pair.source] || pair.source,
      query: pair.query,
      found: realFound,
      ts: new Date().toISOString(),
    });
    if (_continuousStats.recentQueries.length > 50) _continuousStats.recentQueries.pop();

    // Persist totals every 5 queries or whenever new contacts are found
    if (realFound > 0 || _continuousStats.totalQueries % 5 === 0) {
      savePersistedStats(_continuousStats);
    }

    // Every 20 queries, fire off an async MX verification + scoring pass on unprocessed contacts
    if (_continuousStats.totalQueries % 20 === 0) {
      runMxScoringBatch({ limit: 40 }).catch(() => {});
    }

    if (onUpdate) onUpdate({ type: 'done', ...pair, found: realFound });

    // Rate-appropriate delay per source
    const delay = found === -429
      ? SOURCE_DELAYS[pair.source] * 5    // back off on rate limit
      : SOURCE_DELAYS[pair.source] || 1500;

    await sleep(delay);
  }

  _continuousStats.running = false;
}

function stopContinuous() { _continuousRunning = false; }
function getContinuousStats() { return { ..._continuousStats }; }

// ── Targeted Scrape — user-defined country / industry / keywords ─────────────
// Runs up to `limit` distinct-domain new contacts then returns.
// Tags every row with source = `targeted_<sessionId>` so the UI can filter them.

let _targetedSession = {
  active: false, sessionId: null, country: null, industry: null,
  keywords: null, found: 0, limit: 100, startedAt: null, completedAt: null,
};

function getTargetedSession() { return { ..._targetedSession }; }

async function runTargetedScrape({ country, industry, keywords, limit = 100, sessionId }) {
  _targetedSession = {
    active: true, sessionId, country, industry, keywords,
    found: 0, limit, startedAt: new Date().toISOString(), completedAt: null,
  };

  // Build an array of search queries from the three parameters
  const parts = [keywords, industry, country].filter(Boolean);
  const base  = parts.join(' ');
  const queries = [
    `${base} company "contact us" -site:linkedin.com`,
    `${base} business email -site:linkedin.com`,
    `${base} firm "get in touch" -site:linkedin.com`,
    `${base} "contact" email -site:linkedin.com -site:indeed.com`,
  ];
  if (keywords) queries.push(`${keywords} ${country || ''} "contact us" -site:linkedin.com`);
  if (industry) queries.push(`${industry} ${country || ''} contact -site:linkedin.com`);

  let totalInserted = 0;

  const sourceTag = `targeted_${sessionId}`;

  for (const q of queries) {
    if (totalInserted >= limit) break;

    // ── DuckDuckGo ───────────────────────────────────────────────────────────
    try {
      const res = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: 20000,
      });
      const $ = cheerio.load(res.data);
      const contacts = [];

      $('.result').each((_, el) => {
        const titleEl = $(el).find('.result__title a');
        const snippet = $(el).find('.result__snippet').text().trim();
        let link = titleEl.attr('href') || '';
        if (link.includes('uddg=')) {
          try { link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]); } catch {}
        }
        const domain = extractDomain(link);
        if (!domain || domain.includes('duckduckgo') || domain.includes('google')) return;

        for (const email of buildEmailVariants(domain)) {
          contacts.push({
            company: titleEl.text().trim() || domain,
            website: link, domain, email,
            country: country || null,
            businessType: industry || null,
            source: sourceTag,
            query: q,
            snippet: snippet || null,
          });
        }
      });

      const inserted = await storeContactsTargeted(contacts);
      totalInserted += inserted;
      _targetedSession.found = totalInserted;
      console.log(`🎯 [TARGETED] DDG "${q.slice(0,50)}..." → ${inserted} new/re-tagged`);
    } catch (err) {
      if (err.response?.status === 429 || err.response?.status === 403) {
        console.warn('⚠️  [TARGETED] DuckDuckGo rate-limited — skipping remaining DDG queries');
      } else {
        console.error(`❌ [TARGETED] DDG error:`, err.message);
      }
    }

    await sleep(SCRAPE_DELAY_MS * 3);
    if (totalInserted >= limit) break;

    // ── SerpAPI ──────────────────────────────────────────────────────────────
    const SERPAPI_KEY = process.env.SERPAPI_KEY;
    if (SERPAPI_KEY) {
      // Map country names to Google country codes (gl parameter) for geo-targeted results
      const COUNTRY_GL = {
        'south africa': 'za', 'nigeria': 'ng', 'kenya': 'ke', 'ghana': 'gh',
        'united states': 'us', 'usa': 'us', 'united kingdom': 'gb', 'uk': 'gb',
        'australia': 'au', 'canada': 'ca', 'germany': 'de', 'netherlands': 'nl',
        'singapore': 'sg', 'uae': 'ae', 'dubai': 'ae', 'india': 'in',
        'new zealand': 'nz', 'ireland': 'ie', 'france': 'fr', 'spain': 'es',
      };
      const glCode = country ? (COUNTRY_GL[(country || '').toLowerCase()] || null) : null;
      try {
        const serpParams = { q, api_key: SERPAPI_KEY, engine: 'google', num: 100, hl: 'en' };
        if (glCode) serpParams.gl = glCode;
        const res = await axios.get('https://serpapi.com/search', {
          params: serpParams,
          timeout: 20000,
        });
        const results = res.data.organic_results || [];
        const contacts = [];
        for (const r of results) {
          const domain = extractDomain(r.link);
          if (!domain) continue;
          for (const email of buildEmailVariants(domain)) {
            contacts.push({
              company: r.title || domain, website: r.link, domain, email,
              country: country || null,
              businessType: industry || null,
              source: sourceTag,
              query: q,
              snippet: r.snippet || null,
            });
          }
        }
        const inserted = await storeContactsTargeted(contacts);
        totalInserted += inserted;
        _targetedSession.found = totalInserted;
        console.log(`🎯 [TARGETED] SerpAPI "${q.slice(0,50)}..." → ${inserted} new/re-tagged`);
      } catch (err) {
        console.error(`❌ [TARGETED] SerpAPI error:`, err.message);
      }
      await sleep(SCRAPE_DELAY_MS);
    }
  }

  // ── DB Fallback — when live scrapers return very few results ─────────────
  // Re-tag existing DB contacts matching country/industry/keywords to the current
  // session so the user always sees results even if DuckDuckGo/SerpAPI are limited.
  const MIN_LIVE = Math.min(20, Math.floor(limit * 0.2));
  if (totalInserted < MIN_LIVE) {
    try {
      console.log(`🎯 [TARGETED] Live scrapers found ${totalInserted} < ${MIN_LIVE} — pulling from DB…`);

      // Build filter attempts from strictest → broadest so user always gets results
      const countryOk  = country && country !== 'Global' && country !== 'Africa';
      const industryKw = industry ? `%${industry.toLowerCase()}%` : null;
      const countryKw  = countryOk ? `%${country.toLowerCase()}%` : null;
      const keywordKw  = keywords ? `%${keywords.toLowerCase()}%` : null;

      const attempts = [];

      // ALL attempts exclude bounced contacts — never re-tag dead emails
      const nb = `AND status != 'bounced'`;

      // Attempt 1: country + industry + keywords (strictest)
      if (countryKw && industryKw && keywordKw) {
        attempts.push({ label: 'country+industry+keyword', q: `WHERE LOWER(country) LIKE $2 AND LOWER(business_type) LIKE $3 AND (LOWER(company) LIKE $4 OR LOWER(COALESCE(snippet,'')) LIKE $4) ${nb}`, p: [sourceTag, countryKw, industryKw, keywordKw] });
      }
      // Attempt 2: country + industry
      if (countryKw && industryKw) {
        attempts.push({ label: 'country+industry', q: `WHERE LOWER(country) LIKE $2 AND LOWER(business_type) LIKE $3 ${nb}`, p: [sourceTag, countryKw, industryKw] });
      }
      // Attempt 3: industry only (ignore country — many contacts have null country)
      if (industryKw) {
        attempts.push({ label: 'industry-only', q: `WHERE LOWER(business_type) LIKE $2 ${nb}`, p: [sourceTag, industryKw] });
      }
      // Attempt 4: country only
      if (countryKw) {
        attempts.push({ label: 'country-only', q: `WHERE LOWER(country) LIKE $2 ${nb}`, p: [sourceTag, countryKw] });
      }
      // Attempt 5: keywords — but EXCLUDE keyword hits that are clearly bounced-domain matches
      if (keywordKw) {
        attempts.push({ label: 'keyword-only', q: `WHERE (LOWER(company) LIKE $2 OR LOWER(domain) LIKE $2 OR LOWER(COALESCE(snippet,'')) LIKE $2) ${nb}`, p: [sourceTag, keywordKw] });
      }
      // Attempt 6: keyword in query_used column (catches SerpAPI/DDG query terms)
      if (keywordKw) {
        attempts.push({ label: 'query-used', q: `WHERE LOWER(COALESCE(query_used,'')) LIKE $2 ${nb}`, p: [sourceTag, keywordKw] });
      }
      // Attempt 7: broadest — any non-bounced contact ordered by score (last resort)
      attempts.push({ label: 'any-non-bounced', q: `WHERE status != 'bounced'`, p: [sourceTag] });

      let dbFound = 0;
      for (const attempt of attempts) {
        const updateRes = await db.query(
          `UPDATE scraped_contacts
           SET source = $1
           WHERE id IN (
             SELECT id FROM scraped_contacts
             ${attempt.q}
             ORDER BY prospect_score DESC NULLS LAST, created_at DESC
             LIMIT ${limit}
           )
           RETURNING id`,
          attempt.p
        );
        dbFound = updateRes.rowCount || 0;
        console.log(`🎯 [TARGETED] DB fallback [${attempt.label}] → ${dbFound} contacts`);
        if (dbFound >= 5) break; // enough results — stop broadening
      }

      totalInserted += dbFound;
      _targetedSession.found = totalInserted;
      console.log(`🎯 [TARGETED] DB fallback total: ${dbFound} contacts re-tagged to session`);
    } catch (err) {
      console.error(`❌ [TARGETED] DB fallback error:`, err.message);
    }
  }

  _targetedSession.active      = false;
  _targetedSession.completedAt = new Date().toISOString();
  _targetedSession.found       = totalInserted;
  console.log(`🎯 [TARGETED] Session ${sessionId} complete — ${totalInserted} total contacts`);
  return totalInserted;
}

// ── Stats ────────────────────────────────────────────────────────────────────
async function getStats() {
  try {
    const res = await db.query(`
      SELECT
        COUNT(*)                                    AS total,
        COUNT(*) FILTER (WHERE status='new')        AS pending,
        COUNT(*) FILTER (WHERE status='contacted')  AS contacted,
        COUNT(*) FILTER (WHERE status='bounced')    AS bounced,
        COUNT(*) FILTER (WHERE status='converted')  AS converted,
        COUNT(DISTINCT source)                      AS sources,
        MAX(created_at)                             AS last_scraped
      FROM scraped_contacts
    `);
    return res.rows[0];
  } catch { return {}; }
}

module.exports = {
  ensureTable,
  runAllScrapers,
  scrapeGooglePlaces,
  scrapeGoogleCSE,
  scrapeDuckDuckGo,
  scrapeViaSerpAPI,
  getStats,
  buildEmailVariants,
  extractDomain,
  // MX verification + scoring
  runMxScoringBatch,
  // Continuous mode
  runContinuous,
  stopContinuous,
  getContinuousStats,
  buildAllPairs,
  // Targeted scrape
  runTargetedScrape,
  getTargetedSession,
};
