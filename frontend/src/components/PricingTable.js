import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

/* ── Base prices in USD (source of truth) ──────────────────────────────────── */
const BASE_USD = { starter: 130, growth: 480, enterprise: 1620 };

const CURRENCIES = [
  { code: 'USD', symbol: '$',    name: 'US Dollar',           flag: '🇺🇸', countries: ['US'] },
  { code: 'ZAR', symbol: 'R',   name: 'South African Rand',  flag: '🇿🇦', countries: ['ZA'] },
  { code: 'GBP', symbol: '£',   name: 'British Pound',       flag: '🇬🇧', countries: ['GB'] },
  { code: 'EUR', symbol: '€',   name: 'Euro',                flag: '🇪🇺', countries: ['DE','FR','NL','ES','IT','PT','BE','AT','IE'] },
  { code: 'AUD', symbol: 'A$',  name: 'Australian Dollar',   flag: '🇦🇺', countries: ['AU'] },
  { code: 'CAD', symbol: 'C$',  name: 'Canadian Dollar',     flag: '🇨🇦', countries: ['CA'] },
  { code: 'NGN', symbol: '₦',   name: 'Nigerian Naira',      flag: '🇳🇬', countries: ['NG'] },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling',     flag: '🇰🇪', countries: ['KE'] },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi',       flag: '🇬🇭', countries: ['GH'] },
  { code: 'SGD', symbol: 'S$',  name: 'Singapore Dollar',    flag: '🇸🇬', countries: ['SG'] },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham',          flag: '🇦🇪', countries: ['AE'] },
  { code: 'INR', symbol: '₹',   name: 'Indian Rupee',        flag: '🇮🇳', countries: ['IN'] },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar',  flag: '🇳🇿', countries: ['NZ'] },
];

// Fallback rates from USD if live API is unavailable
const FALLBACK_FROM_USD = {
  USD: 1, ZAR: 18.5, GBP: 0.79, EUR: 0.92, AUD: 1.52, CAD: 1.36,
  NGN: 1600, KES: 129, GHS: 15.4, SGD: 1.34, AED: 3.67, INR: 83.5, NZD: 1.66,
};

const TIERS = [
  {
    key: 'starter',
    name: 'Starter',
    usdPrice: BASE_USD.starter,
    color: '#3b82f6',
    badge: null,
    features: [
      'Up to 10 contracts / month',
      'AI lead sourcing & outreach',
      'Basic dashboard & reporting',
      'Email support (24hr response)',
      'Ozow + PayPal payment integration',
      'Audit trail logging',
    ],
  },
  {
    key: 'growth',
    name: 'Growth',
    usdPrice: BASE_USD.growth,
    color: '#22c55e',
    badge: 'Most Popular',
    features: [
      'Up to 50 contracts / month',
      'AI sourcing, negotiation & assignment',
      'Advanced analytics dashboard',
      'Priority support',
      'Ozow + PayPal payment integration',
      'Full audit trail & compliance reports',
      'Subcontractor management hub',
      'Failed contract auto-recovery',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    usdPrice: BASE_USD.enterprise,
    color: '#a855f7',
    badge: null,
    features: [
      'Unlimited contracts',
      'Full AI team — all modules active',
      'Custom dashboard & white-label reporting',
      'Dedicated account manager',
      'Multi-currency & multi-region support',
      'POPIA / GDPR / CCPA compliance pack',
      'REST API access & integrations',
      'SLA guarantee (99.5% uptime)',
      'Global market expansion module',
    ],
  },
];

// Projection rows in USD
const PROJECTIONS = [
  { tier: 'Starter',    clients: 10, usdMonth: 1300,  usdYear: 15600  },
  { tier: 'Growth',     clients: 5,  usdMonth: 2400,  usdYear: 28800  },
  { tier: 'Enterprise', clients: 2,  usdMonth: 3240,  usdYear: 38880  },
  { tier: 'Total',      clients: 17, usdMonth: 6940,  usdYear: 83280, total: true },
];

function fmt(amount, symbol) {
  let rounded;
  if (amount >= 100000)     rounded = Math.round(amount / 1000) * 1000;
  else if (amount >= 10000) rounded = Math.round(amount / 100) * 100;
  else if (amount >= 1000)  rounded = Math.round(amount / 10) * 10;
  else if (amount >= 100)   rounded = Math.round(amount);
  else                      rounded = parseFloat(amount.toFixed(2));
  return `${symbol}${rounded.toLocaleString()}`;
}

function detectCurrencyCode(countryCode) {
  if (!countryCode) return 'USD';
  for (const c of CURRENCIES) {
    if (c.countries.includes(countryCode.toUpperCase())) return c.code;
  }
  return 'USD';
}

export default function PricingTable() {
  const [rates, setRates]           = useState(FALLBACK_FROM_USD);
  const [currencyCode, setCurrency] = useState('USD');
  const [detecting, setDetecting]   = useState(true);
  const [ratesLabel, setRatesLabel] = useState('');

  const curr = CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0];

  // Convert a USD amount to the selected currency
  const convert = useCallback((usd) => {
    const rate = rates[currencyCode] ?? FALLBACK_FROM_USD[currencyCode] ?? 1;
    return usd * rate;
  }, [rates, currencyCode]);

  // Fetch live exchange rates FROM USD
  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(r => r.json())
      .then(data => {
        if (data?.rates) {
          setRates({ USD: 1, ...data.rates });
          const d = new Date(data.time_last_update_utc || Date.now());
          setRatesLabel(`Live rates — updated ${d.toLocaleDateString()}`);
        }
      })
      .catch(() => setRatesLabel('Approximate rates (offline)'));
  }, []);

  // Auto-detect visitor country via free IP geolocation
  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(data => { if (data?.country_code) setCurrency(detectCurrencyCode(data.country_code)); })
      .catch(() => {})
      .finally(() => setDetecting(false));
  }, []);

  const S = {
    page: {
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0a1530 0%, #0f172a 50%, #0c1f4a 100%)',
      fontFamily: "'Segoe UI', Arial, sans-serif",
      color: '#e2e8f0',
    },
    nav: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 40px',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
    },
    hero: { textAlign: 'center', padding: '64px 24px 40px' },
    badge: {
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)',
      borderRadius: 24, padding: '7px 20px', marginBottom: 20,
      color: '#a5b4fc', fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
    },
    h1: { fontSize: 'clamp(28px,4vw,52px)', fontWeight: 900, margin: '0 0 16px', color: '#fff', letterSpacing: -0.5 },
    sub: { fontSize: 17, color: '#94a3b8', maxWidth: 620, margin: '0 auto 40px', lineHeight: 1.85 },
    currencyRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 48, flexWrap: 'wrap' },
    select: {
      background: 'rgba(255,255,255,0.08)', color: '#f8fafc',
      border: '1px solid rgba(255,255,255,0.20)',
      borderRadius: 10, padding: '10px 16px', fontSize: 15, cursor: 'pointer', outline: 'none',
    },
    cards: {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: 24, maxWidth: 1100, margin: '0 auto', padding: '0 24px 60px',
    },
    card: (color, highlighted) => ({
      background: highlighted
        ? 'linear-gradient(160deg, rgba(34,197,94,0.12), rgba(16,185,129,0.06))'
        : 'rgba(255,255,255,0.04)',
      border: `1px solid ${highlighted ? color + '55' : 'rgba(255,255,255,0.10)'}`,
      borderTop: `4px solid ${color}`,
      borderRadius: 18, padding: '32px 28px',
      display: 'flex', flexDirection: 'column',
    }),
    cardName: (color) => ({ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.5, color, marginBottom: 4 }),
    price: { fontSize: 'clamp(32px,4vw,44px)', fontWeight: 900, color: '#fff', lineHeight: 1, margin: '8px 0 4px' },
    period: { fontSize: 14, color: '#64748b', marginBottom: 20 },
    usdNote: { fontSize: 12, color: '#475569', marginBottom: 16 },
    ul: { listStyle: 'none', margin: '0 0 28px', padding: 0, flex: 1 },
    li: {
      fontSize: 14, color: '#cbd5e1', padding: '8px 0',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.5,
    },
    check: (color) => ({ color, flexShrink: 0, marginTop: 1 }),
    section: { maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' },
    sectionTitle: { fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 8, textAlign: 'center' },
    sectionSub: { fontSize: 13, color: '#64748b', marginBottom: 24, textAlign: 'center' },
    table: { width: '100%', borderCollapse: 'collapse', background: 'rgba(255,255,255,0.03)', borderRadius: 14, overflow: 'hidden' },
    th: { background: 'rgba(99,102,241,0.20)', color: '#a5b4fc', padding: '14px 20px', textAlign: 'left', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 },
    td: (total) => ({
      padding: '14px 20px', fontSize: 14,
      color: total ? '#fff' : '#cbd5e1',
      fontWeight: total ? 800 : 500,
      borderTop: '1px solid rgba(255,255,255,0.06)',
      background: total ? 'rgba(99,102,241,0.12)' : 'transparent',
    }),
    footer: { textAlign: 'center', padding: '32px 24px', borderTop: '1px solid rgba(255,255,255,0.07)', color: '#475569', fontSize: 13 },
  };

  return (
    <div style={S.page}>

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <nav style={S.nav}>
        <Link to="/">
          <img src="/cts-bpo-logo-nobg.png" alt="CTS BPO" style={{ height: 36, width: 'auto' }} />
        </Link>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link to="/" style={{ color: '#94a3b8', fontSize: 14, textDecoration: 'none' }}>← Back to site</Link>
          <a href="mailto:cts.bposolutions@gmail.com" style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid #6366f1', color: '#a5b4fc', padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Get a Quote</a>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <div style={S.hero}>
        <div style={S.badge}>CTS BPO Solutions — Transparent Pricing</div>
        <h1 style={S.h1}>Simple, Scalable Plans</h1>
        <p style={S.sub}>
          All plans include our AI-powered lead engine, expert-managed delivery and automated quality scanning.
          No hidden fees. Month-to-month — cancel anytime.
        </p>

        {/* Currency selector */}
        <div style={S.currencyRow}>
          <span style={{ color: '#94a3b8', fontSize: 14 }}>
            {detecting ? '🌍 Detecting your location…' : '🌍 Prices in:'}
          </span>
          <select value={currencyCode} onChange={e => setCurrency(e.target.value)} style={S.select}>
            {CURRENCIES.map(c => (
              <option key={c.code} value={c.code} style={{ background: '#0f172a' }}>
                {c.flag} {c.code} — {c.name}
              </option>
            ))}
          </select>
          {ratesLabel && <span style={{ color: '#475569', fontSize: 12 }}>{ratesLabel}</span>}
        </div>
      </div>

      {/* ── PRICING CARDS ───────────────────────────────────────────────────── */}
      <div style={S.cards}>
        {TIERS.map(tier => (
          <div key={tier.key} style={S.card(tier.color, !!tier.badge)}>
            {tier.badge && (
              <div style={{ background: tier.color + '22', border: `1px solid ${tier.color}55`, color: tier.color, borderRadius: 20, padding: '4px 14px', fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', alignSelf: 'flex-start', marginBottom: 12 }}>
                {tier.badge}
              </div>
            )}
            <div style={S.cardName(tier.color)}>{tier.name}</div>
            <div style={S.price}>{fmt(convert(tier.usdPrice), curr.symbol)}</div>
            <div style={S.period}>/month</div>
            {currencyCode !== 'USD' && (
              <div style={S.usdNote}>≈ ${tier.usdPrice.toLocaleString()} USD</div>
            )}
            <ul style={S.ul}>
              {tier.features.map(f => (
                <li key={f} style={S.li}>
                  <span style={S.check(tier.color)}>✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="mailto:cts.bposolutions@gmail.com"
              style={{ background: `linear-gradient(135deg, ${tier.color}, ${tier.color}cc)`, color: '#fff', border: 'none', borderRadius: 10, padding: '14px 0', fontWeight: 800, fontSize: 16, cursor: 'pointer', width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none', boxShadow: `0 4px 20px ${tier.color}44` }}
            >
              Get Started
            </a>
          </div>
        ))}
      </div>

      {/* ── REVENUE PROJECTION ──────────────────────────────────────────────── */}
      <div style={S.section}>
        <h2 style={S.sectionTitle}>12-Month Revenue Projection</h2>
        <p style={S.sectionSub}>
          {curr.flag} {curr.name} ({currencyCode})
          {currencyCode !== 'USD' ? ' — converted from USD at live rates' : ''}
        </p>
        <table style={S.table}>
          <thead>
            <tr>
              {['Tier', 'Clients', 'Monthly Revenue', 'Annual Revenue'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PROJECTIONS.map(row => (
              <tr key={row.tier}>
                <td style={S.td(row.total)}>{row.tier}</td>
                <td style={S.td(row.total)}>{row.clients}</td>
                <td style={S.td(row.total)}>{fmt(convert(row.usdMonth), curr.symbol)}</td>
                <td style={S.td(row.total)}>{fmt(convert(row.usdYear), curr.symbol)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── FAQ ROW ─────────────────────────────────────────────────────────── */}
      <div style={{ ...S.section, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20, paddingBottom: 80 }}>
        {[
          { q: 'What payment methods do you accept?', a: 'EFT (SA bank transfer), Ozow instant EFT and PayPal. Invoices are issued on signup and monthly thereafter.' },
          { q: 'Is there a setup fee?', a: 'No setup fees, no lock-in. Pay month-to-month and cancel with 30 days notice.' },
          { q: 'Can I upgrade or downgrade?', a: 'Yes — plan changes take effect at the start of the next billing cycle. Prorated credits apply on upgrades.' },
          { q: 'Do you offer a trial?', a: 'New clients can submit a small sample project (10–20 pages or 10 min audio) at a reduced rate to verify quality before committing.' },
        ].map(({ q, a }) => (
          <div key={q} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '24px 22px' }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#e2e8f0', fontSize: 14 }}>{q}</p>
            <p style={{ margin: 0, color: '#64748b', fontSize: 13, lineHeight: 1.75 }}>{a}</p>
          </div>
        ))}
      </div>

      {/* ── CTA BANNER ──────────────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', margin: '0 24px 60px', borderRadius: 18, padding: '48px 32px', textAlign: 'center', maxWidth: 1052, marginLeft: 'auto', marginRight: 'auto' }}>
        <h2 style={{ margin: '0 0 12px', color: '#fff', fontSize: 26, fontWeight: 900 }}>Not sure which plan suits you?</h2>
        <p style={{ margin: '0 0 28px', color: '#94a3b8', fontSize: 15 }}>Email us and we'll recommend the right tier based on your expected monthly volume.</p>
        <a href="mailto:cts.bposolutions@gmail.com" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', padding: '16px 44px', borderRadius: 12, fontWeight: 800, fontSize: 16, textDecoration: 'none', boxShadow: '0 4px 28px rgba(99,102,241,0.40)' }}>
          Contact Us — Free Consultation
        </a>
      </div>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer style={S.footer}>
        <p style={{ margin: '0 0 6px' }}>© {new Date().getFullYear()} CTS BPO Solutions. All rights reserved.</p>
        <p style={{ margin: 0 }}>POPIA Compliant · GDPR Aligned · Registered in South Africa ·{' '}
          <Link to="/" style={{ color: '#6366f1', textDecoration: 'none' }}>Back to site</Link>
        </p>
      </footer>
    </div>
  );
}
