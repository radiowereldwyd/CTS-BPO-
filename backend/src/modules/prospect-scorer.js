/**
 * CTS BPO — AI Prospect Scorer
 * Scores every scraped contact 0–100 based on conversion likelihood.
 * Higher score → sent first in the outreach queue.
 *
 * Scoring breakdown (max 100):
 *   MX verified          +35  (real mail server = real business)
 *   Business type         +25  (law firm, medical, accounting etc.)
 *   Source quality        +25  (serpapi/targeted > cse > ddg > places)
 *   BPO signals in text   +10  (snippet/query mentions outsourcing keywords)
 *   Has real company name  +5  (not just domain)
 */

const HIGH_VALUE_TYPES = {
  'law firm':                    25, 'legal services':              25,
  'accounting firm':             22, 'financial services company':  22,
  'insurance company':           22, 'medical clinic':              20,
  'healthcare company':          20, 'dental practice':             18,
  'pharmaceutical company':      18, 'hospital':                    20,
  'recruitment agency':          18, 'hr consulting firm':          18,
  'management consulting firm':  16, 'it services company':         16,
  'logistics company':           15, 'property management company': 15,
  'real estate agency':          12, 'engineering firm':            14,
  'architecture firm':           12, 'marketing agency':            10,
};

// Source quality (how targeted was the scrape that found this lead)
function sourceScore(source) {
  const s = (source || '').toLowerCase();
  if (s.startsWith('targeted'))   return 25;
  if (s === 'serpapi_bpo')        return 22;
  if (s === 'google_cse')         return 18;
  if (s === 'duckduckgo')         return 16;
  if (s === 'google_places')      return  8;
  return 8;
}

const BPO_SIGNAL_RE = /(outsourc|data.?entr|data.?captur|transcri|translat|virtual.?assist|back.?offic|document.?process|invoice.?process|payroll|medical.?bill|bpo|content.?moderat|digitiz|bookkeep|legal.?transcri|hr.?admin|claims.?process|data.?migrat)/i;

function scoreContact(c) {
  let score = 0;

  // 1. MX verification (most impactful — a real mail server = a real business)
  if (c.mx_verified === true)                              score += 35;
  else if (c.mx_verified === null || c.mx_verified === undefined) score += 5; // unknown = small optimism

  // 2. Business type value
  const btype = (c.business_type || '').toLowerCase();
  score += HIGH_VALUE_TYPES[btype] || 0;

  // 3. Source quality
  score += sourceScore(c.source);

  // 4. BPO signals in snippet / query text
  const hay = `${c.snippet || ''} ${c.query_used || ''} ${c.business_type || ''}`;
  if (BPO_SIGNAL_RE.test(hay)) score += 10;

  // 5. Has a real company name (not just the domain)
  if (c.company && c.company !== c.domain && c.company.length > 3) score += 5;

  return Math.min(100, Math.round(score));
}

function scoreContacts(contacts) {
  return contacts.map(c => ({ ...c, prospect_score: scoreContact(c) }));
}

module.exports = { scoreContact, scoreContacts };
