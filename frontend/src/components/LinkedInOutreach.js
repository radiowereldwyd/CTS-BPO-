/**
 * LinkedIn Outreach Generator
 * AI-powered warm outreach message builder for LinkedIn
 */
import React, { useState } from 'react';

const API = '';

const S = {
  page:  { padding: '32px 40px', maxWidth: 1100, margin: '0 auto' },
  h1:    { margin: '0 0 4px', color: '#0f172a', fontSize: 26, fontWeight: 900 },
  sub:   { color: '#64748b', fontSize: 14, margin: '0 0 28px' },
  card:  { background: '#fff', borderRadius: 12, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 20 },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  inp:   { width: '100%', padding: '11px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' },
  sel:   { width: '100%', padding: '11px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit' },
  btn:   (c, dis) => ({ padding: '12px 24px', background: dis ? '#e2e8f0' : c, color: dis ? '#94a3b8' : '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: dis ? 'not-allowed' : 'pointer' }),
  msg:   { width: '100%', minHeight: 110, padding: '11px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  msgBox:{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', marginBottom: 16, position: 'relative' },
};

const INDUSTRIES = ['Legal', 'Medical / Healthcare', 'Financial Services', 'Retail / E-commerce', 'Logistics / Supply Chain', 'Education', 'Real Estate', 'Insurance', 'Technology / SaaS', 'Manufacturing', 'Government / NGO', 'Hospitality', 'Media / Marketing', 'Other'];
const PAIN_POINTS = [
  'Too much manual data entry slowing the team down',
  'Backlog of documents / invoices that can\'t be processed',
  'Spending too much on in-house admin staff',
  'Need transcription or translation but no in-house capacity',
  'Scaling fast and need outsourced back-office support',
  'Quality issues with current outsourcing provider',
  'Need 24/7 customer support coverage',
  'Custom — I\'ll describe it below',
];

const COPY_LABELS = ['Connection Request', 'Follow-Up 1 (Day 3)', 'Follow-Up 2 (Day 7)', 'Cold Email Subject', 'Cold Email Body'];

function CopyBox({ label, text, charLimit }) {
  const [copied, setCopied] = useState(false);
  const over = charLimit && text.length > charLimit;

  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div style={S.msgBox}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {charLimit && (
            <span style={{ fontSize: 12, color: over ? '#ef4444' : '#94a3b8', fontWeight: over ? 700 : 400 }}>
              {text.length} / {charLimit} chars {over ? '⚠ over limit' : ''}
            </span>
          )}
          <button onClick={copy} style={{ padding: '5px 14px', background: copied ? '#10b981' : '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
      </div>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14, color: '#1e293b', lineHeight: 1.7, fontFamily: 'inherit' }}>{text}</pre>
    </div>
  );
}

export default function LinkedInOutreach({ token }) {
  const [form, setForm] = useState({
    prospectName: '', jobTitle: '', company: '', industry: '', painPoint: '', customPain: '', city: '', tone: 'professional',
  });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState([]);
  const [savingIdx, setSavingIdx] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function generate() {
    if (!form.prospectName || !form.company || !form.industry) { setError('Please fill in Prospect Name, Company and Industry.'); return; }
    setError('');
    setLoading(true);
    setResults(null);
    try {
      const res = await fetch(`${API}/api/linkedin/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setResults(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function saveProspect() {
    setSavingIdx('saving');
    try {
      await fetch(`${API}/api/linkedin/prospects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, messages: results }),
      });
      setSaved(s => [{ ...form, ts: Date.now() }, ...s]);
    } catch {}
    setSavingIdx(null);
  }

  return (
    <div style={S.page}>
      <h1 style={S.h1}>🔗 LinkedIn Warm Outreach Generator</h1>
      <p style={S.sub}>Fill in your prospect's details — AI writes a personalised connection request, two follow-up messages and a cold email, all tailored to their industry and pain point.</p>

      {/* Form */}
      <div style={S.card}>
        <h3 style={{ margin: '0 0 20px', color: '#0f172a', fontSize: 16, fontWeight: 800 }}>Prospect Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={S.label}>Prospect Name *</label>
            <input style={S.inp} value={form.prospectName} onChange={e => set('prospectName', e.target.value)} placeholder="e.g. Sarah Johnson" />
          </div>
          <div>
            <label style={S.label}>Job Title</label>
            <input style={S.inp} value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)} placeholder="e.g. Operations Manager" />
          </div>
          <div>
            <label style={S.label}>Company *</label>
            <input style={S.inp} value={form.company} onChange={e => set('company', e.target.value)} placeholder="e.g. Acme Logistics" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={S.label}>Industry *</label>
            <select style={S.sel} value={form.industry} onChange={e => set('industry', e.target.value)}>
              <option value="">— Select —</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>City / Region</label>
            <input style={S.inp} value={form.city} onChange={e => set('city', e.target.value)} placeholder="e.g. Johannesburg" />
          </div>
          <div>
            <label style={S.label}>Tone</label>
            <select style={S.sel} value={form.tone} onChange={e => set('tone', e.target.value)}>
              <option value="professional">Professional & Formal</option>
              <option value="friendly">Friendly & Conversational</option>
              <option value="direct">Direct & Concise</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={S.label}>Their Likely Pain Point</label>
          <select style={S.sel} value={form.painPoint} onChange={e => set('painPoint', e.target.value)}>
            <option value="">— Select the best match —</option>
            {PAIN_POINTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {form.painPoint === "Custom — I'll describe it below" && (
          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>Describe the Pain Point</label>
            <textarea style={S.msg} value={form.customPain} onChange={e => set('customPain', e.target.value)} placeholder="Describe the specific problem this prospect likely has..." rows={3} />
          </div>
        )}

        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>⚠ {error}</div>}

        <button onClick={generate} disabled={loading} style={{ ...S.btn('#6366f1', loading), width: '100%', padding: '14px 24px', fontSize: 15 }}>
          {loading ? '⏳ Generating with AI…' : '✨ Generate Outreach Messages'}
        </button>
      </div>

      {/* Results */}
      {results && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: 16, fontWeight: 800 }}>
              Generated for <span style={{ color: '#6366f1' }}>{form.prospectName}</span> at <span style={{ color: '#6366f1' }}>{form.company}</span>
            </h3>
            <button onClick={saveProspect} disabled={savingIdx === 'saving'} style={S.btn('#10b981', savingIdx === 'saving')}>
              {savingIdx === 'saving' ? 'Saving…' : '💾 Save Prospect'}
            </button>
          </div>

          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 18px', marginBottom: 20, fontSize: 13, color: '#166534' }}>
            <strong>LinkedIn workflow:</strong> Send the Connection Request → wait for accept → send Follow-Up 1 on day 3 → if no reply, Follow-Up 2 on day 7 → the Cold Email is for direct email if LinkedIn doesn't convert.
          </div>

          <CopyBox label="🔗 LinkedIn Connection Request (up to 300 chars)" text={results.connectionRequest} charLimit={300} />
          <CopyBox label="📩 Follow-Up 1 — Send 3 days after connecting" text={results.followUp1} />
          <CopyBox label="📩 Follow-Up 2 — Send 7 days after connecting (if no reply)" text={results.followUp2} />

          <div style={{ borderTop: '2px dashed #e2e8f0', margin: '20px 0', paddingTop: 20 }}>
            <p style={{ margin: '0 0 14px', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>📧 Cold Email (if you have their email address)</p>
            <CopyBox label="Subject Line" text={results.emailSubject} />
            <CopyBox label="Email Body" text={results.emailBody} />
          </div>

          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#1e40af' }}>
            <strong>💡 Pro tip:</strong> Personalise the message further by mentioning a recent post they made, a company announcement, or a mutual connection before sending.
          </div>
        </div>
      )}

      {/* Saved prospects */}
      {saved.length > 0 && (
        <div style={S.card}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>💾 Saved This Session ({saved.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                {['Name', 'Title', 'Company', 'Industry', 'Saved'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {saved.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>{p.prospectName}</td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>{p.jobTitle || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>{p.company}</td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>{p.industry}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{new Date(p.ts).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
