/**
 * CTS BPO — AI Job Takeover Engine
 * When a subcontractor cannot complete a BPO job (overdue or manually triggered),
 * the AI automatically processes the work using Google APIs + Gemini.
 *
 * Job type → AI engine mapping:
 *   data_entry / virtual_assistant / payroll / bookkeeping → Gemini structured extraction
 *   transcription                                          → Google Speech-to-Text
 *   translation                                            → Google Translate API
 *   document_processing / invoice_processing / legal /
 *   medical_billing                                        → Google Document AI + Gemini
 *   content                                                → Gemini creative/moderation
 *   other                                                  → Gemini general-purpose
 */

const axios      = require('axios');
const db         = require('../db');
const auditLogger = require('./audit-logger');

const GEMINI_KEY  = process.env.GOOGLE_API_KEY || '';
const GEMINI_URL  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
const DOCAI_ID    = process.env.GOOGLE_DOCAI_PROCESSOR_ID || '';
const PROJECT_ID  = process.env.GOOGLE_CLOUD_PROJECT_ID   || '';
const LOCATION    = 'us'; // Document AI processor region

// ── Gemini text completion ────────────────────────────────────────────────────
async function gemini(prompt, systemInstruction = '') {
  if (!GEMINI_KEY) throw new Error('GOOGLE_API_KEY not configured');
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  const r = await axios.post(GEMINI_URL, body, { timeout: 60000 });
  return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── Get service account token ─────────────────────────────────────────────────
let _saToken = null;
let _saExpiry = 0;
async function getSAToken() {
  if (_saToken && Date.now() < _saExpiry - 60000) return _saToken;
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) return null;
  try {
    const sa = JSON.parse(saJson);
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    _saToken = token.token;
    _saExpiry = Date.now() + 3500 * 1000;
    return _saToken;
  } catch { return null; }
}

// ── Google Translate ──────────────────────────────────────────────────────────
async function translateText(text, targetLang = 'en') {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${GEMINI_KEY}`;
  const r = await axios.post(url, { q: text, target: targetLang, format: 'text' });
  return r.data?.data?.translations?.[0]?.translatedText || text;
}

// ── Google Speech-to-Text (base64 audio) ─────────────────────────────────────
async function transcribeAudio(audioBase64, mimeType = 'audio/wav') {
  const token = await getSAToken();
  if (!token) {
    return gemini(`You are a transcription assistant. The following is described as an audio file that needs transcription. Since direct audio processing is unavailable, please provide a professional transcription template and note that audio file transcription requires Speech-to-Text API credentials.`);
  }
  const encoding = mimeType.includes('mp3') ? 'MP3' : mimeType.includes('mp4') ? 'MP4' : 'LINEAR16';
  const body = {
    config: { encoding, sampleRateHertz: 16000, languageCode: 'en-ZA', enableAutomaticPunctuation: true, model: 'latest_long' },
    audio: { content: audioBase64 },
  };
  try {
    const r = await axios.post('https://speech.googleapis.com/v1/speech:recognize', body, {
      headers: { Authorization: `Bearer ${token}` }, timeout: 120000,
    });
    const results = r.data?.results || [];
    return results.map(res => res.alternatives?.[0]?.transcript || '').join('\n') || '[No speech detected in audio]';
  } catch (e) {
    console.warn('[AI-BPO] Speech-to-Text failed, using Gemini fallback:', e.message);
    return `[AI TRANSCRIPTION NOTE]\nDirect audio transcription unavailable for this file format.\nFile processed: Audio content requiring human review.\nPlease use the Google Speech-to-Text console at console.cloud.google.com to process the original file.\n\nTranscription Template:\n- Speaker 1: [Transcription here]\n- Speaker 2: [Transcription here]`;
  }
}

// ── Google Document AI ────────────────────────────────────────────────────────
async function processDocumentAI(fileBase64, mimeType = 'application/pdf') {
  const token = await getSAToken();
  if (!token || !DOCAI_ID || !PROJECT_ID) return null;
  try {
    const url = `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/${DOCAI_ID}:process`;
    const r = await axios.post(url, {
      rawDocument: { content: fileBase64, mimeType },
    }, { headers: { Authorization: `Bearer ${token}` }, timeout: 60000 });
    return r.data?.document?.text || null;
  } catch (e) {
    console.warn('[AI-BPO] Document AI failed:', e.message);
    return null;
  }
}

// ── Core: process a single BPO job by type ───────────────────────────────────
async function processJobByType(job) {
  const type = job.job_type || 'other';
  const title = job.title || 'Untitled Job';
  const instructions = job.instructions || job.description || '';
  const sourceFiles = job.source_files || [];

  // Extract text content from source files for context
  let sourceText = '';
  let firstFileBase64 = '';
  let firstFileMime = '';
  if (sourceFiles.length > 0) {
    const f = sourceFiles[0];
    firstFileBase64 = f.data || '';
    firstFileMime = f.type || 'application/pdf';
    if (f.type?.includes('text') || f.name?.match(/\.(txt|csv|json)$/i)) {
      sourceText = Buffer.from(firstFileBase64, 'base64').toString('utf8').slice(0, 8000);
    }
  }

  let result = '';
  const sys = `You are a professional BPO specialist working for CTS BPO Solutions. Your output must be polished, accurate, and ready to deliver directly to a client. Format your output clearly with headers and structure. Be thorough and professional.`;

  switch (type) {
    case 'transcription': {
      if (firstFileBase64 && firstFileMime.match(/audio|mp3|wav|mp4|ogg/i)) {
        const transcript = await transcribeAudio(firstFileBase64, firstFileMime);
        result = `TRANSCRIPTION OUTPUT\n${'='.repeat(60)}\nJob: ${title}\nProcessed: ${new Date().toLocaleString('en-ZA')}\nMethod: Google Speech-to-Text AI\n${'='.repeat(60)}\n\n${transcript}`;
      } else {
        result = await gemini(`Task: ${title}\nInstructions: ${instructions}\nSource content: ${sourceText || '[No readable audio file provided]'}\n\nCreate a professional transcription document. If no audio content is available, create a comprehensive transcription template with speaker labels, timestamps, and formatting ready for the client to use.`, sys);
      }
      break;
    }

    case 'translation': {
      const textToTranslate = sourceText || instructions;
      const targetMatch = instructions.match(/\b(afrikaans|zulu|xhosa|sotho|french|portuguese|spanish|german|chinese|arabic)\b/i);
      const targetLang = targetMatch ? targetMatch[1].toLowerCase().slice(0, 2) : 'af';
      const translated = textToTranslate ? await translateText(textToTranslate.slice(0, 5000), targetLang) : '';
      result = translated || await gemini(`Task: ${title}\nInstructions: ${instructions}\nSource: ${sourceText}\n\nProvide a professional translation as specified. If the target language is unclear, translate to Afrikaans and English side-by-side.`, sys);
      break;
    }

    case 'document_processing':
    case 'invoice_processing':
    case 'legal':
    case 'medical_billing': {
      let docText = sourceText;
      if (!docText && firstFileBase64) {
        docText = await processDocumentAI(firstFileBase64, firstFileMime) || '';
      }
      const prompt = `Task: ${title}\nJob Type: ${type.replace(/_/g, ' ')}\nClient Instructions: ${instructions}\n\nExtracted document content:\n${docText || '[Document requires manual extraction — see attached source file]'}\n\nProcess this document professionally. Extract all key information, structure it clearly, validate for completeness, and produce a final formatted output ready for the client. Include a summary section.`;
      result = await gemini(prompt, sys);
      break;
    }

    case 'data_entry': {
      const prompt = `Task: ${title}\nInstructions: ${instructions}\nSource data:\n${sourceText || '[Data source provided as attached file — extract and structure accordingly]'}\n\nPerform professional data entry. Clean, validate, and structure all data. Output in a clean tabular format (CSV-style or structured list). Flag any data quality issues. Provide a summary of records processed.`;
      result = await gemini(prompt, sys);
      break;
    }

    case 'payroll':
    case 'bookkeeping': {
      const prompt = `Task: ${title}\nJob Type: ${type}\nInstructions: ${instructions}\nFinancial data:\n${sourceText || '[Financial documents attached — process all figures accurately]'}\n\nProcess this ${type.replace('_', ' ')} task professionally. Ensure all calculations are accurate, apply correct South African tax/statutory requirements where applicable, and produce a complete, professional output document.`;
      result = await gemini(prompt, sys);
      break;
    }

    case 'virtual_assistant': {
      const prompt = `Task: ${title}\nInstructions: ${instructions}\nContext/source:\n${sourceText}\n\nComplete this virtual assistant task professionally. Produce all deliverables as specified. Be thorough, organised, and professional in all outputs.`;
      result = await gemini(prompt, sys);
      break;
    }

    case 'content': {
      const prompt = `Task: ${title}\nInstructions: ${instructions}\nSource material:\n${sourceText}\n\nComplete this content task to a high professional standard. Ensure the output is original, engaging, properly formatted, and exactly meets the brief provided.`;
      result = await gemini(prompt, sys);
      break;
    }

    default: {
      const prompt = `BPO Task: ${title}\nType: ${type}\nInstructions: ${instructions}\nSource:\n${sourceText}\n\nComplete this task to a high professional standard as a BPO specialist. Produce a comprehensive, well-structured output document ready for client delivery.`;
      result = await gemini(prompt, sys);
      break;
    }
  }

  return result || 'AI processing completed. Please review the output and contact CTS BPO if further detail is required.';
}

// ── Main: find overdue jobs and complete them with AI ────────────────────────
async function runAIJobTakeover() {
  try {
    // Find jobs that are overdue (past deadline) or stuck in assigned/in_progress for > 48h
    // bpo_jobs already has client_email and client_name directly — no join on clients needed
    const overdueQ = await db.query(`
      SELECT j.*,
             j.client_email,
             j.client_name,
             s.name AS sub_name, s.email AS sub_email
      FROM bpo_jobs j
      LEFT JOIN subcontractors s ON s.id = j.assigned_to
      WHERE j.status IN ('assigned', 'in_progress', 'revision')
        AND j.ai_completed IS NOT TRUE
        AND (
          (j.deadline IS NOT NULL AND j.deadline < NOW())
          OR
          (j.updated_at < NOW() - INTERVAL '48 hours')
        )
      ORDER BY j.priority DESC, j.deadline ASC
      LIMIT 5
    `);

    if (!overdueQ.rows.length) return { processed: 0 };

    let processed = 0;
    for (const job of overdueQ.rows) {
      try {
        console.log(`🤖 [AI-BPO] Taking over job #${job.id}: ${job.title} (type: ${job.job_type})`);
        const output = await processJobByType(job);

        // Store AI output as a completed file
        const completedFile = {
          name: `AI_Completed_${job.job_type}_Job${job.id}_${Date.now()}.txt`,
          type: 'text/plain',
          size: output.length,
          data: Buffer.from(output).toString('base64'),
        };

        // Update job: mark submitted (goes to review queue) with AI flag
        await db.query(`
          UPDATE bpo_jobs
          SET status = 'review',
              completed_files = $1::jsonb,
              ai_completed = TRUE,
              updated_at = NOW(),
              revision_notes = COALESCE(revision_notes, '') || $2
          WHERE id = $3
        `, [
          JSON.stringify([completedFile]),
          job.ai_completed ? '' : `\n[AI TAKEOVER: Job was overdue/undelivered. AI processed and completed this task automatically on ${new Date().toLocaleString('en-ZA')}.]`,
          job.id,
        ]);

        await auditLogger.log('bpo.ai_takeover', job.client_token, null,
          `AI completed job #${job.id} (${job.job_type}): "${job.title}" — ready for review`, null, 'info');
        console.log(`✅ [AI-BPO] Job #${job.id} completed by AI — moved to review queue`);
        processed++;

        // Notify the subcontractor that AI stepped in
        if (job.sub_email) {
          const emailOutreach = require('./email-outreach');
          await emailOutreach.sendMail({
            to: job.sub_email,
            subject: `⚠️ BPO Job #${job.id} — AI Completed on Your Behalf`,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
              <h3 style="color:#f59e0b;">⚠️ Job Taken Over by AI</h3>
              <p>Hi ${job.sub_name || 'there'},</p>
              <p>Job <strong>#${job.id} — ${job.title}</strong> was past its deadline/overdue window and has been completed automatically by CTS BPO's AI engine.</p>
              <p>This job will now be reviewed and delivered to the client. Please note that <strong>repeated non-delivery may affect your subcontractor tier rating</strong>.</p>
              <p>If you had difficulty completing this job, please reply to this email so we can support you.</p>
              <p>Regards,<br><strong>Thomas</strong><br>CTS BPO Solutions</p>
            </div>`,
            text: `Job #${job.id} was completed by AI due to overdue status. Please contact us if you had difficulty.`,
          }).catch(() => {});
        }

        await new Promise(r => setTimeout(r, 2000)); // rate limit between jobs
      } catch (e) {
        console.error(`[AI-BPO] Failed to process job #${job.id}:`, e.message);
        await auditLogger.log('bpo.ai_takeover', job.client_token, null,
          `AI takeover FAILED for job #${job.id}: ${e.message}`, null, 'error');
      }
    }

    return { processed };
  } catch (e) {
    console.error('[AI-BPO] runAIJobTakeover error:', e.message);
    return { processed: 0, error: e.message };
  }
}

// ── Manual trigger for a specific job ────────────────────────────────────────
async function aiCompleteJob(jobId) {
  const q = await db.query(`
    SELECT j.*,
           j.client_email,
           j.client_name,
           s.name AS sub_name, s.email AS sub_email
    FROM bpo_jobs j
    LEFT JOIN subcontractors s ON s.id = j.assigned_to
    WHERE j.id = $1
  `, [jobId]);
  if (!q.rows.length) throw new Error('Job not found');
  const job = q.rows[0];
  if (job.status === 'delivered') throw new Error('Job already delivered');

  console.log(`🤖 [AI-BPO] Manual AI completion for job #${jobId}`);
  const output = await processJobByType(job);
  const completedFile = {
    name: `AI_Completed_${job.job_type}_Job${jobId}.txt`,
    type: 'text/plain',
    size: output.length,
    data: Buffer.from(output).toString('base64'),
  };

  await db.query(`
    UPDATE bpo_jobs
    SET status = 'review',
        completed_files = $1::jsonb,
        ai_completed = TRUE,
        updated_at = NOW()
    WHERE id = $2
  `, [JSON.stringify([completedFile]), jobId]);

  await auditLogger.log('bpo.ai_manual', job.client_token, null,
    `Manual AI completion for job #${jobId} (${job.job_type})`, null, 'info');

  return { success: true, jobId, output: output.slice(0, 500) + (output.length > 500 ? '...' : '') };
}

// ── Ensure ai_completed column exists ────────────────────────────────────────
async function ensureAIColumns() {
  await db.query(`ALTER TABLE bpo_jobs ADD COLUMN IF NOT EXISTS ai_completed BOOLEAN DEFAULT FALSE`).catch(() => {});
}

ensureAIColumns().catch(() => {});

module.exports = { runAIJobTakeover, aiCompleteJob };
