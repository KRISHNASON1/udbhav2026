/**
 * api/submissions/submit.js
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/submissions/submit
 *
 * Supports two modes via `finalSubmit` body flag:
 *   - false / missing → "Save Draft" — upserts link & description only
 *   - true            → "Final Submit" — marks as finalSubmitted, locks entry
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { connectDB } from '../lib/mongodb.js';
import { Submission } from '../models/Submission.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { teamId, type, submissionLink, description, finalSubmit } = req.body || {};

  if (!teamId || !type || !submissionLink) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    await connectDB();

    // One-time: drop stale indexes (e.g. teamCode_1) that don't match schema
    if (!handler._indexesSynced) {
      await Submission.syncIndexes();
      handler._indexesSynced = true;
    }

    // Check if this team already has a final submission for this type
    const existing = await Submission.findOne({ teamId, type });

    if (existing && existing.finalSubmitted) {
      return res.status(400).json({
        success: false,
        error: 'This submission has already been finalized. No further changes allowed.',
      });
    }

    // Upsert: create if first time, update if draft exists
    const updateData = {
      submissionLink,
      description: description || '',
    };

    if (finalSubmit) {
      updateData.finalSubmitted = true;
      updateData.status = 'pending'; // ready for admin review
    }

    const submission = await Submission.findOneAndUpdate(
      { teamId, type },
      { $set: updateData, $setOnInsert: { teamId, type } },
      { upsert: true, new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      submission,
      message: finalSubmit
        ? 'Final submission recorded! This cannot be changed.'
        : 'Draft saved successfully. You can still edit before final submission.',
    });
  } catch (err) {
    console.error('[/api/submissions/submit] Error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
