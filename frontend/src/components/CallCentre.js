import React, { useState, useEffect, useRef, useCallback } from 'react';

const API = '';

const fmt = n => parseInt(n) || 0;
const dur = sec => { const s = fmt(sec); if (s < 60) return `${s}s`; return `${Math.floor(s/60)}m ${s%60}s`; };
const ts  = d => d ? new Date(d).toLocaleString('en-ZA', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';

const S = {
  page: { padding: '32px 40px', maxWidth: 1200, margin: '0 auto' },
  h1:   { margin: '0 0 4px', color: '#0f172a', fontSize: 26, fontWeight: 900 },
  sub:  { color: '#64748b', fontSize: 14, margin: '0 0 28px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 28 },
  card: { background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  kpi:  (c) => ({ background: '#fff', borderRadius: 12, padding: '18px 22px', borderTop: `4px solid ${c}`, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }),
  label:{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  big:  { fontSize: 28, fontWeight: 900, color: '#0f172a' },
  btn:  (c,dis) => ({ padding: '10px 20px', background: dis?'#e2e8f0':c, color: dis?'#94a3b8':'#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: dis?'not-allowed':'pointer', transition: 'all .15s' }),
  inp:  { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' },
  pill: (c) => ({ display: 'inline-block', background: c+'20', color: c, fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 12, textTransform: 'uppercase' }),
};

const STATUS_COL = { completed:'#10b981', 'no-answer':'#ef4444', busy:'#f59e0b', failed:'#ef4444', voicemail:'#8b5cf6', initiated:'#0ea5e9', ringing:'#f59e0b' };
const AGENT_COL  = { available:'#10b981', busy:'#f59e0b', offline:'#94a3b8' };

export default function CallCentre({ token, user }) {
  const [tab, setTab]             = useState('dashboard');
  const [stats, setStats]         = useState({});
  const [logs, setLogs]           = useState([]);
  const [agents, setAgents]       = useState([]);
  const [configured, setConfigured] = useState(null);
  const [myStatus, setMyStatus]   = useState('offline');
  const [dialNum, setDialNum]     = useState('');
  const [dialing, setDialing]     = useState(false);
  const [dialMsg, setDialMsg]     = useState('');
  const [notes, setNotes]         = useState({});
  const [savingNote, setSavingNote] = useState('');
  const [device, setDevice]       = useState(null);
  const [call, setCall]           = useState(null);
  const [callState, setCallState] = useState('idle'); // idle | ringing | active | ended
  const [muted, setMuted]         = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const timerRef  = useRef(null);
  const auth      = { headers: { Authorization: `Bearer ${token}` } };

  const load = useCallback(async () => {
    try {
      const [sr, lr] = await Promise.all([
        fetch(`${API}/api/call-centre/stats`, auth).then(r => r.json()),
        fetch(`${API}/api/call-centre/logs?limit=50`, auth).then(r => r.json()),
      ]);
      setStats(sr.stats || {});
      setAgents(sr.agents || []);
      setConfigured(sr.configured ?? false);
      setLogs(lr.logs || []);
    } catch {}
  }, [token]);

  useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv); }, [load]);

  // Load Twilio browser SDK
  useEffect(() => {
    if (!configured) return;
    let dev = null;
    (async () => {
      try {
        const r = await fetch(`${API}/api/call-centre/token`, auth);
        const d = await r.json();
        if (!d.token) return;
        // Dynamically load Twilio.js SDK
        if (!window.Twilio) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://media.twiliocdn.com/sdk/js/client/v1.14/twilio.js';
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
          });
        }
        dev = new window.Twilio.Device(d.token, { debug: false, enableRingingState: true });
        dev.on('ready', () => { setDevice(dev); console.log('[CALL] Twilio device ready'); });
        dev.on('incoming', connection => {
          setCall(connection); setCallState('ringing');
          connection.on('disconnect', () => { setCallState('ended'); stopTimer(); setTimeout(() => setCallState('idle'), 2000); });
          connection.on('cancel', () => { setCallState('idle'); setCall(null); });
        });
        dev.on('connect', connection => { setCall(connection); setCallState('active'); startTimer(); });
        dev.on('disconnect', () => { setCallState('ended'); stopTimer(); setTimeout(() => { setCallState('idle'); setCall(null); setMuted(false); }, 2000); });
        dev.on('error', err => { console.error('[CALL] Device error:', err); });
      } catch (e) { console.warn('[CALL] SDK load failed:', e.message); }
    })();
    return () => { if (dev) dev.destroy(); };
  }, [configured]);

  function startTimer() {
    setCallTimer(0);
    timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);
  }
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  async function updateStatus(status) {
    try {
      await fetch(`${API}/api/call-centre/agent/status`, { method: 'PATCH', headers: { ...auth.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      setMyStatus(status);
      load();
    } catch {}
  }

  async function makeCall() {
    if (!dialNum.trim()) return;
    setDialing(true); setDialMsg('');
    try {
      if (device && myStatus === 'available') {
        // Browser softphone call
        const conn = device.connect({ To: dialNum });
        setCall(conn); setCallState('active'); startTimer();
        setDialMsg('📞 Call connected via softphone');
      } else {
        // Server-side outbound call
        const r = await fetch(`${API}/api/call-centre/call`, { method: 'POST', headers: { ...auth.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: dialNum, agentName: user?.name }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setDialMsg(`✅ Call initiated to ${dialNum} (SID: ${d.callSid?.slice(0,12)}...)`);
        load();
      }
    } catch (e) { setDialMsg(`❌ ${e.message}`); }
    setDialing(false);
  }

  function hangUp() {
    if (call) { try { call.disconnect(); } catch {} }
    if (device) { try { device.disconnectAll(); } catch {} }
    setCallState('idle'); setCall(null); setMuted(false); stopTimer();
  }

  function toggleMute() {
    if (!call) return;
    try { muted ? call.unmute() : call.mute(); setMuted(!muted); } catch {}
  }

  function answerCall() {
    if (call && callState === 'ringing') { try { call.accept(); setCallState('active'); startTimer(); } catch {} }
  }

  async function saveNote(callSid) {
    setSavingNote(callSid);
    try {
      await fetch(`${API}/api/call-centre/notes/${callSid}`, { method: 'POST', headers: { ...auth.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: notes[callSid] }) });
      setNotes(n => ({ ...n, [callSid]: '' }));
      load();
    } catch {}
    setSavingNote('');
  }

  const tabs = [
    { key: 'dashboard', label: '📊 Dashboard' },
    { key: 'softphone', label: '📞 Softphone' },
    { key: 'logs',      label: '📋 Call Logs' },
    { key: 'agents',    label: '👥 Agents' },
    { key: 'setup',     label: '⚙️ Setup' },
  ];

  return (
    <div style={S.page}>
      <h1 style={S.h1}>📞 CTS BPO Call Centre</h1>
      <p style={S.sub}>Browser-based softphone · Inbound IVR routing · Outbound calling · Call recording · Agent presence</p>

      {/* Incoming call banner */}
      {callState === 'ringing' && (
        <div style={{ background: 'linear-gradient(135deg,#10b981,#059669)', borderRadius: 12, padding: '16px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 8px 32px rgba(16,185,129,0.3)' }}>
          <div style={{ color: '#fff' }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>📲 Incoming Call</div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>An inbound call is waiting for you</div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={answerCall} style={{ ...S.btn('#fff'), color: '#059669', fontWeight: 800, fontSize: 15, padding: '12px 28px' }}>✅ Answer</button>
            <button onClick={hangUp} style={{ ...S.btn('#ef4444'), fontSize: 15, padding: '12px 28px' }}>✗ Decline</button>
          </div>
        </div>
      )}

      {/* Active call bar */}
      {callState === 'active' && (
        <div style={{ background: '#0f172a', borderRadius: 12, padding: '14px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 10, height: 10, background: '#10b981', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
            <div style={{ color: '#fff', fontWeight: 700 }}>Call Active · {dur(callTimer)}</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={toggleMute} style={{ ...S.btn(muted ? '#f59e0b' : '#334155'), fontSize: 13 }}>
              {muted ? '🔇 Unmute' : '🎤 Mute'}
            </button>
            <button onClick={hangUp} style={{ ...S.btn('#ef4444'), fontSize: 13 }}>📵 End Call</button>
          </div>
        </div>
      )}

      {/* Not-configured warning */}
      {configured === false && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
          <strong style={{ color: '#92400e' }}>⚠️ Twilio not configured</strong>
          <p style={{ margin: '6px 0 0', color: '#92400e', fontSize: 13 }}>
            The softphone and outbound calling require Twilio credentials. Go to the <strong>Setup</strong> tab for instructions.
            All call logging and dashboards are active regardless.
          </p>
        </div>
      )}

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
          <div style={S.grid}>
            {[
              ['Total Calls', fmt(stats.total_calls), '#6366f1'],
              ['Calls Today', fmt(stats.calls_today), '#0ea5e9'],
              ['Answered', fmt(stats.completed), '#10b981'],
              ['Missed', fmt(stats.missed), '#ef4444'],
            ].map(([l,v,c]) => (
              <div key={l} style={S.kpi(c)}>
                <div style={S.label}>{l}</div>
                <div style={S.big}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={S.card}>
              <div style={S.label}>This Week</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{fmt(stats.calls_week)}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>total calls</div>
            </div>
            <div style={S.card}>
              <div style={S.label}>Avg Duration</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{dur(stats.avg_duration_sec || 0)}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>per call</div>
            </div>
            <div style={S.card}>
              <div style={S.label}>Answer Rate</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>
                {stats.total_calls > 0 ? Math.round((fmt(stats.completed) / fmt(stats.total_calls)) * 100) : 0}%
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>of calls answered</div>
            </div>
          </div>

          {/* Agent status */}
          <div style={S.card}>
            <div style={{ marginBottom: 14, fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Agent Status</div>
            {agents.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>No agents registered. Go to the Softphone tab to go online.</div>
            ) : (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {agents.map(a => (
                  <div key={a.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', minWidth: 160 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>{a.name}</div>
                    <span style={S.pill(AGENT_COL[a.status] || '#94a3b8')}>{a.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent calls */}
          <div style={{ ...S.card, marginTop: 20 }}>
            <div style={{ marginBottom: 14, fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Recent Calls</div>
            {logs.slice(0, 8).length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No calls logged yet.</div>
            ) : logs.slice(0, 8).map(l => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{l.direction === 'inbound' ? '📲' : '📞'} {l.from_number || '—'} → {l.to_number || '—'}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 10 }}>{ts(l.created_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {l.duration_sec > 0 && <span style={{ fontSize: 12, color: '#64748b' }}>{dur(l.duration_sec)}</span>}
                  <span style={S.pill(STATUS_COL[l.status] || '#94a3b8')}>{l.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SOFTPHONE ── */}
      {tab === 'softphone' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div style={S.card}>
              <h3 style={{ margin: '0 0 20px', color: '#0f172a', fontSize: 16, fontWeight: 800 }}>📞 Softphone Dialler</h3>

              {/* Agent status selector */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ ...S.label, marginBottom: 8 }}>Your Status</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['available','🟢 Available','#10b981'],['busy','🟡 Busy','#f59e0b'],['offline','⚫ Offline','#94a3b8']].map(([s,l,c]) => (
                    <button key={s} onClick={() => updateStatus(s)} style={{ padding: '8px 14px', background: myStatus===s ? c : '#f1f5f9', color: myStatus===s ? '#fff' : '#475569', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{l}</button>
                  ))}
                </div>
              </div>

              {/* Dial pad */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...S.label, display: 'block', marginBottom: 8 }}>Phone Number to Call</label>
                <input value={dialNum} onChange={e => setDialNum(e.target.value)} placeholder="+27 76 067 9100"
                  style={{ ...S.inp, fontSize: 18, padding: '14px 16px', fontFamily: 'monospace', letterSpacing: 2 }}
                  onKeyDown={e => e.key === 'Enter' && makeCall()} />
              </div>

              {/* Quick dial grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
                {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
                  <button key={d} onClick={() => setDialNum(n => n + d)} style={{ padding: '12px 0', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 18, fontWeight: 700, cursor: 'pointer', color: '#0f172a' }}>{d}</button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={makeCall} disabled={dialing || !dialNum.trim() || callState === 'active'} style={{ ...S.btn('linear-gradient(135deg,#10b981,#059669)', dialing || !dialNum.trim() || callState==='active'), flex: 1, fontSize: 15, padding: '13px 0' }}>
                  {dialing ? '⏳ Calling...' : '📞 Call'}
                </button>
                <button onClick={() => setDialNum(n => n.slice(0,-1))} style={{ ...S.btn('#f1f5f9'), color: '#475569', padding: '13px 18px' }}>⌫</button>
                <button onClick={() => setDialNum('')} style={{ ...S.btn('#fef2f2'), color: '#ef4444', padding: '13px 14px' }}>✕</button>
              </div>

              {dialMsg && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: dialMsg.startsWith('✅') ? '#f0fdf4' : dialMsg.startsWith('📞') ? '#eff6ff' : '#fef2f2', borderRadius: 8, fontSize: 13, fontWeight: 600, color: dialMsg.startsWith('✅') ? '#166534' : dialMsg.startsWith('📞') ? '#1d4ed8' : '#dc2626' }}>
                  {dialMsg}
                </div>
              )}
            </div>

            {/* Active call controls */}
            {callState === 'active' && (
              <div style={{ ...S.card, marginTop: 16, background: '#0f172a' }}>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 16, marginBottom: 16 }}>
                  🔴 Live · {dur(callTimer)}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={toggleMute} style={{ flex: 1, padding: '11px', background: muted ? '#f59e0b' : '#334155', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                    {muted ? '🔇 Muted' : '🎤 Mute'}
                  </button>
                  <button onClick={hangUp} style={{ flex: 1, padding: '11px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                    📵 End Call
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* IVR info */}
          <div>
            <div style={S.card}>
              <h3 style={{ margin: '0 0 14px', color: '#0f172a', fontSize: 15, fontWeight: 800 }}>🤖 IVR Menu (Inbound)</h3>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>When customers call your Twilio number, they hear:</p>
              {[
                ['1','New Business Enquiry','Routes to agent-primary'],
                ['2','Existing Client Support','Routes to agent-support'],
                ['3','Speak to Agent Now','Routes immediately to available agent'],
                ['4','Leave a Voicemail','Records up to 2 minutes + AI transcription'],
              ].map(([d,t,s]) => (
                <div key={d} style={{ display: 'flex', gap: 14, padding: '10px 0', borderBottom: '1px solid #f1f5f9', alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, background: '#6366f1', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{d}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{t}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{s}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ ...S.card, marginTop: 16, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <h4 style={{ margin: '0 0 10px', color: '#14532d' }}>📼 Voicemail features</h4>
              <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13, color: '#166534', lineHeight: 1.8 }}>
                <li>Recordings emailed to admin automatically</li>
                <li>AI transcription via Google Speech</li>
                <li>Max 2 minutes per message</li>
                <li>Stored in call log with recording URL</li>
              </ul>
            </div>
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
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>No call records yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Direction','From','To','Agent','Status','Duration','Recording','Time','Notes'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l, i) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9', background: i%2===0?'#fff':'#fafafa' }}>
                      <td style={{ padding: '10px 12px' }}>{l.direction === 'inbound' ? '📲 In' : '📞 Out'}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{l.from_number || '—'}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{l.to_number || '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{l.agent_name || '—'}</td>
                      <td style={{ padding: '10px 12px' }}><span style={S.pill(STATUS_COL[l.status]||'#94a3b8')}>{l.status}</span></td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{dur(l.duration_sec)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {l.recording_url ? <a href={l.recording_url} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', fontWeight: 700 }}>▶ Play</a> : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{ts(l.created_at)}</td>
                      <td style={{ padding: '10px 12px', minWidth: 200 }}>
                        {l.transcript && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontStyle: 'italic' }}>"{l.transcript.slice(0,80)}{l.transcript.length>80?'...':''}"</div>}
                        {l.notes && !notes[l.call_sid] && <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>{l.notes}</div>}
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input value={notes[l.call_sid]||''} onChange={e=>setNotes(n=>({...n,[l.call_sid]:e.target.value}))} placeholder="Add note..." style={{ flex:1, padding:'4px 8px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:12 }} />
                          <button onClick={()=>saveNote(l.call_sid)} disabled={!notes[l.call_sid]||savingNote===l.call_sid} style={{ padding:'4px 10px', background:'#6366f1', color:'#fff', border:'none', borderRadius:6, fontSize:12, cursor:'pointer', fontWeight:700 }}>
                            {savingNote===l.call_sid?'...':'Save'}
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
              <div>No agents registered yet.</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Go to the Softphone tab, set your status to Available, and you will appear here.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 16 }}>
              {agents.map(a => (
                <div key={a.id} style={{ background: '#f8fafc', border: `2px solid ${AGENT_COL[a.status]||'#e2e8f0'}`, borderRadius: 12, padding: '18px 20px', textAlign: 'center' }}>
                  <div style={{ width: 48, height: 48, background: AGENT_COL[a.status]+'20', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, margin: '0 auto 12px' }}>👤</div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginBottom: 6 }}>{a.name}</div>
                  {a.email && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{a.email}</div>}
                  <span style={S.pill(AGENT_COL[a.status]||'#94a3b8')}>{a.status}</span>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Last seen: {ts(a.updated_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SETUP ── */}
      {tab === 'setup' && (
        <div style={{ maxWidth: 680 }}>
          <div style={S.card}>
            <h3 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: 16, fontWeight: 800 }}>⚙️ Call Centre Setup Guide</h3>
            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 24px' }}>Follow these steps to activate voice calling. All secrets are managed securely in your environment.</p>

            {[
              { step: 1, title: 'Twilio Account', done: configured, desc: 'Create a free Twilio account at twilio.com. Add these secrets to your Replit environment:', secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'] },
              { step: 2, title: 'Get a Phone Number', done: false, desc: 'In the Twilio console, buy a phone number (from ~$1/month). Configure its inbound voice webhook to:', webhook: `${window.location.origin}/api/call-centre/inbound` },
              { step: 3, title: 'Create a TwiML App', done: false, desc: 'In Twilio Console → Voice → TwiML Apps, create a new app. Set the Voice Request URL to:', webhook: `${window.location.origin}/api/call-centre/outbound-twiml`, secrets: ['TWILIO_TWIML_APP_SID', 'TWILIO_PHONE_FROM'] },
              { step: 4, title: 'API Key (for Browser SDK)', done: false, desc: 'In Twilio Console → Account → API Keys, create a new API key. Add:', secrets: ['TWILIO_API_KEY', 'TWILIO_API_SECRET'] },
            ].map(({ step, title, done, desc, secrets, webhook }) => (
              <div key={step} style={{ display: 'flex', gap: 16, marginBottom: 20, padding: '16px 20px', background: done ? '#f0fdf4' : '#f8fafc', border: `1px solid ${done?'#bbf7d0':'#e2e8f0'}`, borderRadius: 10 }}>
                <div style={{ width: 32, height: 32, background: done?'#10b981':'#6366f1', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 14, flexShrink: 0 }}>
                  {done ? '✓' : step}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', marginBottom: 6 }}>{title} {done && <span style={{ color: '#10b981', fontSize: 12 }}>— Active</span>}</div>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: '#475569' }}>{desc}</p>
                  {secrets?.map(s => (
                    <code key={s} style={{ display: 'inline-block', background: '#1e293b', color: '#a5f3fc', padding: '3px 10px', borderRadius: 6, fontSize: 12, marginRight: 8, marginBottom: 6 }}>{s}</code>
                  ))}
                  {webhook && (
                    <div style={{ background: '#1e293b', color: '#fde68a', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all', marginTop: 8 }}>
                      {webhook}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 18px', marginTop: 8 }}>
              <strong style={{ color: '#1e40af', fontSize: 13 }}>💡 WhatsApp Tip</strong>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#1e40af' }}>
                Your existing TWILIO_WHATSAPP_FROM number may already be Twilio-enabled. Check if it can be upgraded to a voice number in your Twilio console — this would let you use one number for both WhatsApp and calls.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
