/**
 * AI Email Outreach Module
 * Sends automated prospect outreach emails via nodemailer.
 * Supports Gmail (smtp.gmail.com) with App Password or any SMTP server.
 * Falls back to console logging when credentials are not configured.
 */

const nodemailer = require('nodemailer');
const auditLogger = require('./audit-logger');

// ── Gmail config (primary) ─────────────────────────────────────────────────
const GMAIL_USER     = process.env.GMAIL_USER     || process.env.SMTP_USER || '';
const GMAIL_APP_PASS = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '';

// ── Generic SMTP fallback ──────────────────────────────────────────────────
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);

const FROM_EMAIL = GMAIL_USER || process.env.FROM_EMAIL || 'noreply@ctsbpo.com';
const FROM_NAME  = process.env.FROM_NAME || 'CTS BPO Solutions';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (GMAIL_USER && GMAIL_APP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASS },
    });
    return transporter;
  }
  return null;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Email Templates ────────────────────────────────────────────────────────
const templates = {

  /**
   * BPO SERVICE APPLICATION — CTS BPO applies to perform work for a client.
   * Used when AI finds a company that needs BPO services done.
   */
  bpoApplication: (prospect) => {
    const name    = escapeHtml(prospect.name)    || 'Hiring Manager';
    const company = escapeHtml(prospect.company) || 'your organisation';
    const jobType = escapeHtml(prospect.jobType) || 'business process outsourcing';
    return {
      subject: `BPO Service Provider — We Can Handle Your ${jobType.charAt(0).toUpperCase() + jobType.slice(1)} Requirements`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;color:#1e293b">

          <!-- Header -->
          <div style="background:linear-gradient(135deg,#1e3a8a,#1e40af);padding:28px 32px;text-align:center">
            <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px">CTS BPO</h1>
            <p style="color:#93c5fd;margin:6px 0 0;font-size:13px;letter-spacing:1px;text-transform:uppercase">AI-Driven Business Process Outsourcing</p>
          </div>

          <!-- Body -->
          <div style="padding:36px 32px">
            <p style="font-size:15px;margin:0 0 16px">Dear ${name},</p>

            <p style="font-size:15px;line-height:1.7;margin:0 0 20px">
              My name is <strong>Calvin</strong> from <strong>CTS BPO Solutions</strong>. I came across your
              requirement for <strong>${jobType}</strong> services and I believe we are exceptionally positioned to
              help <strong>${company}</strong> achieve faster turnaround times, lower costs, and higher accuracy —
              all managed and quality-checked by our AI platform.
            </p>

            <div style="background:#f0f9ff;border-left:4px solid #1e40af;padding:18px 20px;border-radius:0 8px 8px 0;margin:0 0 24px">
              <p style="margin:0 0 12px;font-weight:700;color:#1e40af;font-size:14px">WHAT WE OFFER:</p>
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr><td style="padding:4px 0">✅ <strong>Data Entry &amp; Capture</strong> — Accurate, high-volume data processing</td></tr>
                <tr><td style="padding:4px 0">✅ <strong>Document Translation</strong> — 25+ languages, human-reviewed</td></tr>
                <tr><td style="padding:4px 0">✅ <strong>Audio Transcription</strong> — Audio/video to structured text</td></tr>
                <tr><td style="padding:4px 0">✅ <strong>Virtual Administration</strong> — Scheduling, correspondence, research</td></tr>
                <tr><td style="padding:4px 0">✅ <strong>Finance &amp; Invoice Processing</strong> — AP/AR, reconciliation</td></tr>
                <tr><td style="padding:4px 0">✅ <strong>Content Moderation</strong> — Rapid, compliant content review</td></tr>
                <tr><td style="padding:4px 0">✅ <strong>Data Cleansing &amp; Verification</strong> — Clean, structured datasets</td></tr>
              </table>
            </div>

            <p style="font-size:15px;line-height:1.7;margin:0 0 20px">
              Our AI platform continuously monitors work quality, ensures GDPR/POPIA compliance,
              and provides you with a full audit trail on every task. Our team of verified remote specialists
              is available 24/7 with typical turnaround of <strong>24–48 hours</strong>.
            </p>

            <!-- Key differentiators -->
            <div style="display:flex;gap:12px;margin:0 0 28px;flex-wrap:wrap">
              ${[
                ['⚡','Fast','24–48 hour turnaround'],
                ['🔒','Secure','GDPR &amp; POPIA compliant'],
                ['🤖','AI Quality','Every task AI-reviewed'],
                ['💰','Cost-Saving','Up to 60% cheaper than in-house'],
              ].map(([icon, title, desc]) => `
                <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:8px;padding:14px;text-align:center;border:1px solid #e2e8f0">
                  <div style="font-size:22px">${icon}</div>
                  <div style="font-weight:700;font-size:13px;margin-top:6px;color:#1e293b">${title}</div>
                  <div style="font-size:11px;color:#64748b;margin-top:3px">${desc}</div>
                </div>
              `).join('')}
            </div>

            <p style="font-size:15px;line-height:1.7;margin:0 0 24px">
              I would love to offer you a <strong>no-obligation pilot task</strong> — send us a small sample
              of your data or a test document and we will process it within 24 hours, completely free,
              so you can judge our quality firsthand.
            </p>

            <!-- CTA -->
            <div style="text-align:center;margin:28px 0">
              <a href="mailto:cts.bposolutions@gmail.com?subject=Reply: BPO Services for ${encodeURIComponent(company)}"
                 style="background:linear-gradient(135deg,#1e40af,#2563eb);color:#ffffff;padding:15px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
                📧 Reply to Discuss Your Requirements
              </a>
            </div>

            <p style="font-size:14px;color:#64748b;line-height:1.6;margin:0 0 8px">
              You can also reach us directly at:
            </p>
            <p style="font-size:14px;margin:0">
              📧 <a href="mailto:cts.bposolutions@gmail.com" style="color:#1e40af">cts.bposolutions@gmail.com</a><br>
              🌐 CTS BPO Solutions — South Africa (serving clients worldwide)
            </p>
          </div>

          <!-- Footer -->
          <div style="background:#f1f5f9;padding:18px 32px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0">
            <p style="margin:0">© ${new Date().getFullYear()} CTS BPO Solutions | cts.bposolutions@gmail.com</p>
            <p style="margin:6px 0 0">
              This email was sent because your organisation appeared to have a requirement we can fulfil.<br>
              To unsubscribe, reply with "unsubscribe" in the subject line.
            </p>
          </div>
        </div>
      `,
    };
  },

  /** Original outreach — selling the CTS BPO platform */
  initialOutreach: (prospect) => {
    const name    = escapeHtml(prospect.name)    || 'there';
    const company = escapeHtml(prospect.company) || 'yours';
    return {
      subject: 'Transform Your Business Processes with AI – CTS BPO',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
          <div style="background:#1e40af;padding:24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:24px">CTS BPO</h1>
            <p style="color:#93c5fd;margin:8px 0 0">AI-Driven Business Process Outsourcing</p>
          </div>
          <div style="padding:32px">
            <p>Hi ${name},</p>
            <p>I'm reaching out because we help businesses like <strong>${company}</strong>
               reduce operational costs by up to 60% using our AI-powered BPO platform.</p>
            <h3 style="color:#1e40af">What we offer:</h3>
            <ul>
              <li>✅ AI-driven contract management &amp; negotiation</li>
              <li>✅ Automated subcontractor assignment</li>
              <li>✅ Integrated payment processing (Ozow + PayPal)</li>
              <li>✅ Full audit trail &amp; POPIA compliance</li>
            </ul>
            <p><strong>Starter plans from R5,000/month.</strong></p>
            <div style="text-align:center;margin:32px 0">
              <a href="mailto:cts.bposolutions@gmail.com"
                 style="background:#1e40af;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:700">
                Contact Us
              </a>
            </div>
            <p>Would you be open to a 15-minute call this week?</p>
            <p>Best regards,<br><strong>The CTS BPO Team</strong></p>
          </div>
          <div style="background:#f1f5f9;padding:16px;text-align:center;font-size:12px;color:#64748b">
            CTS BPO Solutions | cts.bposolutions@gmail.com
          </div>
        </div>
      `,
    };
  },

  followUp: (prospect) => {
    const name = escapeHtml(prospect.name) || 'there';
    return {
      subject: 'Following up – CTS BPO Services',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
          <div style="background:#1e40af;padding:24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:24px">CTS BPO</h1>
          </div>
          <div style="padding:32px">
            <p>Hi ${name},</p>
            <p>I wanted to follow up on my previous email. We'd love to offer you a <strong>free pilot task</strong> so you can experience our quality and speed firsthand — no commitment required.</p>
            <p>Simply reply to this email with a small sample of work and we'll have it completed within 24 hours.</p>
            <p>Best regards,<br><strong>The CTS BPO Team</strong><br>cts.bposolutions@gmail.com</p>
          </div>
        </div>
      `,
    };
  },
};

const VALID_TEMPLATES = Object.keys(templates);

async function sendOutreachEmail(prospect, templateName = 'bpoApplication') {
  if (!prospect || !prospect.email) throw new Error('prospect.email is required');
  if (!VALID_TEMPLATES.includes(templateName)) throw new Error(`Unknown template: ${templateName}`);

  const { subject, html } = templates[templateName](prospect);
  const xport = getTransporter();

  if (xport) {
    const info = await xport.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: prospect.email,
      subject,
      html,
    });
    await auditLogger.log('outreach.sent', 'prospect', null,
      `Email sent to ${prospect.email} (${templateName}): ${info.messageId}`, null, 'info');
    return { sent: true, messageId: info.messageId, to: prospect.email };
  }

  // Stub when Gmail not configured
  console.log('[EMAIL STUB] To:', prospect.email, '| Subject:', subject);
  await auditLogger.log('outreach.simulated', 'prospect', null,
    `Email simulated (Gmail not configured) to ${prospect.email} (${templateName})`, null, 'info');
  return { sent: false, simulated: true, to: prospect.email, subject, reason: 'Gmail App Password not configured' };
}

async function runCampaign(prospects, templateName = 'initialOutreach') {
  const results = { sent: 0, simulated: 0, failed: 0, total: prospects.length };
  for (const prospect of prospects) {
    try {
      const r = await sendOutreachEmail(prospect, templateName);
      if (r.sent) results.sent++; else results.simulated++;
    } catch (err) {
      results.failed++;
      console.error('Outreach failed:', err.message);
    }
  }
  await auditLogger.log('outreach.campaign', null, null,
    `Campaign '${templateName}': ${results.sent} sent, ${results.simulated} simulated, ${results.failed} failed`, null, 'info');
  return results;
}

module.exports = { sendOutreachEmail, runCampaign, templates, isConfigured: () => !!(GMAIL_USER && GMAIL_APP_PASS) };
