/**
 * api/lib/psConfig.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cached PSDropConfig reader with a 10-second TTL.
 * Reads the singleton document from MongoDB and computes the current state.
 */

import { connectDB }  from './mongodb.js';
import { PSDropConfig } from '../models/PSDropConfig.js';

let _cache     = null;
let _cacheTime = 0;
const TTL_MS   = 10_000; // 10 seconds

/**
 * Returns the current PS drop state object:
 * {
 *   state: "pre-drop" | "active" | "closed",
 *   startTime: Date,
 *   endTime:   Date,
 *   now:       Date,
 *   manualOverride: boolean,
 * }
 */
export async function getPSState() {
  const now = new Date();

  // Return cached value if still fresh
  if (_cache && Date.now() - _cacheTime < TTL_MS) {
    return { ..._cache, now };
  }

  await connectDB();

  // Ensure singleton exists
  let cfg = await PSDropConfig.findById('singleton');
  if (!cfg) {
    cfg = await PSDropConfig.create({ _id: 'singleton' });
  }

  let state;
  let manualOverride = false;

  if (cfg.manualStatus) {
    state          = cfg.manualStatus;
    manualOverride = true;
  } else if (now < cfg.startTime) {
    state = 'pre-drop';
  } else if (now < cfg.endTime) {
    state = 'active';
  } else {
    state = 'closed';
  }

  _cache = {
    state,
    startTime: cfg.startTime,
    endTime:   cfg.endTime,
    manualOverride,
  };
  _cacheTime = Date.now();

  return { ..._cache, now };
}

/** Force-invalidate the cache (call after admin changes config). */
export function invalidatePSCache() {
  _cache     = null;
  _cacheTime = 0;
}
