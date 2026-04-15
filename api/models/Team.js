/**
 * api/models/Team.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pre-populated by admin — contains shortlisted teams with their unique codes.
 * When a user enters their team code on the register page, this collection
 * is queried to verify eligibility and prefill registration details.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import mongoose from 'mongoose';

const TeamSchema = new mongoose.Schema(
  {
    // ── Unique Code ────────────────────────────────────────────────────────
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
      // e.g. "UDB26-001", "UDB26-042"
    },

    // ── Team Details ──────────────────────────────────────────────────────
    teamName:    { type: String, required: true, trim: true },
    collegeName: { type: String, required: true, trim: true },
    branch:      { type: String, required: true, trim: true },
    memberCount: { type: Number, required: true, min: 2, max: 4 },

    // ── Leader contact (for Razorpay prefill) ─────────────────────────────
    leader: {
      name:  { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, required: true, trim: true },
    },

    // ── Add-ons & Pricing ─────────────────────────────────────────────────
    mentorSession: { type: Boolean, default: false },
    totalAmount:   { type: Number, required: true },   // ₹800 or ₹1100

    // ── Payment Status ────────────────────────────────────────────────────
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid'],
      default: 'pending',
    },
    registrationId: { type: String, default: null }, // MongoDB _id from Registration collection after payment

    // ── PS Drop Selection ─────────────────────────────────────────────────
    psSelectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'ProblemStatement',
      default: null,
    },
    psSelectedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'teams',
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// code already has unique+index declared inline above.

// Filter teams by payment status (admin payments view, PS drop guard)
TeamSchema.index({ paymentStatus: 1 });

// Lookup which teams selected a given PS (admin PS stats, slot queries)
TeamSchema.index({ psSelectionId: 1 }, { sparse: true });

// Combined: paid teams that haven't selected a PS yet (PS drop eligibility)
TeamSchema.index({ paymentStatus: 1, psSelectionId: 1 });

export const Team =
  mongoose.models.Team || mongoose.model('Team', TeamSchema);
