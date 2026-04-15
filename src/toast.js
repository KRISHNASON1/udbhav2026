/**
 * src/toast.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight vanilla-JS toast notification system for UDBHAV'26.
 *
 * Design tokens:
 *   background  #0d0d10  (--clr-black-card)
 *   text        #ffffff
 *   accent      #8b5cf6  (--clr-purple)
 *   font        'Sora', sans-serif
 *   position    bottom-right
 *
 * Usage:
 *   import { toast } from '/src/toast.js';
 *
 *   toast.success('Registration saved!');
 *   toast.error('Payment failed — try again.');
 *   const dismiss = toast.loading('Submitting…');
 *   dismiss(); // call to remove the loading toast
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Inject styles once ───────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('udbhav-toast-styles')) return;
  const style = document.createElement('style');
  style.id = 'udbhav-toast-styles';
  style.textContent = `
    #udbhav-toast-container {
      position: fixed;
      bottom: 1.25rem;
      right: 1.25rem;
      z-index: 99999;
      display: flex;
      flex-direction: column-reverse;
      gap: 0.55rem;
      pointer-events: none;
      max-width: min(360px, calc(100vw - 2.5rem));
    }

    .udbhav-toast {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      padding: 0.85rem 1rem;
      background: #0d0d10;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.55), 0 0 0 0 transparent;
      font-family: 'Sora', system-ui, sans-serif;
      font-size: 0.875rem;
      font-weight: 400;
      color: #fff;
      line-height: 1.5;
      pointer-events: auto;
      cursor: default;
      /* entrance */
      animation: toast-in 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
      /* ensure exit class can override */
      transition: opacity 0.22s ease, transform 0.22s ease;
    }

    .udbhav-toast.toast-exit {
      animation: toast-out 0.22s ease forwards;
    }

    @keyframes toast-in {
      from { opacity: 0; transform: translateX(12px) translateY(4px); }
      to   { opacity: 1; transform: translateX(0)    translateY(0); }
    }
    @keyframes toast-out {
      from { opacity: 1; transform: translateX(0); max-height: 200px; margin-bottom: 0; }
      to   { opacity: 0; transform: translateX(12px); max-height: 0; margin-bottom: -0.55rem; overflow: hidden; }
    }

    /* ── Icon wrapper ─────────────── */
    .udbhav-toast__icon {
      flex-shrink: 0;
      width: 18px; height: 18px;
      margin-top: 1px;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── Type-specific left border accent ─────────────── */
    .udbhav-toast--success { border-left: 3px solid #22c55e; }
    .udbhav-toast--error   { border-left: 3px solid #ef4444; }
    .udbhav-toast--loading { border-left: 3px solid #8b5cf6; }
    .udbhav-toast--info    { border-left: 3px solid #8b5cf6; }

    /* ── Message ─────────────────── */
    .udbhav-toast__msg {
      flex: 1;
      min-width: 0;
    }
    .udbhav-toast__title {
      font-weight: 600;
      color: #fff;
    }
    .udbhav-toast__sub {
      font-size: 0.8rem;
      color: rgba(255,255,255,0.45);
      margin-top: 2px;
    }

    /* ── Dismiss button ─────────────────── */
    .udbhav-toast__close {
      flex-shrink: 0;
      background: none; border: none; padding: 0;
      color: rgba(255,255,255,0.3);
      cursor: pointer;
      line-height: 1;
      font-size: 1rem;
      transition: color 0.15s;
      margin-top: -1px;
    }
    .udbhav-toast__close:hover { color: rgba(255,255,255,0.7); }

    /* ── Spinner ─────────────────── */
    .toast-spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(139,92,246,0.25);
      border-top-color: #8b5cf6;
      border-radius: 50%;
      animation: toast-spin 0.7s linear infinite;
    }
    @keyframes toast-spin { to { transform: rotate(360deg); } }

    /* ── Mobile: full-width bottom sheet ─────────────── */
    @media (max-width: 480px) {
      #udbhav-toast-container {
        bottom: 0.75rem;
        right: 0.75rem;
        left: 0.75rem;
        max-width: 100%;
      }
    }
  `;
  document.head.appendChild(style);
}

// ── Container singleton ──────────────────────────────────────────────────────
function getContainer() {
  let c = document.getElementById('udbhav-toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'udbhav-toast-container';
    c.setAttribute('role', 'region');
    c.setAttribute('aria-label', 'Notifications');
    c.setAttribute('aria-live', 'polite');
    document.body.appendChild(c);
  }
  return c;
}

// ── Icon SVGs ────────────────────────────────────────────────────────────────
const ICONS = {
  success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  error:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  loading: `<div class="toast-spinner" aria-hidden="true"></div>`,
  info:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

// ── Core show function ───────────────────────────────────────────────────────
/**
 * @param {string}  message   - Main toast text (required)
 * @param {object}  [opts]
 * @param {'success'|'error'|'loading'|'info'} [opts.type='info']
 * @param {string}  [opts.sub]        - Optional sub-text below main message
 * @param {number}  [opts.duration]   - Auto-dismiss ms. 0 = never. Default 4000.
 * @returns {function} dismiss — call to remove the toast immediately
 */
function show(message, opts = {}) {
  injectStyles();
  const container = getContainer();

  const {
    type     = 'info',
    sub      = '',
    duration = type === 'loading' ? 0 : 4500,
  } = opts;

  const el = document.createElement('div');
  el.className = `udbhav-toast udbhav-toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `
    <div class="udbhav-toast__icon">${ICONS[type] ?? ICONS.info}</div>
    <div class="udbhav-toast__msg">
      <div class="udbhav-toast__title">${message}</div>
      ${sub ? `<div class="udbhav-toast__sub">${sub}</div>` : ''}
    </div>
    <button class="udbhav-toast__close" aria-label="Dismiss notification">&#x2715;</button>
  `;

  container.appendChild(el);

  let timer = null;

  function dismiss() {
    if (timer) clearTimeout(timer);
    if (!el.isConnected) return;
    el.classList.add('toast-exit');
    setTimeout(() => el.remove(), 230);
  }

  el.querySelector('.udbhav-toast__close').addEventListener('click', dismiss);

  if (duration > 0) {
    timer = setTimeout(dismiss, duration);
  }

  return dismiss;
}

// ── Public API ───────────────────────────────────────────────────────────────
export const toast = {
  /**
   * @param {string} message
   * @param {string} [sub]     optional sub-line
   * @param {number} [duration] ms, default 4500
   */
  success(message, sub = '', duration = 4500) {
    return show(message, { type: 'success', sub, duration });
  },

  /**
   * @param {string} message
   * @param {string} [sub]
   * @param {number} [duration] ms, default 6000 (errors stay longer)
   */
  error(message, sub = '', duration = 6000) {
    return show(message, { type: 'error', sub, duration });
  },

  /**
   * Shows a persistent loading toast.
   * @param {string} message
   * @returns {function} dismiss — call when the operation completes
   */
  loading(message) {
    return show(message, { type: 'loading', duration: 0 });
  },

  /**
   * @param {string} message
   * @param {string} [sub]
   * @param {number} [duration]
   */
  info(message, sub = '', duration = 4500) {
    return show(message, { type: 'info', sub, duration });
  },
};
