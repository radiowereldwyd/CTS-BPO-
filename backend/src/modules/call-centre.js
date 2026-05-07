/**
 * CTS BPO — WebRTC Call Centre Module (Google Cloud / Free)
 * Uses Google's free STUN servers — zero Twilio, zero cost
 *
 * Architecture:
 *  - WebSocket signaling server relays SDP offers/answers + ICE candidates
 *  - Google STUN servers handle NAT traversal (free, unlimited)
 *  - Call rooms are short-lived in-memory sessions
 *  - Call logs persisted to PostgreSQL
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');

// ── In-memory room registry ───────────────────────────────────────────────────
// rooms[roomId] = { id, name, createdAt, peers: Map<peerId, { ws, role, name }> }
const rooms = new Map();

// ── Google STUN config (free, no auth) ───────────────────────────────────────
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
];

// ── Ensure DB tables ──────────────────────────────────────────────────────────
async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS call_logs (
      id            SERIAL PRIMARY KEY,
      room_id       TEXT,
      room_name     TEXT,
      direction     TEXT DEFAULT 'inbound',
      agent_name    TEXT,
      client_name   TEXT,
      status        TEXT DEFAULT 'completed',
      duration_sec  INTEGER DEFAULT 0,
      notes         TEXT,
      transcript    TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  await db.query(`
    CREATE TABLE IF NOT EXISTS call_agents (
      id          SERIAL PRIMARY KEY,
      identity    TEXT UNIQUE,
      name        TEXT NOT NULL,
      email       TEXT,
      status      TEXT DEFAULT 'offline',
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_call_logs_created ON call_logs(created_at DESC)
  `).catch(() => {});
}

ensureTables().catch(() => {});

// ── Room management ───────────────────────────────────────────────────────────
function createRoom(name) {
  const id = uuidv4().slice(0, 8);
  rooms.set(id, { id, name: name || `Support Room ${id.toUpperCase()}`, createdAt: new Date(), peers: new Map() });
  return rooms.get(id);
}

function getRoom(id) { return rooms.get(id) || null; }

function listRooms() {
  return [...rooms.values()].map(r => ({
    id: r.id, name: r.name, createdAt: r.createdAt,
    peerCount: r.peers.size,
    peers: [...r.peers.values()].map(p => ({ peerId: p.peerId, role: p.role, name: p.name })),
  }));
}

function deleteRoom(id) { rooms.delete(id); }

// ── WebSocket signaling handler ───────────────────────────────────────────────
// Called from index.js when a WebSocket connection arrives at /ws/call-signal
function handleSignaling(ws, req) {
  const url   = new URL(req.url, 'http://localhost');
  const roomId = url.searchParams.get('room');
  const peerId = url.searchParams.get('peerId') || uuidv4().slice(0, 8);
  const role   = url.searchParams.get('role') || 'client';
  const name   = decodeURIComponent(url.searchParams.get('name') || (role === 'agent' ? 'Agent' : 'Client'));

  if (!roomId) { ws.close(1008, 'room required'); return; }

  // Auto-create room if it doesn't exist (agents can create on connect)
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { id: roomId, name: `Call ${roomId.toUpperCase()}`, createdAt: new Date(), peers: new Map() });
  }

  const room = rooms.get(roomId);
  const peer = { ws, peerId, role, name, joinedAt: new Date() };
  room.peers.set(peerId, peer);

  console.log(`📞 [CALL] ${name} (${role}) joined room ${roomId} — peers: ${room.peers.size}`);

  // Notify everyone else in the room of this new peer
  broadcast(room, peerId, { type: 'peer-joined', peerId, role, name });

  // Send current peer list to the new joiner
  const otherPeers = [...room.peers.values()]
    .filter(p => p.peerId !== peerId)
    .map(p => ({ peerId: p.peerId, role: p.role, name: p.name }));
  safeSend(ws, { type: 'room-info', roomId, roomName: room.name, peerId, otherPeers, iceServers: ICE_SERVERS });

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    msg.from = peerId;

    switch (msg.type) {
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        // Relay to specific target or broadcast
        if (msg.to) {
          const target = room.peers.get(msg.to);
          if (target) safeSend(target.ws, msg);
        } else {
          broadcast(room, peerId, msg);
        }
        break;
      case 'chat':
        broadcast(room, peerId, { type: 'chat', from: peerId, name, text: msg.text, ts: Date.now() });
        break;
      case 'ping':
        safeSend(ws, { type: 'pong' });
        break;
    }
  });

  ws.on('close', () => {
    room.peers.delete(peerId);
    console.log(`📞 [CALL] ${name} left room ${roomId} — peers: ${room.peers.size}`);
    broadcast(room, peerId, { type: 'peer-left', peerId, name, role });
    if (room.peers.size === 0) {
      setTimeout(() => { if (rooms.has(roomId) && rooms.get(roomId).peers.size === 0) deleteRoom(roomId); }, 30000);
    }
  });

  ws.on('error', () => {
    room.peers.delete(peerId);
    broadcast(room, peerId, { type: 'peer-left', peerId, name, role });
  });
}

function broadcast(room, fromPeerId, msg) {
  const data = JSON.stringify(msg);
  for (const [pid, peer] of room.peers) {
    if (pid !== fromPeerId) safeSend(peer.ws, data, true);
  }
}

function safeSend(ws, msg, raw = false) {
  try {
    if (ws.readyState === 1) ws.send(raw ? msg : JSON.stringify(msg));
  } catch {}
}

// ── Call log DB helpers ───────────────────────────────────────────────────────
async function logCall({ roomId, roomName, agentName, clientName, status, durationSec, notes }) {
  await db.query(`
    INSERT INTO call_logs (room_id, room_name, agent_name, client_name, status, duration_sec, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [roomId, roomName, agentName || null, clientName || null, status || 'completed', durationSec || 0, notes || null]).catch(() => {});
}

async function getCallLogs({ limit = 50, offset = 0 } = {}) {
  const r = await db.query(`SELECT * FROM call_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]).catch(() => ({ rows: [] }));
  return r.rows;
}

async function getCallStats() {
  const r = await db.query(`
    SELECT
      COUNT(*) AS total_calls,
      COUNT(*) FILTER (WHERE status='completed') AS completed,
      COUNT(*) FILTER (WHERE status='missed') AS missed,
      ROUND(AVG(duration_sec) FILTER (WHERE duration_sec > 0)) AS avg_duration_sec,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS calls_today,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS calls_week
    FROM call_logs
  `).catch(() => ({ rows: [{}] }));
  return r.rows[0] || {};
}

async function updateCallNotes(id, notes) {
  await db.query(`UPDATE call_logs SET notes=$1, updated_at=NOW() WHERE id=$2`, [notes, id]).catch(() => {});
}

// ── Agent presence ────────────────────────────────────────────────────────────
async function setAgentStatus(identity, name, status) {
  await db.query(`
    INSERT INTO call_agents (identity, name, status, updated_at)
    VALUES ($1,$2,$3,NOW())
    ON CONFLICT (identity) DO UPDATE SET status=$3, name=$2, updated_at=NOW()
  `, [identity, name, status]).catch(() => {});
}

async function getAgents() {
  const r = await db.query(`SELECT * FROM call_agents ORDER BY name`).catch(() => ({ rows: [] }));
  return r.rows;
}

module.exports = {
  ICE_SERVERS,
  createRoom, getRoom, listRooms, deleteRoom,
  handleSignaling,
  logCall, getCallLogs, getCallStats, updateCallNotes,
  setAgentStatus, getAgents,
};
