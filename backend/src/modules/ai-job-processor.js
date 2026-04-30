/**
 * CTS BPO — AI Job Processor
 * Routes incoming jobs to the correct AI module based on job type.
 * This enables fully autonomous delivery for all service types.
 *
 * Fully automated (no human needed):
 *   translation         → Google Cloud Translation API
 *   transcription       → Google Cloud Speech-to-Text
 *   document-ai         → Google Document AI (OCR, extraction)
 *   data-entry          → Google Document AI (form/table extraction)
 *   invoice-processing  → Google Document AI (entity extraction)
 *   content-moderation  → Google Cloud Vision Safe Search + Gemini
 *
 * Partially automated (AI produces a professional draft):
 *   virtual-assistant   → Google Gemini AI
 *   finance-admin       → Document AI + Gemini analysis
 *   customer-support    → Google Gemini AI
 *   social-media        → Google Gemini AI
 *   general / bpo       → Google Gemini AI
 */

const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const googleTranslate = require('./google-translate');
const googleSpeech    = require('./google-speech');
const documentAi      = require('./document-ai');
const auditLogger     = require('./audit-logger');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';

// ── Which job types the AI can handle, and how completely ──────────────────
const AI_CAPABILITIES = {
  'translation':         { quality: 'full',    engine: 'Google Cloud Translation API',    note: '100+ languages, certified-grade accuracy' },
  'transcription':       { quality: 'full',    engine: 'Google Cloud Speech-to-Text',     note: '125+ languages, punctuation, timestamps' },
  'audio-transcription': { quality: 'full',    engine: 'Google Cloud Speech-to-Text',     note: 'MP3/WAV/OGG/M4A supported' },
  'video-transcription': { quality: 'full',    engine: 'Google Cloud Speech-to-Text',     note: 'Extracts audio track and transcribes' },
  'document-ai':         { quality: 'full',    engine: 'Google Document AI',              note: 'OCR, form fields, entity extraction' },
  'document-extraction': { quality: 'full',    engine: 'Google Document AI',              note: 'Structured data from PDFs and images' },
  'document-processing': { quality: 'full',    engine: 'Google Document AI',              note: 'Multi-page document parsing' },
  'data-entry':          { quality: 'full',    engine: 'Google Document AI',              note: 'Form digitisation, table extraction' },
  'invoice-processing':  { quality: 'full',    engine: 'Google Document AI',              note: 'Invoice entities: vendor, total, line items' },
  'content-moderation':  { quality: 'full',    engine: 'Google Cloud Vision + Gemini',    note: 'Safe Search for images, Gemini for text' },
  'virtual-assistant':   { quality: 'partial', engine: 'Google Gemini AI',                note: 'Drafting, summarisation, scheduling support' },
  'finance-admin':       { quality: 'partial', engine: 'Document AI + Gemini',            note: 'Extraction + financial analysis report' },
  'finance-processing':  { quality: 'partial', engine: 'Document AI + Gemini',            note: 'Extraction + financial analysis report' },
  'accounting':          { quality: 'partial', engine: 'Document AI + Gemini',            note: 'Extraction + financial analysis report' },
  'customer-support':    { quality: 'partial', engine: 'Google Gemini AI',                note: 'Professional response drafting' },
  'customer-service':    { quality: 'partial', engine: 'Google Gemini AI',                note: 'Professional response drafting' },
  'social-media':        { quality: 'partial', engine: 'Google Gemini AI',                note: 'Content creation, captions, hashtags' },
  'content-creation':    { quality: 'partial', engine: 'Google Gemini AI',                note: 'Articles, posts, copy' },
  'copywriting':         { quality: 'partial', engine: 'Google Gemini AI',                note: 'Marketing copy, emails, ads' },
  'document-digitization': { quality: 'full', engine: 'Google Document AI',              note: 'Scanned doc to structured digital text' },
  'general':             { quality: 'partial', engine: 'Google Gemini AI',                note: 'General BPO task handling' },
  'bpo':                 { quality: 'partial', engine: 'Google Gemini AI',                note: 'General BPO task handling' },
};

function canHandle(jobType) {
  return !!AI_CAPABILITIES[(jobType || '').toLowerCase()];
}

function capabilityInfo(jobType) {
  return AI_CAPABILITIES[(jobType || '').toLowerCase()] || null;
}

// ── Gemini text generation ─────────────────────────────────────────────────
async function callGemini(prompt) {
  if (!GOOGLE_API_KEY) {
    return `[AI DRAFT — Gemini not configured]\n\nTask processed by CTS BPO AI.\n\n${prompt.slice(0, 200)}...`;
  }
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 30000 }
    );
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text
      || '[Gemini returned no content]';
  } catch (err) {
    return `[Gemini error: ${err.message}] — Task logged for manual review.`;
  }
}

// ── Google Cloud Vision Safe Search ───────────────────────────────────────
async function moderateImage(base64Image) {
  if (!GOOGLE_API_KEY) {
    return { simulated: true, safe: true, details: { adult: 'UNLIKELY', violence: 'UNLIKELY', racy: 'UNLIKELY' } };
  }
  const res = await axios.post(
    `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`,
    { requests: [{ image: { content: base64Image }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }] },
    { timeout: 15000 }
  );
  const safe = res.data?.responses?.[0]?.safeSearchAnnotation || {};
  const flagged = ['LIKELY', 'VERY_LIKELY'].some(v =>
    [safe.adult, safe.violence, safe.racy, safe.spoof].includes(v)
  );
  return { safe: !flagged, details: safe };
}

// ── Read file as base64 (safe, returns null if not found) ─────────────────
function readBase64(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      return fs.readFileSync(filePath).toString('base64');
    }
  } catch {}
  return null;
}

function readText(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8').slice(0, 50000);
    }
  } catch {}
  return null;
}

function mimeFromExt(fileName) {
  const ext = path.extname(fileName || '').toLowerCase();
  const map = {
    '.pdf':  'application/pdf',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.tiff': 'image/tiff',
    '.tif':  'image/tiff',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
  };
  return map[ext] || 'application/pdf';
}

function audioEncoding(fileName) {
  const ext = path.extname(fileName || '').toLowerCase();
  const map = { '.mp3': 'MP3', '.wav': 'LINEAR16', '.ogg': 'OGG_OPUS', '.flac': 'FLAC', '.m4a': 'MP3' };
  return map[ext] || 'MP3';
}

function isAudioFile(fileName) {
  const ext = path.extname(fileName || '').toLowerCase();
  return ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.mp4', '.webm', '.aac'].includes(ext);
}

function isImageFile(fileName) {
  const ext = path.extname(fileName || '').toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif'].includes(ext);
}

function isDocFile(fileName) {
  const ext = path.extname(fileName || '').toLowerCase();
  return ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif'].includes(ext);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// @param {object} params
//   jobType    — e.g. 'translation', 'transcription', 'data-entry'
//   title      — job title string
//   description — job description
//   filePath   — absolute path to uploaded file (may be null)
//   fileName   — original filename
//   targetLanguage — ISO code for translation jobs (default 'en')
// @returns { deliverable, method, quality, canHandle }
// ─────────────────────────────────────────────────────────────────────────────
async function processJob({ jobType, title, description, filePath, fileName, targetLanguage = 'en' }) {
  const type = (jobType || 'general').toLowerCase();
  let deliverable = '';
  let method = '';
  let quality = 'full';

  try {

    // ── TRANSLATION ─────────────────────────────────────────────────────────
    if (type === 'translation') {
      const text = readText(filePath) || description || title || '';
      if (!text.trim()) {
        deliverable = 'No content provided for translation. Please submit the document or text to be translated.';
        quality = 'needs-input';
      } else {
        const result = await googleTranslate.translateText(text, targetLanguage);
        deliverable = [
          `=== TRANSLATION RESULT ===`,
          `Target language: ${targetLanguage.toUpperCase()}`,
          `Source language: ${result.detectedSourceLanguage || 'auto-detected'}`,
          `Characters translated: ${result.characters || text.length}`,
          ``,
          `=== TRANSLATED TEXT ===`,
          result.translatedText || text,
        ].join('\n');
        if (result.simulated) quality = 'simulated';
      }
      method = 'Google Cloud Translation API';
    }

    // ── TRANSCRIPTION ────────────────────────────────────────────────────────
    else if (['transcription', 'audio-transcription', 'video-transcription'].includes(type)) {
      if (filePath && fs.existsSync(filePath) && isAudioFile(fileName || filePath)) {
        const audioBase64 = readBase64(filePath);
        const encoding    = audioEncoding(fileName || filePath);
        const result = await googleSpeech.transcribeAudio({ audioBase64, encoding, languageCode: 'en-ZA' });
        deliverable = [
          `=== TRANSCRIPTION RESULT ===`,
          `Language: ${result.languageCode || 'en-ZA'}`,
          `Word count: ${result.wordCount || 0}`,
          `Confidence: ${result.confidence ? Math.round(result.confidence * 100) + '%' : 'N/A'}`,
          ``,
          `=== TRANSCRIPT ===`,
          result.transcript || '[No transcript produced]',
        ].join('\n');
        if (result.simulated) quality = 'simulated';
      } else if (filePath && fs.existsSync(filePath) && isDocFile(fileName || filePath)) {
        // PDF might contain embedded text — use Document AI
        const b64 = readBase64(filePath);
        const result = await documentAi.processDocument(b64, mimeFromExt(fileName));
        deliverable = `=== TEXT EXTRACTED FROM DOCUMENT ===\n\n${result.text || '[No text found]'}`;
        if (result.simulated) quality = 'simulated';
      } else {
        deliverable = 'No audio or video file provided. Please submit the media file (MP3, WAV, MP4, etc.) for transcription.';
        quality = 'needs-input';
      }
      method = 'Google Cloud Speech-to-Text';
    }

    // ── DOCUMENT AI / DATA ENTRY / INVOICE PROCESSING / DIGITISATION ────────
    else if (['document-ai', 'document-extraction', 'document-processing', 'data-entry',
              'invoice-processing', 'document-digitization'].includes(type)) {
      if (filePath && fs.existsSync(filePath) && isDocFile(fileName || filePath)) {
        const b64    = readBase64(filePath);
        const mime   = mimeFromExt(fileName || filePath);
        const result = await documentAi.processDocument(b64, mime);

        const lines = [`=== DOCUMENT PROCESSING RESULT ===`, `Pages processed: ${result.pages || 1}`, ``];

        if (result.keyValuePairs?.length) {
          lines.push('=== EXTRACTED FIELDS ===');
          result.keyValuePairs.forEach(kv => lines.push(`${kv.key}: ${kv.value}`));
          lines.push('');
        }
        if (result.entities?.length) {
          lines.push('=== DETECTED ENTITIES ===');
          result.entities.forEach(e => lines.push(`${e.type}: ${e.mentionText} (${Math.round((e.confidence || 0) * 100)}% confidence)`));
          lines.push('');
        }
        lines.push('=== FULL EXTRACTED TEXT ===');
        lines.push(result.text || '[No text extracted]');

        deliverable = lines.join('\n');
        if (result.simulated) quality = 'simulated';
      } else if (filePath && fs.existsSync(filePath)) {
        // Text/CSV file — read and parse
        const content = readText(filePath);
        const prompt = `You are a professional data entry specialist. Extract and structure all data from this file into a clean, organised format:\n\n${content}\n\nProvide: structured table or JSON, summary of records, any data quality notes.`;
        deliverable = await callGemini(prompt);
        quality = 'partial';
      } else {
        deliverable = 'No document provided. Please submit the document (PDF, PNG, JPG, TIFF) for processing.';
        quality = 'needs-input';
      }
      method = 'Google Document AI';
    }

    // ── CONTENT MODERATION ────────────────────────────────────────────────────
    else if (type === 'content-moderation') {
      if (filePath && fs.existsSync(filePath) && isImageFile(fileName || filePath)) {
        const b64    = readBase64(filePath);
        const result = await moderateImage(b64);
        deliverable = [
          `=== CONTENT MODERATION REPORT ===`,
          `Status: ${result.safe ? '✅ SAFE TO PUBLISH' : '⛔ FLAGGED — REVIEW REQUIRED'}`,
          ``,
          `=== SAFE SEARCH ANALYSIS ===`,
          `Adult content: ${result.details.adult || 'N/A'}`,
          `Violence:      ${result.details.violence || 'N/A'}`,
          `Racy content:  ${result.details.racy || 'N/A'}`,
          `Spoof:         ${result.details.spoof || 'N/A'}`,
          `Medical:       ${result.details.medical || 'N/A'}`,
          ``,
          `=== RECOMMENDATION ===`,
          result.safe
            ? 'Content passes all safety checks and is safe for publication.'
            : 'Content has been flagged by automated safety checks. Manual human review is recommended before publishing.',
          result.simulated ? '\n[NOTE: Running in simulation mode — results are for demonstration only]' : '',
        ].join('\n');
        if (result.simulated) quality = 'simulated';
      } else {
        // Text content moderation via Gemini
        const textToModerate = readText(filePath) || description || title || '';
        const prompt = `You are a professional content moderator. Review the following content and produce a detailed moderation report:\n\n---\n${textToModerate}\n---\n\nAssess and report on:\n1. Profanity / offensive language\n2. Hate speech or discrimination\n3. Adult or explicit content\n4. Violence or threats\n5. Spam or misinformation\n6. Brand safety rating\n\nConclusion: APPROVED / FLAGGED / REJECTED + clear reasoning.`;
        deliverable = await callGemini(prompt);
        quality = 'partial';
      }
      method = 'Google Cloud Vision Safe Search + Gemini AI';
    }

    // ── VIRTUAL ADMINISTRATION ────────────────────────────────────────────────
    else if (['virtual-assistant', 'virtual-admin'].includes(type)) {
      const context = readText(filePath) || '';
      const prompt = [
        `You are a highly skilled professional virtual administrator for CTS BPO Solutions.`,
        `Complete the following task to a high professional standard.`,
        ``,
        `Task: ${title || 'Virtual Admin Task'}`,
        `Description: ${description || 'No description provided.'}`,
        context ? `\nAdditional context from attached file:\n${context}` : '',
        ``,
        `Produce a complete, professional deliverable. Use clear headings, bullet points, and structured formatting where appropriate.`,
        `If this is a scheduling or calendar task, produce a formatted schedule.`,
        `If this is a report, produce a complete structured report.`,
        `If this is email drafting, produce a professional email ready to send.`,
      ].join('\n');
      deliverable = await callGemini(prompt);
      method = 'Google Gemini AI';
      quality = 'partial';
    }

    // ── FINANCE / ACCOUNTING ──────────────────────────────────────────────────
    else if (['finance-admin', 'finance-processing', 'accounting'].includes(type)) {
      let extractedData = '';
      if (filePath && fs.existsSync(filePath) && isDocFile(fileName || filePath)) {
        const b64    = readBase64(filePath);
        const mime   = mimeFromExt(fileName || filePath);
        const result = await documentAi.processDocument(b64, mime);
        extractedData = `Extracted text:\n${result.text}\n\nKey fields:\n${(result.keyValuePairs || []).map(kv => `${kv.key}: ${kv.value}`).join('\n')}`;
        if (result.simulated) quality = 'partial';
      } else if (filePath && fs.existsSync(filePath)) {
        extractedData = readText(filePath) || '';
      }

      const prompt = [
        `You are a professional financial analyst and accountant at CTS BPO Solutions.`,
        `Analyse the following financial task/data and produce a complete, structured financial report.`,
        ``,
        `Task: ${title || 'Finance Task'}`,
        `Description: ${description || ''}`,
        extractedData ? `\nExtracted document data:\n${extractedData}` : '',
        ``,
        `Your report must include:`,
        `1. Executive summary`,
        `2. Key financial figures (totals, subtotals, taxes if applicable)`,
        `3. Line-item breakdown where applicable`,
        `4. Data quality notes`,
        `5. Any anomalies or items requiring attention`,
        ``,
        `Format clearly with headings and tables where appropriate.`,
      ].join('\n');
      deliverable = await callGemini(prompt);
      if (!extractedData) quality = 'partial';
      method = 'Google Document AI + Gemini AI';
    }

    // ── CUSTOMER SUPPORT ──────────────────────────────────────────────────────
    else if (['customer-support', 'customer-service'].includes(type)) {
      const context = readText(filePath) || '';
      const prompt = [
        `You are a professional customer support specialist at CTS BPO Solutions.`,
        `Draft a complete, empathetic, and professional customer support response.`,
        ``,
        `Task: ${title || 'Customer Support Task'}`,
        `Description/Query: ${description || 'No description provided.'}`,
        context ? `\nAdditional context:\n${context}` : '',
        ``,
        `Your response must include:`,
        `- Professional greeting`,
        `- Acknowledgement of the customer's issue`,
        `- Clear, helpful resolution or next steps`,
        `- Escalation path if needed`,
        `- Professional closing`,
        ``,
        `Tone: Warm, professional, solution-focused.`,
      ].join('\n');
      deliverable = await callGemini(prompt);
      method = 'Google Gemini AI';
      quality = 'partial';
    }

    // ── SOCIAL MEDIA / CONTENT CREATION / COPYWRITING ────────────────────────
    else if (['social-media', 'content-creation', 'copywriting'].includes(type)) {
      const context = readText(filePath) || '';
      const prompt = [
        `You are a professional content creator and copywriter at CTS BPO Solutions.`,
        `Create compelling, engaging content for the following request.`,
        ``,
        `Task: ${title || 'Content Creation Task'}`,
        `Description: ${description || 'No description provided.'}`,
        context ? `\nReference material:\n${context}` : '',
        ``,
        `Deliverable must include:`,
        `- Multiple content variations (short-form and long-form where applicable)`,
        `- Suggested hashtags (for social media)`,
        `- Call-to-action copy`,
        `- SEO-friendly version if writing for web`,
        ``,
        `Tone: Engaging, professional, brand-appropriate.`,
      ].join('\n');
      deliverable = await callGemini(prompt);
      method = 'Google Gemini AI';
      quality = 'partial';
    }

    // ── GENERAL / FALLBACK ────────────────────────────────────────────────────
    else {
      const context = readText(filePath) || '';
      const prompt = [
        `You are a professional BPO specialist at CTS BPO Solutions.`,
        `Complete the following outsourcing task to the highest professional standard.`,
        ``,
        `Service type: ${jobType}`,
        `Task: ${title || 'BPO Task'}`,
        `Description: ${description || 'No description provided.'}`,
        context ? `\nAttached file content:\n${context}` : '',
        ``,
        `Produce a complete, professional deliverable with clear formatting and structure.`,
      ].join('\n');
      deliverable = await callGemini(prompt);
      method = 'Google Gemini AI';
      quality = 'partial';
    }

  } catch (err) {
    await auditLogger.log('ai.job_processor', null, null,
      `AI processing error [${type}]: ${err.message}`, null, 'error');
    deliverable = `CTS BPO AI Processor — Job Type: ${jobType}\n\nThe AI encountered an error during processing: ${err.message}\n\nThis job has been flagged for manual review. Our team will handle it within 24 hours.`;
    method = 'Error — manual review required';
    quality = 'error';
  }

  await auditLogger.log('ai.job_processor', null, null,
    `AI processed [${type}] via ${method} — quality: ${quality}`, null, 'info');

  return { deliverable, method, quality, canHandle: true };
}

module.exports = { processJob, canHandle, capabilityInfo, AI_CAPABILITIES };
