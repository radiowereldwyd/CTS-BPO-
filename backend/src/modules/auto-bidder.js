/**
 * CTS BPO — Autonomous Platform Job Bidder
 *
 * After every platform scan, this module:
 *  1. Finds all NEW platform_jobs rows
 *  2. Scores each for CTS AI fit (data-entry, transcription, etc.)
 *  3. Generates a tailored, professional proposal
 *  4. If a contact email is in the snippet → sends the proposal directly (fully autonomous)
 *  5. If no email → stores proposal + sends admin a digest so they can paste in seconds
 *  6. Marks processed jobs as bid_sent with auto_bid=true
 */

'use strict';

const db           = require('../db');
const emailOutreach = require('./email-outreach');

const ADMIN_EMAIL  = process.env.ADMIN_EMAIL  || 'cts.cybersolutions@gmail.com';
const APP_URL      = process.env.APP_URL       || 'https://cts-bpo.replit.app';
const FROM_NAME    = 'CTS BPO AI';

// ─────────────────────────────────────────────────────────────────────────────
// Job type → AI capability mapping
// ─────────────────────────────────────────────────────────────────────────────
const AI_CAPABLE_TYPES = new Set([
  'data-entry', 'transcription', 'translation', 'virtual-assistant',
  'customer-support', 'document-processing', 'invoice-processing',
  'content-moderation', 'finance-admin', 'general',
]);

function canAIHandle(job) {
  return AI_CAPABLE_TYPES.has(job.job_type);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract email from a job snippet or title (some buyers include contact info)
// ─────────────────────────────────────────────────────────────────────────────
function extractEmail(text) {
  if (!text) return null;
  const m = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Proposal templates per job type
// ─────────────────────────────────────────────────────────────────────────────
const VALUE_PROPS = [
  'AI-powered processing — results in hours, not days',
  '99%+ accuracy guaranteed on all deliverables',
  'Scalable capacity — handle 10 or 10,000 records with equal speed',
  'Secure, GDPR-compliant document handling',
  'Dedicated account manager + real-time progress updates',
  'South Africa-based team: world-class quality at competitive rates',
  'No setup fees — pay only for completed, verified work',
  '24-hour turnaround available on urgent projects',
];

function pickValueProp(jobId) {
  return VALUE_PROPS[jobId % VALUE_PROPS.length];
}

const PROPOSALS = {
  'data-entry': (job) => `
Hi,

I came across your job posting "${job.title}" and wanted to reach out immediately — this is exactly what CTS BPO specialises in.

We are an AI-powered BPO firm that handles large-scale data entry with 99%+ accuracy. Our system processes forms, spreadsheets, PDFs, and databases automatically — which means faster turnaround and lower cost than traditional manual entry teams.

**What we offer for this project:**
• Automated data extraction and entry using Google Document AI
• Quality-control pass on every record before delivery
• Secure file handling (NDA available)
• Turnaround: typically 24–48 hours for standard volumes
• ${pickValueProp(job.id)} 

We work on a per-record or per-project basis — no retainer required to get started.

I'd love to send you a quick quote based on your volume. Could you share an approximate record count or a sample file?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
📧 cts.cybersolutions@gmail.com | 🌐 ${APP_URL}
`.trim(),

  'transcription': (job) => `
Hi,

I saw your transcription posting "${job.title}" and wanted to connect right away.

CTS BPO uses Google Cloud Speech-to-Text AI combined with human quality review to deliver fast, accurate transcripts. We handle audio, video, legal depositions, medical dictation, and interview recordings.

**Our transcription service:**
• Turnaround: 24–48 hours (rush available)
• Accuracy: 98–99%+ with timestamps and speaker labels on request
• Formats: Word, PDF, SRT/VTT captions, or any format you need
• ${pickValueProp(job.id)}

Pricing starts from $1.00/audio minute for standard content. We'd be happy to do a free trial on a short sample so you can see the quality before committing.

Would a free sample work for you?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
📧 cts.cybersolutions@gmail.com | 🌐 ${APP_URL}
`.trim(),

  'translation': (job) => `
Hi,

Your translation posting "${job.title}" caught my attention — multilingual processing is one of our core strengths.

CTS BPO delivers professional document translation powered by Google Cloud Translation, reviewed by native-speaker editors. We cover 50+ language pairs including all major African, European, and Asian languages.

**Our translation service:**
• Speed: up to 10,000 words/day per language pair
• Accuracy: native speaker review on every document
• Formats: we work with Word, PDF, HTML, spreadsheets, and more
• ${pickValueProp(job.id)}

Happy to provide a free sample translation of 200–300 words so you can evaluate quality before deciding.

What language pairs and approximate word count are you looking at?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
📧 cts.cybersolutions@gmail.com | 🌐 ${APP_URL}
`.trim(),

  'virtual-assistant': (job) => `
Hi,

I noticed your virtual assistant posting "${job.title}" and wanted to introduce CTS BPO.

We provide dedicated AI-assisted virtual admin services — email management, scheduling, research, data organisation, customer follow-ups, and general admin tasks handled by a professional remote team supported by AI tools.

**What makes us different:**
• AI does the heavy lifting — your VA focuses on high-value communication
• Faster response times than traditional VA services
• Available across time zones — including outside standard business hours
• ${pickValueProp(job.id)}
• Full confidentiality — NDA signed before we start

We can start on a trial basis (10–20 hours) so you can evaluate fit before committing to ongoing work.

What are the main tasks you need covered?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
📧 cts.cybersolutions@gmail.com | 🌐 ${APP_URL}
`.trim(),

  'customer-support': (job) => `
Hi,

Your customer support posting "${job.title}" is a great fit for what CTS BPO does.

We manage outsourced customer support for businesses — email, chat, and ticket-based support handled by trained agents backed by AI for instant answer suggestions and escalation routing.

**Our customer support offering:**
• Email & chat support (response time < 2 hours during business hours)
• AI-assisted responses for common queries — dramatically faster resolution
• Weekly reporting on tickets, resolution rates, and CSAT
• Fully scalable — ramp up or down based on your volume
• ${pickValueProp(job.id)}

We'd love to discuss your ticket volume and SLA requirements. Would a quick call or email exchange work?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
📧 cts.cybersolutions@gmail.com | 🌐 ${APP_URL}
`.trim(),

  'document-processing': (job) => `
Hi,

I saw your document processing posting "${job.title}" and believe CTS BPO is a strong match.

We use Google Document AI to extract, validate, and organise data from invoices, contracts, forms, medical records, and any structured or semi-structured document type — at high volume with minimal manual intervention.

**Our document processing service:**
• AI extraction + human verification on every document
• Works with scanned PDFs, photos, and digital documents
• Output to your preferred format: Excel, database, API, or CSV
• ${pickValueProp(job.id)}

We can process a batch of sample documents for free so you can see the accuracy and speed firsthand.

What type of documents and what volume are you working with?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
📧 cts.cybersolutions@gmail.com | 🌐 ${APP_URL}
`.trim(),

  'finance-admin': (job) => `
Hi,

Your finance/bookkeeping posting "${job.title}" is something CTS BPO handles regularly for SMEs and startups.

We provide outsourced bookkeeping, accounts payable/receivable processing, payroll support, and financial data entry — using AI-assisted tools to ensure accuracy and speed.

**Our finance admin service:**
• Bank reconciliation, invoice processing, expense categorisation
• Payroll data entry and verification
• Monthly reports prepared and formatted to your requirements
• ${pickValueProp(job.id)}
• Fully confidential — NDA provided as standard

Happy to discuss your specific requirements and provide a competitive quote.

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
📧 cts.cybersolutions@gmail.com | 🌐 ${APP_URL}
`.trim(),

  'content-moderation': (job) => `
Hi,

I came across your content moderation posting "${job.title}" and wanted to reach out immediately.

CTS BPO provides AI-assisted content moderation — our system uses Google Cloud Vision and Gemini AI to pre-screen content at high speed, with human reviewers handling edge cases and escalations.

**Our content moderation service:**
• High-volume screening: thousands of items per hour with AI pre-classification
• Categories: text, images, video thumbnails
• Policy enforcement workflows tailored to your platform rules
• Detailed audit logs for every decision
• ${pickValueProp(job.id)}

Would you like to discuss volume, categories, and SLA requirements?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
📧 cts.cybersolutions@gmail.com | 🌐 ${APP_URL}
`.trim(),

  'general': (job) => `
Hi,

I saw your posting "${job.title}" and wanted to reach out — CTS BPO is an AI-powered outsourcing firm that handles a wide range of business process tasks.

We specialise in data entry, transcription, translation, virtual assistance, document processing, customer support, and content moderation — all delivered fast and accurately using Google AI tools combined with professional human oversight.

**Why CTS BPO:**
• ${pickValueProp(job.id)}
• No long-term contracts required to start
• Flexible pricing: per-task, per-hour, or monthly retainer
• Dedicated point of contact for your account

I'd love to learn more about what you need and put together a tailored proposal. What are the key requirements for this role?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
📧 cts.cybersolutions@gmail.com | 🌐 ${APP_URL}
`.trim(),
};

function generateProposal(job) {
  const templateFn = PROPOSALS[job.job_type] || PROPOSALS['general'];
  return templateFn(job);
}

// ─────────────────────────────────────────────────────────────────────────────
// Build HTML version of a plain-text proposal
// ─────────────────────────────────────────────────────────────────────────────
function proposalToHtml(text, job) {
  const lines = text.split('\n');
  const htmlLines = lines.map(line => {
    if (line.startsWith('**') && line.endsWith('**')) {
      return `<strong>${line.slice(2, -2)}</strong>`;
    }
    if (line.startsWith('• ')) {
      return `<li style="margin:4px 0">${line.slice(2)}</li>`;
    }
    if (line.trim() === '') return '<br>';
    return `<p style="margin:6px 0">${line}</p>`;
  });

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#1e293b;line-height:1.6">
      <div style="background:#1e3a5f;padding:16px 24px;border-radius:8px 8px 0 0">
        <span style="color:#fff;font-weight:900;font-size:18px">🤖 CTS BPO — Auto-Generated Proposal</span>
        <div style="color:#93c5fd;font-size:12px;margin-top:4px">Platform: ${job.platform} | Type: ${job.job_type} | Job: ${job.title}</div>
      </div>
      <div style="background:#f8fafc;padding:20px 24px;border:1px solid #e2e8f0;border-radius:0 0 8px 8px">
        <ul style="padding-left:20px">${htmlLines.join('\n')}</ul>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
          <a href="${job.job_url}" style="background:#6366f1;color:#fff;padding:8px 20px;border-radius:6px;text-decoration:none;font-weight:700;margin-right:10px">🔗 View Job Posting</a>
          <a href="${APP_URL}/ai-agent" style="background:#10b981;color:#fff;padding:8px 20px;border-radius:6px;text-decoration:none;font-weight:700">📊 Open Dashboard</a>
        </div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ensure schema has the new columns
// ─────────────────────────────────────────────────────────────────────────────
async function ensureAutoBidColumns() {
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS proposal_text TEXT`);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS auto_bid BOOLEAN DEFAULT FALSE`);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS contact_email TEXT`);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS bid_method TEXT`); // 'email_direct' | 'admin_notified'
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: process all new jobs and auto-bid
// ─────────────────────────────────────────────────────────────────────────────
async function autoBidNewJobs() {
  await ensureAutoBidColumns();

  // Fetch all new jobs that haven't been processed by auto-bidder yet
  const { rows: newJobs } = await db.query(
    `SELECT * FROM platform_jobs WHERE status = 'new' AND auto_bid IS NOT TRUE ORDER BY created_at DESC LIMIT 50`
  );

  if (newJobs.length === 0) return { processed: 0, emailed: 0, notified: 0 };

  let processed = 0;
  let emailed   = 0;          // direct email to contact found in snippet
  const adminDigest = [];     // jobs to notify admin about (no direct contact)

  for (const job of newJobs) {
    if (!canAIHandle(job)) continue;

    const proposal = generateProposal(job);
    const contactEmail = extractEmail(`${job.snippet || ''} ${job.title || ''}`);

    // Try direct email if contact found in snippet
    let bidMethod = 'admin_notified';
    if (contactEmail && !contactEmail.endsWith('@upwork.com') && !contactEmail.endsWith('@freelancer.com')) {
      try {
        await emailOutreach.sendMail({
          to:      contactEmail,
          subject: `Re: ${job.title} — CTS BPO proposal`,
          html:    proposalToHtml(proposal, job),
          text:    proposal,
        });
        emailed++;
        bidMethod = 'email_direct';
        console.log(`🤖 [AUTO-BID] Direct email sent → ${contactEmail} for "${job.title}"`);
      } catch (e) {
        console.warn(`[AUTO-BID] Email send failed to ${contactEmail}: ${e.message}`);
        bidMethod = 'admin_notified';
      }
    }

    // Save proposal + mark as bid_sent
    await db.query(
      `UPDATE platform_jobs
       SET proposal_text=$1, auto_bid=TRUE, contact_email=$2, bid_method=$3,
           status='bid_sent', bid_sent_at=NOW(), updated_at=NOW()
       WHERE id=$4`,
      [proposal, contactEmail, bidMethod, job.id]
    );

    processed++;
    adminDigest.push({ job, proposal, contactEmail, bidMethod });
  }

  // Send admin a digest email for all jobs that needed human action (no direct contact)
  const adminJobs = adminDigest.filter(d => d.bidMethod === 'admin_notified');
  if (adminJobs.length > 0) {
    await sendAdminDigest(adminJobs);
  }

  console.log(`🤖 [AUTO-BID] Done — ${processed} processed, ${emailed} direct emails sent, ${adminJobs.length} admin notifications`);
  return { processed, emailed, notified: adminJobs.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin digest — one email with all new proposals ready to paste
// ─────────────────────────────────────────────────────────────────────────────
async function sendAdminDigest(items) {
  if (items.length === 0) return;

  const jobCards = items.map(({ job, proposal }) => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:900;font-size:15px;color:#1e293b">${job.title}</span>
        <span style="background:#6366f1;color:#fff;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700">${job.platform}</span>
      </div>
      ${job.budget ? `<div style="color:#059669;font-weight:700;font-size:13px;margin-bottom:8px">💵 Budget: ${job.budget}</div>` : ''}
      <a href="${job.job_url}" style="background:#1e3a5f;color:#fff;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;display:inline-block;margin-bottom:16px">🔗 Open Job on ${job.platform} →</a>
      <div style="background:#f8fafc;border-left:4px solid #6366f1;padding:14px 16px;border-radius:0 8px 8px 0;font-size:13px;line-height:1.7;white-space:pre-wrap;font-family:monospace">${proposal}</div>
    </div>
  `).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:700px;color:#1e293b">
      <div style="background:linear-gradient(135deg,#1e3a5f,#0f5499);padding:20px 28px;border-radius:12px 12px 0 0">
        <div style="color:#fff;font-weight:900;font-size:20px">🤖 CTS BPO Auto-Bidder — ${items.length} Proposal${items.length > 1 ? 's' : ''} Ready</div>
        <div style="color:#93c5fd;font-size:13px;margin-top:6px">
          Your AI scanned freelance platforms and generated tailored proposals. Copy each proposal text and paste it directly into the job posting to submit your bid.
        </div>
      </div>
      <div style="background:#f0f4ff;padding:12px 28px;border:1px solid #c7d2fe">
        <strong>⚡ Action needed:</strong> Click "Open Job" for each listing below, then paste the proposal text into the bid/proposal field. First-to-respond wins most jobs.
      </div>
      <div style="padding:24px 0">${jobCards}</div>
      <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;font-size:12px;color:#64748b;text-align:center">
        <a href="${APP_URL}/ai-agent" style="color:#6366f1;font-weight:700">View all jobs in dashboard →</a>
      </div>
    </div>`;

  try {
    await emailOutreach.sendMail({
      to:      ADMIN_EMAIL,
      subject: `🤖 Auto-Bidder: ${items.length} new proposal${items.length > 1 ? 's' : ''} ready — act now`,
      html,
      text:    items.map(({ job, proposal }) => `JOB: ${job.title}\nURL: ${job.job_url}\n\n${proposal}\n\n${'─'.repeat(60)}\n`).join('\n'),
    });
    console.log(`📧 [AUTO-BID] Admin digest sent — ${items.length} proposals`);
  } catch (e) {
    console.warn(`[AUTO-BID] Admin digest failed: ${e.message}`);
  }
}

module.exports = { autoBidNewJobs, canAIHandle, generateProposal, extractEmail };
