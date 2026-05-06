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
  const [searched, setSearched] = useState(false);

  const [emailStats, setEmailStats] = useState(null);

  const [subject, setSubject] = useState('Partnering with CTS BPO — Outsourcing Solutions for {{company}}');
  const [body, setBody]       = useState(
    `Dear {{company}} Team,\n\nI hope this message finds you well.\n\nMy name is Calvin Thomas, and I represent CTS BPO — a specialised business process outsourcing firm based in South Africa. We help companies like yours reduce operational costs and improve efficiency by handling data entry, document processing, transcription, virtual assistance, and back-office functions.\n\nWould you be open to a brief conversation about how we could support your team?\n\nKind regards,\nCalvin Thomas\nCTS BPO Solutions\ncts.cybersolutions@gmail.com`
  );
  const [pdfFile, setPdfFile]         = useState(null);
  const [pdfName, setPdfName]         = useState('');
  const [useIntroLetter, setUseIntroLetter] = useState(true);

  const [loading, setLoading]         = useState(false);
  const [aiLoading, setAiLoading]     = useState(false);
  const [scanning, setScanning]       = useState(false);
  const [scanStatus, setScanStatus]   = useState('');
  const [sending, setSending]         = useState(false);
  const [error, setError]             = useState('');
  const [sendResult, setSendResult]   = useState(null);
  const [aiStatus, setAiStatus]       = useState('');

  const pollRef   = useRef(null);
  const fileRef   = useRef(null);
  const dropRef   = useRef(null);
  const sendRef   = useRef(null);

  const kwRef      = useRef(keywords);
  const countryRef = useRef(country);
  const industryRef= useRef(industry);
  useEffect(() => { kwRef.current = keywords; }, [keywords]);
  useEffect(() => { countryRef.current = country; }, [country]);
  useEffect(() => { industryRef.current = industry; }, [industry]);

  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  const loadEmailStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/email-stats`, { headers: authHeader });
      setEmailStats(res.data);
    } catch {}
  }, []); // eslint-disable-line

  useEffect(() => {
    loadEmailStats();
    const t = setInterval(loadEmailStats, 15000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line

  const pollStatus = useCallback(async () => {
    const kw  = kwRef.current;
    const co  = countryRef.current;
    const in_ = industryRef.current;
    const params = new URLSearchParams();
    if (kw)  params.set('keywords', kw);
    if (co)  params.set('country', co);
    if (in_) params.set('industry', in_);
    try {
      const res = await axios.get(`${API}/api/targeted-scrape/status?${params.toString()}`, { headers: authHeader });
      setSession(res.data.session);
      setContacts(res.data.contacts || []);
      if (!res.data.session?.active) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setLoading(false);
      }
      return res.data.contacts || [];
    } catch { return []; }
  }, []); // eslint-disable-line

  // ── Single unified pipeline: Scrape → AI Compose → Ready to Send ─────────
  async function handleScrapeAndCompose() {
    if (!country && !industry && !keywords.trim()) {
      setError('Please fill in at least one field.'); return;
    }
    setError('');
    setSendResult(null);
    setAiLoading(true);
    setSearched(true);
    setSelected(new Set());

    // Step 1 — kick off a fresh scrape
    setAiStatus('🔍 Starting targeted scrape for new contacts…');
    setLoading(true);
    try {
      await axios.post(`${API}/api/targeted-scrape/start`,
        { country, industry, keywords, limit },
        { headers: authHeader }
      );
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      if (!msg.includes('already running')) {
        setError(msg);
        setLoading(false);
        setAiLoading(false);
        setAiStatus('');
        return;
      }
      // already running — just poll
    }

    // Step 2 — poll until scrape finishes, updating status as contacts arrive
    setAiStatus('⏳ Scraping in progress — discovering contacts…');
    await new Promise(resolve => {
      const interval = setInterval(async () => {
        const data = await pollStatus();
        const kw  = kwRef.current;
        const co  = countryRef.current;
        const in_ = industryRef.current;
        const params = new URLSearchParams();
        if (kw)  params.set('keywords', kw);
        if (co)  params.set('country', co);
        if (in_) params.set('industry', in_);
        try {
          const res = await axios.get(`${API}/api/targeted-scrape/status?${params.toString()}`, { headers: authHeader });
          if (!res.data.session?.active) {
            clearInterval(interval);
            setLoading(false);
            resolve(data);
          } else {
            const n = res.data.session?.found || 0;
            setAiStatus(`⏳ Scraping in progress — ${n} contacts found so far…`);
          }
        } catch {
          clearInterval(interval);
          setLoading(false);
          resolve(data);
        }
      }, 4000);
    });

    // Step 3 — search the database now (scrape just finished)
    setAiStatus('📋 Loading discovered contacts…');
    const found = await pollStatus();

    if (!found.length) {
      setAiLoading(false);
      setAiStatus('');
      setError('No contacts found. Try different keywords, country or industry.');
      return;
    }

    // Step 4 — auto-select all eligible contacts
    const eligible = found.filter(c => c.email && c.status !== 'bounced');
    setSelected(new Set(eligible.map(c => c.id)));

    // Step 5 — AI writes the email
    setAiStatus(`🤖 AI is writing a personalised email for ${eligible.length} contacts…`);
    try {
      const res = await axios.post(`${API}/api/ai/compose-email`,
        { industry, country, contactCount: eligible.length },
        { headers: authHeader }
      );
      setSubject(res.data.subject || subject);
      setBody(res.data.body || body);
      setAiStatus(`✅ Ready — ${eligible.length} contacts selected, email drafted. Review and click Send All.`);
    } catch {
      setAiStatus(`✅ Ready — ${eligible.length} contacts selected. Review the email below and click Send All.`);
    }

    setAiLoading(false);

    // Step 6 — scroll to send panel
    setTimeout(() => sendRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function toggleContact(id) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleAll() {
    const eligible = contacts.filter(c => c.email && c.status !== 'bounced').map(c => c.id);
    setSelected(selected.size === eligible.length ? new Set() : new Set(eligible));
  }

  function handleFile(file) { if (!file) return; setPdfFile(file); setPdfName(file.name); }
  function onDrop(e) { e.preventDefault(); dropRef.current?.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); }
  function onDragOver(e) { e.preventDefault(); dropRef.current?.classList.add('drag-over'); }
  function onDragLeave() { dropRef.current?.classList.remove('drag-over'); }

  async function handleSend() {
    if (!selected.size) { setError('Select at least one contact.'); return; }
    if (!subject.trim() || !body.trim()) { setError('Subject and body are required.'); return; }
    setError('');
    setSending(true);
    setSendResult(null);
    try {
      const form = new FormData();
      form.append('subject', subject);
      form.append('body', body);
      form.append('contactIds', JSON.stringify([...selected]));
      form.append('useIntroLetter', useIntroLetter ? 'true' : 'false');
      if (pdfFile) form.append('pdf', pdfFile);
      const res = await axios.post(`${API}/api/targeted-scrape/send`, form, {
        headers: { ...authHeader, 'Content-Type': 'multipart/form-data' },
      });
      setSendResult(res.data);
      setAiStatus('');
      pollStatus();
      loadEmailStats();
    } catch (err) { setError(err.response?.data?.error || err.message); }
    setSending(false);
  }

  // ── BPO Scan — AI classifies which contacts likely need BPO ───────────────
  async function handleBpoScan() {
    if (!contacts.length) return;
    setScanning(true);
    setScanStatus('🤖 AI is analysing contacts for BPO likelihood…');
    const allIds = contacts.map(c => c.id);
    try {
      const res = await axios.post(`${API}/api/targeted-scrape/bpo-scan`,
        { contactIds: allIds },
        { headers: authHeader }
      );
      setScanStatus(`✅ Scan complete — ${res.data.classified} contacts analysed`);
      const fresh = await pollStatus(); // refresh to get updated bpo_likely flags
      // Auto-tick all contacts the AI flagged as BPO likely
      const bpoIds = fresh.filter(c => c.bpo_likely && c.email && c.status !== 'bounced').map(c => c.id);
      if (bpoIds.length) setSelected(new Set(bpoIds));
      setScanStatus(`✅ Scan complete — ${bpoIds.length} BPO-likely contacts selected and ready to send`);
    } catch (err) {
      setScanStatus(`⚠️ Scan failed: ${err.response?.data?.error || err.message}`);
    }
    setScanning(false);
    setTimeout(() => setScanStatus(''), 6000);
  }

  const isRunning  = session?.active;
  const isDone     = session && !session.active && session.completedAt;
  const foundCount = session?.found || 0;
  const progress   = isDone ? 100 : isRunning ? Math.min(99, Math.round((foundCount / (session?.limit || 100)) * 100)) : 0;

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1140, margin: '0 auto' }}>

      <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>🎯 Targeted Scraper</h2>
      <p style={{ margin: '0 0 22px', color: '#64748b', fontSize: 14 }}>
        Define a target audience and launch a focused scrape, or search the existing database instantly.
      </p>

      {/* ── Search Controls ─────────────────────────────────────────────── */}
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
            Target Count (new scrape)
            <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={selectStyle} disabled={isRunning}>
              <option value={25}>25 contacts</option>
              <option value={50}>50 contacts</option>
              <option value={100}>100 contacts</option>
            </select>
          </label>
        </div>

        <label style={{ ...labelStyle, display: 'block', marginBottom: 16 }}>
          Keywords <span style={{ color: '#94a3b8', fontWeight: 400 }}>(e.g. "specials", "safety products", "BBBEE")</span>
          <input
            type="text"
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            placeholder='Type any word — e.g. specials, discount, healthcare, schools'
            style={inputStyle}
            disabled={isRunning}
            onKeyDown={e => { if (e.key === 'Enter') handleScrapeAndCompose(); }}
          />
        </label>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleScrapeAndCompose}
            disabled={aiLoading || loading}
            style={{
              ...btnPrimary,
              padding: '11px 24px',
              fontSize: 15,
              background: aiLoading
                ? '#7c3aed'
                : 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 60%, #0ea5e9 100%)',
              boxShadow: aiLoading ? 'none' : '0 3px 12px rgba(99,102,241,0.4)',
              display: 'flex', alignItems: 'center', gap: 8,
              letterSpacing: '0.01em',
            }}
          >
            {aiLoading
              ? <><span style={spinner} />Working…</>
              : <>🤖 Scrape, Compose &amp; Send</>}
          </button>
        </div>

        {/* AI status message */}
        {aiStatus && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8,
            background: aiStatus.startsWith('✅') ? '#f0fdf4' : '#f5f3ff',
            color:      aiStatus.startsWith('✅') ? '#166534' : '#5b21b6',
            fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {!aiStatus.startsWith('✅') && <span style={spinner} />}
            {aiStatus}
          </div>
        )}

        {/* Progress bar */}
        {(isRunning || isDone) && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
              <span>
                {isRunning
                  ? `Scraping: ${country || 'any region'} · ${industry || 'any industry'} · "${keywords || '…'}"`
                  : `✅ Done — ${foundCount} new contacts added to database`}
              </span>
              <span>{progress}%</span>
            </div>
            <div style={{ background: '#e2e8f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, background: isDone ? '#22c55e' : '#6366f1', height: '100%', transition: 'width 0.5s' }} />
            </div>
          </div>
        )}

        {searched && !isRunning && !loading && !aiLoading && contacts.length === 0 && (
          <div style={{ marginTop: 12, color: '#64748b', fontSize: 13, background: '#f8fafc', padding: '10px 14px', borderRadius: 6 }}>
            No contacts found matching these criteria. Try "Scrape + Search" to discover new ones, or broaden your keywords.
          </div>
        )}

        {error && <div style={{ marginTop: 12, color: '#ef4444', fontSize: 13, background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
      </div>

      {/* ── Results Table ─────────────────────────────────────────────────── */}
      {contacts.length > 0 && (
        <div style={{ ...card, marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ ...sectionHead, margin: 0 }}>
              Results
              <span style={{ marginLeft: 10, background: '#e0e7ff', color: '#4338ca', borderRadius: 12, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>
                {contacts.length}
              </span>
              {contacts.some(c => c.bpo_likely) && (
                <span style={{ marginLeft: 8, background: '#dcfce7', color: '#166534', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                  🟢 {contacts.filter(c => c.bpo_likely).length} BPO likely
                </span>
              )}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={handleBpoScan}
                disabled={scanning || aiLoading || !contacts.length}
                style={{
                  ...btnSecondary,
                  background: scanning ? '#f5f3ff' : 'linear-gradient(135deg,#f5f3ff,#ede9fe)',
                  color: '#6d28d9', border: '1px solid #c4b5fd',
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontWeight: 600,
                }}
                title="AI analyses each contact and marks with a green dot if they likely need BPO services"
              >
                {scanning ? <><span style={spinner} />Scanning…</> : <>🤖 Scan for BPO</>}
              </button>
              <span style={{ fontSize: 13, color: '#64748b' }}>{selected.size} selected</span>
              <button onClick={toggleAll} style={btnSecondary}>
                {selected.size === contacts.filter(c => c.email && c.status !== 'bounced').length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>

          {scanStatus && (
            <div style={{
              marginBottom: 10, padding: '8px 12px', borderRadius: 7, fontSize: 13, fontWeight: 600,
              background: scanStatus.startsWith('✅') ? '#f0fdf4' : scanStatus.startsWith('⚠') ? '#fef9c3' : '#f5f3ff',
              color:      scanStatus.startsWith('✅') ? '#166534' : scanStatus.startsWith('⚠') ? '#854d0e' : '#5b21b6',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              {scanning && <span style={spinner} />}
              {scanStatus}
            </div>
          )}

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
                {contacts.map(c => {
                  const hasEmail  = !!(c.email && c.email.trim());
                  const isBounced = c.status === 'bounced';
                  const canSelect = hasEmail && !isBounced;
                  return (
                    <tr key={c.id} style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: isBounced ? '#fff5f5' : !hasEmail ? '#fafafa' : selected.has(c.id) ? '#eef2ff' : 'transparent',
                      opacity: canSelect ? 1 : 0.45,
                    }}>
                      <td style={td}>
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => canSelect && toggleContact(c.id)}
                          disabled={!canSelect}
                          title={isBounced ? 'Email bounced — permanently excluded' : !hasEmail ? 'No email address — cannot send' : undefined}
                        />
                      </td>
                      <td style={{ ...td, fontWeight: 500, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          {c.bpo_likely === true && (
                            <span
                              title="AI: likely needs BPO services"
                              style={{ width: 9, height: 9, borderRadius: '50%', background: '#22c55e', flexShrink: 0, boxShadow: '0 0 0 2px #bbf7d0', display: 'inline-block' }}
                            />
                          )}
                          {c.bpo_likely === false && (
                            <span
                              title="AI: unlikely to need BPO services"
                              style={{ width: 9, height: 9, borderRadius: '50%', background: '#cbd5e1', flexShrink: 0, display: 'inline-block' }}
                            />
                          )}
                          {c.bpo_likely === null || c.bpo_likely === undefined ? (
                            <span style={{ width: 9, height: 9, flexShrink: 0, display: 'inline-block' }} />
                          ) : null}
                          {c.company || c.domain}
                        </span>
                      </td>
                      <td style={{ ...td, color: isBounced ? '#ef4444' : hasEmail ? '#4f46e5' : '#94a3b8', fontStyle: hasEmail ? 'normal' : 'italic' }}>
                        {hasEmail ? c.email : 'no email'}
                      </td>
                      <td style={{ ...td, color: '#64748b' }}>{c.domain}</td>
                      <td style={td}>{c.business_type || '—'}</td>
                      <td style={td}>{c.country || '—'}</td>
                      <td style={td}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: isBounced                   ? '#fee2e2' :
                                      c.status === 'contacted'   ? '#dcfce7' :
                                      c.status === 'followup1'   ? '#fef9c3' :
                                      c.status === 'followup2'   ? '#ffedd5' : '#f1f5f9',
                          color:      isBounced                   ? '#b91c1c' :
                                      c.status === 'contacted'   ? '#166534' :
                                      c.status === 'followup1'   ? '#854d0e' :
                                      c.status === 'followup2'   ? '#9a3412' : '#64748b',
                        }}>{isBounced ? '⛔ bounced' : c.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Send Panel ──────────────────────────────────────────────────── */}
      {contacts.length > 0 && (
        <div ref={sendRef} style={{ ...card, marginTop: 18 }}>
          <h3 style={sectionHead}>
            Send Message to Selected Contacts
            <span style={{ marginLeft: 8, background: '#dcfce7', color: '#166534', borderRadius: 12, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>
              {selected.size}
            </span>
          </h3>

          <label style={{ ...labelStyle, display: 'block', marginBottom: 12 }}>
            Email Subject
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
          </label>

          <label style={{ ...labelStyle, display: 'block', marginBottom: 12 }}>
            Message Body
            <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12 }}> — use {'{{company}}'} for personalisation</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={9}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }} />
          </label>

          {/* ── CTS BPO Intro Letter Toggle ───────────────────────────── */}
          <div style={{
            marginBottom: 16, padding: '14px 18px', borderRadius: 10,
            background: useIntroLetter ? 'linear-gradient(135deg,#eef2ff 0%,#f0fdf4 100%)' : '#f8fafc',
            border: `2px solid ${useIntroLetter ? '#6366f1' : '#e2e8f0'}`,
            transition: 'all 0.2s',
          }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={useIntroLetter}
                onChange={e => setUseIntroLetter(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: '#6366f1', cursor: 'pointer', flexShrink: 0 }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  📄 Auto-attach CTS BPO Introduction Letter
                  {useIntroLetter && (
                    <span style={{ background: '#6366f1', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                      ON
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, lineHeight: 1.5 }}>
                  A branded A4 PDF letter will be automatically generated and attached to every email.
                  It introduces CTS BPO, lists all services, and shows the full pricing table (Starter R5,000 · Professional R15,000 · Enterprise R30,000).
                  Each letter is personalised with the recipient's company name.
                </div>
                {useIntroLetter && (
                  <a
                    href={`${API}/api/brochure/intro-letter.pdf`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}
                    onClick={e => e.stopPropagation()}
                  >
                    👁 Preview the letter ↗
                  </a>
                )}
              </div>
            </label>
          </div>

          {/* PDF drop zone — optional additional attachment */}
          <div style={{ marginBottom: 18 }}>
            <div style={labelStyle}>
              Additional PDF Attachment
              <span style={{ color: '#94a3b8', fontWeight: 400 }}> (optional — drag & drop or click)</span>
            </div>
            <div ref={dropRef} onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
              onClick={() => fileRef.current?.click()}
              style={{ border: '2px dashed #cbd5e1', borderRadius: 8, padding: '16px', textAlign: 'center',
                cursor: 'pointer', background: '#f8fafc', marginTop: 6 }}>
              {pdfName
                ? <span style={{ color: '#4f46e5', fontWeight: 600 }}>📎 {pdfName}
                    <button onClick={e => { e.stopPropagation(); setPdfFile(null); setPdfName(''); }}
                      style={{ marginLeft: 10, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>✕</button>
                  </span>
                : <span style={{ color: '#94a3b8', fontSize: 13 }}>Drag a second PDF here, or click to browse</span>}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])} />
          </div>

          {sendResult && (
            <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#f0fdf4', color: '#166534', fontSize: 13, fontWeight: 600 }}>
              ✅ Sent to {sendResult.sent} contacts
              {sendResult.failed > 0 ? ` · ${sendResult.failed} transient failures` : ''}
              {sendResult.bounced > 0 ? ` · ${sendResult.bounced} bounced & removed` : ''}
              {sendResult.skippedNoEmail > 0 ? ` · ${sendResult.skippedNoEmail} skipped (no email)` : ''}.
            </div>
          )}

          {emailStats?.providers?.filter(p => p.active && p.stopAt && p.sentToday >= p.stopAt * 0.9).map(p => (
            <div key={p.name} style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 13 }}>
              ⚠️ {p.name} is near its daily limit ({p.sentToday}/{p.dailyCap}). The system will stop at {p.stopAt} (99%) and resume tomorrow.
            </div>
          ))}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={handleSend} disabled={sending || !selected.size}
              style={{ ...btnPrimary, background: selected.size ? '#16a34a' : '#94a3b8', minWidth: 220 }}>
              {sending ? `⏳ Sending (${selected.size} emails)…` : `📧 Send to ${selected.size} Selected Contact${selected.size !== 1 ? 's' : ''}`}
            </button>
            {selected.size > 0 && !sending && (
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Emails will be personalised with each company name automatically.
              </span>
            )}
          </div>

          {error && <div style={{ marginTop: 10, color: '#ef4444', fontSize: 13, background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const card        = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' };
const sectionHead = { margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#1e293b' };
const labelStyle  = { fontSize: 13, fontWeight: 600, color: '#374151', display: 'flex', flexDirection: 'column', gap: 5 };
const inputStyle  = { marginTop: 4, padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: '100%', boxSizing: 'border-box' };
const selectStyle = { ...inputStyle, cursor: 'pointer', background: '#fff' };
const btnPrimary  = { padding: '10px 22px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const btnSecondary= { padding: '5px 12px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 };
const th          = { padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
const td          = { padding: '8px 12px', color: '#374151', verticalAlign: 'middle' };
const spinner     = { display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' };
