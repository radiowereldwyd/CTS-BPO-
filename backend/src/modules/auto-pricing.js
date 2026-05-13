/**
 * CTS BPO — Autonomous AI Price Negotiator
 * Detects the prospect's business type, selects the most relevant BPO service,
 * calculates a competitive rate 15% below market average, and builds a
 * personalised pricing proposal email — sent automatically by the AI agent.
 */

// ── Market rate database ─────────────────────────────────────────────────────
// Rates are industry-average USD prices (from IBPAP, Clutch, Glassdoor benchmarks)
const SERVICE_RATES = {
  'medical-billing':        { label: 'Medical Billing & Coding',         unit: 'claim',    rate: 4.20,  unitLabel: 'per claim'           },
  'legal-transcription':    { label: 'Legal Transcription & Admin',      unit: 'page',     rate: 2.50,  unitLabel: 'per page'            },
  'dental-billing':         { label: 'Dental Billing & Insurance Admin', unit: 'claim',    rate: 3.80,  unitLabel: 'per claim'           },
  'bookkeeping':            { label: 'Bookkeeping & Payroll Processing', unit: 'hour',     rate: 14.00, unitLabel: 'per hour'            },
  'data-entry':             { label: 'Data Entry & Capture',             unit: 'page',     rate: 0.70,  unitLabel: 'per page'            },
  'transcription':          { label: 'Audio Transcription',              unit: 'minute',   rate: 1.50,  unitLabel: 'per audio minute'    },
  'document-processing':    { label: 'Document Processing & Indexing',   unit: 'document', rate: 8.50,  unitLabel: 'per document'        },
  'virtual-assistant':      { label: 'Virtual Assistant Support',        unit: 'hour',     rate: 12.00, unitLabel: 'per hour'            },
  'customer-support':       { label: 'Customer Support & Helpdesk',      unit: 'hour',     rate: 10.00, unitLabel: 'per hour'            },
  'inventory-data-entry':   { label: 'Inventory & Product Data Entry',   unit: 'item',     rate: 0.12,  unitLabel: 'per product listing' },
  'claims-processing':      { label: 'Insurance Claims Processing',      unit: 'claim',    rate: 5.50,  unitLabel: 'per claim'           },
  'logistics-admin':        { label: 'Logistics & Shipping Admin',       unit: 'shipment', rate: 3.20,  unitLabel: 'per shipment record' },
  'hr-admin':               { label: 'HR Admin & Candidate Screening',   unit: 'cv',       rate: 6.00,  unitLabel: 'per CV screened'     },
  'financial-reporting':    { label: 'Financial Reporting & Compliance', unit: 'hour',     rate: 22.00, unitLabel: 'per hour'            },
  'content-moderation':     { label: 'Content Moderation',               unit: 'item',     rate: 0.05,  unitLabel: 'per item'            },
  'property-admin':         { label: 'Property & Lease Administration',  unit: 'hour',     rate: 11.00, unitLabel: 'per hour'            },
  'back-office':            { label: 'Back-Office Administration',       unit: 'hour',     rate: 9.50,  unitLabel: 'per hour'            },
};

// ── Business type → best matching service ───────────────────────────────────
const BUSINESS_MAP = [
  { patterns: ['medical','clinic','health','hospital','physio','doctor','gp ','gp,','specialist','pharmacy','radiology','pathol'], service: 'medical-billing' },
  { patterns: ['dental','dentist','orthodont'], service: 'dental-billing' },
  { patterns: ['law firm','attorney','lawyer','legal','advocate','barrister','solicitor','paralegal','notary'], service: 'legal-transcription' },
  { patterns: ['accounti','bookkeep','cpa ','tax ','auditor','payroll','cfo','chartered'], service: 'bookkeeping' },
  { patterns: ['insurance','underwrite','claims','actuari','brokerage'], service: 'claims-processing' },
  { patterns: ['logistics','freight','shipping','courier','transport','fleet','warehou','supply chain'], service: 'logistics-admin' },
  { patterns: ['recruit','staffing','hr ','human resource','talent','headhunt','placement'], service: 'hr-admin' },
  { patterns: ['retail','shop','store','ecommerce','e-commerce','marketplace','online sell','wholesale'], service: 'inventory-data-entry' },
  { patterns: ['real estate','property','realt','letting','estate agent','leasing'], service: 'property-admin' },
  { patterns: ['financ','invest','bank','asset management','hedge','fund','wealth'], service: 'financial-reporting' },
  { patterns: ['media','content','social media','digital market','adverti','pr ','public relation'], service: 'content-moderation' },
  { patterns: ['it ','software','tech','saas','developer','cloud','cybersec','hosting'], service: 'customer-support' },
  { patterns: ['school','university','college','education','tutor','academy','institute'], service: 'document-processing' },
  { patterns: ['manufactur','factory','plant','engineer','industrial','construction'], service: 'data-entry' },
  { patterns: ['podcast','radio','broadcast','audio','video','studio','record'], service: 'transcription' },
  { patterns: ['virtual','remote','freelance','staffing'], service: 'virtual-assistant' },
];

// ── Typical volumes per service (used in the automatic quote) ────────────────
const TYPICAL_VOLUMES = {
  'medical-billing':      { volume: 200,   desc: '200 claims/month'           },
  'legal-transcription':  { volume: 150,   desc: '150 pages/month'            },
  'dental-billing':       { volume: 120,   desc: '120 claims/month'           },
  'bookkeeping':          { volume: 40,    desc: '40 hours/month'             },
  'data-entry':           { volume: 500,   desc: '500 pages/month'            },
  'transcription':        { volume: 300,   desc: '300 audio minutes/month'    },
  'document-processing':  { volume: 100,   desc: '100 documents/month'        },
  'virtual-assistant':    { volume: 80,    desc: '80 hours/month'             },
  'customer-support':     { volume: 160,   desc: '160 hours/month (1 agent)'  },
  'inventory-data-entry': { volume: 1000,  desc: '1,000 product listings'     },
  'claims-processing':    { volume: 150,   desc: '150 claims/month'           },
  'logistics-admin':      { volume: 400,   desc: '400 shipment records/month' },
  'hr-admin':             { volume: 80,    desc: '80 CVs/month'               },
  'financial-reporting':  { volume: 40,    desc: '40 hours/month'             },
  'content-moderation':   { volume: 5000,  desc: '5,000 items/month'          },
  'property-admin':       { volume: 60,    desc: '60 hours/month'             },
  'back-office':          { volume: 80,    desc: '80 hours/month'             },
};

const DISCOUNT = 0.15; // 15% below market average

/**
 * Detect the best service for a given business type string.
 * Returns a service key; falls back to 'back-office' if no match.
 */
function detectService(businessType, jobType) {
  const text = `${(businessType || '')} ${(jobType || '')}`.toLowerCase();
  for (const { patterns, service } of BUSINESS_MAP) {
    if (patterns.some(p => text.includes(p))) return service;
  }
  return 'back-office';
}

/**
 * Calculate a competitive quote object for a service.
 */
function calcQuote(serviceKey) {
  const svc = SERVICE_RATES[serviceKey] || SERVICE_RATES['back-office'];
  const vol = TYPICAL_VOLUMES[serviceKey] || TYPICAL_VOLUMES['back-office'];
  const marketTotal = svc.rate * vol.volume;
  const ourRate     = svc.rate * (1 - DISCOUNT);
  const ourTotal    = ourRate * vol.volume;
  const saving      = marketTotal - ourTotal;
  return { svc, vol, marketTotal, ourRate, ourTotal, saving, discountPct: DISCOUNT * 100 };
}

function fmtUSD(n) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Build a personalised pricing proposal email (text + HTML).
 * Returns { subject, text, html }
 */
function buildPricingEmail({ name, company, email, serviceKey, city, country, personalOpener, subjectOverride }) {
  const co        = company || name || 'your business';
  const firstName = (name || '').split(/[\s,]+/)[0] || '';
  const greeting  = firstName ? `Hi ${firstName},` : 'Hi,';
  const loc       = city ? ` in ${city}` : country ? ` in ${country}` : '';
  const { svc, vol, marketTotal, ourRate, ourTotal, saving, discountPct } = calcQuote(serviceKey);

  // AI-generated subject line OR readable fallback (never "Pricing proposal for...")
  const subject = subjectOverride || `quick question for ${co.split(/[\s,&]+/)[0]}`;

  // AI-generated opener OR human-sounding fallback
  const openerLine = personalOpener
    ? personalOpener
    : `Most ${(city || country) ? `${svc.label.toLowerCase()} providers${loc}` : 'businesses like yours'} spend more than they need to on this — so I put together a real quote for ${co} rather than a generic pitch.`;

  const text = `${greeting}

${openerLine}

Here's what ${svc.label} would cost ${co} with CTS BPO Solutions vs the market average:

SERVICE: ${svc.label}
TYPICAL VOLUME: ${vol.desc}

  Market average rate:  ${fmtUSD(svc.rate)} ${svc.unitLabel}
  Our CTS rate:         ${fmtUSD(ourRate)} ${svc.unitLabel}  (${discountPct}% cheaper)
  ─────────────────────────────────────
  Market average total: ${fmtUSD(marketTotal)}/month
  Your CTS total:       ${fmtUSD(ourTotal)}/month
  You save:             ${fmtUSD(saving)}/month — every single month

We can do this because our team operates from South Africa, with significantly lower overheads than US or UK BPO firms — and we pass every cent of that saving directly to you.

What's included at this price:
✓ Quality-checked output before every delivery
✓ 24–48 hour turnaround on standard volumes
✓ POPIA & GDPR-compliant data handling
✓ Free revision within 48 hours of delivery
✓ No long-term contracts — cancel anytime

To make the decision easier: the first batch is completely free, no invoice, no commitment. Just send us your files and see the quality for yourself.

If this sounds relevant for ${co}, just reply and I'll set it up today.

Calvin Thomas
CTS BPO Solutions
cts.bposolutions@gmail.com
WhatsApp: +27 76 067 9100`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;color:#1e293b;background:#f8fafc;margin:0;padding:0}
.wrap{max-width:620px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08)}
.hero{background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:32px 36px;color:#fff}
.hero h1{margin:0 0 6px;font-size:22px}
.hero p{margin:0;font-size:14px;opacity:0.85}
.body{padding:32px 36px}
.greeting{font-size:16px;color:#0f172a;margin-bottom:16px}
.intro{font-size:14px;color:#475569;line-height:1.7;margin-bottom:24px}
.table-wrap{background:#f0f9ff;border-radius:10px;padding:20px 24px;margin-bottom:24px;border:1px solid #bae6fd}
.table-wrap h3{margin:0 0 14px;font-size:15px;color:#0369a1;font-weight:700}
table{width:100%;border-collapse:collapse}
td{padding:8px 0;font-size:14px;color:#1e293b;border-bottom:1px solid #e0f2fe}
td:last-child{text-align:right;font-weight:600}
tr:last-child td{border-bottom:none}
.saving-row td{color:#16a34a;font-size:15px;font-weight:800}
.discount-badge{display:inline-block;background:#dcfce7;color:#16a34a;border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700;margin-left:8px}
.includes{background:#f8fafc;border-radius:10px;padding:18px 24px;margin-bottom:24px;border:1px solid #e2e8f0}
.includes h3{margin:0 0 10px;font-size:14px;font-weight:700;color:#374151}
.includes ul{margin:0;padding:0 0 0 18px}
.includes ul li{font-size:13px;color:#475569;margin-bottom:6px;line-height:1.5}
.free-offer{background:linear-gradient(135deg,#fefce8,#fef9c3);border:1px solid #fde047;border-radius:10px;padding:16px 22px;margin-bottom:24px;text-align:center}
.free-offer strong{font-size:15px;color:#854d0e}
.free-offer p{margin:6px 0 0;font-size:13px;color:#92400e}
.cta{text-align:center;margin-bottom:28px}
.cta a{display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;text-decoration:none;padding:14px 36px;border-radius:9px;font-weight:700;font-size:15px}
.sig{font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:18px;line-height:1.7}
</style></head><body>
<div class="wrap">
  <div class="hero">
    <h1>Pricing Proposal — ${svc.label}</h1>
    <p>Prepared specifically for ${co}${loc}</p>
  </div>
  <div class="body">
    <div class="greeting">${greeting}</div>
    <div class="intro">
      ${personalOpener
        ? `${personalOpener}<br><br>I've put together actual numbers for ${co} so you can see what working with CTS BPO Solutions would cost you vs. the market average.`
        : `I've put together a real quote for ${co} based on your business profile — not a generic pitch, but actual numbers so you can see what working with CTS BPO Solutions would cost you vs. the market average.`
      }
    </div>

    <div class="table-wrap">
      <h3>${svc.label} <span class="discount-badge">💰 ${discountPct}% below market</span></h3>
      <table>
        <tr><td>Typical volume</td><td>${vol.desc}</td></tr>
        <tr><td>Market average rate</td><td style="color:#ef4444">${fmtUSD(svc.rate)} <small style="font-weight:400;color:#94a3b8">${svc.unitLabel}</small></td></tr>
        <tr><td>CTS BPO rate</td><td style="color:#2563eb">${fmtUSD(ourRate)} <small style="font-weight:400;color:#94a3b8">${svc.unitLabel}</small></td></tr>
        <tr><td>Market total/month</td><td style="color:#ef4444;text-decoration:line-through">${fmtUSD(marketTotal)}</td></tr>
        <tr><td>Your total/month</td><td style="color:#2563eb">${fmtUSD(ourTotal)}</td></tr>
        <tr class="saving-row"><td>You save every month</td><td>${fmtUSD(saving)} ✓</td></tr>
      </table>
    </div>

    <div class="includes">
      <h3>What's included at this price</h3>
      <ul>
        <li>✓ Quality-checked output before every delivery</li>
        <li>✓ 24–48 hour turnaround on standard volumes</li>
        <li>✓ POPIA &amp; GDPR-compliant data handling</li>
        <li>✓ Free revision within 48 hours of delivery</li>
        <li>✓ No long-term contracts — cancel any time</li>
        <li>✓ Monthly progress report included</li>
      </ul>
    </div>

    <div class="free-offer">
      <strong>🎁 First batch is completely FREE</strong>
      <p>No invoice, no commitment. Send us your files and see the quality before spending a cent.</p>
    </div>

    <div class="cta">
      <a href="mailto:cts.bposolutions@gmail.com?subject=Pricing enquiry — ${encodeURIComponent(svc.label)}">Reply to Accept the Free Trial →</a>
    </div>

    <div class="sig">
      Calvin Thomas<br>
      <strong>CTS BPO Solutions</strong><br>
      cts.bposolutions@gmail.com<br>
      <a href="https://wa.me/27760679100" style="color:#25d366;font-weight:700;text-decoration:none">💬 WhatsApp: +27 76 067 9100</a><br>
      <em>South Africa's most competitive BPO — priced 15–25% below market, always.</em>
    </div>
  </div>
</div>
</body></html>`;

  return { subject, text, html };
}

/**
 * Main export: given a contact/lead object, detect the right service and
 * return { serviceKey, quote, subject, text, html } ready for sending.
 */
function autoPricingProposal({ name, company, email, businessType, jobType, city, country, personalOpener, subjectOverride }) {
  const serviceKey = detectService(businessType, jobType);
  const emailData  = buildPricingEmail({ name, company, email, serviceKey, city, country, personalOpener, subjectOverride });
  const quote      = calcQuote(serviceKey);
  return { serviceKey, serviceName: quote.svc.label, ...emailData, quote };
}

module.exports = { autoPricingProposal, detectService, calcQuote, SERVICE_RATES };
