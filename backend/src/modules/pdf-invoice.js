/**
 * PDF Invoice Generator — CTS BPO
 * Generates a branded PDF invoice for client delivery.
 */

const PDFDocument = require('pdfkit');

const BRAND_BLUE  = '#1e3a5f';
const BRAND_INDIGO = '#6366f1';
const BRAND_GREEN  = '#10b981';
const GREY        = '#64748b';
const LIGHT_GREY  = '#f1f5f9';

/**
 * Generate a PDF invoice as a Buffer.
 * @param {object} opts
 * @param {string} opts.jobTitle
 * @param {string} opts.clientName
 * @param {string} opts.clientEmail
 * @param {number} opts.jobValue       — amount charged to client (ZAR)
 * @param {string} opts.reference      — unique invoice ref e.g. INV-00042
 * @param {string} opts.deliveryDate   — ISO date string
 * @param {string} [opts.description]
 * @param {string} [opts.serviceType]
 * @returns {Promise<Buffer>}
 */
function generateInvoicePDF(opts) {
  return new Promise((resolve, reject) => {
    const {
      jobTitle, clientName, clientEmail,
      jobValue, reference, deliveryDate,
      description = '', serviceType = 'BPO Services',
    } = opts;

    const doc    = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data',  c => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 100; // usable width

    // ── Header band ──────────────────────────────────────────────────────────
    doc.rect(50, 40, W, 80).fill(BRAND_BLUE);
    doc.fillColor('#fff')
       .font('Helvetica-Bold').fontSize(28).text('CTS BPO', 70, 58)
       .font('Helvetica').fontSize(11).fillColor('#a5b4fc')
       .text('AI-Driven Business Process Outsourcing', 70, 90);

    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(22)
       .text('TAX INVOICE', 0, 68, { align: 'right', width: W + 50 });

    // ── Invoice meta ─────────────────────────────────────────────────────────
    doc.y = 148;
    doc.fillColor(BRAND_BLUE).font('Helvetica-Bold').fontSize(10)
       .text('INVOICE NUMBER', 50, 148)
       .text('DATE ISSUED', 300, 148);

    doc.fillColor('#0f172a').font('Helvetica').fontSize(12)
       .text(reference, 50, 162)
       .text(new Date(deliveryDate).toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric' }), 300, 162);

    // ── Billed to ────────────────────────────────────────────────────────────
    doc.y = 200;
    doc.rect(50, 198, W, 1).fill(LIGHT_GREY);

    doc.fillColor(BRAND_INDIGO).font('Helvetica-Bold').fontSize(10)
       .text('BILLED TO', 50, 210);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13)
       .text(clientName, 50, 225);
    doc.fillColor(GREY).font('Helvetica').fontSize(10)
       .text(clientEmail, 50, 241);

    doc.fillColor(BRAND_INDIGO).font('Helvetica-Bold').fontSize(10)
       .text('FROM', 300, 210);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13)
       .text('CTS BPO Solutions', 300, 225);
    doc.fillColor(GREY).font('Helvetica').fontSize(10)
       .text('info@ctsbpo.com', 300, 241)
       .text('South Africa', 300, 255);

    // ── Line items table ─────────────────────────────────────────────────────
    doc.y = 290;
    doc.rect(50, 288, W, 32).fill(BRAND_BLUE);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10)
       .text('DESCRIPTION', 62, 300, { width: 260 })
       .text('SERVICE TYPE', 322, 300, { width: 140 })
       .text('AMOUNT', 0, 300, { align: 'right', width: W + 50 });

    const row1Y = 332;
    doc.rect(50, row1Y - 4, W, 36).fill(LIGHT_GREY);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(10)
       .text(jobTitle, 62, row1Y, { width: 260, lineBreak: false })
       .text(serviceType, 322, row1Y, { width: 140 })
       .font('Helvetica-Bold').fontSize(12).fillColor(BRAND_GREEN)
       .text(`R ${parseFloat(jobValue).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, 0, row1Y, { align: 'right', width: W + 50 });

    if (description) {
      doc.fillColor(GREY).font('Helvetica').fontSize(9)
         .text(description.slice(0, 120), 62, row1Y + 18, { width: 400, lineBreak: false });
    }

    // ── Total box ────────────────────────────────────────────────────────────
    const totY = row1Y + 60;
    doc.rect(W - 110, totY, 160, 50).fill(BRAND_BLUE);
    doc.fillColor('#a5b4fc').font('Helvetica').fontSize(9)
       .text('TOTAL DUE (ZAR)', W - 100, totY + 8, { width: 140 });
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(16)
       .text(`R ${parseFloat(jobValue).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, W - 100, totY + 22, { width: 140 });

    // ── Payment instructions ─────────────────────────────────────────────────
    const payY = totY + 80;
    doc.rect(50, payY, W, 1).fill(LIGHT_GREY);
    doc.fillColor(BRAND_INDIGO).font('Helvetica-Bold').fontSize(10)
       .text('PAYMENT INSTRUCTIONS', 50, payY + 14);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(10)
       .text('Payment is due upon delivery confirmation. Click the "Confirm Receipt" button in your delivery email to process payment. For EFT, use your invoice number as reference and contact us at info@ctsbpo.com.', 50, payY + 30, { width: W, lineBreak: true });

    // ── Terms ────────────────────────────────────────────────────────────────
    const termsY = payY + 80;
    doc.fillColor(GREY).font('Helvetica').fontSize(8)
       .text('Terms & Conditions: Payment is due within 14 days of invoice date. Late payments are subject to reminder notices. This is a computer-generated invoice and requires no signature. CTS BPO Solutions is a registered business in South Africa.', 50, termsY, { width: W });

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.rect(50, doc.page.height - 60, W, 1).fill(BRAND_INDIGO);
    doc.fillColor(GREY).fontSize(8).font('Helvetica')
       .text(`${reference} · CTS BPO Solutions · info@ctsbpo.com · www.ctsbpo.com`, 50, doc.page.height - 46, { align: 'center', width: W });

    doc.end();
  });
}

module.exports = { generateInvoicePDF };
