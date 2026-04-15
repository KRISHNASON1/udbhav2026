/**
 * api/models/PSDropConfig.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton config document that controls the PS Drop window.
 * One document with _id = "singleton" is always present.
 * Admin can override time-based state or manually set status.
 */

import mongoose from 'mongoose';

const PSDropConfigSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'singleton' },

    // Scheduled window (IST)
    startTime: { type: Date, default: () => new Date('2026-04-25T10:45:00+05:30') },
    endTime:   { type: Date, default: () => new Date('2026-04-25T11:00:00+05:30') },

    // Manual override — null means time-based logic applies
    // Values: "pre-drop" | "active" | "closed"
    manualStatus: { type: String, enum: ['pre-drop', 'active', 'closed', null], default: null },
  },
  {
    timestamps: true,
    collection: 'psdropconfig',
  }
);

export const PSDropConfig =
  mongoose.models.PSDropConfig ||
  mongoose.model('PSDropConfig', PSDropConfigSchema);
