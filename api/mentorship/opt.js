/**
 * api/mentorship/opt.js
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/mentorship/opt
 * Allows a team to opt-in for a mentor session.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { connectDB }    from '../lib/mongodb.js';
import { Team }         from '../models/Team.js';
import { Registration } from '../models/Registration.js';
import jwt              from 'jsonwebtoken';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { teamCode, receiptUrl } = req.body;

  if (!teamCode) {
    return res.status(400).json({ success: false, error: 'Team ID is required.' });
  }

  if (!receiptUrl) {
    return res.status(400).json({ success: false, error: 'Payment receipt is required.' });
  }

  // Basic Base64 Image Validation
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(receiptUrl)) {
    return res.status(400).json({ success: false, error: 'Invalid receipt image format. Only PNG, JPG, and WEBP are allowed.' });
  }

  const formattedCode = teamCode.trim().toUpperCase();

  // ── Authentication Check ──────────────────────────────────────────────────
  const token = req.cookies?.udbhav_session;
  if (!token) {
    return res.status(401).json({ success: false, error: 'No active session found. Please log in again.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_SECRET || 'udbhav26_secure_secret');
    if (decoded.teamCode !== formattedCode) {
      return res.status(403).json({ success: false, error: 'Access denied for this team.' });
    }
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid. Please log in again.' });
  }

  try {
    await connectDB();

    // Update both Team and Registration collections
    const [teamUpdate, regUpdate] = await Promise.all([
      Team.findOneAndUpdate(
        { code: formattedCode },
        { $set: { mentorshipStatus: 'pending', mentorshipReceiptUrl: receiptUrl, mentorSession: true, mentorshipSubmittedAt: new Date() } },
        { new: true }
      ),
      Registration.findOneAndUpdate(
        { teamCode: formattedCode },
        { $set: { mentorshipStatus: 'pending', mentorshipReceiptUrl: receiptUrl, mentorSession: true, mentorshipSubmittedAt: new Date() } },
        { new: true }
      )
    ]);

    if (!teamUpdate && !regUpdate) {
      return res.status(404).json({
        success: false,
        error: 'Team not found.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Successfully opted-in for mentorship.'
    });

  } catch (err) {
    console.error('[/api/mentorship/opt] error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to update mentorship status. Please try again.'
    });
  }
}
