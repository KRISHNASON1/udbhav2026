/**
 * api/create-order.js
 * ─────────────────────────────────────────────────────────────────
 * POST /api/create-order
 *
 * Creates a Cashfree Payment Order and returns the payment_session_id
 * needed by the Cashfree JS SDK on the frontend.
 *
 * Request body (JSON):
 *   { mentorSession: boolean, teamName: string, leaderName: string, leaderEmail: string, leaderPhone: string }
 *
 * Response:
 *   200 { success: true, orderId, paymentSessionId, amount }
 *   400 { success: false, error }
 *   500 { success: false, error }
 * ─────────────────────────────────────────────────────────────────
 */

const APP_ID     = process.env.CASHFREE_APP_ID;
const SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
const CF_ENV     = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
const CF_BASE    = CF_ENV === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfreepayments.com/pg';

const BASE_AMOUNT  = 800;
const MENTOR_ADDON = 300;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!APP_ID || !SECRET_KEY) {
    console.error('[create-order] Cashfree credentials missing');
    return res.status(500).json({ success: false, error: 'Payment gateway not configured.' });
  }

  try {
    const { mentorSession, teamName, leaderName, leaderEmail, leaderPhone } = req.body || {};

    if (!teamName || !leaderEmail) {
      return res.status(400).json({ success: false, error: 'Team name and leader email are required.' });
    }

    const amount    = mentorSession ? BASE_AMOUNT + MENTOR_ADDON : BASE_AMOUNT;
    const orderId   = `UDBHAV26_${Date.now()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    // Build return URL — Cashfree redirects here after payment with ?order_id=xxx
    const host      = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173';
    const protocol  = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
    const returnUrl = `${protocol}://${host}/register.html?order_id={order_id}&status={order_status}`;

    const payload = {
      order_id:      orderId,
      order_amount:  amount,
      order_currency: 'INR',
      customer_details: {
        customer_id:    `cust_${Date.now()}`,
        customer_name:  leaderName  || teamName,
        customer_email: leaderEmail,
        customer_phone: leaderPhone || '9999999999',
      },
      order_meta: {
        return_url:   returnUrl,
        notify_url:   `${protocol}://${host}/api/cashfree-webhook`,  // optional webhook
        payment_methods: 'upi,netbanking,cc,dc,wallet',
      },
      order_note: `UDBHAV'26 Registration — ${teamName}${mentorSession ? ' + Mentor Session' : ''}`,
    };

    const cfRes = await fetch(`${CF_BASE}/orders`, {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-version':   '2023-08-01',
        'x-client-id':     APP_ID,
        'x-client-secret': SECRET_KEY,
      },
      body: JSON.stringify(payload),
    });

    const cfData = await cfRes.json();

    if (!cfRes.ok || !cfData.payment_session_id) {
      console.error('[create-order] Cashfree API error:', cfData);
      return res.status(500).json({
        success: false,
        error: cfData?.message || 'Could not create payment order. Please try again.',
      });
    }

    console.log(`[create-order] ✅ Order created: ${orderId} | ₹${amount} | ${leaderEmail}`);

    return res.status(200).json({
      success:          true,
      orderId:          cfData.order_id,
      paymentSessionId: cfData.payment_session_id,
      amount,
      currency:         'INR',
      cfEnv:            CF_ENV,
    });

  } catch (err) {
    console.error('[create-order] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: 'Could not create payment order. Please try again.',
    });
  }
}
