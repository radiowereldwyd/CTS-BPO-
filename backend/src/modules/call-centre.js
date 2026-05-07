/**
 * CTS BPO — Built-in Call Centre Module
 * Powered by Twilio Programmable Voice
 *
 * Features:
 *  - Browser-based softphone (agents take calls in the browser)
 *  - Inbound call routing with IVR menu
 *  - Outbound click-to-call
 *  - Call queue management
 *  - Call logging with duration, recording, transcript
 *  - Agent presence (available / busy / offline)
 */

const twilio    = require('twilio');
const db        = require('../db');
const auditLogger = require('./audit-logger');

const ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID  || '';
const AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN    || '';
const TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID || '';
const FROM_NUMBER  = process.env.TWILIO_PHONE_FROM    || process.env.TWILIO_WHATSAPP_FROM?.replace('whatsapp:', '') || '';
const CONFIGURED   = !!(ACCOUNT_SID && AUTH_TOKEN);

let client = null;
function getClient() {
  if (!CONFIGURED) return null;
  if (!client) client = twilio(ACCOUNT_SID, AUTH_TOKEN);
  return client;
}

// ── Ensure DB tables ──────────────────────────────────────────────────────────
async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS call_logs (
      id            SERIAL PRIMARY KEY,
      call_sid      TEXT,
      direction     TEXT DEFAULT 'inbound',
      from_number   TEXT,
      to_number     TEXT,
      agent_id      INTEGER,
      agent_name    TEXT,
      status        TEXT DEFAULT 'initiated',
      duration_sec  INTEGER DEFAULT 0,
      recording_url TEXT,
      transcript    TEXT,
      notes         TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  await db.query(`
    CREATE TABLE IF NOT EXISTS call_agents (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT,
      phone       TEXT,
      identity    TEXT UNIQUE,
      status      TEXT DEFAULT 'offline',
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_call_logs_created ON call_logs(created_at DESC)
  `).catch(() => {});
}

ensureTables().catch(() => {});

// ── Generate Twilio capability token for browser SDK ─────────────────────────
async function generateToken(identity) {
  if (!CONFIGURED) return null;
  const c = getClient();
  if (!c) return null;
  try {
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant  = AccessToken.VoiceGrant;
    const token = new AccessToken(ACCOUNT_SID, process.env.TWILIO_API_KEY || ACCOUNT_SID, process.env.TWILIO_API_SECRET || AUTH_TOKEN, { identity });
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: TWIML_APP_SID,
      incomingAllow: true,
    });
    token.addGrant(voiceGrant);
    token.ttl = 3600;
    return token.toJwt();
  } catch (e) {
    console.error('[CALL-CENTRE] Token generation failed:', e.message);
    return null;
  }
}

// ── TwiML: inbound call handler (IVR menu) ───────────────────────────────────
function buildInboundTwiML(appUrl) {
  const base = appUrl || process.env.APP_URL || 'https://your-app.replit.app';
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  const gather = response.gather({
    numDigits: 1,
    action: `${base}/api/call-centre/ivr-selection`,
    method: 'POST',
    timeout: 10,
  });

  gather.say({
    voice: 'Polly.Joanna',
    language: 'en-ZA',
  }, 'Thank you for calling C T S BPO Solutions. ' +
     'For new business enquiries, press 1. ' +
     'For existing client support, press 2. ' +
     'To speak to an agent immediately, press 3. ' +
     'To leave a message, press 4.');

  response.redirect(`${base}/api/call-centre/inbound`);
  return response.toString();
}

// ── TwiML: IVR selection handler ─────────────────────────────────────────────
function buildIVRSelectionTwiML(digit, appUrl) {
  const base = appUrl || process.env.APP_URL || 'https://your-app.replit.app';
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  switch (digit) {
    case '1':
      response.say({ voice: 'Polly.Joanna' }, 'Please hold while we connect you to our business development team.');
      response.dial({ timeout: 30, record: 'record-from-answer' }).client('agent-primary');
      break;
    case '2':
      response.say({ voice: 'Polly.Joanna' }, 'Connecting you to client support now. Please hold.');
      response.dial({ timeout: 30, record: 'record-from-answer' }).client('agent-support');
      break;
    case '3':
      response.say({ voice: 'Polly.Joanna' }, 'Connecting you to an available agent. Please hold.');
      response.dial({ timeout: 40, record: 'record-from-answer', callerId: FROM_NUMBER }).client('agent-primary');
      break;
    case '4':
      response.say({ voice: 'Polly.Joanna' }, 'Please leave your message after the tone. Press the hash key when done.');
      response.record({
        action: `${base}/api/call-centre/voicemail`,
        method: 'POST',
        finishOnKey: '#',
        maxLength: 120,
        transcribe: true,
        transcribeCallback: `${base}/api/call-centre/transcribe`,
      });
      break;
    default:
      response.say({ voice: 'Polly.Joanna' }, 'Sorry, I did not understand that. Please call back and try again.');
      response.hangup();
  }

  return response.toString();
}

// ── TwiML: outbound call (browser → phone number) ────────────────────────────
function buildOutboundTwiML(toNumber) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  const dial = response.dial({ callerId: FROM_NUMBER, record: 'record-from-answer', timeout: 30 });
  dial.number(toNumber);
  return response.toString();
}

// ── Log call to DB ────────────────────────────────────────────────────────────
async function logCall({ callSid, direction, from, to, agentId, agentName, status, duration, recordingUrl, transcript, notes }) {
  try {
    await db.query(`
      INSERT INTO call_logs (call_sid, direction, from_number, to_number, agent_id, agent_name, status, duration_sec, recording_url, transcript, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT DO NOTHING
    `, [callSid, direction||'inbound', from, to, agentId||null, agentName||null, status||'completed', duration||0, recordingUrl||null, transcript||null, notes||null]);
  } catch (e) {
    console.error('[CALL-CENTRE] logCall error:', e.message);
  }
}

// ── Update call record ────────────────────────────────────────────────────────
async function updateCall(callSid, updates) {
  const fields = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(updates)) {
    fields.push(`${k} = $${i++}`);
    vals.push(v);
  }
  if (!fields.length) return;
  vals.push(callSid);
  await db.query(`UPDATE call_logs SET ${fields.join(', ')}, updated_at=NOW() WHERE call_sid=$${i}`, vals).catch(() => {});
}

// ── Agent presence ────────────────────────────────────────────────────────────
async function setAgentStatus(identity, status) {
  await db.query(`
    INSERT INTO call_agents (identity, name, status, updated_at)
    VALUES ($1, $1, $2, NOW())
    ON CONFLICT (identity) DO UPDATE SET status=$2, updated_at=NOW()
  `, [identity, status]).catch(() => {});
}

async function getAgents() {
  const r = await db.query(`SELECT * FROM call_agents ORDER BY name`).catch(() => ({ rows: [] }));
  return r.rows;
}

// ── Call logs ─────────────────────────────────────────────────────────────────
async function getCallLogs({ limit = 50, offset = 0 } = {}) {
  const r = await db.query(`
    SELECT * FROM call_logs
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]).catch(() => ({ rows: [] }));
  return r.rows;
}

async function getCallStats() {
  const r = await db.query(`
    SELECT
      COUNT(*)                                            AS total_calls,
      COUNT(*) FILTER (WHERE direction='inbound')         AS inbound,
      COUNT(*) FILTER (WHERE direction='outbound')        AS outbound,
      COUNT(*) FILTER (WHERE status='completed')          AS completed,
      COUNT(*) FILTER (WHERE status='no-answer')          AS missed,
      ROUND(AVG(duration_sec) FILTER (WHERE duration_sec > 0)) AS avg_duration_sec,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS calls_today,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')   AS calls_week
    FROM call_logs
  `).catch(() => ({ rows: [{}] }));
  return r.rows[0] || {};
}

// ── Make outbound call via Twilio API ────────────────────────────────────────
async function makeOutboundCall({ to, agentId, agentName, appUrl }) {
  const c = getClient();
  if (!c) throw new Error('Twilio not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  const base = appUrl || process.env.APP_URL || '';
  const call = await c.calls.create({
    to,
    from: FROM_NUMBER,
    url: `${base}/api/call-centre/outbound-twiml?to=${encodeURIComponent(to)}`,
    record: true,
    statusCallback: `${base}/api/call-centre/status-callback`,
    statusCallbackMethod: 'POST',
  });
  await logCall({ callSid: call.sid, direction: 'outbound', from: FROM_NUMBER, to, agentId, agentName, status: 'initiated' });
  return call;
}

module.exports = {
  CONFIGURED,
  generateToken,
  buildInboundTwiML,
  buildIVRSelectionTwiML,
  buildOutboundTwiML,
  logCall,
  updateCall,
  setAgentStatus,
  getAgents,
  getCallLogs,
  getCallStats,
  makeOutboundCall,
};
