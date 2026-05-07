/**
 * LinkedIn Outreach Generator API
 * POST /api/linkedin/generate  — AI message generation via Gemini
 * POST /api/linkedin/prospects — save a prospect record
 * GET  /api/linkedin/prospects — list saved prospects
 */

const express      = require('express');
const axios        = require('axios');
const db           = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const GEMINI_KEY = process.env.GOOGLE_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

// ── Ensure table ──────────────────────────────────────────────────────────────
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS linkedin_prospects (
      id            SERIAL PRIMARY KEY,
      prospect_name TEXT,
      job_title     TEXT,
      company       TEXT,
      industry      TEXT,
      city          TEXT,
      pain_point    TEXT,
      tone          TEXT,
      messages      JSONB,
      status        TEXT DEFAULT 'new',
      notes         TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
}
ensureTable();

// ── Build Gemini prompt ───────────────────────────────────────────────────────
function buildPrompt(f) {
  const pain = f.painPoint === "Custom — I'll describe it below" ? f.customPain : f.painPoint;
  return `You are a senior B2B sales copywriter for CTS BPO Solutions, a South African business process outsourcing company. Write personalised LinkedIn outreach messages and a cold email for the following prospect.

PROSPECT:
- Name: ${f.prospectName}
- Job Title: ${f.jobTitle || 'Decision Maker'}
- Company: ${f.company}
- Industry: ${f.industry}
- City/Region: ${f.city || 'South Africa'}
- Likely Pain Point: ${pain || 'high admin costs and manual back-office work'}
- Tone: ${f.tone || 'professional'}

ABOUT CTS BPO:
- South African BPO company providing data entry, transcription, translation, virtual assistants, customer support, content moderation, document processing, social media management
- AI-powered quality assurance, 98.6% quality rate, 24hr turnaround
- Cost-effective: saves clients 40–70% vs in-house staff
- NDA on every contract, fully confidential
- Contact: cts.bposolutions@gmail.com | +27 76 067 9100

INSTRUCTIONS:
Return ONLY valid JSON with exactly these keys (no markdown, no code fences):
{
  "connectionRequest": "LinkedIn connection request under 300 characters. Personal, specific to their industry, no pitch yet — just a genuine reason to connect.",
  "followUp1": "LinkedIn message to send 3 days after they accept the connection. Soft intro to CTS BPO, reference their industry pain point, end with a low-friction question. 2–3 short paragraphs.",
  "followUp2": "LinkedIn message for day 7 if no reply to followUp1. Shorter, adds a specific value stat or benefit, easy call to action. 1–2 paragraphs.",
  "emailSubject": "Cold email subject line — curiosity-driven, personalised, under 60 characters.",
  "emailBody": "Cold email body. Open with a pain-point hook specific to their industry. Introduce CTS BPO in one sentence. Give 2–3 specific benefits with numbers. Soft CTA (15-minute call or reply). Sign off as Thomas from CTS BPO. 150–200 words."
}`;
}

// ── POST /api/linkedin/generate ───────────────────────────────────────────────
router.post('/generate', requireAuth, async (req, res) => {
  const f = req.body;
  if (!f.prospectName || !f.company || !f.industry) {
    return res.status(400).json({ error: 'prospectName, company and industry are required' });
  }

  if (!GEMINI_KEY) {
    // Fallback — template messages when no API key
    return res.json(fallbackMessages(f));
  }

  try {
    const prompt = buildPrompt(f);
    const resp = await axios.post(GEMINI_URL, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 1200 },
    }, { timeout: 30000 });

    const raw = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Strip markdown fences if present
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let messages;
    try {
      messages = JSON.parse(clean);
    } catch {
      // Try extracting JSON from within the text
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) messages = JSON.parse(match[0]);
      else throw new Error('Could not parse AI response as JSON');
    }
    res.json(messages);
  } catch (e) {
    console.error('[LINKEDIN] Gemini error:', e.message);
    // Return template fallback so the UI always works
    res.json(fallbackMessages(f));
  }
});

// ── POST /api/linkedin/prospects ──────────────────────────────────────────────
router.post('/prospects', requireAuth, async (req, res) => {
  const { prospectName, jobTitle, company, industry, city, painPoint, tone, messages } = req.body;
  try {
    const r = await db.query(
      `INSERT INTO linkedin_prospects (prospect_name, job_title, company, industry, city, pain_point, tone, messages)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [prospectName, jobTitle, company, industry, city, painPoint, tone, JSON.stringify(messages)]
    );
    res.json({ success: true, id: r.rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/linkedin/prospects ───────────────────────────────────────────────
router.get('/prospects', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      'SELECT id, prospect_name, job_title, company, industry, city, status, created_at FROM linkedin_prospects ORDER BY created_at DESC LIMIT 200'
    );
    res.json({ prospects: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/linkedin/prospects/:id ────────────────────────────────────────
router.patch('/prospects/:id', requireAuth, async (req, res) => {
  const { status, notes } = req.body;
  try {
    await db.query('UPDATE linkedin_prospects SET status=$1, notes=$2 WHERE id=$3', [status, notes, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Template fallback (no Gemini) ─────────────────────────────────────────────
function fallbackMessages(f) {
  const pain = f.painPoint === "Custom — I'll describe it below" ? f.customPain : f.painPoint;
  const name = f.prospectName.split(' ')[0];
  return {
    connectionRequest: `Hi ${name}, I came across ${f.company} and noticed your work in the ${f.industry} space. I'd love to connect — we help ${f.industry} businesses cut admin costs significantly. Thomas @ CTS BPO`,
    followUp1: `Hi ${name},\n\nThanks for connecting! I wanted to reach out because we work with a number of ${f.industry} businesses dealing with ${pain || 'high back-office costs and manual processing'}.\n\nAt CTS BPO Solutions, we handle data entry, transcription, document processing and virtual assistant work — typically saving clients 40–70% compared to in-house staff, with a 98.6% quality rate and 24hr turnaround.\n\nWould this be relevant to what you're working on at ${f.company}? Happy to share more if so.`,
    followUp2: `Hi ${name},\n\nJust a quick follow-up — I know things get busy.\n\nOne stat that tends to resonate: our clients in ${f.industry} typically recover their outsourcing cost within the first month through staff time saved.\n\nWould a 15-minute call this week make sense? No pressure — just a quick conversation to see if there's a fit.\n\nThomas | CTS BPO Solutions | cts.bposolutions@gmail.com`,
    emailSubject: `Cutting ${f.company}'s admin costs by 40–70%`,
    emailBody: `Hi ${name},\n\nRunning ${f.industry} operations means your team is likely spending significant time on ${pain || 'manual back-office tasks'} that pull them away from higher-value work.\n\nAt CTS BPO Solutions, we take on exactly that work — data entry, transcription, document processing, translation and virtual assistant support — at a fraction of in-house cost.\n\nWhat our clients typically see:\n• 40–70% cost reduction vs. in-house processing\n• 98.6% quality accuracy rate across all contracts\n• 24–48 hour turnaround on standard projects\n• Full NDA and POPIA compliance on every contract\n\nWe'd love to offer ${f.company} a small trial project at no commitment — so you can see the quality before committing to volume.\n\nWould a 15-minute call this week work? Reply to this email or reach me on +27 76 067 9100.\n\nBest regards,\nThomas\nCTS BPO Solutions\ncts.bposolutions@gmail.com`,
  };
}

module.exports = router;
