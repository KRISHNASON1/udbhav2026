/**
 * POST /api/ps/verify-code
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies a team code during the active PS Drop window.
 *
 * Body:   { teamCode: string }
 * Returns:
 *   { valid: true, teamName }                    — eligible, no prior selection
 *   { alreadySelected: true, psTitle, selectedAt } — already picked
 *   4xx on failure
 */

import { connectDB }              from '../lib/mongodb.js';
import { Team }                   from '../models/Team.js';
import { ProblemStatement }       from '../models/ProblemStatement.js';
import { getPSState }             from '../lib/psConfig.js';
import { rateLimit, getIP, psLog } from '../lib/rateLimiter.js';

// UDB-XXXX: 3–8 alphanumeric chars after dash
const CODE_RE = /^UDB-[A-Z0-9]{2,8}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const ip       = getIP(req);
  const teamCode = (req.body?.teamCode || '').trim().toUpperCase();

  // ── Rate limits ────────────────────────────────────────────────────────────
  // 10 attempts per IP per minute
  if (!rateLimit(`verify:ip:${ip}`, 10, 60)) {
    return res.status(429).json({ error: 'rate_limited', message: 'Too many attempts. Try again in a minute.' });
  }
  // 3 per teamCode per minute (after format check)
  if (teamCode && !rateLimit(`verify:code:${teamCode}`, 3, 60)) {
    return res.status(429).json({ error: 'rate_limited', message: 'Too many attempts for this team code.' });
  }

  psLog(req, { event: 'verify_code', code: teamCode });

  // ── Format validation ──────────────────────────────────────────────────────
  if (!teamCode || !CODE_RE.test(teamCode)) {
    return res.status(400).json({ error: 'invalid_format', message: 'Invalid Team Code format. Expected: UDB-XXXX' });
  }

  // ── State check ────────────────────────────────────────────────────────────
  try {
    const psState = await getPSState();
    if (psState.state !== 'active') {
      return res.status(403).json({
        error:   'not_active',
        state:   psState.state,
        message: psState.state === 'pre-drop'
          ? 'PS Drop has not started yet.'
          : 'PS Drop is closed.',
      });
    }

    // ── DB lookup ──────────────────────────────────────────────────────────
    await connectDB();

    const team = await Team.findOne({ code: teamCode }).lean();

    if (!team) {
      return res.status(404).json({ error: 'not_found', message: 'Team Code not found.' });
    }

    if (team.paymentStatus !== 'paid') {
      return res.status(403).json({ error: 'payment_pending', message: 'Payment not confirmed for this team.' });
    }

    // ── Already selected? ──────────────────────────────────────────────────
    if (team.psSelectionId) {
      const ps = await ProblemStatement.findById(team.psSelectionId).lean();
      return res.status(200).json({
        alreadySelected: true,
        psTitle:         ps?.title || 'Unknown',
        selectedAt:      team.psSelectedAt,
      });
    }

    // ── All good ───────────────────────────────────────────────────────────
    return res.status(200).json({
      valid:    true,
      teamName: team.teamName,
    });

  } catch (err) {
    console.error('[ps/verify-code] error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
