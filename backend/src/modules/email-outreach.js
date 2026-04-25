/**
 * AI Email Outreach Module
 * Sends automated prospect outreach emails via nodemailer (SMTP/SendGrid).
 * Falls back to console logging when SMTP is not configured.
 */

const nodemailer = require('nodemailer');
const auditLogger = require('./audit-logger');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@ctsbpo.com';
const FROM_NAME = process.env.FROM_NAME || 'CTS BPO';

let transporter = null;

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

/**
 * Email templates.
 */
const templates = {
  initialOutreach: (prospect) => ({
    subject: `Transform Your Business Processes with AI – CTS BPO`,
    html: `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
        <div style="background:#1e40af;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:24px">CTS BPO</h1>
          <p style="color:#93c5fd;margin:8px 0 0">AI-Driven Business Process Outsourcing</p>
        </div>
        <div style="padding:32px">
          <p>Hi ${prospect.name || 'there'},</p>
          <p>I'm reaching out because we help businesses like <strong>${prospect.company || 'yours'}</strong>
             reduce operational costs by up to 60% using our AI-powered BPO platform.</p>
          <h3 style="color:#1e40af">What we offer:</h3>
          <ul>
            <li>✅ AI-driven contract management &amp; negotiation</li>
            <li>✅ Automated subcontractor assignment</li>
            <li>✅ Integrated Ozow payment processing</li>
            <li>✅ Full audit trail &amp; POPIA compliance</li>
          </ul>
          <p><strong>Starter plans from R5,000/month.</strong></p>
          <div style="text-align:center;margin:32px 0">
            <a href="https://ctsbpo.com/pricing"
               style="background:#1e40af;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:700">
              View Pricing
            </a>
          </div>
          <p>Would you be open to a 15-minute call this week?</p>
          <p>Best regards,<br><strong>The CTS BPO Team</strong></p>
        </div>
        <div style="background:#f1f5f9;padding:16px;text-align:center;font-size:12px;color:#64748b">
          CTS BPO | South Africa | admin@ctsbpo.com<br>
          <a href="https://ctsbpo.com/unsubscribe" style="color:#64748b">Unsubscribe</a>
        </div>
      </div>
    `,
  }),

  followUp: (prospect) => ({
    subject: `Following up – CTS BPO AI Platform`,
    html: `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
        <div style="background:#1e40af;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:24px">CTS BPO</h1>
        </div>
        <div style="padding:32px">
          <p>Hi ${prospect.name || 'there'},</p>
          <p>I wanted to follow up on my previous email about how CTS BPO can help streamline your operations.</p>
          <p>Many of our clients see ROI within the first 90 days. I'd love to show you a quick demo.</p>
          <p>Best regards,<br><strong>The CTS BPO Team</strong></p>
        </div>
      </div>
    `,
  }),
};

const VALID_TEMPLATES = ['initialOutreach', 'followUp'];

/**
 * Send an outreach email to a prospect.
 * @param {object} prospect - { name, email, company }
 * @param {'initialOutreach'|'followUp'} templateName
 * @returns {object} result
 */
async function sendOutreachEmail(prospect, templateName = 'initialOutreach') {
  if (!prospect || !prospect.email) {
    throw new Error('prospect.email is required');
  }

  if (!VALID_TEMPLATES.includes(templateName)) {
    throw new Error(`Unknown email template: ${templateName}`);
  }

  const templateFn = templateName === 'initialOutreach' ? templates.initialOutreach : templates.followUp;
  const { subject, html } = templateFn(prospect);

  if (transporter) {
    const info = await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: prospect.email,
      subject,
      html,
    });
    await auditLogger.log(
      'outreach.sent',
      'prospect',
      null,
      `Email sent to ${prospect.email} (${templateName}): ${info.messageId}`,
      null,
      'info'
    );
    return { sent: true, messageId: info.messageId, to: prospect.email };
  }

  // Console stub when SMTP not configured
  console.log(`[EMAIL STUB] To: ${prospect.email} | Subject: ${subject}`);
  await auditLogger.log(
    'outreach.simulated',
    'prospect',
    null,
    `Email simulated (no SMTP) to ${prospect.email} (${templateName})`,
    null,
    'info'
  );
  return { sent: false, simulated: true, to: prospect.email, subject };
}

/**
 * Run an outreach campaign for a list of prospects.
 * @param {Array<{name:string, email:string, company:string}>} prospects
 * @param {'initialOutreach'|'followUp'} templateName
 * @returns {object} campaign summary
 */
async function runCampaign(prospects, templateName = 'initialOutreach') {
  const results = { sent: 0, simulated: 0, failed: 0, total: prospects.length };

  for (const prospect of prospects) {
    try {
      const result = await sendOutreachEmail(prospect, templateName);
      if (result.sent) results.sent++;
      else if (result.simulated) results.simulated++;
    } catch (err) {
      results.failed++;
      console.error(`Outreach failed for ${prospect.email}:`, err.message);
    }
  }

  await auditLogger.log(
    'outreach.campaign',
    null,
    null,
    `Campaign '${templateName}' complete: ${results.sent} sent, ${results.simulated} simulated, ${results.failed} failed`,
    null,
    'info'
  );

  return results;
}

module.exports = { sendOutreachEmail, runCampaign, templates };
