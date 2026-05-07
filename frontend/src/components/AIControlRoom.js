import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || '';

const ACTION_META = {
  scrape_outreach:   { icon: '📧', color: '#6366f1', label: 'Pricing Email Sent'     },
  prospect_outreach: { icon: '📧', color: '#6366f1', label: 'Prospect Outreach'       },
  lead_search:       { icon: '🔍', color: '#3b82f6', label: 'Lead Search'             },
  scrape_followup:   { icon: '🔁', color: '#8b5cf6', label: 'Follow-Up'               },
  followup:          { icon: '🔁', color: '#8b5cf6', label: 'Follow-Up'               },
  inbox_reply:       { icon: '💬', color: '#10b981', label: 'Client Reply Handled'     },
  client_onboarded:  { icon: '🎉', color: '#22c55e', label: 'Client Onboarded'        },
  auto_response:     { icon: '🤖', color: '#14b8a6', label: 'AI Auto-Response Sent'   },
  ai_job_process:    { icon: '⚙️',  color: '#f59e0b', label: 'Job Processed'           },
  contract_assign:   { icon: '📋', color: '#0ea5e9', label: 'Contract Assigned'       },
  payment_chase:     { icon: '💳', color: '#10b981', label: 'Payment Chase'           },
  bounce_process:    { icon: '🚫', color: '#ef4444', label: 'Bounce Blacklisted'      },
  scrape_collect:    { icon: '🌐', color: '#64748b', label: 'Contacts Scraped'        },
  system_health:     { icon: '🩺', color: '#94a3b8', label: 'Health Check'            },
  heartbeat:         { icon: '💓', color: '#94a3b8', label: 'Daily Heartbeat'         },
  agent_start:       { icon: '🚀', color: '#22c55e', label: 'Agent Started'           },
  email_circuit:     { icon: '⚡', color: '#f59e0b', label: 'Circuit Breaker'         },
  price_proposal:    { icon: '💰', color: '#6366f1', label: 'Price Proposal'          },
};

const STATUS_COLOR = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', skipped: '#94a3b8', info: '#3b82f6' };

function timeSince(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function StatCard({ icon, label, value, sub, color = '#6366f1' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px', borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 12, color: '#64748b', marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function LiveDot({ active }) {
  return (
    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: active ? '#22c55e' : '#94a3b8', boxShadow: active ? '0 0 0 3px rgba(34,197,94,0.3)' : 'none', animation: active ? 'pulse 1.5s infinite' : 'none', marginRight: 8 }} />
  );
}

function ActivityRow({ item, isNew }) {
  const meta = ACTION_META[item.action_type] || { icon: '🤖', color: '#64748b', label: item.action_type };
  const statusColor = STATUS_COLOR[item.status] || '#64748b';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 10, alignItems: 'flex-start',
      padding: '10px 14px', borderBottom: '1px solid #f1f5f9',
      background: isNew ? '#f0fdf4' : 'transparent',
      transition: 'background 2s',
    }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: meta.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{meta.icon}</div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{meta.label}</span>
          <span style={{ fontSize: 10, background: statusColor + '22', color: statusColor, borderRadius: 20, padding: '1px 8px', fontWeight: 700, textTransform: 'uppercase' }}>{item.status}</span>
        </div>
        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{item.description}</div>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', textAlign: 'right' }}>
        <div>{fmtTime(item.created_at)}</div>
        <div>{timeSince(item.created_at)}</div>
      </div>
    </div>
  );
}

function NextTask({ label, icon, nextAt, color }) {
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    if (!nextAt) return;
    const tick = () => {
      const diff = new Date(nextAt) - Date.now();
      if (diff <= 0) { setCountdown('running now'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextAt]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f8fafc', borderRadius: 9, marginBottom: 8, border: '1px solid #e2e8f0' }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{label}</div>
        {nextAt && <div style={{ fontSize: 11, color: '#94a3b8' }}>Next run: {new Date(nextAt).toLocaleTimeString()}</div>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: color || '#6366f1' }}>{countdown || '—'}</div>
    </div>
  );
}

export default function AIControlRoom({ token }) {
  const [data,       setData]       = useState(null);
  const [activity,   setActivity]   = useState([]);
  const [newIds,     setNewIds]     = useState(new Set());
  const [lastCount,  setLastCount]  = useState(0);
  const [filter,     setFilter]     = useState('all');
  const [paused,     setPaused]     = useState(false);
  const [error,      setError]      = useState('');
  const knownIds = useRef(new Set());
  const authHeader = React.useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const fetchData = useCallback(async () => {
    if (paused) return;
    try {
      const [statusRes, actRes] = await Promise.all([
        axios.get(`${API}/api/control-room/status`, { headers: authHeader }),
        axios.get(`${API}/api/control-room/activity?limit=80&filter=${filter}`, { headers: authHeader }),
      ]);
      setData(statusRes.data);
      const incoming = actRes.data.activity || [];
      const fresh = incoming.filter(a => !knownIds.current.has(a.id));
      if (fresh.length > 0) {
        fresh.forEach(a => knownIds.current.add(a.id));
        setNewIds(new Set(fresh.map(a => a.id)));
        setTimeout(() => setNewIds(new Set()), 3000);
      }
      setActivity(incoming);
      setLastCount(actRes.data.totalToday || 0);
      setError('');
    } catch (err) {
      setError('Connection error — retrying…');
    }
  }, [paused, filter, authHeader]);

  useEffect(() => { fetchData(); }, [filter, fetchData]);
  useEffect(() => {
    const id = setInterval(fetchData, 3000);
    return () => clearInterval(id);
  }, [fetchData]);

  const triggerTask = async (task) => {
    try {
      await axios.post(`${API}/api/ai-agent/trigger/${task}`, {}, { headers: authHeader });
      setTimeout(fetchData, 1000);
    } catch (err) {
      setError(`Trigger failed: ${err.response?.data?.error || err.message}`);
    }
  };

  const s = data?.status || {};
  const emailStats = data?.emailStats || {};
  const dbStats = data?.db || {};
  const circuit = data?.circuit || {};
  const isOnline = s.running;

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`@keyframes pulse { 0%,100%{box-shadow:0 0 0 3px rgba(34,197,94,0.3)} 50%{box-shadow:0 0 0 6px rgba(34,197,94,0.1)} }`}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            <LiveDot active={isOnline} />
            AI Control Room
            {isOnline && <span style={{ fontSize: 12, background: '#dcfce7', color: '#16a34a', borderRadius: 20, padding: '2px 12px', fontWeight: 700 }}>LIVE</span>}
          </h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            Real-time view of every AI action — refreshes every 3 seconds
            {data && <span> · Last updated {fmtTime(new Date().toISOString())}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setPaused(p => !p)}
            style={{ background: paused ? '#fef2f2' : '#f0fdf4', color: paused ? '#b91c1c' : '#16a34a', border: `1px solid ${paused ? '#fca5a5' : '#86efac'}`, borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {paused ? '▶ Resume Feed' : '⏸ Pause Feed'}
          </button>
        </div>
      </div>

      {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{error}</div>}

      {/* ── Circuit Breaker Warning ── */}
      {circuit.open && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <div>
            <strong style={{ color: '#92400e' }}>Email Circuit Breaker OPEN</strong>
            <div style={{ fontSize: 12, color: '#78350f' }}>Outreach paused — resumes in {circuit.minutesLeft} minutes ({circuit.resumeAt ? new Date(circuit.resumeAt).toLocaleTimeString() : ''})</div>
          </div>
        </div>
      )}

      {/* ── Stats Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        <StatCard icon="📧" label="Emails Today"    value={emailStats.sentToday ?? s.totalEmailsSent ?? 0} sub={`cap: ${emailStats.cap ?? '—'} via ${emailStats.mode || '—'}`} color="#6366f1" />
        <StatCard icon="🌐" label="Contacts Scraped" value={dbStats.scrapedTotal ?? s.totalLeadsFound ?? 0} sub={`${dbStats.scrapedNew ?? 0} new`}  color="#3b82f6" />
        <StatCard icon="💬" label="Replies Handled"  value={s.totalRepliesHandled ?? 0} sub="auto-responded" color="#10b981" />
        <StatCard icon="🎉" label="Clients Onboarded" value={s.totalClientsOnboarded ?? 0} sub="from AI replies" color="#22c55e" />
        <StatCard icon="⚙️"  label="Jobs Processed"  value={s.totalJobsProcessed ?? 0}   sub="by AI worker"   color="#f59e0b" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>

        {/* ── Activity Feed ── */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>📋 Live Activity Feed</span>
              <span style={{ background: '#6366f1', color: '#fff', borderRadius: 20, padding: '1px 10px', fontSize: 11, fontWeight: 700 }}>{lastCount} today</span>
              {!paused && <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, animation: 'pulse 1.5s infinite' }}>● live</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['all','success','error','scrape_outreach','inbox_reply','ai_job_process'].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ background: filter===f ? '#6366f1' : '#f1f5f9', color: filter===f ? '#fff' : '#475569', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {f === 'all' ? 'All' : f === 'success' ? '✅' : f === 'error' ? '❌' : f === 'scrape_outreach' ? '📧' : f === 'inbox_reply' ? '💬' : '⚙️'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {activity.length === 0
              ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>No activity yet — the AI is warming up…</div>
              : activity.map(item => <ActivityRow key={item.id} item={item} isNew={newIds.has(item.id)} />)
            }
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Scheduled Tasks */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 18px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>⏱ Scheduled Tasks</h3>
            <NextTask label="Inbox Reply Responder" icon="💬" nextAt={data?.nextRuns?.inboxReply} color="#10b981" />
            <NextTask label="Scraped Contacts Outreach" icon="📧" nextAt={data?.nextRuns?.outreach} color="#6366f1" />
            <NextTask label="Follow-Ups (day 3 & 7)" icon="🔁" nextAt={data?.nextRuns?.followup} color="#8b5cf6" />
            <NextTask label="AI Job Processing" icon="⚙️" nextAt={data?.nextRuns?.aiJobs} color="#f59e0b" />
            <NextTask label="Contract Assignment" icon="📋" nextAt={data?.nextRuns?.contracts} color="#0ea5e9" />
            <NextTask label="System Health Check" icon="🩺" nextAt={data?.nextRuns?.healthCheck} color="#94a3b8" />
          </div>

          {/* Manual Triggers */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 18px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>🎮 Manual Triggers</h3>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>Force the AI to run any task immediately</p>
            {[
              { task: 'inbox_reply',     label: '💬 Check & Reply Inbox' },
              { task: 'scrape_outreach', label: '📧 Send Pricing Emails'  },
              { task: 'followup',        label: '🔁 Run Follow-Ups'       },
              { task: 'lead_search',     label: '🔍 Search for Leads'     },
              { task: 'ai_jobs',         label: '⚙️ Process AI Jobs'       },
              { task: 'all',             label: '🚀 Run Everything Now'    },
            ].map(({ task, label }) => (
              <button key={task} onClick={() => triggerTask(task)}
                style={{ width: '100%', background: task === 'all' ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : '#f8fafc', color: task === 'all' ? '#fff' : '#374151', border: task === 'all' ? 'none' : '1px solid #e2e8f0', borderRadius: 8, padding: '9px 14px', marginBottom: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left', boxShadow: task === 'all' ? '0 2px 8px rgba(99,102,241,0.3)' : 'none' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Email Provider Status */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 18px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>📡 Email Provider</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#475569' }}>Provider</span>
              <strong style={{ fontSize: 13, color: '#0f172a', textTransform: 'uppercase' }}>{emailStats.mode || '—'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#475569' }}>Sent today</span>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>{emailStats.sentToday ?? 0} / {emailStats.cap ?? '—'}</strong>
            </div>
            {emailStats.cap > 0 && (
              <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, Math.round(((emailStats.sentToday||0)/emailStats.cap)*100))}%`, background: emailStats.sentToday/emailStats.cap > 0.8 ? '#ef4444' : '#22c55e', transition: 'width 0.5s' }} />
              </div>
            )}
            {emailStats.paused && <div style={{ marginTop: 8, fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>⏸ Outreach paused</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
