/**
 * clock.js — SVG Analog Clock using user-provided assets
 * ─────────────────────────────────────────────────────────────────
 * Assets (all in /public/):
 *   /dial.svg        — 416×412, clock centre at (205, 205)
 *   /hand-hour.svg   — 84×64,   pivot at (70.5, 51.1)
 *   /hand-minute.svg — 15×123,  pivot at (7.5, 115.5)  [points up ✓]
 *   /hand-second.svg — 108×67,  pivot at (10.5, 56.3)
 *
 * Strategy:
 *   1. A container div fills .clock-wrap.
 *   2. The dial img fills the container → sets rendered scale factor (sf).
 *   3. Each hand img is positioned so its pivot aligns with the
 *      clock centre, scaled by sf.
 *   4. transform-origin is set to the pivot point (in CSS pixels).
 *   5. RAF loop animates with real Date() + ms interpolation.
 *
 * Rotation offsets (natural direction → 12 o'clock):
 *   minute  0°   (already points straight up)
 *   hour  +54.7° (tip is upper-left; rotate CW to point up)
 *   second −60.5° (tip is upper-right; rotate CCW to point up)
 * ─────────────────────────────────────────────────────────────────
 */

// ── Dial geometry ─────────────────────────────────────────────────
const DIAL_W = 416;     // dial SVG viewBox width
const DIAL_H = 412;     // dial SVG viewBox height
const CX     = 205;     // clock centre X in dial SVG space
const CY     = 205;     // clock centre Y in dial SVG space

// ── Hand descriptors ──────────────────────────────────────────────
// px, py  = pivot point inside the hand's native SVG coordinate space
// offset  = degrees to ADD so that rotate(0) → hand points at 12
const HANDS = [
  { id: 'clockHour',   src: '/clock/hand-hour.svg',   svgW: 84,  svgH: 64,  px: 70.5, py: 51.1,  offset:  54.7 },
  { id: 'clockMinute', src: '/clock/hand-minute.svg',  svgW: 15,  svgH: 123, px:  7.5, py: 115.5, offset:   0   },
  { id: 'clockSecond', src: '/clock/hand-second.svg',  svgW: 108, svgH: 67,  px: 10.5, py:  56.3, offset: -60.5 },
];

export function initAnalogClock3D() {

  const wrap = document.querySelector('.clock-wrap');
  if (!wrap) return;

  // ── Inject component CSS once ───────────────────────────────────
  if (!document.getElementById('svg-clock-css')) {
    const s = document.createElement('style');
    s.id = 'svg-clock-css';
    s.textContent = SVG_CLOCK_CSS;
    document.head.appendChild(s);
  }

  // ── Build DOM ───────────────────────────────────────────────────
  const container = document.createElement('div');
  container.className = 'svg-clock';
  container.id = 'svgClock';

  // Dial — fills container, its rendered width gives us scale factor
  const dialImg = document.createElement('img');
  dialImg.src = '/clock/dial.svg';
  dialImg.className = 'svg-clock__dial';
  dialImg.alt = 'Clock dial';
  dialImg.draggable = false;
  container.appendChild(dialImg);

  // Hands
  const handEls = {};
  for (const h of HANDS) {
    const img = document.createElement('img');
    img.src = h.src;
    img.id  = h.id;
    img.className = 'svg-clock__hand';
    img.alt = '';
    img.draggable = false;
    container.appendChild(img);
    handEls[h.id] = img;
  }

  wrap.innerHTML = '';
  wrap.appendChild(container);

  // ── Layout: scale + position hands ─────────────────────────────
  // Called once on load and on every resize.
  function layout() {
    // Rendered width of the dial img = container CSS width
    const renderedW = dialImg.clientWidth || container.clientWidth || 260;
    const sf = renderedW / DIAL_W;   // scale factor

    // Clock centre in CSS pixels
    const cx = CX * sf;
    const cy = CY * sf;

    for (const h of HANDS) {
      const el = handEls[h.id];
      if (!el) continue;

      const w  = h.svgW * sf;   // rendered hand width
      const ht = h.svgH * sf;   // rendered hand height

      // Position so the pivot pixel (h.px * sf, h.py * sf) lands on (cx, cy)
      el.style.width  = `${w}px`;
      el.style.height = `${ht}px`;
      el.style.left   = `${cx - h.px * sf}px`;
      el.style.top    = `${cy - h.py * sf}px`;

      // transform-origin at the pivot IN THE IMG'S OWN CSS SPACE
      el.style.transformOrigin = `${h.px * sf}px ${h.py * sf}px`;
    }
  }

  // Layout after dial loads, and on every resize
  dialImg.addEventListener('load', layout);
  new ResizeObserver(layout).observe(container);
  // Immediate attempt (may be from browser cache)
  requestAnimationFrame(layout);


  // ── Animation loop ─────────────────────────────────────────────
  // Smooth (no tick): interpolate with milliseconds
  //   second° = (s + ms/1000) × 6     → 360° per 60s
  //   minute° = (m + s/60)   × 6     → 360° per 60m
  //   hour°   = (h + m/60)   × 30    → 360° per 12h
  function tick() {
    const now = new Date();
    const ms  = now.getMilliseconds();
    const sec = now.getSeconds()           + ms  / 1000;
    const min = now.getMinutes()           + sec / 60;
    const hr  = (now.getHours() % 12)     + min / 60;

    const degS = sec * 6;
    const degM = min * 6;
    const degH = hr  * 30;

    // Apply rotation + natural-direction offset for each hand
    handEls['clockHour'].style.transform   = `rotate(${degH + 54.7}deg)`;
    handEls['clockMinute'].style.transform = `rotate(${degS + 0}deg)`;      // minute SVG → second-hand speed
    handEls['clockSecond'].style.transform = `rotate(${degM - 60.5}deg)`;   // second SVG → minute-hand speed

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

// ── Component CSS ─────────────────────────────────────────────────
const SVG_CLOCK_CSS = `

/* Container — sized by .clock-wrap */
.svg-clock {
  position: relative;
  width: 100%;
  transition: transform 0.3s cubic-bezier(.22,.68,0,1.2);
  transform-style: preserve-3d;
}

/* Dial fills the container, drives the aspect ratio */
.svg-clock__dial {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
  pointer-events: none;
}

/* All hands are positioned absolute, sized + placed by layout() */
.svg-clock__hand {
  position: absolute;
  user-select: none;
  pointer-events: none;
  will-change: transform;     /* GPU layer for smooth 60fps */
}

/* Second hand — subtle red drop shadow */
#clockSecond {
  filter: drop-shadow(0 1px 2px rgba(180,20,20,0.25));
}
`;
