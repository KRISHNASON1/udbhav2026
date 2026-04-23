/**
 * api/submissions/get-by-team.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/submissions/get-by-team?teamId=UDB-XXXX&type=github-submission
 * Public — returns a specific submission for a team+type combo.
 * Used by the dashboard to pre-fill the submission modal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { connectDB }  from '../lib/mongodb.js';
import { Submission } from '../models/Submission.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const teamId = String(req.query?.teamId || '').trim();
  const type   = String(req.query?.type   || '').trim();

  if (!teamId || !type) {
    return res.status(400).json({ success: false, error: 'teamId and type are required' });
  }

  try {
    await connectDB();
    const sub = await Submission.findOne({ teamId, type }).lean();

    if (!sub) {
      return res.status(200).json({ success: true, submission: null });
    }

    return res.status(200).json({
      success: true,
      submission: {
        teamId:         sub.teamId,
        type:           sub.type,
        submissionLink: sub.submissionLink || '',
        description:    sub.description    || '',
        finalSubmitted: !!sub.finalSubmitted,
        status:         sub.status || 'pending',
        updatedAt:      sub.updatedAt,
      },
    });
  } catch (err) {
    console.error('[submissions/get-by-team]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
