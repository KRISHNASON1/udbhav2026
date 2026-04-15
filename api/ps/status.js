/**
 * GET /api/ps/status
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns the current PS Drop state. Public, no auth required.
 * Cached server-side for 10 seconds.
 *
 * Response:
 *   { state: "pre-drop"|"active"|"closed", startTime, endTime, now }
 */

import { getPSState }             from '../lib/psConfig.js';
import { rateLimit, getIP, psLog } from '../lib/rateLimiter.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Light rate limit — 60 req/min per IP
  const ip = getIP(req);
  if (!rateLimit(`status:ip:${ip}`, 60, 60)) {
    return res.status(429).json({ error: 'rate_limited', retryAfter: 60 });
  }

  psLog(req, { event: 'status_check' });

  try {
    const psState = await getPSState();

    // Cache-Control for CDN / browser
    res.setHeader('Cache-Control', 'public, max-age=10, stale-while-revalidate=5');

    return res.status(200).json({
      state:     psState.state,
      startTime: psState.startTime,
      endTime:   psState.endTime,
      now:       psState.now,
    });
  } catch (err) {
    console.error('[ps/status] error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
