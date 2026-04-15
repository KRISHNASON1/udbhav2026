/**
 * api/admin/winners.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin Winners Management API — all routes require X-Admin-Secret.
 *
 * GET    /api/admin/winners          — load current draft + state
 * POST   /api/admin/winners/save     — save draft (published stays false)
 * POST   /api/admin/winners/publish  — save + set published: true
 * POST   /api/admin/winners/unpublish — set published: false (data kept)
 *
 * Public (no auth):
 * GET    /api/winners                — returns winners if published, else placeholder state
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { connectDB }    from '../lib/mongodb.js';
import { WinnersConfig } from '../models/WinnersConfig.js';
import { psLog, getIP } from '../lib/rateLimiter.js';

// ── Admin auth ────────────────────────────────────────────────────────────────
function requireAdmin(req, res) {
  const secret = req.headers['x-admin-secret'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    psLog(req, { event: 'admin_auth_failed', ip: getIP(req) });
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

// ── Singleton upsert helper ───────────────────────────────────────────────────
async function getSingleton() {
  let doc = await WinnersConfig.findById('singleton');
  if (!doc) {
    doc = await WinnersConfig.create({ _id: 'singleton' });
  }
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/winners  — fetch current state
// ─────────────────────────────────────────────────────────────────────────────
export async function getWinnersHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireAdmin(req, res)) return;

  try {
    await connectDB();
    const doc = await getSingleton();
    return res.status(200).json({
      published:   doc.published,
      publishedAt: doc.publishedAt,
      savedAt:     doc.savedAt,
      winners:     doc.winners || [],
    });
  } catch (err) {
    console.error('[admin/winners GET]', err);
    return res.status(500).json({ error: 'server_error' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/winners/save  — save draft only
// ─────────────────────────────────────────────────────────────────────────────
export async function saveWinnersHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireAdmin(req, res)) return;

  const { winners = [] } = req.body || {};

  try {
    await connectDB();
    const sanitized = sanitizeWinners(winners);

    const doc = await WinnersConfig.findByIdAndUpdate(
      'singleton',
      {
        $set: {
          winners: sanitized,
          savedAt: new Date(),
          // published state is NOT changed
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success:   true,
      message:   'Draft saved. Winners page still shows placeholders.',
      published: doc.published,
      savedAt:   doc.savedAt,
      count:     sanitized.length,
    });
  } catch (err) {
    console.error('[admin/winners SAVE]', err);
    return res.status(500).json({ error: 'server_error' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/winners/publish  — save + go live
// ─────────────────────────────────────────────────────────────────────────────
export async function publishWinnersHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireAdmin(req, res)) return;

  const { winners } = req.body || {};

  try {
    await connectDB();

    // If body has winners, save them; otherwise publish whatever is stored
    const update = { published: true, publishedAt: new Date(), savedAt: new Date() };
    if (Array.isArray(winners)) {
      update.winners = sanitizeWinners(winners);
    }

    const doc = await WinnersConfig.findByIdAndUpdate('singleton', { $set: update }, { upsert: true, new: true });

    psLog(req, { event: 'winners_published', count: doc.winners.length });

    return res.status(200).json({
      success:     true,
      message:     '🏆 Winners are now LIVE on the public page!',
      published:   true,
      publishedAt: doc.publishedAt,
      count:       doc.winners.length,
    });
  } catch (err) {
    console.error('[admin/winners PUBLISH]', err);
    return res.status(500).json({ error: 'server_error' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/winners/unpublish  — revert to placeholders
// ─────────────────────────────────────────────────────────────────────────────
export async function unpublishWinnersHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireAdmin(req, res)) return;

  try {
    await connectDB();
    await WinnersConfig.findByIdAndUpdate('singleton', {
      $set: { published: false, publishedAt: null },
    }, { upsert: true });

    psLog(req, { event: 'winners_unpublished' });

    return res.status(200).json({
      success:   true,
      message:   'Winners page reverted to ???? placeholders.',
      published: false,
    });
  } catch (err) {
    console.error('[admin/winners UNPUBLISH]', err);
    return res.status(500).json({ error: 'server_error' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/winners  — PUBLIC endpoint
// ─────────────────────────────────────────────────────────────────────────────
export async function publicWinnersHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

  try {
    await connectDB();
    const doc = await WinnersConfig.findById('singleton').lean();

    if (!doc || !doc.published) {
      // Not published → return placeholder state
      return res.status(200).json({
        published:   false,
        publishedAt: null,
        winners:     [],
      });
    }

    return res.status(200).json({
      published:   true,
      publishedAt: doc.publishedAt,
      winners:     doc.winners || [],
    });
  } catch (err) {
    console.error('[/api/winners public]', err);
    return res.status(500).json({ error: 'server_error' });
  }
}

// ── Sanitize helpers ──────────────────────────────────────────────────────────
function sanitizeWinners(arr) {
  return arr
    .filter(w => w && typeof w === 'object')
    .map((w, i) => ({
      rank:        String(w.rank        || '').trim().substring(0, 50),
      label:       String(w.label       || '').trim().substring(0, 100),
      teamName:    String(w.teamName    || '').trim().substring(0, 100),
      teamCode:    String(w.teamCode    || '').trim().toUpperCase().substring(0, 30),
      prizeAmount: String(w.prizeAmount || '').trim().substring(0, 50),
      psTitle:     String(w.psTitle     || '').trim().substring(0, 200),
      college:     String(w.college     || '').trim().substring(0, 100),
      description: String(w.description || '').trim().substring(0, 500),
      order:       typeof w.order === 'number' ? w.order : i,
    }));
}
