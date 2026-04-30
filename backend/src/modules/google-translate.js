/**
 * Google Cloud Translation API
 * Performs translation jobs for clients — one of CTS BPO's core services.
 * Uses REST API with Google API Key.
 */
const axios = require('axios');
const auditLogger = require('./audit-logger');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const BASE = 'https://translation.googleapis.com/language/translate/v2';

function isConfigured() { return !!GOOGLE_API_KEY; }

/**
 * Translate text into a target language.
 * @param {string} text  - The text to translate
 * @param {string} targetLang - ISO 639-1 code e.g. 'fr', 'de', 'es', 'zh', 'af'
 * @param {string} sourceLang - Optional. Auto-detected if not provided.
 * @returns {{ translatedText, detectedSourceLanguage, characters }}
 */
async function translateText(text, targetLang = 'en', sourceLang = null) {
  if (!isConfigured()) {
    return { simulated: true, translatedText: `[TRANSLATION SIMULATED] ${text}`, targetLang };
  }
  const params = { key: GOOGLE_API_KEY };
  const body = { q: text, target: targetLang, format: 'text' };
  if (sourceLang) body.source = sourceLang;

  const res = await axios.post(BASE, body, { params, timeout: 15000 });
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

/**
 * Get list of supported languages.
 */
async function getSupportedLanguages() {
  if (!isConfigured()) return { simulated: true, languages: [] };
  const res = await axios.get(`${BASE}/languages`, {
    params: { key: GOOGLE_API_KEY, target: 'en' }, timeout: 10000
  });
  return res.data.data.languages;
}

/**
 * Detect the language of a text.
 */
async function detectLanguage(text) {
  if (!isConfigured()) return { simulated: true, language: 'unknown', confidence: 0 };
  const res = await axios.post(`${BASE}/detect`, { q: text }, {
    params: { key: GOOGLE_API_KEY }, timeout: 10000
  });
  return res.data.data.detections[0][0];
}

module.exports = { translateText, getSupportedLanguages, detectLanguage, isConfigured };
