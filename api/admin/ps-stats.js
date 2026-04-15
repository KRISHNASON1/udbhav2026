/**
 * api/admin/ps-stats.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/admin/ps-stats
 *
 * Returns:
 *   psSummary  — for each PS: title, order, slotsTaken, slotsTotal, slotsRemaining
 *   selections — team-wise log: teamCode, teamName, collegeName, psTitle, psOrder, selectedAt
 *   meta       — totalSelected, totalTeams, lastUpdated
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { connectDB }    from '../lib/mongodb.js';
import { ProblemStatement } from '../models/ProblemStatement.js';
import { Team }         from '../models/Team.js';
import { psLog, getIP } from '../lib/rateLimiter.js';

function requireAdmin(req, res) {
  const secret = req.headers['x-admin-secret'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    psLog(req, { event: 'admin_auth_failed', ip: getIP(req) });
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

export async function psStatsHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireAdmin(req, res)) return;

  try {
    await connectDB();

    // ── 1. Fetch all PS ───────────────────────────────────────────────────────
    const [psList, teamsWithSelection] = await Promise.all([
      ProblemStatement.find({}).sort({ order: 1 }).lean(),
      Team.find({ psSelectionId: { $ne: null } })
        .sort({ psSelectedAt: 1 })
        .populate('psSelectionId', 'title order')
        .select('code teamName collegeName psSelectionId psSelectedAt')
        .lean(),
    ]);

    // ── 2. PS summary ─────────────────────────────────────────────────────────
    const psSummary = psList.map(ps => ({
      order:          ps.order,
      title:          ps.title,
      domain:         ps.domain || '',
      slotsTaken:     ps.slotsTaken,
      slotsTotal:     ps.slotsTotal,
      slotsRemaining: Math.max(0, ps.slotsTotal - ps.slotsTaken),
      isFull:         ps.slotsTaken >= ps.slotsTotal,
      fillPct:        ps.slotsTotal > 0 ? Math.round((ps.slotsTaken / ps.slotsTotal) * 100) : 0,
    }));

    // ── 3. Team-wise selection log ────────────────────────────────────────────
    const selections = teamsWithSelection.map(team => ({
      teamCode:    team.code,
      teamName:    team.teamName,
      collegeName: team.collegeName || '',
      psOrder:     team.psSelectionId?.order ?? null,
      psTitle:     team.psSelectionId?.title ?? 'Unknown PS',
      selectedAt:  team.psSelectedAt,
    }));

    // ── 4. Meta ───────────────────────────────────────────────────────────────
    const totalTeams    = await Team.countDocuments({ paymentStatus: 'paid' });
    const totalSelected = teamsWithSelection.length;

    return res.status(200).json({
      psSummary,
      selections,
      meta: {
        totalPsCount:    psList.length,
        totalTeams,
        totalSelected,
        notYetSelected:  totalTeams - totalSelected,
        lastUpdated:     new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[admin/ps-stats] error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
