import React, { useState, useCallback } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || '';

const SERVICES = [
  {
    key: 'data-entry',
    label: 'Data Entry & Capture',
    units: [
      { key: 'pages',  label: 'Pages',        marketRate: 0.70,  desc: 'per page' },
      { key: 'hours',  label: 'Hours',         marketRate: 4.50,  desc: 'per hour' },
      { key: 'fields', label: 'Form Fields',   marketRate: 0.08,  desc: 'per field' },
    ],
  },
  {
    key: 'transcription',
    label: 'Transcription',
    units: [
      { key: 'minutes', label: 'Audio Minutes', marketRate: 1.50, desc: 'per audio minute' },
      { key: 'hours',   label: 'Audio Hours',   marketRate: 85,   desc: 'per audio hour' },
    ],
  },
  {
    key: 'translation',
    label: 'Translation',
    units: [
      { key: 'words', label: 'Words',      marketRate: 0.15, desc: 'per word' },
      { key: 'pages', label: 'Pages (~250 words)', marketRate: 37.50, desc: 'per page' },
    ],
  },
  {
    key: 'virtual-assistant',
    label: 'Virtual Assistant',
    units: [
      { key: 'hours',  label: 'Hours/Month',  marketRate: 12,   desc: 'per hour' },
      { key: 'days',   label: 'Days/Month',   marketRate: 96,   desc: 'per day (8h)' },
    ],
  },
  {
    key: 'customer-support',
    label: 'Customer Support',
    units: [
      { key: 'hours',  label: 'Hours/Month',  marketRate: 10,   desc: 'per hour' },
      { key: 'agents', label: 'Full-time Agents', marketRate: 1600, desc: 'per agent/month' },
    ],
  },
  {
    key: 'document-processing',
    label: 'Document Processing',
    units: [
      { key: 'pages',     label: 'Pages',       marketRate: 1.00,  desc: 'per page' },
      { key: 'documents', label: 'Documents',   marketRate: 8.50,  desc: 'per document' },
    ],
  },
  {
    key: 'content-moderation',
    label: 'Content Moderation',
    units: [
      { key: 'hours', label: 'Hours/Month', marketRate: 10,  desc: 'per hour' },
      { key: 'items', label: 'Items',       marketRate: 0.05, desc: 'per item reviewed' },
    ],
  },
  {
    key: 'finance-admin',
    label: 'Finance & Admin Support',
    units: [
      { key: 'hours',    label: 'Hours/Month',  marketRate: 14,    desc: 'per hour' },
      { key: 'invoices', label: 'Invoices',     marketRate: 3.50,  desc: 'per invoice' },
    ],
  },
  {
    key: 'reporting',
    label: 'Reporting & Analytics',
    units: [
      { key: 'hours',   label: 'Hours',          marketRate: 22,   desc: 'per hour' },
      { key: 'reports', label: 'Monthly Reports', marketRate: 350,  desc: 'per report' },
    ],
  },
  {
    key: 'social-media',
    label: 'Social Media Management',
    units: [
      { key: 'months',   label: 'Monthly Retainer', marketRate: 1000, desc: 'per month' },
      { key: 'platforms', label: 'Platforms/Month',  marketRate: 350,  desc: 'per platform' },
    ],
  },
];

const DISCOUNT_TIERS = [
  { label: 'Standard  (–15%)',  pct: 0.15, color: '#3b82f6', tag: 'competitive' },
  { label: 'Aggressive (–20%)', pct: 0.20, color: '#22c55e', tag: 'volume-deal' },
  { label: 'High-Volume (–25%)',pct: 0.25, color: '#f59e0b', tag: 'bulk-special' },
];

const ZAR_RATE = 18.5; // approximate USD→ZAR

function fmt(n, currency = 'USD') {
  if (currency === 'ZAR') return `R${(n * ZAR_RATE).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtN(n) { return n.toLocaleString('en-US', { maximumFractionDigits: 2 }); }

function buildEmail(name, svc, vol, unitDesc, rate, total, saving, savingPct, extra, currency) {
  const rateStr  = fmt(rate, currency);
  const totalStr = fmt(total, currency);
  const saveStr  = fmt(saving, currency);
  return `Subject: Competitive Pricing Proposal — ${svc} Services | CTS BPO Solutions

Dear ${name} Team,

Thank you for your interest in CTS BPO Solutions. I'm pleased to present our competitive pricing proposal for your ${svc} requirements.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECT PRICING SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Service:       ${svc}
Volume:        ${fmtN(vol)} ${unitDesc}
Our Rate:      ${rateStr} ${unitDesc}
Total Cost:    ${totalStr}
Your Saving:   ${saveStr} (${savingPct.toFixed(0)}% below market average)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

We consistently price ${savingPct.toFixed(0)}% below the industry average because our South African-based team operates at lower overheads — savings we pass directly to you.

What's included:
✓ Dedicated quality review on every deliverable
✓ Turnaround commitment agreed upfront
✓ POPIA and GDPR-compliant data handling
✓ Free revision within 48 hours of delivery
✓ Monthly progress reporting at no extra charge
${extra ? `\nAdditional notes: ${extra}\n` : ''}
To get started, simply reply to this email or send us your source files. We issue an invoice only once you are satisfied with the delivered work.

Kind regards,
Calvin Thomas
CTS BPO Solutions
cts.bposolutions@gmail.com`;
}

export default function PriceNegotiator({ token }) {
  const [serviceKey,  setServiceKey]  = useState('data-entry');
  const [unitKey,     setUnitKey]     = useState('pages');
  const [volume,      setVolume]      = useState(100);
  const [discountIdx, setDiscountIdx] = useState(0);
  const [currency,    setCurrency]    = useState('USD');
  const [clientName,  setClientName]  = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [notes,       setNotes]       = useState('');
  const [quote,       setQuote]       = useState(null);
  const [emailBody,   setEmailBody]   = useState('');
  const [copied,      setCopied]      = useState(false);
  const [sending,     setSending]     = useState(false);
  const [sendResult,  setSendResult]  = useState('');

  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  const service = SERVICES.find(s => s.key === serviceKey) || SERVICES[0];
  const unit    = service.units.find(u => u.key === unitKey) || service.units[0];
  const discount = DISCOUNT_TIERS[discountIdx];

  const compute = useCallback(() => {
    const marketTotal = unit.marketRate * volume;
    const ourRate     = unit.marketRate * (1 - discount.pct);
    const ourTotal    = ourRate * volume;
    const saving      = marketTotal - ourTotal;
    const savingPct   = discount.pct * 100;
    // CTS margin: sub-contractors paid ~40% of our price; we keep 60%
    const subCost     = ourTotal * 0.40;
    const margin      = ourTotal - subCost;
    const marginPct   = 60;

    const q = { marketRate: unit.marketRate, ourRate, marketTotal, ourTotal, saving, savingPct, subCost, margin, marginPct, volume, unitDesc: unit.desc };
    setQuote(q);

    const email = buildEmail(clientName || '{{Client}}', service.label, volume, unit.desc, ourRate, ourTotal, saving, savingPct, notes, currency);
    setEmailBody(email);
  }, [service, unit, volume, discount, clientName, notes, currency]);

  function handleCopy() {
    navigator.clipboard.writeText(emailBody).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleSendEmail() {
    if (!clientEmail) { setSendResult('⚠️ Enter a client email address first.'); return; }
    setSending(true);
    setSendResult('');
    try {
      await axios.post(`${API}/api/price-negotiator/send`, {
        to: clientEmail,
        name: clientName || 'Client',
        subject: `Competitive Pricing Proposal — ${service.label} | CTS BPO Solutions`,
        body: emailBody,
      }, { headers: authHeader });
      setSendResult(`✅ Proposal sent to ${clientEmail}`);
    } catch (err) {
      setSendResult(`❌ Send failed: ${err.response?.data?.error || err.message}`);
    }
    setSending(false);
  }

  // Card / layout styles
  const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px 28px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
  const label = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151' };
  const select = { padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, background: '#f9fafb', color: '#111827', outline: 'none', cursor: 'pointer' };
  const input  = { padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, background: '#f9fafb', color: '#111827', outline: 'none' };
  const btn    = (bg, fg = '#fff') => ({ background: bg, color: fg, border: 'none', borderRadius: 9, padding: '11px 22px', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 });

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1100, margin: '0 auto' }}>

      <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>💰 AI Price Negotiator</h2>
      <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14 }}>
        Price 15–25% below market average to win more volume. The system calculates your competitive rate, client savings and your profit margin — then drafts the proposal email instantly.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* ── LEFT: INPUTS ────────────────────────────────────────────────── */}
        <div>
          <div style={card}>
            <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Service & Volume</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <label style={label}>
                Service Type
                <select value={serviceKey} onChange={e => { setServiceKey(e.target.value); setUnitKey(SERVICES.find(s=>s.key===e.target.value)?.units[0].key||''); setQuote(null); }} style={select}>
                  {SERVICES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <label style={label}>
                Unit of Measure
                <select value={unitKey} onChange={e => { setUnitKey(e.target.value); setQuote(null); }} style={select}>
                  {service.units.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <label style={label}>
                Volume ({unit.label})
                <input type="number" value={volume} min={1} onChange={e => { setVolume(Number(e.target.value)||1); setQuote(null); }} style={input} />
              </label>
              <label style={label}>
                Display Currency
                <select value={currency} onChange={e => setCurrency(e.target.value)} style={select}>
                  <option value="USD">🇺🇸 USD — US Dollar</option>
                  <option value="ZAR">🇿🇦 ZAR — South African Rand</option>
                </select>
              </label>
            </div>

            <h3 style={{ margin: '16px 0 12px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Discount Strategy</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              {DISCOUNT_TIERS.map((t, i) => (
                <button key={i} onClick={() => { setDiscountIdx(i); setQuote(null); }}
                  style={{ ...btn(i === discountIdx ? t.color : '#f1f5f9', i === discountIdx ? '#fff' : '#475569'), padding: '8px 16px', fontSize: 13, border: i === discountIdx ? 'none' : '1px solid #e2e8f0', borderRadius: 8, boxShadow: i === discountIdx ? `0 2px 8px ${t.color}55` : 'none' }}>
                  {t.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0 0' }}>
              Market average for {service.label}: <strong>{fmt(unit.marketRate, currency)}</strong> {unit.desc}
            </p>
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Client Details <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 13 }}>(optional)</span></h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <label style={label}>
                Client / Company Name
                <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Acme Corp" style={input} />
              </label>
              <label style={label}>
                Client Email
                <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@example.com" style={input} />
              </label>
            </div>
            <label style={{ ...label, marginBottom: 0 }}>
              Special Notes / Scope Details
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Rush delivery required, handwritten forms, specific format..." rows={3}
                style={{ ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
            </label>
          </div>

          <button onClick={compute}
            style={{ ...btn('linear-gradient(135deg,#6366f1,#4f46e5)'), width: '100%', justifyContent: 'center', padding: '14px', fontSize: 15, boxShadow: '0 3px 14px rgba(99,102,241,0.45)', borderRadius: 10 }}>
            ✨ Generate Competitive Quote
          </button>
        </div>

        {/* ── RIGHT: RESULTS ──────────────────────────────────────────────── */}
        <div>
          {!quote ? (
            <div style={{ ...card, minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8', gap: 12 }}>
              <span style={{ fontSize: 48 }}>💰</span>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Fill in the details and click Generate</p>
              <p style={{ margin: 0, fontSize: 13 }}>Your competitive quote and proposal email will appear here</p>
            </div>
          ) : (
            <>
              {/* Price breakdown */}
              <div style={{ ...card, borderTop: `4px solid ${discount.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{service.label}</h3>
                    <span style={{ background: discount.color + '22', color: discount.color, borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700 }}>
                      {discount.tag} — {quote.savingPct.toFixed(0)}% below market
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 30, fontWeight: 900, color: '#0f172a' }}>{fmt(quote.ourTotal, currency)}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>your quote total</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Market Average', value: fmt(quote.marketTotal, currency), sub: `${fmt(quote.marketRate, currency)} ${unit.desc}`, color: '#ef4444' },
                    { label: 'CTS Price', value: fmt(quote.ourTotal, currency), sub: `${fmt(quote.ourRate, currency)} ${unit.desc}`, color: discount.color },
                    { label: 'Client Saves', value: fmt(quote.saving, currency), sub: `${quote.savingPct.toFixed(0)}% cheaper`, color: '#22c55e' },
                  ].map(({ label: l, value, sub, color }) => (
                    <div key={l} style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', borderLeft: `3px solid ${color}` }}>
                      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{l}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{sub}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { label: 'Sub-contractor Cost (40%)', value: fmt(quote.subCost, currency), color: '#f59e0b' },
                    { label: 'CTS Net Margin (60%)', value: fmt(quote.margin, currency), color: '#6366f1' },
                  ].map(({ label: l, value, color }) => (
                    <div key={l} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px', borderLeft: `3px solid ${color}` }}>
                      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{l}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 14, background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>📈</span>
                  <span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>
                    At this rate, 10 similar clients/month = <strong>{fmt(quote.margin * 10, currency)}</strong> net profit
                  </span>
                </div>
              </div>

              {/* Email draft */}
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>📧 Ready-to-Send Proposal Email</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleCopy} style={{ ...btn(copied ? '#22c55e' : '#f1f5f9', copied ? '#fff' : '#374151'), padding: '7px 14px', fontSize: 12, border: '1px solid #e2e8f0' }}>
                      {copied ? '✅ Copied!' : '📋 Copy'}
                    </button>
                    <button onClick={handleSendEmail} disabled={sending || !clientEmail}
                      style={{ ...btn(sending ? '#94a3b8' : 'linear-gradient(135deg,#6366f1,#4f46e5)'), padding: '7px 14px', fontSize: 12, opacity: !clientEmail ? 0.5 : 1 }}>
                      {sending ? 'Sending…' : '✉️ Send Now'}
                    </button>
                  </div>
                </div>
                {sendResult && (
                  <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 7, background: sendResult.startsWith('✅') ? '#f0fdf4' : '#fef2f2', color: sendResult.startsWith('✅') ? '#166534' : '#b91c1c', fontSize: 13, fontWeight: 600 }}>
                    {sendResult}
                  </div>
                )}
                <textarea
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  rows={18}
                  style={{ ...input, width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.65, resize: 'vertical' }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
