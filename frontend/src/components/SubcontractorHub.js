import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = '';

const ZAR = n => `R ${(parseFloat(n) || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const INT = n => (parseInt(n, 10) || 0).toLocaleString('en-ZA');

// eslint-disable-next-line no-unused-vars
const SERVICES = [
  'Data Entry', 'Transcription', 'Translation', 'Virtual Assistant',
  'Customer Support', 'Finance & Admin', 'Content Moderation', 'Reporting',
  'Document Processing', 'Social Media Management',
];

const STATUS_COLORS = {
  pending:     '#f59e0b',
  approved:    '#10b981',
  rejected:    '#ef4444',
  active:      '#3b82f6',
  assigned:    '#6366f1',
  in_progress: '#0ea5e9',
  submitted:   '#f59e0b',
  verified:    '#10b981',
  paid:        '#22c55e',
  failed:      '#ef4444',
};

const badge = status => (
  <span style={{
    background: STATUS_COLORS[status] || '#94a3b8',
    color: '#fff', fontSize: 11, fontWeight: 700,
    padding: '2px 10px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: 0.5,
  }}>{status?.replace('_', ' ')}</span>
);

function SummaryCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '18px 22px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderTop: `4px solid ${color || '#6366f1'}`,
      minWidth: 160, flex: 1,
    }}>
      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function SubcontractorHub({ token }) {
  const [tab, setTab] = useState('summary');
  const [summary, setSummary] = useState(null);
  const [applications, setApplications] = useState([]);
  const [subcontractors, setSubcontractors] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [recruitTargets, setRecruitTargets] = useState('');
  const [newJob, setNewJob] = useState({ sub_id: '', title: '', description: '', sub_payout: '', due_date: '' });
  const [reviewNote, setReviewNote] = useState({});

  const auth = token ? { Authorization: `Bearer ${token}` } : {};

  const flash = (message, isErr = false) => {
    isErr ? setErr(message) : setMsg(message);
    setTimeout(() => { setMsg(''); setErr(''); }, 4000);
  };

  const load = useCallback(async () => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const [s, a, sub, j] = await Promise.all([
        axios.get(`${API}/api/summary`, { headers }),
        axios.get(`${API}/api/subcontractors/applications`, { headers }),
        axios.get(`${API}/api/subcontractors`, { headers }),
        axios.get(`${API}/api/subcontractors/jobs`, { headers }),
      ]);
      setSummary(s.data);
      setApplications(a.data);
      setSubcontractors(sub.data);
      setJobs(j.data);
    } catch (e) {
      setErr('Failed to load data: ' + (e.response?.data?.error || e.message));
    }
  }, [token]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  async function handleRecruit() {
    const lines = recruitTargets.split('\n').map(l => l.trim()).filter(Boolean);
    const targets = lines.map(l => {
      const parts = l.split(',');
      return { name: parts[0]?.trim() || 'Future Partner', email: parts[1]?.trim() || parts[0]?.trim() };
    }).filter(t => t.email?.includes('@'));
    if (!targets.length) return flash('Enter at least one valid email address.', true);
    setLoading(p => ({ ...p, recruit: true }));
    try {
      const r = await axios.post(`${API}/api/subcontractors/recruit`, { targets }, { headers: auth });
      flash(`Recruitment emails sent to ${r.data.sent} prospect(s).`);
      setRecruitTargets('');
    } catch (e) { flash(e.response?.data?.error || 'Recruitment failed.', true); }
    setLoading(p => ({ ...p, recruit: false }));
  }

  async function handleReview(id, status) {
    setLoading(p => ({ ...p, [`rev_${id}`]: true }));
    try {
      await axios.patch(`${API}/api/subcontractors/applications/${id}`, { status, notes: reviewNote[id] || '' }, { headers: auth });
      flash(`Application ${status}.`);
      load();
    } catch (e) { flash(e.response?.data?.error || 'Review failed.', true); }
    setLoading(p => ({ ...p, [`rev_${id}`]: false }));
  }

  async function handleCreateJob(e) {
    e.preventDefault();
    setLoading(p => ({ ...p, newjob: true }));
    try {
      await axios.post(`${API}/api/subcontractors/jobs`, newJob, { headers: auth });
      flash('Job assignment created successfully.');
      setNewJob({ sub_id: '', title: '', description: '', sub_payout: '', due_date: '' });
      load();
    } catch (e) { flash(e.response?.data?.error || 'Failed to create job.', true); }
    setLoading(p => ({ ...p, newjob: false }));
  }

  async function handleJobStatus(id, status) {
    setLoading(p => ({ ...p, [`job_${id}`]: true }));
    try {
      await axios.patch(`${API}/api/subcontractors/jobs/${id}`, { status }, { headers: auth });
      flash(`Job status updated to "${status}".`);
      load();
    } catch (e) { flash(e.response?.data?.error || 'Status update failed.', true); }
    setLoading(p => ({ ...p, [`job_${id}`]: false }));
  }

  async function handleMarkPaid(id) {
    setLoading(p => ({ ...p, [`paid_${id}`]: true }));
    try {
      await axios.patch(`${API}/api/subcontractors/applications/${id}/mark-paid`, { reference: 'manual' }, { headers: auth });
      flash('Payment confirmed — subcontractor is now eligible to receive contracts.');
      load();
    } catch (e) { flash(e.response?.data?.error || 'Failed to confirm payment.', true); }
    setLoading(p => ({ ...p, [`paid_${id}`]: false }));
  }

  async function handleSendPortalAccess(id) {
    setLoading(p => ({ ...p, [`portal_${id}`]: true }));
    try {
      await axios.post(`${API}/api/sub/auth/request-setup`, { sub_id: id }, { headers: auth });
      flash('Portal setup email sent! The subcontractor will receive a link to set their password.');
    } catch (e) { flash(e.response?.data?.error || 'Failed to send portal access email.', true); }
    setLoading(p => ({ ...p, [`portal_${id}`]: false }));
  }

  async function handleReminders() {
    setLoading(p => ({ ...p, remind: true }));
    try {
      const r = await axios.post(`${API}/api/subcontractors/jobs/remind`, {}, { headers: auth });
      flash(`${r.data.sent} reminder email(s) sent.`);
    } catch (e) { flash(e.response?.data?.error || 'Reminders failed.', true); }
    setLoading(p => ({ ...p, remind: false }));
  }

  const s = summary || {};
  const pendingApps = applications.filter(a => a.status === 'pending').length;

  const tabs = [
    { key: 'summary',       label: '📊 Summary' },
    { key: 'recruit',       label: '📣 Recruitment' },
    { key: 'applications',  label: `📋 Applications${pendingApps ? ` (${pendingApps})` : ''}` },
    { key: 'subcontractors',label: '👥 Subcontractors' },
    { key: 'jobs',          label: '🗂 Job Assignments' },
  ];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Subcontractor Hub</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>Recruitment · Applications · Assignments · Live Totals</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={load} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>⟳ Refresh</button>
          <button onClick={handleReminders} disabled={loading.remind} style={{ padding: '8px 16px', background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {loading.remind ? 'Sending...' : '🔔 Send Reminders'}
          </button>
        </div>
      </div>

      {msg && <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#166534', fontWeight: 600 }}>{msg}</div>}
      {err && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#991b1b', fontWeight: 600 }}>{err}</div>}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e2e8f0', marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: tab === t.key ? '#6366f1' : '#64748b',
            borderBottom: tab === t.key ? '3px solid #6366f1' : '3px solid transparent',
            marginBottom: -2, borderRadius: '4px 4px 0 0', transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── SUMMARY TAB ── */}
      {tab === 'summary' && (
        <div>
          <h3 style={{ margin: '0 0 16px', color: '#334155' }}>Live Operations Overview</h3>

          <div style={{ marginBottom: 24 }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Clients & Subcontractors</p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <SummaryCard label="Total Clients"        value={INT(s.clients?.total)}         sub={`${INT(s.clients?.active)} active`}         color="#3b82f6" />
              <SummaryCard label="Subcontractors"       value={INT(s.subcontractors?.total)}   sub={`${INT(s.subcontractors?.active)} active`}  color="#6366f1" />
              <SummaryCard label="Applications"         value={INT(s.applications?.total)}     sub={`${INT(s.applications?.pending)} pending`}  color="#f59e0b" />
              <SummaryCard label="Approved"             value={INT(s.applications?.approved)}  sub={`${INT(s.applications?.rejected)} rejected`} color="#10b981" />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Contracts</p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <SummaryCard label="Total Contracts"    value={INT(s.contracts?.total)}      sub={`${INT(s.contracts?.active)} active`}      color="#0ea5e9" />
              <SummaryCard label="Completed"          value={INT(s.contracts?.completed)}  sub={`${INT(s.contracts?.pending)} pending`}    color="#22c55e" />
              <SummaryCard label="Total Value"        value={ZAR(s.contracts?.totalValue)} sub="all contracts"                             color="#8b5cf6" />
              <SummaryCard label="Active Value"       value={ZAR(s.contracts?.activeValue)}sub="in progress"                              color="#0f172a" />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Job Assignments</p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <SummaryCard label="Total Jobs"        value={INT(s.jobs?.total)}            sub={`${INT(s.jobs?.outstanding)} outstanding`} color="#f97316" />
              <SummaryCard label="Submitted"         value={INT(s.jobs?.submitted)}        sub={`${INT(s.jobs?.verified)} verified`}       color="#0ea5e9" />
              <SummaryCard label="Paid Out"          value={INT(s.jobs?.paid)}             sub="completed jobs"                            color="#22c55e" />
              <SummaryCard label="Outstanding Value" value={ZAR(s.jobs?.outstandingValue)} sub="pending completion"                        color="#ef4444" />
            </div>
          </div>

          <div>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Revenue & Margins</p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <SummaryCard label="Revenue Collected"  value={ZAR(s.revenue?.paid)}        sub="confirmed payments"           color="#22c55e" />
              <SummaryCard label="Revenue Pending"    value={ZAR(s.revenue?.pending)}     sub="awaiting payment"             color="#f59e0b" />
              <SummaryCard label="Total Job Value"    value={ZAR(s.jobs?.totalJobValue)}  sub="allocated to subs"            color="#6366f1" />
              <SummaryCard label="Our Total Margin"   value={ZAR(s.jobs?.totalMargin)}    sub="platform profit"              color="#10b981" />
            </div>
          </div>

          {s.updatedAt && (
            <p style={{ marginTop: 20, fontSize: 12, color: '#94a3b8', textAlign: 'right' }}>
              Last updated: {new Date(s.updatedAt).toLocaleTimeString('en-ZA')} &nbsp;·&nbsp; Auto-refreshes every 30s
            </p>
          )}
        </div>
      )}

      {/* ── RECRUITMENT TAB ── */}
      {tab === 'recruit' && (
        <div style={{ maxWidth: 720 }}>
          <h3 style={{ margin: '0 0 8px', color: '#334155' }}>AI Recruitment Campaign</h3>
          <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14 }}>
            Enter prospect details below. Each line: <strong>Full Name, email@address.com</strong> (or just an email address). The system will send a professional work-from-home opportunity email with an application link.
          </p>

          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#0c4a6e', lineHeight: 1.6 }}>
              <strong>Business Model explained in email:</strong> Subcontractors choose their desired earnings → they pay a 50% platform fee → we supply them 1.5× their target in job value → they earn their target, we earn the margin.
            </p>
          </div>

          <label style={{ display: 'block', fontWeight: 700, fontSize: 13, color: '#334155', marginBottom: 8 }}>
            Prospect List (one per line)
          </label>
          <textarea
            value={recruitTargets}
            onChange={e => setRecruitTargets(e.target.value)}
            placeholder={"John Smith, john@example.com\nJane Doe, jane@example.com\ninfo@anothersite.co.za"}
            rows={8}
            style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical' }}
          />
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handleRecruit} disabled={loading.recruit || !recruitTargets.trim()} style={{
              padding: '10px 28px', background: '#0f172a', color: '#fff', border: 'none',
              borderRadius: 7, fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}>
              {loading.recruit ? 'Sending...' : '📧 Send Recruitment Emails'}
            </button>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              {recruitTargets.split('\n').filter(l => l.includes('@')).length} valid email(s) detected
            </span>
          </div>
        </div>
      )}

      {/* ── APPLICATIONS TAB ── */}
      {tab === 'applications' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, color: '#334155' }}>Subcontractor Applications</h3>
            <span style={{ fontSize: 13, color: '#64748b' }}>{applications.length} total &nbsp;·&nbsp; {pendingApps} pending review</span>
          </div>
          {applications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>No applications yet. Send a recruitment campaign to get started.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {applications.map(a => {
                const de = parseFloat(a.desired_earnings) || 0;
                return (
                  <div key={a.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{a.name}</span>
                        <span style={{ marginLeft: 12, fontSize: 13, color: '#64748b' }}>{a.email}</span>
                        {a.phone && <span style={{ marginLeft: 8, fontSize: 13, color: '#94a3b8' }}>{a.phone}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {badge(a.status)}
                        {a.payment_confirmed
                          ? <span style={{ background: '#d1fae5', color: '#065f46', fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 20 }}>💳 PAID</span>
                          : <span style={{ background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 20 }}>⏳ UNPAID</span>
                        }
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>#{a.id}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12 }}>
                      <div style={{ fontSize: 13 }}><span style={{ color: '#94a3b8' }}>Enrolment fee (they pay):</span> <strong style={{ color: '#0f172a' }}>{ZAR(de)}</strong></div>
                      <div style={{ fontSize: 13 }}><span style={{ color: '#94a3b8' }}>Contracts allocated (2×):</span> <strong style={{ color: '#0ea5e9' }}>{ZAR(a.job_value)}</strong></div>
                      <div style={{ fontSize: 13 }}><span style={{ color: '#94a3b8' }}>Sub earns back:</span> <strong style={{ color: '#10b981' }}>{ZAR(a.job_value)}</strong></div>
                      <div style={{ fontSize: 13 }}><span style={{ color: '#94a3b8' }}>Our margin:</span> <strong style={{ color: '#6366f1' }}>{ZAR(a.our_margin)}</strong></div>
                    </div>

                    {a.services?.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        {a.services.map(sv => (
                          <span key={sv} style={{ display: 'inline-block', background: '#f1f5f9', color: '#475569', fontSize: 12, padding: '2px 10px', borderRadius: 12, marginRight: 6, marginBottom: 4 }}>{sv}</span>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#64748b', marginBottom: a.status === 'pending' ? 14 : 0 }}>
                      {a.location && <span>📍 {a.location}</span>}
                      {a.availability && <span>🕐 {a.availability}</span>}
                      {a.equipment && <span>💻 {a.equipment}</span>}
                      {a.internet_speed && <span>🌐 {a.internet_speed}</span>}
                      <span>🗓 {new Date(a.created_at).toLocaleDateString('en-ZA')}</span>
                      {a.penalty_acknowledged && <span style={{ color: '#10b981' }}>✓ Penalty terms accepted</span>}
                    </div>

                    {a.experience && <p style={{ fontSize: 13, color: '#475569', margin: '8px 0', background: '#f8fafc', padding: '8px 12px', borderRadius: 6 }}>{a.experience}</p>}

                    {a.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                        <input
                          placeholder="Optional review note..."
                          value={reviewNote[a.id] || ''}
                          onChange={e => setReviewNote(p => ({ ...p, [a.id]: e.target.value }))}
                          style={{ flex: 1, minWidth: 200, padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                        />
                        <button onClick={() => handleReview(a.id, 'approved')} disabled={loading[`rev_${a.id}`]}
                          style={{ padding: '8px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                          ✓ Approve
                        </button>
                        <button onClick={() => handleReview(a.id, 'rejected')} disabled={loading[`rev_${a.id}`]}
                          style={{ padding: '8px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                          ✗ Reject
                        </button>
                      </div>
                    )}
                    {/* Mark as Paid — shown for approved subcontractors who haven't paid yet */}
                    {a.status === 'approved' && !a.payment_confirmed && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9', marginTop: 8 }}>
                        <div style={{ flex: 1, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: '#92400e' }}>
                          ⚠️ <strong>Waiting for enrolment payment</strong> — the AI will not assign any contracts until payment is confirmed. Once paid, contracts will be assigned automatically.
                        </div>
                        <button
                          onClick={() => handleMarkPaid(a.id)}
                          disabled={loading[`paid_${a.id}`]}
                          style={{ padding: '8px 18px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {loading[`paid_${a.id}`] ? '...' : '💳 Mark as Paid'}
                        </button>
                      </div>
                    )}
                    {a.status === 'approved' && a.payment_confirmed && (
                      <div style={{ paddingTop: 10, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <div style={{ fontSize: 12, color: '#065f46' }}>
                          ✅ Payment confirmed {a.payment_confirmed_at ? `on ${new Date(a.payment_confirmed_at).toLocaleDateString('en-ZA')}` : ''} — eligible to receive contracts.
                        </div>
                        <button
                          onClick={() => handleSendPortalAccess(a.id)}
                          disabled={loading[`portal_${a.id}`]}
                          style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {loading[`portal_${a.id}`] ? '...' : '🔑 Send Portal Access'}
                        </button>
                      </div>
                    )}
                    {a.notes && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#94a3b8' }}>Note: {a.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SUBCONTRACTORS TAB ── */}
      {tab === 'subcontractors' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, color: '#334155' }}>Registered Subcontractors</h3>
            <span style={{ fontSize: 13, color: '#64748b' }}>{subcontractors.length} registered</span>
          </div>
          {subcontractors.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>No registered subcontractors yet. Approve applications to add them.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['#', 'Name', 'Email', 'Specialisations', 'Available Slots', 'Success Rate'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subcontractors.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#94a3b8' }}>{s.id}</td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{s.name}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>{s.email || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {(s.specializations || []).map(sv => (
                        <span key={sv} style={{ display: 'inline-block', background: '#eff6ff', color: '#3b82f6', fontSize: 11, padding: '2px 8px', borderRadius: 10, marginRight: 4 }}>{sv}</span>
                      ))}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: (s.availableSlots || 0) > 0 ? '#10b981' : '#ef4444' }}>
                      {s.availableSlots ?? '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: '#6366f1' }}>
                      {s.successRate ? `${(parseFloat(s.successRate) * 100).toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── JOB ASSIGNMENTS TAB ── */}
      {tab === 'jobs' && (
        <div>
          {/* Create Job Form */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '20px 24px', marginBottom: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h4 style={{ margin: '0 0 16px', color: '#334155' }}>Assign a New Job</h4>
            <form onSubmit={handleCreateJob}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5 }}>Subcontractor *</label>
                  <select value={newJob.sub_id} onChange={e => setNewJob(p => ({ ...p, sub_id: e.target.value }))} required
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}>
                    <option value="">Select subcontractor...</option>
                    {subcontractors.map(s => (
                      <option key={s.id} value={s.id}>{s.name} {s.email ? `(${s.email})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5 }}>Job Title *</label>
                  <input value={newJob.title} onChange={e => setNewJob(p => ({ ...p, title: e.target.value }))} required placeholder="e.g. Data Entry Batch #42"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5 }}>Sub Payout (ZAR) *</label>
                  <input value={newJob.sub_payout} onChange={e => setNewJob(p => ({ ...p, sub_payout: e.target.value }))} required type="number" min="0" step="0.01" placeholder="e.g. 2500"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5 }}>Due Date</label>
                  <input value={newJob.due_date} onChange={e => setNewJob(p => ({ ...p, due_date: e.target.value }))} type="datetime-local"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5 }}>Description (client info omitted)</label>
                <textarea value={newJob.description} onChange={e => setNewJob(p => ({ ...p, description: e.target.value }))} rows={3}
                  placeholder="Describe the task without mentioning the client name or contract value..."
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              {newJob.sub_payout && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 16px', marginTop: 12, fontSize: 13 }}>
                  Sub earns: <strong style={{ color: '#16a34a' }}>{ZAR(parseFloat(newJob.sub_payout) || 0)}</strong> &nbsp;·&nbsp;
                  Job value allocated: <strong style={{ color: '#0ea5e9' }}>{ZAR((parseFloat(newJob.sub_payout) || 0) * 1.5)}</strong> &nbsp;·&nbsp;
                  Our margin: <strong style={{ color: '#10b981' }}>{ZAR((parseFloat(newJob.sub_payout) || 0) * 0.5)}</strong>
                </div>
              )}
              <div style={{ marginTop: 16 }}>
                <button type="submit" disabled={loading.newjob}
                  style={{ padding: '10px 28px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  {loading.newjob ? 'Creating...' : '+ Create Assignment'}
                </button>
              </div>
            </form>
          </div>

          {/* Job list */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h4 style={{ margin: 0, color: '#334155' }}>All Job Assignments ({jobs.length})</h4>
            <button onClick={handleReminders} disabled={loading.remind}
              style={{ padding: '7px 16px', background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {loading.remind ? 'Sending...' : '🔔 Send All Reminders'}
            </button>
          </div>

          {jobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>No job assignments yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {jobs.map(j => (
                <div key={j.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{j.title}</span>
                      <span style={{ marginLeft: 10, fontSize: 12, color: '#94a3b8' }}>#{j.id}</span>
                    </div>
                    {badge(j.status)}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13, color: '#475569' }}>
                    <strong>Subcontractor:</strong> {j.sub_name || `ID: ${j.sub_id}`}
                    {j.sub_email && <span style={{ color: '#94a3b8', marginLeft: 6 }}>({j.sub_email})</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 8, fontSize: 13 }}>
                    <span><span style={{ color: '#94a3b8' }}>Sub earns:</span> <strong style={{ color: '#10b981' }}>{ZAR(j.sub_payout)}</strong></span>
                    <span><span style={{ color: '#94a3b8' }}>Job value:</span> <strong style={{ color: '#0ea5e9' }}>{ZAR(j.job_value)}</strong></span>
                    <span><span style={{ color: '#94a3b8' }}>Margin:</span> <strong style={{ color: '#6366f1' }}>{ZAR(j.our_margin)}</strong></span>
                    {j.due_date && <span><span style={{ color: '#94a3b8' }}>Due:</span> <strong style={{ color: new Date(j.due_date) < new Date() && !['verified','paid'].includes(j.status) ? '#ef4444' : '#334155' }}>{new Date(j.due_date).toLocaleDateString('en-ZA')}</strong></span>}
                    {j.reminder_count > 0 && <span style={{ color: '#f59e0b' }}>🔔 {j.reminder_count} reminder(s) sent</span>}
                  </div>
                  {j.description && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b', background: '#f8fafc', padding: '6px 10px', borderRadius: 5 }}>{j.description}</p>}

                  {/* Status actions */}
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {j.status === 'assigned' && (
                      <button onClick={() => handleJobStatus(j.id, 'in_progress')} disabled={loading[`job_${j.id}`]}
                        style={{ padding: '5px 14px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Mark In Progress
                      </button>
                    )}
                    {['assigned','in_progress'].includes(j.status) && (
                      <button onClick={() => handleJobStatus(j.id, 'submitted')} disabled={loading[`job_${j.id}`]}
                        style={{ padding: '5px 14px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Mark Submitted
                      </button>
                    )}
                    {j.status === 'submitted' && (
                      <>
                        <button onClick={() => handleJobStatus(j.id, 'verified')} disabled={loading[`job_${j.id}`]}
                          style={{ padding: '5px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          ✓ Verify & Accept
                        </button>
                        <button onClick={() => handleJobStatus(j.id, 'in_progress')} disabled={loading[`job_${j.id}`]}
                          style={{ padding: '5px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          ✗ Return for Rework
                        </button>
                      </>
                    )}
                    {j.status === 'verified' && (
                      <button onClick={() => handleJobStatus(j.id, 'paid')} disabled={loading[`job_${j.id}`]}
                        style={{ padding: '5px 14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Mark Paid
                      </button>
                    )}
                    {!['paid','failed'].includes(j.status) && (
                      <button onClick={() => handleJobStatus(j.id, 'failed')} disabled={loading[`job_${j.id}`]}
                        style={{ padding: '5px 14px', background: '#f1f5f9', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Mark Failed
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
