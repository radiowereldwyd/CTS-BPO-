import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const COLORS = {
  navy: '#0a1530', navyMid: '#0f172a', navyCard: '#0f1e3d',
  indigo: '#6366f1', indigoDark: '#4f46e5', sky: '#38bdf8',
  green: '#10b981', amber: '#f59e0b', white: '#fff',
  text: '#e2e8f0', muted: '#94a3b8', lightBg: '#f0f4f8',
};

const SERVICES = [
  { icon: '📊', title: 'Data Entry & Capture', desc: 'High-accuracy manual and automated data capture from any source — paper, PDFs, images, or digital forms — delivered clean and structured.' },
  { icon: '🎙', title: 'Transcription', desc: 'Verbatim or edited transcription of audio and video recordings including interviews, meetings, lectures, legal proceedings and medical dictations.' },
  { icon: '🌐', title: 'Translation', desc: 'Professional translation across 50+ language pairs with industry-specific glossaries. Human-reviewed for accuracy and cultural nuance.' },
  { icon: '💼', title: 'Virtual Assistant', desc: 'Dedicated remote assistants for scheduling, email management, research, correspondence and day-to-day administrative tasks.' },
  { icon: '🎧', title: 'Customer Support', desc: 'Inbound and outbound customer service via email, chat and ticketing systems. Trained agents, quality-monitored calls.' },
  { icon: '📈', title: 'Finance & Admin Support', desc: 'Accounts payable/receivable processing, payroll administration, invoice matching, reconciliations and bookkeeping support.' },
  { icon: '🛡', title: 'Content Moderation', desc: 'Rapid, accurate moderation of user-generated content against your policy guidelines — images, text, video and comments.' },
  { icon: '📋', title: 'Reporting & Analytics', desc: 'Structured data analysis, dashboard preparation, KPI reporting and executive summaries delivered to your schedule.' },
  { icon: '📄', title: 'Document Processing', desc: 'Document classification, indexing, digitisation and workflow automation. PDF conversion, form extraction and archiving.' },
  { icon: '📱', title: 'Social Media Management', desc: 'Content scheduling, community management, engagement tracking and analytics reporting across all major platforms.' },
];

const STATS = [
  { value: '98.6%', label: 'Quality Success Rate' },
  { value: '2.4M+', label: 'Tasks Processed Monthly' },
  { value: '200+', label: 'Active Client Accounts' },
  { value: '50+', label: 'Languages Supported' },
];

const HOW_IT_WORKS = [
  { step: '01', icon: '📞', title: 'Contact Us', desc: 'Reach out via email or our contact form. We respond within 2 business hours with a tailored consultation.' },
  { step: '02', icon: '📝', title: 'Scoped & Quoted', desc: 'We assess your requirements, define scope, turnaround time and pricing. No hidden fees — ever.' },
  { step: '03', icon: '🚀', title: 'Work Begins', desc: 'Our AI assigns your project to the best-matched team. Real-time progress tracking keeps you informed.' },
  { step: '04', icon: '✅', title: 'Delivered & Verified', desc: 'Every output is quality-checked before delivery. Payment is only due once you are satisfied.' },
];

const FAQS = [
  { q: 'What is CTS BPO Solutions?', a: 'CTS BPO Solutions is a South African business process outsourcing company that provides high-quality, cost-effective back-office and remote services to businesses of all sizes. We combine human expertise with AI-powered quality assurance to deliver consistent, accurate results.' },
  { q: 'What services do you offer?', a: 'We offer data entry and capture, transcription, translation, virtual assistant services, customer support, finance and admin support, content moderation, reporting and analytics, document processing, and social media management. Custom service combinations are available on request.' },
  { q: 'How do I get started as a client?', a: 'Simply email us at cts.bposolutions@gmail.com or click "Get a Quote" on this page. We respond within 2 business hours with a consultation to understand your needs and provide a tailored proposal.' },
  { q: 'How are your subcontractors vetted?', a: 'All subcontractors undergo a structured application process, skills assessment and agreement to our quality and confidentiality standards before being activated. Performance is continuously monitored with penalty clauses for non-delivery.' },
  { q: 'What is your typical turnaround time?', a: 'Turnaround depends on volume and complexity. Standard data entry and transcription projects are typically returned within 24–48 hours. Rush delivery (same-day or next-day) is available at a premium. We always provide a committed deadline at the time of quoting.' },
  { q: 'How do you ensure quality?', a: 'Every deliverable passes through a multi-step quality process: initial processing, AI-assisted accuracy scanning, human sign-off and client review. We maintain a 98.6% quality success rate across all completed contracts.' },
  { q: 'What languages do you support?', a: 'We support 50+ language pairs for translation and transcription, including all 11 official South African languages, major European languages, Mandarin, Arabic, Hindi, Swahili and more. Contact us for a specific language inquiry.' },
  { q: 'How is my data kept secure?', a: 'All client data is handled under strict confidentiality agreements. Our subcontractors are contractually prohibited from sharing any client information. Data is transmitted via encrypted channels and stored securely. We comply with POPIA (South Africa) and GDPR standards.' },
  { q: 'What are your pricing models?', a: 'We offer per-page, per-minute, per-word and per-task pricing depending on the service. Monthly retainer packages are available for regular volume clients. All pricing is transparent — you receive a full quote before any work begins.' },
  { q: 'Do you offer trial projects?', a: 'Yes. New clients are welcome to submit a small sample project (typically 10–20 pages or 10 minutes of audio) at a reduced rate so you can assess our quality and turnaround before committing to larger volumes.' },
  { q: 'How do I track my project progress?', a: 'All active clients receive a dedicated project reference number and regular status updates via email. For ongoing retainer clients, we provide a weekly progress report and are available via email throughout the project lifecycle.' },
  { q: 'What file formats do you accept?', a: 'We accept virtually all common formats: PDF, Word, Excel, PNG/JPG, MP3/MP4/WAV, MOV, ZIP archives and cloud links (Google Drive, Dropbox, OneDrive). If you have a proprietary format, contact us and we will advise.' },
  { q: 'Can I request specific subcontractors for my project?', a: 'For confidentiality and operational reasons, client identities are kept separate from subcontractor assignments. However, you may request specific skill sets, language expertise or specialist knowledge and we will match accordingly.' },
  { q: 'How do you handle urgent or large-volume projects?', a: 'Urgent projects are escalated to our priority queue. Large-volume projects are distributed across multiple vetted subcontractors working in parallel, ensuring capacity without sacrificing quality. Contact us to discuss your specific volume requirements.' },
  { q: 'What is your success and completion rate?', a: 'We maintain a 98.6% successful delivery rate. In the rare event of a quality issue, we offer free rework and, where applicable, partial or full refunds. Client satisfaction is our primary metric.' },
  { q: 'How are payments processed?', a: 'We accept EFT (South African bank transfer), PayPal and other online payment methods. An invoice is issued upon project completion. Retainer clients are billed monthly in advance. All transactions are confirmed in writing.' },
  { q: 'Do you offer refunds if quality is not met?', a: 'Yes. If we fail to meet the agreed quality standard, we will first offer a free revision. If the issue cannot be resolved, a partial or full refund is issued depending on the extent of the shortfall. This is guaranteed in our service agreement.' },
  { q: 'What industries do you serve?', a: 'We serve clients across legal, medical, financial services, retail, e-commerce, logistics, education, real estate, insurance, government and NGO sectors. Our teams include specialists in industry-specific terminology and formatting standards.' },
  { q: 'How does your AI matching system work?', a: 'Our proprietary AI engine analyses the nature, complexity and language requirements of each incoming task, then matches it to the best-qualified available subcontractor based on their skills, performance history and current capacity — ensuring optimal quality and turnaround every time.' },
  { q: 'How do I become a subcontractor / work-from-home partner?', a: 'Visit our Online Jobs section on this page or click "Work From Home" in the navigation. You will complete a structured application, agree to our subcontractor terms, and pay a one-time enrolment fee. Once payment is confirmed, our AI immediately allocates contracts to your value — you earn back double your investment on verified completion.' },
];

const EXAMPLE_TRANSCRIPTION = `TRANSCRIPTION OUTPUT — CTS BPO SOLUTIONS
Project Ref: TRN-2026-0447 | Source: Board Meeting Recording (42:18)
Client Industry: Financial Services | Language: English

[00:00] CHAIRPERSON: Good morning everyone. I'd like to call this board meeting to order. We have a quorum of seven members present. Today's agenda covers Q1 financial results, the proposed expansion into the Northern Cape market, and risk committee recommendations.

[00:28] CFO: Thank you, Chair. Q1 revenue came in at R14.2 million, which is 11% ahead of budget. Operating costs were contained at R9.8 million, giving us an EBITDA of R4.4 million for the quarter. The main driver of outperformance was the logistics division, which exceeded targets by 18%.

[01:15] CHAIRPERSON: Excellent. Are there any questions on the financials before we proceed?

[01:19] NON-EXECUTIVE DIRECTOR: Yes. Can you elaborate on the provision for bad debt that I noticed in the footnotes? It appears higher than Q4 last year.

[01:31] CFO: Certainly. We provisioned R340,000 for three legacy debtors — two of whom are in business rescue. We believe this is a conservative and prudent approach given the current economic environment...

━━━ [Transcription continues — 42 minutes, 6,840 words] ━━━
Delivered: Next business day | Accuracy: 99.2% | Formatted: Yes`;

const EXAMPLE_DATA = [
  { ref: 'INV-0441', supplier: 'Makro Trade Supplies', amount: 'R 18,450.00', vat: 'R 2,583.00', total: 'R 21,033.00', date: '03 Apr 2026', status: 'Captured' },
  { ref: 'INV-0442', supplier: 'Pick n Pay Wholesale', amount: 'R 6,890.50', vat: 'R 964.67', total: 'R 7,855.17', date: '04 Apr 2026', status: 'Captured' },
  { ref: 'INV-0443', supplier: 'Office National', amount: 'R 3,210.00', vat: 'R 449.40', total: 'R 3,659.40', date: '05 Apr 2026', status: 'Captured' },
  { ref: 'INV-0444', supplier: 'Builders Warehouse', amount: 'R 24,700.00', vat: 'R 3,458.00', total: 'R 28,158.00', date: '06 Apr 2026', status: 'Captured' },
  { ref: 'INV-0445', supplier: 'Nashua Office Tech', amount: 'R 9,150.00', vat: 'R 1,281.00', total: 'R 10,431.00', date: '07 Apr 2026', status: 'Captured' },
];

function AccordionItem({ q, a, open, onClick }) {
  return (
    <div onClick={onClick} style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', lineHeight: 1.4 }}>{q}</span>
        <span style={{ fontSize: 20, color: '#6366f1', flexShrink: 0, fontWeight: 700, transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}>+</span>
      </div>
      {open && <p style={{ margin: '0 0 18px', fontSize: 14, color: '#475569', lineHeight: 1.8 }}>{a}</p>}
    </div>
  );
}

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", color: '#1e293b', background: '#fff', overflowX: 'hidden' }}>

      {/* ── STICKY NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        background: scrolled ? 'rgba(10,21,48,0.97)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : 'none',
        transition: 'all 0.3s ease',
        padding: '0 40px',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 70 }}>
          <img src="/cts-bpo-logo-nobg.png" alt="CTS BPO" style={{ height: 48, width: 'auto' }} />
          <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
            {[['Services', 'services'], ['How It Works', 'how-it-works'], ['Examples', 'examples'], ['FAQ', 'faq'], ['Online Jobs', 'online-jobs']].map(([label, id]) => (
              <button key={id} onClick={() => scrollTo(id)} style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '6px 0' }}>{label}</button>
            ))}
            <Link to="/login" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid #6366f1', color: '#a5b4fc', padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Admin Login</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{
        background: 'linear-gradient(135deg,#0a1530 0%,#0f172a 40%,#0f2d5f 70%,#0f172a 100%)',
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '120px 24px 80px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: '10%', right: '8%', width: 400, height: 400, background: 'radial-gradient(circle,rgba(99,102,241,0.15) 0%,transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '5%', left: '5%', width: 300, height: 300, background: 'radial-gradient(circle,rgba(56,189,248,0.10) 0%,transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 860, position: 'relative', zIndex: 1 }}>
          <img src="/cts-bpo-logo-nobg.png" alt="CTS BPO" style={{ height: 110, width: 'auto', marginBottom: 32 }} />
          <div style={{ display: 'inline-block', background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.4)', borderRadius: 20, padding: '6px 20px', marginBottom: 24 }}>
            <span style={{ color: '#38bdf8', fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>South Africa's Premier BPO Partner</span>
          </div>
          <h1 style={{ margin: '0 0 20px', fontSize: 'clamp(36px,5vw,60px)', fontWeight: 900, color: '#fff', lineHeight: 1.15 }}>
            Business Process Excellence,<br />
            <span style={{ background: 'linear-gradient(90deg,#38bdf8,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Delivered Every Time</span>
          </h1>
          <p style={{ margin: '0 0 40px', fontSize: 18, color: '#94a3b8', lineHeight: 1.8, maxWidth: 680, marginLeft: 'auto', marginRight: 'auto' }}>
            We handle your back-office operations with precision, speed and confidentiality — so you can focus on growing your business. From data entry to transcription, translation to customer support.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="mailto:cts.bposolutions@gmail.com" style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', padding: '16px 36px', borderRadius: 10, fontWeight: 800, fontSize: 16, textDecoration: 'none', boxShadow: '0 4px 24px rgba(99,102,241,0.4)' }}>
              Get a Free Quote
            </a>
            <button onClick={() => scrollTo('online-jobs')} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '16px 36px', borderRadius: 10, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
              Work From Home →
            </button>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section style={{ background: 'linear-gradient(90deg,#6366f1,#4f46e5)', padding: '32px 40px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: '#fff' }}>{s.value}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── ABOUT ── */}
      <section style={{ background: '#fff', padding: '80px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 2 }}>Who We Are</span>
            <h2 style={{ margin: '12px 0 20px', fontSize: 'clamp(28px,3vw,40px)', fontWeight: 900, color: '#0f172a', lineHeight: 1.2 }}>South Africa's Trusted BPO Partner</h2>
            <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.9, marginBottom: 18 }}>
              CTS BPO Solutions is a South African business process outsourcing company serving clients across multiple industries — from financial services and legal firms to retail, healthcare and logistics. We manage thousands of tasks every month with a verified <strong style={{ color: '#10b981' }}>98.6% quality success rate</strong>.
            </p>
            <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.9, marginBottom: 28 }}>
              Our AI-powered matching engine continuously sources new contracts and assigns them to our vetted network of skilled remote professionals — ensuring every project is handled by the right person at the right time, every time. Clients across South Africa, the United Kingdom and beyond rely on us to keep their back-office operations running without interruption.
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {['POPIA Compliant', 'GDPR Aligned', 'AI-Verified Quality', '24hr Turnaround Available'].map(badge => (
                <span key={badge} style={{ background: '#eff6ff', color: '#3b82f6', fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 20 }}>{badge}</span>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { icon: '🏆', label: 'Established Company', sub: 'Trusted by 200+ clients' },
              { icon: '🤖', label: 'AI-Powered Matching', sub: 'Right person, every project' },
              { icon: '🔒', label: 'Fully Confidential', sub: 'NDA on every contract' },
              { icon: '⚡', label: '24hr Response', sub: 'Always on, always ready' },
            ].map(c => (
              <div key={c.label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 18px' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>{c.icon}</div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SERVICES ── */}
      <section id="services" style={{ background: '#f8fafc', padding: '80px 40px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 2 }}>What We Do</span>
            <h2 style={{ margin: '12px 0 16px', fontSize: 'clamp(28px,3vw,42px)', fontWeight: 900, color: '#0f172a' }}>Complete BPO Service Suite</h2>
            <p style={{ fontSize: 16, color: '#64748b', maxWidth: 600, margin: '0 auto' }}>Ten specialist service lines. One trusted partner. Consistent quality across every single deliverable.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 20 }}>
            {SERVICES.map(s => (
              <div key={s.title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px 22px', transition: 'box-shadow 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 8px 30px rgba(99,102,241,0.15)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'}>
                <div style={{ fontSize: 36, marginBottom: 14 }}>{s.icon}</div>
                <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{s.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ background: '#fff', padding: '80px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 2 }}>The Process</span>
            <h2 style={{ margin: '12px 0 16px', fontSize: 'clamp(28px,3vw,42px)', fontWeight: 900, color: '#0f172a' }}>Simple. Transparent. Reliable.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24 }}>
            {HOW_IT_WORKS.map((s, i) => (
              <div key={s.step} style={{ textAlign: 'center', position: 'relative' }}>
                {i < HOW_IT_WORKS.length - 1 && (
                  <div style={{ position: 'absolute', top: 36, left: '60%', width: '80%', height: 2, background: 'linear-gradient(90deg,#6366f1,#e2e8f0)', zIndex: 0 }} />
                )}
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28, position: 'relative', zIndex: 1, boxShadow: '0 4px 20px rgba(99,102,241,0.3)' }}>
                  {s.icon}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', letterSpacing: 2, marginBottom: 8 }}>STEP {s.step}</div>
                <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{s.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WORK EXAMPLES ── */}
      <section id="examples" style={{ background: '#f8fafc', padding: '80px 40px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 2 }}>Our Work</span>
            <h2 style={{ margin: '12px 0 16px', fontSize: 'clamp(28px,3vw,42px)', fontWeight: 900, color: '#0f172a' }}>See the Quality We Deliver</h2>
            <p style={{ fontSize: 16, color: '#64748b', maxWidth: 600, margin: '0 auto' }}>Real examples of transcription, data capture and multimedia processing — the standard our clients expect every time.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 28 }}>

            {/* Video Example */}
            <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
              <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', aspectRatio: '16/9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(99,102,241,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, cursor: 'pointer', marginBottom: 16, boxShadow: '0 0 0 12px rgba(99,102,241,0.15)' }}>▶</div>
                <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Sample: Board Meeting Transcription Project</p>
                <p style={{ color: '#475569', fontSize: 11, margin: '4px 0 0' }}>42 minutes · English · Financial Services</p>
              </div>
              <div style={{ padding: '20px 22px' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <span style={{ background: '#eff6ff', color: '#3b82f6', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 }}>VIDEO PROCESSING</span>
                  <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 }}>99.2% ACCURACY</span>
                </div>
                <h4 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Board Meeting — Full Transcription</h4>
                <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>42-minute corporate board meeting transcribed verbatim with speaker identification, timestamps and formatted minutes. Delivered within 4 hours.</p>
                <div style={{ marginTop: 14, display: 'flex', gap: 16, fontSize: 12, color: '#94a3b8' }}>
                  <span>⏱ Delivered: 4 hours</span>
                  <span>📄 6,840 words</span>
                  <span>🎯 99.2% accuracy</span>
                </div>
              </div>
            </div>

            {/* Audio Transcription Example */}
            <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
              <div style={{ background: '#0f172a', padding: '20px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎙</div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>interview_recording_final.mp3</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>28:44 · 44.1kHz · Stereo</div>
                  </div>
                </div>
                <div style={{ background: '#1e293b', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: '#6366f1', fontSize: 20 }}>▶</span>
                  <div style={{ flex: 1, height: 4, background: '#334155', borderRadius: 2, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '35%', background: 'linear-gradient(90deg,#6366f1,#38bdf8)', borderRadius: 2 }} />
                  </div>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>10:03 / 28:44</span>
                </div>
              </div>
              <div style={{ padding: '16px 22px' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <span style={{ background: '#fdf4ff', color: '#9333ea', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 }}>AUDIO TRANSCRIPTION</span>
                  <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 }}>DELIVERED</span>
                </div>
                <h4 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Executive Interview Transcription</h4>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: '#334155', lineHeight: 1.7, maxHeight: 100, overflow: 'hidden' }}>
                  <strong>[INTERVIEWER]:</strong> Can you walk us through your company's growth strategy for the next 18 months?<br />
                  <strong>[CEO]:</strong> Absolutely. Our primary focus is on expanding our digital service offering while maintaining the personal relationships that have always been at the core of what we do...
                </div>
              </div>
            </div>

            {/* Data Entry Example */}
            <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
              <div style={{ background: 'linear-gradient(135deg,#0f172a,#1a2747)', padding: '20px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 24 }}>📊</span>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Invoice_Batch_April2026.xlsx</div>
                    <div style={{ color: '#64748b', fontSize: 11 }}>127 source invoices · Captured in 6 hours</div>
                  </div>
                </div>
              </div>
              <div style={{ padding: '16px 0 16px 0' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, padding: '0 22px' }}>
                  <span style={{ background: '#fff7ed', color: '#ea580c', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 }}>DATA ENTRY</span>
                  <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 }}>100% VERIFIED</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['Ref', 'Supplier', 'Amount', 'VAT', 'Total', 'Date', 'Status'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {EXAMPLE_DATA.map((row, i) => (
                        <tr key={row.ref} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '7px 12px', color: '#6366f1', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 11 }}>{row.ref}</td>
                          <td style={{ padding: '7px 12px', color: '#0f172a', whiteSpace: 'nowrap', fontSize: 11 }}>{row.supplier}</td>
                          <td style={{ padding: '7px 12px', color: '#334155', whiteSpace: 'nowrap', fontSize: 11 }}>{row.amount}</td>
                          <td style={{ padding: '7px 12px', color: '#64748b', whiteSpace: 'nowrap', fontSize: 11 }}>{row.vat}</td>
                          <td style={{ padding: '7px 12px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', fontSize: 11 }}>{row.total}</td>
                          <td style={{ padding: '7px 12px', color: '#64748b', whiteSpace: 'nowrap', fontSize: 11 }}>{row.date}</td>
                          <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}><span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{row.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ margin: '12px 22px 0', fontSize: 11, color: '#94a3b8' }}>Showing 5 of 127 captured invoices · Total verified: R 71,136.57</p>
              </div>
            </div>

            {/* Transcription Text Example */}
            <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', gridColumn: 'span 2' }}>
              <div style={{ background: '#0f172a', padding: '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>📄</span>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>TRN-2026-0447_BoardMeeting_Transcript.pdf</span>
                </div>
                <span style={{ background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 10 }}>DELIVERED</span>
              </div>
              <div style={{ padding: '0' }}>
                <pre style={{ margin: 0, fontFamily: "'Courier New',monospace", fontSize: 12, color: '#334155', background: '#f8fafc', padding: '20px 24px', lineHeight: 1.9, overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: 280, overflow: 'auto' }}>{EXAMPLE_TRANSCRIPTION}</pre>
              </div>
              <div style={{ padding: '14px 22px', background: '#fff', display: 'flex', gap: 20, borderTop: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>📅 Delivered next business day</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>📝 6,840 words</span>
                <span style={{ fontSize: 12, color: '#10b981', fontWeight: 700 }}>✓ 99.2% accuracy</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>🔒 Client confidential</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ background: '#fff', padding: '80px 40px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 2 }}>Got Questions?</span>
            <h2 style={{ margin: '12px 0 0', fontSize: 'clamp(28px,3vw,42px)', fontWeight: 900, color: '#0f172a' }}>Frequently Asked Questions</h2>
          </div>
          <div>
            {FAQS.map((faq, i) => (
              <AccordionItem key={i} q={faq.q} a={faq.a} open={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)} />
            ))}
          </div>
          <div style={{ marginTop: 40, textAlign: 'center', background: '#f8fafc', borderRadius: 14, padding: '32px 24px' }}>
            <p style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Still have a question?</p>
            <a href="mailto:cts.bposolutions@gmail.com" style={{ display: 'inline-block', background: '#6366f1', color: '#fff', padding: '12px 28px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Email Us Directly</a>
          </div>
        </div>
      </section>

      {/* ── ONLINE JOBS ── */}
      <section id="online-jobs" style={{ background: 'linear-gradient(135deg,#0a1530,#0f172a,#0f2d5f)', padding: '80px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-block', background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 20, padding: '6px 20px', marginBottom: 20 }}>
              <span style={{ color: '#38bdf8', fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Work From Home</span>
            </div>
            <h2 style={{ margin: '0 0 16px', fontSize: 'clamp(28px,3vw,42px)', fontWeight: 900, color: '#fff' }}>Become a CTS BPO Partner</h2>
            <p style={{ fontSize: 17, color: '#94a3b8', maxWidth: 660, margin: '0 auto', lineHeight: 1.8 }}>
              Work from home on professional business contracts. No cold calling, no client hunting — we bring the work to you. Earn double your enrolment investment on every completed contract cycle.
            </p>
          </div>

          {/* Earning model */}
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '36px 40px', marginBottom: 40 }}>
            <h3 style={{ margin: '0 0 28px', color: '#fff', fontSize: 20, fontWeight: 800, textAlign: 'center' }}>The Double-Return Model — A South African First</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', gap: 16, alignItems: 'center' }}>
              {[
                { icon: '💳', label: 'You Invest', desc: 'One-time enrolment fee — your choice of tier', color: '#6366f1' },
                null,
                { icon: '📋', label: 'We Allocate', desc: 'Professional contracts worth 2× your investment', color: '#38bdf8' },
                null,
                { icon: '💰', label: 'You Earn', desc: 'Double your investment back — on verified completion', color: '#10b981' },
              ].map((item, i) => {
                if (!item) return <div key={i} style={{ textAlign: 'center', fontSize: 28, color: '#475569', fontWeight: 900 }}>→</div>;
                return (
                  <div key={item.label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '28px 20px', border: `1px solid ${item.color}30` }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>{item.icon}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: item.color, marginBottom: 8 }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{item.desc}</div>
                  </div>
                );
              })}
            </div>
            <p style={{ textAlign: 'center', margin: '24px 0 0', fontSize: 15, color: '#94a3b8' }}>
              Example: Invest <strong style={{ color: '#38bdf8' }}>R 500</strong> → Receive <strong style={{ color: '#38bdf8' }}>R 1,000</strong> in contracts → Earn <strong style={{ color: '#10b981' }}>R 1,000</strong> on completion
            </p>
          </div>

          {/* Services grid */}
          <div style={{ marginBottom: 40 }}>
            <h3 style={{ color: '#fff', fontSize: 17, fontWeight: 700, marginBottom: 20, textAlign: 'center' }}>Services You Can Work On</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
              {SERVICES.map(s => (
                <div key={s.title} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 22 }}>{s.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{s.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{ textAlign: 'center' }}>
            <Link to="/apply" style={{
              display: 'inline-block', background: 'linear-gradient(135deg,#10b981,#059669)',
              color: '#fff', padding: '20px 56px', borderRadius: 12, fontWeight: 900,
              fontSize: 18, textDecoration: 'none', boxShadow: '0 4px 28px rgba(16,185,129,0.4)',
              letterSpacing: 0.3,
            }}>
              ✅ Apply to Join — Free Application
            </Link>
            <p style={{ marginTop: 16, fontSize: 13, color: '#64748b' }}>Takes 3 minutes · No commitment until enrolment payment confirmed · 24hr approval</p>
          </div>
        </div>
      </section>

      {/* ── CONTACT / FOOTER ── */}
      <section style={{ background: '#f8fafc', padding: '60px 40px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 48, marginBottom: 48 }}>
            <div>
              <img src="/cts-bpo-logo-nobg.png" alt="CTS BPO" style={{ height: 60, width: 'auto', marginBottom: 16 }} />
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.8, maxWidth: 340, margin: '0 0 20px' }}>
                South Africa's trusted business process outsourcing partner. Precision, quality and confidentiality on every contract.
              </p>
              <a href="mailto:cts.bposolutions@gmail.com" style={{ color: '#6366f1', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>cts.bposolutions@gmail.com</a>
            </div>
            <div>
              <p style={{ fontWeight: 800, color: '#0f172a', marginBottom: 16, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Services</p>
              {SERVICES.slice(0,5).map(s => <p key={s.title} style={{ margin: '0 0 10px', fontSize: 13, color: '#64748b' }}>{s.title}</p>)}
            </div>
            <div>
              <p style={{ fontWeight: 800, color: '#0f172a', marginBottom: 16, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Quick Links</p>
              {[['Get a Quote', 'mailto:cts.bposolutions@gmail.com'], ['Work From Home', '/apply'], ['Admin Login', '/login']].map(([label, href]) => (
                href.startsWith('mailto') ? (
                  <p key={label} style={{ margin: '0 0 10px' }}><a href={href} style={{ fontSize: 13, color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>{label}</a></p>
                ) : (
                  <p key={label} style={{ margin: '0 0 10px' }}><Link to={href} style={{ fontSize: 13, color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>{label}</Link></p>
                )
              ))}
            </div>
          </div>
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>© {new Date().getFullYear()} CTS BPO Solutions. All rights reserved.</p>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>POPIA Compliant · GDPR Aligned · Registered in South Africa</p>
          </div>
        </div>
      </section>
    </div>
  );
}
