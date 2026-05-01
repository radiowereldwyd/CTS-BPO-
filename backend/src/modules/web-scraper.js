/**
 * CTS BPO — Multi-Source Web Scraper
 *
 * Sources (all free within configured limits):
 *   1. Google Places API (New v1)  — real businesses by type+city → website → email variants
 *   2. Google Custom Search API    — 100 free queries/day (GOOGLE_API_KEY + GOOGLE_CSE_ID)
 *   3. DuckDuckGo HTML scraping    — no key, unlimited (rate-limited to be polite)
 *
 * All results stored in `scraped_contacts` table.
 * Outreach pipeline reads from `scraped_contacts` (status='new').
 *
 * Cost guard (Google Places):
 *   - Text Search Basic: ~$0.032/request; Contact fields (website): ~$0.003/place
 *   - This module caps at PLACES_QUERIES_PER_RUN queries per invocation.
 *   - At default 15 queries × 4 runs/day = 60/day × $0.092 ≈ $5.52/day → well within $200/mo credit.
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');
const db      = require('../db');

// ── Stats persistence — survives backend restarts ────────────────────────────
const STATS_FILE = path.join(__dirname, '../../data/scraper-stats.json');

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

// ── Config ─────────────────────────────────────────────────────────────────
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GOOGLE_CSE_ID  = process.env.GOOGLE_CSE_ID  || '';

const PLACES_QUERIES_PER_RUN = parseInt(process.env.PLACES_QUERIES_PER_RUN || '15', 10);
const CSE_QUERIES_PER_RUN    = parseInt(process.env.CSE_QUERIES_PER_RUN    || '10', 10);
const DDG_QUERIES_PER_RUN    = parseInt(process.env.DDG_QUERIES_PER_RUN    || '12', 10);
const SCRAPE_DELAY_MS        = parseInt(process.env.SCRAPE_DELAY_MS        || '1200', 10);

const EMAIL_PREFIXES = ['info', 'contact', 'hello', 'enquiries', 'admin', 'sales', 'support'];

// ── Target industries × cities ─────────────────────────────────────────────
const BUSINESS_TYPES = [
  'law firm',
  'medical clinic',
  'dental practice',
  'accounting firm',
  'real estate agency',
  'insurance company',
  'logistics company',
  'manufacturing company',
  'management consulting firm',
  'marketing agency',
  'HR consulting firm',
  'financial services company',
  'property management company',
  'engineering company',
  'pharmaceutical company',
  'recruitment agency',
  'IT services company',
  'healthcare company',
  'educational institution',
  'e-commerce company',
  'hospitality group',
  'construction company',
  'retail chain',
  'telecommunications company',
  'food and beverage company',
];

const SEARCH_CITIES = [
  // South Africa
  'Johannesburg South Africa',
  'Cape Town South Africa',
  'Durban South Africa',
  'Pretoria South Africa',
  // UK
  'London UK',
  'Manchester UK',
  'Birmingham UK',
  'Glasgow UK',
  // USA
  'New York USA',
  'Chicago USA',
  'Los Angeles USA',
  'Houston USA',
  'Dallas USA',
  // Australia
  'Sydney Australia',
  'Melbourne Australia',
  'Brisbane Australia',
  // Canada
  'Toronto Canada',
  'Vancouver Canada',
  // Other
  'Dublin Ireland',
  'Auckland New Zealand',
  'Singapore',
  'Dubai UAE',
  'Nairobi Kenya',
  'Lagos Nigeria',
  'Accra Ghana',
];

// CSE / DDG search queries targeting businesses that need BPO services
const CSE_QUERIES = [
  '"outsource" "data entry" company "contact us" -site:linkedin.com -site:indeed.com',
  '"medical transcription" outsource "get a quote" -site:linkedin.com',
  '"back office" outsourcing company "contact" -site:linkedin.com -site:indeed.com',
  '"virtual assistant" outsourcing "hire" "company" -site:linkedin.com',
  '"accounts payable" outsource "service provider" contact',
  '"payroll processing" outsource "small business" contact',
  '"customer support" outsourcing BPO company contact -site:linkedin.com',
  'BPO services provider "contact us" "get a quote" -site:linkedin.com',
  '"document processing" outsource company "quote" -site:linkedin.com',
  '"content moderation" outsource company contact -site:linkedin.com',
  '"claims processing" outsource provider "contact us"',
  '"data capture" outsourcing company "get in touch" -site:linkedin.com',
  '"invoice processing" outsource company contact -site:linkedin.com',
  '"HR outsourcing" provider company "contact us" -site:linkedin.com',
  '"legal process outsourcing" company "get a quote"',
  '"finance and accounting" outsource BPO "contact" -site:linkedin.com',
  '"supply chain" outsource company "get a quote" -site:linkedin.com',
  '"IT helpdesk" outsource provider contact -site:linkedin.com',
  '"social media management" outsource agency "contact" -site:linkedin.com',
  '"translation services" outsource provider "quote" -site:linkedin.com',
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
}

// ── Store results ────────────────────────────────────────────────────────────
async function storeContacts(contacts) {
  let inserted = 0;
  for (const c of contacts) {
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
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask': 'places.displayName,places.websiteUri,places.formattedAddress,places.nationalPhoneNumber,places.businessStatus',
          },
          timeout: 15000,
        }
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
        const variants = buildEmailVariants(domain);
        for (const email of variants) {
          contacts.push({
            company: item.title || domain, website: item.link, domain, email,
            source: 'google_cse', query: q, snippet: item.snippet || null,
          });
        }
      }

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      console.log(`🔍 [SCRAPER] CSE "${q.slice(0, 50)}..." → ${items.length} results, ${inserted} new contacts`);
    } catch (err) {
      if (err.response?.status === 429) {
        console.warn('⚠️  [SCRAPER] CSE daily quota hit — stopping CSE for this run');
        break;
      }
      console.error(`❌ [SCRAPER] CSE error:`, err.response?.data?.error?.message || err.message);
    }
    await sleep(SCRAPE_DELAY_MS * 2);
  }

  return totalInserted;
}

// ── 3. DuckDuckGo HTML scraping ─────────────────────────────────────────────
const DDG_QUERIES = [
  'outsourcing company "contact us" site:.com',
  'BPO services provider "get a quote" -site:linkedin.com',
  'data entry outsourcing company "email us"',
  'virtual assistant company "contact" "hire"',
  'medical billing outsourcing company contact',
  'accounting outsourcing firm "contact us"',
  'payroll outsourcing company "get in touch"',
  'customer service outsourcing BPO company contact',
  'back office outsourcing provider "request a quote"',
  'document management outsourcing company email',
  'HR outsourcing company "free quote" contact',
  'content moderation outsourcing company contact',
  'legal transcription company outsource "contact us"',
  'supply chain outsourcing company email contact',
  'financial outsourcing company "get a quote"',
  'IT outsourcing helpdesk company "contact us"',
  'claims processing outsourcing provider contact',
  'translation outsourcing company "free quote"',
  'invoice processing BPO company contact',
  'social media outsourcing agency "contact us"',
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
      const contacts = [];

      $('.result').each((_, el) => {
        const titleEl = $(el).find('.result__title a');
        const snippet = $(el).find('.result__snippet').text().trim();
        let link = titleEl.attr('href') || '';

        // DDG uses redirect URLs — extract the actual URL
        if (link.includes('uddg=')) {
          try { link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]); } catch {}
        }

        const domain = extractDomain(link);
        if (!domain || domain.includes('duckduckgo') || domain.includes('google')) return;

        const variants = buildEmailVariants(domain);
        const title = titleEl.text().trim() || domain;

        for (const email of variants) {
          contacts.push({
            company: title, website: link, domain, email,
            source: 'duckduckgo', query: q, snippet: snippet || null,
          });
        }
      });

      const inserted = await storeContacts(contacts);
      totalInserted += inserted;
      console.log(`🦆 [SCRAPER] DDG "${q.slice(0, 50)}..." → ${contacts.length / EMAIL_PREFIXES.length | 0} sites, ${inserted} new contacts`);
    } catch (err) {
      if (err.response?.status === 429 || err.response?.status === 403) {
        console.warn('⚠️  [SCRAPER] DuckDuckGo rate-limited — pausing DDG this run');
        break;
      }
      console.error(`❌ [SCRAPER] DDG error for "${q.slice(0,40)}":`, err.message);
    }
    await sleep(SCRAPE_DELAY_MS * 3); // more polite delay for HTML scraping
  }

  return totalInserted;
}

// ── 4. SerpAPI extended (all BPO queries, run separately from job-search) ────
const SERP_BPO_QUERIES = [
  'outsourcing company South Africa "contact us" -site:linkedin.com',
  'BPO provider "get a quote" company -site:linkedin.com -site:indeed.com',
  'data capture company "request a quote" -site:linkedin.com',
  'transcription service provider "contact" -site:linkedin.com',
  'virtual assistant agency "hire" "contact us" -site:linkedin.com',
  'medical billing company outsource "contact us" -site:linkedin.com',
  'content moderation company outsource contact -site:linkedin.com',
  'document processing outsourcing company -site:linkedin.com',
  'accounts payable outsource company contact -site:linkedin.com',
  'payroll outsourcing service provider -site:linkedin.com',
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

      for (const r of results) {
        const domain = extractDomain(r.link);
        if (!domain) continue;
        const variants = buildEmailVariants(domain);
        for (const email of variants) {
          contacts.push({
            company: r.title || domain, website: r.link, domain, email,
            source: 'serpapi_bpo', query: q, snippet: r.snippet || null,
          });
        }
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
async function runAllScrapers() {
  console.log('🕷️  [SCRAPER] Starting multi-source scrape run...');
  let total = 0;

  try { total += await scrapeGooglePlaces(); }  catch (e) { console.error('[SCRAPER] Places failed:', e.message); }
  try { total += await scrapeGoogleCSE(); }      catch (e) { console.error('[SCRAPER] CSE failed:', e.message); }
  try { total += await scrapeDuckDuckGo(); }     catch (e) { console.error('[SCRAPER] DDG failed:', e.message); }
  try { total += await scrapeViaSerpAPI(); }     catch (e) { console.error('[SCRAPER] SerpAPI BPO failed:', e.message); }

  console.log(`✅ [SCRAPER] Run complete — ${total} new contacts stored in scraped_contacts`);
  return total;
}

// ── Continuous mode: per-query engine ────────────────────────────────────────

// Build master flat list of ALL queries across every source
function buildAllPairs() {
  const pairs = [];
  // Google Places: 25 types × 25 cities = 625
  for (const city of SEARCH_CITIES) {
    for (const type of BUSINESS_TYPES) {
      pairs.push({ source: 'google_places', query: `${type} ${city}`, type, city });
    }
  }
  // Google CSE
  for (const q of CSE_QUERIES) pairs.push({ source: 'google_cse', query: q });
  // DuckDuckGo
  for (const q of DDG_QUERIES) pairs.push({ source: 'duckduckgo', query: q });
  // SerpAPI BPO
  for (const q of SERP_BPO_QUERIES) pairs.push({ source: 'serpapi_bpo', query: q });
  return pairs;
}

// Execute exactly ONE query for any source — returns count of new contacts stored
async function runOnePair(pair) {
  try {
    if (pair.source === 'google_places') {
      if (!GOOGLE_API_KEY) return 0;
      const res = await axios.post(
        'https://places.googleapis.com/v1/places:searchText',
        { textQuery: pair.query, languageCode: 'en', maxResultCount: 20 },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask': 'places.displayName,places.websiteUri,places.formattedAddress,places.nationalPhoneNumber,places.businessStatus',
          },
          timeout: 15000,
        }
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
  } catch (err) {
    if (err.response?.status === 429 || err.response?.status === 403) return -429; // rate limit signal
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
  recentQueries: [], // last 50 [{source, query, found, ts}]
};

const SOURCE_LABELS = {
  google_places: 'Google Places',
  google_cse:    'Google CSE',
  duckduckgo:    'DuckDuckGo',
  serpapi_bpo:   'SerpAPI',
};
const SOURCE_DELAYS = {
  google_places: 1200,
  google_cse:    2500,
  duckduckgo:    3500,
  serpapi_bpo:   1500,
};

async function runContinuous(onUpdate) {
  if (_continuousRunning) return;
  _continuousRunning = true;
  _continuousStats.running = true;

  // Build shuffled query list
  const allPairs = buildAllPairs();
  const shuffled = allPairs.sort(() => 0.5 - Math.random());
  let idx = 0;

  while (_continuousRunning) {
    if (idx >= shuffled.length) {
      idx = 0;
      _continuousStats.cyclesCompleted++;
      shuffled.sort(() => 0.5 - Math.random()); // reshuffle each cycle for variety
    }

    const pair = shuffled[idx++];
    _continuousStats.source      = pair.source;
    _continuousStats.sourceLabel = SOURCE_LABELS[pair.source] || pair.source;
    _continuousStats.query       = pair.query;
    _continuousStats.lastQueryTs = new Date().toISOString();

    if (onUpdate) onUpdate({ type: 'start', ...pair });

    const found = await runOnePair(pair);
    const realFound = found < 0 ? 0 : found;

    _continuousStats.totalQueries++;
    _continuousStats.lastFound = realFound;
    if (realFound > 0) _continuousStats.totalContactsAdded += realFound;

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
  // Continuous mode
  runContinuous,
  stopContinuous,
  getContinuousStats,
  buildAllPairs,
};
