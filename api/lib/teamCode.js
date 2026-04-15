/**
 * api/lib/teamCode.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates a unique UDB-XXXX team code.
 * - Avoids ambiguous characters: 0, O, 1, I, L
 * - Checks DB for collisions and regenerates if needed (extremely rare)
 */

import { connectDB }    from './mongodb.js';
import { Registration } from '../models/Registration.js';

// Unambiguous charset: no 0/O, 1/I/L
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode() {
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return `UDB-${suffix}`;
}

/**
 * Generates a unique team code. Checks the Registration collection to
 * guarantee no collision. Tries up to 10 times before throwing.
 * @returns {Promise<string>} Unique team code like "UDB-A3KP"
 */
export async function generateTeamCode() {
  await connectDB();

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const exists = await Registration.exists({ teamCode: code });
    if (!exists) return code;
  }

  throw new Error('Could not generate unique team code after 10 attempts');
}
