/**
 * Google Cloud Speech-to-Text API
 * Performs audio transcription jobs for clients — core CTS BPO service.
 * Accepts base64-encoded audio or a Google Cloud Storage URI.
 */
const axios = require('axios');
const auditLogger = require('./audit-logger');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const BASE = 'https://speech.googleapis.com/v1/speech:recognize';
const BASE_ASYNC = 'https://speech.googleapis.com/v1/speech:longrunningrecognize';

function isConfigured() { return !!GOOGLE_API_KEY; }

/**
 * Transcribe short audio (< 60 seconds) from base64 content.
 * @param {string} audioBase64 - Base64-encoded audio content
 * @param {string} encoding    - FLAC | MP3 | LINEAR16 | OGG_OPUS | WEBM_OPUS
 * @param {number} sampleRateHertz - e.g. 16000
 * @param {string} languageCode    - e.g. 'en-ZA', 'en-US', 'af-ZA'
 */
async function transcribeAudio({ audioBase64, encoding = 'MP3', sampleRateHertz = 16000, languageCode = 'en-ZA' }) {
  if (!isConfigured()) {
    return { simulated: true, transcript: '[TRANSCRIPTION SIMULATED] Audio transcription would appear here.', confidence: 0 };
  }

  const body = {
    config: { encoding, sampleRateHertz, languageCode, enableAutomaticPunctuation: true, model: 'latest_long' },
    audio: { content: audioBase64 },
  };

  const res = await axios.post(BASE, body, { params: { key: GOOGLE_API_KEY }, timeout: 30000 });
  const results = res.data.results || [];
  const transcript = results.map(r => r.alternatives[0]?.transcript || '').join(' ').trim();
  const confidence = results[0]?.alternatives[0]?.confidence || 0;

  await auditLogger.log('ai.transcribe', null, null, `Transcribed audio (${languageCode}): ${transcript.length} chars`, null, 'info');
  return { transcript, confidence, languageCode, wordCount: transcript.split(/\s+/).length };
}

/**
 * Transcribe audio from a Google Cloud Storage URI (for long audio > 60s).
 * @param {string} gcsUri - e.g. 'gs://your-bucket/audio.mp3'
 */
async function transcribeFromGCS({ gcsUri, encoding = 'MP3', sampleRateHertz = 16000, languageCode = 'en-ZA' }) {
  if (!isConfigured()) return { simulated: true, transcript: '[GCS TRANSCRIPTION SIMULATED]' };

  const body = {
    config: { encoding, sampleRateHertz, languageCode, enableAutomaticPunctuation: true },
    audio: { uri: gcsUri },
  };

  // Long-running operation
  const opRes = await axios.post(BASE_ASYNC, body, { params: { key: GOOGLE_API_KEY }, timeout: 15000 });
  return { operationName: opRes.data.name, status: 'processing', message: 'Long audio job submitted. Poll /api/ai/transcribe/status/:operationName' };
}

module.exports = { transcribeAudio, transcribeFromGCS, isConfigured };
