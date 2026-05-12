'use strict';

/**
 * CTS BPO — AI Negotiation & Quote Engine
 *
 * Fully autonomous:
 *  1. Reads client messages (email or Freelancer) with Gemini AI
 *  2. Extracts service type, scope signals, budget hints
 *  3. Generates a personalised, itemised quote with exact pricing
 *  4. Negotiates counter-offers intelligently
 *  5. Records win/loss outcomes — learns over time to improve pricing strategy
 *  6. Market intelligence: tracks demand, competitor signals, win rates
 */

const axios = require('axios');
const db    = require('../db');

const GOOGLE_API_KEY = () => process.env.GOOGLE_API_KEY || '';
const APP_URL        = process.env.APP_URL || 'https://cts-bpo.replit.app';

// ── Pricing matrix (our standard rates — AI adjusts within floor/ceiling) ──
const PRICING = {
  'data-entry':          { unit: 'record',       floor: 0.06, target: 0.10, ceil: 0.18, minJob: 25 },
  'transcription':       { unit: 'audio minute', floor: 0.75, target: 1.10, ceil: 1.80, minJob: 30 },
  'translation':         { unit: 'word',         floor: 0.07, target: 0.12, ceil: 0.20, minJob: 50 },
  'virtual-assistant':   { unit: 'hour',         floor: 7,    target: 10,   ceil: 18,   minJob: 50 },
  'customer-support':    { unit: 'hour',         floor: 8,    target: 12,   ceil: 20,   minJob: 80 },
  'document-processing': { unit: 'document',     floor: 0.40, target: 0.80, ceil: 1.50, minJob: 30 },
  'finance-admin':       { unit: 'hour',         floor: 10,   target: 15,   ceil: 25,   minJob: 100 },
  'content-moderation':  { unit: 'item',         floor: 0.04, target: 0.08, ceil: 0.15, minJob: 50 },
  'research':            { unit: 'hour',         floor: 8,    target: 12,   ceil: 20,   minJob: 40 },
  'general':             { unit: 'hour',         floor: 8,    target: 12,   ceil: 18,   minJob: 40 },
};

// ── Scope signal extraction (regexp-based — fast, no API cost) ─────────────
function extractScopeSignals(text) {
  const t = text || '';
  const signals = {};

  // Record / item count
  const records = t.match(/(\d[\d,]*)\s*(?:records?|rows?|entries|items?|contacts?|leads?|products?|lines?)/i);
  if (records) signals.recordCount = parseInt(records[1].replace(/,/g, ''));

  // Audio/video duration
  const minutes = t.match(/(\d+)\s*(?:min(?:utes?)?|mins?)/i);
  const hours   = t.match(/(\d+)\s*hours?\s*(?:of\s*)?(?:audio|video|recording|footage)/i);
  if (minutes) signals.audioMinutes = parseInt(minutes[1]);
  if (hours)   signals.audioMinutes = parseInt(hours[1]) * 60;

  // Word count
  const words = t.match(/(\d[\d,]*)\s*words?/i);
  if (words) signals.wordCount = parseInt(words[1].replace(/,/g, ''));

  // Pages / documents
  const pages = t.match(/(\d+)\s*(?:pages?|docs?|documents?|files?|pdfs?)/i);
  if (pages) signals.pageCount = parseInt(pages[1]);

  // Hours per week / month
  const hoursPerWeek = t.match(/(\d+)\s*hours?\s*(?:per|a)\s*week/i);
  const hoursPerMonth= t.match(/(\d+)\s*hours?\s*(?:per|a)\s*month/i);
  if (hoursPerWeek)  signals.hoursPerWeek  = parseInt(hoursPerWeek[1]);
  if (hoursPerMonth) signals.hoursPerMonth = parseInt(hoursPerMonth[1]);

  // Budget signals
  const budget = t.match(/\$\s*(\d[\d,.]*)/);
  const budget2= t.match(/budget[:\s]+(?:USD?|£|€)?\s*(\d[\d,.]*)/i);
  const budget3= t.match(/(\d[\d,]*)\s*(?:USD|dollars?|GBP|pounds?|EUR)/i);
  const raw = budget || budget2 || budget3;
  if (raw) signals.budgetHint = parseFloat(raw[1].replace(/,/g, ''));

  // Timeline urgency
  if (/urgent|asap|immediately|rush|24.?hour|today|tonight/i.test(t)) signals.urgent = true;
  if (/ongoing|monthly|retainer|long.?term|permanent|regular/i.test(t)) signals.recurring = true;

  return signals;
}

// ── Detect service type from text ──────────────────────────────────────────
function detectServiceType(text) {
  const t = (text || '').toLowerCase();
  if (/transcri|transcript|audio.to.text|video.to.text|srt|caption|subtitl/i.test(t)) return 'transcription';
  if (/translat|interpret|multilingual|locali|language.pair/i.test(t)) return 'translation';
  if (/data.entr|data.input|copy.typ|spreadsheet|excel|pdf.to|form.fill|ocr|digitiz|scraping|list.build/i.test(t)) return 'data-entry';
  if (/virtual.assist|admin.assist|personal.assist|inbox.manag|calendar|scheduling|research/i.test(t)) return 'virtual-assistant';
  if (/customer.support|customer.service|help.desk|ticket|live.chat|support.agent|email.support/i.test(t)) return 'customer-support';
  if (/bookkeep|accounts.payable|accounts.receivable|payroll|invoice.entry|bank.reconcil|xero|quickbooks/i.test(t)) return 'finance-admin';
  if (/content.moderat|content.review|trust.and.safety|ugc|review.submiss/i.test(t)) return 'content-moderation';
  if (/document.process|invoice.process|pdf.extract|document.digit|document.review|contract.review/i.test(t)) return 'document-processing';
  if (/research|internet.research|web.research|data.collect|online.research/i.test(t)) return 'research';
  return 'general';
}

// ── Build quote with itemisation ───────────────────────────────────────────
function buildQuote(serviceType, scopeSignals, budgetHint) {
  const p = PRICING[serviceType] || PRICING['general'];
  let quantity = 0, unitPrice = p.target, unit = p.unit, totalPrice = 0;

  // Determine quantity and price based on scope signals
  if (serviceType === 'data-entry') {
    quantity  = scopeSignals.recordCount || 500;
    // If budget hint exists, back-calculate unit price (within floor/ceil)
    unitPrice = budgetHint ? Math.min(p.ceil, Math.max(p.floor, budgetHint / quantity)) : p.target;
    totalPrice = Math.max(p.minJob, quantity * unitPrice);
  } else if (serviceType === 'transcription') {
    quantity  = scopeSignals.audioMinutes || 60;
    unitPrice = budgetHint ? Math.min(p.ceil, Math.max(p.floor, budgetHint / quantity)) : p.target;
    totalPrice = Math.max(p.minJob, quantity * unitPrice);
  } else if (serviceType === 'translation') {
    quantity  = scopeSignals.wordCount || 1000;
    unitPrice = budgetHint ? Math.min(p.ceil, Math.max(p.floor, budgetHint / quantity)) : p.target;
    totalPrice = Math.max(p.minJob, quantity * unitPrice);
  } else if (['virtual-assistant', 'customer-support', 'finance-admin', 'research', 'general'].includes(serviceType)) {
    quantity  = scopeSignals.hoursPerWeek ? scopeSignals.hoursPerWeek * 4 // monthly
              : scopeSignals.hoursPerMonth || 20;
    unitPrice = budgetHint ? Math.min(p.ceil, Math.max(p.floor, budgetHint / quantity)) : p.target;
    unit = 'hour';
    totalPrice = Math.max(p.minJob, quantity * unitPrice);
  } else if (serviceType === 'document-processing') {
    quantity  = scopeSignals.pageCount || scopeSignals.recordCount || 100;
    unitPrice = budgetHint ? Math.min(p.ceil, Math.max(p.floor, budgetHint / quantity)) : p.target;
    totalPrice = Math.max(p.minJob, quantity * unitPrice);
  } else if (serviceType === 'content-moderation') {
    quantity  = scopeSignals.recordCount || 1000;
    unitPrice = budgetHint ? Math.min(p.ceil, Math.max(p.floor, budgetHint / quantity)) : p.target;
    totalPrice = Math.max(p.minJob, quantity * unitPrice);
  }

  // Apply urgency premium
  if (scopeSignals.urgent) unitPrice *= 1.25;
  if (scopeSignals.recurring) totalPrice *= 0.90; // 10% recurring discount

  totalPrice = Math.round(totalPrice * 100) / 100;
  unitPrice  = Math.round(unitPrice * 1000) / 1000;
  quantity   = Math.round(quantity);

  return { serviceType, quantity, unit, unitPrice, totalPrice, urgent: !!scopeSignals.urgent, recurring: !!scopeSignals.recurring };
}

// ── Format quote as a readable message ────────────────────────────────────
function formatQuoteMessage(quote, clientName, projectTitle, platform = 'email') {
  const { serviceType, quantity, unit, unitPrice, totalPrice, urgent, recurring } = quote;
  const name  = (clientName || '').split(' ')[0] || 'there';
  const proj  = projectTitle ? `"${projectTitle}"` : 'your project';
  const greet = platform === 'freelancer' ? `Hi ${name},\n\n` : `<p>Hi ${name},</p>\n`;

  const serviceLabels = {
    'data-entry':          'Data Entry & Processing',
    'transcription':       'Audio/Video Transcription',
    'translation':         'Document Translation',
    'virtual-assistant':   'Virtual Assistant Services',
    'customer-support':    'Customer Support',
    'document-processing': 'Document Processing',
    'finance-admin':       'Finance & Admin Support',
    'content-moderation':  'Content Moderation',
    'research':            'Online Research',
    'general':             'BPO Services',
  };
  const serviceLabel = serviceLabels[serviceType] || 'BPO Services';

  const timeline = urgent ? '24–48 hours (rush)' : serviceType.includes('assist') ? '5 business days to onboard' : '48–72 hours';
  const recurringNote = recurring ? ' (10% ongoing discount applied)' : '';

  if (platform === 'freelancer') {
    return `Hi ${name},

Thank you for posting ${proj}. Based on your requirements, here is our tailored quote:

─────────────────────────────
📋 SERVICE: ${serviceLabel}
📦 SCOPE: ${quantity.toLocaleString()} ${unit}${quantity !== 1 ? 's' : ''}
💰 RATE: $${unitPrice} per ${unit}
💵 TOTAL: $${totalPrice.toFixed(2)}${recurringNote}
⏱ DELIVERY: ${timeline}
─────────────────────────────

What's included:
✅ AI-assisted processing for speed & accuracy
✅ Human quality review on every deliverable
✅ Unlimited revisions until you're 100% satisfied
✅ First task FREE — no risk, no upfront payment${urgent ? '\n✅ Rush delivery — prioritised in our queue' : ''}${recurring ? '\n✅ Dedicated account manager for ongoing work' : ''}

We can start immediately upon award. If the scope differs from what I've quoted (more or less volume), just let me know and I'll adjust the price accordingly.

Does this work for you, or would you like to negotiate any aspect?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing`.trim();
  }

  // HTML email version
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;color:#1e293b">
  <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:28px 32px;border-radius:12px 12px 0 0;color:#fff">
    <h2 style="margin:0 0 6px">Your CTS BPO Quote</h2>
    <p style="margin:0;opacity:0.85;font-size:14px">${serviceLabel} — personalised for you</p>
  </div>
  <div style="background:#fff;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none">
    <p>Hi ${name},</p>
    <p>Based on your requirements for ${proj}, here is our tailored quote:</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin:20px 0">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#64748b;font-weight:600">Service</td><td style="padding:8px 0;font-weight:700;color:#0f172a">${serviceLabel}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-weight:600">Scope</td><td style="padding:8px 0;color:#0f172a">${quantity.toLocaleString()} ${unit}${quantity !== 1 ? 's' : ''}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-weight:600">Rate</td><td style="padding:8px 0;color:#0f172a">$${unitPrice} per ${unit}</td></tr>
        <tr style="border-top:1px solid #e2e8f0"><td style="padding:12px 0;color:#0f172a;font-weight:800;font-size:16px">Total</td><td style="padding:12px 0;color:#2563eb;font-weight:900;font-size:18px">$${totalPrice.toFixed(2)}${recurringNote}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-weight:600">Delivery</td><td style="padding:8px 0;color:#0f172a">${timeline}</td></tr>
      </table>
    </div>

    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 18px;margin:16px 0">
      <strong style="color:#16a34a">What's included:</strong>
      <ul style="margin:8px 0 0;padding-left:20px;color:#166534;font-size:13px">
        <li>AI-assisted processing — fast and accurate</li>
        <li>Human QC pass on every deliverable</li>
        <li>Unlimited revisions until you're 100% satisfied</li>
        <li><strong>First task is completely FREE</strong> — no risk, judge quality first</li>
        ${urgent ? '<li>Rush priority — we start within 2 hours</li>' : ''}
        ${recurring ? '<li>Dedicated account manager for ongoing work</li>' : ''}
      </ul>
    </div>

    <p>If the scope is different from what I've quoted, just reply with the exact volume and I'll adjust the price. Happy to negotiate.</p>

    <div style="text-align:center;margin:24px 0">
      <a href="${APP_URL}/client/portal" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;text-decoration:none;padding:14px 36px;border-radius:9px;font-weight:700;font-size:15px">Accept & Start Free Trial →</a>
    </div>

    <hr style="border-color:#f1f5f9;margin:20px 0">
    <p><strong>Thandeka Mokoena</strong><br>CTS BPO Solutions<br>
    <a href="https://wa.me/27760679100" style="color:#25d366;font-weight:700;text-decoration:none">💬 WhatsApp: +27 76 067 9100</a></p>
  </div>
</div>`.trim();
}

// ── Gemini AI: parse client message for intent + scope ─────────────────────
async function geminiAnalyze(message, context = '') {
  if (!GOOGLE_API_KEY()) return null;
  try {
    const prompt = `You are a BPO sales analyst. Analyse this client message and extract structured data.

Context: ${context || 'Client replied to a CTS BPO outreach email about outsourcing services.'}

Client message:
"${message.slice(0, 1500)}"

Return ONLY a JSON object (no markdown, no explanation):
{
  "intent": "quote_request|interested|negotiating|price_pushback|rejection|question|out_of_office|award|needs_clarification",
  "serviceType": "data-entry|transcription|translation|virtual-assistant|customer-support|document-processing|finance-admin|content-moderation|research|general",
  "scopeDetails": "brief description of scope they mentioned",
  "budgetHint": null_or_number,
  "urgency": "normal|urgent|flexible",
  "keyQuestion": "the main question or concern they have, or null",
  "sentiment": "positive|neutral|negative"
}`;

    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY()}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 15000 }
    );
    const raw = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch { return null; }
}

// ── Gemini AI: generate a negotiation response ────────────────────────────
async function geminiNegotiate({ clientMessage, previousQuote, analysis, clientName, projectTitle, platform }) {
  if (!GOOGLE_API_KEY()) return null;
  try {
    const quoteContext = previousQuote
      ? `We previously quoted: $${previousQuote.totalPrice} for ${previousQuote.quantity} ${previousQuote.unit}s at $${previousQuote.unitPrice} per ${previousQuote.unit}.`
      : 'No previous quote sent yet.';

    const prompt = `You are Thandeka Mokoena from CTS BPO Solutions (South Africa). You are a skilled sales negotiator.

Client: "${clientName || 'the client'}"
Project: "${projectTitle || 'their BPO project'}"
${quoteContext}
Their intent: ${analysis?.intent || 'unknown'}
Their message: "${clientMessage.slice(0, 800)}"
Platform: ${platform || 'email'}

Write a concise, professional reply (max 150 words for Freelancer, 200 for email) that:
- Addresses their specific concern or question directly
- If they want a lower price: offer a 10-15% discount OR break the scope into a smaller starter package
- If they asked a question: answer it clearly and re-confirm interest
- If they seem interested: push gently for commitment with a specific call to action
- If they accepted/awarded: thank them warmly and ask for the files/requirements immediately
- Maintain a warm, confident tone — we are the experts they need
- End with a specific next step or question
- Do NOT use bullet points for Freelancer (plain text only)
- Sign off as Thandeka Mokoena | CTS BPO

Write ONLY the reply message — no labels, no JSON.`;

    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY()}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 15000 }
    );
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch { return null; }
}

// ── DB: ensure negotiation tables ─────────────────────────────────────────
async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_negotiations (
      id              SERIAL PRIMARY KEY,
      platform        TEXT NOT NULL,               -- 'email' | 'freelancer'
      contact_ref     TEXT NOT NULL,               -- email or fl_thread_id
      client_name     TEXT,
      project_title   TEXT,
      service_type    TEXT,
      quote_amount    NUMERIC,
      quote_unit      TEXT,
      quote_quantity  INTEGER,
      messages_count  INTEGER DEFAULT 1,
      status          TEXT DEFAULT 'quoting',      -- 'quoting'|'negotiating'|'won'|'lost'|'no_response'
      final_price     NUMERIC,
      last_message    TEXT,
      last_reply      TEXT,
      won_at          TIMESTAMPTZ,
      lost_at         TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_ain_ref ON ai_negotiations(contact_ref)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_ain_status ON ai_negotiations(status)`);

  // Market intelligence table
  await db.query(`
    CREATE TABLE IF NOT EXISTS market_intelligence (
      id            SERIAL PRIMARY KEY,
      service_type  TEXT NOT NULL,
      signal        TEXT NOT NULL,                 -- 'win'|'loss'|'demand'|'price_sensitivity'
      price         NUMERIC,
      notes         TEXT,
      recorded_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_mi_service ON market_intelligence(service_type, signal)`);

  // FL proactive scout table — tracks which projects we've already messaged
  await db.query(`
    CREATE TABLE IF NOT EXISTS fl_scout_sent (
      project_id  BIGINT PRIMARY KEY,
      sent_at     TIMESTAMPTZ DEFAULT NOW(),
      replied     BOOLEAN DEFAULT FALSE
    )
  `);
}

// ── Record negotiation outcome ────────────────────────────────────────────
async function recordOutcome(contactRef, outcome, finalPrice, serviceType) {
  await db.query(
    `UPDATE ai_negotiations SET status=$1, final_price=$2, ${outcome === 'won' ? 'won_at' : 'lost_at'}=NOW(), updated_at=NOW()
     WHERE contact_ref=$3`,
    [outcome, finalPrice || null, contactRef]
  ).catch(() => {});

  // Record market signal
  await db.query(
    `INSERT INTO market_intelligence (service_type, signal, price) VALUES ($1,$2,$3)`,
    [serviceType || 'general', outcome, finalPrice || null]
  ).catch(() => {});

  console.log(`[NEGOTIATOR] 📊 Outcome recorded: ${outcome} for ${contactRef} (${serviceType} @ $${finalPrice || 'n/a'})`);
}

// ── Main: handle an incoming client message ───────────────────────────────
async function handleClientMessage({ platform, contactRef, clientMessage, clientName, projectTitle, previousNegotiation }) {
  await ensureTables();

  const context = `Platform: ${platform}. ${projectTitle ? `Project: "${projectTitle}".` : ''}`;
  const analysis = await geminiAnalyze(clientMessage, context);

  const serviceType = analysis?.serviceType || detectServiceType(clientMessage);
  const budgetHint  = analysis?.budgetHint  || extractScopeSignals(clientMessage).budgetHint;
  const scopeSignals = extractScopeSignals(clientMessage);
  if (budgetHint) scopeSignals.budgetHint = budgetHint;
  if (analysis?.urgency === 'urgent') scopeSignals.urgent = true;

  const intent = analysis?.intent || 'unknown';
  console.log(`[NEGOTIATOR] Message from ${contactRef} | intent:${intent} | service:${serviceType} | budget:${budgetHint || 'unknown'}`);

  // Record/update negotiation in DB
  const existing = await db.query(
    `SELECT * FROM ai_negotiations WHERE contact_ref=$1 ORDER BY created_at DESC LIMIT 1`,
    [contactRef]
  );

  let negotiation = existing.rows[0] || null;
  let quote = null;
  let reply = null;

  // ── Handle win/acceptance ─────────────────────────────────────────────
  if (intent === 'award' || /thank.*award|hired|you.*got.*job|let.*proceed|accepted|start.*immediately|go.*ahead|proceed/i.test(clientMessage)) {
    if (negotiation) {
      await recordOutcome(contactRef, 'won', negotiation.quote_amount, negotiation.service_type);
    }
    reply = await geminiNegotiate({ clientMessage, previousQuote: negotiation, analysis, clientName, projectTitle, platform });
    if (!reply) {
      reply = `Excellent news! Thank you for awarding us the project — we are thrilled to get started.\n\nPlease share the source files, detailed requirements, and any access credentials or templates you'd like us to use. We will confirm receipt and provide a delivery timeline within 2 hours.\n\nBest regards,\nThandeka Mokoena | CTS BPO`;
    }

  // ── Handle rejection/unsubscribe ──────────────────────────────────────
  } else if (intent === 'rejection' || /not.interested|unsubscribe|remove|stop.contact|no.thanks|not.right.now/i.test(clientMessage)) {
    if (negotiation) {
      await recordOutcome(contactRef, 'lost', null, negotiation?.service_type);
    }
    reply = null; // do not reply to rejections

  // ── Quote request or strong interest — generate & send quote ─────────
  } else if (intent === 'quote_request' || intent === 'interested' || !negotiation) {
    quote = buildQuote(serviceType, scopeSignals, budgetHint);
    reply = formatQuoteMessage(quote, clientName, projectTitle, platform);

    // Save negotiation record
    if (!negotiation) {
      await db.query(
        `INSERT INTO ai_negotiations (platform, contact_ref, client_name, project_title, service_type, quote_amount, quote_unit, quote_quantity, last_message, last_reply, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'quoting')`,
        [platform, contactRef, clientName || null, projectTitle || null, serviceType, quote.totalPrice, quote.unit, quote.quantity, clientMessage.slice(0, 500), 'quote_sent']
      ).catch(() => {});
    } else {
      await db.query(
        `UPDATE ai_negotiations SET service_type=$1, quote_amount=$2, quote_unit=$3, messages_count=messages_count+1, last_message=$4, last_reply='quote_sent', status='quoting', updated_at=NOW() WHERE id=$5`,
        [serviceType, quote.totalPrice, quote.unit, clientMessage.slice(0, 500), negotiation.id]
      ).catch(() => {});
    }

  // ── Price pushback — negotiate ─────────────────────────────────────────
  } else if (intent === 'price_pushback' || intent === 'negotiating') {
    const prevQuote = negotiation ? { totalPrice: negotiation.quote_amount, unit: negotiation.quote_unit, quantity: negotiation.quote_quantity, unitPrice: negotiation.quote_amount / (negotiation.quote_quantity || 1) } : null;
    reply = await geminiNegotiate({ clientMessage, previousQuote: prevQuote, analysis, clientName, projectTitle, platform });

    if (!reply) {
      const discountedPrice = prevQuote ? Math.round(prevQuote.totalPrice * 0.88 * 100) / 100 : null;
      reply = platform === 'freelancer'
        ? `Hi ${(clientName || '').split(' ')[0] || 'there'},\n\nI understand — let me work with your budget. I can offer a 12% discount, bringing the total to $${discountedPrice || 'adjusted'}, and we can start with a smaller batch to prove quality before scaling up.\n\nWould that work for you?\n\nBest regards,\nThandeka Mokoena | CTS BPO`
        : `Hi,<br><br>I completely understand — let me adjust. I can offer a <strong>12% discount</strong>, bringing your total to <strong>$${discountedPrice || 'adjusted'}</strong>.<br><br>Alternatively, we can start with a smaller pilot batch at no cost so you can evaluate quality first, then proceed with the full scope.<br><br>Which option works better for you?<br><br>Best regards,<br><strong>Thandeka Mokoena</strong> | CTS BPO`;
    }

    await db.query(
      `UPDATE ai_negotiations SET status='negotiating', messages_count=messages_count+1, last_message=$1, updated_at=NOW() WHERE id=$2`,
      [clientMessage.slice(0, 500), negotiation?.id]
    ).catch(() => {});

    await db.query(`INSERT INTO market_intelligence (service_type, signal, notes) VALUES ($1,'price_sensitivity',$2)`,
      [serviceType, `Budget pushback: ${clientMessage.slice(0, 100)}`]).catch(() => {});

  // ── Question / needs clarification ────────────────────────────────────
  } else if (intent === 'question' || intent === 'needs_clarification') {
    reply = await geminiNegotiate({ clientMessage, previousQuote: negotiation, analysis, clientName, projectTitle, platform });
    if (!reply) {
      reply = platform === 'freelancer'
        ? `Hi ${(clientName || '').split(' ')[0] || 'there'},\n\nGreat question — happy to clarify. Our process is: you share the requirements → we process using AI-assisted tools → human QC review → delivery.\n\nWe guarantee accuracy and include unlimited revisions. Could you share more about your volume and timeline so I can give you a precise quote?\n\nBest,\nThandeka Mokoena | CTS BPO`
        : `Hi,<br><br>Happy to clarify! Our process is simple: you share the files/requirements → we process using AI tools + human QC → you receive clean, accurate output with unlimited revisions.<br><br>Could you share the volume and your target delivery date? I can then give you a precise quote and timeline.<br><br>Best regards,<br><strong>Thandeka Mokoena</strong> | CTS BPO`;
    }
    await db.query(`UPDATE ai_negotiations SET messages_count=messages_count+1, last_message=$1, updated_at=NOW() WHERE id=$2`,
      [clientMessage.slice(0, 500), negotiation?.id]).catch(() => {});
  }

  return { intent, serviceType, quote, reply, analysis };
}

// ── Market intelligence summary ────────────────────────────────────────────
async function getMarketIntelligence() {
  await ensureTables();
  const [wins, losses, sensitivity, negotiations, byService] = await Promise.all([
    db.query(`SELECT COUNT(*) AS c, AVG(price) AS avg_price FROM market_intelligence WHERE signal='won'`),
    db.query(`SELECT COUNT(*) AS c FROM market_intelligence WHERE signal='lost'`),
    db.query(`SELECT COUNT(*) AS c FROM market_intelligence WHERE signal='price_sensitivity'`),
    db.query(`
      SELECT status, COUNT(*) AS c, AVG(quote_amount) AS avg_quote, AVG(final_price) AS avg_final
      FROM ai_negotiations GROUP BY status
    `),
    db.query(`
      SELECT service_type, COUNT(*) AS c, AVG(quote_amount) AS avg_quote
      FROM ai_negotiations GROUP BY service_type ORDER BY c DESC LIMIT 10
    `),
  ]);

  const total = parseInt(wins.rows[0].c) + parseInt(losses.rows[0].c);
  return {
    totalNegotiations: total,
    wins: parseInt(wins.rows[0].c),
    losses: parseInt(losses.rows[0].c),
    winRate: total > 0 ? Math.round((wins.rows[0].c / total) * 100) : 0,
    avgWinPrice: Math.round(wins.rows[0].avg_price || 0),
    priceSensitivityEvents: parseInt(sensitivity.rows[0].c),
    byStatus: negotiations.rows,
    byService: byService.rows,
    hotServices: byService.rows.slice(0, 3).map(r => r.service_type),
  };
}

module.exports = {
  ensureTables,
  analyzeClientMessage: geminiAnalyze,
  handleClientMessage,
  buildQuote,
  formatQuoteMessage,
  detectServiceType,
  extractScopeSignals,
  recordOutcome,
  getMarketIntelligence,
};
