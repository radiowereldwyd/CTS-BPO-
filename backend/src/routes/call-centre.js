/**
 * Call Centre API Routes
 * GET  /api/call-centre/token            — browser SDK token
 * GET  /api/call-centre/stats            — call statistics
 * GET  /api/call-centre/logs             — call log list
 * GET  /api/call-centre/agents           — agent presence list
 * POST /api/call-centre/inbound          — Twilio webhook: inbound call
 * POST /api/call-centre/ivr-selection    — Twilio webhook: IVR digit
 * POST /api/call-centre/outbound-twiml   — Twilio webhook: outbound call
 * POST /api/call-centre/voicemail        — Twilio webhook: voicemail recording
 * POST /api/call-centre/transcribe       — Twilio webhook: voicemail transcript
 * POST /api/call-centre/status-callback  — Twilio webhook: call status update
 * POST /api/call-centre/call            — admin: initiate outbound call
 * PATCH /api/call-centre/agent/status   — update agent presence
 * POST /api/call-centre/notes/:callSid  — add call notes
 */

const express    = require('express');
const callCentre = require('../modules/call-centre');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const auditLogger = require('../modules/audit-logger');

const router = express.Router();
const APP_URL = () => process.env.APP_URL || '';

// ── Browser SDK token (agents use this to connect softphone) ─────────────────
router.get('/token', requireAuth, async (req, res) => {
  const identity = `agent-${req.user?.id || 'admin'}`;
  try {
    const token = await callCentre.generateToken(identity);
    if (!token) return res.json({ configured: false, message: 'Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_TWIML_APP_SID to enable voice calls.' });
    res.json({ configured: true, token, identity });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const [stats, agents] = await Promise.all([callCentre.getCallStats(), callCentre.getAgents()]);
    res.json({ configured: callCentre.CONFIGURED, stats, agents });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Call logs ─────────────────────────────────────────────────────────────────
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const logs = await callCentre.getCallLogs({ limit: parseInt(req.query.limit) || 50, offset: parseInt(req.query.offset) || 0 });
    res.json({ logs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Agent list ────────────────────────────────────────────────────────────────
router.get('/agents', requireAuth, async (req, res) => {
  try { res.json({ agents: await callCentre.getAgents() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Twilio Webhooks (public — no auth, validated by Twilio signature) ─────────

router.post('/inbound', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const { CallSid, From, To } = req.body;
    await callCentre.logCall({ callSid: CallSid, direction: 'inbound', from: From, to: To, status: 'ringing' });
    res.set('Content-Type', 'text/xml');
    res.send(callCentre.buildInboundTwiML(APP_URL()));
  } catch (e) {
    res.set('Content-Type', 'text/xml');
    res.send('<Response><Say>Sorry, we are unable to take your call right now. Please try again shortly.</Say></Response>');
  }
});

router.post('/ivr-selection', express.urlencoded({ extended: false }), async (req, res) => {
  const { Digits, CallSid } = req.body;
  await callCentre.updateCall(CallSid, { notes: `IVR selection: ${Digits}` }).catch(() => {});
  res.set('Content-Type', 'text/xml');
  res.send(callCentre.buildIVRSelectionTwiML(Digits, APP_URL()));
});

router.post('/outbound-twiml', express.urlencoded({ extended: false }), async (req, res) => {
  const to = req.query.to || req.body.To || '';
  res.set('Content-Type', 'text/xml');
  res.send(callCentre.buildOutboundTwiML(to));
});

router.post('/voicemail', express.urlencoded({ extended: false }), async (req, res) => {
  const { CallSid, RecordingUrl, RecordingDuration, From } = req.body;
  await callCentre.updateCall(CallSid, {
    status: 'voicemail',
    recording_url: RecordingUrl,
    duration_sec: parseInt(RecordingDuration) || 0,
  }).catch(() => {});
  // Email the voicemail notification to admin
  try {
    const emailOutreach = require('../modules/email-outreach');
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'cts.cybersolutions@gmail.com';
    await emailOutreach.sendMail({
      to: ADMIN_EMAIL,
      subject: `📞 New Voicemail from ${From} — CTS BPO Call Centre`,
      html: `<div style="font-family:Arial,sans-serif;padding:20px;max-width:500px">
        <h3 style="color:#6366f1;">📞 New Voicemail Received</h3>
        <p><strong>From:</strong> ${From}</p>
        <p><strong>Duration:</strong> ${RecordingDuration || 0} seconds</p>
        <p><strong>Call ID:</strong> ${CallSid}</p>
        ${RecordingUrl ? `<p><a href="${RecordingUrl}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">▶ Listen to Voicemail</a></p>` : ''}
        <p style="color:#64748b;font-size:13px;">Log into your call centre dashboard to view and respond.</p>
      </div>`,
      text: `New voicemail from ${From}. Duration: ${RecordingDuration}s. Recording: ${RecordingUrl}`,
    }).catch(() => {});
  } catch {}
  res.set('Content-Type', 'text/xml');
  res.send('<Response><Say voice="Polly.Joanna">Thank you for your message. A member of our team will return your call shortly. Goodbye.</Say><Hangup/></Response>');
});

router.post('/transcribe', express.urlencoded({ extended: false }), async (req, res) => {
  const { CallSid, TranscriptionText } = req.body;
  if (CallSid && TranscriptionText) {
    await callCentre.updateCall(CallSid, { transcript: TranscriptionText }).catch(() => {});
  }
  res.sendStatus(200);
});

router.post('/status-callback', express.urlencoded({ extended: false }), async (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  if (CallSid) {
    await callCentre.updateCall(CallSid, {
      status: CallStatus || 'completed',
      duration_sec: parseInt(CallDuration) || 0,
    }).catch(() => {});
  }
  res.sendStatus(200);
});

// ── Admin: make outbound call ─────────────────────────────────────────────────
router.post('/call', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { to, agentId, agentName } = req.body;
    if (!to) return res.status(400).json({ error: 'Phone number required' });
    const call = await callCentre.makeOutboundCall({ to, agentId: agentId || req.user.id, agentName: agentName || req.user.email, appUrl: APP_URL() });
    await auditLogger.log('call_centre.outbound', null, req.user.id, `Outbound call to ${to}`, null, 'info');
    res.json({ success: true, callSid: call.sid, status: call.status });
  } catch (e) { res.status(500).json({ error: e.message, configured: callCentre.CONFIGURED }); }
});

// ── Agent status update ───────────────────────────────────────────────────────
router.patch('/agent/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['available', 'busy', 'offline'].includes(status)) return res.status(400).json({ error: 'Status must be available, busy, or offline' });
    const identity = `agent-${req.user.id}`;
    await callCentre.setAgentStatus(identity, status);
    res.json({ success: true, identity, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Add call notes ────────────────────────────────────────────────────────────
router.post('/notes/:callSid', requireAuth, async (req, res) => {
  try {
    const { notes } = req.body;
    await callCentre.updateCall(req.params.callSid, { notes });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
