/**
 * SerpAPI Monthly Budget Guard
 * Shared between autonomous-agent.js and web-scraper.js.
 * Caps monthly SerpAPI queries to prevent runaway billing.
 * Default cap: 800 queries/month (safe for Hobby plan at $50/month).
 * Override via env: SERPAPI_MONTHLY_CAP=1000
 */
const fs   = require('fs');
const path = require('path');

const BUDGET_FILE      = path.join(__dirname, '../../data/serpapi-budget.json');
const MONTHLY_CAP      = parseInt(process.env.SERPAPI_MONTHLY_CAP || '800', 10);

let _count = 0;
let _month = '';

function _thisMonth() { return new Date().toISOString().slice(0, 7); }

function _load() {
  try {
    if (fs.existsSync(BUDGET_FILE)) {
      const d = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
      if (d.month === _thisMonth()) {
        _count = d.count || 0;
        _month = d.month;
        return;
      }
    }
  } catch {}
  _count = 0;
  _month = _thisMonth();
  _save();
}

function _save() {
  try {
    const dir = path.dirname(BUDGET_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(BUDGET_FILE, JSON.stringify({ month: _month, count: _count }));
  } catch {}
}

function _ensureCurrentMonth() {
  const m = _thisMonth();
  if (_month !== m) {
    _count = 0;
    _month = m;
    _save();
  }
}

_load();

module.exports = {
  isOverBudget() {
    _ensureCurrentMonth();
    return _count >= MONTHLY_CAP;
  },
  increment(n = 1) {
    _ensureCurrentMonth();
    _count += n;
    _save();
  },
  getStatus() {
    _ensureCurrentMonth();
    return { used: _count, cap: MONTHLY_CAP, month: _month, remaining: Math.max(0, MONTHLY_CAP - _count) };
  },
};
