/**
 * CTS BPO — Email Domain Verifier
 * Checks MX records to confirm a domain actually accepts email.
 * Results are cached to avoid re-checking known domains on every run.
 */

const dns  = require('dns').promises;
const fs   = require('fs');
const path = require('path');

const CACHE_FILE   = path.join(__dirname, '../../data/mx-cache.json');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DNS_TIMEOUT  = 5000; // 5s per lookup

// In-memory cache: domain → { valid: bool, ts: epoch }
const _cache = new Map();

(function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw  = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      const now  = Date.now();
      let loaded = 0;
      for (const [k, v] of Object.entries(raw)) {
        if (now - v.ts < CACHE_TTL_MS) { _cache.set(k, v); loaded++; }
      }
      if (loaded) console.log(`[MX] Cache loaded: ${loaded} verified domains`);
    }
  } catch { /* start fresh */ }
})();

let _saveTimer = null;
function scheduleSave() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    try {
      const obj = {};
      for (const [k, v] of _cache) obj[k] = v;
      fs.writeFileSync(CACHE_FILE, JSON.stringify(obj));
    } catch {}
  }, 3000); // batch writes — save 3s after last update
}

// Free/personal email providers — not business prospects
const DISPOSABLE_DOMAINS = new Set([
  'gmail.com','yahoo.com','yahoo.co.uk','yahoo.co.za','hotmail.com','hotmail.co.uk',
  'outlook.com','live.com','msn.com','aol.com','icloud.com','me.com','mac.com',
  'mail.com','protonmail.com','proton.me','tutanota.com','fastmail.com',
  'mailinator.com','guerrillamail.com','10minutemail.com','temp-mail.org',
  'throwaway.email','fakeinbox.com','yopmail.com','sharklasers.com',
  'guerrillamailblock.com','grr.la','guerrillamail.info','spam4.me',
  'trashmail.com','dispostable.com','maildrop.cc','mailnull.com',
]);

function isDisposable(domain) {
  return DISPOSABLE_DOMAINS.has((domain || '').toLowerCase());
}

async function hasMxRecords(domain) {
  if (!domain) return false;
  const d = domain.toLowerCase().trim();
  if (isDisposable(d)) return false;

  // Return cached result
  const cached = _cache.get(d);
  if (cached && (Date.now() - cached.ts < CACHE_TTL_MS)) return cached.valid;

  try {
    const records = await Promise.race([
      dns.resolveMx(d),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), DNS_TIMEOUT)),
    ]);
    const valid = Array.isArray(records) && records.length > 0;
    _cache.set(d, { valid, ts: Date.now() });
    scheduleSave();
    return valid;
  } catch {
    _cache.set(d, { valid: false, ts: Date.now() });
    scheduleSave();
    return false;
  }
}

async function verifyEmailDomain(email) {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1];
  return hasMxRecords(domain);
}

// Batch-verify an array of emails, returns a Set of verified emails
async function batchVerify(emails, { concurrency = 8 } = {}) {
  const verified = new Set();
  for (let i = 0; i < emails.length; i += concurrency) {
    const chunk   = emails.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(async email => {
      const ok = await verifyEmailDomain(email);
      return { email, ok };
    }));
    for (const { email, ok } of results) {
      if (ok) verified.add(email);
    }
  }
  return verified;
}

// Check if domain is already in cache (no DNS call)
function isCached(domain) {
  return _cache.has((domain || '').toLowerCase());
}

function getCacheSize() { return _cache.size; }

module.exports = { verifyEmailDomain, hasMxRecords, batchVerify, isDisposable, isCached, getCacheSize };
