/**
 * api/models/ProblemStatement.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Each document represents one problem statement in the PS Drop.
 * slotsTaken is incremented atomically inside a transaction on every selection.
 */

import mongoose from 'mongoose';

const ProblemStatementSchema = new mongoose.Schema(
  {
    // Display order (PS 01, PS 02 …)
    order: { type: Number, required: true, unique: true, index: true },

    // Title — NOT served before drop is active
    title: { type: String, required: true, trim: true },

    // Full problem statement body (plain text / markdown)
    description: { type: String, default: '', trim: true },

    // Domain / category tag (e.g. "FinTech", "HealthTech")
    domain: { type: String, default: '', trim: true },

    // Slot tracking
    slotsTotal: { type: Number, required: true, default: 5 },
    slotsTaken: { type: Number, required: true, default: 0, min: 0 },
  },
  {
    timestamps: true,
    collection: 'problemstatements',
  }
);

// Virtual: is this PS full?
ProblemStatementSchema.virtual('isFull').get(function () {
  return this.slotsTaken >= this.slotsTotal;
});

export const ProblemStatement =
  mongoose.models.ProblemStatement ||
  mongoose.model('ProblemStatement', ProblemStatementSchema);
