/**
 * Call Centre REST API Routes
 * GET  /api/call-centre/config         — ICE server config for frontend WebRTC
 * GET  /api/call-centre/stats          — call statistics
 * GET  /api/call-centre/logs           — call log list
 * GET  /api/call-centre/agents         — agent presence
 * GET  /api/call-centre/rooms          — active rooms
 * POST /api/call-centre/rooms          — create new room (admin)
 * POST /api/call-centre/log            — save completed call log
 * PATCH /api/call-centre/agent/status  — update agent presence
 * POST /api/call-centre/notes/:id      — add call notes
 */

const express    = require('express');
const callCentre = require('../modules/call-centre');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ── ICE server config (Google free STUN) ──────────────────────────────────────
router.get('/config', (req, res) => {
  res.json({ iceServers: callCentre.ICE_SERVERS, provider: 'Google Cloud (free)' });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const [stats, agents, rooms] = await Promise.all([
      callCentre.getCallStats(),
      callCentre.getAgents(),
      Promise.resolve(callCentre.listRooms()),
    ]);
    res.json({ stats, agents, activeRooms: rooms.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Call logs ─────────────────────────────────────────────────────────────────
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const logs = await callCentre.getCallLogs({ limit: parseInt(req.query.limit) || 50, offset: parseInt(req.query.offset) || 0 });
    res.json({ logs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Agents ────────────────────────────────────────────────────────────────────
router.get('/agents', requireAuth, async (req, res) => {
  try { res.json({ agents: await callCentre.getAgents() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Active rooms ──────────────────────────────────────────────────────────────
router.get('/rooms', requireAuth, (req, res) => {
  res.json({ rooms: callCentre.listRooms() });
});

// ── Create room ───────────────────────────────────────────────────────────────
router.post('/rooms', requireAuth, (req, res) => {
  const { name } = req.body;
  const room = callCentre.createRoom(name);
  res.json({ room: { id: room.id, name: room.name, createdAt: room.createdAt } });
});

// ── Log a completed call ──────────────────────────────────────────────────────
router.post('/log', requireAuth, async (req, res) => {
  try {
    await callCentre.logCall(req.body);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Agent status ──────────────────────────────────────────────────────────────
router.patch('/agent/status', requireAuth, async (req, res) => {
  try {
    const { status, name } = req.body;
    if (!['available', 'busy', 'offline'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const identity = `agent-${req.user.id}`;
    await callCentre.setAgentStatus(identity, name || req.user.email, status);
    res.json({ success: true, identity, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Add notes to a call log entry ────────────────────────────────────────────
router.post('/notes/:id', requireAuth, async (req, res) => {
  try {
    await callCentre.updateCallNotes(req.params.id, req.body.notes);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
