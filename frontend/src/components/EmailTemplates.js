import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './EmailTemplates.css';

const API = '';

function getHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

const CATEGORY_META = {
  outreach:    { label: 'Outreach',     icon: '📡', color: '#1e40af', bg: '#eff6ff' },
  negotiation: { label: 'Negotiation',  icon: '🤝', color: '#7c3aed', bg: '#f5f3ff' },
  onboarding:  { label: 'Onboarding',   icon: '🎉', color: '#059669', bg: '#ecfdf5' },
  billing:     { label: 'Billing',      icon: '💰', color: '#b45309', bg: '#fffbeb' },
  delivery:    { label: 'Delivery',     icon: '📦', color: '#0891b2', bg: '#ecfeff' },
  retention:   { label: 'Retention',    icon: '⭐', color: '#be185d', bg: '#fdf2f8' },
};

const STAGE_LABELS = [
  '', // 0 placeholder
  'AI scans web → finds company needing BPO → sends this email',
  'No reply after 5–7 days → system auto-sends follow-up',
  'Client replies positively → you send pricing & terms',
  'Verbal agreement reached → send formal service agreement',
  'Contract accepted → welcome the new client aboard',
  'Work delivered or milestone reached → request payment',
  'Payment lands → send immediate confirmation',
  'Task batch complete → deliver output files to client',
  'After delivery → request review or testimonial',
];

export default function EmailTemplates() {
  const [templates, setTemplates]       = useState([]);
  const [selected, setSelected]         = useState(null);
  const [preview, setPreview]           = useState(null);
  const [previewMode, setPreviewMode]   = useState('html'); // 'html' | 'text'
  const [loading, setLoading]           = useState(true);
  const [prevLoading, setPrevLoading]   = useState(false);
  const [testEmail, setTestEmail]       = useState('');
  const [testStatus, setTestStatus]     = useState(null); // null | 'sending' | 'ok' | 'error'
  const [testMsg, setTestMsg]           = useState('');

  // Load template list from backend
  useEffect(() => {
    axios.get(`${API}/api/email/templates`, { headers: getHeaders() })
      .then(r => {
        setTemplates(r.data);
        if (r.data.length > 0) setSelected(r.data[0]);
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  // Load HTML preview whenever selected changes
  const loadPreview = useCallback((key) => {
    if (!key) return;
    setPrevLoading(true);
    setPreview(null);
    axios.get(`${API}/api/email/templates/${key}/preview`, { headers: getHeaders() })
      .then(r => setPreview(r.data))
      .catch(() => setPreview({ subject: 'Error loading preview', html: '<p>Could not load preview.</p>' }))
      .finally(() => setPrevLoading(false));
  }, []);

  useEffect(() => { if (selected) loadPreview(selected.key); }, [selected, loadPreview]);

  const handleTestSend = async () => {
    if (!testEmail || !selected) return;
    setTestStatus('sending');
    setTestMsg('');
    try {
      const r = await axios.post(`${API}/api/email/templates/${selected.key}/test`, { to: testEmail }, { headers: getHeaders() });
      if (r.data.sent) {
        setTestStatus('ok');
        setTestMsg(`✅ Sent to ${testEmail} — check inbox!`);
      } else {
        setTestStatus('ok');
        setTestMsg(`⚠️ Simulated (Gmail not configured) — email not actually delivered.`);
      }
    } catch (err) {
      setTestStatus('error');
      setTestMsg(`❌ ${err.response?.data?.error || err.message}`);
    }
  };

  const grouped = Object.keys(CATEGORY_META).reduce((acc, cat) => {
    acc[cat] = templates.filter(t => t.category === cat);
    return acc;
  }, {});

  if (loading) return (
    <div className="et-container">
      <div className="et-loading"><div className="et-spinner" /><p>Loading templates…</p></div>
    </div>
  );

  return (
    <div className="et-container">

      {/* ── Header ── */}
      <div className="et-header">
        <div>
          <h1>📧 Email & Marketing Templates</h1>
          <p>Full sales funnel — from cold outreach to client retention</p>
        </div>
        <div className="et-pipeline-badge">9 Templates · 6 Stages</div>
      </div>

      {/* ── Pipeline diagram ── */}
      <div className="et-pipeline">
        {Object.entries(CATEGORY_META).map(([cat, meta], idx, arr) => (
          <React.Fragment key={cat}>
            <div
              className={`et-pipe-step ${selected?.category === cat ? 'active' : ''}`}
              style={{ '--step-color': meta.color, '--step-bg': meta.bg }}
              onClick={() => {
                const first = grouped[cat]?.[0];
                if (first) setSelected(first);
              }}
            >
              <span className="pipe-icon">{meta.icon}</span>
              <span className="pipe-label">{meta.label}</span>
            </div>
            {idx < arr.length - 1 && <div className="et-pipe-arrow">→</div>}
          </React.Fragment>
        ))}
      </div>

      <div className="et-layout">

        {/* ── Sidebar ── */}
        <div className="et-sidebar">
          {Object.entries(CATEGORY_META).map(([cat, meta]) => (
            grouped[cat]?.length > 0 && (
              <div key={cat} className="et-sidebar-group">
                <div className="et-sidebar-heading" style={{ color: meta.color }}>
                  {meta.icon} {meta.label}
                </div>
                {grouped[cat].map(t => (
                  <div
                    key={t.key}
                    className={`et-sidebar-item ${selected?.key === t.key ? 'active' : ''}`}
                    style={selected?.key === t.key ? { borderLeftColor: meta.color, color: meta.color } : {}}
                    onClick={() => setSelected(t)}
                  >
                    <span className="et-item-stage">#{t.stage}</span>
                    {t.name}
                  </div>
                ))}
              </div>
            )
          ))}
        </div>

        {/* ── Main panel ── */}
        <div className="et-main">
          {selected ? (
            <>
              {/* Template header */}
              <div className="et-main-header">
                <div>
                  <div className="et-main-title">
                    <span className="et-stage-num">Stage {selected.stage}</span>
                    <h2>{selected.name}</h2>
                    <span
                      className="et-cat-badge"
                      style={{ background: CATEGORY_META[selected.category]?.bg, color: CATEGORY_META[selected.category]?.color }}
                    >
                      {CATEGORY_META[selected.category]?.icon} {CATEGORY_META[selected.category]?.label}
                    </span>
                  </div>
                  <p className="et-trigger">
                    <strong>Trigger:</strong> {STAGE_LABELS[selected.stage] || selected.description}
                  </p>
                </div>
              </div>

              {/* Subject line */}
              {preview && (
                <div className="et-subject-bar">
                  <span className="et-subject-label">SUBJECT</span>
                  <span className="et-subject-text">{preview.subject}</span>
                </div>
              )}

              {/* Preview area */}
              <div className="et-preview-area">
                <div className="et-preview-toolbar">
                  <span className="et-preview-label">Email Preview</span>
                  <div className="et-view-tabs">
                    <button className={previewMode === 'html' ? 'active' : ''} onClick={() => setPreviewMode('html')}>HTML Render</button>
                    <button className={previewMode === 'text' ? 'active' : ''} onClick={() => setPreviewMode('text')}>Raw HTML</button>
                  </div>
                  <button className="et-refresh-btn" onClick={() => loadPreview(selected.key)} title="Reload preview">↻ Refresh</button>
                </div>

                {prevLoading ? (
                  <div className="et-prev-loading"><div className="et-spinner" /></div>
                ) : preview ? (
                  previewMode === 'html' ? (
                    <div className="et-iframe-wrap">
                      <iframe
                        key={selected?.key}
                        title="email-preview"
                        className="et-iframe"
                        srcDoc={`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:#e2e8f0;font-family:'Segoe UI',Arial,sans-serif}img{max-width:100%;height:auto}</style></head><body>${preview.html}</body></html>`}
                      />
                    </div>
                  ) : (
                    <pre className="et-raw-html">{preview.html}</pre>
                  )
                ) : null}
              </div>

              {/* Test send */}
              <div className="et-test-send">
                <h3>🧪 Send Test Email</h3>
                <p>Send this template with sample data to any address to verify it looks correct.</p>
                <div className="et-test-row">
                  <input
                    type="email"
                    placeholder="recipient@example.com"
                    value={testEmail}
                    onChange={e => { setTestEmail(e.target.value); setTestStatus(null); }}
                    className="et-test-input"
                  />
                  <button
                    className={`et-test-btn ${testStatus === 'sending' ? 'sending' : ''}`}
                    onClick={handleTestSend}
                    disabled={!testEmail || testStatus === 'sending'}
                  >
                    {testStatus === 'sending' ? '⏳ Sending…' : '📨 Send Test'}
                  </button>
                </div>
                {testMsg && (
                  <div className={`et-test-msg ${testStatus}`}>{testMsg}</div>
                )}
              </div>
            </>
          ) : (
            <div className="et-empty">
              <div style={{ fontSize: 48 }}>📧</div>
              <p>Select a template from the sidebar</p>
            </div>
          )}
        </div>
      </div>

      {/* ── How the pipeline works ── */}
      <div className="et-info-box">
        <h3>🤖 How the Automated Pipeline Works</h3>
        <div className="et-info-grid">
          <div className="et-info-item">
            <span className="et-info-icon">🔍</span>
            <div>
              <strong>Stage 1–2: AI Scans & Outreaches</strong>
              <p>The job scanner finds companies needing BPO work. It automatically sends the Cold Outreach email, then a Follow-Up if there is no reply after 5–7 days.</p>
            </div>
          </div>
          <div className="et-info-item">
            <span className="et-info-icon">🤝</span>
            <div>
              <strong>Stage 3–4: Negotiation</strong>
              <p>When a prospect replies, you send the Pricing Proposal manually. Once they agree verbally, you send the Contract Proposal to formalise the deal.</p>
            </div>
          </div>
          <div className="et-info-item">
            <span className="et-info-icon">⚙️</span>
            <div>
              <strong>Stage 5–7: Onboarding & Billing</strong>
              <p>Welcome the client, assign subcontractors, deliver the work, and send the Invoice. Payment confirmation is sent automatically when payment lands.</p>
            </div>
          </div>
          <div className="et-info-item">
            <span className="et-info-icon">🔁</span>
            <div>
              <strong>Stage 8–9: Delivery & Retention</strong>
              <p>Work Delivery notifies the client their files are ready. Feedback Request builds your reputation and encourages repeat orders.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
