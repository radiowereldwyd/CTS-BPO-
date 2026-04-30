/**
 * Google Cloud Natural Language API
 * Analyses incoming email replies from clients:
 *   - Sentiment (positive/negative/neutral)
 *   - Entities (company names, people, dates)
 *   - Intent classification (interested / rejected / needs-info / out-of-office)
 * Used to auto-update lead status when replies come in.
 */
const axios = require('axios');
const auditLogger = require('./audit-logger');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const NL_BASE = 'https://language.googleapis.com/v1/documents';

function isConfigured() { return !!GOOGLE_API_KEY; }

/**
 * Analyse sentiment of a text (email reply).
 * @returns {{ score, magnitude, label, intent }}
 *   score: -1 (very negative) to +1 (very positive)
 *   magnitude: strength of sentiment
 *   label: 'positive' | 'negative' | 'neutral' | 'mixed'
 *   intent: 'interested' | 'rejected' | 'needs-info' | 'out-of-office' | 'unknown'
 */
async function analyseSentiment(text) {
  if (!isConfigured()) {
    return { simulated: true, score: 0, magnitude: 0, label: 'neutral', intent: 'unknown' };
  }

  const body = { document: { type: 'PLAIN_TEXT', content: text }, encodingType: 'UTF8' };
  const res = await axios.post(`${NL_BASE}:analyzeSentiment`, body, {
    params: { key: GOOGLE_API_KEY }, timeout: 10000
  });

  const { score, magnitude } = res.data.documentSentiment;
  const label = score > 0.25 ? 'positive' : score < -0.25 ? 'negative' : magnitude > 0.5 ? 'mixed' : 'neutral';

  // Classify intent based on text keywords + sentiment
  const lower = text.toLowerCase();
  let intent = 'unknown';
  if (lower.includes('not interest') || lower.includes('no thank') || lower.includes('unsubscribe') || score < -0.4) intent = 'rejected';
  else if (lower.includes('out of office') || lower.includes('away') || lower.includes('vacation')) intent = 'out-of-office';
  else if (lower.includes('more info') || lower.includes('tell me more') || lower.includes('question') || lower.includes('?')) intent = 'needs-info';
  else if (score > 0.2 || lower.includes('interest') || lower.includes('yes') || lower.includes('contact') || lower.includes('call')) intent = 'interested';

  await auditLogger.log('ai.nlp', null, null, `Sentiment: ${label} (${score.toFixed(2)}) | Intent: ${intent}`, null, 'info');
  return { score, magnitude, label, intent };
}

/**
 * Extract entities (people, companies, dates) from a text.
 */
async function extractEntities(text) {
  if (!isConfigured()) return { simulated: true, entities: [] };

  const body = { document: { type: 'PLAIN_TEXT', content: text }, encodingType: 'UTF8' };
  const res = await axios.post(`${NL_BASE}:analyzeEntities`, body, {
    params: { key: GOOGLE_API_KEY }, timeout: 10000
  });

  return res.data.entities
    .filter(e => ['PERSON', 'ORGANIZATION', 'DATE', 'LOCATION'].includes(e.type))
    .map(e => ({ name: e.name, type: e.type, salience: e.salience }))
    .sort((a, b) => b.salience - a.salience)
    .slice(0, 10);
}

/**
 * Full reply analysis — sentiment + entities combined.
 */
async function analyseEmailReply(emailText) {
  const [sentiment, entities] = await Promise.all([
    analyseSentiment(emailText),
    extractEntities(emailText),
  ]);
  return { sentiment, entities, analysedAt: new Date().toISOString() };
}

module.exports = { analyseSentiment, extractEntities, analyseEmailReply, isConfigured };
