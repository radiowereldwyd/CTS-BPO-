/**
 * Google Cloud Translation API
 * Performs translation jobs for clients — one of CTS BPO's core services.
 * Prefers Service Account auth (Bearer token); falls back to API key.
 */
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const auditLogger = require('./audit-logger');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const SA_JSON        = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const BASE = 'https://translation.googleapis.com/language/translate/v2';

let _saToken = null;
let _saTokenExpiry = 0;

async function getSaToken() {
  if (_saToken && Date.now() < _saTokenExpiry) return _saToken;
  if (!SA_JSON) return null;
  try {
    const auth = new GoogleAuth({
      credentials: JSON.parse(SA_JSON),
      scopes: ['https://www.googleapis.com/auth/cloud-translation'],
    });
    const client = await auth.getClient();
    const t = await client.getAccessToken();
    _saToken = t.token;
    _saTokenExpiry = Date.now() + 55 * 60 * 1000; // refresh 5min before expiry
    return _saToken;
  } catch { return null; }
}

function isConfigured() { return !!(SA_JSON || GOOGLE_API_KEY); }

async function makeRequest(method, path, body, extraParams = {}) {
  const token = await getSaToken();
  if (token) {
    const cfg = {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
      timeout: 15000,
    };
    const res = method === 'post'
      ? await axios.post(`${BASE}${path}`, body, cfg)
      : await axios.get(`${BASE}${path}`, { ...cfg, params: extraParams });
    if (res.status === 200) return res;
  }
  // Fallback: API key
  const cfg = { params: { key: GOOGLE_API_KEY, ...extraParams }, timeout: 15000 };
  return method === 'post'
    ? await axios.post(`${BASE}${path}`, body, cfg)
    : await axios.get(`${BASE}${path}`, cfg);
}

async function translateText(text, targetLang = 'en', sourceLang = null) {
  if (!isConfigured()) {
    return { simulated: true, translatedText: `[TRANSLATION SIMULATED] ${text}`, targetLang };
  }
  const body = { q: text, target: targetLang, format: 'text' };
  if (sourceLang) body.source = sourceLang;

  const res = await makeRequest('post', '', body);
  const result = res.data.data.translations[0];

  await auditLogger.log('ai.translate', null, null,
    `Translated ${text.length} chars → ${targetLang}`, null, 'info');

  return {
    translatedText: result.translatedText,
    detectedSourceLanguage: result.detectedSourceLanguage || sourceLang,
    characters: text.length,
    targetLang,
  };
}

async function getSupportedLanguages() {
  if (!isConfigured()) return { simulated: true, languages: [] };
  const res = await makeRequest('get', '/languages', null, { target: 'en' });
  return res.data.data.languages;
}

async function detectLanguage(text) {
  if (!isConfigured()) return { simulated: true, language: 'unknown', confidence: 0 };
  const res = await makeRequest('post', '/detect', { q: text });
  return res.data.data.detections[0][0];
}

module.exports = { translateText, getSupportedLanguages, detectLanguage, isConfigured, getSaToken };
