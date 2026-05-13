/**
 * Gemini AI Email Personalizer — FREE (uses GOOGLE_API_KEY)
 *
 * Generates a unique, human-sounding opening sentence and subject line
 * for each prospect using their company snippet, business type, city, and country.
 *
 * Falls back gracefully if Gemini is unavailable or rate-limited.
 * In-memory cache keyed by domain — never personalizes the same company twice.
 */

const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`;
const TIMEOUT_MS     = 6000;

// In-memory cache — survives the session, resets on restart (intentional — keeps it fresh)
const _cache = new Map();

// Subject line templates per service type — rotate to avoid pattern detection
const SUBJECT_TEMPLATES = {
  'medical-billing': [
    'quick question for your practice',
    'billing admin — thought this might help',
    'reducing your billing overhead',
    'medical billing at {pct}% below what you\'re paying now',
    're: your billing admin workload',
  ],
  'legal-transcription': [
    'quick question for {company}',
    'legal transcription — a thought',
    'cutting your transcription costs',
    're: admin support for {company}',
    'saving {company} time on paperwork',
  ],
  'dental-billing': [
    'dental claims — a better rate',
    'quick one for {company}',
    're: your billing admin',
    'billing support — thought you\'d want to see this',
    'dental admin at {pct}% below market',
  ],
  'bookkeeping': [
    'bookkeeping — thought this might interest you',
    'quick question about your accounts',
    'cutting your bookkeeping costs',
    're: payroll & accounts for {company}',
    'a better rate for {company}\'s books',
  ],
  'data-entry': [
    'data entry — thought this might help',
    'quick question for {company}',
    'cutting your data processing costs',
    're: your data workload',
    'faster data entry at a better price',
  ],
  'customer-support': [
    'customer support — a thought',
    'quick question for {company}',
    're: your support team costs',
    'better customer support, lower cost',
    'support outsourcing — interested?',
  ],
  'hr-admin': [
    'HR admin — quick question',
    'cutting your recruitment admin costs',
    're: candidate screening for {company}',
    'HR support at {pct}% below market',
    'quick one for {company}',
  ],
  'property-admin': [
    'property admin — a thought',
    'quick question for {company}',
    'cutting your property admin workload',
    're: lease administration for {company}',
    'property admin at a better rate',
  ],
  'claims-processing': [
    'claims processing — thought this might help',
    'quick question for {company}',
    're: your claims workload',
    'insurance admin at {pct}% below market',
    'faster claims processing, lower cost',
  ],
  'financial-reporting': [
    'financial reporting — a thought',
    'quick question for {company}',
    're: your reporting workload',
    'compliance admin at a better rate',
    'cutting your finance admin costs',
  ],
  'default': [
    'quick question for {company}',
    'thought this might be useful',
    're: your admin workload',
    'outsourcing admin — interested?',
    'cutting your back-office costs',
    'a thought for {company}',
    'quick one — admin support',
  ],
};

function pickSubjectTemplate(serviceKey, company, discountPct) {
  const templates = SUBJECT_TEMPLATES[serviceKey] || SUBJECT_TEMPLATES['default'];
  const tmpl = templates[Math.floor(Math.random() * templates.length)];
  const co   = (company || '').split(/[\s,&]+/)[0] || company || 'your team'; // first word only
  return tmpl
    .replace('{company}', co)
    .replace('{pct}', discountPct || '15');
}

/**
 * Generate a personalized email opener using Gemini.
 * Returns a single sentence (15–25 words) that sounds researched, not mass-emailed.
 */
async function generateOpener({ company, businessType, city, country, snippet }) {
  if (!GOOGLE_API_KEY) return null;

  const cacheKey = `${company}|${businessType}|${city}`.toLowerCase();
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  const loc     = city ? `in ${city}` : country ? `in ${country}` : '';
  const typeStr = (businessType || '').replace(/-/g, ' ');
  const snippetClean = (snippet || '').replace(/<[^>]+>/g, '').slice(0, 200);

  const prompt = `You are writing ONE opening sentence for a cold email from Calvin Thomas at CTS BPO Solutions.
The recipient is ${company || 'a business'} — a ${typeStr} ${loc}.
${snippetClean ? `Context about them: "${snippetClean}"` : ''}

Rules:
- Exactly ONE sentence, maximum 20 words
- Must reference something SPECIFIC: their location, their industry, or a detail from the context
- Must sound like a human wrote it after 2 minutes of research, NOT mass email
- No "I hope this email finds you well"
- No "I came across your website"
- No exclamation marks
- Start with something like: "Working with [specific type] businesses in [city]..." or "Given that [company] handles [specific thing]..." or "Most [type] practices in [city]..."
- Output the sentence ONLY — no explanation, no quotes`;

  try {
    const res = await axios.post(
      GEMINI_URL,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: TIMEOUT_MS }
    );
    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text && text.length > 10 && text.length < 300) {
      // Clean up: remove quotes if Gemini wrapped it
      const clean = text.replace(/^["']|["']$/g, '').trim();
      _cache.set(cacheKey, clean);
      return clean;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate a personalized subject line using Gemini.
 * Falls back to template-based subject if Gemini fails.
 */
async function generateSubject({ company, businessType, city, serviceKey, discountPct }) {
  // Try template first (always available, fast)
  const templateSubject = pickSubjectTemplate(serviceKey, company, discountPct);

  if (!GOOGLE_API_KEY) return templateSubject;

  const subjectCacheKey = `subj|${company}|${serviceKey}`.toLowerCase();
  if (_cache.has(subjectCacheKey)) return _cache.get(subjectCacheKey);

  const loc     = city ? `in ${city}` : '';
  const typeStr = (businessType || '').replace(/-/g, ' ');

  const prompt = `Write ONE cold email subject line for a BPO outsourcing pitch to ${company || 'a business'}, a ${typeStr} ${loc}.

Rules:
- 4–8 words maximum
- Must feel like a human wrote it, NOT mass email software
- No ALL CAPS, no exclamation marks
- Do NOT start with "Re:" or "Fwd:"
- Should be curiosity-inducing or reference their specific industry
- Do NOT use the word "proposal" or "pricing"
- Examples of good subjects: "quick question for Smith & Co", "cutting your billing costs", "admin help for dentists in Cape Town"
- Output the subject line ONLY — no explanation`;

  try {
    const res = await axios.post(
      GEMINI_URL,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 4000 }
    );
    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text && text.length > 5 && text.length < 80) {
      const clean = text.replace(/^["']|["']$/g, '').trim();
      _cache.set(subjectCacheKey, clean);
      return clean;
    }
    return templateSubject;
  } catch {
    return templateSubject;
  }
}

/**
 * Main export: personalize an email for a given contact.
 * Returns { opener, subject } — both may be null if Gemini is down (caller falls back).
 */
async function personalizeEmail({ company, businessType, city, country, snippet, serviceKey, discountPct }) {
  const [opener, subject] = await Promise.all([
    generateOpener({ company, businessType, city, country, snippet }).catch(() => null),
    generateSubject({ company, businessType, city, serviceKey, discountPct }).catch(() => null),
  ]);
  return { opener, subject };
}

/**
 * Get cache stats for monitoring
 */
function getCacheStats() {
  return { cached: _cache.size };
}

module.exports = { personalizeEmail, getCacheStats };
