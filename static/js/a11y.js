// Accessibility enhancements for keyboard + screen-reader users.
//
// Several primary controls in TaiAi are authored as click-only <div>s
// (most notably the whole sidebar navigation: New Chat, Search, Brain,
// Calendar, Compare, Cookbook, Deep Research, Gallery, Library, Notes,
// Tasks, Theme, plus the account row). <div>s are not in the tab order and
// are not announced as buttons, so keyboard and screen-reader users cannot
// reach or operate them.
//
// This module enhances those rows in place — making them focusable
// (tabindex=0), announcing them as buttons when it's safe to do so, and
// activating them with Enter / Space — without changing how they look or
// how they behave for mouse users. The visible focus ring already exists in
// style.css (`.list-item:focus-visible`); it simply never fired because the
// rows were never focusable.

(function () {
  'use strict';

  // Click-as-button rows we want reachable by keyboard.
  var ROW_SELECTOR = ['#sidebar .list-item', '#user-bar-profile'].join(',');

  // Native interactive descendants. If a row contains one of these we must
  // NOT give the row role="button" — a button inside a button is invalid
  // (axe "nested-interactive") and confuses screen readers. Such rows still
  // become focusable + Enter/Space-activatable, just without the role.
  var NESTED_INTERACTIVE =
    'a[href],button,input,select,textarea,[contenteditable="true"],[tabindex]:not([tabindex="-1"])';

  function enhanceRow(el) {
    if (!el || el.nodeType !== 1 || el.dataset.a11yEnhanced === '1') return;
    var tag = el.tagName;
    // Leave genuine native controls alone.
    if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' ||
        tag === 'SELECT' || tag === 'TEXTAREA') return;

    el.dataset.a11yEnhanced = '1';
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.setAttribute('data-a11y-activatable', '1');

    if (!el.querySelector(NESTED_INTERACTIVE) && !el.hasAttribute('role')) {
      el.setAttribute('role', 'button');
    }

    // Guarantee an accessible name. Visible text normally supplies it; fall
    // back to the title attribute for icon-only rows.
    if (!el.getAttribute('aria-label') &&
        !(el.textContent || '').trim() &&
        el.getAttribute('title')) {
      el.setAttribute('aria-label', el.getAttribute('title'));
    }
  }

  function enhanceAll(root) {
    (root || document).querySelectorAll(ROW_SELECTOR).forEach(enhanceRow);
  }

  // ---- Modal dialogs -----------------------------------------------------
  // TaiAi modals are plain <div class="modal-content"> boxes. Marking
  // them as ARIA dialogs lets screen readers announce them as dialogs and
  // exempts their content from the "all content in landmarks" rule. We also
  // normalize the modal title to heading level 2 (one below the page <h1>)
  // so heading order stays valid no matter which tag the markup uses.
  var titleSeq = 0;
  // Each modal "kind" is a container selector plus where to find its title
  // heading. Standard modals use .modal-content/.modal-header; the docked
  // Notes pane uses its own markup.
  var MODAL_KINDS = [
    {
      sel: '.modal-content',
      heading: '.modal-header h1, .modal-header h2, .modal-header h3, ' +
               '.modal-header h4, .modal-header h5, .modal-header h6'
    },
    { sel: '.notes-pane', heading: '.notes-pane-title' }
  ];
  var MODAL_SEL = MODAL_KINDS.map(function (k) { return k.sel; }).join(',');

  function enhanceModal(mc, headingSel) {
    if (!mc || mc.nodeType !== 1 || mc.dataset.a11yDialog === '1') return;
    mc.dataset.a11yDialog = '1';
    if (!mc.hasAttribute('role')) mc.setAttribute('role', 'dialog');
    if (!mc.hasAttribute('aria-modal')) mc.setAttribute('aria-modal', 'true');

    var heading = headingSel && mc.querySelector(headingSel);
    if (heading) {
      if (!heading.id) heading.id = 'a11y-modal-title-' + (++titleSeq);
      if (!mc.hasAttribute('aria-labelledby')) {
        mc.setAttribute('aria-labelledby', heading.id);
      }
      // Modal titles sit one level below the page <h1>; normalize so heading
      // order stays valid regardless of the tag the markup happens to use.
      if (!heading.hasAttribute('aria-level')) heading.setAttribute('aria-level', '2');
    }

    // Focus trap + focus return: when a modal opens, focus moves inside;
    // while open, Tab / Shift-Tab are constrained to focusable elements
    // inside the modal; when the modal closes, focus returns to the element
    // that triggered it (the previously-focused element before open).
    installFocusTrap(mc);
  }

  // Selector matching everything that can receive focus by keyboard.
  var FOCUSABLE_SEL = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])', 'audio[controls]', 'video[controls]',
    'details > summary'
  ].join(',');

  function installFocusTrap(modalEl) {
    if (!modalEl) return;
    var previouslyFocused = null;
    function focusable() {
      var nodes = modalEl.querySelectorAll(FOCUSABLE_SEL);
      var list = [];
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.offsetWidth === 0 && n.offsetHeight === 0) continue;
        if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') continue;
        list.push(n);
      }
      return list;
    }
    function onKeydown(e) {
      if (e.key !== 'Tab') return;
      var items = focusable();
      if (items.length === 0) { e.preventDefault(); return; }
      var first = items[0], last = items[items.length - 1];
      var active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !modalEl.contains(active)) { e.preventDefault(); last.focus(); }
      } else {
        if (active === last) { e.preventDefault(); first.focus(); }
      }
    }
    // Observe class changes to install/uninstall the trap exactly when the
    // modal becomes visible/hidden. Cheap (only fires on transition).
    var obs = new MutationObserver(function () {
      var hidden = modalEl.classList.contains('hidden')
                || (modalEl.style && modalEl.style.display === 'none');
      if (hidden) {
        modalEl.removeEventListener('keydown', onKeydown, true);
        // Restore focus to the previously-focused element on close.
        if (previouslyFocused && typeof previouslyFocused.focus === 'function'
            && document.contains(previouslyFocused)) {
          try { previouslyFocused.focus(); } catch (_) {}
        }
        previouslyFocused = null;
      } else {
        modalEl.addEventListener('keydown', onKeydown, true);
        // Stash the element that had focus before the modal opened so we
        // can restore it on close. We can't detect "open" from a single
        // mutation event (the same transition that hides other modals
        // might show this one) — so stash on every visible transition and
        // trust the latest snapshot at close time.
        previouslyFocused = document.activeElement;
        // Move initial focus to the first focusable inside the modal,
        // falling back to the modal element itself so screen readers
        // announce the dialog.
        var items = focusable();
        if (items.length > 0) {
          try { items[0].focus(); } catch (_) {}
        } else {
          try { modalEl.focus(); } catch (_) {}
        }
      }
    });
    obs.observe(modalEl, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  function enhanceModals(root) {
    var scope = root || document;
    MODAL_KINDS.forEach(function (k) {
      scope.querySelectorAll(k.sel).forEach(function (mc) { enhanceModal(mc, k.heading); });
    });
  }

  function headingSelFor(el) {
    for (var i = 0; i < MODAL_KINDS.length; i++) {
      if (el.matches(MODAL_KINDS[i].sel)) return MODAL_KINDS[i].heading;
    }
    return null;
  }

  // Delegated keyboard activation. We only act when the focused element is
  // itself an enhanced row (keydown targets the focused element), so a press
  // on a nested native button is left to the browser's own handling.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var el = e.target;
    if (!el || !el.matches || !el.matches('[data-a11y-activatable]')) return;
    e.preventDefault(); // Space would otherwise scroll the page
    el.click();
  });

  function init() {
    enhanceAll(document);
    enhanceModals(document);

    // Sidebar content is re-rendered as the user navigates (session lists,
    // tool sub-rows, etc.). Watch for new rows and enhance them too.
    var sidebar = document.getElementById('sidebar');
    if (sidebar && 'MutationObserver' in window) {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n.nodeType !== 1) continue;
            if (n.matches && n.matches(ROW_SELECTOR)) enhanceRow(n);
            if (n.querySelectorAll) enhanceAll(n);
          }
        }
      }).observe(sidebar, { childList: true, subtree: true });
    }

    // Some modals (Notes, Tasks, …) are injected at runtime, usually as
    // direct children of <body>. Catch those without paying for a deep
    // subtree observer over the whole document.
    if ('MutationObserver' in window) {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n.nodeType !== 1) continue;
            if (n.matches && n.matches(MODAL_SEL)) enhanceModal(n, headingSelFor(n));
            if (n.querySelector && n.querySelector(MODAL_SEL)) enhanceModals(n);
          }
        }
      }).observe(document.body, { childList: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
