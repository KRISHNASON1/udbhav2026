/**
 * api/models/WinnersConfig.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton document that stores all winner entries and publication state.
 *
 * published: false → /winners page shows "????" placeholders
 * published: true  → /winners page shows real winner details
 *
 * One document with _id = "singleton" is always upserted.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import mongoose from 'mongoose';

const WinnerEntrySchema = new mongoose.Schema(
  {
    rank:        { type: String, required: true, trim: true }, // e.g. "1st", "2nd", "3rd", "Special Award"
    label:       { type: String, trim: true, default: '' },   // e.g. "Best Sustainability Track"
    teamName:    { type: String, trim: true, default: '' },
    teamCode:    { type: String, trim: true, default: '' },
    prizeAmount: { type: String, trim: true, default: '' },   // stored as string so "₹10,000" works
    psTitle:     { type: String, trim: true, default: '' },
    college:     { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },   // optional short blurb
    order:       { type: Number, default: 0 },                 // display order
  },
  { _id: true }
);

const WinnersConfigSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'singleton' },

    // Publication state
    published:    { type: Boolean, default: false },
    publishedAt:  { type: Date,    default: null },
    savedAt:      { type: Date,    default: null },

    // Winner entries
    winners: { type: [WinnerEntrySchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'winnersconfig',
  }
);

export const WinnersConfig =
  mongoose.models.WinnersConfig ||
  mongoose.model('WinnersConfig', WinnersConfigSchema);
