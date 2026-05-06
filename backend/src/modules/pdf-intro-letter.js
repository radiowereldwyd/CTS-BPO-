/**
 * CTS BPO — Branded Client Introduction Letter (PDF)
 * Full-page A4 letter with services overview and pricing.
 * Generated on-demand; returned as a Buffer.
 */

const PDFDocument = require('pdfkit');

const BRAND_DARK   = '#0f172a';
const BRAND_BLUE   = '#1e3a5f';
const BRAND_INDIGO = '#6366f1';
const BRAND_TEAL   = '#0ea5e9';
const BRAND_GREEN  = '#10b981';
const GREY         = '#64748b';
const LIGHT        = '#f8fafc';
const WHITE        = '#ffffff';

const SERVICES = [
  { icon: '■', name: 'Data Entry & Processing', desc: 'High-accuracy data capture, cleansing, and migration — from paper records to digital, CRM population, and database management.' },
  { icon: '■', name: 'Document Processing', desc: 'Scanning, indexing, OCR extraction, and archiving of invoices, contracts, forms, and compliance documents.' },
  { icon: '■', name: 'Transcription Services', desc: 'Audio, video, medical, and legal transcription delivered within 24–48 hours with 99%+ accuracy.' },
  { icon: '■', name: 'Virtual Assistance', desc: 'Dedicated remote assistants for scheduling, email management, research, reporting, and day-to-day admin.' },
  { icon: '■', name: 'Back-Office Operations', desc: 'Accounts payable/receivable support, payroll data processing, HR record management, and compliance tracking.' },
  { icon: '■', name: 'Customer Support (Tier 1)', desc: 'Inbound email and chat support handling, ticket management, and escalation routing on your behalf.' },
];

const PLANS = [
  { name: 'Starter',      volume: 'Up to 500 units/mo',   zar: 'R 5,000',  usd: '~$130',   colour: BRAND_TEAL   },
  { name: 'Professional', volume: 'Up to 2,000 units/mo', zar: 'R 15,000', usd: '~$480',   colour: BRAND_INDIGO },
  { name: 'Enterprise',   volume: 'Unlimited',             zar: 'R 30,000', usd: '~$1,620', colour: BRAND_BLUE   },
];

/**
 * Generate the intro letter as a Buffer.
 * @param {object} [opts]
 * @param {string} [opts.recipientCompany]   — optional company name for personalisation
 * @returns {Promise<Buffer>}
 */
function generateIntroLetter(opts = {}) {
  const { recipientCompany = '' } = opts;
  const today = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'CTS BPO — Company Introduction', Author: 'Calvin Thomas' } });
    const chunks = [];
    doc.on('data',  c => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW = doc.page.width;   // 595
    const PH = doc.page.height;  // 842
    const M  = 50;               // side margin
    const CW = PW - M * 2;      // content width = 495

    // ── TOP HEADER BAND ───────────────────────────────────────────────────────
    doc.rect(0, 0, PW, 90).fill(BRAND_BLUE);

    // Company name
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(26)
       .text('CTS BPO', M, 22);
    doc.fillColor('#a5b4fc').font('Helvetica').fontSize(11)
       .text('AI-Driven Business Process Outsourcing', M, 52);

    // Right side — contact
    doc.fillColor('#cbd5e1').font('Helvetica').fontSize(9)
       .text('cts.cybersolutions@gmail.com', 0, 30, { align: 'right', width: PW - M })
       .text('South Africa  |  ctsbpo.com', 0, 44, { align: 'right', width: PW - M })
       .text(`Established 2023`, 0, 58, { align: 'right', width: PW - M });

    // ── TEAL ACCENT STRIPE ────────────────────────────────────────────────────
    doc.rect(0, 90, PW, 5).fill(BRAND_TEAL);

    // ── DATE & LETTER TYPE ───────────────────────────────────────────────────
    doc.fillColor(GREY).font('Helvetica').fontSize(9)
       .text(today, M, 108);

    // ── HEADLINE ─────────────────────────────────────────────────────────────
    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(18)
       .text('Company Introduction &', M, 128)
       .text('Service Capability Overview', M, 150);

    doc.rect(M, 176, 60, 3).fill(BRAND_TEAL);

    // ── SALUTATION ───────────────────────────────────────────────────────────
    const salutation = recipientCompany
      ? `Dear ${recipientCompany} Team,`
      : 'Dear Valued Business Owner,';

    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(11)
       .text(salutation, M, 192);

    // ── INTRO PARAGRAPHS ─────────────────────────────────────────────────────
    doc.fillColor('#334155').font('Helvetica').fontSize(10).lineGap(3)
       .text(
         'Thank you for taking the time to review this introduction. My name is Calvin Thomas, and I am the founder of CTS BPO Solutions — a specialist business process outsourcing company headquartered in South Africa.',
         M, 214, { width: CW }
       );

    doc.moveDown(0.5)
       .text(
         'We partner with growing businesses across Africa, Europe, North America, and the Gulf to reduce operational overhead, eliminate bottlenecks, and free your in-house team to focus on revenue-generating activities. Every engagement is supported by our quality assurance system, full audit trail, and a dedicated account manager.',
         { width: CW }
       );

    // ── SERVICES SECTION ─────────────────────────────────────────────────────
    const servY = doc.y + 18;
    doc.rect(M, servY, CW, 22).fill(BRAND_BLUE);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(10)
       .text('OUR SERVICES', M + 10, servY + 6);

    let rowY = servY + 30;
    let col  = 0;
    const colW   = (CW - 16) / 2;
    const colXs  = [M, M + colW + 16];

    for (const svc of SERVICES) {
      const x = colXs[col];
      // mini accent bar
      doc.rect(x, rowY, 3, 36).fill(BRAND_TEAL);
      doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(9)
         .text(svc.name, x + 9, rowY, { width: colW - 12 });
      doc.fillColor(GREY).font('Helvetica').fontSize(8).lineGap(1)
         .text(svc.desc, x + 9, rowY + 12, { width: colW - 12 });

      col++;
      if (col === 2) { col = 0; rowY += 52; }
    }

    // ── PRICING SECTION ───────────────────────────────────────────────────────
    const priceY = rowY + (col > 0 ? 52 : 0) + 12;
    doc.rect(M, priceY, CW, 22).fill(BRAND_INDIGO);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(10)
       .text('TRANSPARENT PRICING (ZAR / USD)', M + 10, priceY + 6);

    // Column headers
    const hdrY = priceY + 28;
    doc.fillColor(GREY).font('Helvetica-Bold').fontSize(8)
       .text('PLAN',          M,           hdrY, { width: 110 })
       .text('VOLUME',        M + 115,     hdrY, { width: 130 })
       .text('MONTHLY (ZAR)', M + 250,     hdrY, { width: 110 })
       .text('USD EQUIV.',    M + 360,     hdrY, { width: 90,  align: 'right' });

    doc.rect(M, hdrY + 13, CW, 0.5).fill('#e2e8f0');

    let planY = hdrY + 20;
    for (const [i, plan] of PLANS.entries()) {
      if (i % 2 === 0) doc.rect(M, planY - 3, CW, 24).fill(LIGHT);
      // colour swatch
      doc.rect(M, planY + 2, 4, 14).fill(plan.colour);
      doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(9)
         .text(plan.name,   M + 10,  planY, { width: 100 });
      doc.fillColor(GREY).font('Helvetica').fontSize(9)
         .text(plan.volume, M + 115, planY, { width: 130 });
      doc.fillColor(BRAND_GREEN).font('Helvetica-Bold').fontSize(9)
         .text(plan.zar,    M + 250, planY, { width: 110 });
      doc.fillColor(GREY).font('Helvetica').fontSize(9)
         .text(plan.usd,    M + 360, planY, { width: 90, align: 'right' });
      planY += 24;
    }

    // Inclusions note
    doc.fillColor(GREY).font('Helvetica').fontSize(8)
       .text(
         '✔ All plans include: QA with automated accuracy scanning · GDPR/POPIA compliance · Full audit trail · Dedicated account manager · 24–48h turnaround SLA · Custom pricing for high-volume or long-term contracts.',
         M, planY + 6, { width: CW }
       );

    // ── WHY CTS BPO ──────────────────────────────────────────────────────────
    const whyY = planY + 34;
    doc.rect(M, whyY, CW, 22).fill(BRAND_TEAL);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(10)
       .text('WHY CTS BPO?', M + 10, whyY + 6);

    const bullets = [
      '✔  Cost advantage — South Africa\'s operational costs are 40–60% lower than the UK, US, or Australia',
      '✔  English-first workforce — fluent written and spoken English across all teams',
      '✔  AI-augmented delivery — automated QA scanning achieves 99%+ accuracy on every batch',
      '✔  Fully remote, fully managed — no infrastructure investment required on your side',
      '✔  GDPR & POPIA compliant — data handling agreements provided with every engagement',
    ];

    let bY = whyY + 30;
    for (const b of bullets) {
      doc.fillColor('#334155').font('Helvetica').fontSize(9).lineGap(1)
         .text(b, M + 6, bY, { width: CW - 6 });
      bY += 16;
    }

    // ── CALL TO ACTION ────────────────────────────────────────────────────────
    const ctaY = bY + 10;
    doc.rect(M, ctaY, CW, 44).fill(BRAND_DARK);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(11)
       .text('Ready to reduce your operating costs?', M + 14, ctaY + 8, { width: CW - 100 });
    doc.fillColor('#a5b4fc').font('Helvetica').fontSize(9)
       .text('Reply to this email or send us a message — we will respond within 24 hours.', M + 14, ctaY + 24, { width: CW - 100 });
    doc.fillColor(BRAND_TEAL).font('Helvetica-Bold').fontSize(9)
       .text('cts.cybersolutions@gmail.com', PW - M - 10, ctaY + 20, { align: 'right', width: 160 });

    // ── SIGNATURE ─────────────────────────────────────────────────────────────
    const sigY = ctaY + 58;
    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(10).text('Kind regards,', M, sigY);
    doc.fillColor(BRAND_INDIGO).font('Helvetica-Bold').fontSize(13).text('Calvin Thomas', M, sigY + 16);
    doc.fillColor(GREY).font('Helvetica').fontSize(9)
       .text('Founder & Director, CTS BPO Solutions', M, sigY + 32)
       .text('cts.cybersolutions@gmail.com  |  South Africa', M, sigY + 44);

    // ── BOTTOM FOOTER BAND ────────────────────────────────────────────────────
    doc.rect(0, PH - 36, PW, 36).fill(BRAND_BLUE);
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
       .text(
         'CTS BPO Solutions  ·  cts.cybersolutions@gmail.com  ·  South Africa  ·  AI-Powered Outsourcing  ·  Confidential',
         0, PH - 22, { align: 'center', width: PW }
       );

    doc.end();
  });
}

module.exports = { generateIntroLetter };
