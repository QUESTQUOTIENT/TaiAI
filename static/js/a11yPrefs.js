/**
 * Reduced-motion detector + a11y preference bridge.
 *
 * Phase 1.5. Listens to `prefers-reduced-motion: reduce` and toggles
 * the `a11y-reduced-motion` body class so JS-driven transitions also
 * respect the user's system setting (CSS @media prefers-reduced-motion
 * already handles CSS transitions; this bridges the gap for the FLIP /
 * dock physics animations in modalManager.js).
 *
 * Also exposes a tiny window._TaiAiA11y API for the Settings → Themes
 * panel so users can opt into the high-contrast theme explicitly,
 * independent of their OS color-scheme setting.
 */

(function () {
  'use strict';

  const _motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const _contrastQuery = window.matchMedia ? window.matchMedia('(prefers-contrast: more)') : null;

  function _applyMotion() {
    if (!_motionQuery) return;
    document.body.classList.toggle('a11y-reduced-motion', _motionQuery.matches);
  }
  function _applyContrast() {
    if (!_contrastQuery) return;
    // Only auto-enable when the user hasn't explicitly picked a theme yet.
    let stored = null;
    try { stored = localStorage.getItem('TaiAi-a11y-high-contrast'); } catch (_) {}
    if (stored === '1') {
      document.body.classList.add('a11y-high-contrast');
      return;
    }
    if (stored === '0') {
      document.body.classList.remove('a11y-high-contrast');
      return;
    }
    // Default: follow OS preference but don't override an explicit theme choice.
    document.body.classList.toggle('a11y-high-contrast', _contrastQuery.matches);
  }

  if (_motionQuery) {
    if (_motionQuery.addEventListener) {
      _motionQuery.addEventListener('change', _applyMotion);
    } else if (_motionQuery.addListener) {
      // Older Safari
      _motionQuery.addListener(_applyMotion);
    }
    _applyMotion();
  }
  if (_contrastQuery) {
    if (_contrastQuery.addEventListener) {
      _contrastQuery.addEventListener('change', _applyContrast);
    } else if (_contrastQuery.addListener) {
      _contrastQuery.addListener(_applyContrast);
    }
    _applyContrast();
  }

  // Public API for Settings → Themes to toggle explicitly.
  window._TaiAiA11y = {
    setHighContrast(on) {
      try { localStorage.setItem('TaiAi-a11y-high-contrast', on ? '1' : '0'); } catch (_) {}
      document.body.classList.toggle('a11y-high-contrast', !!on);
    },
    isReducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); },
    isHighContrast() { return document.body.classList.contains('a11y-high-contrast'); },
  };
})();
