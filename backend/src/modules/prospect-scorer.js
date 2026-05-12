/**
 * CTS BPO — AI Prospect Scorer
 * Scores every scraped contact 0–100 based on BPO conversion likelihood.
 * Higher score → sent first in the outreach queue.
 *
 * Scoring breakdown (max 100):
 *   MX verified          +30  (real mail server = real business)
 *   Business type        +30  (industry BPO adoption tier)
 *   Source quality       +20  (how targeted was the scrape)
 *   BPO signals in text  +15  (snippet/query mentions outsourcing keywords)
 *   Has real company name +5  (not just a domain)
 */

// ── Tier 1: Highest BPO adoption (30 pts) ────────────────────────────────────
const TIER1_TYPES = new Set([
  'financial services company', 'insurance company', 'insurance brokerage',
  'health insurance company', 'accounting firm', 'chartered accountant practice',
  'payroll services company', 'audit firm', 'asset management firm',
  'fintech company', 'credit union', 'medical billing company',
  'business process outsourcing company', 'shared services company',
  'back office services company', 'hr outsourcing company',
]);

// ── Tier 2: High BPO adoption (22 pts) ───────────────────────────────────────
const TIER2_TYPES = new Set([
  'law firm', 'legal services company', 'solicitor firm',
  'bookkeeping company', 'tax advisory firm', 'wealth management company',
  'mortgage company', 'logistics company', 'freight forwarding company',
  'supply chain company', 'third-party logistics company',
  'e-commerce company', 'online retail company', 'wholesale distributor',
  'recruitment agency', 'staffing agency', 'workforce management company',
  'healthcare management company', 'pharmacy benefits company',
  'hospital administration company',
]);

// ── Tier 3: Moderate BPO adoption (14 pts) ───────────────────────────────────
const TIER3_TYPES = new Set([
  'software company', 'it services company', 'managed services provider',
  'saas company', 'technology company', 'management consulting firm',
  'property management company', 'commercial real estate company',
  'real estate investment company', 'warehousing company',
  'retail chain', 'it services company',
]);

// Source quality scores — how targeted was the scrape
function sourceScore(source) {
  const s = (source || '').toLowerCase();
  if (s.startsWith('targeted'))    return 20; // manually triggered targeted scrape
  if (s === 'serpapi_bpo')         return 18; // high-intent SerpAPI query
  if (s === 'google_cse')          return 16; // structured CSE query
  if (s === 'duckduckgo')          return 14; // buying-intent DDG query
  if (s === 'bing')                return 12; // buying-intent Bing query
  if (s === 'youtube_api')         return 10; // YouTube channel scrape
  if (s === 'facebook_search')     return  8; // Facebook page scrape
  if (s === 'google_places')       return  5; // least targeted — local business lookup
  return 6;
}

// BPO signal detection — snippet or query contains outsourcing keywords
const BPO_SIGNAL_RE = /(outsourc|data.?entr|data.?captur|transcri|translat|virtual.?assist|back.?offic|document.?process|invoice.?process|payroll|medical.?bill|bpo|content.?moderat|digitiz|bookkeep|legal.?transcri|hr.?admin|claims.?process|data.?migrat|offshoring|nearshoring|shared.?service|front.?offic|accounts.?payabl|accounts.?receivabl)/i;

function scoreContact(c) {
  let score = 0;

  // 1. MX verification — real mail server = real operating business
  if (c.mx_verified === true)                               score += 30;
  else if (c.mx_verified === null || c.mx_verified === undefined) score += 4; // unknown — slight optimism

  // 2. Business type tier
  const btype = (c.business_type || '').toLowerCase().trim();
  if (TIER1_TYPES.has(btype))      score += 30;
  else if (TIER2_TYPES.has(btype)) score += 22;
  else if (TIER3_TYPES.has(btype)) score += 14;
  // Anything else = 0 (consumer businesses, clinics, etc.)

  // 3. Source quality
  score += sourceScore(c.source);

  // 4. BPO signals in snippet or query text
  const hay = `${c.snippet || ''} ${c.query_used || ''} ${c.business_type || ''}`;
  if (BPO_SIGNAL_RE.test(hay)) score += 15;

  // 5. Has a real distinct company name (not just the domain)
  if (c.company && c.company !== c.domain && c.company.length > 3) score += 5;

  return Math.min(100, Math.round(score));
}

function scoreContacts(contacts) {
  return contacts.map(c => ({ ...c, prospect_score: scoreContact(c) }));
}

module.exports = { scoreContact, scoreContacts };
