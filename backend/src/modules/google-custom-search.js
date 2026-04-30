/**
 * Google Custom Search API
 * Supplements SerpApi for job scanning — 100 free searches/day.
 * Requires: GOOGLE_API_KEY + GOOGLE_CSE_ID (Custom Search Engine ID).
 */
const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GOOGLE_CSE_ID  = process.env.GOOGLE_CSE_ID  || '';
const BASE = 'https://www.googleapis.com/customsearch/v1';

function isConfigured() { return !!(GOOGLE_API_KEY && GOOGLE_CSE_ID); }

/**
 * Search Google via Custom Search API.
 * @param {string} query
 * @param {number} num - Results (max 10 per call)
 * @returns {Array} organic results shaped like SerpApi results
 */
async function search(query, num = 10) {
  if (!isConfigured()) {
    throw new Error('Google Custom Search not configured. Add GOOGLE_API_KEY and GOOGLE_CSE_ID.');
  }

  const res = await axios.get(BASE, {
    params: { key: GOOGLE_API_KEY, cx: GOOGLE_CSE_ID, q: query, num: Math.min(num, 10) },
    timeout: 15000,
  });

  const items = res.data.items || [];
  // Shape results same as SerpApi organic_results for compatibility
  return items.map(item => ({
    title:   item.title,
    link:    item.link,
    snippet: item.snippet,
    source:  'google-cse',
  }));
}

module.exports = { search, isConfigured };
