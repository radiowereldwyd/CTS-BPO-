/**
 * CTS BPO — Email Analytics & Auto-Improvement Engine
 *
 * Tracks per-email open and click events.
 * Aggregates performance per template variant.
 * Uses weighted random selection (exploration/exploitation) to auto-favour
 * variants with higher open + click rates.
 */

const db   = require('../db');
const { v4: uuidv4 } = require('uuid');

// Auto-detect the public URL — works in dev and production without manual config
const _rawAppUrl = process.env.APP_URL
  || (process.env.REPLIT_DOMAINS   ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`   : '')
  || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '');
const APP_URL = _rawAppUrl.replace(/\/$/, '');
if (APP_URL) console.log(`[EMAIL-ANALYTICS] Tracking URL base: ${APP_URL}`);

// ── Ensure DB tables ─────────────────────────────────────────────────────────
async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_tracking (
      id          SERIAL PRIMARY KEY,
      token       TEXT UNIQUE NOT NULL,
      email       TEXT,
      domain      TEXT,
      template    TEXT,
      variant_id  INTEGER,
      open_count  INTEGER DEFAULT 0,
      click_count INTEGER DEFAULT 0,
      opened_at   TIMESTAMPTZ,
      clicked_at  TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_et_token    ON email_tracking(token)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_et_template ON email_tracking(template, variant_id)`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS template_performance (
      id          SERIAL PRIMARY KEY,
      template    TEXT NOT NULL,
      variant_id  INTEGER NOT NULL,
      sent_count  INTEGER DEFAULT 0,
      open_count  INTEGER DEFAULT 0,
      click_count INTEGER DEFAULT 0,
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(template, variant_id)
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_tp_template ON template_performance(template)`);
}

// ── Generate a tracking token for one email send ─────────────────────────────
async function createTrackingToken({ email, domain, template, variantId }) {
  const token = uuidv4().replace(/-/g, '');
  try {
    await db.query(
      `INSERT INTO email_tracking (token, email, domain, template, variant_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (token) DO NOTHING`,
      [token, email || null, domain || null, template || null, variantId ?? null]
    );
    // Update sent count for this variant
    if (template != null) {
      await db.query(
        `INSERT INTO template_performance (template, variant_id, sent_count)
         VALUES ($1,$2,1)
         ON CONFLICT (template, variant_id)
         DO UPDATE SET sent_count = template_performance.sent_count + 1, updated_at = NOW()`,
        [template, variantId ?? 0]
      );
    }
  } catch { /* non-fatal — tracking is best-effort */ }
  return token;
}

// ── Record an open event ─────────────────────────────────────────────────────
async function recordOpen(token) {
  try {
    const res = await db.query(
      `UPDATE email_tracking
       SET open_count = open_count + 1,
           opened_at  = COALESCE(opened_at, NOW())
       WHERE token = $1
       RETURNING template, variant_id`,
      [token]
    );
    if (res.rows[0]?.template) {
      await db.query(
        `INSERT INTO template_performance (template, variant_id, open_count)
         VALUES ($1,$2,1)
         ON CONFLICT (template, variant_id)
         DO UPDATE SET open_count = template_performance.open_count + 1, updated_at = NOW()`,
        [res.rows[0].template, res.rows[0].variant_id ?? 0]
      );
    }
  } catch {}
}

// ── Record a click event ─────────────────────────────────────────────────────
async function recordClick(token) {
  try {
    const res = await db.query(
      `UPDATE email_tracking
       SET click_count = click_count + 1,
           clicked_at  = COALESCE(clicked_at, NOW())
       WHERE token = $1
       RETURNING template, variant_id`,
      [token]
    );
    if (res.rows[0]?.template) {
      await db.query(
        `INSERT INTO template_performance (template, variant_id, click_count)
         VALUES ($1,$2,1)
         ON CONFLICT (template, variant_id)
         DO UPDATE SET click_count = template_performance.click_count + 1, updated_at = NOW()`,
        [res.rows[0].template, res.rows[0].variant_id ?? 0]
      );
    }
  } catch {}
}

// ── Weighted variant selection (exploration + exploitation) ──────────────────
// Returns the index of the best variant to use based on accumulated performance.
// Untested variants (< 5 sends) get an exploration bonus so all variants get tried.
async function pickBestVariant(variants, template) {
  if (!variants || variants.length === 0) return 0;
  if (variants.length === 1) return 0;

  try {
    const res = await db.query(
      `SELECT variant_id, sent_count, open_count, click_count
       FROM template_performance
       WHERE template = $1
       ORDER BY variant_id ASC`,
      [template]
    );

    const perf = {};
    for (const r of res.rows) perf[r.variant_id] = r;

    // Calculate weight for each variant slot
    const weights = variants.map((_, i) => {
      const p = perf[i];
      if (!p || parseInt(p.sent_count) < 5) return 1.5; // exploration bonus

      const sent   = parseInt(p.sent_count) || 1;
      const opens  = parseInt(p.open_count)  || 0;
      const clicks = parseInt(p.click_count) || 0;

      // Laplace-smoothed rates: click weighted higher (stronger buying signal)
      const openRate  = (opens  + 0.5) / (sent + 1);
      const clickRate = (clicks + 0.5) / (sent + 1);
      return Math.max(0.05, openRate * 0.35 + clickRate * 0.65);
    });

    // Weighted random draw
    const total = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      rand -= weights[i];
      if (rand <= 0) return i;
    }
    return weights.length - 1;

  } catch {
    return Math.floor(Math.random() * variants.length); // fallback: pure random
  }
}

// ── Build tracking URLs ──────────────────────────────────────────────────────
function openPixelUrl(token) {
  if (!APP_URL || !token) return '';
  return `${APP_URL}/t/o/${token}`;
}

function trackClickUrl(token, targetUrl) {
  if (!APP_URL || !token) return targetUrl || REPLY_EMAIL_FALLBACK;
  return `${APP_URL}/t/c/${token}?u=${encodeURIComponent(targetUrl || '')}`;
}

const REPLY_EMAIL_FALLBACK = 'mailto:cts.cybersolutions@gmail.com';

// ── Performance summary for the dashboard ───────────────────────────────────
async function getPerformanceSummary() {
  try {
    const [variants, summary, recent] = await Promise.all([
      db.query(`
        SELECT
          template, variant_id, sent_count, open_count, click_count,
          CASE WHEN sent_count > 0
               THEN ROUND(open_count::numeric / sent_count * 100, 1)
               ELSE 0 END AS open_rate,
          CASE WHEN sent_count > 0
               THEN ROUND(click_count::numeric / sent_count * 100, 1)
               ELSE 0 END AS click_rate,
          updated_at
        FROM template_performance
        ORDER BY template, variant_id
      `),
      db.query(`
        SELECT
          COUNT(*)                                          AS total_sent,
          COUNT(*) FILTER (WHERE open_count  > 0)          AS total_opened,
          COUNT(*) FILTER (WHERE click_count > 0)          AS total_clicked,
          ROUND(COUNT(*) FILTER (WHERE open_count  > 0)::numeric
                / NULLIF(COUNT(*), 0) * 100, 1)            AS overall_open_rate,
          ROUND(COUNT(*) FILTER (WHERE click_count > 0)::numeric
                / NULLIF(COUNT(*), 0) * 100, 1)            AS overall_click_rate,
          MAX(opened_at)                                    AS last_open,
          MAX(clicked_at)                                   AS last_click,
          MAX(created_at)                                   AS last_sent
        FROM email_tracking
      `),
      db.query(`
        SELECT token, email, template, variant_id,
               open_count, click_count, opened_at, clicked_at, created_at
        FROM email_tracking
        ORDER BY created_at DESC
        LIMIT 50
      `),
    ]);
    return {
      variants: variants.rows,
      summary:  summary.rows[0] || {},
      recent:   recent.rows,
    };
  } catch (err) {
    return { variants: [], summary: {}, recent: [], error: err.message };
  }
}

module.exports = {
  ensureTables,
  createTrackingToken,
  recordOpen,
  recordClick,
  pickBestVariant,
  getPerformanceSummary,
  openPixelUrl,
  trackClickUrl,
};
