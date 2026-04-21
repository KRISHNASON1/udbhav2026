/**
 * api/auth/team.js
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/auth/team
 * Authenticates a team using their unique code from the teams collection.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { connectDB } from '../lib/mongodb.js';
import { Registration } from '../models/Registration.js';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { teamCode, leaderEmail } = req.body;

  if (!teamCode || !leaderEmail) {
    return res.status(400).json({ success: false, error: 'Team ID and Leader Email are required.' });
  }

  const formattedCode = teamCode.trim().toUpperCase();
  const formattedEmail = leaderEmail.trim().toLowerCase();

  try {
    await connectDB();
    
    const [team, registration] = await Promise.all([
      import('../models/Team.js').then(m => m.Team.findOne({ code: formattedCode }).lean()),
      Registration.findOne({ teamCode: formattedCode }).lean()
    ]);

    const activeTeam = team || registration;

    if (!activeTeam) {
      return res.status(404).json({
        success: false,
        error: 'Invalid Team ID. Please check your credentials.'
      });
    }

    // Restriction: Only allow 'paid' teams to enter
    const status = activeTeam.paymentStatus;
    if (status !== 'paid') {
      return res.status(403).json({
        success: false,
        error: 'Access Denied. Only teams with successful payments can access the dashboard.',
        status: status
      });
    }

    // Verify leader email
    const storedEmail = (activeTeam.leader?.email || '').trim().toLowerCase();
    if (storedEmail !== formattedEmail) {
      return res.status(401).json({
        success: false,
        error: 'Invalid Leader Email for this Team ID.'
      });
    }

    // Success - Create JWT
    const token = jwt.sign(
      { teamCode: activeTeam.code || activeTeam.teamCode },
      process.env.ADMIN_SECRET || 'udbhav26_secure_secret',
      { expiresIn: '48h' }
    );

    // Set HttpOnly cookie
    res.setHeader(
      'Set-Cookie', 
      `udbhav_session=${token}; HttpOnly; Path=/; Max-Age=172800; SameSite=Strict`
    );

    // Success - Return team metadata
    return res.status(200).json({
      success: true,
      team: {
        id: activeTeam.code || activeTeam.teamCode,
        name: activeTeam.teamName,
        college: activeTeam.collegeName,
        leader: activeTeam.leader?.name || '',
        memberCount: 1 + (activeTeam.members?.length || 0),
        psSelectionId: activeTeam.psSelectionId || null
      }
    });

  } catch (err) {
    console.error('[/api/auth/team] Auth error:', err);
    return res.status(500).json({
      success: false,
      error: 'Mission control synchronization failure. Please try again.'
    });
  }
}
