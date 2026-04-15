/**
 * api/lib/rateLimiter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * In-memory rate limiter. Buckets expire automatically.
 * Falls back gracefully if Redis (Upstash) is not configured.
 *
 * Usage:
 *   const ok = await rateLimit('ip:1.2.3.4', 10, 60);   // 10 req / 60s
 *   if (!ok) return res.status(429).json({ error: 'rate_limited' });
 */

// ── In-memory store ──────────────────────────────────────────────────────────
// Map<key, { count: number, resetAt: number }>
const store = new Map();

// Clean up expired entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.resetAt < now) store.delete(k);
  }
}, 120_000);

/**
 * @param {string}  key        - unique limiter key (e.g. "ip:1.2.3.4")
 * @param {number}  maxHits    - max allowed hits in the window
 * @param {number}  windowSecs - window duration in seconds
 * @returns {boolean}           true = allowed, false = rate limited
 */
export function rateLimit(key, maxHits, windowSecs) {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowSecs * 1000 });
    return true;
  }

  if (bucket.count >= maxHits) return false;

  bucket.count++;
  return true;
}

/**
 * Helper to extract IP from Express request.
 * Handles X-Forwarded-For from Cloud Run / Vercel / nginx.
 */
export function getIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Redact last 2 chars of team code for logs.
 * "UDB-1234" → "UDB-12**"
 */
export function redactCode(code = '') {
  if (code.length <= 2) return '**';
  return code.slice(0, -2) + '**';
}

/**
 * Structured request logger for all /api/ps/* endpoints.
 */
export function psLog(req, extra = {}) {
  console.log(JSON.stringify({
    ts:       new Date().toISOString(),
    endpoint: req.path,
    method:   req.method,
    ip:       getIP(req),
    code:     extra.code ? redactCode(extra.code) : undefined,
    ...extra,
  }));
}
