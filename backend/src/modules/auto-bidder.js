'use strict';

/**
 * CTS BPO — Autonomous Platform Job Bidder (v2)
 *
 * 1. Scans all new platform_jobs
 * 2. Smart-classifies each job based on title + description (not just search query)
 * 3. Skips jobs CTS BPO cannot do (design, web dev, animation, etc.)
 * 4. Generates a tailored proposal for every BPO-eligible job
 * 5. If FREELANCER_TOKEN is set → auto-submits bid via Freelancer.com API (fully autonomous)
 * 6. If no token → sends admin a digest email with proposals to copy-paste
 */

const axios        = require('axios');
const db           = require('../db');
const emailOutreach = require('./email-outreach');

const ADMIN_EMAIL        = process.env.ADMIN_EMAIL        || 'cts.cybersolutions@gmail.com';
const APP_URL            = process.env.APP_URL            || 'https://cts-bpo.replit.app';
const FREELANCER_TOKEN   = process.env.FREELANCER_TOKEN   || '';

// ─────────────────────────────────────────────────────────────────────────────
// Keywords that disqualify a job — things CTS BPO CANNOT do
// ─────────────────────────────────────────────────────────────────────────────
const SKIP_KEYWORDS = [
  // Design
  'graphic design','logo design','logo designer','illustrat','photoshop','indesign',
  'figma','sketch app','adobe xd','ui/ux','ux design','ui design','web design',
  'website design','poster design','banner design','flyer design','brochure','infographic',
  'slide deck design','powerpoint design','presentation design','photo edit','photo retouching',
  'product photo','brand identity','brand design','visual identity','typography',
  // Development
  'web developer','web development','wordpress','woocommerce','shopify developer',
  'react developer','angular developer','vue developer','node developer','node.js developer',
  'mobile app','android app','ios app','flutter','react native','swift developer','kotlin',
  'python developer','django','laravel','php developer','ruby on rails','java developer',
  'software developer','software engineer','full stack','frontend developer','backend developer',
  'api developer','api integration developer','app development','website development',
  'website builder','landing page build','landing page develop','build a website',
  'build an app','create a website','create an app','develop a website','develop an app',
  // AI / ML
  'machine learning','ai model','deep learning','neural network','nlp model',
  'llm','gpt','chatbot develop','chatbot build','ai chatbot','ai agent build',
  'ai assistant build','train a model','fine.tun',
  // Server / IT
  'vps','server admin','server setup','server config','linux admin','devops',
  'hestia','cpanel','plesk','aws setup','cloud setup','docker','kubernetes',
  'database admin','dba ','sql developer','mysql setup','network admin',
  // Video / Animation
  'video edit','video production','animation','motion graphic','after effects',
  'premiere pro','3d model','autocad','solidworks','blender','unity','unreal',
  'video creat','youtube video','tiktok video','reels',
  // Writing / Content
  'copywriting','blog post','article writing','creative writing','ghostwrit',
  'content writing','seo writing','social media post','instagram post','tiktok post',
  'youtube channel','podcast','script writing','proofreading','academic writing',
  'essay writing','research paper','grant writing',
  // Other non-BPO
  'recruiter','hr manager','business development','sales rep','cold calling',
  'telemarketing','accounting software','tax return','tax prep',
  'astrology','tarot','horoscope',
  // E-commerce platform dev
  'shopify','woocommerce','magento','opencart','prestashop','bigcommerce',
  // CRM / ERP development
  'crm development','crm develop','zoho develop','zoho one','salesforce develop',
  'hubspot develop','erp develop','odoo',
  // Article / content creation
  'article creat','article writ','home decor article','write.*article','articles for',
  'blog creat','content creat',
  // Tutoring / teaching
  'tutor','tutoring','teaching','instructor','trainer','coaching','mentor',
  'online course','e-learning','elearning',
  // Sales / outreach roles
  'sales hunter','commission based','outreach executive','sales executive',
  'business partner','hr partner','partnership developer','cold email',
  'appointment setting','lead generation executive',
  // Mapping / surveying / specialized technical
  'lidar','mapping session','site survey','site verification field',
  'compliance report','engineering report','technical report',
  // Instagram / social lead gen
  'instagram lead','facebook lead','social media lead','lead gen.*instagram',
  'social media manager',
  // Miscellaneous non-BPO
  'nft','crypto','blockchain','defi','web3','dao ','smart contract',
  'seo audit','seo specialist','sem ','ppc ','google ads','facebook ads',
  'interior design','architecture','cad drawing','floor plan',
  // Game dev / entertainment
  'game develop','mobile game','simulation game','unity game','unreal game',
  'game design','game asset','game level','rpg game','puzzle game',
  // Video / promo creation (not moderation)
  'promo video','promotional video','explainer video','product video',
  'corporate video','intro video','outro video','video ad','video commercial',
  'whiteboard video','2d animation','3d animation','motion video',
  // Menu / restaurant design
  'menu design','restaurant menu','food menu','bakery menu','cafe menu',
  // Social media management / marketing
  'social media marketing','social media strateg','social media content',
  'instagram marketing','facebook marketing','tiktok marketing',
  'influencer','brand awareness','community manag',
  // Lead gen (sales role, not data collection)
  'lead generation executive','lead gen executive','b2b lead gen',
  'linkedin lead','linkedin outreach','sales lead','prospect list build',
  // Platform development
  'develop olx','develop platform','marketplace develop','ecommerce develop',
  'develop website','build website','create website','website from scratch',
  // Local / physical presence jobs (can't do remotely)
  'site verification','field verification','site visit','on-site','onsite',
  'physical inspection','local job','within 150km','photography on location',
  'in-person','in person visit',
  // Non-English language jobs
  'recherche','emploi','santé','français','francais','deutsch','español',
  'italiano','português','vietnamese','bahasa','arabic job','mandarin job',
  // Biography / creative / storytelling (not BPO)
  'biography','biograph','autobiography','memoir','life story',
  'ghostwrit','ghost writ','ghostwrite',
  'storytelling','narrative writing','personal story',
  // Regional Indian / Asian languages (creative/translation work we can't do)
  'kannada','telugu','marathi','gujarati','punjabi','bengali','tamil',
  'malayalam','odia','assamese','urdu translat','hindi translat',
  'arabic translat','arabic legal','arabic court',
  // Legal / certified translation (requires accreditation)
  'legal translat','certified translat','sworn translat','notariz',
  'court translat','official translat','legal document translat',
  // Academic / research writing
  'dissertation','thesis writing','research paper','academic paper',
  'literature review','term paper','assignment help','homework help',
  // Specialized writing
  'grant writing','press release','speech writing','cover letter writ',
  'resume writing','cv writing','linkedin profile writ',
];

// ─────────────────────────────────────────────────────────────────────────────
// Keywords that indicate a job CTS BPO CAN handle — plus which type
// ─────────────────────────────────────────────────────────────────────────────
const BPO_PATTERNS = [
  { type: 'transcription',       keywords: ['transcri','transcript','audio to text','video to text','dictation','subtitl','caption','srt','vtt'] },
  { type: 'translation',         keywords: ['translat','interpret','multilingual','locali','language pair'] },
  { type: 'data-entry',          keywords: ['data entry','data input','copy typing','spreadsheet','excel entry','form fill','database entry','data typing','data collection','web scraping','scraping','list building','copy paste','copy-paste','pdf to excel','pdf to word','image to text','ocr','digitize','digitise'] },
  { type: 'document-processing', keywords: ['document process','invoice process','invoice extract','pdf extract','document digitiz','document review','document index','contract review','form process','ocr processing'] },
  { type: 'virtual-assistant',   keywords: ['virtual assistant','va needed','va role','admin assistant','administrative assistant','personal assistant','executive assistant','email management','inbox management','calendar management','scheduling assistant','research assistant','online research','lead generation research'] },
  { type: 'customer-support',    keywords: ['customer support','customer service','help desk','helpdesk','ticket support','live chat support','email support','support agent','support rep'] },
  { type: 'finance-admin',       keywords: ['bookkeeping','bookkeeper','accounts payable','accounts receivable','bank reconcil','payroll','invoice entry','expense report','accounting data','xero','quickbooks data'] },
  { type: 'content-moderation',  keywords: ['content moderation','content review','content policy','trust and safety','user generated content','ugc review','moderat'] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Classify a job from its title + snippet — returns type or null if should skip
// ─────────────────────────────────────────────────────────────────────────────
function classifyJob(job) {
  const text = `${job.title || ''} ${job.snippet || ''}`.toLowerCase();

  // Hard skip if it matches anything we can't do
  for (const kw of SKIP_KEYWORDS) {
    if (text.includes(kw)) return null;
  }

  // Find best BPO match
  for (const { type, keywords } of BPO_PATTERNS) {
    if (keywords.some(kw => text.includes(kw))) return type;
  }

  // Only keep it as 'general' if the stored query type is a BPO type
  const BPO_TYPES = new Set(['data-entry','transcription','translation','virtual-assistant',
    'customer-support','document-processing','finance-admin','content-moderation']);
  if (BPO_TYPES.has(job.job_type)) return job.job_type;

  return null; // skip — unclear or not BPO
}

// ─────────────────────────────────────────────────────────────────────────────
// Value proposition rotation
// ─────────────────────────────────────────────────────────────────────────────
const VALUE_PROPS = [
  'AI-powered processing — results in hours, not days',
  '99%+ accuracy guaranteed on all deliverables',
  'Scalable: handle 10 or 10,000 records with equal speed',
  'Secure, GDPR-compliant document handling',
  'South Africa-based team: world-class quality at competitive rates',
  'No setup fees — pay only for completed, verified work',
  '24-hour turnaround available on urgent projects',
  'Dedicated account manager + real-time progress updates',
];
const pickProp = (id) => VALUE_PROPS[id % VALUE_PROPS.length];

// ─────────────────────────────────────────────────────────────────────────────
// Proposal templates — one per service type
// ─────────────────────────────────────────────────────────────────────────────
const PROPOSALS = {
  'data-entry': (job) => `Hi,

I came across your posting "${job.title}" and I can start on this immediately.

CTS BPO is an AI-powered data entry firm processing forms, spreadsheets, PDFs, and databases with 99%+ accuracy. We use Google Document AI for automatic extraction plus a human QC pass on every record.

What we offer:
• Automated data extraction and entry
• Quality-control pass on every record before delivery
• Secure file handling — NDA available on request
• Turnaround: 24–48 hours for standard volumes
• ${pickProp(job.id)}

We work on a per-record or per-project basis — no retainer required. Could you share an approximate record count or a sample file so I can send a precise quote?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
`.trim(),

  'transcription': (job) => `Hi,

Your transcription posting "${job.title}" is exactly what CTS BPO specialises in.

We use Google Cloud Speech-to-Text AI combined with human quality review for fast, accurate transcripts. We handle interviews, meetings, podcasts, legal depositions, medical dictation, and more.

What we deliver:
• Accuracy: 98–99%+ with timestamps and speaker labels on request
• Formats: Word, PDF, SRT/VTT captions — whatever you need
• Turnaround: 24–48 hours (rush options available)
• ${pickProp(job.id)}

Pricing from $0.90/audio minute. Happy to do a free trial on a short sample so you can evaluate quality before committing.

Would a free sample work for you?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
`.trim(),

  'translation': (job) => `Hi,

Your translation posting "${job.title}" is a strong match for what CTS BPO does.

We deliver professional document translation powered by Google Cloud Translation, reviewed by native-speaker editors. We cover 50+ language pairs including all major African, European, and Asian languages.

Our translation service:
• Speed: up to 10,000 words/day per language pair
• Native speaker review on every document
• Formats: Word, PDF, HTML, spreadsheets, and more
• ${pickProp(job.id)}

Happy to provide a free sample translation of 200–300 words so you can evaluate quality first. What language pair and approximate word count are you working with?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
`.trim(),

  'virtual-assistant': (job) => `Hi,

I noticed your virtual assistant posting "${job.title}" — this is exactly the kind of work CTS BPO handles.

We provide AI-assisted virtual admin services: email management, scheduling, research, data organisation, customer follow-ups, and general admin tasks handled by a professional team supported by AI tools.

What makes us different:
• AI does the heavy lifting — your VA focuses on high-value communication
• Faster response times than traditional VA services
• Available across time zones including outside standard business hours
• ${pickProp(job.id)}
• Full confidentiality — NDA signed before we start

We can start on a trial basis (10–20 hours) so you can evaluate fit before committing. What are the main tasks you need covered?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
`.trim(),

  'customer-support': (job) => `Hi,

Your customer support posting "${job.title}" is a great fit for CTS BPO.

We manage outsourced customer support — email, chat, and ticket-based support handled by trained agents backed by AI for instant answer suggestions and escalation routing.

Our offering:
• Email and chat support with < 2-hour response time during business hours
• AI-assisted responses for common queries — faster resolution
• Weekly reporting on tickets, resolution rates, and CSAT
• Scalable — ramp up or down based on your volume
• ${pickProp(job.id)}

Happy to discuss your ticket volume and SLA requirements. What platforms are you using (Zendesk, Freshdesk, email only)?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
`.trim(),

  'document-processing': (job) => `Hi,

Your posting "${job.title}" is a strong match for CTS BPO's document processing service.

We use Google Document AI to extract, validate, and organise data from invoices, contracts, forms, medical records, and any structured document — at high volume with minimal manual intervention.

Our service:
• AI extraction + human verification on every document
• Works with scanned PDFs, photos, and digital documents
• Output to your preferred format: Excel, database, API, or CSV
• ${pickProp(job.id)}

We can process a batch of sample documents for free so you can see the accuracy and speed firsthand. What type of documents and volume are you working with?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
`.trim(),

  'finance-admin': (job) => `Hi,

Your bookkeeping/finance posting "${job.title}" is something CTS BPO handles regularly for SMEs and startups.

We provide outsourced bookkeeping, accounts payable/receivable processing, payroll support, and financial data entry — using AI-assisted tools to ensure accuracy and speed.

Our finance admin service:
• Bank reconciliation, invoice processing, expense categorisation
• Payroll data entry and verification
• Monthly reports prepared and formatted to your requirements
• ${pickProp(job.id)}
• Fully confidential — NDA provided as standard

Happy to discuss your specific requirements and provide a competitive quote.

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
`.trim(),

  'content-moderation': (job) => `Hi,

Your content moderation posting "${job.title}" is exactly what CTS BPO specialises in.

We provide AI-assisted content moderation using Google Cloud Vision and Gemini AI to pre-screen content at high speed, with human reviewers handling edge cases and escalations.

Our service:
• High-volume screening: thousands of items per hour with AI pre-classification
• Categories: text, images, video thumbnails
• Policy enforcement workflows tailored to your platform rules
• Detailed audit logs for every decision
• ${pickProp(job.id)}

Would you like to discuss volume, categories, and SLA requirements?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
`.trim(),

  'general': (job) => `Hi,

I saw your posting "${job.title}" and wanted to reach out — CTS BPO is an AI-powered outsourcing firm that handles a wide range of business process tasks.

We specialise in data entry, transcription, translation, virtual assistance, document processing, customer support, and content moderation — all delivered fast and accurately using Google AI tools combined with professional human oversight.

Why CTS BPO:
• ${pickProp(job.id)}
• No long-term contracts required to start
• Flexible pricing: per-task, per-hour, or monthly retainer
• Dedicated point of contact for your account

What are the key requirements for this role?

Best regards,
Thandeka Mokoena
CTS BPO — AI-Powered Business Process Outsourcing
`.trim(),
};

const FL_PROPOSAL_MAX = 1480; // Freelancer hard limit is 1500 — leave 20 chars safety margin

function generateProposal(job, effectiveType) {
  const fn = PROPOSALS[effectiveType] || PROPOSALS['general'];
  let text = fn(job);
  // Hard cap — truncate at last full sentence before the limit
  if (text.length > FL_PROPOSAL_MAX) {
    text = text.substring(0, FL_PROPOSAL_MAX);
    // Cut back to the last sentence boundary
    const lastPeriod = Math.max(text.lastIndexOf('.'), text.lastIndexOf('?'), text.lastIndexOf('!'));
    if (lastPeriod > FL_PROPOSAL_MAX * 0.6) text = text.substring(0, lastPeriod + 1);
    else text = text.substring(0, FL_PROPOSAL_MAX).trimEnd();
  }
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency → USD conversion (approximate, updated monthly if needed)
// ─────────────────────────────────────────────────────────────────────────────
const CURRENCY_TO_USD = {
  '$': 1, 'USD': 1,
  '£': 1.27, 'GBP': 1.27,
  '€': 1.09, 'EUR': 1.09,
  '₹': 0.012, 'INR': 0.012,
  'A$': 0.65, 'AUD': 0.65,
  'C$': 0.74, 'CAD': 0.74,
  'R': 0.055, 'ZAR': 0.055,
  'S$': 0.74, 'SGD': 0.74,
};

function budgetToUSD(job) {
  const budget = job.budget || '';
  // Find currency symbol
  let rate = 1;
  for (const [sym, r] of Object.entries(CURRENCY_TO_USD)) {
    if (budget.startsWith(sym) || budget.includes(sym)) { rate = r; break; }
  }
  const max = parseFloat(job.budget_max);
  const min = parseFloat(job.budget_min);
  const val = (!isNaN(max) && max > 0) ? max : (!isNaN(min) && min > 0) ? min : 0;
  return Math.round(val * rate);
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculate bid amount in the project's NATIVE currency (not USD)
// The Freelancer API expects the amount in whatever currency the project uses
// ─────────────────────────────────────────────────────────────────────────────
function calcBidAmount(job) {
  const max = parseFloat(job.budget_max);
  const min = parseFloat(job.budget_min);

  // Use native currency value (do NOT convert to USD — API expects project currency)
  if (!isNaN(max) && max > 0) {
    return Math.round(max * 0.8); // bid at 80% of max in project currency
  }
  if (!isNaN(min) && min > 0) {
    return Math.round(min * 1.1); // bid slightly above min
  }
  // Default fallback in USD (for jobs with no budget info)
  return 50;
}

function deliveryDays(type) {
  const map = {
    'transcription': 2, 'data-entry': 3, 'document-processing': 3,
    'translation': 5, 'finance-admin': 7,
    'virtual-assistant': 30, 'customer-support': 30, 'content-moderation': 30,
  };
  return map[type] || 7;
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly bid counter — how many API bids submitted this calendar month
// ─────────────────────────────────────────────────────────────────────────────
async function countBidsThisMonth() {
  const { rows } = await db.query(`
    SELECT COUNT(*) as c FROM platform_jobs
    WHERE bid_method = 'api_submitted'
    AND bid_sent_at >= date_trunc('month', NOW())
  `);
  return parseInt(rows[0].c, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Submit top-N pending bids sorted by USD budget value (highest first)
// Respects FREELANCER_MONTHLY_BID_LIMIT env var (default 8 for free account)
// ─────────────────────────────────────────────────────────────────────────────
// Permanent error reasons — don't retry these jobs ever
const PERMANENT_ERRORS = [
  'deleted', 'awarded', 'closed', 'expired',
  'ProjectExceptionCodes.PROJECT_NOT_FOUND',
  'ProjectExceptionCodes.PROJECT_AWARDED',
  'ProjectExceptionCodes.PROJECT_CLOSED',
];

// Account restriction errors — skip job but don't mark permanently bad
const RESTRICTION_ERRORS = [
  'Verified by Freelancer', 'at least 5 reviews', 'Plus, Professional',
  'required skills', 'account balance', 'membership',
];

function classifyBidError(reason = '') {
  const r = reason.toLowerCase();
  if (PERMANENT_ERRORS.some(e => r.includes(e.toLowerCase()))) return 'expired';
  if (reason.includes('Verified by Freelancer') || reason.includes('Plus, Professional') || reason.includes('at least 5 reviews')) return 'needs_verification';
  if (reason.includes('required skills')) return 'needs_skills';
  if (reason.includes('account balance')) return 'needs_balance';
  return 'api_error';
}

async function submitPriorityBids() {
  if (!FREELANCER_TOKEN) return { submitted: 0, reason: 'no_token' };

  const MONTHLY_LIMIT = parseInt(process.env.FREELANCER_MONTHLY_BID_LIMIT || '8', 10);
  // Unverified accounts cannot bid on projects over $2,499
  const MAX_BUDGET_USD = parseInt(process.env.FREELANCER_MAX_BID_USD || '2499', 10);
  const usedThisMonth = await countBidsThisMonth();
  const slotsLeft = MONTHLY_LIMIT - usedThisMonth;

  if (slotsLeft <= 0) {
    console.log(`[PRIORITY-BID] Monthly limit reached (${usedThisMonth}/${MONTHLY_LIMIT}) — no slots left`);
    return { submitted: 0, reason: 'monthly_limit_reached', usedThisMonth, MONTHLY_LIMIT };
  }

  // Fetch a large pool of candidates — we'll try until we fill all slots
  const { rows: candidates } = await db.query(`
    SELECT * FROM platform_jobs
    WHERE status = 'bid_sent'
    AND bid_method = 'admin_notified'
    AND freelancer_project_id IS NOT NULL
    AND platform = 'Freelancer'
    ORDER BY created_at DESC
    LIMIT 500
  `);

  if (candidates.length === 0) return { submitted: 0, reason: 'no_candidates' };

  // Enrich with USD value, filter out jobs beyond our account capabilities
  const eligible = candidates
    .map(j => ({ ...j, usdValue: budgetToUSD(j) }))
    .filter(j => j.usdValue <= MAX_BUDGET_USD || j.usdValue === 0) // skip high-budget jobs
    .sort((a, b) => b.usdValue - a.usdValue); // highest value first

  console.log(`[PRIORITY-BID] ${slotsLeft} slots available, ${eligible.length} eligible candidates (budget ≤ $${MAX_BUDGET_USD})`);

  let submitted = 0;
  let attempted = 0;
  const results = [];

  for (const job of eligible) {
    if (submitted >= slotsLeft) break;
    attempted++;

    const effectiveType = job.effective_job_type || classifyJob(job) || 'general';
    const proposal = job.proposal_text || generateProposal(job, effectiveType);

    const result = await submitFreelancerBid(job, proposal, effectiveType);

    if (result.ok) {
      await db.query(
        `UPDATE platform_jobs SET bid_method='api_submitted', bid_amount=$1, freelancer_bid_id=$2, updated_at=NOW() WHERE id=$3`,
        [result.amount, result.bidId, job.id]
      );
      submitted++;
      results.push({ title: job.title, usdValue: job.usdValue, bidAmount: result.amount, status: 'submitted' });
      console.log(`✅ [PRIORITY-BID] Bid #${submitted} submitted — "${job.title}" $${result.amount}`);
    } else {
      const errorType = classifyBidError(result.reason);

      // Mark permanently closed/deleted jobs so we don't try again
      if (errorType === 'expired') {
        await db.query(
          `UPDATE platform_jobs SET status='expired', updated_at=NOW() WHERE id=$1`, [job.id]
        );
      } else if (errorType === 'needs_verification' || errorType === 'needs_skills') {
        await db.query(
          `UPDATE platform_jobs SET bid_method='ineligible', updated_at=NOW() WHERE id=$1`, [job.id]
        );
      }

      results.push({ title: job.title, usdValue: job.usdValue, status: 'failed', reason: result.reason, errorType });
      console.log(`⚠️ [PRIORITY-BID] Skipped "${job.title}" — ${errorType}: ${result.reason}`);
    }

    await new Promise(r => setTimeout(r, 2000)); // 2s between API calls
  }

  console.log(`✅ [PRIORITY-BID] Done — ${submitted} submitted, ${attempted - submitted} skipped (${usedThisMonth + submitted}/${MONTHLY_LIMIT} used this month)`);
  return { submitted, attempted, slotsLeft, results, usedThisMonth: usedThisMonth + submitted, MONTHLY_LIMIT };
}

// ─────────────────────────────────────────────────────────────────────────────
// Submit bid directly to Freelancer.com API
// ─────────────────────────────────────────────────────────────────────────────
// Cached freelancer user ID (fetched once per process)
let _freelancerUserId = null;
async function getFreelancerUserId() {
  if (_freelancerUserId) return _freelancerUserId;
  try {
    const res = await axios.get('https://www.freelancer.com/api/users/0.1/self/', {
      headers: { 'freelancer-oauth-v1': FREELANCER_TOKEN },
      timeout: 10000,
    });
    _freelancerUserId = res.data?.result?.id;
    console.log(`[AUTO-BID] Freelancer user ID resolved: ${_freelancerUserId}`);
  } catch (e) {
    console.warn(`[AUTO-BID] Could not resolve Freelancer user ID: ${e.message}`);
  }
  return _freelancerUserId;
}

async function submitFreelancerBid(job, proposal, effectiveType) {
  if (!FREELANCER_TOKEN) return { ok: false, reason: 'no_token' };
  if (!job.freelancer_project_id) return { ok: false, reason: 'no_project_id' };

  const amount = calcBidAmount(job);
  const period = deliveryDays(effectiveType);
  const bidderId = await getFreelancerUserId();
  if (!bidderId) return { ok: false, reason: 'could_not_resolve_bidder_id' };

  try {
    const res = await axios.post(
      'https://www.freelancer.com/api/projects/0.1/bids/',
      {
        project_id:           parseInt(job.freelancer_project_id, 10),
        bidder_id:            bidderId,
        amount:               amount,
        period:               period,
        description:          proposal,
        milestone_percentage: 100,
      },
      {
        headers: {
          'freelancer-oauth-v1': FREELANCER_TOKEN,
          'Content-Type':        'application/json',
        },
        timeout: 15000,
      }
    );

    if (res.data?.status === 'success') {
      const bidId = res.data?.result?.id;
      console.log(`✅ [AUTO-BID] Freelancer bid submitted — project ${job.freelancer_project_id}, bid ${bidId}, $${amount}, ${period}d`);
      return { ok: true, bidId, amount, period };
    }

    const errCode = res.data?.error_code || res.data?.message || 'unknown';
    console.warn(`[AUTO-BID] Freelancer bid rejected — project ${job.freelancer_project_id}: ${errCode}`);
    return { ok: false, reason: errCode };
  } catch (e) {
    const apiErr = e.response?.data?.message || e.response?.data?.error_code || e.message;
    console.warn(`[AUTO-BID] Freelancer API error — project ${job.freelancer_project_id}: ${apiErr}`);
    return { ok: false, reason: apiErr };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ensure DB schema is up to date
// ─────────────────────────────────────────────────────────────────────────────
async function ensureAutoBidColumns() {
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS proposal_text TEXT`);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS auto_bid BOOLEAN DEFAULT FALSE`);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS contact_email TEXT`);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS bid_method TEXT`);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS effective_job_type TEXT`);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS bid_amount NUMERIC`);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS freelancer_bid_id BIGINT`);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS freelancer_project_id BIGINT`);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS budget_min NUMERIC`);
  await db.query(`ALTER TABLE platform_jobs ADD COLUMN IF NOT EXISTS budget_max NUMERIC`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: process all new jobs and auto-bid
// ─────────────────────────────────────────────────────────────────────────────
async function autoBidNewJobs() {
  await ensureAutoBidColumns();

  const { rows: newJobs } = await db.query(
    `SELECT * FROM platform_jobs WHERE status = 'new' AND auto_bid IS NOT TRUE ORDER BY created_at DESC LIMIT 100`
  );

  if (newJobs.length === 0) return { processed: 0, submitted: 0, skipped: 0, notified: 0 };

  let processed = 0;
  let submitted = 0;  // auto-submitted to Freelancer API
  let skipped   = 0;  // cannot do
  const adminDigest = [];

  const hasToken = !!FREELANCER_TOKEN;

  for (const job of newJobs) {
    const effectiveType = classifyJob(job);

    if (!effectiveType) {
      // Job is outside CTS BPO capabilities — mark skipped
      await db.query(
        `UPDATE platform_jobs SET auto_bid=TRUE, status='skipped', bid_method='not_bpo', updated_at=NOW() WHERE id=$1`,
        [job.id]
      );
      skipped++;
      continue;
    }

    const proposal = generateProposal(job, effectiveType);

    let bidMethod = 'admin_notified';
    let bidAmount = null;
    let freelancerBidId = null;

    if (hasToken && job.platform === 'Freelancer' && job.freelancer_project_id) {
      // Auto-submit to Freelancer API
      const result = await submitFreelancerBid(job, proposal, effectiveType);
      if (result.ok) {
        bidMethod      = 'api_submitted';
        bidAmount      = result.amount;
        freelancerBidId = result.bidId;
        submitted++;
      } else {
        bidMethod = 'admin_notified'; // fallback to admin digest
        adminDigest.push({ job, proposal, effectiveType });
      }
      // Rate limit — 1.5s between bids
      await new Promise(r => setTimeout(r, 1500));
    } else {
      adminDigest.push({ job, proposal, effectiveType });
    }

    // Mark as processed
    await db.query(
      `UPDATE platform_jobs
       SET proposal_text=$1, auto_bid=TRUE, bid_method=$2, effective_job_type=$3,
           bid_amount=$4, freelancer_bid_id=$5,
           status='bid_sent', bid_sent_at=NOW(), updated_at=NOW()
       WHERE id=$6`,
      [proposal, bidMethod, effectiveType, bidAmount, freelancerBidId, job.id]
    );

    processed++;
  }

  // Send admin digest for jobs that need manual pasting
  if (adminDigest.length > 0) {
    await sendAdminDigest(adminDigest, hasToken);
  }

  console.log(`🤖 [AUTO-BID] Done — ${processed} processed, ${submitted} auto-submitted, ${skipped} skipped (not BPO), ${adminDigest.length} admin notifications`);
  return { processed, submitted, skipped, notified: adminDigest.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build HTML version of a plain-text proposal
// ─────────────────────────────────────────────────────────────────────────────
function proposalToHtml(text, job) {
  const lines = text.split('\n');
  const htmlLines = lines.map(line => {
    if (line.trim() === '') return '<br>';
    if (line.startsWith('• ')) return `<li style="margin:4px 0">${line.slice(2)}</li>`;
    return `<p style="margin:6px 0">${line}</p>`;
  });
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#1e293b;line-height:1.6">
      <div style="background:#1e3a5f;padding:16px 24px;border-radius:8px 8px 0 0">
        <span style="color:#fff;font-weight:900;font-size:18px">🤖 CTS BPO — Auto-Generated Proposal</span>
        <div style="color:#93c5fd;font-size:12px;margin-top:4px">Platform: ${job.platform} | Type: ${job.job_type} | Job: ${job.title}</div>
      </div>
      <div style="background:#f8fafc;padding:20px 24px;border:1px solid #e2e8f0;border-radius:0 0 8px 8px">
        <ul style="padding-left:20px">${htmlLines.join('\n')}</ul>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
          <a href="${job.job_url}" style="background:#6366f1;color:#fff;padding:8px 20px;border-radius:6px;text-decoration:none;font-weight:700;margin-right:10px">🔗 View Job Posting</a>
          <a href="${APP_URL}/ai-agent" style="background:#10b981;color:#fff;padding:8px 20px;border-radius:6px;text-decoration:none;font-weight:700">📊 Open Dashboard</a>
        </div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin digest email
// ─────────────────────────────────────────────────────────────────────────────
async function sendAdminDigest(items, hasToken) {
  if (items.length === 0) return;

  const APP_URL_LOCAL = process.env.APP_URL || 'https://cts-bpo.replit.app';

  const jobCards = items.map(({ job, proposal, effectiveType }) => {
    const amount = calcBidAmount(job);
    const canApiSubmit = hasToken && job.platform === 'Freelancer' && job.freelancer_project_id;
    return `
    <div style="background:#fff;border:2px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:900;font-size:15px;color:#1e293b">${job.title}</span>
        <span style="background:#6366f1;color:#fff;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700">${job.platform}</span>
      </div>
      ${job.budget ? `<div style="color:#059669;font-weight:700;font-size:13px;margin-bottom:6px">💵 Budget: ${job.budget}</div>` : ''}
      <div style="color:#6366f1;font-size:12px;margin-bottom:10px">🏷️ Service type detected: <strong>${effectiveType}</strong> | Suggested bid: <strong>$${amount}</strong></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <a href="${job.job_url}" style="background:#1e3a5f;color:#fff;padding:9px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">🔗 Open Job on ${job.platform}</a>
        <a href="${APP_URL_LOCAL}/api/platform-jobs/approve/${job.id}?token=admin2026" style="background:#059669;color:#fff;padding:9px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">✅ Mark Approved</a>
      </div>
      <div style="background:#f8fafc;border-left:4px solid #6366f1;padding:14px 16px;border-radius:0 8px 8px 0;font-size:13px;line-height:1.7;white-space:pre-wrap;font-family:monospace">${proposal}</div>
      <div style="margin-top:10px;font-size:12px;color:#64748b">${canApiSubmit ? '⚠️ API submit failed — please paste above into the bid box' : 'Copy the proposal above → paste into the bid box on ' + job.platform}</div>
    </div>`;
  }).join('');

  const tokenNote = hasToken
    ? `<div style="background:#dcfce7;border:1px solid #86efac;padding:12px 24px;font-size:13px;color:#15803d"><strong>✅ FREELANCER_TOKEN is set</strong> — jobs with a valid project ID are auto-submitted. The ${items.length} below needed manual fallback (API rejected or no project ID).</div>`
    : `<div style="background:#fef9c3;border:1px solid #fde047;padding:12px 24px;font-size:13px;color:#854d0e"><strong>⚠️ FREELANCER_TOKEN not set</strong> — bids cannot be auto-submitted. Add your token to enable fully autonomous bidding on all ${items.length} jobs below.</div>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:700px;color:#1e293b">
      <div style="background:linear-gradient(135deg,#1e3a5f,#0f5499);padding:20px 28px;border-radius:12px 12px 0 0">
        <div style="color:#fff;font-weight:900;font-size:20px">🎯 CTS BPO — ${items.length} New BPO Job${items.length > 1 ? 's' : ''} Found</div>
        <div style="color:#93c5fd;font-size:13px;margin-top:6px">AI scanned Freelancer.com &amp; PeoplePerHour — these are real BPO jobs that match CTS capabilities</div>
      </div>
      ${tokenNote}
      <div style="background:#fff3cd;padding:12px 28px;border:1px solid #fbbf24;border-left:4px solid #f59e0b;font-size:13px">
        <strong>How to bid:</strong> Click "Open Job" → paste the proposal text into the bid box → set the suggested bid amount → submit
      </div>
      <div style="padding:24px 0">${jobCards}</div>
      <div style="background:#f0fdf4;border:1px solid #86efac;padding:16px 28px;border-radius:8px;margin:0 0 16px;font-size:13px">
        <strong>📋 All jobs visible in your dashboard:</strong><br>
        <a href="${APP_URL_LOCAL}/ai-agent" style="color:#059669;font-weight:700">Open Dashboard → Platform Jobs tab</a>
      </div>
    </div>`;

  try {
    await emailOutreach.sendMail({
      to:      ADMIN_EMAIL,
      subject: `🤖 Auto-Bidder: ${items.length} BPO proposal${items.length > 1 ? 's' : ''} ready`,
      html,
      text: items.map(({ job, proposal }) => `JOB: ${job.title}\nURL: ${job.job_url}\n\n${proposal}\n\n${'─'.repeat(60)}\n`).join('\n'),
    });
    console.log(`📧 [AUTO-BID] Admin digest sent — ${items.length} proposals`);
  } catch (e) {
    console.warn(`[AUTO-BID] Admin digest failed: ${e.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = { autoBidNewJobs, classifyJob, generateProposal, ensureAutoBidColumns, submitPriorityBids, countBidsThisMonth, budgetToUSD };
