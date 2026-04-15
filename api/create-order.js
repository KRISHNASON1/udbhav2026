/**
 * api/create-order.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vercel Serverless Function — POST /api/create-order
 *
 * Creates a Razorpay Order server-side. Amount is calculated here based on
 * mentorSession flag — never trusted from the client.
 *
 * Request body (JSON):
 *   { mentorSession: boolean, teamName: string, leaderName: string, leaderEmail: string }
 *
 * Response:
 *   200 { success: true, orderId, amount, currency, key }
 *   400 / 500 { success: false, error }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Razorpay from 'razorpay';

const KEY_ID     = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

const BASE_AMOUNT   = 800;   // ₹800
const MENTOR_ADDON  = 300;   // ₹300

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!KEY_ID || !KEY_SECRET) {
    return res.status(500).json({
      success: false,
      error: 'Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables.',
    });
  }

  try {
    const { mentorSession, teamName, leaderName, leaderEmail } = req.body || {};

    if (!teamName || !leaderName || !leaderEmail) {
      return res.status(400).json({ success: false, error: 'Team name, leader name, and leader email are required.' });
    }

    // Amount is authoritative — server decides based on mentorSession flag
    const totalAmount   = mentorSession ? BASE_AMOUNT + MENTOR_ADDON : BASE_AMOUNT;
    const amountPaisa   = totalAmount * 100;  // convert ₹ to paise

    const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });

    const order = await razorpay.orders.create({
      amount:   amountPaisa,
      currency: 'INR',
      receipt:  `udbhav26_${Date.now()}`,
      notes: {
        event:         "UDBHAV'26 Round 2",
        teamName:      teamName,
        mentorSession: mentorSession ? 'yes' : 'no',
      },
    });

    return res.status(200).json({
      success:  true,
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      key:      KEY_ID,
    });

  } catch (err) {
    console.error('[/api/create-order] Razorpay error:', err);
    console.error('[/api/create-order] Error details:', {
      message: err.message,
      statusCode: err.statusCode,
      error: err.error,
    });
    return res.status(500).json({
      success: false,
      error: 'Could not create payment order. Please try again.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}
