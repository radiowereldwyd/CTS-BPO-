import React, { useState, useEffect, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || '';

const JOB_TYPES = {
  data_entry:'Data Entry & Capture', transcription:'Audio/Video Transcription',
  translation:'Document Translation', document_processing:'Document Processing',
  invoice_processing:'Invoice Processing', payroll:'Payroll Administration',
  medical_billing:'Medical Billing & Records', legal:'Legal Document Processing',
  bookkeeping:'Bookkeeping & Accounts', content:'Content Moderation/Writing',
  virtual_assistant:'Virtual Assistant Tasks', other:'Other',
};
const JOB_ICONS = {
  data_entry:'📊', transcription:'🎙️', translation:'🌐', document_processing:'📄',
  invoice_processing:'🧾', payroll:'💰', medical_billing:'🏥', legal:'⚖️',
  bookkeeping:'📒', content:'✍️', virtual_assistant:'🤖', other:'📌',
};
const STATUS_META = {
  new:         { label:'New',          color:'#6366f1', bg:'#eef2ff',  icon:'🆕' },
  assigned:    { label:'Assigned',     color:'#0ea5e9', bg:'#e0f2fe',  icon:'👤' },
  in_progress: { label:'In Progress',  color:'#f59e0b', bg:'#fffbeb',  icon:'⚙️' },
  review:      { label:'Review',       color:'#ec4899', bg:'#fdf2f8',  icon:'🔍' },
  delivered:   { label:'Delivered',    color:'#10b981', bg:'#ecfdf5',  icon:'✅' },
  revision:    { label:'Revision',     color:'#f97316', bg:'#fff7ed',  icon:'🔄' },
};
const PRI = {
  urgent:{ bg:'#fef2f2', color:'#ef4444', border:'#fecaca' },
  high:  { bg:'#fff7ed', color:'#f59e0b', border:'#fed7aa' },
  normal:{ bg:'#f0fdf4', color:'#22c55e', border:'#bbf7d0' },
  low:   { bg:'#f8fafc', color:'#94a3b8', border:'#e2e8f0' },
};

function SBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color:'#64748b', bg:'#f1f5f9', icon:'•' };
  return <span style={{ background:m.bg, color:m.color, fontWeight:700, fontSize:11, padding:'3px 10px', borderRadius:20 }}>{m.icon} {m.label}</span>;
}
function PBadge({ p }) {
  const c = PRI[p] || PRI.normal;
  return <span style={{ background:c.bg, color:c.color, border:`1px solid ${c.border}`, fontWeight:700, fontSize:10, padding:'2px 8px', borderRadius:20, textTransform:'uppercase' }}>{p}</span>;
}
function DeadlineChip({ deadline, status }) {
  if (!deadline || status === 'delivered') return null;
  const diff = Math.ceil((new Date(deadline) - Date.now()) / 86400000);
  const over = diff < 0;
  return (
    <span style={{ background: over ? '#fef2f2' : diff<=2 ? '#fff7ed' : '#f1f5f9', color: over ? '#ef4444' : diff<=2 ? '#f59e0b' : '#64748b', fontWeight:700, fontSize:11, padding:'3px 10px', borderRadius:20 }}>
      {over ? `⚠️ Overdue ${Math.abs(diff)}d` : diff===0 ? '🔥 Due today' : `📅 ${diff}d left`}
    </span>
  );
}

const MODAL_STYLE = { position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 };
const PANEL = { background:'#fff', borderRadius:16, padding:32, maxWidth:580, width:'100%', maxHeight:'88vh', overflowY:'auto' };
const INP = { width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid #d1d5db', fontSize:13, boxSizing:'border-box' };
const BTN = (bg, color='#fff') => ({ background:bg, color, border:'none', borderRadius:8, padding:'11px 22px', fontWeight:700, cursor:'pointer', fontSize:14 });

export default function JobQueue({ token }) {
  const [jobs, setJobs]     = useState([]);
  const [stats, setStats]   = useState({});
  const [subs, setSubs]     = useState([]);
  const [tab, setTab]       = useState('all');
  const [loading, setLoading] = useState(true);
  const [sel, setSel]       = useState(null);
  const [modal, setModal]   = useState(null);
  const [assignSub, setAssignSub] = useState('');
  const [revNotes, setRevNotes]   = useState('');
  const [qNotes, setQNotes]       = useState('');
  const [msg, setMsg]       = useState('');
  const [acting, setActing] = useState(false);

  const H = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const qs = tab === 'all' ? '' : `status=${tab}&`;
      const [jr, sr, str] = await Promise.all([
        fetch(`${API}/api/bpo-jobs?${qs}limit=200`, { headers: H }),
        fetch(`${API}/api/subcontractors`, { headers: H }),
        fetch(`${API}/api/bpo-jobs/stats`, { headers: H }),
      ]);
      const jd = await jr.json();
      const sd = await sr.json();
      const std = await str.json();
      setJobs(jd.jobs || []);
      setSubs((Array.isArray(sd) ? sd : []).filter(s => s.status === 'approved' || s.status === 'active'));
      setStats(std);
    } catch {}
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv); }, [load]);

  function open(job, type) { setSel(job); setModal(type); setAssignSub(''); setRevNotes(''); setQNotes(''); setMsg(''); }

  async function act(url, body) {
    setActing(true); setMsg('');
    try {
      const r = await fetch(`${API}${url}`, { method:'PATCH', headers:{ ...H, 'Content-Type':'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    } finally { setActing(false); }
  }

  async function doAssign() {
    if (!assignSub) return setMsg('Select a subcontractor');
    const sub = subs.find(s => String(s.id) === String(assignSub));
    try {
      await act(`/api/bpo-jobs/${sel.id}/assign`, { subId: sub.id, subName: sub.name || sub.full_name, subEmail: sub.email });
      setMsg('✅ Assigned!'); setModal(null); load();
    } catch (e) { setMsg(`❌ ${e.message}`); }
  }

  async function doApprove() {
    try {
      await act(`/api/bpo-jobs/${sel.id}/approve`, { qualityNotes: qNotes });
      setMsg('✅ Approved & delivered!'); setModal(null); load();
    } catch (e) { setMsg(`❌ ${e.message}`); }
  }

  async function doReject() {
    if (!revNotes.trim()) return setMsg('Enter revision notes');
    try {
      await act(`/api/bpo-jobs/${sel.id}/reject`, { revisionNotes: revNotes });
      setMsg('🔄 Sent back for revision'); setModal(null); load();
    } catch (e) { setMsg(`❌ ${e.message}`); }
  }

  async function doAIComplete(job) {
    if (!window.confirm(`Let AI complete job #${job.id} — "${job.title}"?\n\nThe AI will process this job automatically using Google AI and move it to the review queue.`)) return;
    setActing(true); setMsg('');
    try {
      const r = await fetch(`${API}/api/bpo-jobs/${job.id}/ai-complete`, { method:'PATCH', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsg(`🤖 AI completed job #${job.id} — moved to review queue`);
      load();
    } catch (e) { setMsg(`❌ ${e.message}`); }
    setActing(false);
  }

  const STAGES = [
    { key:'new',         icon:'🆕', label:'New',          color:'#6366f1', val: stats.new_count },
    { key:'assigned',    icon:'👤', label:'Assigned',      color:'#0ea5e9', val: stats.assigned_count },
    { key:'in_progress', icon:'⚙️', label:'In Progress',   color:'#f59e0b', val: stats.in_progress_count },
    { key:'review',      icon:'🔍', label:'Needs Review',  color:'#ec4899', val: stats.review_count },
    { key:'delivered',   icon:'✅', label:'Delivered',     color:'#10b981', val: stats.delivered_count },
  ];

  return (
    <div style={{ padding:'24px 20px', maxWidth:1200, margin:'0 auto' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ margin:0, fontSize:24, fontWeight:900, color:'#0f172a' }}>📋 Job Queue</h1>
          <p style={{ margin:'4px 0 0', color:'#64748b', fontSize:13 }}>Full delivery pipeline — intake → assign → work → quality review → deliver</p>
        </div>
        {stats.overdue > 0 && (
          <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'8px 16px', color:'#ef4444', fontWeight:700, fontSize:13 }}>
            ⚠️ {stats.overdue} overdue job{stats.overdue > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Pipeline stats cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:24 }}>
        {STAGES.map(s => (
          <div key={s.key} onClick={() => setTab(s.key)} style={{
            background:'#fff', border:`2px solid ${tab===s.key ? s.color : '#e2e8f0'}`,
            borderRadius:12, padding:'14px 12px', cursor:'pointer', textAlign:'center',
            transition:'all 0.2s', boxShadow: tab===s.key ? `0 0 0 3px ${s.color}22` : 'none',
          }}>
            <div style={{ fontSize:22 }}>{s.icon}</div>
            <div style={{ fontSize:26, fontWeight:900, color:s.color, margin:'2px 0' }}>{s.val || 0}</div>
            <div style={{ fontSize:10, color:'#94a3b8', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:4, borderBottom:'2px solid #e2e8f0', marginBottom:20, flexWrap:'wrap' }}>
        {['all','new','assigned','in_progress','review','delivered','revision'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab===t ? '#6366f1' : 'transparent',
            color: tab===t ? '#fff' : '#64748b',
            border:'none', borderRadius:'8px 8px 0 0',
            padding:'8px 16px', fontWeight:700, cursor:'pointer', fontSize:12, textTransform:'capitalize',
          }}>{STATUS_META[t]?.icon || '📋'} {t==='all' ? 'All' : STATUS_META[t]?.label || t}</button>
        ))}
      </div>

      {msg && <div style={{ background: msg.startsWith('✅')||msg.startsWith('🔄') ? '#ecfdf5' : '#fef2f2', color: msg.startsWith('✅')||msg.startsWith('🔄') ? '#10b981' : '#ef4444', padding:'10px 16px', borderRadius:8, marginBottom:16, fontWeight:600, fontSize:13 }}>{msg}</div>}

      {loading ? (
        <div style={{ textAlign:'center', color:'#94a3b8', padding:60 }}>Loading jobs…</div>
      ) : jobs.length === 0 ? (
        <div style={{ textAlign:'center', color:'#94a3b8', padding:60, background:'#f8fafc', borderRadius:14 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>No jobs here</div>
          <div style={{ fontSize:13 }}>Jobs appear when clients submit requests via the client portal.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {jobs.map(job => (
            <div key={job.id} style={{
              background:'#fff',
              border:`1px solid ${job.status==='review' ? '#ec4899' : '#e2e8f0'}`,
              borderLeft:`4px solid ${STATUS_META[job.status]?.color || '#6366f1'}`,
              borderRadius:12, padding:'16px 20px',
              boxShadow: job.status==='review' ? '0 0 12px rgba(236,72,153,0.12)' : '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:200 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, flexWrap:'wrap' }}>
                    <span style={{ fontSize:20 }}>{JOB_ICONS[job.job_type] || '📌'}</span>
                    <span style={{ fontWeight:800, fontSize:15, color:'#0f172a' }}>#{job.id} — {job.title}</span>
                    <SBadge status={job.status} />
                    <PBadge p={job.priority} />
                    <DeadlineChip deadline={job.deadline} status={job.status} />
                  </div>
                  <div style={{ display:'flex', gap:14, flexWrap:'wrap', fontSize:12, color:'#64748b' }}>
                    <span>🏷 {JOB_TYPES[job.job_type] || job.job_type}</span>
                    {job.client_name  && <span>👤 {job.client_name}</span>}
                    {job.client_email && <span>📧 {job.client_email}</span>}
                    {job.assigned_name && <span>🔧 Sub: {job.assigned_name}</span>}
                    {job.source_file_count > 0    && <span>📎 {job.source_file_count} source</span>}
                    {job.completed_file_count > 0 && <span style={{ color:'#10b981', fontWeight:700 }}>✅ {job.completed_file_count} done</span>}
                    {job.revision_count > 0 && <span style={{ color:'#f97316' }}>🔄 Rev #{job.revision_count}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', flexShrink:0 }}>
                  <button onClick={() => open(job,'detail')} style={{ ...BTN('#f1f5f9','#475569'), fontSize:12, padding:'7px 13px' }}>👁 View</button>
                  {['new','revision'].includes(job.status) && (
                    <button onClick={() => open(job,'assign')} style={{ ...BTN('#6366f1'), fontSize:12, padding:'7px 13px' }}>👤 Assign</button>
                  )}
                  {job.status === 'review' && (
                    <button onClick={() => open(job,'review')} style={{ ...BTN('#10b981'), fontSize:12, padding:'7px 13px' }}>🔍 Review</button>
                  )}
                  {['assigned','in_progress','revision'].includes(job.status) && !job.ai_completed && (
                    <button onClick={() => doAIComplete(job)} disabled={acting} title="AI takes over and completes this job automatically"
                      style={{ ...BTN('linear-gradient(135deg,#7c3aed,#4f46e5)'), fontSize:12, padding:'7px 13px', opacity: acting ? 0.6 : 1 }}>
                      🤖 AI Complete
                    </button>
                  )}
                  {job.ai_completed && (
                    <span style={{ background:'#f0fdf4', color:'#059669', fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:8, border:'1px solid #bbf7d0' }}>🤖 AI Done</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Assign Modal ────────────────────────────────────────────────────── */}
      {modal === 'assign' && sel && (
        <div style={MODAL_STYLE}>
          <div style={PANEL}>
            <h3 style={{ margin:'0 0 4px', color:'#0f172a' }}>👤 Assign Job</h3>
            <p style={{ margin:'0 0 20px', color:'#64748b', fontSize:13 }}>#{sel.id} — {sel.title}</p>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#374151', marginBottom:6 }}>SUBCONTRACTOR</label>
            <select value={assignSub} onChange={e => setAssignSub(e.target.value)}
              style={{ ...INP, marginBottom:20, background:'#f9fafb' }}>
              <option value="">— Choose subcontractor —</option>
              {subs.map(s => <option key={s.id} value={s.id}>{s.name || s.full_name} ({s.email})</option>)}
            </select>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={doAssign} disabled={acting} style={{ ...BTN('#6366f1'), flex:1 }}>{acting?'…':'✅ Confirm'}</button>
              <button onClick={() => setModal(null)} style={{ ...BTN('#f1f5f9','#374151'), padding:'11px 20px' }}>Cancel</button>
            </div>
            {msg && <div style={{ marginTop:12, color: msg.startsWith('✅')?'#10b981':'#ef4444', fontWeight:600, fontSize:13 }}>{msg}</div>}
          </div>
        </div>
      )}

      {/* ── Review Modal ─────────────────────────────────────────────────────── */}
      {modal === 'review' && sel && (
        <div style={MODAL_STYLE}>
          <div style={PANEL}>
            <h3 style={{ margin:'0 0 4px', color:'#0f172a' }}>🔍 Quality Review</h3>
            <p style={{ margin:'0 0 20px', color:'#64748b', fontSize:13 }}>#{sel.id} — {sel.title}</p>

            {sel.completed_file_count > 0 && (
              <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'12px 16px', marginBottom:20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#166534', marginBottom:8 }}>📎 Download & Review Completed Work</div>
                {Array.from({ length: sel.completed_file_count }).map((_, i) => (
                  <a key={i} href={`${API}/api/bpo-jobs/${sel.id}/download/completed/${i}`} target="_blank" rel="noopener noreferrer"
                    style={{ display:'block', color:'#10b981', fontWeight:600, fontSize:13, marginBottom:4, textDecoration:'none' }}>
                    ⬇ Download Completed File {i+1}
                  </a>
                ))}
              </div>
            )}

            {/* Approve section */}
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#166534', marginBottom:10 }}>✅ Approve & Deliver to Client</div>
              <textarea value={qNotes} onChange={e => setQNotes(e.target.value)} rows={2} placeholder="Optional quality notes for your records…"
                style={{ ...INP, marginBottom:10, resize:'vertical' }} />
              <button onClick={doApprove} disabled={acting} style={{ ...BTN('#10b981'), width:'100%' }}>
                {acting ? '…' : '✅ Approve — Deliver to Client & Send Email'}
              </button>
            </div>

            {/* Reject section */}
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#b91c1c', marginBottom:10 }}>🔄 Request Revision</div>
              <textarea value={revNotes} onChange={e => setRevNotes(e.target.value)} rows={3} placeholder="Describe exactly what needs to be corrected…"
                style={{ ...INP, border:'1px solid #fecaca', marginBottom:10, resize:'vertical' }} />
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={doReject} disabled={acting || !revNotes.trim()} style={{ ...BTN('#ef4444'), flex:1, opacity: !revNotes.trim()?0.5:1 }}>
                  {acting ? '…' : '🔄 Request Revision'}
                </button>
                <button onClick={() => setModal(null)} style={{ ...BTN('#f1f5f9','#374151'), padding:'11px 16px' }}>Cancel</button>
              </div>
            </div>

            {msg && <div style={{ marginTop:12, color: msg.startsWith('✅')||msg.startsWith('🔄')?'#10b981':'#ef4444', fontWeight:600, fontSize:13 }}>{msg}</div>}
          </div>
        </div>
      )}

      {/* ── Detail Modal ─────────────────────────────────────────────────────── */}
      {modal === 'detail' && sel && (
        <div style={MODAL_STYLE}>
          <div style={PANEL}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ margin:0, color:'#0f172a', fontSize:17 }}>{JOB_ICONS[sel.job_type]} #{sel.id} — {sel.title}</h3>
              <button onClick={() => setModal(null)} style={{ background:'#f1f5f9', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontWeight:700 }}>✕</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 24px', marginBottom:16 }}>
              {[
                ['Type', JOB_TYPES[sel.job_type] || sel.job_type],
                ['Client', sel.client_name || '—'],
                ['Email', sel.client_email || '—'],
                ['Priority', null, <PBadge p={sel.priority} />],
                ['Status', null, <SBadge status={sel.status} />],
                ['Deadline', sel.deadline || 'Not set'],
                ['Assigned To', sel.assigned_name || 'Unassigned'],
                ['Revisions', sel.revision_count || 0],
              ].map(([k, v, el]) => (
                <div key={k} style={{ borderBottom:'1px solid #f1f5f9', paddingBottom:8 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', marginBottom:2 }}>{k}</div>
                  {el || <div style={{ fontSize:13, color:'#0f172a', fontWeight:600 }}>{v}</div>}
                </div>
              ))}
            </div>
            {sel.description && <div style={{ marginBottom:10 }}><div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', marginBottom:4 }}>DESCRIPTION</div><div style={{ fontSize:13, color:'#374151', background:'#f8fafc', padding:'10px 14px', borderRadius:8 }}>{sel.description}</div></div>}
            {sel.instructions && <div style={{ marginBottom:10 }}><div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', marginBottom:4 }}>INSTRUCTIONS</div><div style={{ fontSize:13, color:'#374151', background:'#fffbeb', padding:'10px 14px', borderRadius:8, borderLeft:'3px solid #f59e0b' }}>{sel.instructions}</div></div>}
            {sel.revision_notes && <div style={{ marginBottom:10 }}><div style={{ fontSize:10, fontWeight:700, color:'#ef4444', textTransform:'uppercase', marginBottom:4 }}>REVISION NOTES</div><div style={{ fontSize:13, color:'#374151', background:'#fef2f2', padding:'10px 14px', borderRadius:8, borderLeft:'3px solid #ef4444' }}>{sel.revision_notes}</div></div>}
            {sel.source_file_count > 0 && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', marginBottom:6 }}>SOURCE FILES</div>
                {Array.from({ length: sel.source_file_count }).map((_, i) => (
                  <a key={i} href={`${API}/api/bpo-jobs/${sel.id}/download/source/${i}`} target="_blank" rel="noopener noreferrer"
                    style={{ display:'inline-block', background:'#e0f2fe', color:'#0ea5e9', borderRadius:6, padding:'4px 12px', marginRight:6, marginBottom:6, fontWeight:600, fontSize:12, textDecoration:'none' }}>
                    ⬇ Source {i+1}
                  </a>
                ))}
              </div>
            )}
            {sel.completed_file_count > 0 && (
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', marginBottom:6 }}>COMPLETED FILES</div>
                {Array.from({ length: sel.completed_file_count }).map((_, i) => (
                  <a key={i} href={`${API}/api/bpo-jobs/${sel.id}/download/completed/${i}`} target="_blank" rel="noopener noreferrer"
                    style={{ display:'inline-block', background:'#ecfdf5', color:'#10b981', borderRadius:6, padding:'4px 12px', marginRight:6, marginBottom:6, fontWeight:600, fontSize:12, textDecoration:'none' }}>
                    ⬇ Completed {i+1}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
