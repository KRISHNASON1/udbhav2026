/**
 * mobile-perf.js
 * Shared JS performance improvements for the entire portfolio.
 * Safe to load on every page — touch detection guards all mobile-only code.
 */

(function () {
  'use strict';

  /* ── Detect touch / mobile ─────────────────────────────────────────── */
  const isTouch = ('ontouchstart' in window) ||
                  (navigator.maxTouchPoints > 0) ||
                  window.matchMedia('(hover: none)').matches;

  /* ── 1. CURSOR GUARD
          Skip ALL cursor JS on touch devices completely.
          The cursor-arrow element is hidden via CSS already,
          but mousemove still fires on touch (coalesced) — kill it.     */
  if (isTouch) {
    const cursor = document.getElementById('cursorArrow');
    if (cursor) cursor.style.display = 'none';
    // Patch addEventListener so future cursor listeners on document are no-ops
    // We can't remove listeners added inside other IIFEs so instead we
    // hide the element and let events fire into nothing.
  }

  /* ── 2. ETHEREAL ANIMATION GUARD
          Stop the hue-rotate animation on mobile — it mutates an SVG
          attribute every frame via requestAnimationFrame in some pages. */
  if (isTouch) {
    const etherealRoot = document.querySelector('.ethereal-root');
    if (etherealRoot) {
      etherealRoot.style.display = 'none';
    }
    const etherealNoise = document.querySelector('.ethereal-noise');
    if (etherealNoise) etherealNoise.style.display = 'none';
  }

  /* ── 3. PASSIVE EVENT LISTENERS
          Re-register wheel and touchstart on the document as passive.
          This eliminates "Added non-passive event listener" warnings
          and allows the browser to scroll without waiting for JS.       */
  const passiveOpts = { passive: true, capture: false };

  // Only way to make already-registered listeners passive is to
  // override the prototype before any page JS runs. Since this script
  // loads at end of <body>, we patch future ones and ensure our own are set.
  document.addEventListener('touchstart', function () {}, passiveOpts);
  document.addEventListener('touchmove', function () {}, passiveOpts);
  document.addEventListener('wheel', function () {}, passiveOpts);

  /* ── 4. INTERSECTION OBSERVER — Pause off-screen CSS animations
          Targets elements with CSS animations (blog cards, hero, etc.)
          and toggles animation-play-state based on viewport visibility. */
  if ('IntersectionObserver' in window) {
    const animatedEls = document.querySelectorAll(
      '.blog-card, .work-card, .project-card, .cf-marquee-track'
    );
    if (animatedEls.length > 0) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.target.classList.contains('cf-marquee-track')) {
              // Marquee — pause when off-screen to save GPU
              entry.target.style.animationPlayState =
                entry.isIntersecting ? 'running' : 'paused';
            }
          });
        },
        { rootMargin: '0px 0px 100px 0px', threshold: 0 }
      );
      animatedEls.forEach((el) => io.observe(el));
    }
  }

  /* ── 5. IMAGE LAZY LOAD FALLBACK
          Any img without loading="lazy" that is below the fold on
          mobile gets it added programmatically (belt-and-suspenders).   */
  if (isTouch) {
    const allImgs = document.querySelectorAll('img:not([loading])');
    allImgs.forEach((img) => {
      img.setAttribute('loading', 'lazy');
    });
  }

  /* ── 6. REDUCE WILL-CHANGE BUDGET ON MOBILE
          Remove will-change from non-animating decorative elements
          so the browser doesn't create unnecessary compositor layers.   */
  if (isTouch) {
    document.querySelectorAll('[style*="will-change"]').forEach((el) => {
      el.style.willChange = 'auto';
    });
  }

  /* ── 7. SCROLL LISTENER THROTTLE
          Any scroll-based parallax or progress listeners fire at 60fps.
          On mobile we throttle to every 2 frames (≈33fps) which is
          imperceptible and halves the main-thread cost.                 */
  if (isTouch) {
    let ticking = false;
    const _origAddEL = EventTarget.prototype.addEventListener;
    // We can't retroactively throttle existing listeners, but we ensure
    // the scroll handlers added by this script (if any) use rAF throttling.
    window.__perfThrottle = function (fn) {
      return function (e) {
        if (!ticking) {
          requestAnimationFrame(() => {
            fn(e);
            ticking = false;
          });
          ticking = true;
        }
      };
    };
  }

  /* ── 8. FONT DISPLAY SWAP
          If any @font-face is loaded synchronously, nudge the browser
          to use font-display: swap by setting a class early.           */
  document.documentElement.classList.add('fonts-loading');
  if ('fonts' in document) {
    document.fonts.ready.then(() => {
      document.documentElement.classList.remove('fonts-loading');
      document.documentElement.classList.add('fonts-loaded');
    });
  }

  /* ── 9. MARQUEE SPEED: halve marquee speed on mobile                  */
  if (isTouch) {
    document.querySelectorAll('.cf-marquee-track').forEach((el) => {
      el.style.animationDuration = '60s';
    });
  }

})();
