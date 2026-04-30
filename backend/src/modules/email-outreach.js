/**
 * CTS BPO — AI Email Outreach & Marketing Engine
 * Full sales funnel templates: Cold Outreach → Negotiation → Contract → Invoice → Payment → Completion
 * Sends via Gmail SMTP (App Password). Falls back to console log when unconfigured.
 */

const nodemailer  = require('nodemailer');
const auditLogger = require('./audit-logger');

const GMAIL_USER     = process.env.GMAIL_USER         || process.env.SMTP_USER || '';
const GMAIL_APP_PASS = process.env.GMAIL_APP_PASSWORD  || process.env.SMTP_PASS || '';
const SMTP_HOST      = process.env.SMTP_HOST           || 'smtp.gmail.com';
const SMTP_PORT      = parseInt(process.env.SMTP_PORT  || '587', 10);
const FROM_NAME      = 'Calvin | CTS BPO Solutions';
const FROM_EMAIL     = GMAIL_USER || 'cts.bposolutions@gmail.com';
const REPLY_EMAIL    = 'cts.bposolutions@gmail.com';
const WEBSITE        = 'cts.bposolutions@gmail.com';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (GMAIL_USER && GMAIL_APP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST, port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASS },
    });
  }
  return transporter;
}

function isConfigured() { return !!(GMAIL_USER && GMAIL_APP_PASS); }

function esc(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Shared header / footer builders ──────────────────────────────────────────

const header = (tagline = 'AI-Driven Business Process Outsourcing') => `
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:28px 36px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:28px;font-weight:900;letter-spacing:-1px">CTS BPO</h1>
    <p style="color:#93c5fd;margin:6px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:2px">${tagline}</p>
  </div>`;

const footer = () => `
  <div style="background:#f1f5f9;padding:20px 36px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0">
    <p style="margin:0 0 4px"><strong style="color:#475569">CTS BPO Solutions</strong> | South Africa (serving clients worldwide)</p>
    <p style="margin:0">📧 ${REPLY_EMAIL}</p>
    <p style="margin:8px 0 0;font-size:10px">To unsubscribe, reply with "unsubscribe" in the subject line.</p>
  </div>`;

const wrapper = (content) => `
  <div style="font-family:'Segoe UI',Inter,Arial,sans-serif;max-width:640px;margin:0 auto;background:#fff;color:#1e293b;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    ${content}
  </div>`;

const cta = (label, mailtoSubject) => `
  <div style="text-align:center;margin:28px 0">
    <a href="mailto:${REPLY_EMAIL}?subject=${encodeURIComponent(mailtoSubject)}"
       style="background:linear-gradient(135deg,#1e40af,#2563eb);color:#fff;padding:15px 40px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;letter-spacing:0.3px">
      ${label}
    </a>
  </div>`;

const serviceGrid = () => `
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin:4px 0">
    <tr><td style="padding:5px 0">✅ <strong>Data Entry &amp; Capture</strong> — High-volume, accurate data processing</td></tr>
    <tr><td style="padding:5px 0">✅ <strong>Document Translation</strong> — 100+ languages, AI + human-reviewed</td></tr>
    <tr><td style="padding:5px 0">✅ <strong>Audio &amp; Video Transcription</strong> — Structured text from any media</td></tr>
    <tr><td style="padding:5px 0">✅ <strong>Virtual Administration</strong> — Scheduling, research, correspondence</td></tr>
    <tr><td style="padding:5px 0">✅ <strong>Invoice &amp; Finance Processing</strong> — AP/AR, reconciliation, reporting</td></tr>
    <tr><td style="padding:5px 0">✅ <strong>Content Moderation</strong> — Fast, compliant, scalable</td></tr>
    <tr><td style="padding:5px 0">✅ <strong>Document AI Extraction</strong> — Forms, invoices, scanned PDFs</td></tr>
  </table>`;

const pillsRow = () => `
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin:20px 0">
    ${[['⚡','Fast','24–48 hr turnaround'],['🔒','Secure','GDPR &amp; POPIA'],['🤖','AI QA','Every task reviewed'],['💰','Affordable','Up to 60% saving']].map(([i,t,d])=>`
      <div style="flex:1;min-width:110px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 8px;text-align:center">
        <div style="font-size:20px">${i}</div>
        <div style="font-weight:700;font-size:12px;margin-top:4px">${t}</div>
        <div style="font-size:10px;color:#64748b;margin-top:2px">${d}</div>
      </div>`).join('')}
  </div>`;

const highlight = (text) => `
  <div style="background:#f0f9ff;border-left:4px solid #1e40af;padding:16px 20px;border-radius:0 8px 8px 0;margin:16px 0;font-size:14px;line-height:1.7">
    ${text}
  </div>`;

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE DEFINITIONS
// ═════════════════════════════════════════════════════════════════════════════

const templates = {

  // ── 1. COLD OUTREACH — AI found a BPO opportunity ─────────────────────────
  bpoApplication: (p) => {
    const name    = esc(p.name)    || 'Hiring Manager';
    const company = esc(p.company) || 'your organisation';
    const jobType = esc(p.jobType) || 'business process outsourcing';
    const jobCap  = jobType.charAt(0).toUpperCase() + jobType.slice(1);
    return {
      subject: `BPO Specialist Available — ${jobCap} Services for ${company}`,
      html: wrapper(`
        ${header()}
        <div style="padding:36px">
          <p style="font-size:15px;margin:0 0 16px">Dear ${name},</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px">
            My name is <strong>Calvin</strong> from <strong>CTS BPO Solutions</strong>. I noticed
            ${company} is looking for <strong>${jobType}</strong> support — this is exactly what we
            specialise in. Our AI-powered platform delivers high-quality BPO services at a fraction
            of the cost of in-house teams.
          </p>
          ${highlight(`<strong>We are actively available</strong> to take on ${jobType} work for ${company} with a typical start time of <strong>48–72 hours</strong> from contract signature.`)}
          <p style="font-weight:700;color:#1e40af;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;margin:20px 0 8px">Our Services:</p>
          ${serviceGrid()}
          ${pillsRow()}
          <p style="font-size:14px;line-height:1.7;margin:16px 0">
            I'd like to offer a <strong>free pilot task</strong> — send us a small sample of your
            data or a test document and we'll return it processed within 24 hours, at no cost, so
            you can judge our quality before committing to anything.
          </p>
          ${cta('📧 Reply to Discuss Requirements', `BPO Services Enquiry — ${company}`)}
          <p style="font-size:13px;color:#64748b">Or email us directly: <a href="mailto:${REPLY_EMAIL}" style="color:#1e40af">${REPLY_EMAIL}</a></p>
          <p style="font-size:14px;margin:20px 0 0">Best regards,<br><strong>Calvin</strong><br>CTS BPO Solutions</p>
        </div>
        ${footer()}
      `),
    };
  },

  // ── 2. FOLLOW-UP (no reply after 5-7 days) ────────────────────────────────
  followUp: (p) => {
    const name    = esc(p.name)    || 'there';
    const company = esc(p.company) || 'your organisation';
    return {
      subject: `Following up — Free Pilot Task Offer for ${company}`,
      html: wrapper(`
        ${header('Following Up')}
        <div style="padding:36px">
          <p style="font-size:15px;margin:0 0 16px">Hi ${name},</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px">
            I wanted to follow up on my previous message about BPO services for ${company}.
            I understand inboxes get busy — so I'll keep this brief.
          </p>
          ${highlight(`Our <strong>free pilot offer</strong> is still open. Send us one piece of real work — a document to translate, data to capture, or audio to transcribe — and we'll deliver it within <strong>24 hours, completely free</strong>. No strings attached.`)}
          <p style="font-size:14px;line-height:1.7;margin:16px 0">
            This gives you zero-risk proof of our quality. If you like what you receive, we can
            discuss a formal arrangement. If not, you keep the work and owe us nothing.
          </p>
          ${cta('📧 Claim Your Free Pilot Task', `Free Pilot Task — ${company}`)}
          <p style="font-size:13px;color:#64748b;margin-top:16px">
            If you're not the right person to speak to, I'd really appreciate being pointed in the right direction.
          </p>
          <p style="font-size:14px;margin:20px 0 0">Kind regards,<br><strong>Calvin</strong><br>CTS BPO Solutions<br><a href="mailto:${REPLY_EMAIL}" style="color:#1e40af">${REPLY_EMAIL}</a></p>
        </div>
        ${footer()}
      `),
    };
  },

  // ── 3. NEGOTIATION OPENING — They replied positively ─────────────────────
  negotiationOpening: (p) => {
    const name    = esc(p.name)    || 'there';
    const company = esc(p.company) || 'your organisation';
    const jobType = esc(p.jobType) || 'BPO services';
    return {
      subject: `CTS BPO — Pricing & Proposal for ${company}`,
      html: wrapper(`
        ${header('Pricing & Proposal')}
        <div style="padding:36px">
          <p style="font-size:15px;margin:0 0 16px">Dear ${name},</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px">
            Thank you for your interest in CTS BPO's services for ${company}. Based on your
            requirement for <strong>${jobType}</strong>, here is our proposed pricing structure:
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
            <tr style="background:#f0f9ff">
              <th style="text-align:left;padding:10px 14px;border:1px solid #bfdbfe;color:#1e40af">Service Tier</th>
              <th style="text-align:left;padding:10px 14px;border:1px solid #bfdbfe;color:#1e40af">Volume</th>
              <th style="text-align:left;padding:10px 14px;border:1px solid #bfdbfe;color:#1e40af">Rate (ZAR)</th>
              <th style="text-align:left;padding:10px 14px;border:1px solid #bfdbfe;color:#1e40af">Rate (USD)</th>
            </tr>
            <tr>
              <td style="padding:10px 14px;border:1px solid #e2e8f0">Starter</td>
              <td style="padding:10px 14px;border:1px solid #e2e8f0">Up to 500 units/month</td>
              <td style="padding:10px 14px;border:1px solid #e2e8f0"><strong>R 5,000</strong></td>
              <td style="padding:10px 14px;border:1px solid #e2e8f0">~$270</td>
            </tr>
            <tr style="background:#f8fafc">
              <td style="padding:10px 14px;border:1px solid #e2e8f0">Professional</td>
              <td style="padding:10px 14px;border:1px solid #e2e8f0">Up to 2,000 units/month</td>
              <td style="padding:10px 14px;border:1px solid #e2e8f0"><strong>R 15,000</strong></td>
              <td style="padding:10px 14px;border:1px solid #e2e8f0">~$810</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;border:1px solid #e2e8f0">Enterprise</td>
              <td style="padding:10px 14px;border:1px solid #e2e8f0">Unlimited</td>
              <td style="padding:10px 14px;border:1px solid #e2e8f0"><strong>Custom</strong></td>
              <td style="padding:10px 14px;border:1px solid #e2e8f0">Custom</td>
            </tr>
          </table>
          ${highlight(`All plans include: AI quality assurance, GDPR/POPIA compliance, full audit trail, dedicated account manager, and 24–48 hour turnaround SLA.`)}
          <p style="font-size:14px;line-height:1.7;margin:16px 0">
            I am flexible on pricing for long-term contracts or high-volume commitments. I would
            love to schedule a 15-minute call to discuss your exact needs and tailor a proposal
            specifically for ${company}.
          </p>
          ${cta('📞 Accept Proposal & Schedule Call', `Accepting Proposal — ${company}`)}
          <p style="font-size:14px;margin:20px 0 0">Looking forward to working with you,<br><strong>Calvin</strong><br>CTS BPO Solutions</p>
        </div>
        ${footer()}
      `),
    };
  },

  // ── 4. CONTRACT PROPOSAL ──────────────────────────────────────────────────
  contractProposal: (p) => {
    const name     = esc(p.name)     || 'there';
    const company  = esc(p.company)  || 'your organisation';
    const service  = esc(p.jobType)  || 'BPO Services';
    const amount   = esc(p.amount)   || 'as agreed';
    const duration = esc(p.duration) || '3 months';
    return {
      subject: `Service Agreement — CTS BPO × ${company}`,
      html: wrapper(`
        ${header('Service Agreement')}
        <div style="padding:36px">
          <p style="font-size:15px;margin:0 0 16px">Dear ${name},</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px">
            I am pleased to present the service agreement between <strong>CTS BPO Solutions</strong>
            and <strong>${company}</strong>. Please review the key terms below:
          </p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:16px 0;font-size:14px">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:6px 0;color:#64748b;width:140px">Service:</td><td><strong>${service}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Duration:</td><td><strong>${duration}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Value:</td><td><strong>${amount}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Turnaround SLA:</td><td><strong>24–48 hours per task</strong></td></tr>
              <tr><td style="padding:6px 0;color:#64748b">QA Standard:</td><td><strong>AI-reviewed + human sign-off</strong></td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Compliance:</td><td><strong>GDPR &amp; POPIA compliant</strong></td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Payment Terms:</td><td><strong>Net 14 days from invoice</strong></td></tr>
            </table>
          </div>
          ${highlight(`To accept this agreement, simply reply to this email with <strong>"I accept"</strong> or ask any questions you may have. A formal contract document can be provided on request.`)}
          ${cta('✅ Accept Agreement', `Accepting Service Agreement — ${company}`)}
          <p style="font-size:14px;line-height:1.7;margin:16px 0">
            Once accepted, we will send your first invoice and schedule an onboarding call
            to get started within 48 hours.
          </p>
          <p style="font-size:14px;margin:20px 0 0">Warm regards,<br><strong>Calvin</strong><br>CTS BPO Solutions</p>
        </div>
        ${footer()}
      `),
    };
  },

  // ── 5. CLIENT WELCOME / ONBOARDING ────────────────────────────────────────
  clientWelcome: (p) => {
    const name    = esc(p.name)    || 'there';
    const company = esc(p.company) || 'your organisation';
    const service = esc(p.jobType) || 'BPO Services';
    return {
      subject: `Welcome to CTS BPO, ${company}! 🎉`,
      html: wrapper(`
        ${header('Welcome Aboard!')}
        <div style="padding:36px">
          <div style="text-align:center;font-size:48px;margin:8px 0 20px">🎉</div>
          <p style="font-size:16px;margin:0 0 16px;text-align:center;font-weight:700">Welcome, ${name}!</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px;text-align:center;color:#475569">
            We're thrilled to have <strong>${company}</strong> on board. Your account for
            <strong>${service}</strong> is now active.
          </p>
          ${highlight(`<strong>Your dedicated contact:</strong><br>Calvin — CTS BPO Solutions<br>📧 ${REPLY_EMAIL}<br>⏰ Response within 4 business hours`)}
          <p style="font-weight:700;color:#1e40af;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;margin:20px 0 10px">Next Steps:</p>
          <ol style="font-size:14px;line-height:2;padding-left:20px;color:#334155">
            <li>Send your first batch of work to ${REPLY_EMAIL}</li>
            <li>We will confirm receipt within 2 hours</li>
            <li>Work is processed and AI quality-checked</li>
            <li>Completed work delivered within 24–48 hours</li>
            <li>Invoice issued upon delivery</li>
          </ol>
          ${cta('📧 Send Your First Task', `First Task — ${company}`)}
          <p style="font-size:14px;margin:20px 0 0">Excited to work with you,<br><strong>Calvin &amp; the CTS BPO Team</strong></p>
        </div>
        ${footer()}
      `),
    };
  },

  // ── 6. INVOICE ────────────────────────────────────────────────────────────
  invoiceSent: (p) => {
    const name      = esc(p.name)          || 'Client';
    const company   = esc(p.company)       || '';
    const invoiceNo = esc(p.invoiceNo)     || 'INV-001';
    const service   = esc(p.jobType)       || 'BPO Services';
    const amount    = esc(p.amount)        || 'R 0';
    const dueDate   = esc(p.dueDate)       || '14 days from today';
    const paypalLink = p.paypalLink        || '';
    const ozowLink   = p.ozowLink          || '';
    return {
      subject: `Invoice ${invoiceNo} — CTS BPO Solutions`,
      html: wrapper(`
        ${header('Invoice')}
        <div style="padding:36px">
          <p style="font-size:15px;margin:0 0 16px">Dear ${name},</p>
          <p style="font-size:14px;line-height:1.7;margin:0 0 16px">
            Please find your invoice for services rendered below.
          </p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:16px 0">
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:6px 0;color:#64748b;width:160px">Invoice Number:</td><td><strong>${invoiceNo}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Client:</td><td><strong>${company || name}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Service:</td><td>${service}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Due Date:</td><td><strong>${dueDate}</strong></td></tr>
              <tr style="border-top:2px solid #e2e8f0"><td style="padding:10px 0 0;color:#1e293b;font-size:16px"><strong>TOTAL AMOUNT:</strong></td><td style="padding:10px 0 0;font-size:20px;font-weight:900;color:#1e40af">${amount}</td></tr>
            </table>
          </div>
          <p style="font-weight:700;color:#1e40af;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;margin:20px 0 10px">Pay Now:</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            ${paypalLink ? `<a href="${paypalLink}" style="flex:1;min-width:140px;background:#003087;color:#fff;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;text-align:center;display:block">💳 Pay via PayPal</a>` : ''}
            ${ozowLink   ? `<a href="${ozowLink}"   style="flex:1;min-width:140px;background:#00a651;color:#fff;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;text-align:center;display:block">🏦 Pay via Ozow (EFT)</a>` : ''}
            <a href="mailto:${REPLY_EMAIL}?subject=Invoice ${invoiceNo} — EFT Payment" style="flex:1;min-width:140px;background:#334155;color:#fff;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;text-align:center;display:block">🏧 Pay via EFT</a>
          </div>
          <p style="font-size:12px;color:#94a3b8;margin:12px 0">For EFT payments, reply to this email and we will send banking details.</p>
          <p style="font-size:14px;margin:20px 0 0">Thank you for your business,<br><strong>Calvin</strong><br>CTS BPO Solutions</p>
        </div>
        ${footer()}
      `),
    };
  },

  // ── 7. PAYMENT CONFIRMATION ───────────────────────────────────────────────
  paymentConfirmed: (p) => {
    const name   = esc(p.name)      || 'Client';
    const amount = esc(p.amount)    || '';
    const ref    = esc(p.reference) || '';
    return {
      subject: `Payment Received — Thank You! ✅`,
      html: wrapper(`
        ${header('Payment Confirmed')}
        <div style="padding:36px;text-align:center">
          <div style="font-size:56px;margin-bottom:12px">✅</div>
          <h2 style="color:#16a34a;margin:0 0 8px">Payment Received!</h2>
          <p style="font-size:15px;color:#475569;margin:0 0 24px">Thank you, ${name}. Your payment has been confirmed.</p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;text-align:left;margin:0 auto 24px;max-width:340px;font-size:14px">
            ${amount ? `<div style="margin-bottom:8px">💰 <strong>Amount:</strong> ${amount}</div>` : ''}
            ${ref    ? `<div>🔖 <strong>Reference:</strong> ${ref}</div>` : ''}
          </div>
          <p style="font-size:14px;line-height:1.7;color:#475569">
            Your work is now in progress. You will receive a delivery confirmation once complete.
          </p>
          ${cta('📧 Contact Us', 'Query — CTS BPO')}
          <p style="font-size:14px;margin:20px 0 0">Thank you for choosing CTS BPO,<br><strong>Calvin &amp; the Team</strong></p>
        </div>
        ${footer()}
      `),
    };
  },

  // ── 8. WORK DELIVERY / COMPLETION ─────────────────────────────────────────
  workComplete: (p) => {
    const name    = esc(p.name)    || 'Client';
    const company = esc(p.company) || '';
    const service = esc(p.jobType) || 'BPO Services';
    const notes   = esc(p.notes)   || '';
    return {
      subject: `✅ Work Complete — Your ${service} Deliverables Are Ready`,
      html: wrapper(`
        ${header('Work Complete!')}
        <div style="padding:36px">
          <div style="text-align:center;font-size:48px;margin-bottom:16px">🎯</div>
          <p style="font-size:15px;margin:0 0 16px">Dear ${name},</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px">
            Great news! Your <strong>${service}</strong> order${company ? ` for ${company}` : ''} has been
            completed and quality-checked by our AI platform.
          </p>
          ${notes ? highlight(notes) : ''}
          ${highlight(`Your deliverables are attached to this email. If you have any corrections or feedback, please respond within <strong>48 hours</strong> and we will revise at no extra charge.`)}
          <p style="font-size:14px;line-height:1.7;margin:16px 0">
            We would love to hear your feedback — it helps us continuously improve and means
            a great deal to our small team.
          </p>
          ${cta('⭐ Give Feedback', `Feedback — ${service}`)}
          <p style="font-size:14px;margin:20px 0 0">Thank you for choosing CTS BPO!<br><strong>Calvin</strong><br>CTS BPO Solutions</p>
        </div>
        ${footer()}
      `),
    };
  },

  // ── 9. FEEDBACK REQUEST ───────────────────────────────────────────────────
  feedbackRequest: (p) => {
    const name    = esc(p.name)    || 'there';
    const company = esc(p.company) || '';
    return {
      subject: `How did we do? — CTS BPO Review Request`,
      html: wrapper(`
        ${header('Quick Feedback Request')}
        <div style="padding:36px;text-align:center">
          <div style="font-size:48px;margin-bottom:16px">⭐</div>
          <p style="font-size:15px;margin:0 0 16px">Hi ${name},</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 20px;color:#475569">
            We recently completed work for ${company || 'you'} and we'd love to hear how we did.
            Your feedback (good or bad) takes less than 60 seconds and helps us serve you better.
          </p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:24px 0">
            ${['⭐⭐⭐⭐⭐ Excellent','⭐⭐⭐⭐ Good','⭐⭐⭐ Average','⭐⭐ Needs Work'].map((r,i)=>`
              <a href="mailto:${REPLY_EMAIL}?subject=Feedback: ${encodeURIComponent(r)} — ${company}"
                 style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;text-decoration:none;color:#334155;font-size:13px;font-weight:600;display:block">${r}</a>
            `).join('')}
          </div>
          <p style="font-size:13px;color:#94a3b8;margin-top:16px">
            Or simply reply to this email with your thoughts — we read every response.
          </p>
          <p style="font-size:14px;margin:24px 0 0">Thank you,<br><strong>Calvin &amp; the CTS BPO Team</strong></p>
        </div>
        ${footer()}
      `),
    };
  },

  // ── LEGACY ────────────────────────────────────────────────────────────────
  initialOutreach: (p) => templates.bpoApplication(p),

};

const VALID_TEMPLATES = Object.keys(templates);

// ── Meta info for the frontend UI ─────────────────────────────────────────────
const TEMPLATE_META = {
  bpoApplication:    { name: 'Cold Outreach',        category: 'outreach',    stage: 1, description: 'AI finds a job posting → sends this to the company' },
  followUp:          { name: 'Follow-Up',             category: 'outreach',    stage: 2, description: 'No reply after 5–7 days → automated follow-up' },
  negotiationOpening:{ name: 'Pricing Proposal',      category: 'negotiation', stage: 3, description: 'They replied positively → send pricing table' },
  contractProposal:  { name: 'Contract Proposal',     category: 'negotiation', stage: 4, description: 'Verbally agreed → send formal service agreement' },
  clientWelcome:     { name: 'Client Welcome',        category: 'onboarding',  stage: 5, description: 'Contract signed → welcome them aboard' },
  invoiceSent:       { name: 'Invoice',               category: 'billing',     stage: 6, description: 'Work delivered or milestone reached → send invoice' },
  paymentConfirmed:  { name: 'Payment Confirmed',     category: 'billing',     stage: 7, description: 'Payment received → confirmation email' },
  workComplete:      { name: 'Work Delivery',         category: 'delivery',    stage: 8, description: 'Work done → deliver files and notify client' },
  feedbackRequest:   { name: 'Feedback Request',      category: 'retention',   stage: 9, description: 'After delivery → request review / testimonial' },
};

// ── Core send function ─────────────────────────────────────────────────────────

async function sendOutreachEmail(prospect, templateName = 'bpoApplication') {
  if (!prospect?.email) throw new Error('prospect.email is required');
  if (!VALID_TEMPLATES.includes(templateName)) throw new Error(`Unknown template: ${templateName}`);

  const { subject, html } = templates[templateName](prospect);
  const xport = getTransporter();

  if (xport) {
    const info = await xport.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to:   prospect.email,
      subject,
      html,
      replyTo: REPLY_EMAIL,
    });
    await auditLogger.log('outreach.sent', 'prospect', null,
      `Sent to ${prospect.email} [${templateName}]: ${info.messageId}`, null, 'info');
    return { sent: true, messageId: info.messageId, to: prospect.email, subject };
  }

  console.log('[EMAIL STUB]', templateName, '→', prospect.email, '|', subject);
  return { sent: false, simulated: true, to: prospect.email, subject };
}

async function runCampaign(prospects, templateName = 'bpoApplication') {
  const results = { sent: 0, simulated: 0, failed: 0, total: prospects.length };
  for (const prospect of prospects) {
    try {
      const r = await sendOutreachEmail(prospect, templateName);
      if (r.sent) results.sent++; else results.simulated++;
      await new Promise(r => setTimeout(r, 800)); // rate-limit
    } catch (err) {
      results.failed++;
      console.error('Outreach failed:', err.message);
    }
  }
  await auditLogger.log('outreach.campaign', null, null,
    `Campaign [${templateName}]: ${results.sent} sent, ${results.simulated} simulated, ${results.failed} failed`, null, 'info');
  return results;
}

// Preview a template with sample data (for frontend)
function previewTemplate(templateName) {
  const sample = {
    name: 'Sarah Johnson', company: 'Acme Global Ltd', email: 'sarah@acmeglobal.com',
    jobType: 'data entry and transcription', amount: 'R 15,000 / month',
    duration: '3 months', invoiceNo: 'INV-001', dueDate: '15 May 2026',
    reference: 'TXN-98765', notes: 'All 450 pages transcribed and formatted as requested.',
  };
  if (!VALID_TEMPLATES.includes(templateName)) return null;
  return templates[templateName](sample);
}

module.exports = {
  sendOutreachEmail, runCampaign, previewTemplate,
  templates, TEMPLATE_META, VALID_TEMPLATES,
  isConfigured: () => !!(GMAIL_USER && GMAIL_APP_PASS),
};
