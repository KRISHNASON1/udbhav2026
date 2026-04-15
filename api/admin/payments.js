/**
 * api/admin/payments.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin Payments endpoint — reads Razorpay transaction data from the
 * Registration collection and returns enriched payment records.
 *
 * All routes require X-Admin-Secret header.
 *
 * GET /api/admin/payments
 *   Query params:
 *     status   — "all" | "paid" | "pending" | "failed"  (default: "all")
 *     search   — search string (team name, order ID, payment ID, email)
 *     page     — page number (default: 1)
 *     limit    — items per page (default: 30, max: 100)
 *     sort     — "newest" | "oldest" | "amount_desc" | "amount_asc" (default: "newest")
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { connectDB }    from '../lib/mongodb.js';
import { Registration } from '../models/Registration.js';
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/payments
// ─────────────────────────────────────────────────────────────────────────────
export async function paymentsHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireAdmin(req, res)) return;

  try {
    await connectDB();

    const {
      status = 'all',
      search = '',
      page   = 1,
      limit  = 30,
      sort   = 'newest',
    } = req.query || {};

    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 30));
    const skip     = (pageNum - 1) * limitNum;

    // ── Build filter ────────────────────────────────────────────────────────
    const filter = {};

    if (status !== 'all') {
      filter.paymentStatus = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { teamName:          { $regex: q, $options: 'i' } },
        { razorpayOrderId:   { $regex: q, $options: 'i' } },
        { razorpayPaymentId: { $regex: q, $options: 'i' } },
        { 'leader.email':    { $regex: q, $options: 'i' } },
        { 'leader.name':     { $regex: q, $options: 'i' } },
        { teamCode:          { $regex: q, $options: 'i' } },
      ];
    }

    // ── Sort ────────────────────────────────────────────────────────────────
    const sortMap = {
      newest:      { createdAt: -1 },
      oldest:      { createdAt:  1 },
      amount_desc: { totalAmount: -1 },
      amount_asc:  { totalAmount:  1 },
    };
    const sortQuery = sortMap[sort] || sortMap.newest;

    // ── Query ────────────────────────────────────────────────────────────────
    const [registrations, totalCount] = await Promise.all([
      Registration.find(filter)
        .sort(sortQuery)
        .skip(skip)
        .limit(limitNum)
        .select('teamName collegeName leader totalAmount paymentStatus razorpayOrderId razorpayPaymentId teamCode mentorSession createdAt updatedAt')
        .lean(),
      Registration.countDocuments(filter),
    ]);

    // ── Summary stats (always full dataset, ignoring pagination/search) ──────
    const [statsResult] = await Registration.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue:  { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', 0] } },
          totalPaid:     { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid']    }, 1, 0] } },
          totalPending:  { $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0] } },
          totalFailed:   { $sum: { $cond: [{ $eq: ['$paymentStatus', 'failed']  }, 1, 0] } },
          totalCount:    { $sum: 1 },
          avgAmount:     { $avg: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', null] } },
        },
      },
    ]);

    const stats = statsResult || {
      totalRevenue: 0, totalPaid: 0, totalPending: 0,
      totalFailed: 0, totalCount: 0, avgAmount: 0,
    };

    // ── Map to clean payment records ─────────────────────────────────────────
    const payments = registrations.map(r => ({
      id:               r._id,
      teamName:         r.teamName,
      collegeName:      r.collegeName,
      leaderName:       r.leader?.name  || '—',
      leaderEmail:      r.leader?.email || '—',
      amount:           r.totalAmount,
      paymentStatus:    r.paymentStatus,
      razorpayOrderId:  r.razorpayOrderId  || null,
      razorpayPaymentId:r.razorpayPaymentId || null,
      teamCode:         r.teamCode || null,
      mentorSession:    r.mentorSession || false,
      createdAt:        r.createdAt,
      updatedAt:        r.updatedAt,
    }));

    return res.status(200).json({
      payments,
      pagination: {
        page:       pageNum,
        limit:      limitNum,
        total:      totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
      stats: {
        totalRevenue: stats.totalRevenue,
        totalPaid:    stats.totalPaid,
        totalPending: stats.totalPending,
        totalFailed:  stats.totalFailed,
        totalCount:   stats.totalCount,
        avgAmount:    Math.round(stats.avgAmount || 0),
      },
    });

  } catch (err) {
    console.error('[admin/payments] error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
