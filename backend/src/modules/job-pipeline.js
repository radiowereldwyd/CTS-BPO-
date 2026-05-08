/**
 * CTS BPO — Automated Job Pipeline
 *
 * Full end-to-end lifecycle:
 *  1. Incoming email detected as a job request → AI analyses + auto-quotes
 *  2. Client replies "yes" / "accept" → job created + AI processes immediately
 *  3. AI delivers completed work + PDF invoice via email
 *  4. Inbox scanned for proof-of-payment (POF) notifications
 *  5. Admin notified by email when payment is detected
 *  6. Admin confirms payment → job marked complete
 */

const crypto  = require('crypto');
const axios   = require('axios');
const db      = require('../db');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const APP_URL        = process.env.APP_URL || 'https://cts-bpo.replit.app';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || 'admin@ctsbpo.com';

// ── Pricing table (ZAR) ───────────────────────────────────────────────────────
const PRICING = {
  'transcription':       { unit: 'per minute of audio',  rate: 2.50,  min: 150,  currency: 'R' },
  'audio-transcription': { unit: 'per minute of audio',  rate: 2.50,  min: 150,  currency: 'R' },
  'video-transcription': { unit: 'per minute of video',  rate: 3.00,  min: 200,  currency: 'R' },
  'translation':         { unit: 'per 100 words',        rate: 55,    min: 200,  currency: 'R' },
  'data-entry':          { unit: 'per page / form',      rate: 18,    min: 150,  currency: 'R' },
  'document-processing': { unit: 'per document page',    rate: 22,    min: 150,  currency: 'R' },
  'document-ai':         { unit: 'per document page',    rate: 22,    min: 150,  currency: 'R' },
  'invoice-processing':  { unit: 'per invoice',          rate: 25,    min: 150,  currency: 'R' },
  'content-moderation':  { unit: 'per 100 items',        rate: 80,    min: 200,  currency: 'R' },
  'virtual-assistant':   { unit: 'per hour of work',     rate: 150,   min: 150,  currency: 'R' },
  'customer-support':    { unit: 'per hour of work',     rate: 150,   min: 200,  currency: 'R' },
  'finance-admin':       { unit: 'per hour of work',     rate: 200,   min: 300,  currency: 'R' },
  'copywriting':         { unit: 'per 500 words',        rate: 120,   min: 200,  currency: 'R' },
  'social-media':        { unit: 'per content package',  rate: 350,   min: 350,  currency: 'R' },
  'general':             { unit: 'per hour of work',     rate: 150,   min: 150,  currency: 'R' },
  'bpo':                 { unit: 'per hour of work',     rate: 150,   min: 150,  currency: 'R' },
};

// ── Job type keywords for detection ──────────────────────────────────────────
const JOB_TYPE_SIGNALS = [
  { keywords: ['transcri', 'audio', 'voice', 'record', 'speech', 'mp3', 'wav', 'interview'],  type: 'transcription' },
  { keywords: ['translat', 'language', 'french', 'german', 'spanish', 'arabic', 'afrikaans'], type: 'translation' },
  { keywords: ['data entry', 'enter data', 'spreadsheet', 'excel', 'database', 'fill in'],    type: 'data-entry' },
  { keywords: ['invoice', 'receipt', 'billing', 'statement', 'accounts payable'],             type: 'invoice-processing' },
  { keywords: ['document', 'pdf', 'scan', 'ocr', 'extract', 'digitise', 'digitize'],         type: 'document-processing' },
  { keywords: ['virtual assistant', 'va ', 'schedule', 'email manag', 'calendar', 'admin'],  type: 'virtual-assistant' },
  { keywords: ['customer service', 'support ticket', 'help desk', 'live chat'],               type: 'customer-support' },
  { keywords: ['bookkeep', 'payroll', 'account', 'finance', 'reconcil'],                     type: 'finance-admin' },
  { keywords: ['moderate', 'review content', 'flag', 'inappropriate'],                       type: 'content-moderation' },
  { keywords: ['write', 'content', 'blog', 'article', 'copywrite', 'caption'],               type: 'copywriting' },
  { keywords: ['social media', 'instagram', 'facebook', 'twitter', 'linkedin post'],         type: 'social-media' },
  { keywords: ['outsourc', 'bpo', 'back office', 'process', 'task'],                         type: 'general' },
];

// ── Payment signal keywords ────────────────────────────────────────────────────
const PAYMENT_SIGNALS = [
  'proof of payment', 'pop ', 'pof ', 'paid', 'payment made', 'payment done',
  'eft', 'transferred', 'bank transfer', 'receipt', 'transaction', 'reference number',
  'swift', 'paypal', 'payment confirmation', 'i have paid', 'please find attached',
];

// ── Service request signal keywords ──────────────────────────────────────────
const SERVICE_REQUEST_SIGNALS = [
  'i need', 'i want', 'please', 'can you', 'how much', 'quote', 'price', 'cost',
  'how long', 'would like', 'looking for', 'help with', 'require', 'need help',
  'job for you', 'work for', 'task', 'project', 'contract', 'ongoing', 'urgent',
];

// ── Quote acceptance signals ───────────────────────────────────────────────────
const ACCEPT_SIGNALS = [
  'yes', 'accepted', 'accept', 'agree', 'proceed', 'go ahead', 'sounds good',
  'let\'s do it', 'let\'s go', 'approved', 'ok', 'okay', 'confirmed', 'confirm',
  'great', 'perfect', 'works for me', 'please proceed', 'start', 'get started',
  'invoice me', 'send invoice', 'i agree', 'happy with that', 'fine with that',
];

// ── Gemini call ───────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  if (!GOOGLE_API_KEY) return null;
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 30000 }
    );
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch { return null; }
}

// ── Table setup ───────────────────────────────────────────────────────────────
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS bpo_pipeline_jobs (
      id                  SERIAL PRIMARY KEY,
      client_email        TEXT NOT NULL,
      client_name         TEXT,
      job_type            TEXT NOT NULL DEFAULT 'general',
      description         TEXT,
      status              TEXT NOT NULL DEFAULT 'quoted',
      quote_amount        NUMERIC(12,2),
      quote_currency      TEXT DEFAULT 'R',
      quote_sent_at       TIMESTAMPTZ,
      accepted_at         TIMESTAMPTZ,
      processing_started_at TIMESTAMPTZ,
      delivered_at        TIMESTAMPTZ,
      payment_ref         TEXT,
      payment_detected_at TIMESTAMPTZ,
      completed_at        TIMESTAMPTZ,
      deliverable_text    TEXT,
      invoice_ref         TEXT,
      source_email_subject TEXT,
      raw_email_body      TEXT,
      admin_notified      BOOLEAN DEFAULT FALSE,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// ── Detect if email is a service request ─────────────────────────────────────
function detectServiceRequest(body, subject) {
  const text = ((subject || '') + ' ' + (body || '')).toLowerCase();
  const hasServiceSignal = SERVICE_REQUEST_SIGNALS.some(k => text.includes(k));
  if (!hasServiceSignal) return null;

  // Detect job type
  for (const { keywords, type } of JOB_TYPE_SIGNALS) {
    if (keywords.some(k => text.includes(k))) return type;
  }
  return 'general';
}

// ── Detect if email is a payment notification ─────────────────────────────────
function detectPayment(body, subject) {
  const text = ((subject || '') + ' ' + (body || '')).toLowerCase();
  return PAYMENT_SIGNALS.some(k => text.includes(k));
}

// ── Detect if email is accepting a quote ─────────────────────────────────────
function detectAcceptance(body, subject) {
  const text = ((body || '') + ' ' + (subject || '')).toLowerCase().trim();
  // Short replies that are accepting
  if (text.length < 300 && ACCEPT_SIGNALS.some(k => text.includes(k))) return true;
  // Longer replies — require stronger signals
  const strongAccept = ['yes', 'accepted', 'accept', 'proceed', 'go ahead', 'confirmed', 'approved', 'please proceed', 'start'];
  return strongAccept.some(k => text.includes(k));
}

// ── Calculate quote amount ─────────────────────────────────────────────────────
function calculateQuote(jobType, description) {
  const pricing = PRICING[jobType] || PRICING['general'];

  // Try to extract volume from description
  const text = (description || '').toLowerCase();
  let estimatedUnits = 1;
  let quoteNote = '';

  if (jobType === 'transcription' || jobType === 'audio-transcription') {
    const minMatch = text.match(/(\d+)\s*(min|minute)/);
    const hrMatch  = text.match(/(\d+)\s*(hr|hour)/);
    if (hrMatch)  { estimatedUnits = parseInt(hrMatch[1]) * 60;  quoteNote = `${hrMatch[1]} hour(s) audio`; }
    else if (minMatch) { estimatedUnits = parseInt(minMatch[1]); quoteNote = `${minMatch[1]} minute(s) audio`; }
    else { estimatedUnits = 10; quoteNote = 'estimated ~10 min'; }
  } else if (jobType === 'translation') {
    const wordMatch = text.match(/(\d+)\s*word/);
    const pageMatch = text.match(/(\d+)\s*page/);
    if (wordMatch)  { estimatedUnits = Math.ceil(parseInt(wordMatch[1]) / 100); quoteNote = `${wordMatch[1]} words`; }
    else if (pageMatch) { estimatedUnits = parseInt(pageMatch[1]) * 2.5; quoteNote = `~${pageMatch[1]} page(s) ×250 words`; }
    else { estimatedUnits = 5; quoteNote = 'estimated ~500 words'; }
  } else if (jobType === 'data-entry' || jobType === 'document-processing' || jobType === 'invoice-processing') {
    const pgMatch = text.match(/(\d+)\s*(page|form|doc|invoice|record)/);
    if (pgMatch) { estimatedUnits = parseInt(pgMatch[1]); quoteNote = `${pgMatch[1]} page(s)/item(s)`; }
    else { estimatedUnits = 10; quoteNote = 'estimated ~10 items'; }
  } else {
    const hrMatch = text.match(/(\d+)\s*(hr|hour)/);
    if (hrMatch) { estimatedUnits = parseInt(hrMatch[1]); quoteNote = `${hrMatch[1]} hour(s)`; }
    else { estimatedUnits = 1; quoteNote = '1 hour'; }
  }

  const amount = Math.max(pricing.min, Math.ceil(estimatedUnits * pricing.rate));
  return { amount, unit: pricing.unit, rate: pricing.rate, estimatedUnits, quoteNote, currency: pricing.currency };
}

// ── Generate AI-powered quote email ──────────────────────────────────────────
async function generateQuoteEmail(clientName, jobType, description, quoteData) {
  const firstName = (clientName || 'there').split(' ')[0];
  const pricing   = PRICING[jobType] || PRICING['general'];

  const aiAnalysis = await callGemini(
    `You are Calvin Thomas from CTS BPO Solutions (South Africa). A client named "${firstName}" emailed asking for help with: "${description?.slice(0, 500) || jobType}".

Write a professional, warm quote email body (max 150 words) that:
1. Acknowledges their specific request
2. Confirms what the AI will do for them
3. States the quote of R${quoteData.amount} (${quoteData.quoteNote}) clearly
4. Mentions first task is handled with full quality guarantee
5. Asks them to reply "YES" to confirm so we can start immediately

Do NOT include greetings or sign-off — just the body paragraph(s). Be warm and confident.`
  );

  const body = aiAnalysis || `Thank you for reaching out! Based on your request for ${jobType.replace(/-/g, ' ')} services (${quoteData.quoteNote}), I'm pleased to provide the following quote.

Our AI-powered system will handle this task immediately upon your confirmation, with full quality guarantee and same-day turnaround.`;

  const serviceLabel = jobType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;color:#1e293b">
      <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:28px 32px;border-radius:12px 12px 0 0;color:#fff">
        <h2 style="margin:0 0 6px">CTS BPO Solutions — Your Quote</h2>
        <p style="margin:0;opacity:0.85;font-size:13px">AI-Driven Business Process Outsourcing · South Africa</p>
      </div>
      <div style="background:#fff;padding:28px 32px;border:1px solid #e2e8f0;border-top:none">
        <p>Hi ${firstName},</p>
        <p>${body.replace(/\n/g, '<br>')}</p>

        <div style="background:#f0fdf4;border:2px solid #22c55e;border-radius:10px;padding:20px 24px;margin:20px 0">
          <div style="font-size:13px;color:#15803d;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Your Quote</div>
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div>
              <div style="font-size:22px;font-weight:900;color:#1e293b">R ${quoteData.amount.toLocaleString()}</div>
              <div style="font-size:12px;color:#64748b;margin-top:2px">${serviceLabel} · ${quoteData.quoteNote} · R${quoteData.rate} ${pricing.unit}</div>
            </div>
            <div style="background:#16a34a;color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700">✅ Includes quality guarantee</div>
          </div>
        </div>

        <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:0 8px 8px 0;margin:16px 0">
          <strong>⚡ How it works:</strong><br>
          1. Reply <strong>"YES"</strong> to confirm this quote<br>
          2. Send us your files / task details<br>
          3. AI processes and delivers within hours<br>
          4. Invoice sent with completed work — pay only after you approve
        </div>

        <p>To confirm, simply reply to this email with <strong>"YES, proceed"</strong> and attach any files we need.</p>

        <hr style="border-color:#f1f5f9;margin:20px 0">
        <p><strong>Calvin Thomas</strong><br>CTS BPO Solutions<br>
        <a href="mailto:cts.cybersolutions@gmail.com">cts.cybersolutions@gmail.com</a><br>
        <a href="https://wa.me/27760679100" style="color:#25d366;font-weight:700;text-decoration:none">💬 WhatsApp: +27 76 067 9100</a></p>
      </div>
    </div>`;

  const text = `Hi ${firstName},\n\n${body}\n\nYour Quote: R ${quoteData.amount.toLocaleString()}\nService: ${serviceLabel} (${quoteData.quoteNote})\n\nTo confirm: Reply "YES" to this email.\n\nCalvin Thomas\nCTS BPO Solutions\ncts.cybersolutions@gmail.com\nWhatsApp: +27 76 067 9100`;

  return { html, text };
}

// ── Send quote email ──────────────────────────────────────────────────────────
async function sendQuote({ clientEmail, clientName, jobType, description, emailSubject, rawBody }) {
  await ensureTable();

  // Check if we already sent a quote to this person recently (last 24h)
  const recent = await db.query(
    `SELECT id FROM bpo_pipeline_jobs WHERE client_email=LOWER($1) AND created_at > NOW()-INTERVAL '24 hours' LIMIT 1`,
    [clientEmail]
  );
  if (recent.rows.length > 0) {
    console.log(`[PIPELINE] Skipping duplicate quote to ${clientEmail} — recent job exists`);
    return null;
  }

  const quoteData = calculateQuote(jobType, description || rawBody || '');
  const invoiceRef = `QTE-${Date.now().toString(36).toUpperCase()}`;
  const { html, text } = await generateQuoteEmail(clientName, jobType, description || rawBody || emailSubject || '', quoteData);

  const emailOutreach = require('./email-outreach');
  await emailOutreach.sendMail({
    to: clientEmail,
    subject: `Re: ${emailSubject || 'Your BPO Request'} — Quote from CTS BPO`,
    html, text,
  });

  // Save to DB
  const { rows } = await db.query(
    `INSERT INTO bpo_pipeline_jobs (client_email, client_name, job_type, description, status, quote_amount, quote_currency, quote_sent_at, source_email_subject, raw_email_body, invoice_ref)
     VALUES (LOWER($1), $2, $3, $4, 'quoted', $5, 'R', NOW(), $6, $7, $8) RETURNING id`,
    [clientEmail, clientName || clientEmail.split('@')[0], jobType, description || rawBody || '', quoteData.amount, emailSubject, (rawBody || '').slice(0, 2000), invoiceRef]
  );

  const jobId = rows[0]?.id;
  console.log(`💰 [PIPELINE] Quote sent to ${clientEmail} — R${quoteData.amount} for ${jobType} (job #${jobId})`);

  // Log activity
  await db.query(
    `INSERT INTO ai_activity_log (action_type, description, status, details)
     VALUES ('job_quoted', $1, 'success', $2)`,
    [`Quote R${quoteData.amount} sent to ${clientEmail} for ${jobType}`,
     JSON.stringify({ jobId, clientEmail, jobType, amount: quoteData.amount })]
  ).catch(() => {});

  return { jobId, quoteData };
}

// ── Handle accepted quote → process + deliver ─────────────────────────────────
async function processAcceptedQuote(clientEmail, emailBody, attachmentPath) {
  await ensureTable();

  // Find the open quoted job for this client
  const { rows } = await db.query(
    `SELECT * FROM bpo_pipeline_jobs WHERE LOWER(client_email)=LOWER($1) AND status='quoted' ORDER BY created_at DESC LIMIT 1`,
    [clientEmail]
  );
  if (!rows[0]) {
    console.log(`[PIPELINE] No open quote found for ${clientEmail}`);
    return null;
  }

  const job = rows[0];
  console.log(`✅ [PIPELINE] Quote accepted by ${clientEmail} — Job #${job.id}, type: ${job.job_type}, R${job.quote_amount}`);

  // Mark as accepted
  await db.query(
    `UPDATE bpo_pipeline_jobs SET status='processing', accepted_at=NOW(), processing_started_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [job.id]
  );

  await db.query(
    `INSERT INTO ai_activity_log (action_type, description, status)
     VALUES ('quote_accepted', $1, 'success')`,
    [`Quote accepted by ${clientEmail} — Job #${job.id} R${job.quote_amount} ${job.job_type}`]
  ).catch(() => {});

  // Send acknowledgement
  const firstName = (job.client_name || clientEmail.split('@')[0]).split(' ')[0];
  const emailOutreach = require('./email-outreach');
  await emailOutreach.sendMail({
    to: clientEmail,
    subject: `✅ Job Confirmed — CTS BPO is processing your ${job.job_type.replace(/-/g, ' ')} task`,
    html: `<div style="font-family:Arial,sans-serif;max-width:580px;color:#1e293b">
      <div style="background:linear-gradient(135deg,#059669,#10b981);padding:22px 28px;border-radius:12px 12px 0 0;color:#fff">
        <h2 style="margin:0">✅ Job Confirmed — Processing Now</h2>
      </div>
      <div style="background:#fff;padding:24px 28px;border:1px solid #e2e8f0;border-top:none">
        <p>Hi ${firstName},</p>
        <p>Your job has been confirmed and our AI is processing it right now. You will receive the completed work and invoice by email shortly.</p>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:13px">
          <strong>Job Reference:</strong> ${job.invoice_ref}<br>
          <strong>Service:</strong> ${job.job_type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}<br>
          <strong>Amount:</strong> R ${parseFloat(job.quote_amount).toLocaleString()}<br>
          <strong>Status:</strong> 🔄 Processing
        </div>
        <p style="font-size:13px;color:#64748b">Payment is due only after you receive and approve the completed work.</p>
        <p><strong>Calvin Thomas</strong><br>CTS BPO Solutions<br>
        <a href="https://wa.me/27760679100" style="color:#25d366;font-weight:700">💬 WhatsApp: +27 76 067 9100</a></p>
      </div>
    </div>`,
    text: `Hi ${firstName},\n\nYour job is confirmed and being processed now (Ref: ${job.invoice_ref}).\n\nYou'll receive the completed work by email shortly.\n\nCalvin Thomas\nCTS BPO Solutions`,
  }).catch(() => {});

  // Process the job with AI
  setImmediate(() => runJobAndDeliver(job, clientEmail, emailBody, attachmentPath));

  return { jobId: job.id, status: 'processing' };
}

// ── AI processes the job and delivers ────────────────────────────────────────
async function runJobAndDeliver(job, clientEmail, extraDescription, attachmentPath) {
  try {
    const aiProcessor  = require('./ai-job-processor');
    const pdfInvoice   = require('./pdf-invoice');
    const emailOutreach = require('./email-outreach');

    const description = [job.description, extraDescription].filter(Boolean).join('\n\n').slice(0, 5000);

    console.log(`🤖 [PIPELINE] AI processing job #${job.id} — ${job.job_type}`);

    const result = await aiProcessor.processJob({
      jobType:     job.job_type,
      title:       `${job.job_type.replace(/-/g, ' ')} task for ${job.client_name || clientEmail}`,
      description,
      filePath:    attachmentPath || null,
      fileName:    attachmentPath ? require('path').basename(attachmentPath) : null,
    });

    // Calculate task breakdown
    const taskBreakdown = buildTaskBreakdown(job);

    // Generate PDF invoice
    const invoicePdf = await pdfInvoice.generateInvoicePDF({
      jobTitle:     `${job.job_type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Service`,
      clientName:   job.client_name || clientEmail.split('@')[0],
      clientEmail,
      jobValue:     parseFloat(job.quote_amount),
      reference:    job.invoice_ref,
      deliveryDate: new Date().toISOString(),
      description:  description.slice(0, 120),
      serviceType:  job.job_type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    });

    const firstName = (job.client_name || clientEmail.split('@')[0]).split(' ')[0];

    // Send delivery email
    const confirmUrl = `${APP_URL}/api/pipeline/jobs/${job.id}/payment-confirm?token=${job.invoice_ref}`;

    await emailOutreach.sendMail({
      to:      clientEmail,
      subject: `✅ Completed: ${job.job_type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} — Invoice ${job.invoice_ref}`,
      html: buildDeliveryEmail({ firstName, job, result, taskBreakdown, confirmUrl }),
      text: buildDeliveryText({ firstName, job, result, confirmUrl }),
      attachments: [
        {
          filename: `Invoice-${job.invoice_ref}.pdf`,
          content:  invoicePdf,
          contentType: 'application/pdf',
        },
        {
          filename: `Deliverable-${job.invoice_ref}.txt`,
          content:  Buffer.from(result.deliverable || 'No deliverable generated', 'utf-8'),
          contentType: 'text/plain',
        },
      ],
    });

    // Mark as delivered
    await db.query(
      `UPDATE bpo_pipeline_jobs SET status='delivered', delivered_at=NOW(), deliverable_text=$1, updated_at=NOW() WHERE id=$2`,
      [(result.deliverable || '').slice(0, 10000), job.id]
    );

    await db.query(
      `INSERT INTO ai_activity_log (action_type, description, status, details)
       VALUES ('job_delivered', $1, 'success', $2)`,
      [`Job #${job.id} delivered to ${clientEmail} — R${job.quote_amount}`,
       JSON.stringify({ jobId: job.id, clientEmail, method: result.method, quality: result.quality })]
    ).catch(() => {});

    console.log(`📦 [PIPELINE] Job #${job.id} delivered to ${clientEmail}`);

  } catch (err) {
    console.error(`[PIPELINE] Job #${job.id} delivery error:`, err.message);
    await db.query(
      `UPDATE bpo_pipeline_jobs SET status='error', updated_at=NOW() WHERE id=$1`,
      [job.id]
    ).catch(() => {});
  }
}

// ── Build task breakdown for invoice ─────────────────────────────────────────
function buildTaskBreakdown(job) {
  const pricing = PRICING[job.job_type] || PRICING['general'];
  const amount  = parseFloat(job.quote_amount);
  const units   = pricing.rate > 0 ? Math.ceil(amount / pricing.rate) : 1;
  return `${units} × ${pricing.unit} @ R${pricing.rate} = R${amount.toLocaleString()}`;
}

// ── Delivery email HTML ───────────────────────────────────────────────────────
function buildDeliveryEmail({ firstName, job, result, taskBreakdown, confirmUrl }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;color:#1e293b">
      <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:28px 32px;border-radius:12px 12px 0 0;color:#fff">
        <h2 style="margin:0 0 6px">✅ Your Work is Complete!</h2>
        <p style="margin:0;opacity:0.85;font-size:13px">CTS BPO Solutions — AI-Delivered Results</p>
      </div>
      <div style="background:#fff;padding:28px 32px;border:1px solid #e2e8f0;border-top:none">
        <p>Hi ${firstName},</p>
        <p>Your <strong>${job.job_type.replace(/-/g, ' ')}</strong> job has been completed by our AI system. Please find the deliverable and invoice attached to this email.</p>

        <div style="background:#f0fdf4;border:2px solid #22c55e;border-radius:10px;padding:20px 24px;margin:20px 0">
          <div style="font-weight:700;font-size:15px;color:#059669;margin-bottom:12px">📋 Job Summary</div>
          <table style="width:100%;font-size:13px;border-collapse:collapse">
            <tr><td style="padding:4px 0;color:#64748b">Reference</td><td style="font-weight:700">${job.invoice_ref}</td></tr>
            <tr><td style="padding:4px 0;color:#64748b">Service</td><td>${job.job_type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</td></tr>
            <tr><td style="padding:4px 0;color:#64748b">Task breakdown</td><td>${taskBreakdown}</td></tr>
            <tr><td style="padding:4px 0;color:#64748b;font-weight:700">Amount Due</td><td style="font-weight:900;font-size:16px;color:#1e293b">R ${parseFloat(job.quote_amount).toLocaleString()}</td></tr>
            <tr><td style="padding:4px 0;color:#64748b">Processed by</td><td>${result.method || 'CTS BPO AI'}</td></tr>
          </table>
        </div>

        <div style="background:#fff8e1;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:0 8px 8px 0;margin:16px 0">
          <strong>💳 Payment Options:</strong><br>
          <ul style="margin:8px 0;padding-left:20px;font-size:13px">
            <li><strong>EFT/Bank Transfer</strong> — Use reference <strong>${job.invoice_ref}</strong> and email your proof of payment to <a href="mailto:cts.cybersolutions@gmail.com">cts.cybersolutions@gmail.com</a></li>
            <li><strong>PayPal</strong> — Send payment to <a href="mailto:cts.cybersolutions@gmail.com">cts.cybersolutions@gmail.com</a></li>
          </ul>
        </div>

        <div style="text-align:center;margin:24px 0">
          <a href="${confirmUrl}" style="background:#059669;color:#fff;padding:14px 32px;border-radius:9px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">✅ Confirm Receipt &amp; Mark Paid</a>
        </div>

        <p style="font-size:12px;color:#64748b">The attached PDF invoice contains full payment instructions. Payment is due within 14 days.</p>
        <hr style="border-color:#f1f5f9;margin:20px 0">
        <p><strong>Calvin Thomas</strong><br>CTS BPO Solutions<br>
        <a href="mailto:cts.cybersolutions@gmail.com">cts.cybersolutions@gmail.com</a> · 
        <a href="https://wa.me/27760679100" style="color:#25d366;font-weight:700">💬 WhatsApp: +27 76 067 9100</a></p>
      </div>
    </div>`;
}

function buildDeliveryText({ firstName, job, result, confirmUrl }) {
  return `Hi ${firstName},\n\nYour ${job.job_type.replace(/-/g, ' ')} job is complete. Please find the deliverable and invoice attached.\n\nRef: ${job.invoice_ref}\nAmount Due: R ${parseFloat(job.quote_amount).toLocaleString()}\nProcessed by: ${result.method || 'CTS BPO AI'}\n\nPayment Options:\n- EFT: Use reference ${job.invoice_ref} and email proof of payment to cts.cybersolutions@gmail.com\n- PayPal: cts.cybersolutions@gmail.com\n\nConfirm receipt: ${confirmUrl}\n\nCalvin Thomas\nCTS BPO Solutions`;
}

// ── Scan inbox for payment notifications ──────────────────────────────────────
async function scanForPayments() {
  await ensureTable();

  const gmailReader  = require('./gmail-reader');
  const emailOutreach = require('./email-outreach');
  if (!gmailReader.isConfigured()) return { found: 0 };

  const { emails } = await gmailReader.listUnreadEmails(30).catch(() => ({ emails: [] }));
  let found = 0;

  for (const email of emails) {
    if (!detectPayment(email.body, email.subject)) continue;

    const fromEmail = (email.from || '').toLowerCase();

    // Find a delivered job for this sender
    const { rows } = await db.query(
      `SELECT * FROM bpo_pipeline_jobs WHERE LOWER(client_email)=LOWER($1) AND status='delivered' ORDER BY delivered_at DESC LIMIT 1`,
      [fromEmail]
    );

    if (!rows[0]) {
      // Also search by payment reference in the email
      const refMatch = (email.body || '').match(/\b(QTE|INV)-[A-Z0-9]+\b/i);
      if (refMatch) {
        const refRows = await db.query(
          `SELECT * FROM bpo_pipeline_jobs WHERE invoice_ref=UPPER($1) AND status='delivered' LIMIT 1`,
          [refMatch[0]]
        ).catch(() => ({ rows: [] }));
        if (refRows.rows[0]) rows.push(refRows.rows[0]);
      }
    }

    if (!rows[0]) continue;

    const job = rows[0];

    // Mark payment detected
    await db.query(
      `UPDATE bpo_pipeline_jobs SET status='payment_detected', payment_detected_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [job.id]
    );

    // Notify admin
    if (!job.admin_notified) {
      const confirmUrl = `${APP_URL}/api/pipeline/jobs/${job.id}/complete?token=admin2026`;
      await emailOutreach.sendMail({
        to: ADMIN_EMAIL,
        subject: `💰 Payment Received — Job #${job.id} R${job.quote_amount} from ${job.client_name || job.client_email}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;color:#1e293b">
            <div style="background:linear-gradient(135deg,#059669,#10b981);padding:22px 28px;border-radius:12px 12px 0 0;color:#fff">
              <h2 style="margin:0">💰 Payment Detected — Action Required</h2>
            </div>
            <div style="background:#fff;padding:24px 28px;border:1px solid #e2e8f0;border-top:none">
              <p>A payment notification was detected from <strong>${job.client_name || job.client_email}</strong>.</p>
              <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 18px;margin:16px 0">
                <strong>Job #${job.id}</strong> — ${job.job_type}<br>
                <strong>Client:</strong> ${job.client_email}<br>
                <strong>Amount:</strong> R ${parseFloat(job.quote_amount).toLocaleString()}<br>
                <strong>Invoice Ref:</strong> ${job.invoice_ref}<br>
                <strong>Email Subject:</strong> ${email.subject}
              </div>
              <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 8px 8px 0;margin:12px 0;font-size:13px">
                <strong>Next step:</strong> Verify the payment in your bank account or PayPal, then click the button below to mark this job as complete.
              </div>
              <div style="text-align:center;margin:24px 0">
                <a href="${confirmUrl}" style="background:#059669;color:#fff;padding:14px 32px;border-radius:9px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">✅ Confirm Payment &amp; Mark Complete</a>
              </div>
              <p style="font-size:12px;color:#64748b">Or go to: <a href="${APP_URL}/ai-agent">${APP_URL}/ai-agent</a> → Pipeline Jobs tab</p>
            </div>
          </div>`,
        text: `Payment detected for Job #${job.id} from ${job.client_email} — R${job.quote_amount}.\n\nVerify and confirm: ${confirmUrl}`,
      }).catch(e => console.error('[PIPELINE] Admin payment notification failed:', e.message));

      await db.query(`UPDATE bpo_pipeline_jobs SET admin_notified=TRUE WHERE id=$1`, [job.id]);
      found++;
      console.log(`💰 [PIPELINE] Payment detected for Job #${job.id} — admin notified`);

      await db.query(
        `INSERT INTO ai_activity_log (action_type, description, status, details)
         VALUES ('payment_detected', $1, 'success', $2)`,
        [`Payment detected for Job #${job.id} from ${job.client_email}`,
         JSON.stringify({ jobId: job.id, amount: job.quote_amount, ref: job.invoice_ref })]
      ).catch(() => {});
    }
  }

  return { found };
}

// ── Mark job as complete ──────────────────────────────────────────────────────
async function markJobComplete(jobId, paymentRef) {
  await ensureTable();
  const { rows } = await db.query(
    `UPDATE bpo_pipeline_jobs SET status='complete', completed_at=NOW(), payment_ref=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
    [paymentRef || 'confirmed', jobId]
  );
  if (!rows[0]) return null;

  const job = rows[0];
  const emailOutreach = require('./email-outreach');

  // Send thank-you to client
  const firstName = (job.client_name || job.client_email.split('@')[0]).split(' ')[0];
  await emailOutreach.sendMail({
    to: job.client_email,
    subject: `Thank you — Payment confirmed for ${job.invoice_ref}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:580px;color:#1e293b">
      <div style="background:linear-gradient(135deg,#1e3a5f,#6366f1);padding:24px 28px;border-radius:12px 12px 0 0;color:#fff">
        <h2 style="margin:0">Thank You, ${firstName}!</h2>
      </div>
      <div style="background:#fff;padding:24px 28px;border:1px solid #e2e8f0;border-top:none">
        <p>Your payment for Job <strong>${job.invoice_ref}</strong> has been confirmed. Your job is now complete.</p>
        <p>We look forward to working with you again. For your next task, simply reply to any of our emails or contact us directly.</p>
        <p><strong>Calvin Thomas</strong><br>CTS BPO Solutions<br>
        <a href="https://wa.me/27760679100" style="color:#25d366;font-weight:700">💬 WhatsApp: +27 76 067 9100</a></p>
      </div>
    </div>`,
    text: `Hi ${firstName},\n\nThank you — payment for ${job.invoice_ref} has been confirmed. We look forward to working with you again!\n\nCalvin Thomas\nCTS BPO Solutions`,
  }).catch(() => {});

  await db.query(
    `INSERT INTO ai_activity_log (action_type, description, status)
     VALUES ('job_complete', $1, 'success')`,
    [`Job #${job.id} marked complete — R${job.quote_amount} from ${job.client_email}`]
  ).catch(() => {});

  console.log(`🏆 [PIPELINE] Job #${job.id} COMPLETE — R${job.quote_amount} from ${job.client_email}`);
  return job;
}

// ── Get all pipeline jobs ─────────────────────────────────────────────────────
async function getPipelineJobs({ status, limit = 100 } = {}) {
  await ensureTable();
  const where = status ? `WHERE status=$1` : '';
  const params = status ? [status] : [];
  const limitN = parseInt(limit) || 100;
  const { rows } = await db.query(
    `SELECT id, client_email, client_name, job_type, status, quote_amount, quote_currency,
            quote_sent_at, accepted_at, delivered_at, payment_detected_at, completed_at,
            invoice_ref, source_email_subject, created_at, admin_notified
     FROM bpo_pipeline_jobs ${where} ORDER BY created_at DESC LIMIT ${limitN}`,
    params
  );
  return rows;
}

// ── Get pipeline stats ────────────────────────────────────────────────────────
async function getPipelineStats() {
  await ensureTable();
  const { rows } = await db.query(`
    SELECT
      COUNT(*)                                             AS total,
      COUNT(*) FILTER (WHERE status='quoted')             AS quoted,
      COUNT(*) FILTER (WHERE status='processing')         AS processing,
      COUNT(*) FILTER (WHERE status='delivered')          AS delivered,
      COUNT(*) FILTER (WHERE status='payment_detected')   AS payment_detected,
      COUNT(*) FILTER (WHERE status='complete')           AS complete,
      COALESCE(SUM(quote_amount) FILTER (WHERE status='complete'), 0) AS total_revenue,
      COALESCE(SUM(quote_amount) FILTER (WHERE status IN ('delivered','payment_detected','complete')), 0) AS pipeline_value
    FROM bpo_pipeline_jobs
  `);
  return rows[0];
}

module.exports = {
  ensureTable,
  detectServiceRequest,
  detectPayment,
  detectAcceptance,
  sendQuote,
  processAcceptedQuote,
  runJobAndDeliver,
  markJobComplete,
  scanForPayments,
  getPipelineJobs,
  getPipelineStats,
};
