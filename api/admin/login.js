/**
 * api/admin/login.js
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/admin/login
 *
 * Validates admin credentials server-side (env vars).
 * On success, returns the ADMIN_SECRET token which the client stores in
 * localStorage and sends as X-Admin-Secret on all subsequent admin API calls.
 *
 * This removes hardcoded credentials from client-side JS entirely.
 *
 * Body:    { username: string, password: string }
 * Returns: { success: true, token }  |  { success: false, error }
 */

import { rateLimit, getIP } from '../lib/rateLimiter.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'method_not_allowed' });
  }

  const ip = getIP(req);

  // Strict rate limit — 5 attempts per IP per 10 minutes
  if (!rateLimit(`admin:login:${ip}`, 5, 600)) {
    console.warn(`[admin/login] Rate limited: ${ip}`);
    return res.status(429).json({
      success: false,
      error: 'Too many login attempts. Wait 10 minutes.',
    });
  }

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password required.' });
  }

  const ADMIN_USER = process.env.ADMIN_USER;
  const ADMIN_PASS = process.env.ADMIN_PASS;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;

  if (!ADMIN_USER || !ADMIN_PASS || !ADMIN_SECRET) {
    console.error('[admin/login] ADMIN_USER, ADMIN_PASS, or ADMIN_SECRET not set in env');
    return res.status(500).json({ success: false, error: 'Server not configured.' });
  }

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    console.log(`[admin/login] ✅ Admin login: ${ip} at ${new Date().toISOString()}`);
    return res.status(200).json({ success: true, token: ADMIN_SECRET });
  }

  // Generic error — don't reveal which field was wrong
  console.warn(`[admin/login] ❌ Failed attempt: ${ip} user="${username}"`);
  return res.status(401).json({ success: false, error: 'Invalid username or password.' });
}
