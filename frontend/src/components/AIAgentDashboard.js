import React, { useState, useEffect, useRef } from 'react';

const API = process.env.REACT_APP_API_URL || '';

const SOURCE_META = {
  google_places: { label: 'Google Places', icon: '📍', color: '#4285f4', bg: '#e8f0fe' },
  google_cse:    { label: 'Google CSE',    icon: '🔍', color: '#34a853', bg: '#e6f4ea' },
  duckduckgo:    { label: 'DuckDuckGo',    icon: '🦆', color: '#de5833', bg: '#fce8e6' },
  serpapi_bpo:   { label: 'SerpAPI',       icon: '🌐', color: '#10b981', bg: '#d1fae5' },
};

const ACTION_ICONS = {
  agent_start: '🚀', lead_search: '🔍', email_sent: '📧', followup_sent: '📩',
  followup_sequence: '🔄', application_acknowledged: '✅', application_approved: '🎉',
  contract_assigned: '📋', contract_assign: '📋', application_process: '⚙️',
  heartbeat: '💓', error: '❌', prospect_scan: '🌐', prospect_outreach: '📤',
  prospect_followup: '🔁', bounce_process: '🚫', payment_chase: '💰',
  payment_auto_release: '💸', ai_job_start: '🤖', ai_job_complete: '✔️',
  ai_job_error: '⚠️', outreach_sent: '📨', web_scrape: '🕷️',
  scrape_outreach: '📬', scrape_followup: '🔂', ai_outreach: '📧',
};

const ACTION_COLORS = {
  email_sent: '#0ea5e9', scrape_outreach: '#0ea5e9', prospect_outreach: '#0ea5e9',
  ai_outreach: '#0ea5e9', outreach_sent: '#0ea5e9',
  web_scrape: '#8b5cf6', lead_search: '#8b5cf6', prospect_scan: '#8b5cf6',
  contract_assigned: '#f59e0b', contract_assign: '#f59e0b',
  followup_sent: '#06b6d4', followup_sequence: '#06b6d4', scrape_followup: '#06b6d4',
  error: '#ef4444', ai_job_error: '#ef4444',
  application_approved: '#10b981', ai_job_complete: '#10b981', payment_auto_release: '#10b981',
};

function fmt(n) { return n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(1)}K` : (n||0).toString(); }

function timeAgo(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

function fmtDay(d) {
  if (!d) return '—';
  const dt = new Date(d);
  const today = new Date();
  const yest  = new Date(today); yest.setDate(yest.getDate()-1);
  if (dt.toDateString() === today.toDateString()) return 'Today';
  if (dt.toDateString() === yest.toDateString())  return 'Yesterday';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function Pulse({ color = '#10b981', size = 8 }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: color,
      boxShadow: `0 0 0 0 ${color}`, animation: 'pulseRing 1.5s infinite' }} />
  );
}

// ── Scraper source card ───────────────────────────────────────────────────────
function SourceCard({ source, isActive, currentQuery, stats }) {
  const meta = SOURCE_META[source] || { label: source, icon: '🔎', color: '#64748b', bg: '#f1f5f9' };
  // Use per-source session totals if available; fall back to scanning recentQueries
  const srcStat = stats?.sourceStats?.[source];
  const found   = srcStat ? (srcStat.found || 0) : (stats?.recentQueries?.filter(q => q.source === source).reduce((a, b) => a + (b.found || 0), 0) || 0);
  const queries  = srcStat ? (srcStat.queries || 0) : (stats?.recentQueries?.filter(q => q.source === source).length || 0);

  return (
    <div style={{
      background: isActive ? meta.bg : '#fff',
      border: `2px solid ${isActive ? meta.color : '#e2e8f0'}`,
      borderRadius: 12, padding: '14px 16px', transition: 'all 0.3s',
      boxShadow: isActive ? `0 0 16px ${meta.color}30` : '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{meta.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: meta.color }}>{meta.label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isActive ? <Pulse color={meta.color} size={6} /> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#cbd5e1', display: 'inline-block' }} />}
            <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? meta.color : '#94a3b8' }}>
              {isActive ? 'QUERYING' : 'IDLE'}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: meta.color }}>{fmt(found)}</div>
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>contacts</div>
        </div>
      </div>
      {isActive && currentQuery && (
        <div style={{ fontSize: 10, color: meta.color, background: '#fff', padding: '5px 8px', borderRadius: 6, marginTop: 4, wordBreak: 'break-word', lineHeight: 1.4, fontWeight: 600 }}>
          {currentQuery}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>{queries} queries recent</span>
      </div>
    </div>
  );
}

// ── Live feed item ────────────────────────────────────────────────────────────
function FeedItem({ item }) {
  const isScraperEvent = item._type === 'scraper';
  const color = isScraperEvent
    ? (SOURCE_META[item.source]?.color || '#8b5cf6')
    : (ACTION_COLORS[item.action_type] || '#64748b');

  return (
    <div style={{
      display: 'flex', gap: 10, padding: '6px 12px', borderBottom: '1px solid #0f172a',
      alignItems: 'flex-start', background: 'transparent',
    }}>
      <div style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>
        {isScraperEvent ? (SOURCE_META[item.source]?.icon || '🕷️') : (ACTION_ICONS[item.action_type] || '⚙️')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {isScraperEvent ? (
          <>
            <span style={{ fontSize: 11, fontWeight: 700, color }}>
              [{SOURCE_META[item.source]?.label || item.source}]
            </span>
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{item.query?.slice(0, 70)}</span>
            {item.found > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginLeft: 6 }}>+{item.found}</span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{item.description}</span>
        )}
      </div>
      <div style={{ fontSize: 10, color: '#475569', flexShrink: 0, fontFamily: 'monospace' }}>
        {timeAgo(item.ts || item.created_at)}
      </div>
    </div>
  );
}

export default function AIAgentDashboard({ token }) {
  const [live, setLive]             = useState(null);
  const [activities, setActivities] = useState([]);
  const [activeTab, setActiveTab]   = useState('ops');
  const [triggering, setTriggering] = useState('');
  const [triggerMsg, setTriggerMsg] = useState('');
  const [loading, setLoading]       = useState(true);
  const [emailStats, setEmailStats] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const feedRef  = useRef(null);
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  // Always-current fetch helpers — defined as refs so intervals never need restarting
  const doFetchLive = async () => {
    try {
      const h = { Authorization: `Bearer ${tokenRef.current}` };
      const data = await fetch(`${API}/api/ai-agent/live`, { headers: h }).then(r => r.json());
      setLive(data);
      setLoading(false);
      setLastRefresh(new Date());
    } catch {}
  };
  const doFetchActivity = async () => {
    try {
      const h = { Authorization: `Bearer ${tokenRef.current}` };
      const data = await fetch(`${API}/api/ai-agent/activity?limit=40`, { headers: h }).then(r => r.json());
      setActivities(data.activities || []);
    } catch {}
  };
  const doFetchEmailStats = async () => {
    try {
      const h = { Authorization: `Bearer ${tokenRef.current}` };
      const data = await fetch(`${API}/api/email-stats`, { headers: h }).then(r => r.json());
      setEmailStats(data);
    } catch {}
  };

  // Store latest versions in refs so the interval callbacks always call the current function
  const liveRef       = useRef(doFetchLive);
  const activityRef   = useRef(doFetchActivity);
  const emailStatsRef = useRef(doFetchEmailStats);
  liveRef.current       = doFetchLive;
  activityRef.current   = doFetchActivity;
  emailStatsRef.current = doFetchEmailStats;

  // Set up intervals ONCE on mount — never cleared until unmount
  useEffect(() => {
    liveRef.current();
    activityRef.current();
    emailStatsRef.current();
    const iv1 = setInterval(() => liveRef.current(),       15000);
    const iv2 = setInterval(() => activityRef.current(),   15000);
    const iv3 = setInterval(() => emailStatsRef.current(), 15000);
    return () => { clearInterval(iv1); clearInterval(iv2); clearInterval(iv3); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleEmailPause() {
    const newPaused = !emailStats?.paused;
    try {
      const h = { Authorization: `Bearer ${tokenRef.current}`, 'Content-Type': 'application/json' };
      await fetch(`${API}/api/email-pause`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ paused: newPaused }),
      });
      doFetchEmailStats();
    } catch {}
  }

  async function trigger(task) {
    setTriggering(task);
    setTriggerMsg('');
    try {
      const h = { Authorization: `Bearer ${tokenRef.current}` };
      const r = await fetch(`${API}/api/ai-agent/trigger/${task}`, { method: 'POST', headers: h });
      const data = await r.json();
      setTriggerMsg(data.message || data.error || 'Done');
      setTimeout(() => { liveRef.current(); activityRef.current(); setTriggerMsg(''); }, 2000);
    } catch (e) {
      setTriggerMsg('Error: ' + e.message);
    } finally {
      setTriggering('');
    }
  }

  const scraper   = live?.scraper   || {};
  const outreach  = live?.outreach  || {};
  const db        = live?.db        || {};
  const daily     = live?.dailyStats || [];

  // Build merged live feed (scraper recent queries + activity log)
  const scraperFeed = (scraper.recentQueries || []).map(q => ({ ...q, _type: 'scraper', ts: q.ts }));
  const activityFeed = activities.map(a => ({ ...a, _type: 'activity', ts: a.created_at }));
  const merged = [...scraperFeed, ...activityFeed]
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, 80);

  const totalDb = parseInt(db.grand_total) || 0;
  const isOnline = live?.running;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div style={{ textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Connecting to AI Agent...</div>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '0 0 48px', maxWidth: 1280, margin: '0 auto', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif' }}>
      <style>{`
        @keyframes pulseRing {
          0%   { box-shadow: 0 0 0 0 currentColor; }
          70%  { box-shadow: 0 0 0 8px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes slideIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
        .trig-btn { border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer;transition:all 0.15s; }
        .trig-btn:hover { filter:brightness(1.12); transform:translateY(-1px); }
        .trig-btn:disabled { opacity:0.55;cursor:not-allowed;transform:none; }
        .tab-btn { background:none;border:none;padding:10px 20px;cursor:pointer;font-size:13px;font-weight:700;color:#64748b;border-bottom:3px solid transparent;transition:all 0.2s; }
        .tab-btn.active { color:#6366f1;border-bottom-color:#6366f1; }
        .feed-item { animation: slideIn 0.2s ease; }
        .stat-num { font-variant-numeric: tabular-nums; }
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)', borderRadius: 16, padding: '20px 28px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 36 }}>🤖</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: -0.5 }}>CTS BPO — LIVE OPERATIONS CENTER</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              {isOnline ? <Pulse color="#10b981" size={8} /> : <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />}
              <span style={{ fontSize: 12, fontWeight: 700, color: isOnline ? '#10b981' : '#ef4444' }}>
                {isOnline ? 'ONLINE — All systems running' : 'OFFLINE'}
              </span>
              {live?.startedAt && <span style={{ fontSize: 11, color: '#64748b' }}>· since {timeAgo(live.startedAt)}</span>}
              {lastRefresh && (
                <span style={{ fontSize: 10, color: '#475569', marginLeft: 6, fontFamily: 'monospace' }}>
                  ↻ {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Top KPIs */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'TOTAL CONTACTS DB', val: fmt(totalDb),                      color: '#38bdf8' },
            { label: 'SCRAPER QUERIES',   val: fmt(scraper.totalQueries),          color: '#a78bfa' },
            { label: 'CONTACTS ADDED',    val: fmt(scraper.totalContactsAdded),    color: '#34d399' },
            { label: 'EMAILS SENT TODAY', val: fmt(outreach.sentToday),            color: '#fb923c' },
            { label: 'SESSION EMAILS',    val: fmt(outreach.sentThisSession),      color: '#f472b6' },
          ].map(k => (
            <div key={k.label} style={{ textAlign: 'center' }}>
              <div className="stat-num" style={{ fontSize: 22, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.val || '0'}</div>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#475569', letterSpacing: 1, textTransform: 'uppercase', marginTop: 3 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TABS ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
        <button className={`tab-btn${activeTab==='ops'?' active':''}`} onClick={()=>setActiveTab('ops')}>⚡ Live Ops</button>
        <button className={`tab-btn${activeTab==='daily'?' active':''}`} onClick={()=>setActiveTab('daily')}>📅 Daily Stats</button>
        <button className={`tab-btn${activeTab==='triggers'?' active':''}`} onClick={()=>setActiveTab('triggers')}>🎮 Triggers</button>
        <button className={`tab-btn${activeTab==='contacts'?' active':''}`} onClick={()=>setActiveTab('contacts')}>🕷️ Scraped Contacts</button>
      </div>

      {/* ══════════════════ OPS TAB ══════════════════════════════════════════ */}
      {activeTab === 'ops' && (
        <div>
          {/* ── Row 1: Scraper cards + Live feed + Email pipeline ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 260px', gap: 16, marginBottom: 16 }}>

            {/* Scraper cards */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
                🕷️ Scrapers — Non-Stop
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.keys(SOURCE_META).map(src => (
                  <SourceCard
                    key={src}
                    source={src}
                    isActive={scraper.source === src}
                    currentQuery={scraper.source === src ? scraper.query : null}
                    stats={scraper}
                  />
                ))}
              </div>
              {/* Cycle / total stats */}
              <div style={{ marginTop: 10, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 6 }}>SCRAPER TOTALS</div>
                {[
                  { l: 'Queries run', v: fmt(scraper.totalQueries) },
                  { l: 'Contacts added', v: fmt(scraper.totalContactsAdded) },
                  { l: 'Cycles done', v: scraper.cyclesCompleted || 0 },
                  { l: 'Last query', v: timeAgo(scraper.lastQueryTs) },
                ].map(r => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b' }}>{r.l}</span>
                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{r.v}</span>
                  </div>
                ))}
                {/* Current cycle progress bar */}
                {scraper.queriesPerCycle > 0 && (() => {
                  const done  = scraper.queriesDoneThisCycle || 0;
                  const total = scraper.queriesPerCycle;
                  const pct   = Math.min(100, Math.round((done / total) * 100));
                  return (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                        <span style={{ color: '#64748b', fontWeight: 700 }}>Cycle progress</span>
                        <span style={{ fontWeight: 800, color: '#0f172a' }}>{done}/{total} ({pct}%)</span>
                      </div>
                      <div style={{ background: '#e2e8f0', borderRadius: 999, height: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, background: '#6366f1', height: '100%', borderRadius: 999, transition: 'width 0.5s ease' }} />
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
                        {total - done} unique {total - done === 1 ? 'query' : 'queries'} remaining — no repeats until cycle resets
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Live activity feed */}
            <div style={{ background: '#0f172a', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Pulse color="#10b981" />
                <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: 1, textTransform: 'uppercase' }}>Live Activity Feed</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#475569' }}>↻ 2s</span>
              </div>
              <div ref={feedRef} style={{ flex: 1, overflowY: 'auto', maxHeight: 520 }}>
                {merged.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: '#475569', fontSize: 13 }}>Waiting for activity...</div>
                ) : merged.map((item, i) => (
                  <FeedItem key={`${item._type}-${i}`} item={item} />
                ))}
              </div>
            </div>

            {/* Email pipeline + DB volumes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Email pipeline */}
              <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>📧 Email Pipeline</div>

                {/* Sending animation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '10px 12px', background: outreach.lastSentAt && (Date.now()-new Date(outreach.lastSentAt))<10000 ? '#f0fdf4' : '#f8fafc', borderRadius: 8, border: `1px solid ${outreach.lastSentAt && (Date.now()-new Date(outreach.lastSentAt))<10000 ? '#bbf7d0' : '#e2e8f0'}` }}>
                  {outreach.lastSentAt && (Date.now()-new Date(outreach.lastSentAt))<30000 ? (
                    <><Pulse color="#10b981" /><div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981' }}>SENDING</div>
                      <div style={{ fontSize: 10, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{outreach.lastSentTo}</div>
                    </div></>
                  ) : (
                    <><span style={{ fontSize: 16 }}>💤</span><div style={{ fontSize: 11, color: '#94a3b8' }}>Queue ready</div></>
                  )}
                </div>

                {[
                  { l: 'Sent today', v: fmt(outreach.sentToday), c: '#0ea5e9' },
                  { l: 'Sent this session', v: fmt(outreach.sentThisSession), c: '#6366f1' },
                  { l: 'All time', v: fmt(db.totalEmailsAllTime), c: '#f59e0b' },
                  { l: 'Last sent', v: timeAgo(outreach.lastSentAt), c: '#64748b' },
                ].map(r => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>{r.l}</span>
                    <span className="stat-num" style={{ fontSize: 14, fontWeight: 900, color: r.c }}>{r.v || '0'}</span>
                  </div>
                ))}
              </div>

              {/* DB Volumes */}
              <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>🗄️ Database Volumes</div>
                {[
                  { l: 'Scraped Contacts', t: db.scraped_contacts?.total, p: db.scraped_contacts?.pending, c: '#ec4899' },
                  { l: 'AI Leads',         t: db.ai_leads?.total,         p: db.ai_leads?.pending,         c: '#6366f1' },
                  { l: 'Job Leads',        t: db.job_leads?.total,        p: db.job_leads?.pending,        c: '#0ea5e9' },
                ].map(r => (
                  <div key={r.l} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{r.l}</span>
                      <span className="stat-num" style={{ fontSize: 13, fontWeight: 900, color: r.c }}>{fmt(r.t)}</span>
                    </div>
                    {/* Mini progress bar: pending / total */}
                    <div style={{ height: 4, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, ((r.p||0) / Math.max(r.t||1, 1)) * 100)}%`, background: r.c, transition: 'width 1s ease', borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{fmt(r.p)} pending outreach</div>
                  </div>
                ))}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '2px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>GRAND TOTAL</span>
                  <span className="stat-num" style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{fmt(db.grand_total)}</span>
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Last refresh: {timeAgo(db.lastRefresh)}</div>
              </div>
            </div>
          </div>

          {/* SerpAPI rate-limit banner */}
          {scraper.rateLimited && (
            <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 12, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>⏳</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#b45309', letterSpacing: 1, textTransform: 'uppercase' }}>SerpAPI Daily Quota Hit — Searches Paused</div>
                <div style={{ fontSize: 12, color: '#78350f', marginTop: 2 }}>Resuming in {scraper.rateLimitedMinsLeft} min — scraper will restart automatically</div>
              </div>
            </div>
          )}

          {/* Current scraper query highlight */}
          {scraper.running && scraper.query && (
            <div style={{ background: '#fdf4ff', border: '2px solid #c084fc', borderRadius: 12, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20, animation: 'spin 3s linear infinite', display: 'inline-block' }}>🕷️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#7c3aed', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Currently Scraping — {SOURCE_META[scraper.source]?.label || scraper.source}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>"{scraper.query}"</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="stat-num" style={{ fontSize: 22, fontWeight: 900, color: '#7c3aed' }}>{scraper.lastFound || 0}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>last query</div>
              </div>
            </div>
          )}

          {/* ── Email Agent Status — 15s live ──────────────────────────────── */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
                📧 Email Agents
                <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>↻ 15s live</span>
              </div>

              {/* Master pause / resume toggle */}
              <button onClick={toggleEmailPause} style={{
                marginLeft: 'auto',
                padding: '8px 20px',
                borderRadius: 8,
                border: 'none',
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
                background: emailStats?.paused ? '#16a34a' : '#dc2626',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: emailStats?.paused ? '0 0 0 3px #bbf7d030' : '0 0 0 3px #fecaca30',
              }}>
                {emailStats?.paused ? '▶ Resume Email Sending' : '⏸ Pause Email Sending'}
              </button>
            </div>

            {/* Global pause banner */}
            {emailStats?.paused && (
              <div style={{ marginBottom: 12, padding: '12px 18px', background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>⏸</span>
                <div>
                  <div style={{ fontWeight: 800, color: '#991b1b', fontSize: 14 }}>All email outreach is PAUSED</div>
                  <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 2 }}>No emails are being sent. Click "Resume Email Sending" above to re-activate all outreach pipelines.</div>
                </div>
              </div>
            )}
            
            {(() => {
              const configured = (emailStats?.providers || []).filter(p => p.configured);
              const allBroken  = configured.length > 0 && configured.every(p => p.broken);
              const gmailDailyLimit = configured.find(p => p.name === 'Gmail' && p.broken && (p.sentToday || 0) >= Math.floor((p.dailyCap || 500) * 0.5));
              if (!allBroken) return null;
              return gmailDailyLimit ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: '#fef2f2', border: '1.5px solid #f87171', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
                  <span style={{ fontSize: 22 }}>🛑</span>
                  <div>
                    <div style={{ fontWeight: 800, color: '#991b1b', fontSize: 14 }}>Gmail daily sending limit reached — outreach resumes tomorrow</div>
                    <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4, lineHeight: 1.5 }}>
                      Gmail has sent its maximum emails for today. Fix a backup provider to avoid this gap tomorrow:<br/>
                      • <b>MailerLite</b>: Enable Transactional Emails add-on in your account.<br/>
                      • <b>Mailgun</b>: Upgrade to Flex plan or add verified sandbox recipients.<br/>
                      • <b>Mailjet</b>: Verify MAILJET_API_KEY and MAILJET_SECRET_KEY secrets are not swapped.
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: '#fff7ed', border: '1.5px solid #f97316', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
                  <span style={{ fontSize: 22 }}>⚠️</span>
                  <div>
                    <div style={{ fontWeight: 800, color: '#9a3412', fontSize: 14 }}>All email providers are unavailable</div>
                    <div style={{ fontSize: 12, color: '#c2410c', marginTop: 4, lineHeight: 1.5 }}>
                      No emails can be sent right now. Please fix at least one provider:<br/>
                      • <b>MailerLite</b>: Enable the Transactional Emails add-on in your MailerLite account.<br/>
                      • <b>Mailgun</b>: Upgrade to Flex plan or add recipients to your sandbox allowlist.<br/>
                      • <b>Mailjet</b>: Verify MAILJET_API_KEY and MAILJET_SECRET_KEY are set correctly.<br/>
                      • <b>Gmail</b>: Regenerate your App Password at myaccount.google.com → Security → App Passwords.
                    </div>
                  </div>
                </div>
              );
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              {(emailStats?.providers || [
                { name: 'MailerLite', configured: false },
                { name: 'Mailgun',    configured: false },
                { name: 'Mailjet',    configured: false },
                { name: 'Gmail',      configured: false },
              ]).map(p => {
                const pct      = p.dailyCap ? Math.min(100, Math.round((p.sentToday / p.dailyCap) * 100)) : null;
                const atStop   = p.stopAt   && p.sentToday >= p.stopAt;
                const isFull   = pct !== null && pct >= 100;
                const isPaused = p.circuit?.open;
                const isBroken = !!p.broken;
                const bg   = !p.configured ? '#f8fafc' : isBroken ? '#fff7ed' : isFull || atStop ? '#fef2f2' : isPaused ? '#fffbeb' : p.active ? '#f0fdf4' : '#f8fafc';
                const dot  = !p.configured ? '#94a3b8' : isBroken ? '#f97316' : isFull || atStop ? '#ef4444' : isPaused ? '#f59e0b' : p.active ? '#22c55e' : '#94a3b8';
                const hitDailyLimit = isBroken && (p.sentToday || 0) >= Math.floor((p.dailyCap || 500) * 0.5);
                const status = !p.configured ? 'Not set up'
                             : isBroken && hitDailyLimit ? '🛑 Daily limit reached'
                             : isBroken      ? '⚠️ Unavailable — check credentials'
                             : atStop        ? '🛑 Stopped at 99%'
                             : isFull        ? 'Daily limit reached'
                             : isPaused      ? '⏸ Paused'
                             : p.active      ? 'Active sender'
                             :                 'Standby';
                return (
                  <div key={p.name} style={{ background: bg, border: `1px solid ${dot}30`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0,
                        boxShadow: p.active && !atStop && !isFull && !isPaused ? `0 0 0 3px ${dot}30` : 'none' }} />
                      <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{p.name}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: dot }}>{status}</span>
                    </div>
                    {p.configured ? (
                      <>
                        <div style={{ fontSize: 32, fontWeight: 900, color: atStop || isFull ? '#ef4444' : '#1e293b', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                          {p.sentToday ?? 0}
                          <span style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>/{p.dailyCap ?? '∞'}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>emails sent today</div>
                        {p.dailyCap && (
                          <>
                            <div style={{ marginTop: 8, background: '#e2e8f0', borderRadius: 3, height: 6 }}>
                              <div style={{ width: `${pct}%`, background: atStop || isFull ? '#ef4444' : pct > 80 ? '#f59e0b' : '#22c55e', height: '100%', borderRadius: 3, transition: 'width 0.6s' }} />
                            </div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
                              {pct}% used · stops at {p.stopAt} (99%)
                            </div>
                          </>
                        )}
                        {atStop && (
                          <div style={{ marginTop: 6, fontSize: 11, color: '#991b1b', background: '#fee2e2', padding: '4px 8px', borderRadius: 4, fontWeight: 700 }}>
                            🛑 Sending paused — 99% cap reached. Resumes tomorrow.
                          </div>
                        )}
                        {isPaused && p.circuit && !atStop && (
                          <div style={{ marginTop: 6, fontSize: 11, color: '#b45309', background: '#fef3c7', padding: '4px 8px', borderRadius: 4 }}>
                            ⏳ Resumes in {p.circuit.minutesLeft > 60 ? `${Math.ceil(p.circuit.minutesLeft/60)}h` : `${p.circuit.minutesLeft}m`}
                          </div>
                        )}
                        {p.account && <div style={{ marginTop: 5, fontSize: 11, color: '#94a3b8' }}>{p.account}</div>}
                      </>
                    ) : (
                      <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>No API key configured</div>
                    )}
                  </div>
                );
              })}
            </div>
            {emailStats && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  Today (DB verified): <strong style={{ color: '#0ea5e9' }}>{(emailStats.todayDb || 0).toLocaleString()}</strong>
                </span>
                <span>
                  All-time: <strong style={{ color: '#64748b' }}>{(emailStats.allTime || 0).toLocaleString()}</strong>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════ DAILY STATS TAB ══════════════════════════════════ */}
      {activeTab === 'daily' && (
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
            📅 Daily Performance — Last 7 Days
          </div>
          <div style={{ padding: '0 24px 24px' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr', gap: 16, padding: '12px 0', borderBottom: '2px solid #e2e8f0', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16 }}>
              <span>Date</span><span>New Leads</span><span>Contacts Added</span><span>Emails Sent</span>
            </div>
            {daily.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
                <div>Stats will appear here as the agent runs</div>
              </div>
            ) : daily.map((d, i) => (
              <div key={d.day} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr', gap: 16, padding: '14px 0', borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {i === 0 && <Pulse color="#10b981" size={7} />}
                  <span style={{ fontSize: 14, fontWeight: i === 0 ? 900 : 600, color: i === 0 ? '#0f172a' : '#334155' }}>{fmtDay(d.day)}</span>
                </div>
                <div className="stat-num" style={{ fontSize: 18, fontWeight: 800, color: '#6366f1' }}>{fmt(d.leads || 0)}</div>
                <div className="stat-num" style={{ fontSize: 18, fontWeight: 800, color: '#ec4899' }}>{fmt(d.contacts || 0)}</div>
                <div className="stat-num" style={{ fontSize: 18, fontWeight: 800, color: '#0ea5e9' }}>{fmt(d.emails || 0)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════ TRIGGERS TAB ═════════════════════════════════════ */}
      {activeTab === 'triggers' && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', marginBottom: 6 }}>🎮 Manual Agent Triggers</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>Force any agent task to run immediately.</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {[
              { key: 'lead_search',       label: '🔍 Lead Search',           bg: '#6366f1' },
              { key: 'ai_lead_outreach',  label: '📧 AI Lead Outreach',       bg: '#0ea5e9' },
              { key: 'prospect_outreach', label: '📤 Prospect Outreach',      bg: '#7c3aed' },
              { key: 'scrape_outreach',   label: '📬 Scrape Outreach',        bg: '#db2777' },
              { key: 'followup',          label: '📩 Send Follow-ups',        bg: '#0284c7' },
              { key: 'scrape_followup',   label: '🔂 Scrape Follow-ups',      bg: '#9333ea' },
              { key: 'applications',      label: '✅ Process Applications',    bg: '#10b981' },
              { key: 'contracts',         label: '📋 Assign Contracts',       bg: '#f59e0b' },
              { key: 'bounce_check',      label: '🚫 Process Bounces',        bg: '#64748b' },
              { key: 'payment_chase',     label: '💰 Payment Chase',          bg: '#dc2626' },
              { key: 'all',               label: '⚡ Run Everything Now',      bg: '#0f172a' },
            ].map(({ key, label, bg }) => (
              <button key={key} className="trig-btn" style={{ background: bg, color: '#fff' }} disabled={!!triggering} onClick={() => trigger(key)}>
                {triggering === key ? <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳ </span> : null}
                {label}
              </button>
            ))}
          </div>
          {triggerMsg && (
            <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#166534', fontWeight: 600 }}>
              {triggerMsg}
            </div>
          )}
          {/* Schedule reference */}
          <div style={{ marginTop: 24, borderTop: '1px solid #f1f5f9', paddingTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Automatic Schedule</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
              {[
                { label: 'Web Scraper',    freq: 'Non-stop continuous loop',     color: '#ec4899' },
                { label: 'Lead Search',    freq: 'Every 30 min',                 color: '#6366f1' },
                { label: 'AI Outreach',    freq: 'Every 5 min (up to 500/run)',  color: '#0ea5e9' },
                { label: 'Job Outreach',   freq: 'Every 5 min (up to 500/run)',  color: '#7c3aed' },
                { label: 'Scrape Outreach',freq: 'Every 5 min (up to 500/run)',  color: '#db2777' },
                { label: 'Follow-ups',     freq: 'Every 2 hours',               color: '#0284c7' },
                { label: 'Applications',   freq: 'Every 30 min',                color: '#10b981' },
                { label: 'Contracts',      freq: 'Every 1 hour',                color: '#f59e0b' },
                { label: 'Payment Chase',  freq: 'Every 1 hour',                color: '#dc2626' },
                { label: 'Bounce Check',   freq: 'Every 20 min',                color: '#64748b' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: `1px solid ${s.color}30` }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>{s.freq}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ SCRAPED CONTACTS TAB ════════════════════════════ */}
      {activeTab === 'contacts' && (
        <ScrapedContactsPanel token={token} live={live} />
      )}
    </div>
  );
}

// Separate panel for scraped contacts (lazy loads its data)
function ScrapedContactsPanel({ token, live }) {
  const [data, setData] = useState({ stats: null, contacts: [] });
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  const doFetch = () => {
    const h = { Authorization: `Bearer ${tokenRef.current}` };
    fetch(`${API}/api/ai-agent/scraped-contacts`, { headers: h })
      .then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  };
  const fetchRef = useRef(doFetch);
  fetchRef.current = doFetch;

  useEffect(() => {
    fetchRef.current();
    const iv = setInterval(() => fetchRef.current(), 15000);
    return () => clearInterval(iv);
  }, []);

  const s = data.stats || {};
  const contacts = data.contacts || [];

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div>;

  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 10, padding: '16px 20px', background: 'linear-gradient(135deg,#fdf4ff,#f0f9ff)', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        {[
          { l: 'Total',        v: s.total,          c: '#7c3aed' },
          { l: 'Pending',      v: s.pending,         c: '#0ea5e9' },
          { l: 'Contacted',    v: s.contacted,       c: '#f59e0b' },
          { l: 'Follow-up 1',  v: s.followup1,      c: '#f97316' },
          { l: 'Follow-up 2',  v: s.followup2,      c: '#ef4444' },
          { l: 'Bounced',      v: s.bounced,         c: '#94a3b8' },
          { l: 'Converted',    v: s.converted,       c: '#10b981' },
          { l: 'Unique Domains', v: s.unique_domains, c: '#ec4899' },
        ].map(k => (
          <div key={k.l} style={{ textAlign: 'center', padding: '6px 14px', background: '#fff', borderRadius: 8, border: `1px solid ${k.c}25` }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: k.c }}>{fmt(k.v || 0)}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{k.l}</div>
          </div>
        ))}
      </div>
      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 130px 110px 90px 90px', gap: 8, padding: '10px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
        <span>Company / Domain</span><span>Email</span><span>Business Type</span><span>Location</span><span>Source</span><span>Status</span>
      </div>
      {contacts.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🕷️</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Scraper is running — contacts will appear here shortly</div>
          <div style={{ fontSize: 13 }}>The continuous scraper is cycling through 675+ queries. Check back in a minute.</div>
        </div>
      ) : contacts.map(c => {
        const srcColor = { google_places: '#4285f4', google_cse: '#34a853', duckduckgo: '#de5833', serpapi_bpo: '#10b981' }[c.source] || '#94a3b8';
        const stColor  = { new: '#0ea5e9', contacted: '#f59e0b', followup1: '#f97316', followup2: '#ef4444', bounced: '#94a3b8', converted: '#10b981' }[c.status] || '#94a3b8';
        return (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 130px 110px 90px 90px', gap: 8, padding: '11px 20px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', fontSize: 12 }}>
            <div>
              <div style={{ fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company || c.domain}</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.domain}</div>
            </div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#334155' }}>{c.email}</div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b' }}>{c.business_type || '—'}</div>
            <div style={{ color: '#64748b', fontSize: 11 }}>{c.city || ''}{c.country ? `, ${c.country}` : ''}</div>
            <div><span style={{ background: `${srcColor}18`, color: srcColor, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{(c.source || '').replace('_', ' ')}</span></div>
            <div><span style={{ background: `${stColor}18`, color: stColor, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{c.status}</span></div>
          </div>
        );
      })}
    </div>
  );
}
