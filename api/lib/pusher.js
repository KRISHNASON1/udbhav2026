/**
 * api/lib/pusher.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pusher server-side client (singleton).
 * Emits real-time slot updates to the "ps-drop" channel.
 *
 * Required env vars:
 *   PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER
 */

import Pusher from 'pusher';

let _pusher = null;

export function getPusher() {
  if (_pusher) return _pusher;

  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;

  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) {
    console.warn('⚠️  Pusher env vars missing — real-time updates disabled.');
    return null;
  }

  _pusher = new Pusher({
    appId:   PUSHER_APP_ID,
    key:     PUSHER_KEY,
    secret:  PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS:  true,
  });

  return _pusher;
}

/**
 * Emit a slot-update event after a successful PS selection.
 * Silently swallows errors so a Pusher outage never breaks selection.
 */
export async function emitSlotUpdate({ psOrder, slotsTaken, slotsTotal }) {
  const pusher = getPusher();
  if (!pusher) return;
  try {
    await pusher.trigger('ps-drop', 'slot-update', {
      psOrder,
      slotsTaken,
      isFull: slotsTaken >= slotsTotal,
    });
  } catch (err) {
    console.error('Pusher emit failed (non-fatal):', err.message);
  }
}

/**
 * Emit a drop-status event (used by admin controls).
 */
export async function emitDropStatus(event, data = {}) {
  const pusher = getPusher();
  if (!pusher) return;
  try {
    await pusher.trigger('ps-drop', event, data);
  } catch (err) {
    console.error('Pusher status emit failed (non-fatal):', err.message);
  }
}
