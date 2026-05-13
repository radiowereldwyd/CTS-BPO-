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

I'd like to put forward a formal service proposal for ${co}.

CTS BPO Solutions handles ${svc.label.toLowerCase()} for businesses across the US, UK, Australia and South Africa. Our team operates from South Africa which allows us to offer rates 15–25% below what US or UK providers charge — without any reduction in quality or turnaround.

Here is what a standard engagement would look like for ${co}:

Service:          ${svc.label}
Typical volume:   ${vol.desc}

  Market rate:      ${fmtUSD(svc.rate)} ${svc.unitLabel}
  CTS BPO rate:     ${fmtUSD(ourRate)} ${svc.unitLabel}  (${discountPct}% below market)
  ─────────────────────────────────────────
  Market total:     ${fmtUSD(marketTotal)}/month
  Your total:       ${fmtUSD(ourTotal)}/month
  Monthly saving:   ${fmtUSD(saving)}

Terms of engagement:
• Month-to-month service agreement — no lock-in period
• Quality-checked output before every delivery
• 24–48 hour turnaround on standard volumes
• POPIA and GDPR-compliant data handling
• Dedicated account manager from day one
• Free pilot batch to verify quality before commitment

To move forward, I suggest we start with a no-obligation pilot — we complete one batch of your work at no charge so you can assess the output before signing anything. If the quality meets your standard, we formalise the arrangement with a simple service agreement.

Reply to this email and I will send through the pilot details and our standard service agreement for your review.

Calvin Thomas
Director, CTS BPO Solutions
cts.bposolutions@gmail.com
WhatsApp: +27 76 067 9100`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:Georgia,'Times New Roman',serif;color:#1a1a2e;background:#f4f6f9;margin:0;padding:0}
.wrap{max-width:640px;margin:30px auto;background:#ffffff;border:1px solid #d1d5db;border-radius:4px;overflow:hidden}
.header{background:#0f2244;padding:28px 40px 24px;border-bottom:3px solid #1e4a8a}
.header h1{margin:0 0 4px;font-size:18px;color:#ffffff;font-weight:600;letter-spacing:0.3px}
.header p{margin:0;font-size:12px;color:#93c5fd;letter-spacing:1px;text-transform:uppercase}
.body{padding:36px 40px}
.greeting{font-size:15px;color:#0f172a;margin-bottom:18px;font-family:Arial,sans-serif}
.opener{font-size:14px;color:#334155;line-height:1.75;margin-bottom:20px;font-family:Arial,sans-serif}
.section-label{font-size:11px;font-weight:700;color:#6b7280;letter-spacing:1.2px;text-transform:uppercase;margin:0 0 12px;font-family:Arial,sans-serif}
.rate-table{width:100%;border-collapse:collapse;margin-bottom:28px;font-family:Arial,sans-serif}
.rate-table td{padding:10px 12px;font-size:13.5px;border-bottom:1px solid #e5e7eb;color:#1e293b}
.rate-table td:last-child{text-align:right;font-weight:600}
.rate-table tr:last-child td{border-bottom:none;color:#15803d;font-size:15px;font-weight:800;background:#f0fdf4}
.rate-table .mkt td{color:#9ca3af;font-size:13px}
.terms-box{background:#f8fafc;border-left:3px solid #0f2244;padding:16px 20px;margin-bottom:24px;font-family:Arial,sans-serif}
.terms-box p{margin:0 0 8px;font-size:13.5px;color:#374151;line-height:1.6}
.terms-box p:last-child{margin-bottom:0}
.terms-box strong{color:#0f2244}
.pilot-box{background:#fffbeb;border:1px solid #d97706;border-radius:4px;padding:16px 20px;margin-bottom:28px;font-family:Arial,sans-serif}
.pilot-box p{margin:0;font-size:13.5px;color:#92400e;line-height:1.65}
.cta-row{margin-bottom:28px;font-family:Arial,sans-serif}
.cta-row a{display:inline-block;background:#0f2244;color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:3px;font-weight:600;font-size:14px;letter-spacing:0.3px}
.sig{font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:18px;line-height:1.8;font-family:Arial,sans-serif}
.sig strong{color:#0f172a}
</style></head><body>
<div class="wrap">
  <div class="header">
    <h1>Service Proposal — ${svc.label}</h1>
    <p>CTS BPO Solutions &nbsp;·&nbsp; Prepared for ${co}${loc}</p>
  </div>
  <div class="body">
    <div class="greeting">${greeting}</div>
    <div class="opener">
      ${personalOpener
        ? `${personalOpener}<br><br>I am writing to put forward a formal service proposal for ${co}.`
        : `I am writing to put forward a formal service proposal for ${co}${loc}.`
      }
      <br><br>
      CTS BPO Solutions provides ${svc.label.toLowerCase()} to businesses across the US, UK, Australia and South Africa. Our team operates from South Africa, which allows us to offer rates 15–25% below what US or UK providers charge — with no reduction in quality or turnaround time.
    </div>

    <p class="section-label">Proposed Engagement — Rate Comparison</p>
    <table class="rate-table">
      <tr><td>Service</td><td>${svc.label}</td></tr>
      <tr><td>Standard volume</td><td>${vol.desc}</td></tr>
      <tr class="mkt"><td>Market average rate</td><td>${fmtUSD(svc.rate)} <span style="font-weight:400;font-size:12px">${svc.unitLabel}</span></td></tr>
      <tr class="mkt"><td>Market average monthly cost</td><td style="text-decoration:line-through">${fmtUSD(marketTotal)}/mo</td></tr>
      <tr><td style="color:#1e4a8a;font-weight:700">CTS BPO rate (${discountPct}% below market)</td><td style="color:#1e4a8a">${fmtUSD(ourRate)} <span style="font-weight:400;font-size:12px">${svc.unitLabel}</span></td></tr>
      <tr><td>Your monthly cost with CTS BPO</td><td colspan="1">${fmtUSD(ourTotal)}/mo &nbsp;<span style="color:#15803d;font-size:12px">you save ${fmtUSD(saving)} every month</span></td></tr>
    </table>

    <p class="section-label">Terms of Engagement</p>
    <div class="terms-box">
      <p><strong>Contract:</strong> Month-to-month service agreement — no lock-in, cancel any time with 30 days notice.</p>
      <p><strong>Delivery:</strong> Quality-checked output within 24–48 hours of receiving source files.</p>
      <p><strong>Compliance:</strong> All data handled under POPIA and GDPR-compliant processes.</p>
      <p><strong>Revisions:</strong> One free revision cycle within 48 hours of each delivery.</p>
      <p><strong>Reporting:</strong> Monthly output summary and quality report included.</p>
    </div>

    <div class="pilot-box">
      <p><strong>No-obligation pilot included:</strong> Before any agreement is signed, we will complete one batch of your work at no charge so you can assess the output quality directly. If it meets your standard, we formalise the arrangement with a simple service agreement. If not, there is no cost and no obligation.</p>
    </div>

    <div class="cta-row">
      <a href="mailto:cts.bposolutions@gmail.com?subject=Service Proposal — ${encodeURIComponent(svc.label)} — ${encodeURIComponent(co)}">Reply to Arrange the Pilot Engagement →</a>
    </div>

    <div class="sig">
      <strong>Calvin Thomas</strong><br>
      Director, CTS BPO Solutions<br>
      <a href="mailto:cts.bposolutions@gmail.com" style="color:#1e4a8a;text-decoration:none">cts.bposolutions@gmail.com</a><br>
      <a href="https://wa.me/27760679100" style="color:#15803d;text-decoration:none">WhatsApp: +27 76 067 9100</a>
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
