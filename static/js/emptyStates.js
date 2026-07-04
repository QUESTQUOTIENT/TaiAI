/**
 * Shared empty-state + first-use messages.
 *
 * Renders a small reusable "empty" panel with a glyph, headline, hint,
 * and (optionally) a primary action button. Drop into any list view
 * that comes up empty so the user knows what to do next instead of
 * staring at a blank panel.
 *
 * Usage:
 *   renderEmpty(container, {
 *     glyph: '📓',  // small SVG path or 1-3 chars of text (no emoji)
 *     title: 'No notes yet',
 *     hint:  'Notes auto-save as you type. Click + to create one.',
 *     action: { label: 'Create note', href: '#' },  // optional
 *   });
 */

const _SVG_INFO = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

function _esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function renderEmpty(container, opts) {
  if (!container) return null;
  const o = Object.assign({
    glyph: null,           // SVG innerHTML or short text (no emoji)
    title: 'Nothing here yet',
    hint: '',
    action: null,          // {label, href, onClick}
    compact: false,
  }, opts || {});

  const wrap = document.createElement('div');
  wrap.className = 'tai-empty-state' + (o.compact ? ' tai-empty-compact' : '');
  wrap.setAttribute('role', 'note');

  let glyph = o.glyph;
  if (glyph === null || glyph === undefined) glyph = _SVG_INFO;

  wrap.innerHTML = ''
    + (glyph ? '<div class="tai-empty-glyph">' + glyph + '</div>' : '')
    + '<div class="tai-empty-title">' + _esc(o.title) + '</div>'
    + (o.hint ? '<div class="tai-empty-hint">' + _esc(o.hint) + '</div>' : '')
    + (o.action ? '<button type="button" class="tai-empty-action">'
                 + _esc(o.action.label) + '</button>' : '');

  if (o.action) {
    const btn = wrap.querySelector('.tai-empty-action');
    if (btn) {
      btn.onclick = (e) => {
        if (typeof o.action.onClick === 'function') o.action.onClick(e);
        else if (o.action.href) location.href = o.action.href;
      };
    }
  }
  container.innerHTML = '';
  container.appendChild(wrap);
  return wrap;
}

// Convenience presets so callers don't have to repeat copy.

export const EMPTY = {
  sessions: () => ({
    glyph: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    title: 'No chats yet',
    hint:  'Start a conversation in the box below. Your first message creates a chat that you can return to from this list.',
  }),
  notes: () => ({
    glyph: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h5"/></svg>',
    title: 'No notes yet',
    hint:  'Notes are saved as you type. Click + in the Notes sidebar to create your first one.',
  }),
  tasks: () => ({
    glyph: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="13" y2="14"/></svg>',
    title: 'No scheduled tasks',
    hint:  'Tasks run on a schedule and can trigger the agent. Add one in Settings > Tasks, or via the agent with "schedule this for tomorrow".',
  }),
  gallery: () => ({
    glyph: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    title: 'Gallery is empty',
    hint:  'Generated images from chat, image prompts, and uploads land here. Try asking the model to "draw a cat" to see one appear.',
  }),
  library: () => ({
    glyph: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    title: 'No archived documents',
    hint:  'When you close a document without deleting it, it moves here. Open the Document tab to start writing.',
  }),
  calendar: () => ({
    glyph: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    title: 'No events today',
    hint:  'Click any empty slot on the calendar to add an event, or ask the agent to schedule something for you.',
  }),
  email: () => ({
    glyph: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
    title: 'Inbox is empty',
    hint:  'Connect an IMAP account in Settings > Email to start fetching messages. AI triage tags + summarizes each one.',
  }),
  documents: () => ({
    glyph: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    title: 'No documents open',
    hint:  'Open or create a document from the Library tab. Supports Markdown, HTML, CSV, and PDF.',
  }),
  memories: () => ({
    glyph: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg>',
    title: 'No memories yet',
    hint:  'The agent learns facts about you over time and stores them here. You can also add memories manually from the Brain panel.',
  }),
  search: () => ({
    glyph: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="10" r="7"/><path d="M21 21l-4.35-4.35"/></svg>',
    title: 'No results',
    hint:  'Try different keywords or check spelling.',
  }),
};
