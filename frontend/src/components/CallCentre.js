/**
 * CallCentre — Admin dashboard for WebRTC call centre
 * Uses Google Cloud free STUN servers — zero Twilio, zero cost
 */
import React, { useState, useEffect, useCallback } from 'react';

const API = '';

const fmt  = n => parseInt(n) || 0;
const dur  = sec => { const s = fmt(sec); if (!s) return '—'; if (s < 60) return `${s}s`; return `${Math.floor(s/60)}m ${s%60}s`; };
const ts   = d => d ? new Date(d).toLocaleString('en-ZA', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';

const S = {
  page: { padding: '32px 40px', maxWidth: 1200, margin: '0 auto' },
  h1:   { margin: '0 0 4px', color: '#0f172a', fontSize: 26, fontWeight: 900 },
  sub:  { color: '#64748b', fontSize: 14, margin: '0 0 28px' },
  card: { background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  kpi:  c => ({ background: '#fff', borderRadius: 12, padding: '18px 22px', borderTop: `4px solid ${c}`, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }),
  label:{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  big:  { fontSize: 28, fontWeight: 900, color: '#0f172a' },
  btn:  (c, dis) => ({ padding: '10px 20px', background: dis ? '#e2e8f0' : c, color: dis ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: dis ? 'not-allowed' : 'pointer' }),
  inp:  { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' },
  pill: c => ({ display: 'inline-block', background: c + '20', color: c, fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 12, textTransform: 'uppercase' }),
};

const AGENT_COL = { available: '#10b981', busy: '#f59e0b', offline: '#94a3b8' };

export default function CallCentre({ token, user }) {
  const [tab, setTab]           = useState('dashboard');
  const [stats, setStats]       = useState({});
  const [logs, setLogs]         = useState([]);
  const [agents, setAgents]     = useState([]);
  const [rooms, setRooms]       = useState([]);
  const [myStatus, setMyStatus] = useState('offline');
  const [newRoom, setNewRoom]   = useState('');
  const [creating, setCreating] = useState(false);
  const [notes, setNotes]       = useState({});
  const [savingNote, setSavingNote] = useState('');
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const load = useCallback(async () => {
    try {
      const [sr, lr] = await Promise.all([
        fetch(`${API}/api/call-centre/stats`, auth).then(r => r.json()),
        fetch(`${API}/api/call-centre/logs?limit=50`, auth).then(r => r.json()),
      ]);
      setStats(sr.stats || {});
      setAgents(sr.agents || []);
      setRooms([]);
      fetch(`${API}/api/call-centre/rooms`, auth).then(r => r.json()).then(d => setRooms(d.rooms || [])).catch(() => {});
      setLogs(lr.logs || []);
    } catch {}
  }, [token]);

  useEffect(() => { load(); const iv = setInterval(load, 8000); return () => clearInterval(iv); }, [load]);

  async function updateStatus(status) {
    try {
      await fetch(`${API}/api/call-centre/agent/status`, {
        method: 'PATCH', headers: { ...auth.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, name: user?.name || user?.email }),
      });
      setMyStatus(status);
      load();
    } catch {}
  }

  async function createRoom() {
    if (!newRoom.trim()) return;
    setCreating(true);
    try {
      const r = await fetch(`${API}/api/call-centre/rooms`, {
        method: 'POST', headers: { ...auth.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoom }),
      });
      const d = await r.json();
      setNewRoom('');
      load();
      // Open the room for the agent
      const agentName = encodeURIComponent(user?.name || 'Agent');
      window.open(`/call/room/${d.room.id}?role=agent&name=${agentName}`, '_blank', 'width=1100,height=700');
    } catch {}
    setCreating(false);
  }

  function joinRoom(room) {
    const agentName = encodeURIComponent(user?.name || 'Agent');
    window.open(`/call/room/${room.id}?role=agent&name=${agentName}`, '_blank', 'width=1100,height=700');
  }

  function copyClientLink(room) {
    const url = `${window.location.origin}/call/room/${room.id}?role=client&name=Client`;
    navigator.clipboard.writeText(url).then(() => alert(`✅ Client link copied!\n\n${url}`)).catch(() => prompt('Copy this link:', url));
  }

  async function saveNote(id) {
    setSavingNote(id);
    try {
      await fetch(`${API}/api/call-centre/notes/${id}`, {
        method: 'POST', headers: { ...auth.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes[id] }),
      });
      setNotes(n => ({ ...n, [id]: '' }));
      load();
    } catch {}
    setSavingNote('');
  }

  const tabs = [
    { key: 'dashboard', label: '📊 Dashboard' },
    { key: 'rooms',     label: '📞 Rooms' },
    { key: 'logs',      label: '📋 Call Logs' },
    { key: 'agents',    label: '👥 Agents' },
    { key: 'howto',     label: '💡 How It Works' },
  ];

  return (
    <div style={S.page}>
      <h1 style={S.h1}>📞 CTS BPO Call Centre</h1>
      <p style={S.sub}>
        Browser-based video/voice calls · Powered by Google STUN · Zero cost · No phone number required
        <span style={{ marginLeft: 14, background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 12, border: '1px solid #bbf7d0' }}>✅ Free — Google Cloud</span>
      </p>

      {/* Status selector */}
      <div style={{ ...S.card, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>Your Status:</span>
        {[['available','🟢 Available','#10b981'], ['busy','🟡 Busy','#f59e0b'], ['offline','⚫ Offline','#94a3b8']].map(([s, l, c]) => (
          <button key={s} onClick={() => updateStatus(s)} style={{ padding: '8px 16px', background: myStatus === s ? c : '#f1f5f9', color: myStatus === s ? '#fff' : '#475569', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{l}</button>
        ))}
        <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 12 }}>
          {rooms.length} active room{rooms.length !== 1 ? 's' : ''} · {agents.filter(a => a.status === 'available').length} agent{agents.filter(a => a.status === 'available').length !== 1 ? 's' : ''} available
        </span>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e2e8f0', marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: tab === t.key ? '#6366f1' : '#64748b',
            borderBottom: tab === t.key ? '3px solid #6366f1' : '3px solid transparent',
            marginBottom: -2, borderRadius: '4px 4px 0 0',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {tab === 'dashboard' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
            {[
              ['Total Calls', fmt(stats.total_calls), '#6366f1'],
              ['Today',       fmt(stats.calls_today),  '#0ea5e9'],
              ['Completed',   fmt(stats.completed),    '#10b981'],
              ['Avg Duration',dur(stats.avg_duration_sec || 0), '#f59e0b'],
            ].map(([l, v, c]) => (
              <div key={l} style={S.kpi(c)}>
                <div style={S.label}>{l}</div>
                <div style={S.big}>{v}</div>
              </div>
            ))}
          </div>

          {/* Quick start */}
          <div style={{ ...S.card, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>📞 Start a Call Right Now</div>
            <p style={{ margin: '0 0 16px', opacity: 0.85, fontSize: 14 }}>Create a room, then share the client link via email or chat. The client clicks it and you're connected instantly — no app, no install.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input value={newRoom} onChange={e => setNewRoom(e.target.value)} onKeyDown={e => e.key === 'Enter' && createRoom()}
                placeholder="Room name (e.g. Client Support Call)"
                style={{ flex: 1, minWidth: 220, padding: '11px 14px', borderRadius: 8, border: 'none', fontSize: 14, background: 'rgba(255,255,255,0.15)', color: '#fff' }} />
              <button onClick={createRoom} disabled={creating || !newRoom.trim()} style={{ ...S.btn('#fff', creating || !newRoom.trim()), color: '#4f46e5', fontWeight: 800, padding: '11px 24px' }}>
                {creating ? 'Creating…' : '▶ Create & Join'}
              </button>
            </div>
          </div>

          {/* Active rooms */}
          {rooms.length > 0 && (
            <div style={S.card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 14 }}>🔴 Active Rooms</div>
              {rooms.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>ID: {r.id} · {r.peerCount} connected</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => joinRoom(r)} style={{ ...S.btn('#6366f1'), fontSize: 12, padding: '7px 14px' }}>▶ Join</button>
                    <button onClick={() => copyClientLink(r)} style={{ ...S.btn('#0ea5e9'), fontSize: 12, padding: '7px 14px' }}>📋 Copy Client Link</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ROOMS ── */}
      {tab === 'rooms' && (
        <div>
          <div style={{ ...S.card, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 16px', color: '#0f172a', fontSize: 16, fontWeight: 800 }}>Create a New Call Room</h3>
            <div style={{ display: 'flex', gap: 10 }}>
              <input value={newRoom} onChange={e => setNewRoom(e.target.value)} onKeyDown={e => e.key === 'Enter' && createRoom()}
                placeholder="Room name — e.g. 'Client Onboarding — Acme Corp'"
                style={{ ...S.inp, flex: 1 }} />
              <button onClick={createRoom} disabled={creating || !newRoom.trim()} style={{ ...S.btn('#6366f1', creating || !newRoom.trim()), whiteSpace: 'nowrap' }}>
                {creating ? 'Creating…' : '▶ Create Room'}
              </button>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 12, color: '#94a3b8' }}>
              Creating a room opens it in a new window for you (agent). Copy the client link and send it to the caller — they join directly in their browser.
            </p>
          </div>

          <div style={S.card}>
            <h3 style={{ margin: '0 0 16px', color: '#0f172a', fontSize: 16, fontWeight: 800 }}>Active Rooms ({rooms.length})</h3>
            {rooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                No active rooms. Create one above to start a call.
              </div>
            ) : rooms.map(r => (
              <div key={r.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginBottom: 4 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Room ID: <code style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: 4 }}>{r.id}</code></div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {r.peers.map(p => (
                        <span key={p.peerId} style={S.pill(p.role === 'agent' ? '#6366f1' : '#0ea5e9')}>
                          {p.role === 'agent' ? '👤' : '🙋'} {p.name}
                        </span>
                      ))}
                      {r.peerCount === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>No one connected yet</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                    <button onClick={() => joinRoom(r)} style={{ ...S.btn('#6366f1'), fontSize: 12, padding: '8px 16px' }}>▶ Join as Agent</button>
                    <button onClick={() => copyClientLink(r)} style={{ ...S.btn('#0ea5e9'), fontSize: 12, padding: '8px 16px' }}>📋 Copy Client Link</button>
                  </div>
                </div>
                <div style={{ marginTop: 12, background: '#f1f5f9', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#475569' }}>
                  <strong>Client link:</strong> <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{window.location.origin}/call/room/{r.id}?role=client&name=Client</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CALL LOGS ── */}
      {tab === 'logs' && (
        <div style={S.card}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: 16, fontWeight: 800 }}>Call History</h3>
            <span style={{ fontSize: 13, color: '#64748b' }}>{logs.length} records</span>
          </div>
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>No call records yet. Completed calls are logged automatically.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Room','Agent','Client','Status','Duration','Time','Notes'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l, i) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>{l.room_name || l.room_id || '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{l.agent_name || '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{l.client_name || '—'}</td>
                      <td style={{ padding: '10px 12px' }}><span style={S.pill(l.status === 'completed' ? '#10b981' : '#ef4444')}>{l.status}</span></td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{dur(l.duration_sec)}</td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{ts(l.created_at)}</td>
                      <td style={{ padding: '10px 12px', minWidth: 200 }}>
                        {l.notes && !notes[l.id] && <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>{l.notes}</div>}
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input value={notes[l.id] || ''} onChange={e => setNotes(n => ({ ...n, [l.id]: e.target.value }))} placeholder="Add note…" style={{ flex: 1, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }} />
                          <button onClick={() => saveNote(l.id)} disabled={!notes[l.id] || savingNote === l.id} style={{ padding: '4px 10px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
                            {savingNote === l.id ? '…' : 'Save'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── AGENTS ── */}
      {tab === 'agents' && (
        <div style={S.card}>
          <h3 style={{ margin: '0 0 20px', color: '#0f172a', fontSize: 16, fontWeight: 800 }}>Agent Presence Board</h3>
          {agents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
              No agents registered. Set your status to Available at the top of this page.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 16 }}>
              {agents.map(a => (
                <div key={a.id} style={{ background: '#f8fafc', border: `2px solid ${AGENT_COL[a.status] || '#e2e8f0'}`, borderRadius: 12, padding: '18px 20px', textAlign: 'center' }}>
                  <div style={{ width: 48, height: 48, background: (AGENT_COL[a.status] || '#94a3b8') + '20', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, margin: '0 auto 12px' }}>👤</div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', marginBottom: 6 }}>{a.name}</div>
                  <span style={S.pill(AGENT_COL[a.status] || '#94a3b8')}>{a.status}</span>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>{ts(a.updated_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── HOW IT WORKS ── */}
      {tab === 'howto' && (
        <div style={{ maxWidth: 680 }}>
          <div style={S.card}>
            <h3 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: 16, fontWeight: 800 }}>💡 How the Call Centre Works</h3>
            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 24px' }}>100% free — powered by WebRTC and Google's STUN servers. No phone numbers, no monthly fees.</p>

            {[
              { step: 1, icon: '📞', title: 'Create a Room', desc: 'Click "Create Room" and give it a name — e.g. "Acme Corp Support". This opens the call room in a new tab where you (the agent) wait.' },
              { step: 2, icon: '📋', title: 'Copy the Client Link', desc: 'Click "Copy Client Link". Send this link to your client via email, WhatsApp, or the client portal. They click it — no app, no account needed.' },
              { step: 3, icon: '🎥', title: 'Connect Instantly', desc: 'The moment the client opens the link, you see them appear and the call begins. Full HD video and audio, encrypted end-to-end.' },
              { step: 4, icon: '💬', title: 'Chat & Collaborate', desc: 'Use the built-in chat panel to share links, reference numbers, or messages during the call.' },
              { step: 5, icon: '📋', title: 'Call is Logged', desc: 'After the call, it appears in the Call Logs tab with duration, names, and any notes you add.' },
            ].map(({ step, icon, title, desc }) => (
              <div key={step} style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, background: '#6366f1', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 14, flexShrink: 0 }}>{step}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>{icon} {title}</div>
                  <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{desc}</p>
                </div>
              </div>
            ))}

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 18px', marginTop: 8 }}>
              <strong style={{ color: '#14532d', fontSize: 13 }}>✅ Cost Breakdown</strong>
              <ul style={{ margin: '8px 0 0', padding: '0 0 0 18px', fontSize: 13, color: '#166534', lineHeight: 2 }}>
                <li>Google STUN servers — <strong>Free, unlimited</strong></li>
                <li>WebRTC data transfer — <strong>Free (peer-to-peer, not through your server)</strong></li>
                <li>Video/audio quality — <strong>Up to 1080p HD</strong></li>
                <li>Participants per room — <strong>Unlimited</strong></li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
