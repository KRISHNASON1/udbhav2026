/**
 * POST /api/ps/select
 * ─────────────────────────────────────────────────────────────────────────────
 * ATOMIC PS SELECTION — the most critical endpoint.
 *
 * Uses a MongoDB transaction with row-level locks (FOR UPDATE equivalent via
 * `findOneAndUpdate` with `$inc` and conditional checks — Mongoose handles
 * optimistic concurrency via multi-document transactions on Atlas replica sets).
 *
 * Body:    { teamCode: string, psId: number (order) }
 * Returns: { success: true, psTitle, selectedAt }
 */

import mongoose                    from 'mongoose';
import { connectDB }               from '../lib/mongodb.js';
import { Team }                    from '../models/Team.js';
import { ProblemStatement }        from '../models/ProblemStatement.js';
import { getPSState }              from '../lib/psConfig.js';
import { emitSlotUpdate }          from '../lib/pusher.js';
import { rateLimit, getIP, psLog } from '../lib/rateLimiter.js';
import jwt                         from 'jsonwebtoken';

const CODE_RE = /^UDB-[A-Z0-9]{2,8}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const ip       = getIP(req);
  const teamCode = (req.body?.teamCode || '').trim().toUpperCase();
  const psOrder  = parseInt(req.body?.psId, 10); // psId on the wire is the order number

  psLog(req, { event: 'ps_select_attempt', code: teamCode, psOrder });

  // ── Rate limits ────────────────────────────────────────────────────────────
  if (!rateLimit(`select:ip:${ip}`, 5, 60)) {
    return res.status(429).json({ error: 'rate_limited', message: 'Too many selection attempts.' });
  }
  if (teamCode && !rateLimit(`select:code:${teamCode}`, 3, 60)) {
    return res.status(429).json({ error: 'rate_limited', message: 'Too many attempts for this team.' });
  }

  // ── Input validation ───────────────────────────────────────────────────────
  if (!teamCode || !CODE_RE.test(teamCode)) {
    return res.status(400).json({ error: 'invalid_team_code' });
  }
  if (!psOrder || isNaN(psOrder) || psOrder < 1) {
    return res.status(400).json({ error: 'invalid_ps_id' });
  }

  // ── Authentication Check ──────────────────────────────────────────────────
  const token = req.cookies?.udbhav_session;
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'No active session found. Please log in again.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_SECRET || 'udbhav26_secure_secret');
    if (decoded.teamCode !== teamCode) {
      return res.status(403).json({ error: 'forbidden', message: 'Access denied for this team.' });
    }
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized', message: 'Session expired or invalid. Please log in again.' });
  }

  // ── State guard ────────────────────────────────────────────────────────────
  try {
    const psState = await getPSState();
    if (psState.state !== 'active') {
      return res.status(403).json({
        error:   'not_active',
        state:   psState.state,
        message: psState.state === 'pre-drop'
          ? 'PS Drop has not started yet.'
          : 'PS Drop selection is closed.',
      });
    }
  } catch (err) {
    console.error('[ps/select] state check error:', err);
    return res.status(500).json({ error: 'server_error' });
  }

  // ── Atomic transaction ─────────────────────────────────────────────────────
  await connectDB();
  const session = await mongoose.startSession();

  try {
    let result = null;

    await session.withTransaction(async () => {
      // 1. Lock & fetch the team row
      const team = await Team.findOne({ code: teamCode }).session(session);
      if (!team) {
        throw Object.assign(new Error('team_not_found'), { statusCode: 404, errorCode: 'team_not_found', message: 'Team Code not found.' });
      }
      if (team.paymentStatus !== 'paid') {
        throw Object.assign(new Error('payment_pending'), { statusCode: 403, errorCode: 'payment_pending', message: 'Payment not confirmed.' });
      }

      // 2. Double-selection guard
      if (team.psSelectionId) {
        const existingPS = await ProblemStatement.findById(team.psSelectionId).session(session).lean();
        throw Object.assign(new Error('already_selected'), {
          statusCode: 409,
          errorCode:  'already_selected',
          message:    'Your team has already selected a Problem Statement.',
          psTitle:    existingPS?.title,
          selectedAt: team.psSelectedAt,
        });
      }

      // 3. Lock & fetch the PS row, atomically increment slotsTaken if available
      const ps = await ProblemStatement.findOneAndUpdate(
        { order: psOrder, $expr: { $lt: ['$slotsTaken', '$slotsTotal'] } }, // only if slot available
        { $inc: { slotsTaken: 1 } },
        { returnDocument: 'after', session }
      );

      if (!ps) {
        // Either not found OR all slots taken
        const psCheck = await ProblemStatement.findOne({ order: psOrder }).session(session).lean();
        if (!psCheck) {
          throw Object.assign(new Error('ps_not_found'), { statusCode: 404, errorCode: 'ps_not_found', message: 'Problem Statement not found.' });
        }
        throw Object.assign(new Error('ps_full'), { statusCode: 409, errorCode: 'ps_full', message: 'All slots for this Problem Statement are taken.' });
      }

      // 4. Mark the team's selection
      const selectedAt = new Date();
      team.psSelectionId = ps._id;
      team.psSelectedAt  = selectedAt;
      await team.save({ session });

      result = {
        psTitle:    ps.title,
        psOrder:    ps.order,
        slotsTaken: ps.slotsTaken,
        slotsTotal: ps.slotsTotal,
        selectedAt,
      };
    });

    // ── Transaction committed ─────────────────────────────────────────────
    psLog(req, {
      event:   'ps_select_success',
      code:    teamCode,
      psOrder: result.psOrder,
      slots:   `${result.slotsTaken}/${result.slotsTotal}`,
    });

    // Emit real-time Pusher update (non-blocking)
    emitSlotUpdate({
      psOrder:    result.psOrder,
      slotsTaken: result.slotsTaken,
      slotsTotal: result.slotsTotal,
    });

    return res.status(200).json({
      success:    true,
      psTitle:    result.psTitle,
      selectedAt: result.selectedAt,
    });

  } catch (err) {
    // Known business-logic errors surfaced via throw
    if (err.statusCode) {
      const body = {
        error:   err.errorCode,
        message: err.message,
      };
      if (err.psTitle)    body.psTitle    = err.psTitle;
      if (err.selectedAt) body.selectedAt = err.selectedAt;
      return res.status(err.statusCode).json(body);
    }

    console.error('[ps/select] unexpected error:', err);
    return res.status(500).json({ error: 'server_error' });

  } finally {
    session.endSession();
  }
}
