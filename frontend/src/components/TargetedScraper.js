import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || '';

const COUNTRIES = [
  { value: '', label: '— Any country —' },
  { value: 'South Africa', label: 'South Africa' },
  { value: 'Africa', label: 'Africa (All)' },
  { value: 'Nigeria', label: 'Nigeria' },
  { value: 'Kenya', label: 'Kenya' },
  { value: 'Ghana', label: 'Ghana' },
  { value: 'United States', label: 'United States' },
  { value: 'United Kingdom', label: 'United Kingdom' },
  { value: 'Australia', label: 'Australia' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Germany', label: 'Germany' },
  { value: 'Netherlands', label: 'Netherlands' },
  { value: 'Singapore', label: 'Singapore' },
  { value: 'UAE', label: 'UAE / Dubai' },
  { value: 'India', label: 'India' },
  { value: 'Global', label: 'Global' },
];

const INDUSTRIES = [
  { value: '', label: '— Any industry —' },
  { value: 'law firm', label: 'Law Firms / Legal' },
  { value: 'medical clinic', label: 'Medical Clinics' },
  { value: 'dental practice', label: 'Dental Practices' },
  { value: 'school', label: 'Schools & Education' },
  { value: 'retail shop', label: 'Shops & Retail' },
  { value: 'accounting firm', label: 'Accounting Firms' },
  { value: 'insurance company', label: 'Insurance' },
  { value: 'logistics company', label: 'Logistics & Freight' },
  { value: 'real estate agency', label: 'Real Estate' },
  { value: 'recruitment agency', label: 'Recruitment / HR' },
  { value: 'IT services company', label: 'IT Services' },
  { value: 'financial services', label: 'Financial Services' },
  { value: 'healthcare company', label: 'Healthcare' },
  { value: 'pharmaceutical company', label: 'Pharmaceuticals' },
  { value: 'manufacturing company', label: 'Manufacturing' },
  { value: 'construction company', label: 'Construction' },
  { value: 'hospitality hotel', label: 'Hospitality / Hotels' },
  { value: 'NGO nonprofit', label: 'NGO / Nonprofit' },
  { value: 'government agency', label: 'Government / Public Sector' },
];

export default function TargetedScraper({ token }) {
  const [country, setCountry]   = useState('');
  const [industry, setIndustry] = useState('');
  const [keywords, setKeywords] = useState('');
  const [limit, setLimit]       = useState(100);

  const [session, setSession]   = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(new Set());

  const [subject, setSubject]   = useState('Partnering with CTS BPO — Outsourcing Solutions for {{company}}');
  const [body, setBody]         = useState(
    `Dear {{company}} Team,\n\nI hope this message finds you well.\n\nMy name is Calvin Thomas, and I represent CTS BPO — a specialised business process outsourcing firm based in South Africa. We help companies like yours reduce operational costs and improve efficiency by handling data entry, document processing, transcription, virtual assistance, and back-office functions.\n\nWould you be open to a brief conversation about how we could support your team?\n\nKind regards,\nCalvin Thomas\nCTS BPO Solutions\ncts.cybersolutions@gmail.com`
  );
  const [pdfFile, setPdfFile]   = useState(null);
  const [pdfName, setPdfName]   = useState('');

  const [loading, setLoading]   = useState(false);
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState('');
  const [sendResult, setSendResult] = useState(null);

  const pollRef    = useRef(null);
  const fileRef    = useRef(null);
  const dropRef    = useRef(null);
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  // ── Poll session status every 4 s while active ─────────────────────────────
  const pollStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/targeted-scrape/status`, { headers: authHeader });
      setSession(res.data.session);
      setContacts(res.data.contacts || []);
      if (!res.data.session?.active) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setLoading(false);
      }
    } catch {}
  }, []); // eslint-disable-line

  useEffect(() => {
    pollStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []); // eslint-disable-line

  // ── Start scrape ────────────────────────────────────────────────────────────
  async function handleActivate() {
    if (!country && !industry && !keywords.trim()) {
      setError('Please fill in at least one field (country, industry, or keywords).');
      return;
    }
    setError('');
    setSendResult(null);
    setLoading(true);
    try {
      await axios.post(`${API}/api/targeted-scrape/start`,
        { country, industry, keywords, limit },
        { headers: authHeader }
      );
      setSelected(new Set());
      pollRef.current = setInterval(pollStatus, 4000);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setLoading(false);
    }
  }

  // ── Select / deselect contacts ──────────────────────────────────────────────
  function toggleContact(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === contacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contacts.map(c => c.id)));
    }
  }

  // ── PDF drag-and-drop / file picker ────────────────────────────────────────
  function handleFile(file) {
    if (!file) return;
    setPdfFile(file);
    setPdfName(file.name);
  }

  function onDrop(e) {
    e.preventDefault();
    dropRef.current?.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onDragOver(e) {
    e.preventDefault();
    dropRef.current?.classList.add('drag-over');
  }

  function onDragLeave() {
    dropRef.current?.classList.remove('drag-over');
  }

  // ── Send emails ─────────────────────────────────────────────────────────────
  async function handleSend() {
    if (!selected.size) { setError('Select at least one contact to send to.'); return; }
    if (!subject.trim() || !body.trim()) { setError('Subject and message body are required.'); return; }
    setError('');
    setSending(true);
    setSendResult(null);
    try {
      const form = new FormData();
      form.append('subject', subject);
      form.append('body', body);
      form.append('contactIds', JSON.stringify([...selected]));
      if (pdfFile) form.append('pdf', pdfFile);

      const res = await axios.post(`${API}/api/targeted-scrape/send`, form, {
        headers: { ...authHeader, 'Content-Type': 'multipart/form-data' },
      });
      setSendResult(res.data);
      // Refresh contact statuses
      pollStatus();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setSending(false);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const isRunning  = session?.active;
  const isDone     = session && !session.active && session.completedAt;
  const foundCount = session?.found || 0;
  const progress   = isDone ? 100 : isRunning ? Math.min(99, Math.round((foundCount / (session?.limit || 100)) * 100)) : 0;

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>

      <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700 }}>🎯 Targeted Scraper</h2>
      <p style={{ margin: '0 0 28px', color: '#64748b', fontSize: 14 }}>
        Define a target audience and launch a focused scrape. The system collects up to 100 new contacts,
        then returns to its normal cycle. Select results and send them a message with an optional attachment.
      </p>

      {/* ── Search Controls ───────────────────────────────────────────────── */}
      <div style={card}>
        <h3 style={sectionHead}>Search Parameters</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
          <label style={labelStyle}>
            Country / Region
            <select value={country} onChange={e => setCountry(e.target.value)} style={selectStyle} disabled={isRunning}>
              {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>

          <label style={labelStyle}>
            Industry
            <select value={industry} onChange={e => setIndustry(e.target.value)} style={selectStyle} disabled={isRunning}>
              {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </label>

          <label style={labelStyle}>
            Target Count
            <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={selectStyle} disabled={isRunning}>
              <option value={25}>25 contacts</option>
              <option value={50}>50 contacts</option>
              <option value={100}>100 contacts</option>
            </select>
          </label>
        </div>

        <label style={{ ...labelStyle, display: 'block', marginBottom: 16 }}>
          Keywords <span style={{ color: '#94a3b8', fontWeight: 400 }}>(e.g. "safety products", "special prices", "BBBEE")</span>
          <input
            type="text"
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            placeholder='e.g. safety equipment, affordable prices, BBBEE certified'
            style={inputStyle}
            disabled={isRunning}
            onKeyDown={e => { if (e.key === 'Enter') handleActivate(); }}
          />
        </label>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={handleActivate} disabled={isRunning || loading} style={btnPrimary}>
            {isRunning ? '⏳ Scraping in Progress…' : '🚀 Activate Targeted Scrape'}
          </button>
          {isRunning && (
            <span style={{ color: '#64748b', fontSize: 13 }}>
              Found {foundCount} / {session?.limit} new contacts — checking every 4 seconds…
            </span>
          )}
        </div>

        {/* Progress bar */}
        {(isRunning || isDone) && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
              <span>
                {isRunning
                  ? `Scraping: ${country || 'any region'} · ${industry || 'any industry'} · "${keywords || '…'}"`
                  : `✅ Done — ${foundCount} new contacts added`}
              </span>
              <span>{progress}%</span>
            </div>
            <div style={{ background: '#e2e8f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, background: isDone ? '#22c55e' : '#6366f1', height: '100%', transition: 'width 0.5s' }} />
            </div>
          </div>
        )}

        {error && <div style={{ marginTop: 12, color: '#ef4444', fontSize: 13, background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
      </div>

      {/* ── Results Table ─────────────────────────────────────────────────── */}
      {contacts.length > 0 && (
        <div style={{ ...card, marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={sectionHead}>
              Scraped Results
              <span style={{ marginLeft: 10, background: '#e0e7ff', color: '#4338ca', borderRadius: 12, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>
                {contacts.length}
              </span>
            </h3>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {selected.size} selected
              <button onClick={toggleAll} style={{ marginLeft: 10, ...btnSecondary }}>
                {selected.size === contacts.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={th}><input type="checkbox" checked={selected.size === contacts.length && contacts.length > 0} onChange={toggleAll} /></th>
                  <th style={th}>Company</th>
                  <th style={th}>Email</th>
                  <th style={th}>Domain</th>
                  <th style={th}>Industry</th>
                  <th style={th}>Country</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', background: selected.has(c.id) ? '#eef2ff' : 'transparent' }}>
                    <td style={td}><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleContact(c.id)} /></td>
                    <td style={{ ...td, fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company || c.domain}</td>
                    <td style={{ ...td, color: '#4f46e5' }}>{c.email}</td>
                    <td style={{ ...td, color: '#64748b' }}>{c.domain}</td>
                    <td style={td}>{c.business_type || '—'}</td>
                    <td style={td}>{c.country || '—'}</td>
                    <td style={td}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                        background: c.status === 'contacted' ? '#dcfce7' : '#f1f5f9',
                        color:      c.status === 'contacted' ? '#166534' : '#64748b',
                      }}>{c.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Send Panel ────────────────────────────────────────────────────── */}
      {contacts.length > 0 && (
        <div style={{ ...card, marginTop: 20 }}>
          <h3 style={sectionHead}>Send Message to Selected Contacts ({selected.size})</h3>

          <label style={{ ...labelStyle, display: 'block', marginBottom: 12 }}>
            Email Subject
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              style={inputStyle}
              placeholder="Email subject line"
            />
          </label>

          <label style={{ ...labelStyle, display: 'block', marginBottom: 12 }}>
            Message Body
            <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12 }}> (use {'{{company}}'} for personalisation)</span>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={10}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
              placeholder="Your email message..."
            />
          </label>

          {/* PDF Attachment */}
          <div style={{ marginBottom: 20 }}>
            <div style={labelStyle}>PDF Attachment <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional — drag & drop or click to browse)</span></div>
            <div
              ref={dropRef}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => fileRef.current?.click()}
              style={{
                border: '2px dashed #cbd5e1',
                borderRadius: 8,
                padding: '24px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: '#f8fafc',
                transition: 'border-color 0.2s, background 0.2s',
                marginTop: 6,
              }}
            >
              {pdfName
                ? <span style={{ color: '#4f46e5', fontWeight: 600 }}>📎 {pdfName} <button onClick={e => { e.stopPropagation(); setPdfFile(null); setPdfName(''); }} style={{ marginLeft: 10, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}>✕ Remove</button></span>
                : <span style={{ color: '#94a3b8', fontSize: 14 }}>Drag a PDF here, or click to choose a file</span>
              }
            </div>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
          </div>

          {sendResult && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#f0fdf4', color: '#166534', fontSize: 13, fontWeight: 600 }}>
              ✅ Sent to {sendResult.sent} contacts{sendResult.failed > 0 ? ` · ${sendResult.failed} failed` : ''}.
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={sending || !selected.size}
            style={{ ...btnPrimary, background: selected.size ? '#16a34a' : '#94a3b8', minWidth: 200 }}
          >
            {sending ? `⏳ Sending (${selected.size} emails)…` : `📧 Send to ${selected.size} Selected Contact${selected.size !== 1 ? 's' : ''}`}
          </button>

          {error && <div style={{ marginTop: 10, color: '#ef4444', fontSize: 13, background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const card = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '20px 24px',
  boxShadow: '0 1px 3px rgba(0,0,0,.06)',
};

const sectionHead = { margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#1e293b' };

const labelStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
};

const inputStyle = {
  marginTop: 4,
  padding: '9px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
};

const selectStyle = { ...inputStyle, cursor: 'pointer', background: '#fff' };

const btnPrimary = {
  padding: '10px 22px',
  background: '#4f46e5',
  color: '#fff',
  border: 'none',
  borderRadius: 7,
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
};

const btnSecondary = {
  padding: '5px 12px',
  background: '#f1f5f9',
  color: '#374151',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
  fontWeight: 600,
};

const th = {
  padding: '9px 12px',
  textAlign: 'left',
  fontWeight: 600,
  color: '#374151',
  fontSize: 12,
  borderBottom: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
};

const td = {
  padding: '8px 12px',
  color: '#374151',
  verticalAlign: 'middle',
};
