/**
 * Ad Creatives — Free worldwide advertising content
 * Google, TikTok, Instagram, Facebook, Reddit, YouTube — all free
 */
import React, { useState } from 'react';

const S = {
  page:   { padding: '32px 40px', maxWidth: 1100, margin: '0 auto' },
  h1:     { margin: '0 0 4px', color: '#0f172a', fontSize: 26, fontWeight: 900 },
  sub:    { color: '#64748b', fontSize: 14, margin: '0 0 28px' },
  card:   { background: '#fff', borderRadius: 12, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 20 },
  tab:    (a) => ({ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: a ? '#6366f1' : '#64748b', borderBottom: a ? '3px solid #6366f1' : '3px solid transparent', marginBottom: -2, borderRadius: '4px 4px 0 0' }),
  copy:   { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px', marginBottom: 12, position: 'relative', fontFamily: 'inherit' },
  badge:  (c) => ({ display: 'inline-block', background: c + '15', color: c, fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }),
  tip:    { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#166534', marginBottom: 16 },
  warn:   { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#92400e', marginBottom: 16 },
  h3:     { margin: '0 0 16px', color: '#0f172a', fontSize: 16, fontWeight: 800 },
  label:  { fontSize: 12, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'block' },
  pre:    { margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, color: '#1e293b', lineHeight: 1.75, fontFamily: 'inherit' },
};

function CopyBlock({ label, text, note }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <div style={S.copy}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={S.label}>{label}</span>
        <button onClick={copy} style={{ padding: '4px 14px', background: copied ? '#10b981' : '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
      <pre style={S.pre}>{text}</pre>
      {note && <p style={{ margin: '10px 0 0', fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{note}</p>}
    </div>
  );
}

const TABS = [
  { key: 'google',    label: '🔍 Google' },
  { key: 'tiktok',   label: '🎵 TikTok' },
  { key: 'instagram', label: '📸 Instagram' },
  { key: 'facebook',  label: '👥 Facebook' },
  { key: 'reddit',    label: '🤖 Reddit' },
  { key: 'youtube',   label: '▶ YouTube' },
  { key: 'seo',       label: '📈 SEO / Blog' },
];

export default function AdCreatives() {
  const [tab, setTab] = useState('google');

  return (
    <div style={S.page}>
      <h1 style={S.h1}>📣 Free Worldwide Ad Creatives</h1>
      <p style={S.sub}>Ready-to-use copy for every free platform. Paste, post and go — no ad spend required.</p>

      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e2e8f0', marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map(t => <button key={t.key} style={S.tab(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {/* ── GOOGLE ── */}
      {tab === 'google' && (
        <div>
          <div style={S.tip}>
            <strong>Free Google strategy:</strong> Google My Business (free listing), Google Search Console (free SEO), and posting on Google Business Profile (like a mini social feed). No ad spend needed.
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>📍 Google My Business Description</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>Go to business.google.com → Edit profile → Business description. This appears in Google Search results worldwide.</p>
            <CopyBlock label="Business Description (750 chars max)" text={`CTS BPO Solutions is a worldwide business process outsourcing company delivering high-accuracy back-office services to businesses across every industry and timezone.

We specialise in data entry, transcription, translation (50+ languages), virtual assistant support, customer support, document processing, content moderation, and finance & admin services.

Powered by AI-assisted quality control, we maintain a 98.6% accuracy rate with 24–48 hour turnaround on most projects. Every contract is covered by a full NDA and confidentiality agreement.

Whether you need a once-off trial project or an ongoing outsourcing partner, we deliver precision, speed and value — on time, every time.

Contact us for a free quote: cts.bposolutions@gmail.com`} />
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>📝 Google Business Profile Posts</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>Post these weekly on your Google Business Profile — they appear in Google Search and Maps results. Go to business.google.com → Add update.</p>
            <CopyBlock label="Post 1 — Service Introduction" text={`📊 Is your team drowning in data entry?

We process thousands of records daily — accurately, quickly, and confidentially.

✅ 98.6% accuracy rate
✅ 24–48 hour turnaround
✅ Full NDA on every project
✅ Serving clients worldwide

Get a free quote today 👇
cts.bposolutions@gmail.com | +27 76 067 9100`} />
            <CopyBlock label="Post 2 — Transcription" text={`🎙️ Audio to text, done professionally.

Our transcription team handles:
• Board meetings & interviews
• Medical & legal dictation
• Podcasts & video content
• 50+ languages supported

Verbatim or edited. Fast turnaround. Competitive rates.

📧 cts.bposolutions@gmail.com for a free sample project.`} />
            <CopyBlock label="Post 3 — Cost Saving" text={`💡 Did you know outsourcing back-office work saves most businesses 40–70% vs in-house staff?

At CTS BPO Solutions, we handle:
📌 Data entry & capture
📌 Document processing
📌 Virtual assistant tasks
📌 Customer support
📌 Translation & transcription

No retainer lock-in. Pay per project. Worldwide service.

Try us with a FREE sample project → cts.bposolutions@gmail.com`} />
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>🔍 Google Search Keywords to Target (SEO — free)</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>Add these terms naturally to your website content, Google Business description, and blog posts to rank in search results without paying for ads.</p>
            <CopyBlock label="High-Value Search Keywords" text={`BPO services worldwide
outsource data entry online
affordable transcription services
virtual assistant outsourcing
document processing company
outsource back office work
cheap BPO company
data entry company South Africa
online transcription service
outsource admin tasks
BPO company for small business
remote data processing services
outsource customer support
translation services online
business process outsourcing company`} note="Use these in your website headings, paragraphs and page titles." />
          </div>
        </div>
      )}

      {/* ── TIKTOK ── */}
      {tab === 'tiktok' && (
        <div>
          <div style={S.tip}>
            <strong>Free TikTok strategy:</strong> Post 1–2 videos per day. TikTok's algorithm pushes business content to relevant audiences worldwide — you don't need followers to go viral. Film on your phone, keep it under 30 seconds.
          </div>
          <div style={S.warn}>
            <strong>Setup:</strong> Create a TikTok Business account at tiktok.com/business (free). Use your real face — personal brands outperform faceless accounts 3:1 on TikTok.
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>🎬 TikTok Video Scripts</h3>
            <CopyBlock
              label="Script 1 — Hook: 'Stop hiring full-time staff' (15 sec)"
              text={`[Point camera at yourself — energetic tone]

"Stop hiring full-time staff for tasks you only need done occasionally.

Data entry. Transcription. Virtual assistants. Document processing.

We do it for a fraction of the cost — with a 98% accuracy guarantee.

CTS BPO Solutions. Worldwide. Link in bio."

[End with logo or contact details on screen]`}
              note="Film this at your desk or standing. No fancy equipment needed — phone camera is fine."
            />
            <CopyBlock
              label="Script 2 — Problem/Solution (20 sec)"
              text={`[Start with a frustrated face]

"You know that pile of invoices you've been meaning to capture for three weeks?"

[Pause — smile]

"Yeah, we can have that done by tomorrow morning."

CTS BPO Solutions handles data entry, transcription and admin work for businesses worldwide.

You send the files. We send back accurate, formatted results — fast.

Free quote: link in bio."

[Show website URL]`}
            />
            <CopyBlock
              label="Script 3 — Testimonial Style (25 sec)"
              text={`[Conversational, looking at camera]

"A client sent us 3,000 handwritten forms last week. 

They needed them captured into Excel — accurately — within 48 hours.

We delivered 2,987 records in 36 hours with a 99.1% accuracy rate.

They paid less than what one day of an in-house employee would cost.

That's what we do at CTS BPO.

If your business has back-office work that's piling up — come talk to us.

Link in bio. Free quote. No commitment."`}
            />
            <CopyBlock
              label="Script 4 — 'Did you know' (15 sec)"
              text={`[Fast-paced, energetic]

"Did you know most businesses spend 20% of their time on tasks that could be outsourced for under $5 an hour?

Data entry. Admin. Transcription. Translation.

We handle it — so you can focus on growing your business.

CTS BPO Solutions. Worldwide. Free quote in bio."`}
            />
            <CopyBlock
              label="Caption + Hashtags (use on all TikTok posts)"
              text={`Outsource smarter, not harder 💼 Free quote in bio → cts.bposolutions@gmail.com

#BPO #Outsourcing #DataEntry #SmallBusiness #WorkFromHome #VirtualAssistant #Transcription #BusinessTips #Entrepreneur #RemoteWork #BusinessOwner #AdminSupport #Productivity #StartupTips #OutsourceYourBusiness`}
            />
          </div>
        </div>
      )}

      {/* ── INSTAGRAM ── */}
      {tab === 'instagram' && (
        <div>
          <div style={S.tip}>
            <strong>Free Instagram strategy:</strong> Post 4–5 times per week. Use Reels for maximum reach (same scripts as TikTok). Carousel posts (swipe posts) get the best engagement for B2B content. Stories daily.
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>📸 Instagram Feed Posts (Captions)</h3>
            <CopyBlock
              label="Post 1 — Service Overview"
              text={`Your back office doesn't have to slow you down. 📊

At CTS BPO Solutions, we take on the tasks your team doesn't have time for:

📌 Data entry & capture
📌 Transcription (audio → text)
📌 Translation — 50+ languages
📌 Virtual assistant support
📌 Document processing
📌 Customer support
📌 Content moderation

98.6% accuracy. 24–48hr turnaround. Full NDA. Worldwide service.

Whether you're a startup or an enterprise — we scale with you.

💬 DM us or email: cts.bposolutions@gmail.com
🔗 Free quote: link in bio

.
.
.
#BPO #Outsourcing #DataEntry #VirtualAssistant #SmallBusiness #Entrepreneur #BusinessGrowth #Transcription #RemoteWork #AdminSupport`}
            />
            <CopyBlock
              label="Post 2 — Cost Saving Hook"
              text={`Hiring a full-time data entry clerk costs R15,000–R25,000/month in South Africa. 💸

Outsourcing the same work to CTS BPO?

A fraction of that. No benefits. No sick leave. No training.

Just accurate, fast work — delivered to your inbox.

✅ Pay per project (no retainer)
✅ 24hr turnaround available
✅ 98.6% accuracy guarantee
✅ Used by businesses across 4 continents

📧 cts.bposolutions@gmail.com | Free quote, no commitment.

#CostSaving #BusinessTips #Outsourcing #BPO #DataEntry #SmallBusinessOwner #Entrepreneur`}
            />
            <CopyBlock
              label="Post 3 — Transcription Focus"
              text={`🎙️ Every important conversation deserves to be documented.

Board meetings. Client calls. Interviews. Medical consultations. Legal proceedings. Podcasts.

We turn audio and video into accurate, formatted transcripts — in any language.

⚡ Same-day turnaround available
🌍 50+ languages
📋 Verbatim or edited format
🔒 Confidential — NDA on every project

DM us with your audio file for a free sample.

#Transcription #AudioToText #LegalTranscription #MedicalTranscription #PodcastTranscription #BusinessSupport`}
            />
            <CopyBlock
              label="Instagram Story Text (5 slides)"
              text={`SLIDE 1:
"Is your admin work piling up? 🗂️"

SLIDE 2:
"We handle it for you.
Data entry. Transcription. 
Virtual assistants. Translation."

SLIDE 3:
"✅ 98.6% accuracy
✅ 24hr turnaround
✅ Worldwide clients
✅ Full NDA"

SLIDE 4:
"Free quote — no commitment
cts.bposolutions@gmail.com"

SLIDE 5:
[Add poll sticker]
"Is back-office work slowing you down?"
YES 😩 / NO 💪"`}
            />
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>📐 Instagram Bio (160 chars max)</h3>
            <CopyBlock
              label="Bio Option 1"
              text={`🌍 Worldwide BPO Services
📊 Data Entry | Transcription | VA | Translation
✅ 98.6% accuracy | 24hr turnaround
📧 Free quote ↓`}
            />
            <CopyBlock
              label="Bio Option 2"
              text={`Outsource your back office 💼
Data entry · Transcription · Virtual assistants
Serving clients worldwide 🌍
👇 Free quote — no commitment`}
            />
          </div>
        </div>
      )}

      {/* ── FACEBOOK ── */}
      {tab === 'facebook' && (
        <div>
          <div style={S.tip}>
            <strong>Free Facebook strategy:</strong> Post on your business page AND share in relevant groups. Groups are the highest-engagement free channel on Facebook. Target: business owner groups, entrepreneur groups, startup groups worldwide.
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>👥 Facebook Groups to Post In (Free)</h3>
            <CopyBlock
              label="Search these group types on Facebook"
              text={`"Small Business Owners" (worldwide — millions of members)
"Entrepreneur Network"
"Online Business Owners"
"Startup Founders"
"Virtual Assistant Jobs"
"Remote Work Opportunities"
"Business Outsourcing"
"UK Small Business Owners"
"USA Small Business Network"
"Australian Business Owners"
"Canada Small Business"
"South African Business Network"
"African Entrepreneurs"`}
              note="Join 10–15 groups. Post 2–3 times per week in each. Don't spam — add value, then mention your service."
            />
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>📝 Facebook Post Copy</h3>
            <CopyBlock
              label="Group Post 1 — Problem/Solution"
              text={`Question for business owners: How much time does your team spend on manual data entry, transcription or admin work every week?

For most businesses we speak to, it's 10–20 hours per week — work that pulls skilled people away from higher-value tasks.

We run a BPO (business process outsourcing) company that handles exactly this kind of work for businesses worldwide:

✅ Data entry & capture
✅ Transcription (audio/video to text)
✅ Translation — 50+ languages
✅ Virtual assistant support
✅ Document processing & digitisation
✅ Customer support

Our clients typically save 40–70% compared to hiring in-house, with a 98.6% accuracy rate and 24–48hr turnaround.

If this sounds useful, drop a comment or send me a message — happy to send a free quote with no obligation.

📧 cts.bposolutions@gmail.com`}
            />
            <CopyBlock
              label="Group Post 2 — Offer a Free Trial"
              text={`🎁 FREE TRIAL — No catch.

I run a business process outsourcing company (CTS BPO Solutions) and we're offering free sample projects to new clients this month.

Here's how it works:
→ You send us a small sample of your work (10–20 pages of data entry, 5–10 minutes of audio to transcribe, a document to process)
→ We do it — fast and accurately — at no cost
→ If you're happy with the quality, we quote you for the full project

No payment upfront. No commitment. Just proof that we can deliver.

We work with businesses in every industry, anywhere in the world.

DM me or email: cts.bposolutions@gmail.com

What kind of back-office work does your business need help with? 👇`}
            />
            <CopyBlock
              label="Facebook Page About Section"
              text={`CTS BPO Solutions is a worldwide business process outsourcing company providing high-accuracy, cost-effective back-office services to businesses of all sizes.

Services: Data entry & capture | Transcription | Translation (50+ languages) | Virtual assistant support | Document processing | Customer support | Content moderation | Social media management | Finance & admin support | Reporting & analytics

Why clients choose us:
• 98.6% quality success rate
• 24–48 hour standard turnaround
• Full NDA on every contract
• POPIA & GDPR compliant
• Pay per project — no retainer required
• Trial projects available for new clients

Contact: cts.bposolutions@gmail.com | +27 76 067 9100
Website: cts-bpo.replit.app`}
            />
          </div>
        </div>
      )}

      {/* ── REDDIT ── */}
      {tab === 'reddit' && (
        <div>
          <div style={S.tip}>
            <strong>Free Reddit strategy:</strong> Reddit has millions of business owners and decision-makers. Don't advertise directly — add genuine value in conversations, then mention your service naturally. The subreddits below reach a worldwide audience.
          </div>
          <div style={S.warn}>
            <strong>Important:</strong> Reddit bans pure self-promotion. Spend a week commenting and helping others first. Then post your service thread. Always disclose you're the owner.
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>🎯 Subreddits to Target</h3>
            <CopyBlock
              label="Best subreddits for BPO clients"
              text={`r/smallbusiness (1.2M members)
r/Entrepreneur (3M members)
r/startups (1.5M members)
r/freelance (300K members)
r/businessowners (200K members)
r/remotework (500K members)
r/outsourcing (15K members)
r/VirtualAssistant (45K members)
r/DataEntry (8K members)
r/transcription (25K members)
r/legal (for legal transcription)
r/Accounting (for finance/admin support)`}
            />
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>📝 Reddit Post Templates</h3>
            <CopyBlock
              label="r/smallbusiness — Introductory Post"
              text={`Title: I run a BPO company — happy to answer any questions about outsourcing back-office work

Hey r/smallbusiness,

I'm the founder of CTS BPO Solutions, a business process outsourcing company serving clients worldwide.

We handle data entry, transcription, translation, virtual assistant work, document processing, and customer support — basically anything repetitive and time-consuming that pulls business owners away from growth.

I see a lot of posts here about being overwhelmed with admin work, so I thought I'd offer to answer questions about outsourcing — whether you use us or not.

Common questions I can answer:
- What work makes sense to outsource vs. keep in-house?
- How do you vet an outsourcing company?
- What does BPO actually cost?
- How do you handle confidentiality?

If you're curious about our services specifically: cts.bposolutions@gmail.com

Happy to help either way. Ask anything 👇`}
              note="Genuine, helpful post. Don't lead with prices. Let people ask."
            />
            <CopyBlock
              label="r/outsourcing — Service Post"
              text={`Title: [For Hire] BPO services worldwide — data entry, transcription, translation, VA support | Free trial available

Hi r/outsourcing,

I'm the owner of CTS BPO Solutions. We provide business process outsourcing services to companies worldwide.

What we do:
• Data entry & capture (any format, any volume)
• Audio/video transcription (50+ languages)
• Translation (50+ language pairs)
• Virtual assistant support
• Document processing & digitisation
• Customer support (email/chat)
• Content moderation
• Finance & admin support

Our rates:
• Data entry: from $0.50–$1.50 per page
• Transcription: from $0.75–$1.50 per audio minute
• Translation: from $0.05 per word
• VA support: from $5/hour
• Custom quotes for volume projects

Why us:
✅ 98.6% accuracy rate
✅ 24–48hr standard turnaround
✅ Full NDA on every contract
✅ Free trial project for new clients

Proof of work available on request. DM or email: cts.bposolutions@gmail.com`}
            />
          </div>
        </div>
      )}

      {/* ── YOUTUBE ── */}
      {tab === 'youtube' && (
        <div>
          <div style={S.tip}>
            <strong>Free YouTube strategy:</strong> YouTube is the world's second-largest search engine. Short explainer videos (2–5 min) rank in Google search results. One good video can bring in leads for years — completely free.
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>🎬 YouTube Video Ideas & Scripts</h3>
            <CopyBlock
              label="Video 1 — 'What is BPO?' (2–3 min explainer)"
              text={`TITLE: What is BPO? (And Why Your Business Needs It)

THUMBNAIL TEXT: "Save 70% on admin costs"

SCRIPT:

[Intro — 0:00–0:20]
"If your business spends hours every week on data entry, transcription, or admin tasks — this video is for you.

I'm Thomas from CTS BPO Solutions, and I'm going to explain what business process outsourcing is, and why thousands of companies worldwide use it to cut costs and grow faster."

[What is BPO — 0:20–1:00]
"BPO stands for Business Process Outsourcing. It simply means hiring a specialist company to handle specific tasks for your business — instead of doing them in-house.

Think of it like this: you wouldn't cut your own hair or fix your own plumbing. You hire a specialist. BPO is the same idea — but for your back-office work."

[What we handle — 1:00–1:40]
"At CTS BPO Solutions, we specialise in:
- Data entry and capture
- Audio and video transcription
- Translation across 50+ languages
- Virtual assistant tasks
- Document processing
- And customer support

These are the tasks that eat up your team's time every single week."

[Why outsource — 1:40–2:20]
"Why do businesses outsource instead of hiring?

Three reasons: cost, speed, and quality.

Cost: outsourcing is typically 40–70% cheaper than a full-time employee when you factor in salary, benefits, equipment and management time.

Speed: we have teams ready to start immediately — no recruitment, no onboarding.

Quality: we maintain a 98.6% accuracy rate, backed by AI-assisted quality checks."

[CTA — 2:20–2:40]
"If you'd like to try us, we offer a free sample project — send us a small piece of work and we'll complete it at no charge so you can see the quality before committing.

Email us at cts.bposolutions@gmail.com or click the link in the description.

If this was helpful, subscribe for more business tips — and drop your questions in the comments below."`}
            />
            <CopyBlock
              label="YouTube Description Template (use on all videos)"
              text={`CTS BPO Solutions — Worldwide Business Process Outsourcing

Services:
✅ Data Entry & Capture
✅ Transcription (Audio/Video to Text)
✅ Translation — 50+ Languages
✅ Virtual Assistant Support
✅ Document Processing
✅ Customer Support
✅ Content Moderation
✅ Finance & Admin Support

Why CTS BPO:
• 98.6% accuracy rate
• 24–48 hour turnaround
• Full NDA on every project
• Free trial project for new clients
• Serving businesses worldwide

📧 Get a free quote: cts.bposolutions@gmail.com
💬 WhatsApp: +27 76 067 9100
🌐 Website: https://cts-bpo.replit.app

#BPO #Outsourcing #DataEntry #Transcription #VirtualAssistant #BusinessTips #SmallBusiness`}
            />
          </div>
        </div>
      )}

      {/* ── SEO / BLOG ── */}
      {tab === 'seo' && (
        <div>
          <div style={S.tip}>
            <strong>Free SEO strategy:</strong> Blog posts on your website rank in Google search and bring in organic leads indefinitely — for free. Post one article per week. Each article targets a specific search term your potential clients type into Google.
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>✍️ Blog Post Titles to Write (SEO-Optimised)</h3>
            <CopyBlock
              label="10 Blog Post Topics That Will Rank"
              text={`1. "How Much Does Data Entry Outsourcing Cost in 2026?" (high search volume)
2. "5 Signs Your Business Should Outsource Its Back Office"
3. "Transcription Services: In-House vs Outsourced — Which Saves More?"
4. "What to Look for in a BPO Company (10-Point Checklist)"
5. "How to Outsource Data Entry Without Losing Quality"
6. "The True Cost of In-House Admin Staff vs Outsourcing"
7. "BPO for Small Businesses: Is It Worth It?"
8. "How AI Is Improving BPO Accuracy Rates in 2026"
9. "Legal Transcription Services: What Law Firms Need to Know"
10. "How to Outsource Translation Without Sacrificing Quality"`}
              note="Write 600–1,000 words per post. Include your keyword in the title, first paragraph, and 2–3 times throughout."
            />
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>📄 Full Blog Post — Ready to Publish</h3>
            <CopyBlock
              label="Blog Post: '5 Signs Your Business Should Outsource Its Back Office'"
              text={`5 Signs Your Business Should Outsource Its Back Office

If you're reading this, there's a good chance you already know something isn't working in your back-office operations. Here are five clear signs it's time to outsource.

1. Your team is doing work they weren't hired to do

When your marketing manager is manually entering data into spreadsheets, or your sales team is transcribing their own call recordings, you're paying premium salaries for basic tasks. Outsourcing back-office work frees your skilled staff to focus on what they're actually good at.

2. You're always behind on administrative tasks

If your inbox has a backlog of documents to process, invoices to capture or recordings to transcribe — and that backlog keeps growing — it's a sign that your internal capacity isn't matching your volume. A BPO company can clear the backlog fast and maintain the pace going forward.

3. You've considered hiring but can't justify the cost

Hiring a full-time data entry clerk or admin assistant costs R15,000–R25,000 per month in South Africa (or $30,000–$50,000 annually in the US/UK) when you factor in salary, benefits, equipment and management time. Outsourcing the same work typically costs 40–70% less — with no recruitment, no training, and no employment risk.

4. Quality is inconsistent

Internal staff get tired, distracted and make mistakes — especially on repetitive tasks. A professional BPO company uses AI-assisted quality checks and specialist teams trained specifically for data processing work, resulting in consistently higher accuracy (our benchmark is 98.6%).

5. You need capacity you don't have

Your business just landed a large contract, a seasonal rush is coming, or you need to scale output quickly without hiring. BPO companies have ready-to-go teams that can start immediately and scale up or down as your volume changes.

---

At CTS BPO Solutions, we work with businesses worldwide on data entry, transcription, translation, virtual assistant support, document processing and more.

We offer a free sample project for new clients — no commitment required.

📧 cts.bposolutions@gmail.com | +27 76 067 9100`}
            />
          </div>

          <div style={S.card}>
            <h3 style={S.h3}>🌐 Free Listing Sites (Submit Your Business)</h3>
            <CopyBlock
              label="Free directories to list CTS BPO on"
              text={`GLOBAL:
• Google My Business (business.google.com) ← most important
• Yelp for Business (biz.yelp.com)
• Trustpilot (free basic listing)
• Clutch.co (BPO/outsourcing directory — very high traffic)
• GoodFirms.co (IT & BPO directory)
• UpCity.com
• Bark.com (clients post jobs, you bid — free credits to start)
• Fiverr (list your services — worldwide clients)
• Upwork (list your agency)
• PeoplePerHour.com

SOUTH AFRICA:
• Cylex.co.za
• Brabys.com
• BusinessDirectory.co.za
• SouthAfrica.co.za business listing
• Hotfrog.co.za`}
              note="Clutch.co and GoodFirms.co are specifically for BPO/outsourcing companies and are used by procurement teams worldwide. These are worth prioritising."
            />
          </div>
        </div>
      )}
    </div>
  );
}
