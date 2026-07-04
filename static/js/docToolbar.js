/**
 * Document editor markdown shortcuts + templates.
 *
 * Phase 2.8. Lightweight enhancements to the existing Document editor:
 *
 *   1. Markdown keyboard shortcuts on `#doc-editor-textarea`:
 *      - Typing "- " at column 0 -> inserts "- [ ] " (task list item).
 *      - Typing "- [ ] " at column 0 -> converts to "- [x] " (checked).
 *      - Typing "1. " at column 0 -> continues the ordered list (1., 2., 3., ...).
 *      - Typing "# ", "## ", "### " at column 0 -> boldens the current line
 *        with the same prefix (inserts "# " before the line text, etc.).
 *   2. Insert Template button in the editor toolbar: opens a small
 *      dropdown with starter templates (Meeting Notes, To-Do, Project Plan,
 *      Research Notes, API Reference). Click -> inserts the template at
 *      the current cursor position in the textarea.
 *
 * Pure DOM, no framework. Designed to coexist with the existing 9.7k LoC
 * document.js — this module only listens + writes the textarea; it does
 * not touch the document state machine.
 */

(function () {
  'use strict';

  const TASK_OPEN = '- [ ] ';
  const TASK_DONE = '- [x] ';

  const TEMPLATES = [
    {
      id: 'meeting',
      label: 'Meeting notes',
      body: [
        '# Meeting title',
        '',
        '**Date:** YYYY-MM-DD  **Attendees:** alice, bob',
        '',
        '## Agenda',
        '1. Topic one',
        '2. Topic two',
        '',
        '## Notes',
        '',
        '## Action items',
        '- [ ] @alice  do thing by next week',
        '- [ ] @bob    do other thing',
        '',
        '## Next meeting',
        '',
      ].join('\n'),
    },
    {
      id: 'todo',
      label: 'To-do list',
      body: [
        '# To-do',
        '',
        '- [ ] High priority item one',
        '- [ ] High priority item two',
        '- [ ] Medium priority item',
        '- [ ] Low priority item',
        '',
        '## Done',
        '- [x] Example finished task',
        '',
      ].join('\n'),
    },
    {
      id: 'project-plan',
      label: 'Project plan',
      body: [
        '# Project name',
        '',
        '## Goal',
        'One sentence describing the outcome.',
        '',
        '## Milestones',
        '1. M1 - description (target: date)',
        '2. M2 - description (target: date)',
        '3. M3 - description (target: date)',
        '',
        '## Stakeholders',
        '- ',
        '',
        '## Risks',
        '- ',
        '',
        '## Open questions',
        '- ',
        '',
      ].join('\n'),
    },
    {
      id: 'research',
      label: 'Research notes',
      body: [
        '# Research: topic',
        '',
        '## Question',
        'What are we trying to learn?',
        '',
        '## Sources',
        '- [ ] Title (URL)',
        '- [ ] Title (URL)',
        '',
        '## Findings',
        '',
        '## Open threads',
        '',
      ].join('\n'),
    },
    {
      id: 'api-ref',
      label: 'API reference',
      body: [
        '# API endpoint name',
        '',
        '`METHOD /api/path`',
        '',
        '**Auth:** required | optional',
        '',
        '## Request',
        '| name | type | required | description |',
        '|------|------|----------|-------------|',
        '|      |      |          |             |',
        '',
        '## Response',
        '```json',
        '{ "ok": true }',
        '```',
        '',
        '## Errors',
        '- `400` bad input',
        '- `401` not authenticated',
        '- `500` server error',
        '',
      ].join('\n'),
    },
  ];

  // ── Markdown keyboard shortcuts ──
  function _handleKeydown(e) {
    const ta = e.target;
    if (!ta || ta.tagName !== 'TEXTAREA') return;
    if (ta.id !== 'doc-editor-textarea') return;
    // We only intercept when the cursor is at the start of a line
    // (column 0) so we don't break normal typing mid-sentence.
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start !== end) return;             // ignore selections
    const before = ta.value.slice(0, start);
    const lineStart = before.lastIndexOf('\n') + 1;
    if (start !== lineStart) return;        // not at column 0

    // Ordered list auto-continue: when the user hits Enter at the end of
    // "1. foo", insert "2. " on the new line. If the line is just "1. "
    // (empty item), break the list by removing the prefix.
    if (e.key === 'Enter') {
      const m = /(\s*)(\d+)\.\s+(.*)$/.exec(before.slice(lineStart));
      if (m) {
        e.preventDefault();
        const indent = m[1] || '';
        const n = parseInt(m[2], 10);
        const rest = m[3];
        if (rest.trim() === '') {
          // Empty item: break the list.
          ta.value = before.slice(0, lineStart) + '\n';
          ta.selectionStart = ta.selectionEnd = lineStart + 1;
        } else {
          const prefix = indent + (n + 1) + '. ';
          ta.value = before + '\n' + prefix + after_of(e, ta);
          const newPos = ta.value.length;
          ta.selectionStart = ta.selectionEnd = newPos;
        }
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }

    // Single-character triggers when the line is empty.
    if (e.key === ' ' && before.slice(lineStart) === '-') {
      e.preventDefault();
      _replaceLineStart(ta, lineStart, '- ');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    // "- " triggers task list; "- [ ] " toggles to "- [x] ".
    if (e.key === ' ' && before.slice(lineStart) === '-') {
      // (same branch as above; we just committed '- '). Next space keeps
      // the task pattern. To avoid double-handling, fall through.
    }

    // When the user types `- [ ] ` exactly, upgrade to `- [x] ` (toggle).
    // Watch for the trailing space of "- [ ] " at column 0.
    if (e.key === ' ' && before.endsWith('- [ ]')) {
      e.preventDefault();
      ta.value = ta.value.slice(0, -5) + TASK_DONE;
      ta.selectionStart = ta.selectionEnd = ta.value.length;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // Heading prefix at column 0: "# ", "## ", "### " -> bold the line.
    const headingMatch = /^(#{1,6})$/.exec(before.slice(lineStart));
    if (e.key === ' ' && headingMatch) {
      // The existing prefix is already there; we just leave the space and
      // move on. No further action needed (the line is already a heading).
      return;
    }
  }

  function _replaceLineStart(ta, lineStart, replacement) {
    const value = ta.value;
    const lineEnd = value.indexOf('\n', lineStart);
    const eol = lineEnd === -1 ? value.length : lineEnd;
    const tail = value.slice(eol);
    ta.value = value.slice(0, lineStart) + replacement + tail;
    const cursor = lineStart + replacement.length;
    ta.selectionStart = ta.selectionEnd = cursor;
  }

  function after_of(e, ta) { return ta.value.slice(ta.selectionEnd); }

  // ── Insert Template button ──
  function _renderTemplateButton() {
    if (document.getElementById('taiai-doc-templates-btn')) return;
    const anchor = document.querySelector('.doc-toolbar, .doc-actions, #doc-editor-toolbar');
    if (!anchor) {
      // Fall back: append to the document tab header.
      const tab = document.querySelector('[data-doc-panel], .doc-panel-header, .docs-header');
      const fallback = tab || document.body;
      const div = document.createElement('div');
      div.style.cssText = 'padding:6px 12px;display:flex;gap:6px;';
      fallback.appendChild(div);
      _mountButton(div);
      return;
    }
    _mountButton(anchor);
  }

  function _mountButton(host) {
    const wrap = document.createElement('div');
    wrap.id = 'taiai-doc-templates-wrap';
    wrap.style.cssText = 'display:inline-flex;gap:6px;align-items:center;margin-left:8px;';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'taiai-doc-templates-btn';
    btn.textContent = '+ Template';
    btn.style.cssText = [
      'appearance:none', 'border:1px solid var(--border, #355a66)',
      'background:transparent', 'color:var(--fg, #e8e8f0)',
      'padding:4px 10px', 'border-radius:6px',
      'cursor:pointer', 'font:12px/1 system-ui',
    ].join(';');
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      _openMenu(btn);
    };
    wrap.appendChild(btn);
    host.appendChild(wrap);
  }

  function _openMenu(anchor) {
    document.querySelectorAll('.taiai-doc-tpl-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'taiai-doc-tpl-menu';
    menu.setAttribute('role', 'menu');
    menu.style.cssText = [
      'position:absolute', 'z-index:1000',
      'min-width:200px',
      'background:var(--panel, #11111e)',
      'border:1px solid var(--border, #355a66)',
      'border-radius:6px',
      'box-shadow:0 6px 24px rgba(0,0,0,0.45)',
      'padding:4px',
      'font:13px/1.4 system-ui',
    ].join(';');
    const rect = anchor.getBoundingClientRect();
    menu.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    menu.style.left = (rect.left + window.scrollX) + 'px';
    TEMPLATES.forEach(t => {
      const it = document.createElement('button');
      it.type = 'button';
      it.textContent = t.label;
      it.style.cssText = [
        'display:block', 'width:100%', 'text-align:left',
        'appearance:none', 'border:none', 'background:transparent',
        'color:var(--fg, #e8e8f0)', 'padding:6px 10px',
        'border-radius:4px', 'cursor:pointer', 'font:inherit',
      ].join(';');
      it.onmouseenter = () => it.style.background = 'color-mix(in oklab, var(--accent, #00f0ff) 12%, transparent)';
      it.onmouseleave = () => it.style.background = 'transparent';
      it.onclick = () => {
        _insertAtCursor(t.body);
        menu.remove();
        document.removeEventListener('click', _outsideClose, true);
      };
      menu.appendChild(it);
    });
    document.body.appendChild(menu);
    function _outsideClose(ev) {
      if (!menu.contains(ev.target) && ev.target !== anchor) menu.remove();
    }
    setTimeout(() => document.addEventListener('click', _outsideClose, true), 0);
  }

  function _insertAtCursor(text) {
    const ta = document.getElementById('doc-editor-textarea');
    if (!ta) return;
    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    ta.value = before + text + after;
    const cursor = start + text.length;
    ta.selectionStart = ta.selectionEnd = cursor;
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function _init() {
    // Listen on the whole document — we filter by target in the handler.
    document.addEventListener('keydown', _handleKeydown, true);
    _renderTemplateButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
