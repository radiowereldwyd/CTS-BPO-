/**
 * Contact / Quote Form API
 * POST /api/contact  — public, saves enquiry + sends notification email
 * GET  /api/contact  — admin, list all enquiries
 */
const express = require('express');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');
const emailOutreach   = require('../modules/email-outreach');

const router = express.Router();

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS contact_enquiries (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT NOT NULL,
      company     TEXT,
      phone       TEXT,
      service     TEXT,
      volume      TEXT,
      message     TEXT,
      status      TEXT DEFAULT 'new',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
}
ensureTable();

// ── POST /api/contact ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, email, company, phone, service, volume, message } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email are required' });

  try {
    await db.query(
      `INSERT INTO contact_enquiries (name, email, company, phone, service, volume, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [name, email, company || '', phone || '', service || '', volume || '', message || '']
    );

    // Notify admin
    const adminEmail = process.env.ADMIN_EMAIL || 'cts.cybersolutions@gmail.com';
    await emailOutreach.sendRaw({
      to: adminEmail,
      subject: `🔔 New Quote Request — ${company || name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:12px">
          <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);border-radius:10px;padding:24px;margin-bottom:24px;text-align:center">
            <h2 style="color:#fff;margin:0;font-size:22px">New Quote Request</h2>
          </div>
          <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
            ${[['Name', name],['Email', email],['Company', company||'—'],['Phone', phone||'—'],['Service', service||'—'],['Monthly Volume', volume||'—']].map(([k,v])=>`
            <tr><td style="padding:12px 20px;background:#f1f5f9;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;width:140px;border-bottom:1px solid #e2e8f0">${k}</td>
                <td style="padding:12px 20px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0">${v}</td></tr>`).join('')}
            <tr><td style="padding:12px 20px;background:#f1f5f9;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;vertical-align:top">Message</td>
                <td style="padding:12px 20px;font-size:14px;color:#0f172a;line-height:1.7">${(message||'—').replace(/\n/g,'<br>')}</td></tr>
          </table>
          <p style="margin:20px 0 0;font-size:13px;color:#64748b;text-align:center">Reply directly to this email to respond to ${name}</p>
        </div>
      `,
      replyTo: email,
    }).catch(() => {});

    // Auto-acknowledge the enquirer
    await emailOutreach.sendRaw({
      to: email,
      subject: `We received your enquiry — CTS BPO Solutions`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:12px">
          <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);border-radius:10px;padding:28px;margin-bottom:24px;text-align:center">
            <img src="https://cts-bpo.replit.app/cts-bpo-logo-nobg.png" alt="CTS BPO" style="height:50px;width:auto;margin-bottom:12px" />
            <h2 style="color:#fff;margin:0;font-size:22px">Thank you, ${name}!</h2>
          </div>
          <p style="font-size:15px;color:#374151;line-height:1.8">We've received your quote request${company ? ` for <strong>${company}</strong>` : ''} and will respond within <strong>2 business hours</strong>.</p>
          <div style="background:#fff;border-radius:10px;padding:20px 24px;margin:20px 0;border-left:4px solid #6366f1">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#6366f1;text-transform:uppercase">Service requested</p>
            <p style="margin:0;font-size:15px;color:#0f172a;font-weight:600">${service || 'General Enquiry'}</p>
          </div>
          <p style="font-size:14px;color:#374151;line-height:1.8">In the meantime, if you have any urgent requirements, you can reach us directly:</p>
          <div style="text-align:center;margin:24px 0">
            <a href="mailto:cts.bposolutions@gmail.com" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;margin:0 8px">📧 cts.bposolutions@gmail.com</a>
            <a href="https://wa.me/27760679100" style="display:inline-block;background:#25d366;color:#fff;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;margin:0 8px">💬 WhatsApp Us</a>
          </div>
          <p style="font-size:13px;color:#94a3b8;text-align:center;margin-top:24px">CTS BPO Solutions · South Africa's Worldwide BPO Partner</p>
        </div>
      `,
    }).catch(() => {});

    res.json({ success: true });
  } catch (e) {
    console.error('[CONTACT]', e.message);
    res.status(500).json({ error: 'Could not save enquiry' });
  }
});

// ── GET /api/contact ──────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM contact_enquiries ORDER BY created_at DESC LIMIT 200');
    res.json({ enquiries: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/contact/:id ────────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('UPDATE contact_enquiries SET status=$1 WHERE id=$2', [req.body.status, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
