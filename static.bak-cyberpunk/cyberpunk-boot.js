/* ============================================================
   TaiAi Cyberpunk — boot.js
   Installs micro-interactions on top of the static markup:
   • IntersectionObserver stagger (data-cyber-stagger)
   • Magnetic-pull on CTAs (data-cyber-magnetic)
   • 3D tilt on cards (data-cyber-tilt)
   • Text-scramble reveal (window.cyScramble + data-cyber-scramble)
   • View Transitions API hook for in-app navigation
   • prefers-reduced-motion respect (no-ops everything when reduced)
   Idempotent — safe to load multiple times. ~80 lines.
   ============================================================ */
(function () {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (REDUCED) return;

  const ready = (fn) => {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  };

  /* --- 1. Stagger on scroll/enter --------------------------- */
  function installStagger() {
    const groups = document.querySelectorAll('[data-cyber-stagger]');
    if (!groups.length) return;
    // Tag each child with --i index, then observe.
    groups.forEach((g) => {
      Array.from(g.children).forEach((c, i) => {
        if (!c.style.getPropertyValue('--i')) c.style.setProperty('--i', i);
      });
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('cy-in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    groups.forEach((g) => io.observe(g));
    // Force-show any already-visible groups (e.g. sidebar-inner on first paint)
    requestAnimationFrame(() => {
      groups.forEach((g) => {
        const r = g.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) g.classList.add('cy-in');
      });
    });
  }

  /* --- 2. Magnetic pull on CTAs ---------------------------- */
  function installMagnetic() {
    document.querySelectorAll('[data-cyber-magnetic]').forEach((el) => {
      if (el.__cy_mag) return; el.__cy_mag = 1;
      const strength = 0.25;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const mx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const my = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        el.style.setProperty('--mx', (mx * strength).toFixed(3));
        el.style.setProperty('--my', (my * strength).toFixed(3));
        el.style.transform = `translate(calc(var(--mx, 0) * 8px), calc(var(--my, 0) * 8px))`;
      });
      el.addEventListener('pointerleave', () => {
        el.style.transform = '';
        el.style.setProperty('--mx', 0);
        el.style.setProperty('--my', 0);
      });
    });
  }

  /* --- 3. 3D tilt on cards --------------------------------- */
  function installTilt() {
    document.querySelectorAll('[data-cyber-tilt]').forEach((el) => {
      if (el.__cy_tilt) return; el.__cy_tilt = 1;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const rx = ((e.clientY - (r.top + r.height / 2)) / (r.height / 2)) * -6;
        const ry = ((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * 6;
        el.style.setProperty('--rx', rx.toFixed(2) + 'deg');
        el.style.setProperty('--ry', ry.toFixed(2) + 'deg');
        el.style.transform = 'perspective(800px) rotateX(var(--rx)) rotateY(var(--ry))';
      });
      el.addEventListener('pointerleave', () => {
        el.style.transform = '';
        el.style.setProperty('--rx', 0);
        el.style.setProperty('--ry', 0);
      });
    });
  }

  /* --- 4. Text scramble ----------------------------------- */
  const SCRAMBLE_CHARS = '!<>-_\\/[]{}—=+*^?#________';
  window.cyScramble = function (el, targetText, opts = {}) {
    if (!el || el.__cy_scrambling) return;
    el.__cy_scrambling = 1;
    const duration = opts.duration || 700;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const revealed = Math.floor(targetText.length * t);
      let out = '';
      for (let i = 0; i < targetText.length; i++) {
        if (i < revealed) out += targetText[i];
        else if (targetText[i] === ' ') out += ' ';
        else out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }
      el.textContent = out;
      if (t < 1) requestAnimationFrame(tick);
      else { el.textContent = targetText; el.__cy_scrambling = 0; }
    };
    requestAnimationFrame(tick);
  };

  function installScramble() {
    document.querySelectorAll('[data-cyber-scramble]').forEach((el) => {
      const final = el.getAttribute('data-text') || el.textContent;
      // Preserve child structure if it had spans — we only scramble the
      // text nodes directly. For the login logo, we restore the spans after.
      const html = el.innerHTML;
      window.cyScramble(el, final, { duration: 900 });
      setTimeout(() => {
        // Restore the original markup (e.g. <span>Tai</span><span>Ai</span>)
        if (html && el.__cy_scrambling === undefined) el.innerHTML = html;
      }, 950);
    });
  }

  /* --- 5. View Transitions for in-app links --------------- */
  function installViewTransitions() {
    const orig = document.startViewTransition;
    if (typeof orig === 'function') {
      document.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('a[href^="/"]:not([target]):not([download]):not([data-no-vt])');
        if (!a) return;
        const href = a.getAttribute('href');
        if (!href || href.startsWith('//') || href.startsWith('/static') || href.startsWith('/api')) return;
        // Allow modifier-key clicks (new tab/window) to pass through.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        document.startViewTransition(() => { window.location.href = href; });
      });
    }
  }

  /* --- Boot ----------------------------------------------- */
  ready(() => {
    installStagger();
    installMagnetic();
    installTilt();
    installScramble();
    installViewTransitions();
  });

  // Re-install when new stagger/magnetic/tilt nodes appear (sessions.js,
  // memory.js etc. inject DOM dynamically).
  const mo = new MutationObserver((muts) => {
    let needsReinstall = false;
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (!(n instanceof Element)) return;
        if (n.matches && (n.matches('[data-cyber-stagger],[data-cyber-magnetic],[data-cyber-tilt],[data-cyber-scramble]'))) {
          needsReinstall = true;
        }
        if (n.querySelectorAll) {
          if (n.querySelectorAll('[data-cyber-stagger],[data-cyber-magnetic],[data-cyber-tilt],[data-cyber-scramble]').length) {
            needsReinstall = true;
          }
        }
      });
    }
    if (needsReinstall) {
      installStagger();
      installMagnetic();
      installTilt();
      installScramble();
    }
  });
  if (document.body) mo.observe(document.body, { childList: true, subtree: true });
  else document.addEventListener('DOMContentLoaded', () => mo.observe(document.body, { childList: true, subtree: true }), { once: true });
})();
