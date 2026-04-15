/**
 * api/verify-payment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vercel Serverless Function — POST /api/verify-payment
 *
 * 1. Verifies Razorpay payment signature (HMAC-SHA256)
 * 2. Saves the full registration to MongoDB with paymentStatus: 'paid'
 *
 * Request body (JSON):
 *   {
 *     razorpay_order_id,
 *     razorpay_payment_id,
 *     razorpay_signature,
 *     formData: {
 *       teamName, collegeName, branch, yearOfStudy,
 *       leader: { name, email, phone },
 *       members: [{ name, email, phone }, ...],
 *       mentorSession: boolean,
 *       totalAmount: number
 *     }
 *   }
 *
 * Response:
 *   200 { success: true, id: "<mongo _id>" }
 *   400 { success: false, error: "Payment verification failed." }
 *   500 { success: false, error: "Server error" }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';
import { connectDB }    from './lib/mongodb.js';
import { Registration } from './models/Registration.js';

const KEY_SECRET    = process.env.RAZORPAY_KEY_SECRET;
const BASE_AMOUNT   = 800;
const MENTOR_ADDON  = 300;

// ── Simple helpers ──────────────────────────────────────────────────────────
const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim());

function validateMember(m, label) {
  if (!m || typeof m !== 'object') return `${label}: missing data`;
  if (!(m.name  || '').trim()) return `${label}: name is required`;
  if (!isValidEmail(m.email))  return `${label}: valid email required`;
  if (!(m.phone || '').trim()) return `${label}: phone is required`;
  return null;
}

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, formData } = req.body || {};

    // ── 1. Verify Razorpay signature ────────────────────────────────────────
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Missing payment verification data.' });
    }
    if (!formData) {
      return res.status(400).json({ success: false, error: 'Missing registration data.' });
    }
    if (!KEY_SECRET) {
      return res.status(500).json({ success: false, error: 'Server configuration error.' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.warn('[/api/verify-payment] Signature mismatch — possible tampered request');
      return res.status(400).json({ success: false, error: 'Payment verification failed. Please contact support.' });
    }

    // ── 2. Validate form data ───────────────────────────────────────────────
    if (!(formData.teamName    || '').trim()) return res.status(400).json({ success: false, error: 'Team name is required.' });
    if (!(formData.collegeName || '').trim()) return res.status(400).json({ success: false, error: 'College name is required.' });
    if (!(formData.branch      || '').trim()) return res.status(400).json({ success: false, error: 'Branch is required.' });
    if (!(formData.yearOfStudy || '').trim()) return res.status(400).json({ success: false, error: 'Year of study is required.' });

    const leaderErr = validateMember(formData.leader, 'Leader');
    if (leaderErr) return res.status(400).json({ success: false, error: leaderErr });

    const members = Array.isArray(formData.members) ? formData.members : [];
    for (let i = 0; i < members.length; i++) {
      const err = validateMember(members[i], `Member ${i + 2}`);
      if (err) return res.status(400).json({ success: false, error: err });
    }

    // Server-authoritative amount
    const totalAmount = formData.mentorSession ? BASE_AMOUNT + MENTOR_ADDON : BASE_AMOUNT;

    // ── 3. Connect to MongoDB ───────────────────────────────────────────────
    await connectDB();

    // ── 4. Check for duplicate payment ID ──────────────────────────────────
    const existing = await Registration.findOne({ razorpayPaymentId: razorpay_payment_id });
    if (existing) {
      return res.status(200).json({
        success: true,
        id: existing._id.toString(),
        message: 'Already registered.',
      });
    }

    // ── 5. Save registration with paymentStatus: 'paid' ────────────────────
    const registration = await Registration.create({
      teamName:    formData.teamName.trim(),
      collegeName: formData.collegeName.trim(),
      branch:      formData.branch.trim(),
      yearOfStudy: String(formData.yearOfStudy),
      leader: {
        name:  formData.leader.name.trim(),
        email: formData.leader.email.trim().toLowerCase(),
        phone: formData.leader.phone.trim(),
      },
      members: members.map((m) => ({
        name:  m.name.trim(),
        email: m.email.trim().toLowerCase(),
        phone: m.phone.trim(),
      })),
      mentorSession:     Boolean(formData.mentorSession),
      totalAmount,
      paymentStatus:     'paid',
      razorpayOrderId:   razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null,
    });

    console.log(`[/api/verify-payment] ✅ Registration saved: ${registration._id} | Team: ${formData.teamName}`);

    return res.status(200).json({
      success: true,
      id: registration._id.toString(),
      message: 'Registration confirmed!',
    });

  } catch (err) {
    console.error('[/api/verify-payment] Error:', err);

    if (err.code === 11000) {
      return res.status(400).json({ success: false, error: 'This team is already registered.' });
    }

    return res.status(500).json({
      success: false,
      error: 'Server error — please contact support with your payment ID.',
    });
  }
}
