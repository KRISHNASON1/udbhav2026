/**
 * GET /api/ps/list
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns the PS list with current slot counts.
 * SECURITY: titles are NEVER returned unless state === "active".
 *
 * Requires header:  X-Team-Code: UDB-XXXX
 * Rate limit:       30 requests per teamCode per minute (for polling)
 *
 * Response: [{ order, title, slotsTaken, slotsTotal, isFull }]
 */

import { connectDB }              from '../lib/mongodb.js';
import { Team }                   from '../models/Team.js';
import { ProblemStatement }       from '../models/ProblemStatement.js';
import { getPSState }             from '../lib/psConfig.js';
import { rateLimit, getIP, psLog } from '../lib/rateLimiter.js';

const CODE_RE = /^UDB-[A-Z0-9]{2,8}$/i;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const ip       = getIP(req);
  const teamCode = (req.headers['x-team-code'] || '').trim().toUpperCase();

  // ── State guard (most important — no titles before drop) ──────────────────
  try {
    const psState = await getPSState();
    if (psState.state !== 'active') {
      return res.status(403).json({
        error:   'not_active',
        state:   psState.state,
        message: 'PS list is not available yet.',
      });
    }
  } catch (err) {
    console.error('[ps/list] state check error:', err);
    return res.status(500).json({ error: 'server_error' });
  }

  // ── Rate limits ────────────────────────────────────────────────────────────
  if (!rateLimit(`list:ip:${ip}`, 30, 60)) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  if (teamCode && !rateLimit(`list:code:${teamCode}`, 30, 60)) {
    return res.status(429).json({ error: 'rate_limited' });
  }

  // ── Team code auth ────────────────────────────────────────────────────────
  if (!teamCode || !CODE_RE.test(teamCode)) {
    return res.status(401).json({ error: 'unauthorized', message: 'Valid X-Team-Code header required.' });
  }

  psLog(req, { event: 'ps_list', code: teamCode });

  try {
    await connectDB();

    // Verify team exists and is paid
    const team = await Team.findOne({ code: teamCode }, 'paymentStatus').lean();
    if (!team || team.paymentStatus !== 'paid') {
      return res.status(403).json({ error: 'forbidden', message: 'Team not authorized.' });
    }

    // Fetch all PS in order — only expose safe fields
    const psList = await ProblemStatement.find({}, 'order title slotsTaken slotsTotal').sort({ order: 1 }).lean();

    const response = psList.map(ps => ({
      id:         ps.order,               // Use order as public identifier — never expose _id
      order:      ps.order,
      title:      ps.title,
      slotsTaken: ps.slotsTaken,
      slotsTotal: ps.slotsTotal,
      isFull:     ps.slotsTaken >= ps.slotsTotal,
    }));

    // Short cache for polling (1s) — client can do its own debounce
    res.setHeader('Cache-Control', 'private, max-age=1');
    return res.status(200).json({ psList: response });

  } catch (err) {
    console.error('[ps/list] error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
