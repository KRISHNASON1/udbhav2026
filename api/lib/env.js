/**
 * api/lib/env.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Environment variable validation.
 * Call validateEnv() once at server startup — before any handlers run.
 *
 * Behaviour:
 *   development  → throws immediately so the developer sees the error
 *   production   → logs all missing vars and calls process.exit(1)
 *
 * This avoids silent partial-startup where some routes work and others fail
 * with cryptic "undefined is not a string" errors deep in handler code.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CRITICAL = [
  // Database
  'MONGODB_URI',
  // Payments
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  // Real-time
  'PUSHER_APP_ID',
  'PUSHER_KEY',
  'PUSHER_SECRET',
  'PUSHER_CLUSTER',
  // Email
  'RESEND_API_KEY',
  // Admin auth
  'ADMIN_SECRET',
  'ADMIN_USER',
  'ADMIN_PASS',
];

/**
 * Validate that all critical environment variables are present.
 * @throws {Error} in development if any are missing
 * Calls process.exit(1) in production if any are missing
 */
export function validateEnv() {
  const missing = CRITICAL.filter((key) => !process.env[key]);

  if (missing.length === 0) {
    console.log(`[env] ✓ All ${CRITICAL.length} required env vars present.`);
    return;
  }

  const lines = missing.map((k) => `  ✗ ${k}`).join('\n');
  const msg   = `Missing required environment variables:\n${lines}`;

  if (process.env.NODE_ENV === 'production') {
    console.error(`\n[env] FATAL — server cannot start safely.\n${msg}\n`);
    console.error('[env] Set these in your Cloud Run / Vercel environment settings.');
    process.exit(1);
  } else {
    // Development: throw so nodemon / the developer sees it immediately
    throw new Error(
      `\n\n[env] Missing env vars — add these to your .env file:\n${lines}\n\n` +
      `Copy .env.example to .env and fill in the values.\n`
    );
  }
}

/**
 * Safely read an env var, returning a fallback if missing.
 * Use for optional vars (e.g. PORT, NODE_ENV).
 */
export function env(key, fallback = '') {
  return process.env[key] ?? fallback;
}
