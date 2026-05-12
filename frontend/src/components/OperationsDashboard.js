import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API = '';

function timeAgo(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 5)     return 'just now';
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function fmt(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function fmtZar(n) {
  if (!n) return 'R 0';
  return `R ${Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
}

const ACTION_META = {
  agent_start:              { icon: '🚀', color: '#22c55e',  label: 'Agent Started'         },
  lead_search:              { icon: '🔍', color: '#3b82f6',  label: 'Lead Search'            },
  email_sent:               { icon: '📧', color: '#6366f1',  label: 'Email Sent'             },
  scrape_outreach:          { icon: '📧', color: '#6366f1',  label: 'Outreach Email'         },
  prospect_outreach:        { icon: '📧', color: '#6366f1',  label: 'Prospect Email'         },
  outreach_sent:            { icon: '📧', color: '#6366f1',  label: 'Outreach Sent'          },
  ai_outreach:              { icon: '📧', color: '#6366f1',  label: 'AI Email'               },
  followup_sent:            { icon: '📩', color: '#06b6d4',  label: 'Follow-Up Sent'         },
  scrape_followup:          { icon: '📩', color: '#06b6d4',  label: 'Follow-Up'              },
  followup_sequence:        { icon: '🔄', color: '#06b6d4',  label: 'Follow-Up Sequence'     },
  web_scrape:               { icon: '🕷️', color: '#8b5cf6',  label: 'Web Scrape'             },
  scrape_collect:           { icon: '🌐', color: '#64748b',  label: 'Contacts Scraped'       },
  prospect_scan:            { icon: '🌐', color: '#8b5cf6',  label: 'Prospect Scan'          },
  platform_scan:            { icon: '🎯', color: '#0ea5e9',  label: 'Platform Job Scan'      },
  application_acknowledged: { icon: '✅', color: '#10b981',  label: 'Application Ack\'d'     },
  application_approved:     { icon: '🎉', color: '#10b981',  label: 'Application Approved'   },
  contract_assigned:        { icon: '📋', color: '#f59e0b',  label: 'Contract Assigned'      },
  contract_assign:          { icon: '📋', color: '#f59e0b',  label: 'Contract Assigned'      },
  inbox_reply:              { icon: '💬', color: '#10b981',  label: 'Reply Handled'          },
  client_onboarded:         { icon: '🎉', color: '#22c55e',  label: 'Client Onboarded'       },
  auto_response:            { icon: '🤖', color: '#14b8a6',  label: 'Auto-Response'          },
  ai_job_start:             { icon: '⚙️',  color: '#f59e0b',  label: 'Job Started'            },
  ai_job_complete:          { icon: '✔️',  color: '#10b981',  label: 'Job Completed'          },
  ai_job_process:           { icon: '⚙️',  color: '#f59e0b',  label: 'Job Processing'         },
  bounce_process:           { icon: '🚫', color: '#ef4444',  label: 'Bounce Handled'         },
  payment_chase:            { icon: '💰', color: '#f59e0b',  label: 'Payment Chase'          },
  payment_auto_release:     { icon: '💸', color: '#10b981',  label: 'Payment Released'       },
  heartbeat:                { icon: '💓', color: '#94a3b8',  label: 'Heartbeat'              },
  system_health:            { icon: '🩺', color: '#94a3b8',  label: 'Health Check'           },
  email_circuit:            { icon: '⚡', color: '#f59e0b',  label: 'Circuit Breaker'        },
  error:                    { icon: '❌', color: '#ef4444',  label: 'Error'                  },
};

const TRIGGER_ACTIONS = [
  { task: 'scrape_outreach', label: 'Send Outreach Emails',   icon: '📧', color: '#6366f1' },
  { task: 'followup',        label: 'Run Follow-Ups',         icon: '📩', color: '#06b6d4' },
  { task: 'lead_search',     label: 'Search for Leads',       icon: '🔍', color: '#3b82f6' },
  { task: 'web_scrape',      label: 'Scrape New Contacts',    icon: '🕷️', color: '#8b5cf6' },
  { task: 'applications',    label: 'Process Applications',   icon: '📋', color: '#10b981' },
  { task: 'all',             label: '🚀 Run Everything Now',  icon: '',   color: null       },
];

function KpiCard({ icon, label, value, sub, color, alert }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '18px 20px',
      borderLeft: `4px solid ${alert ? '#ef4444' : color}`,
      boxShadow: '0 1px 6px rgba(0,0,0,0.07)', flex: 1, minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: alert ? '#ef4444' : '#0f172a', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function NextRunRow({ icon, label, nextAt, color }) {
  const [cd, setCd] = useState('');
  useEffect(() => {
    if (!nextAt) return;
    const tick = () => {
      const d = new Date(nextAt) - Date.now();
      if (d <= 0) { setCd('running now'); return; }
      const m = Math.floor(d / 60000);
      const s = Math.floor((d % 60000) / 1000);
      setCd(`${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextAt]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: 16, width: 22 }}>{icon}</span>
      <div style={{ flex: 1, fontSize: 12, color: '#374151', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: color || '#6366f1', fontFamily: 'monospace', minWidth: 60, textAlign: 'right' }}>
        {cd || '—'}
      </div>
    </div>
  );
}

function ActivityItem({ item, isNew }) {
  const meta = ACTION_META[item.action_type] || { icon: '⚙️', color: '#64748b', label: item.action_type };
  const statusColor = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', skipped: '#94a3b8', info: '#3b82f6' }[item.status] || '#94a3b8';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 10, alignItems: 'flex-start',
      padding: '9px 14px', borderBottom: '1px solid #f8fafc',
      background: isNew ? '#f0fdf4' : 'transparent', transition: 'background 2s',
    }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${meta.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
        {meta.icon}
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: meta.color }}>{meta.label}</span>
          <span style={{ fontSize: 10, background: `${statusColor}22`, color: statusColor, borderRadius: 20, padding: '1px 7px', fontWeight: 700, textTransform: 'uppercase' }}>
            {item.status}
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
          {item.description?.substring(0, 100)}
        </div>
      </div>
      <div style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap', textAlign: 'right', paddingTop: 2 }}>
        {timeAgo(item.created_at)}
      </div>
    </div>
  );
}

export default function OperationsDashboard({ token }) {
  const [metrics,    setMetrics]    = useState(null);
  const [roomData,   setRoomData]   = useState(null);
  const [activity,   setActivity]   = useState([]);
  const [emailStats, setEmailStats] = useState(null);
  const [liveData,   setLiveData]   = useState(null);
  const [triggering, setTriggering] = useState('');
  const [trigMsg,    setTrigMsg]    = useState('');
  const [filter,     setFilter]     = useState('all');
  const [newIds,     setNewIds]     = useState(new Set());
  const knownIds = useRef(new Set());
  const authH = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchAll = useCallback(async () => {
    try {
      const [m, r, a, e, l] = await Promise.allSettled([
        axios.get(`${API}/api/metrics`,              { headers: authH }),
        axios.get(`${API}/api/control-room/status`,  { headers: authH }),
        axios.get(`${API}/api/control-room/activity?limit=60&filter=${filter}`, { headers: authH }),
        axios.get(`${API}/api/email-stats`,          { headers: authH }),
        axios.get(`${API}/api/ai-agent/live`,        { headers: authH }),
      ]);
      if (m.status === 'fulfilled') setMetrics(m.value.data);
      if (r.status === 'fulfilled') setRoomData(r.value.data);
      if (e.status === 'fulfilled') setEmailStats(e.value.data);
      if (l.status === 'fulfilled') setLiveData(l.value.data);
      if (a.status === 'fulfilled') {
        const incoming = a.value.data.activity || [];
        const fresh = incoming.filter(x => !knownIds.current.has(x.id));
        if (fresh.length > 0) {
          fresh.forEach(x => knownIds.current.add(x.id));
          setNewIds(new Set(fresh.map(x => x.id)));
          setTimeout(() => setNewIds(new Set()), 3000);
        }
        setActivity(incoming);
      }
    } catch {}
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const id = setInterval(fetchAll, 5000);
    return () => clearInterval(id);
  }, [fetchAll]);

  async function trigger(task) {
    setTriggering(task); setTrigMsg('');
    try {
      const r = await axios.post(`${API}/api/ai-agent/trigger/${task}`, {}, { headers: authH });
      setTrigMsg(r.data?.message || '✅ Running...');
      setTimeout(() => { fetchAll(); setTrigMsg(''); }, 3000);
    } catch (e) {
      setTrigMsg('Error: ' + (e.response?.data?.error || e.message));
    } finally { setTriggering(''); }
  }

  async function togglePause() {
    try {
      await axios.post(`${API}/api/email-pause`, { paused: !emailStats?.paused }, { headers: { ...authH, 'Content-Type': 'application/json' } });
      fetchAll();
    } catch {}
  }

  const s  = roomData?.status     || {};
  const nr = roomData?.nextRuns   || {};
  const m  = metrics              || {};
  const es = emailStats           || {};
  const lv = liveData             || {};
  const ci = roomData?.circuit    || {};
  const db = roomData?.db         || {};
  const isOnline = s.running || lv.running || activity.length > 0;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }
        .trig { border:none;border-radius:9px;padding:10px 16px;font-weight:800;font-size:13px;cursor:pointer;transition:all 0.15s;width:100%;text-align:left;display:flex;align-items:center;gap:8px; }
        .trig:hover { filter:brightness(1.1);transform:translateY(-1px); }
        .trig:disabled { opacity:0.5;cursor:not-allowed;transform:none; }
        .filter-btn { background:none;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;color:#64748b;transition:all 0.15s; }
        .filter-btn.active { background:#6366f1;border-color:#6366f1;color:#fff; }
      `}</style>

      {/* ── Status bar ── */}
      <div style={{ background: isOnline ? 'linear-gradient(135deg,#0f172a,#1e293b)' : '#1e293b', borderRadius: 14, padding: '14px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: isOnline ? '#22c55e' : '#ef4444', boxShadow: isOnline ? '0 0 0 3px rgba(34,197,94,0.3)' : 'none', animation: isOnline ? 'pulse 2s infinite' : 'none' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', letterSpacing: -0.3 }}>
              CTS BPO — Operations Centre
            </div>
            <div style={{ fontSize: 11, color: isOnline ? '#34d399' : '#f87171', fontWeight: 700, marginTop: 1 }}>
              {isOnline ? '● ONLINE — All systems running' : '● OFFLINE — Agent not responding'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Contacts DB',     v: fmt(db.scrapedTotal || lv.db?.grand_total)    },
            { label: 'Emails Today',    v: fmt(es.sentToday)                             },
            { label: 'Provider',        v: `${(es.mode || '—').toUpperCase()} (${es.cap || 0}/day)` },
            { label: 'AI Leads',        v: fmt(m.totalLeads)                             },
          ].map(k => (
            <div key={k.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{k.v || '—'}</div>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8 }}>{k.label}</div>
            </div>
          ))}
          <button onClick={togglePause} style={{ background: es.paused ? '#fef2f2' : '#f0fdf4', color: es.paused ? '#b91c1c' : '#16a34a', border: `1px solid ${es.paused ? '#fca5a5' : '#86efac'}`, borderRadius: 8, padding: '7px 16px', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
            {es.paused ? '▶ Resume Outreach' : '⏸ Pause Outreach'}
          </button>
        </div>
      </div>

      {/* ── Circuit breaker warning ── */}
      {ci.open && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '11px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <div>
            <strong style={{ color: '#92400e', fontSize: 13 }}>Email Circuit Breaker Open</strong>
            <div style={{ fontSize: 12, color: '#78350f' }}>Outreach paused — resumes in {ci.minutesLeft} min</div>
          </div>
        </div>
      )}

      {/* ── KPI row ── */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <KpiCard icon="💰" label="Monthly Revenue"  value={fmtZar(m.monthlyRevZar)}    sub={`All-time: ${fmtZar(m.totalRevZar)}`}                                      color="#22c55e" />
        <KpiCard icon="👥" label="Active Clients"   value={m.totalClients ?? 0}        sub={`${m.activeContracts ?? 0} active contracts`}                              color="#3b82f6" />
        <KpiCard icon="📬" label="Leads Pipeline"   value={fmt(m.totalLeads)}          sub={`${m.respondedLeads ?? 0} responded · ${m.bouncedLeads ?? 0} bounced`}    color="#6366f1" alert={m.bouncedLeads > 20} />
        <KpiCard icon="✅" label="Jobs Completed"   value={m.totalCompleted ?? 0}      sub={`Success rate: ${m.totalCompleted > 0 ? m.successRate + '%' : '—'}`}       color="#f59e0b" />
        <KpiCard icon="🕷️" label="Scraped Contacts" value={fmt(db.scrapedTotal)}       sub={`${db.scrapedNew ?? 0} added today`}                                       color="#8b5cf6" />
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18 }}>

        {/* ── Activity feed ── */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Live Activity</span>
              <span style={{ background: '#6366f1', color: '#fff', borderRadius: 20, padding: '1px 9px', fontSize: 10, fontWeight: 800 }}>
                {roomData?.totalToday ?? activity.length} today
              </span>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {[
                { k: 'all',             label: 'All'       },
                { k: 'success',         label: '✅'         },
                { k: 'error',           label: '❌'         },
                { k: 'scrape_outreach', label: '📧 Emails' },
                { k: 'inbox_reply',     label: '💬 Replies' },
              ].map(({ k, label }) => (
                <button key={k} onClick={() => setFilter(k)} className={`filter-btn${filter === k ? ' active' : ''}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ maxHeight: 560, overflowY: 'auto' }}>
            {activity.length === 0
              ? <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Waiting for activity — agent is warming up...</div>
              : activity.map(item => <ActivityItem key={item.id} item={item} isNew={newIds.has(item.id)} />)
            }
          </div>
        </div>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Manual triggers */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 18px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 900, color: '#0f172a' }}>⚡ Manual Triggers</h3>
            <p style={{ margin: '0 0 12px', fontSize: 11, color: '#94a3b8' }}>Force any AI task to run immediately</p>
            {trigMsg && (
              <div style={{ background: '#f0fdf4', color: '#16a34a', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, fontWeight: 700, animation: 'slideIn 0.2s ease' }}>
                {trigMsg}
              </div>
            )}
            {TRIGGER_ACTIONS.map(({ task, label, icon, color }) => (
              <button
                key={task}
                disabled={!!triggering}
                onClick={() => trigger(task)}
                className="trig"
                style={{
                  marginBottom: 7,
                  background: task === 'all' ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : '#f8fafc',
                  color: task === 'all' ? '#fff' : '#374151',
                  border: task === 'all' ? 'none' : '1px solid #e2e8f0',
                  boxShadow: task === 'all' ? '0 2px 8px rgba(99,102,241,0.35)' : 'none',
                  fontSize: task === 'all' ? 13 : 12,
                }}
              >
                {triggering === task
                  ? <><span style={{ animation: 'pulse 1s infinite' }}>⏳</span> Running...</>
                  : <>{icon && <span>{icon}</span>}{label}</>
                }
              </button>
            ))}
          </div>

          {/* Scheduled tasks */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 18px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 900, color: '#0f172a' }}>⏱ Next Runs</h3>
            <NextRunRow icon="📧" label="Outreach Emails"    nextAt={nr.outreach}    color="#6366f1" />
            <NextRunRow icon="📩" label="Follow-Ups"         nextAt={nr.followup}    color="#06b6d4" />
            <NextRunRow icon="💬" label="Inbox Reply Check"  nextAt={nr.inboxReply}  color="#10b981" />
            <NextRunRow icon="⚙️"  label="Job Processing"    nextAt={nr.aiJobs}      color="#f59e0b" />
            <NextRunRow icon="📋" label="Contract Assignment" nextAt={nr.contracts}  color="#0ea5e9" />
            <NextRunRow icon="🩺" label="Health Check"       nextAt={nr.healthCheck} color="#94a3b8" />
          </div>

          {/* Email provider health */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 18px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 900, color: '#0f172a' }}>📮 Email Health</h3>
            {[
              { name: 'Gmail',       cap: 500,  key: 'gmail'       },
              { name: 'Brevo',       cap: 300,  key: 'brevo'       },
              { name: 'MailerSend',  cap: 100,  key: 'mailersend'  },
              { name: 'Mailjet',     cap: 200,  key: 'mailjet'     },
            ].map(({ name, cap, key }) => {
              const isActive = es.mode === key;
              const used = isActive ? (es.sentToday || 0) : 0;
              const pct  = Math.min(100, Math.round((used / cap) * 100));
              return (
                <div key={key} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: isActive ? 800 : 600, color: isActive ? '#0f172a' : '#94a3b8' }}>
                      {isActive ? '▶ ' : ''}{name}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      {isActive ? `${used}/${cap}` : `0/${cap}`}
                    </span>
                  </div>
                  <div style={{ background: '#f1f5f9', borderRadius: 999, height: 5 }}>
                    <div style={{ width: `${isActive ? pct : 0}%`, background: isActive ? '#6366f1' : '#e2e8f0', height: '100%', borderRadius: 999, transition: 'width 0.5s' }} />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 10, fontSize: 11, color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
              Daily capacity: <strong>1,100 emails</strong> · Providers chain automatically
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
