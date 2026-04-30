import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import CTSLogo from './CTSLogo';

const API_BASE = process.env.REACT_APP_API_URL || '';

function fmt(n) { return n != null ? `R ${parseFloat(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'; }

function statusBadge(s) {
  const map = {
    assigned:      { bg: 'rgba(99,102,241,0.15)', color: '#818cf8', label: 'Assigned' },
    submitted:     { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', label: 'Submitted' },
    delivered:     { bg: 'rgba(20,184,166,0.15)', color: '#2dd4bf', label: 'Delivered' },
    completed:     { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Completed' },
    not_submitted: { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', label: 'Pending' },
  };
  const b = map[s] || map.not_submitted;
  return (
    <span style={{ background: b.bg, color: b.color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
      {b.label}
    </span>
  );
}

function payBadge(s) {
  const map = {
    paid:    { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: '✅ Paid' },
    pending: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: '⏳ Pending' },
    processing: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8', label: '🔄 Processing' },
  };
  const b = map[s] || map.pending;
  return (
    <span style={{ background: b.bg, color: b.color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
      {b.label}
    </span>
  );
}

function SubcontractorPortal({ user, token, onLogout }) {
  const [tab, setTab]               = useState('jobs');
  const [jobs, setJobs]             = useState([]);
  const [payments, setPayments]     = useState({ jobs: [], summary: {} });
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [submitJobId, setSubmitJobId] = useState('');
  const [file, setFile]             = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg]   = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef();

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 30000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchAll() {
    try {
      const [jr, pr, sr] = await Promise.all([
        axios.get(`${API_BASE}/api/sub/jobs`,       { headers }),
        axios.get(`${API_BASE}/api/sub/payments`,   { headers }),
        axios.get(`${API_BASE}/api/sub/submissions`, { headers }),
      ]);
      setJobs(Array.isArray(jr.data) ? jr.data : []);
      setPayments(pr.data || { jobs: [], summary: {} });
      setSubmissions(Array.isArray(sr.data) ? sr.data : []);
    } catch {}
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!submitJobId) return setSubmitMsg({ type: 'error', text: 'Please select a job.' });
    if (!file) return setSubmitMsg({ type: 'error', text: 'Please attach your completed work file.' });
    setSubmitting(true); setSubmitMsg(null);
    try {
      const fd = new FormData();
      fd.append('workFile', file);
      const res = await axios.post(`${API_BASE}/api/sub/jobs/${submitJobId}/submit`, fd, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
      });
      setSubmitMsg({
        type: 'success',
        text: res.data.message + ` AI Quality Score: ${res.data.quality?.score}/100 — ${res.data.quality?.verdict}`,
      });
      setFile(null); setSubmitJobId('');
      fetchAll();
    } catch (err) {
      setSubmitMsg({ type: 'error', text: err.response?.data?.error || 'Submission failed. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault(); setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  const outstandingJobs = jobs.filter(j => ['assigned', 'not_submitted'].includes(j.submission_status));
  const summary = payments.summary || {};

  const S = {
    page:   { minHeight: '100vh', background: '#0a1530', color: '#e2e8f0', fontFamily: "'Segoe UI',Arial,sans-serif" },
    header: { background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(99,102,241,0.2)' },
    main:   { maxWidth: 960, margin: '0 auto', padding: '32px 20px' },
    tabs:   { display: 'flex', gap: 4, background: '#0f172a', borderRadius: 12, padding: 4, marginBottom: 28 },
    tab:    (active) => ({ flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, transition: 'all .2s', background: active ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'transparent', color: active ? '#fff' : '#64748b' }),
    card:   { background: '#0f172a', borderRadius: 14, padding: 24, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 },
    lbl:    { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
    val:    { fontSize: 28, fontWeight: 800, color: '#fff', marginTop: 6 },
    inp:    { width: '100%', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 16px', color: '#e2e8f0', fontSize: 15, boxSizing: 'border-box', outline: 'none' },
  };

  const isAdmin = user.role === 'admin';

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <CTSLogo size="sm" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{user.name}</div>
              {isAdmin && (
                <span style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>
                  ADMIN VIEW
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: isAdmin ? '#f59e0b' : '#6366f1', letterSpacing: 1 }}>
              {isAdmin ? 'VIEWING ALL SUBCONTRACTOR DATA' : 'SUBCONTRACTOR PORTAL'}
            </div>
          </div>
        </div>
        <button onClick={onLogout} style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>
          Sign Out
        </button>
      </div>

      {isAdmin && (
        <div style={{ background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.2)', padding: '10px 32px', fontSize: 13, color: '#fbbf24', textAlign: 'center' }}>
          You are viewing the portal as <strong>Admin</strong>. All jobs and payments across all subcontractors are shown. Work submission is disabled in admin mode.
        </div>
      )}

      <div style={S.main}>
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 28 }}>
          <div style={S.card}>
            <div style={S.lbl}>{isAdmin ? 'Total Jobs' : 'Outstanding Jobs'}</div>
            <div style={{ ...S.val, color: '#818cf8' }}>{isAdmin ? jobs.length : outstandingJobs.length}</div>
          </div>
          <div style={S.card}>
            <div style={S.lbl}>{isAdmin ? 'Total Payable' : 'Total Earned (Owed)'}</div>
            <div style={{ ...S.val, color: '#f59e0b' }}>{fmt(summary.totalOwed)}</div>
          </div>
          <div style={S.card}>
            <div style={S.lbl}>Total Paid Out</div>
            <div style={{ ...S.val, color: '#10b981' }}>{fmt(summary.totalPaid)}</div>
          </div>
          <div style={S.card}>
            <div style={S.lbl}>Jobs Completed</div>
            <div style={{ ...S.val, color: '#2dd4bf' }}>{summary.jobsCompleted ?? 0}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {(isAdmin
            ? [['jobs','📋 All Jobs'],['payments','💳 All Payments']]
            : [['jobs','📋 My Jobs'],['submit','⬆ Submit Work'],['payments','💳 Payments']]
          ).map(([id, label]) => (
            <button key={id} style={S.tab(tab === id)} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>Loading your portal data...
          </div>
        )}

        {/* ── MY JOBS TAB ── */}
        {!loading && tab === 'jobs' && (
          <div>
            {jobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                <div style={{ fontSize: 18, color: '#94a3b8' }}>No jobs assigned yet.</div>
                <div style={{ marginTop: 8, fontSize: 14 }}>Once a job is assigned to you, it will appear here.</div>
              </div>
            ) : jobs.map(job => (
              <div key={job.id} style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 17, color: '#fff' }}>{job.title}</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Job #{job.id} · Assigned {new Date(job.created_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {statusBadge(job.submission_status || job.status)}
                  </div>
                </div>

                {job.description && (
                  <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>{job.description}</p>
                )}

                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  {isAdmin && job.subcontractor_name && (
                    <div><div style={S.lbl}>Subcontractor</div><div style={{ color: '#a5b4fc', fontWeight: 600 }}>{job.subcontractor_name}</div></div>
                  )}
                  <div><div style={S.lbl}>{isAdmin ? 'Payout' : 'Your Payout'}</div><div style={{ color: '#10b981', fontWeight: 700 }}>{fmt(job.sub_payout)}</div></div>
                  {job.due_date && <div><div style={S.lbl}>Due Date</div><div style={{ color: '#fbbf24', fontWeight: 600 }}>{new Date(job.due_date).toLocaleDateString()}</div></div>}
                  {job.submitted_at && <div><div style={S.lbl}>Submitted</div><div style={{ color: '#94a3b8' }}>{new Date(job.submitted_at).toLocaleString()}</div></div>}
                </div>

                {!isAdmin && ['assigned','not_submitted'].includes(job.submission_status || job.status) && (
                  <button
                    onClick={() => { setSubmitJobId(String(job.id)); setTab('submit'); }}
                    style={{ marginTop: 16, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                  >
                    ⬆ Submit Completed Work
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── SUBMIT WORK TAB ── */}
        {!loading && tab === 'submit' && (
          <div style={S.card}>
            <h3 style={{ color: '#fff', marginBottom: 8 }}>⬆ Upload Completed Work</h3>
            <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24 }}>
              Select the job and attach your completed work file. The AI will verify quality and deliver it to the client automatically.
            </p>

            {submitMsg && (
              <div style={{ background: submitMsg.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${submitMsg.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 10, padding: '14px 18px', color: submitMsg.type === 'success' ? '#10b981' : '#ef4444', marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
                {submitMsg.type === 'success' ? '✅ ' : '⚠️ '}{submitMsg.text}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ ...S.lbl, display: 'block', marginBottom: 8 }}>Select Job</label>
                <select value={submitJobId} onChange={e => setSubmitJobId(e.target.value)} style={S.inp} required>
                  <option value="">— Choose a job —</option>
                  {outstandingJobs.map(j => (
                    <option key={j.id} value={j.id}>#{j.id} — {j.title}</option>
                  ))}
                  {outstandingJobs.length === 0 && <option disabled>No outstanding jobs</option>}
                </select>
              </div>

              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{ border: `2px dashed ${isDragging ? '#6366f1' : 'rgba(99,102,241,0.3)'}`, borderRadius: 14, padding: '48px 24px', textAlign: 'center', cursor: 'pointer', background: isDragging ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)', transition: 'all .2s', marginBottom: 20 }}
              >
                <input ref={fileRef} type="file" hidden onChange={e => setFile(e.target.files[0])} />
                {file ? (
                  <div>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                    <div style={{ color: '#10b981', fontWeight: 700 }}>{file.name}</div>
                    <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB — Click to change</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>📁</div>
                    <div style={{ color: '#94a3b8', fontSize: 16 }}>Drop your file here or click to browse</div>
                    <div style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>Accepted: .doc, .pdf, .txt, .csv, .xls, .mp3, .mp4, .wav, .zip (max 50MB)</div>
                  </div>
                )}
              </div>

              <button type="submit" disabled={submitting || !file || !submitJobId} style={{ width: '100%', background: (submitting || !file || !submitJobId) ? '#1e293b' : 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 0', fontSize: 16, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', transition: 'all .2s' }}>
                {submitting ? '⏳ Submitting & Running AI Check...' : '⬆ Submit Completed Work'}
              </button>
            </form>
          </div>
        )}

        {/* ── PAYMENTS TAB ── */}
        {!loading && tab === 'payments' && (
          <div>
            {payments.jobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>💳</div>
                <div style={{ fontSize: 18, color: '#94a3b8' }}>No payment records yet.</div>
                <div style={{ marginTop: 8, fontSize: 14 }}>Payments appear here once jobs are completed and delivered.</div>
              </div>
            ) : payments.jobs.map(j => (
              <div key={j.id} style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#fff' }}>{j.title}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      Job #{j.id} · {new Date(j.created_at).toLocaleDateString()}
                      {j.confirmed_at && ` · Confirmed ${new Date(j.confirmed_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: 18, color: j.payout_status === 'paid' ? '#10b981' : '#f59e0b' }}>{fmt(j.sub_payout)}</div>
                      {j.payout_reference && <div style={{ fontSize: 11, color: '#475569' }}>Ref: {j.payout_reference}</div>}
                    </div>
                    {payBadge(j.payout_status || 'pending')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SubcontractorPortal;
