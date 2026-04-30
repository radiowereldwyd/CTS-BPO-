import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './EmailTemplates.css';

function getHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

// ── Static template definitions (no API needed for list) ─────────────────────
const TEMPLATES = [
  { key: 'bpoApplication',     name: 'Cold Outreach',      category: 'outreach',    stage: 1 },
  { key: 'followUp',           name: 'Follow-Up',           category: 'outreach',    stage: 2 },
  { key: 'negotiationOpening', name: 'Pricing Proposal',    category: 'negotiation', stage: 3 },
  { key: 'contractProposal',   name: 'Contract Proposal',   category: 'negotiation', stage: 4 },
  { key: 'clientWelcome',      name: 'Client Welcome',      category: 'onboarding',  stage: 5 },
  { key: 'invoiceSent',        name: 'Invoice',             category: 'billing',     stage: 6 },
  { key: 'paymentConfirmed',   name: 'Payment Confirmed',   category: 'billing',     stage: 7 },
  { key: 'workComplete',       name: 'Work Delivery',       category: 'delivery',    stage: 8 },
  { key: 'feedbackRequest',    name: 'Feedback Request',    category: 'retention',   stage: 9 },
];

const CATEGORY_META = {
  outreach:    { label: 'Outreach',    icon: '📡', color: '#3b82f6' },
  negotiation: { label: 'Negotiation', icon: '🤝', color: '#8b5cf6' },
  onboarding:  { label: 'Onboarding',  icon: '🎉', color: '#10b981' },
  billing:     { label: 'Billing',     icon: '💰', color: '#f59e0b' },
  delivery:    { label: 'Delivery',    icon: '📦', color: '#06b6d4' },
  retention:   { label: 'Retention',   icon: '⭐', color: '#ec4899' },
};

const STAGE_TRIGGERS = [
  '',
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

const grouped = Object.keys(CATEGORY_META).reduce((acc, cat) => {
  acc[cat] = TEMPLATES.filter(t => t.category === cat);
  return acc;
}, {});

export default function EmailTemplates() {
  const [selected, setSelected]       = useState(TEMPLATES[0]);
  const [preview, setPreview]         = useState(null);
  const [previewMode, setPreviewMode] = useState('html');
  const [prevLoading, setPrevLoading] = useState(false);
  const [prevError, setPrevError]     = useState('');
  const [testEmail, setTestEmail]     = useState('');
  const [testStatus, setTestStatus]   = useState(null);
  const [testMsg, setTestMsg]         = useState('');

  const loadPreview = useCallback((key) => {
    if (!key) return;
    setPrevLoading(true);
    setPrevError('');
    setPreview(null);
    axios.get(`/api/email/templates/${key}/preview`, { headers: getHeaders() })
      .then(r => setPreview(r.data))
      .catch(err => {
        const msg = err.response?.data?.error || err.message || 'Failed to load preview';
        setPrevError(msg);
      })
      .finally(() => setPrevLoading(false));
  }, []);

  useEffect(() => { if (selected) loadPreview(selected.key); }, [selected, loadPreview]);

  const handleTestSend = async () => {
    if (!testEmail || !selected) return;
    setTestStatus('sending');
    setTestMsg('');
    try {
      const r = await axios.post(
        `/api/email/templates/${selected.key}/test`,
        { to: testEmail },
        { headers: getHeaders() }
      );
      if (r.data.sent) {
        setTestStatus('ok');
        setTestMsg(`✅ Sent to ${testEmail} — check inbox!`);
      } else {
        setTestStatus('ok');
        setTestMsg(`⚠️ Simulated (Gmail not configured) — not actually delivered.`);
      }
    } catch (err) {
      setTestStatus('error');
      setTestMsg(`❌ ${err.response?.data?.error || err.message}`);
    }
  };

  const meta = selected ? CATEGORY_META[selected.category] : null;

  return (
    <div className="et-container">

      {/* ── Page header ── */}
      <div className="et-header">
        <div>
          <h1>📧 Email &amp; Marketing Templates</h1>
          <p>Full sales funnel — cold outreach to client retention</p>
        </div>
        <div className="et-pipeline-badge">9 Templates · 6 Stages</div>
      </div>

      {/* ── Pipeline bar ── */}
      <div className="et-pipeline">
        {Object.entries(CATEGORY_META).map(([cat, m], idx, arr) => (
          <React.Fragment key={cat}>
            <div
              className={`et-pipe-step ${selected?.category === cat ? 'active' : ''}`}
              onClick={() => { const f = grouped[cat]?.[0]; if (f) setSelected(f); }}
            >
              <span className="pipe-icon">{m.icon}</span>
              <span className="pipe-label">{m.label}</span>
            </div>
            {idx < arr.length - 1 && <span className="et-pipe-arrow">→</span>}
          </React.Fragment>
        ))}
      </div>

      {/* ── Body: sidebar + main ── */}
      <div className="et-layout">

        {/* Sidebar */}
        <div className="et-sidebar">
          {Object.entries(CATEGORY_META).map(([cat, m]) => (
            <div key={cat} className="et-sidebar-group">
              <div className="et-sidebar-heading" style={{ color: m.color }}>
                {m.icon} {m.label}
              </div>
              {grouped[cat].map(t => (
                <div
                  key={t.key}
                  className={`et-sidebar-item${selected?.key === t.key ? ' active' : ''}`}
                  style={selected?.key === t.key ? { borderLeftColor: m.color, color: m.color } : {}}
                  onClick={() => setSelected(t)}
                >
                  <span className="et-item-stage">#{t.stage}</span>
                  {t.name}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Main panel */}
        <div className="et-main">
          {/* Template info bar */}
          <div className="et-main-header">
            <div className="et-main-title">
              <span className="et-stage-num">Stage {selected?.stage}</span>
              <h2>{selected?.name}</h2>
              {meta && (
                <span className="et-cat-badge" style={{ background: meta.color + '22', color: meta.color }}>
                  {meta.icon} {meta.label}
                </span>
              )}
            </div>
            <p className="et-trigger">
              <strong>Trigger:</strong> {STAGE_TRIGGERS[selected?.stage] || ''}
            </p>
          </div>

          {/* Subject line */}
          {preview?.subject && (
            <div className="et-subject-bar">
              <span className="et-subject-label">SUBJECT</span>
              <span className="et-subject-text">{preview.subject}</span>
            </div>
          )}

          {/* Preview toolbar */}
          <div className="et-preview-toolbar">
            <span className="et-preview-label">Email Preview</span>
            <div className="et-view-tabs">
              <button className={previewMode === 'html' ? 'active' : ''} onClick={() => setPreviewMode('html')}>
                Rendered
              </button>
              <button className={previewMode === 'text' ? 'active' : ''} onClick={() => setPreviewMode('text')}>
                Raw HTML
              </button>
            </div>
            <button className="et-refresh-btn" onClick={() => loadPreview(selected?.key)}>↻</button>
          </div>

          {/* Preview content */}
          <div className="et-preview-area">
            {prevLoading && (
              <div className="et-prev-loading"><div className="et-spinner" /></div>
            )}
            {prevError && !prevLoading && (
              <div className="et-prev-error">⚠️ {prevError}</div>
            )}
            {!prevLoading && !prevError && preview && (
              previewMode === 'html' ? (
                <div className="et-iframe-wrap">
                  <iframe
                    key={selected?.key}
                    title="email-preview"
                    className="et-iframe"
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box}body{margin:0;padding:20px;background:#dde3ea}img{max-width:100%}</style></head><body>${preview.html}</body></html>`}
                  />
                </div>
              ) : (
                <pre className="et-raw-html">{preview.html}</pre>
              )
            )}
          </div>

          {/* Test send */}
          <div className="et-test-send">
            <h3>🧪 Send Test Email</h3>
            <p>Sends this template with sample data so you can see exactly how it lands in an inbox.</p>
            <div className="et-test-row">
              <input
                type="email"
                className="et-test-input"
                placeholder="your@email.com"
                value={testEmail}
                onChange={e => { setTestEmail(e.target.value); setTestStatus(null); }}
              />
              <button
                className={`et-test-btn${testStatus === 'sending' ? ' sending' : ''}`}
                onClick={handleTestSend}
                disabled={!testEmail || testStatus === 'sending'}
              >
                {testStatus === 'sending' ? '⏳ Sending…' : '📨 Send Test'}
              </button>
            </div>
            {testMsg && <div className={`et-test-msg ${testStatus}`}>{testMsg}</div>}
          </div>
        </div>
      </div>

      {/* ── Pipeline explainer ── */}
      <div className="et-info-box">
        <h3>🤖 How the Automated Pipeline Works</h3>
        <div className="et-info-grid">
          {[
            ['🔍', 'Stage 1–2: AI Scans & Outreaches', 'The job scanner finds companies needing BPO work, automatically sends Cold Outreach, then Follow-Up if no reply after 5–7 days.'],
            ['🤝', 'Stage 3–4: Negotiation', 'When a prospect replies, send the Pricing Proposal. Once agreed verbally, send the Contract Proposal to formalise the deal.'],
            ['⚙️', 'Stage 5–7: Onboarding & Billing', 'Welcome the client, assign subcontractors, deliver the work, send the Invoice. Payment confirmation fires automatically.'],
            ['🔁', 'Stage 8–9: Delivery & Retention', 'Work Delivery notifies the client files are ready. Feedback Request builds reputation and encourages repeat orders.'],
          ].map(([icon, title, text]) => (
            <div key={title} className="et-info-item">
              <span className="et-info-icon">{icon}</span>
              <div><strong>{title}</strong><p>{text}</p></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
