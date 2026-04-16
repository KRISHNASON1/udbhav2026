/**
 * api/cashfree-webhook.js
 * ─────────────────────────────────────────────────────────────────
 * POST /api/cashfree-webhook
 *
 * Receives Cashfree payment event webhooks and saves the registration
 * when a PAYMENT_SUCCESS event arrives — this is the safety net for
 * cases where the user closed the browser before the JS SDK resolved.
 *
 * Cashfree sends these events:
 *   PAYMENT_SUCCESS  ← we handle this
 *   PAYMENT_FAILED   ← logged only
 *   PAYMENT_PENDING  ← ignored
 *   ORDER_PAID       ← same as PAYMENT_SUCCESS, handled
 *
 * Signature verification:
 *   Cashfree signs each webhook with HMAC-SHA256 using your
 *   CASHFREE_WEBHOOK_SECRET. We verify before processing.
 *
 * Setup in dashboard:
 *   https://merchant.cashfree.com → Developers → Webhooks
 *   URL: https://yourdomain.com/api/cashfree-webhook
 *   Version: 2023-08-01
 *   Events: PAYMENT_SUCCESS, PAYMENT_FAILED, ORDER_PAID
 * ─────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';
import { connectDB }         from './lib/mongodb.js';
import { Registration }      from './models/Registration.js';
import { generateTeamCode }  from './lib/teamCode.js';
import { sendTeamCodeEmail } from './lib/email.js';

const WEBHOOK_SECRET = process.env.CASHFREE_WEBHOOK_SECRET;
const APP_ID         = process.env.CASHFREE_APP_ID;
const SECRET_KEY     = process.env.CASHFREE_SECRET_KEY;
const CF_ENV         = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
const CF_BASE        = CF_ENV === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfreepayments.com/pg';

const BASE_AMOUNT  = 800;
const MENTOR_ADDON = 300;

/**
 * Verify Cashfree webhook signature.
 * Cashfree sends: x-webhook-signature  (base64 HMAC-SHA256)
 *                 x-webhook-timestamp  (Unix seconds)
 * Message to sign: timestamp + rawBody
 */
function verifyWebhookSignature(rawBody, signature, timestamp) {
  if (!WEBHOOK_SECRET) return false;
  const message  = `${timestamp}${rawBody}`;
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(message)
    .digest('base64');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

export default async function handler(req, res) {
  // Cashfree only POSTs webhooks
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Collect raw body ────────────────────────────────────────────
  let rawBody = '';
  if (typeof req.body === 'string') {
    rawBody = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    rawBody = req.body.toString('utf8');
  } else {
    rawBody = JSON.stringify(req.body || {});
  }

  // ── Verify signature ─────────────────────────────────────────────
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];

  if (WEBHOOK_SECRET && signature && timestamp) {
    const valid = verifyWebhookSignature(rawBody, signature, timestamp);
    if (!valid) {
      console.warn('[cashfree-webhook] ❌ Signature mismatch — rejected');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  } else if (WEBHOOK_SECRET && !signature) {
    console.warn('[cashfree-webhook] ⚠ No signature header — rejected (WEBHOOK_SECRET is set)');
    return res.status(401).json({ error: 'Missing webhook signature' });
  }

  // ── Parse Event ──────────────────────────────────────────────────
  let event;
  try {
    event = typeof rawBody === 'string' ? JSON.parse(rawBody) : req.body;
  } catch (_) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const eventType = event?.type || event?.event; // 'PAYMENT_SUCCESS' etc.
  const data      = event?.data || {};
  const order     = data.order     || {};
  const payment   = data.payment   || {};

  console.log(`[cashfree-webhook] Event: ${eventType} | Order: ${order.order_id} | Status: ${payment.payment_status}`);

  // ── Only process successful payments ─────────────────────────────
  if (
    eventType !== 'PAYMENT_SUCCESS' &&
    eventType !== 'ORDER_PAID' &&
    payment.payment_status !== 'SUCCESS'
  ) {
    // Acknowledge non-success events (Cashfree retries until 200)
    console.log(`[cashfree-webhook] Ignoring event type: ${eventType}`);
    return res.status(200).json({ received: true });
  }

  const orderId   = order.order_id;
  const cfPaymentId = String(payment.cf_payment_id || '');

  if (!orderId) {
    console.error('[cashfree-webhook] No order_id in event payload');
    return res.status(400).json({ error: 'Missing order_id' });
  }

  try {
    await connectDB();

    // ── Idempotency guard ─────────────────────────────────────────
    const existing = await Registration.findOne({ cashfreeOrderId: orderId });
    if (existing) {
      console.log(`[cashfree-webhook] Already registered for order ${orderId} — skipping`);
      return res.status(200).json({ received: true, message: 'Already processed' });
    }

    // ── Fetch full order from Cashfree to get customer/amount data ─
    const cfRes = await fetch(`${CF_BASE}/orders/${orderId}`, {
      headers: {
        'x-api-version':   '2023-08-01',
        'x-client-id':     APP_ID,
        'x-client-secret': SECRET_KEY,
      },
    });
    const cfOrder = await cfRes.json();

    if (!cfRes.ok || cfOrder.order_status !== 'PAID') {
      console.warn(`[cashfree-webhook] Order ${orderId} not PAID — status: ${cfOrder.order_status}`);
      return res.status(200).json({ received: true, message: 'Order not paid yet' });
    }

    // ── Extract customer details from order notes ──────────────────
    // We encode formData into order_note as JSON during create-order
    // Fallback: use customer_details from Cashfree order
    const customer = cfOrder.customer_details || {};
    const note     = cfOrder.order_note || '';

    // Minimal registration from what Cashfree gives us in webhook
    // (Full formData is only available when JS SDK resolves; use webhook as fallback)
    const leaderEmail = customer.customer_email || '';
    const leaderName  = customer.customer_name  || '';
    const leaderPhone = customer.customer_phone || '';
    const cfAmount    = cfOrder.order_amount;
    const mentorSession = cfAmount >= BASE_AMOUNT + MENTOR_ADDON;

    // Try to extract team name from order note
    const teamNameMatch = note.match(/Registration\s*[—-]+\s*(.+?)(?:\s*\+|$)/);
    const teamName      = teamNameMatch ? teamNameMatch[1].trim() : `Team_${orderId.slice(-6)}`;

    // ── Generate team code + save ──────────────────────────────────
    const teamCode = await generateTeamCode();

    await Registration.create({
      teamName,
      collegeName:  'Via Webhook',   // full data only in JS-flow; webhook is safety net
      branch:       'Unknown',
      yearOfStudy:  'Unknown',
      leader: { name: leaderName, email: leaderEmail, phone: leaderPhone },
      members:      [],
      mentorSession,
      totalAmount:  cfAmount,
      paymentStatus: 'paid',
      registrationCompleted: true,
      cashfreeOrderId:   orderId,
      cashfreePaymentId: cfPaymentId,
      teamCode,
    });

    console.log(`[cashfree-webhook] ✅ Saved via webhook: ${orderId} | Code: ${teamCode}`);

    // ── Send email if we have a valid address ─────────────────────
    if (leaderEmail && leaderEmail.includes('@')) {
      sendTeamCodeEmail({
        to:          leaderEmail,
        teamName,
        teamCode,
        wantsMentor: mentorSession,
        amountPaid:  cfAmount,
      }).catch(err => console.error('[cashfree-webhook] Email error:', err));
    }

    return res.status(200).json({ received: true, teamCode });

  } catch (err) {
    console.error('[cashfree-webhook] Error:', err);
    if (err.code === 11000) {
      // Duplicate key — already registered (race condition with JS flow)
      return res.status(200).json({ received: true, message: 'Already registered' });
    }
    // Return 500 → Cashfree will retry the webhook (up to 5 times)
    return res.status(500).json({ error: 'Internal server error — will retry' });
  }
}
