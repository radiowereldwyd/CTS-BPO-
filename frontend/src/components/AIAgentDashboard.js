import React, { useState, useEffect, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || '';

const ACTION_ICONS = {
  agent_start:             '🚀',
  lead_search:             '🔍',
  email_sent:              '📧',
  followup_sent:           '📩',
  followup_sequence:       '🔄',
  application_acknowledged:'✅',
  application_approved:    '🎉',
  contract_assigned:       '📋',
  contract_assign:         '📋',
  application_process:     '⚙️',
  heartbeat:               '💓',
  error:                   '❌',
  prospect_scan:           '🌐',
  prospect_outreach:       '📤',
  prospect_followup:       '🔁',
  bounce_process:          '🚫',
  payment_chase:           '💰',
  payment_auto_release:    '💸',
  ai_job_start:            '🤖',
  ai_job_complete:         '✔️',
  ai_job_error:            '⚠️',
  outreach_sent:           '📨',
  web_scrape:              '🕷️',
  scrape_outreach:         '📬',
  scrape_followup:         '🔂',
  ai_outreach:             '📧',
};

const STATUS_COLORS = {
  success: '#10b981',
  error:   '#ef4444',
  skipped: '#f59e0b',
  info:    '#6366f1',
};

const JOB_TYPE_BADGE = {
  'data-entry':          { bg: '#e0f2fe', color: '#0369a1' },
  'transcription':       { bg: '#fef9c3', color: '#854d0e' },
  'translation':         { bg: '#f0fdf4', color: '#166534' },
  'virtual-assistant':   { bg: '#f3e8ff', color: '#6d28d9' },
  'finance-admin':       { bg: '#fef3c7', color: '#92400e' },
  'content-moderation':  { bg: '#fce7f3', color: '#9d174d' },
  'customer-support':    { bg: '#ede9fe', color: '#5b21b6' },
  'document-processing': { bg: '#ecfdf5', color: '#065f46' },
  'social-media':        { bg: '#fff1f2', color: '#9f1239' },
  'general':             { bg: '#f1f5f9', color: '#475569' },
};

const LEAD_STATUS_BADGE = {
  new:             { bg: '#e0f2fe', color: '#0369a1',  label: 'New' },
  outreach_sent:   { bg: '#fef3c7', color: '#92400e',  label: 'Outreach Sent' },
  followup1_sent:  { bg: '#fde68a', color: '#78350f',  label: 'Follow-up #1' },
  followup2_sent:  { bg: '#fed7aa', color: '#7c2d12',  label: 'Follow-up #2' },
  responded:       { bg: '#d1fae5', color: '#065f46',  label: 'Responded' },
  converted:       { bg: '#a7f3d0', color: '#064e3b',  label: 'Converted' },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', borderTop: `4px solid ${color || '#6366f1'}`, minWidth: 150, flex: 1 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: color || '#0f172a', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function AIAgentDashboard({ token }) {
  const [status, setStatus]           = useState(null);
  const [activities, setActivities]   = useState([]);
  const [leads, setLeads]             = useState([]);
  const [scrapedStats, setScrapedStats] = useState(null);
  const [scrapedContacts, setScrapedContacts] = useState([]);
  const [activeTab, setActiveTab]     = useState('activity');
  const [triggering, setTriggering]   = useState('');
  const [triggerMsg, setTriggerMsg]   = useState('');
  const [loading, setLoading]         = useState(true);

  const fetchAll = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      const [s, a, l, sc] = await Promise.all([
        fetch(`${API}/api/ai-agent/status`,                { headers: h }).then(r => r.json()),
        fetch(`${API}/api/ai-agent/activity?limit=80`,     { headers: h }).then(r => r.json()),
        fetch(`${API}/api/ai-agent/leads`,                 { headers: h }).then(r => r.json()),
        fetch(`${API}/api/ai-agent/scraped-contacts`,      { headers: h }).then(r => r.json()).catch(() => ({})),
      ]);
      setStatus(s);
      setActivities(a.activities || []);
      setLeads(l.leads || []);
      setScrapedStats(sc.stats || null);
      setScrapedContacts(sc.contacts || []);
    } catch (e) {
      console.error('Agent fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 15000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  async function trigger(task) {
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    setTriggering(task);
    setTriggerMsg('');
    try {
      const r = await fetch(`${API}/api/ai-agent/trigger/${task}`, { method: 'POST', headers: h });
      const data = await r.json();
      setTriggerMsg(data.message || data.error || 'Done');
      setTimeout(() => { fetchAll(); setTriggerMsg(''); }, 2000);
    } catch (e) {
      setTriggerMsg('Error: ' + e.message);
    } finally {
      setTriggering('');
    }
  }

  const pulse = status?.running
    ? { animation: 'pulse 2s infinite', boxShadow: '0 0 0 4px rgba(16,185,129,0.15)' }
    : {};

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#64748b' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Loading AI Agent...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 40px', maxWidth: 1100, margin: '0 auto' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.7} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .trigger-btn { border:none;border-radius:10px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:7px; }
        .trigger-btn:hover { transform:translateY(-2px);box-shadow:0 4px 14px rgba(0,0,0,0.15); }
        .trigger-btn:disabled { opacity:0.6;cursor:not-allowed;transform:none; }
        .tab-btn { background:none;border:none;padding:10px 20px;cursor:pointer;font-size:13px;font-weight:700;color:#64748b;border-bottom:3px solid transparent;transition:all 0.2s; }
        .tab-btn.active { color:#6366f1;border-bottom-color:#6366f1; }
        .activity-row { display:flex;gap:14px;padding:14px 20px;border-bottom:1px solid #f1f5f9;align-items:flex-start;transition:background 0.15s; }
        .activity-row:hover { background:#f8faff; }
        .lead-row { display:grid;grid-template-columns:1fr 1fr 140px 140px 120px;gap:12px;padding:14px 20px;border-bottom:1px solid #f1f5f9;align-items:center;font-size:13px;transition:background 0.15s; }
        .lead-row:hover { background:#f8faff; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, ...pulse }}>🤖</div>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Autonomous AI Agent</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: status?.running ? '#10b981' : '#ef4444', boxShadow: status?.running ? '0 0 6px #10b981' : 'none' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: status?.running ? '#10b981' : '#ef4444' }}>{status?.running ? 'ONLINE — Running Autonomously' : 'OFFLINE'}</span>
              {status?.startedAt && <span style={{ fontSize: 11, color: '#94a3b8' }}>· started {timeAgo(status.startedAt)}</span>}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'right' }}>
          <div>Auto-refreshes every 15s</div>
          <div style={{ marginTop: 4, color: '#6366f1', fontWeight: 600, cursor: 'pointer' }} onClick={fetchAll}>↻ Refresh now</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <StatCard label="Leads Found"        value={status?.totalLeadsFound || 0}                      color="#6366f1" sub={`Last search: ${status?.lastLeadSearch ? timeAgo(status.lastLeadSearch) : 'not yet'}`} />
        <StatCard label="Emails Sent"        value={status?.totalEmailsSent || 0}                       color="#0ea5e9" sub="Cold outreach + follow-ups" />
        <StatCard label="Apps Processed"     value={status?.totalAppProcessed || 0}                     color="#10b981" sub={`Last check: ${status?.lastAppCheck ? timeAgo(status.lastAppCheck) : 'not yet'}`} />
        <StatCard label="Contracts Assigned" value={status?.totalContractsAssigned || 0}                color="#f59e0b" sub={`Last run: ${status?.lastContractAssign ? timeAgo(status.lastContractAssign) : 'not yet'}`} />
        <StatCard label="Scraped Contacts"   value={scrapedStats?.total || 0}                           color="#ec4899" sub={`${scrapedStats?.pending || 0} pending · ${scrapedStats?.contacted || 0} contacted`} />
        <StatCard label="Unique Domains"     value={scrapedStats?.unique_domains || 0}                  color="#8b5cf6" sub={`${scrapedStats?.sources || 0} data sources`} />
      </div>

      {/* Manual Trigger Panel */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 28 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', marginBottom: 14 }}>Manual Triggers — Force Agent Tasks Now</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { key: 'lead_search',       label: '🔍 Lead Search',           bg: '#6366f1', fg: '#fff' },
            { key: 'web_scrape',        label: '🕷️ Run Web Scraper',        bg: '#ec4899', fg: '#fff' },
            { key: 'scrape_outreach',   label: '📬 Scrape Outreach',        bg: '#db2777', fg: '#fff' },
            { key: 'ai_lead_outreach',  label: '📧 AI Lead Outreach',       bg: '#0ea5e9', fg: '#fff' },
            { key: 'prospect_outreach', label: '📤 Prospect Outreach',      bg: '#7c3aed', fg: '#fff' },
            { key: 'followup',          label: '📩 Follow-ups',             bg: '#0284c7', fg: '#fff' },
            { key: 'applications',      label: '✅ Applications',            bg: '#10b981', fg: '#fff' },
            { key: 'contracts',         label: '📋 Contracts',              bg: '#f59e0b', fg: '#fff' },
            { key: 'all',               label: '⚡ Run Everything Now',      bg: '#0f172a', fg: '#fff' },
          ].map(({ key, label, bg, fg }) => (
            <button key={key} className="trigger-btn" style={{ background: bg, color: fg }} disabled={!!triggering} onClick={() => trigger(key)}>
              {triggering === key ? <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> : null}
              {label}
            </button>
          ))}
        </div>
        {triggerMsg && <div style={{ marginTop: 12, padding: '10px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#166534', fontWeight: 600 }}>{triggerMsg}</div>}

        {/* Schedule info */}
        <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Web Scraper',         freq: 'Every 6 hours',  next: scrapedStats?.last_scraped,     color: '#ec4899' },
            { label: 'Scrape Outreach',     freq: 'Every 5 mins',   next: null,                            color: '#db2777' },
            { label: 'Lead Search',         freq: 'Every 30 mins',  next: status?.lastLeadSearch,         color: '#6366f1' },
            { label: 'AI Outreach',         freq: 'Every 5 mins',   next: null,                            color: '#0ea5e9' },
            { label: 'Follow-up Emails',    freq: 'Every 2 hours',  next: status?.lastFollowUp,           color: '#0284c7' },
            { label: 'App Processing',      freq: 'Every 30 mins',  next: status?.lastAppCheck,           color: '#10b981' },
            { label: 'Contract Assignment', freq: 'Every 1 hour',   next: status?.lastContractAssign,     color: '#f59e0b' },
          ].map(({ label, freq, next, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#f8fafc', borderRadius: 8, border: `1px solid ${color}30` }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{label}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{freq} · {next ? timeAgo(next) : 'pending'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap' }}>
          <button className={`tab-btn${activeTab === 'activity' ? ' active' : ''}`} onClick={() => setActiveTab('activity')}>
            📋 Activity Log ({activities.length})
          </button>
          <button className={`tab-btn${activeTab === 'leads' ? ' active' : ''}`} onClick={() => setActiveTab('leads')}>
            🎯 Leads ({leads.length})
          </button>
          <button className={`tab-btn${activeTab === 'scraped' ? ' active' : ''}`} onClick={() => setActiveTab('scraped')}>
            🕷️ Scraped Contacts ({scrapedContacts.length})
          </button>
        </div>

        {/* Activity Log */}
        {activeTab === 'activity' && (
          <div>
            {activities.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔄</div>
                <div style={{ fontSize: 14 }}>Agent is initialising — activity will appear here shortly.</div>
              </div>
            ) : activities.map(a => (
              <div key={a.id} className="activity-row">
                <div style={{ width: 34, height: 34, borderRadius: 10, background: a.status === 'error' ? '#fef2f2' : a.status === 'skipped' ? '#fffbeb' : '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                  {ACTION_ICONS[a.action_type] || '⚙️'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, lineHeight: 1.4 }}>{a.description}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: STATUS_COLORS[a.status] || '#64748b', background: `${STATUS_COLORS[a.status]}18`, padding: '1px 7px', borderRadius: 20 }}>
                      {a.status}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{a.action_type.replace(/_/g, ' ')}</span>
                    {a.target_entity && <span style={{ fontSize: 11, color: '#94a3b8' }}>· {a.target_entity} #{a.target_id}</span>}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>{timeAgo(a.created_at)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Leads Table */}
        {activeTab === 'leads' && (
          <div>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px 140px 120px', gap: 12, padding: '10px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
              <span>Title / Domain</span><span>Email</span><span>Type</span><span>Status</span><span>Found</span>
            </div>
            {leads.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                <div style={{ fontSize: 14 }}>No leads yet — the agent will search for BPO clients every 2 hours. Use the trigger above to run now.</div>
              </div>
            ) : leads.map(l => {
              const jb = JOB_TYPE_BADGE[l.job_type] || JOB_TYPE_BADGE['general'];
              const sb = LEAD_STATUS_BADGE[l.status] || { bg: '#f1f5f9', color: '#475569', label: l.status };
              return (
                <div key={l.id} className="lead-row">
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title || l.domain}</div>
                    {l.source_url && (
                      <a href={l.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#6366f1', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }}>
                        {l.domain}
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.contact_email || '—'}</div>
                  <div>
                    <span style={{ background: jb.bg, color: jb.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                      {l.job_type?.replace(/-/g, ' ') || 'general'}
                    </span>
                  </div>
                  <div>
                    <span style={{ background: sb.bg, color: sb.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                      {sb.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{timeAgo(l.created_at)}</div>
                </div>
              );
            })}
          </div>
        )}
        {/* Scraped Contacts Tab */}
        {activeTab === 'scraped' && (
          <div>
            {/* Stats bar */}
            {scrapedStats && (
              <div style={{ display: 'flex', gap: 12, padding: '14px 20px', background: '#fdf4ff', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                {[
                  { label: 'Total', val: scrapedStats.total, color: '#7c3aed' },
                  { label: 'Pending', val: scrapedStats.pending, color: '#0ea5e9' },
                  { label: 'Contacted', val: scrapedStats.contacted, color: '#f59e0b' },
                  { label: 'Follow-up 1', val: scrapedStats.followup1, color: '#f97316' },
                  { label: 'Follow-up 2', val: scrapedStats.followup2, color: '#ef4444' },
                  { label: 'Bounced', val: scrapedStats.bounced, color: '#94a3b8' },
                  { label: 'Converted', val: scrapedStats.converted, color: '#10b981' },
                  { label: 'Unique Domains', val: scrapedStats.unique_domains, color: '#ec4899' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center', padding: '4px 12px', background: '#fff', borderRadius: 8, border: `1px solid ${s.color}30` }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.val || 0}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 120px 110px 90px 90px', gap: 8, padding: '10px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
              <span>Company / Domain</span><span>Email</span><span>Business Type</span><span>Location</span><span>Source</span><span>Status</span>
            </div>
            {scrapedContacts.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🕷️</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>No scraped contacts yet</div>
                <div style={{ fontSize: 13 }}>Click <strong>Run Web Scraper</strong> above to start filling the database with leads from Google Places, CSE, and DuckDuckGo.</div>
              </div>
            ) : scrapedContacts.map(c => {
              const srcColor = { google_places: '#4285f4', google_cse: '#34a853', duckduckgo: '#de5833', serpapi_bpo: '#10b981' }[c.source] || '#94a3b8';
              const stColor  = { new: '#0ea5e9', contacted: '#f59e0b', followup1: '#f97316', followup2: '#ef4444', bounced: '#94a3b8', converted: '#10b981' }[c.status] || '#94a3b8';
              return (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 120px 110px 90px 90px', gap: 8, padding: '12px 20px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', fontSize: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company || c.domain}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.domain}</div>
                  </div>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#334155' }}>{c.email}</div>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b' }}>{c.business_type || '—'}</div>
                  <div style={{ color: '#64748b' }}>{c.city || ''}{c.country ? `, ${c.country}` : ''}</div>
                  <div><span style={{ background: `${srcColor}18`, color: srcColor, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{(c.source || '').replace('_', ' ')}</span></div>
                  <div><span style={{ background: `${stColor}18`, color: stColor, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{c.status}</span></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
