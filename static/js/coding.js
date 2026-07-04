// static/js/coding.js
// =============================================================================
// Coding tab — full-power build agent workspace.
//
// Architecture:
//   - Each project is a sandboxed directory under data/coding_sandboxes/<id>/.
//   - The user picks/creates a project, then can:
//       (a) Chat with the AI → backend runs a tool-calling loop where the
//           model can `bash`, `read_file`, `write_file`, `edit_file`,
//           `list_files`, `mkdir`, `delete_path`, `webfetch` in the sandbox.
//       (b) Browse/edit files manually in the editor pane.
//       (c) Run shell commands directly in the terminal pane.
//       (d) Preview index.html in an iframe.
// =============================================================================

import * as ui from './ui.js';

const $ = (sel) => document.querySelector(sel);

// ---------- DOM refs ---------------------------------------------------------

const elPrompt         = $('#coding-prompt');
const elSubmit         = $('#coding-submit-btn');
const elStop           = $('#coding-stop-btn');
const elEndpoint       = $('#coding-endpoint-select');
const elModel          = $('#coding-model-select');
const elStatus         = $('#coding-status');
const elLog            = $('#coding-log');

const elProjectSelect  = $('#coding-project-select');
const elProjectPath    = $('#coding-project-path');
const elNewProjectBtn  = $('#coding-new-project-btn');
const elDeleteProjectBtn = $('#coding-delete-project-btn');

const elFilesTree      = $('#coding-files-tree');
const elFilesEmpty     = $('#coding-files-empty');
const elNewFileBtn     = $('#coding-new-file-btn');
const elNewFolderBtn   = $('#coding-new-folder-btn');

const elEditorTabs     = $('#coding-editor-tabs');
const elEditorStatus   = $('#coding-editor-status');
const elEditorBody     = $('#coding-editor-body');
const elPlaceholder    = $('#coding-placeholder');
const elEditorTextarea = $('#coding-editor-textarea');
const elPreviewIframe  = $('#coding-preview-iframe');
const elSaveBtn        = $('#coding-save-btn');
const elCopyBtn        = $('#coding-copy-btn');
const elPreviewBtn     = $('#coding-preview-btn');

const elTerminalOutput = $('#coding-terminal-output');
const elTerminalForm   = $('#coding-terminal-form');
const elTerminalInput  = $('#coding-terminal-input');
const elTerminalPrompt = $('#coding-terminal-prompt');
const elTerminalClear  = $('#coding-terminal-clear');

const elChatMessages   = $('#coding-chat-messages');

// ---------- State ------------------------------------------------------------

const state = {
  projects: [],                // [{id, name, path, created}]
  currentProject: null,        // {id, name, path}
  tree: null,                  // last fetched tree
  openFiles: new Map(),        // path → {content, dirty, originalContent, language}
  activePath: null,
  modelsCatalog: { endpoints: [], models: [] },
  abort: null,
  streaming: false,
  terminal: {
    history: [],
    historyIdx: -1,
    currentCmd: null,           // id of in-flight command
    abort: null,
  },
};

// ---------- Helpers ----------------------------------------------------------

function setStatus(text, kind = '') {
  if (!elStatus) return;
  elStatus.textContent = text || '';
  elStatus.className = 'coding-status' + (kind ? ' ' + kind : '');
}

function logLine(text, kind = 'info') {
  if (!elLog) return;
  const div = document.createElement('div');
  div.className = 'log-line ' + kind;
  const ts = new Date().toLocaleTimeString([], { hour12: false });
  div.textContent = `[${ts}] ${text}`;
  elLog.appendChild(div);
  elLog.scrollTop = elLog.scrollHeight;
}

function appendChat(role, text, opts = {}) {
  if (!elChatMessages) return;
  // Remove the empty-state if present
  const empty = elChatMessages.querySelector('.coding-chat-empty');
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = 'coding-msg ' + role;
  if (opts.meta) {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = opts.meta;
    div.appendChild(meta);
  }
  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = text || '';
  div.appendChild(body);
  elChatMessages.appendChild(div);
  elChatMessages.scrollTop = elChatMessages.scrollHeight;
  return body;
}

function appendChatHTML(role, html, opts = {}) {
  if (!elChatMessages) return;
  const empty = elChatMessages.querySelector('.coding-chat-empty');
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = 'coding-msg ' + role;
  if (opts.meta) {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = opts.meta;
    div.appendChild(meta);
  }
  const body = document.createElement('div');
  body.className = 'msg-body';
  body.innerHTML = html;
  div.appendChild(body);
  elChatMessages.appendChild(div);
  elChatMessages.scrollTop = elChatMessages.scrollHeight;
  return body;
}

function updateLastChat(role, text) {
  const last = elChatMessages && elChatMessages.lastElementChild;
  if (!last || !last.classList.contains(role)) {
    return appendChat(role, text);
  }
  const body = last.querySelector('.msg-body');
  if (body) body.textContent = text;
  if (elChatMessages) elChatMessages.scrollTop = elChatMessages.scrollHeight;
  return body;
}

function setBusy(busy) {
  state.streaming = busy;
  if (elPrompt) elPrompt.disabled = busy;
  if (elSubmit) {
    elSubmit.disabled = busy || !(elPrompt.value || '').trim() || !state.currentProject;
    elSubmit.classList.toggle('streaming', busy);
    elSubmit.querySelector('span').textContent = busy ? 'Working…' : 'Send';
  }
  if (elStop) elStop.hidden = !busy;
  if (elEndpoint) elEndpoint.disabled = busy;
  if (elModel) elModel.disabled = busy;
}

// ---------- API helpers ------------------------------------------------------

async function apiListProjects() {
  const r = await fetch('/api/coding/projects', { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiCreateProject(name, template) {
  const r = await fetch('/api/coding/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ name, template: template || 'empty' }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiDeleteProject(id) {
  const r = await fetch(`/api/coding/projects/${id}`, { method: 'DELETE', credentials: 'same-origin' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiTree(id) {
  const r = await fetch(`/api/coding/projects/${id}/tree`, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiReadFile(id, path) {
  const r = await fetch(`/api/coding/projects/${id}/file?path=${encodeURIComponent(path)}`, {
    credentials: 'same-origin',
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiWriteFile(id, path, content) {
  const r = await fetch(`/api/coding/projects/${id}/file`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ path, content }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiMkdir(id, path) {
  const r = await fetch(`/api/coding/projects/${id}/mkdir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ path }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiRename(id, src, dst) {
  const r = await fetch(`/api/coding/projects/${id}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ src, dst }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiRm(id, path, recursive) {
  const r = await fetch(`/api/coding/projects/${id}/rm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ path, recursive: !!recursive }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ---------- Project picker ---------------------------------------------------

async function refreshProjects() {
  try {
    const data = await apiListProjects();
    state.projects = data.projects || [];
    renderProjectSelect();
  } catch (e) {
    console.error('refreshProjects failed', e);
    appendChat('system', `Failed to list projects: ${e.message}`);
  }
}

function renderProjectSelect() {
  if (!elProjectSelect) return;
  elProjectSelect.innerHTML = '';
  if (!state.projects.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— No projects yet, click + New —';
    opt.disabled = true;
    elProjectSelect.appendChild(opt);
    return;
  }
  for (const p of state.projects) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name || p.id;
    elProjectSelect.appendChild(opt);
  }
  if (state.currentProject) {
    elProjectSelect.value = state.currentProject.id;
  }
  updateProjectPathLabel();
}

function updateProjectPathLabel() {
  if (!elProjectPath) return;
  elProjectPath.textContent = state.currentProject ? state.currentProject.path : '';
}

async function selectProject(id) {
  const p = state.projects.find(p => p.id === id);
  if (!p) return;
  state.currentProject = p;
  state.openFiles.clear();
  state.activePath = null;
  await refreshTree();
  renderEditorTabs();
  showEditorPlaceholder();
  updateProjectPathLabel();
  // Auto-open README if present
  const readme = findInTree(state.tree, ['README.md', 'readme.md']);
  if (readme) await openFile(readme.path);
  setBusy(state.streaming);
  appendChat('system', `Opened project: ${p.name} (${p.path})`);
}

async function createProject() {
  const name = prompt('Project name?', 'My App');
  if (!name) return;
  const template = prompt(
    'Template?\n  empty — start blank\n  static — single index.html\n  node — package.json + server.js\n  python — main.py + requirements.txt',
    'node'
  );
  try {
    const p = await apiCreateProject(name.trim(), (template || 'empty').trim());
    appendChat('system', `Created project: ${p.name}`);
    await refreshProjects();
    elProjectSelect.value = p.id;
    await selectProject(p.id);
  } catch (e) {
    appendChat('system', `Create failed: ${e.message}`);
  }
}

async function deleteCurrentProject() {
  if (!state.currentProject) {
    appendChat('system', 'No project selected.');
    return;
  }
  if (!confirm(`Delete project "${state.currentProject.name}"? This cannot be undone.`)) return;
  try {
    await apiDeleteProject(state.currentProject.id);
    state.currentProject = null;
    state.openFiles.clear();
    state.activePath = null;
    state.tree = null;
    renderEditorTabs();
    showEditorPlaceholder();
    await refreshProjects();
    updateProjectPathLabel();
    appendChat('system', 'Project deleted.');
  } catch (e) {
    appendChat('system', `Delete failed: ${e.message}`);
  }
}

// ---------- File tree --------------------------------------------------------

async function refreshTree() {
  if (!state.currentProject) {
    state.tree = null;
    renderTree(null);
    return;
  }
  try {
    state.tree = await apiTree(state.currentProject.id);
    renderTree(state.tree);
  } catch (e) {
    console.error('refreshTree failed', e);
  }
}

function renderTree(node) {
  if (!elFilesTree) return;
  elFilesTree.innerHTML = '';
  if (!node) {
    if (elFilesEmpty) {
      elFilesEmpty.style.display = '';
      elFilesTree.appendChild(elFilesEmpty);
    }
    return;
  }
  if (elFilesEmpty) elFilesEmpty.style.display = 'none';
  for (const child of node.children || []) {
    elFilesTree.appendChild(renderTreeNode(child, 0));
  }
}

function renderTreeNode(node, depth) {
  const row = document.createElement('div');
  row.className = 'coding-file-item';
  row.dataset.path = node.path;
  row.dataset.type = node.type;
  row.style.paddingLeft = `${8 + depth * 14}px`;

  const icon = document.createElement('span');
  icon.className = 'file-icon';
  icon.textContent = node.type === 'dir' ? '📁' : fileLangIcon(node.path);
  row.appendChild(icon);

  const name = document.createElement('span');
  name.className = 'file-name';
  name.textContent = node.name;
  row.appendChild(name);

  if (node.type === 'file' && state.openFiles.get(node.path)?.dirty) {
    row.classList.add('dirty');
  }
  if (state.activePath === node.path) row.classList.add('active');

  if (node.type === 'file') {
    row.addEventListener('click', () => openFile(node.path));
  } else {
    row.addEventListener('click', () => toggleDir(row, node));
  }

  // Children container (lazy)
  const childrenBox = document.createElement('div');
  childrenBox.style.display = 'none';
  for (const c of node.children || []) {
    childrenBox.appendChild(renderTreeNode(c, depth + 1));
  }
  row.appendChild(childrenBox);
  row._childrenBox = childrenBox;
  if (node.type === 'dir') row._expanded = false;

  // Right-click for actions
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showRowMenu(e.clientX, e.clientY, node);
  });

  return row;
}

function toggleDir(row, node) {
  const expanded = !row._expanded;
  row._expanded = expanded;
  row._childrenBox.style.display = expanded ? '' : 'none';
  row.querySelector('.file-icon').textContent = expanded ? '📂' : '📁';
}

function fileLangIcon(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return ({
    html: '🌐', htm: '🌐', css: '🎨', scss: '🎨',
    js: '⚡', mjs: '⚡', cjs: '⚡', jsx: '⚛',
    ts: '⚡', tsx: '⚛', json: '📦', md: '📝',
    py: '🐍', rb: '💎', go: '🦫', rs: '🦀',
    sh: '💻', bash: '💻', yaml: '⚙', yml: '⚙',
    toml: '⚙', txt: '📄', env: '⚙', lock: '🔒',
    png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', svg: '🖼',
  })[ext] || '📄';
}

function findInTree(node, names) {
  if (!node) return null;
  if (node.type === 'file' && names.includes(node.name)) return node;
  for (const c of node.children || []) {
    const found = findInTree(c, names);
    if (found) return found;
  }
  return null;
}

function showRowMenu(x, y, node) {
  const existing = document.getElementById('coding-row-menu');
  if (existing) existing.remove();
  const menu = document.createElement('div');
  menu.id = 'coding-row-menu';
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:1000;background:#0a0a13;border:1px solid var(--cy-line);border-radius:4px;padding:4px;display:flex;flex-direction:column;gap:2px;font-size:12px;font-family:'Fira Code',monospace;box-shadow:0 4px 16px rgba(0,0,0,0.6);`;
  const items = [];
  if (node.type === 'dir') {
    items.push({ label: '+ New file here', act: () => promptCreate('file', node.path) });
    items.push({ label: '+ New folder here', act: () => promptCreate('folder', node.path) });
  }
  items.push({ label: 'Rename…', act: () => promptRename(node) });
  items.push({ label: 'Delete…', act: () => confirmDelete(node) });
  for (const it of items) {
    const b = document.createElement('button');
    b.textContent = it.label;
    b.style.cssText = 'background:transparent;border:0;color:#e6f1ff;cursor:pointer;padding:4px 12px;text-align:left;font-family:inherit;font-size:inherit;border-radius:3px;';
    b.addEventListener('mouseenter', () => b.style.background = 'rgba(0,240,255,0.12)');
    b.addEventListener('mouseleave', () => b.style.background = 'transparent');
    b.addEventListener('click', () => { menu.remove(); it.act(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const off = (ev) => {
    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', off); }
  };
  setTimeout(() => document.addEventListener('click', off), 0);
}

async function promptCreate(kind, parentPath) {
  const name = prompt(`${kind === 'file' ? 'File' : 'Folder'} name (relative to ${parentPath || 'project root'}):`);
  if (!name) return;
  const rel = parentPath ? `${parentPath}/${name}` : name;
  try {
    if (kind === 'file') {
      await apiWriteFile(state.currentProject.id, rel, '');
    } else {
      await apiMkdir(state.currentProject.id, rel);
    }
    await refreshTree();
    if (kind === 'file') await openFile(rel);
    appendChat('system', `${kind === 'file' ? 'Created file' : 'Created folder'}: ${rel}`);
  } catch (e) {
    appendChat('system', `Create failed: ${e.message}`);
  }
}

async function promptRename(node) {
  const newName = prompt('Rename to:', node.name);
  if (!newName || newName === node.name) return;
  const parent = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '';
  const newPath = parent ? `${parent}/${newName}` : newName;
  try {
    await apiRename(state.currentProject.id, node.path, newPath);
    if (state.activePath === node.path) state.activePath = newPath;
    // Rename in openFiles map
    if (state.openFiles.has(node.path)) {
      const entry = state.openFiles.get(node.path);
      state.openFiles.delete(node.path);
      entry.path = newPath;
      state.openFiles.set(newPath, entry);
    }
    await refreshTree();
    renderEditorTabs();
    appendChat('system', `Renamed → ${newPath}`);
  } catch (e) {
    appendChat('system', `Rename failed: ${e.message}`);
  }
}

async function confirmDelete(node) {
  if (!confirm(`Delete ${node.path}?${node.type === 'dir' ? ' This will recursively remove everything inside.' : ''}`)) return;
  try {
    await apiRm(state.currentProject.id, node.path, node.type === 'dir');
    if (node.type === 'file') {
      state.openFiles.delete(node.path);
      if (state.activePath === node.path) {
        state.activePath = null;
        showEditorPlaceholder();
      }
    }
    await refreshTree();
    renderEditorTabs();
    appendChat('system', `Deleted: ${node.path}`);
  } catch (e) {
    appendChat('system', `Delete failed: ${e.message}`);
  }
}

// ---------- Editor -----------------------------------------------------------

function showEditorPlaceholder() {
  if (elPlaceholder) elPlaceholder.style.display = '';
  if (elEditorTextarea) elEditorTextarea.hidden = true;
  if (elPreviewIframe) elPreviewIframe.style.display = 'none';
  elEditorBody.classList.remove('coding-preview-mode');
  if (elSaveBtn) elSaveBtn.disabled = true;
  if (elCopyBtn) elCopyBtn.disabled = true;
  if (elPreviewBtn) elPreviewBtn.disabled = true;
  if (elEditorStatus) elEditorStatus.textContent = '';
}

async function openFile(path) {
  if (!state.currentProject) return;
  try {
    const data = await apiReadFile(state.currentProject.id, path);
    if (data.encoding === 'base64') {
      appendChat('system', `Cannot edit binary file: ${path}`);
      return;
    }
    const content = data.content || '';
    const entry = state.openFiles.get(path) || {};
    entry.content = content;
    entry.originalContent = content;
    entry.dirty = false;
    entry.language = guessLanguage(path);
    entry.path = path;
    state.openFiles.set(path, entry);
    state.activePath = path;
    renderEditorTabs();
    activateFile(path);
    renderTree(state.tree); // refresh active highlight
  } catch (e) {
    appendChat('system', `Open failed: ${e.message}`);
  }
}

function guessLanguage(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return ({
    html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    jsx: 'javascript', ts: 'typescript', tsx: 'typescript', json: 'json', md: 'markdown',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', sh: 'bash', bash: 'bash',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', sql: 'sql', xml: 'xml',
  })[ext] || 'text';
}

function activateFile(path) {
  const entry = state.openFiles.get(path);
  if (!entry) return;
  state.activePath = path;
  if (elPlaceholder) elPlaceholder.style.display = 'none';
  if (elPreviewIframe) elPreviewIframe.style.display = 'none';
  if (elEditorTextarea) {
    elEditorTextarea.hidden = false;
    elEditorTextarea.value = entry.content || '';
    elEditorTextarea.dataset.language = entry.language || 'text';
  }
  elEditorBody.classList.remove('coding-preview-mode');
  if (elSaveBtn) elSaveBtn.disabled = !entry.dirty;
  if (elCopyBtn) elCopyBtn.disabled = false;
  if (elPreviewBtn) elPreviewBtn.disabled = !(path.toLowerCase().endsWith('.html') || path.toLowerCase().endsWith('.htm'));
  if (elEditorStatus) {
    const lines = (entry.content || '').split('\n').length;
    const bytes = new Blob([entry.content || '']).size;
    elEditorStatus.textContent = `${entry.language || 'text'} · ${lines} lines · ${bytes} bytes${entry.dirty ? ' · modified' : ''}`;
  }
  renderEditorTabs();
  renderTree(state.tree);
  if (elEditorTextarea && !elEditorTextarea.disabled) {
    setTimeout(() => elEditorTextarea.focus(), 0);
  }
}

function renderEditorTabs() {
  if (!elEditorTabs) return;
  elEditorTabs.innerHTML = '';
  if (state.openFiles.size === 0) {
    const span = document.createElement('span');
    span.className = 'coding-code-empty';
    span.textContent = 'No file open';
    elEditorTabs.appendChild(span);
    return;
  }
  for (const [path, entry] of state.openFiles) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'coding-editor-tab';
    if (state.activePath === path) tab.classList.add('active');
    if (entry.dirty) tab.classList.add('dirty');
    tab.title = path;
    const name = document.createElement('span');
    name.textContent = path.split('/').pop() || path;
    tab.appendChild(name);
    const close = document.createElement('span');
    close.className = 'close';
    close.textContent = '×';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFile(path);
    });
    tab.appendChild(close);
    tab.addEventListener('click', () => activateFile(path));
    elEditorTabs.appendChild(tab);
  }
}

function closeFile(path) {
  const entry = state.openFiles.get(path);
  if (entry && entry.dirty && !confirm(`Discard unsaved changes to ${path}?`)) return;
  state.openFiles.delete(path);
  if (state.activePath === path) {
    state.activePath = null;
    if (state.openFiles.size > 0) {
      const next = state.openFiles.keys().next().value;
      activateFile(next);
    } else {
      showEditorPlaceholder();
    }
  }
  renderEditorTabs();
  renderTree(state.tree);
}

async function saveActiveFile() {
  if (!state.activePath || !state.currentProject) return;
  const entry = state.openFiles.get(state.activePath);
  if (!entry) return;
  try {
    await apiWriteFile(state.currentProject.id, state.activePath, elEditorTextarea.value);
    entry.content = elEditorTextarea.value;
    entry.originalContent = elEditorTextarea.value;
    entry.dirty = false;
    if (elSaveBtn) elSaveBtn.disabled = true;
    if (elEditorStatus) elEditorStatus.textContent = elEditorStatus.textContent.replace(' · modified', '');
    renderEditorTabs();
    renderTree(state.tree);
    appendChat('system', `Saved: ${state.activePath}`);
    logLine(`saved ${state.activePath}`, 'event');
  } catch (e) {
    appendChat('system', `Save failed: ${e.message}`);
  }
}

// ---------- Terminal ---------------------------------------------------------

function termPrint(text, kind = '') {
  if (!elTerminalOutput) return;
  const div = document.createElement('span');
  div.className = 'term-line ' + kind;
  div.textContent = text;
  elTerminalOutput.appendChild(div);
  elTerminalOutput.scrollTop = elTerminalOutput.scrollHeight;
}

function termPrintNewline(text, kind = '') {
  if (!elTerminalOutput) return;
  // Strip trailing newline already there, add one
  while (elTerminalOutput.lastChild && elTerminalOutput.lastChild.nodeType === 3) {
    elTerminalOutput.removeChild(elTerminalOutput.lastChild);
  }
  const div = document.createElement('span');
  div.className = 'term-line ' + kind;
  div.style.whiteSpace = 'pre-wrap';
  div.textContent = text + '\n';
  elTerminalOutput.appendChild(div);
  elTerminalOutput.scrollTop = elTerminalOutput.scrollHeight;
}

function termClear() {
  if (elTerminalOutput) elTerminalOutput.innerHTML = '';
}

function runTerminalCommand(cmd) {
  if (!state.currentProject) {
    termPrintNewline('No project open. Pick a project above first.', 'err');
    return;
  }
  cmd = (cmd || '').trim();
  if (!cmd) return;
  termPrintNewline(`${elTerminalPrompt ? elTerminalPrompt.textContent : '$'} ${cmd}`, 'cmd');
  state.terminal.history.push(cmd);
  state.terminal.historyIdx = state.terminal.history.length;
  // Special: cd is local-only
  if (/^cd\s/.test(cmd)) {
    const target = cmd.replace(/^cd\s+/, '').trim().replace(/^~/, '');
    if (target) {
      // Persist cwd for next command via prompt prefix
      elTerminalPrompt.dataset.cwd = target;
      elTerminalPrompt.textContent = formatPrompt(target);
    }
    return;
  }
  if (cmd === 'clear') { termClear(); return; }
  // Run via backend
  const controller = new AbortController();
  state.terminal.abort = controller;
  state.terminal.currentCmd = cmd;
  const cwd = elTerminalPrompt.dataset.cwd || '';
  fetch(`/api/coding/projects/${state.currentProject.id}/shell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ command: cmd, cwd }),
    signal: controller.signal,
  }).then(async (r) => {
    if (!r.ok) { termPrintNewline(`Error: HTTP ${r.status}`, 'err'); return; }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let currentStream = 'stdout';
    let pendingText = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let ev = 'message';
        const dataLines = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) ev = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;
        let payload;
        try { payload = JSON.parse(dataLines.join('\n')); } catch (_) { continue; }
        if (ev === 'shell_event') {
          const text = payload.data || '';
          // Stream onto the last span so multi-line output stays together
          if (pendingText && currentStream === payload.stream) {
            pendingText += text;
            const last = elTerminalOutput.lastElementChild;
            if (last) last.textContent = pendingText;
          } else {
            pendingText = text;
            const span = document.createElement('span');
            span.className = 'term-line ' + (payload.stream === 'stderr' ? 'err' : '');
            span.style.whiteSpace = 'pre-wrap';
            span.textContent = text;
            elTerminalOutput.appendChild(span);
          }
          currentStream = payload.stream;
          elTerminalOutput.scrollTop = elTerminalOutput.scrollHeight;
        } else if (ev === 'shell_exit') {
          termPrintNewline(`\n[exit ${payload.exit_code}]`, payload.exit_code === 0 ? 'ok' : 'err');
          pendingText = '';
        } else if (ev === 'shell_start') {
          termPrint(`[running in ${payload.cwd || '/'}]`, 'sys');
        }
      }
    }
    state.terminal.currentCmd = null;
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      termPrintNewline(`\n[error] ${err.message}`, 'err');
    } else {
      termPrintNewline(`\n[stopped]`, 'sys');
    }
    state.terminal.currentCmd = null;
  });
}

function formatPrompt(cwd) {
  if (!cwd || cwd === '.' || cwd === '/') return '$';
  return `${cwd.split('/').pop() || cwd} $`;
}

// ---------- AI chat → tool loop ---------------------------------------------

async function sendPrompt() {
  const prompt = (elPrompt.value || '').trim();
  if (!prompt) { elPrompt.focus(); return; }
  if (!state.currentProject) {
    appendChat('system', 'Pick a project first (or click + New).');
    return;
  }
  appendChat('user', prompt);
  elPrompt.value = '';

  const payload = {
    prompt,
    project_id: state.currentProject.id,
    endpoint_id: elEndpoint ? (elEndpoint.value || '') : '',
    model: elModel ? (elModel.value || '') : '',
  };

  const controller = new AbortController();
  state.abort = controller;
  setBusy(true);
  setStatus('Sending…');
  const asstBody = appendChat('assistant', '', { meta: 'Builder' });

  try {
    const res = await fetch('/api/coding/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${t || res.statusText}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let asstText = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let ev = 'message';
        const dataLines = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) ev = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;
        let payload2;
        try { payload2 = JSON.parse(dataLines.join('\n')); } catch (_) { continue; }

        if (ev === 'meta') {
          setStatus(`Working with ${payload2.model}…`);
          logLine(`session ${payload2.session} — model=${payload2.model}`, 'event');
        } else if (ev === 'assistant_delta') {
          asstText += payload2.text || '';
          if (asstBody) asstBody.textContent = asstText;
          if (elChatMessages) elChatMessages.scrollTop = elChatMessages.scrollHeight;
        } else if (ev === 'tool_call') {
          const tool = payload2.name;
          const args = payload2.arguments || {};
          let preview = '';
          if (tool === 'bash') preview = args.command || '';
          else if (tool === 'write_file' || tool === 'edit_file' || tool === 'read_file') preview = args.path || '';
          else if (tool === 'webfetch') preview = args.url || '';
          else if (tool === 'list_files') preview = args.path || '.';
          if (preview.length > 120) preview = preview.slice(0, 120) + '…';
          appendChat('tool', `${tool} ${preview}`, { meta: 'Tool call' });
          logLine(`tool ${tool} ${preview}`, 'tool');
        } else if (ev === 'tool_result') {
          const r = payload2.result || {};
          const ok = payload2.ok;
          const detail = ok
            ? summarizeToolResult(payload2.name, r)
            : `error: ${r.error || 'unknown'}`;
          appendChat(ok ? 'system' : 'system', detail, { meta: ok ? 'Tool result' : 'Tool error' });
          logLine((ok ? 'ok ' : 'err ') + payload2.name + ' ' + (r.stdout ? `(${r.stdout.length} chars)` : (r.content ? `${r.content.length} chars` : '')), ok ? 'success' : 'error');
          // Refresh file tree after file mutations
          if (['write_file', 'edit_file', 'mkdir', 'delete_path'].includes(payload2.name)) {
            await refreshTree();
            // If the active file was edited, reload its content from disk
            if (payload2.name === 'edit_file' || payload2.name === 'write_file') {
              const changedPath = payload2.arguments?.path;
              if (changedPath && state.openFiles.has(changedPath)) {
                try {
                  const data = await apiReadFile(state.currentProject.id, changedPath);
                  const entry = state.openFiles.get(changedPath);
                  if (entry && !entry.dirty) {
                    entry.content = data.content;
                    entry.originalContent = data.content;
                    if (state.activePath === changedPath && elEditorTextarea && !elEditorTextarea.hidden) {
                      elEditorTextarea.value = data.content;
                    }
                  }
                } catch (_) {}
              }
            }
          }
        } else if (ev === 'done') {
          setStatus(`Done in ${payload2.iterations || 0} iteration(s).`, 'success');
          if (payload2.final_text && !asstText) {
            asstText = payload2.final_text;
            if (asstBody) asstBody.textContent = asstText;
          }
          // Final refresh of the tree so any new files appear
          await refreshTree();
        } else if (ev === 'error') {
          appendChat('system', `Error: ${payload2.message || 'unknown'}`);
          logLine(`error: ${payload2.message || 'unknown'}`, 'error');
          setStatus(`Error: ${payload2.message || 'unknown'}`, 'error');
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      appendChat('system', 'Stopped by user.');
      setStatus('Stopped.', '');
    } else {
      appendChat('system', `Error: ${err.message}`);
      setStatus(`Error: ${err.message}`, 'error');
      logLine(`error: ${err.message}`, 'error');
    }
  } finally {
    state.abort = null;
    setBusy(false);
  }
}

function summarizeToolResult(name, r) {
  if (name === 'bash') {
    const tail = (r.stdout || '').trim().split('\n').slice(-5).join('\n');
    return `exit ${r.exit_code}${r.stderr ? `\nstderr: ${r.stderr.slice(0, 200)}` : ''}${tail ? `\n${tail.slice(0, 400)}` : ''}`;
  }
  if (name === 'read_file') {
    const head = (r.content || '').split('\n').slice(0, 8).join('\n');
    return `${r.size} bytes · head:\n${head.slice(0, 500)}`;
  }
  if (name === 'write_file') return `wrote ${r.bytes_written} bytes → ${r.path}`;
  if (name === 'edit_file') return `edited (${r.replacements} replacement${r.replacements === 1 ? '' : 's'}) → ${r.path}`;
  if (name === 'list_files') {
    const names = (r.entries || []).slice(0, 12).map(e => `${e.type === 'dir' ? '📁' : '📄'} ${e.name}`).join('\n');
    const more = (r.entries || []).length > 12 ? `\n… +${r.entries.length - 12} more` : '';
    return `${(r.entries || []).length} entries:\n${names}${more}`;
  }
  if (name === 'mkdir') return `created ${r.path}`;
  if (name === 'delete_path') return `deleted ${r.path}`;
  if (name === 'webfetch') return `${r.status} · ${(r.content || '').length} chars`;
  return JSON.stringify(r).slice(0, 400);
}

// ---------- Models picker ----------------------------------------------------

async function loadModelsCatalog() {
  try {
    const res = await fetch('/api/models', { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = await res.json();
    const items = (data && (data.items || data)) || [];
    state.modelsCatalog = {
      endpoints: items,
      models: items.flatMap(ep => (ep.models || []).map(m => ({
        endpoint_id: ep.endpoint_id,
        endpoint_name: ep.endpoint_name || 'Endpoint',
        model: m,
      }))),
    };
  } catch (e) {
    console.warn('models load failed', e);
  }
}

function fillEndpointSelect() {
  if (!elEndpoint) return;
  elEndpoint.innerHTML = '';
  const eps = state.modelsCatalog.endpoints || [];
  if (!eps.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Default (from Settings)';
    elEndpoint.appendChild(opt);
    return;
  }
  for (const ep of eps) {
    const opt = document.createElement('option');
    opt.value = ep.endpoint_id || '';
    opt.textContent = ep.endpoint_name || 'Endpoint';
    elEndpoint.appendChild(opt);
  }
}

function fillModelSelect() {
  if (!elModel) return;
  elModel.innerHTML = '';
  const eps = state.modelsCatalog.endpoints || [];
  const selectedEp = elEndpoint ? (elEndpoint.value || '') : '';
  const def = document.createElement('option');
  def.value = '';
  def.textContent = 'Default (first chat model)';
  elModel.appendChild(def);
  const ep = eps.find(e => e.endpoint_id === selectedEp);
  const list = ep ? (ep.models || []) : state.modelsCatalog.models.map(m => m.model);
  for (const m of list) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    elModel.appendChild(opt);
  }
}

// ---------- Preview ----------------------------------------------------------

function previewActive() {
  if (!state.activePath) return;
  const path = state.activePath.toLowerCase();
  if (!path.endsWith('.html') && !path.endsWith('.htm')) return;
  const f = state.openFiles.get(state.activePath);
  if (!f) return;
  // Inline sibling CSS / JS if present (best-effort)
  let html = f.content || '';
  const siblingCss = (state.tree?.children || []).filter(c => c.type === 'file' && c.path.endsWith('.css'));
  for (const css of siblingCss) {
    html = html.replace(
      new RegExp(`<link[^>]+href=["']\\./?${css.path.split('/').pop()}["'][^>]*>`, 'i'),
      `<style>/* inlined ${css.path} */\n/* file not yet loaded — open it in the editor to inline */</style>`
    );
  }
  if (elPlaceholder) elPlaceholder.style.display = 'none';
  if (elEditorTextarea) elEditorTextarea.hidden = true;
  if (elPreviewIframe) {
    elPreviewIframe.style.display = '';
    elPreviewIframe.srcdoc = html;
  }
  elEditorBody.classList.add('coding-preview-mode');
  logLine(`preview rendered: ${state.activePath}`, 'success');
}

// ---------- Wiring -----------------------------------------------------------

function wire() {
  // Project bar
  if (elProjectSelect) elProjectSelect.addEventListener('change', (e) => selectProject(e.target.value));
  if (elNewProjectBtn) elNewProjectBtn.addEventListener('click', createProject);
  if (elDeleteProjectBtn) elDeleteProjectBtn.addEventListener('click', deleteCurrentProject);

  // File tree
  if (elNewFileBtn) elNewFileBtn.addEventListener('click', () => promptCreate('file', ''));
  if (elNewFolderBtn) elNewFolderBtn.addEventListener('click', () => promptCreate('folder', ''));

  // Editor
  if (elEditorTextarea) {
    elEditorTextarea.addEventListener('input', () => {
      const path = state.activePath;
      if (!path) return;
      const entry = state.openFiles.get(path);
      if (!entry) return;
      const v = elEditorTextarea.value;
      entry.content = v;
      entry.dirty = v !== (entry.originalContent || '');
      if (elSaveBtn) elSaveBtn.disabled = !entry.dirty;
      if (elEditorStatus) {
        const wasModified = elEditorStatus.textContent.includes('modified');
        if (entry.dirty && !wasModified) elEditorStatus.textContent += ' · modified';
        else if (!entry.dirty && wasModified) elEditorStatus.textContent = elEditorStatus.textContent.replace(' · modified', '');
      }
      renderEditorTabs();
      renderTree(state.tree);
    });
    elEditorTextarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveActiveFile();
      }
      // Tab inserts 2 spaces
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = elEditorTextarea.selectionStart;
        const end = elEditorTextarea.selectionEnd;
        elEditorTextarea.value = elEditorTextarea.value.slice(0, start) + '  ' + elEditorTextarea.value.slice(end);
        elEditorTextarea.selectionStart = elEditorTextarea.selectionEnd = start + 2;
        elEditorTextarea.dispatchEvent(new Event('input'));
      }
    });
  }
  if (elSaveBtn) elSaveBtn.addEventListener('click', saveActiveFile);
  if (elCopyBtn) elCopyBtn.addEventListener('click', async () => {
    if (!state.activePath) return;
    try {
      await navigator.clipboard.writeText(elEditorTextarea.value);
      logLine('copied to clipboard', 'success');
    } catch (e) {
      logLine('copy failed', 'error');
    }
  });
  if (elPreviewBtn) elPreviewBtn.addEventListener('click', previewActive);

  // Terminal
  if (elTerminalForm) {
    elTerminalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const cmd = elTerminalInput.value;
      elTerminalInput.value = '';
      runTerminalCommand(cmd);
    });
  }
  if (elTerminalInput) {
    elTerminalInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        if (state.terminal.historyIdx > 0) {
          state.terminal.historyIdx--;
          elTerminalInput.value = state.terminal.history[state.terminal.historyIdx] || '';
        }
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        if (state.terminal.historyIdx < state.terminal.history.length - 1) {
          state.terminal.historyIdx++;
          elTerminalInput.value = state.terminal.history[state.terminal.historyIdx] || '';
        } else {
          state.terminal.historyIdx = state.terminal.history.length;
          elTerminalInput.value = '';
        }
        e.preventDefault();
      }
    });
  }
  if (elTerminalClear) elTerminalClear.addEventListener('click', termClear);

  // Models
  if (elEndpoint) elEndpoint.addEventListener('change', fillModelSelect);

  // Chat tabs
  document.querySelectorAll('.coding-chat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.coding-chat-tab').forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.coding-chat-pane').forEach(p => {
        const on = p.dataset.pane === tab.dataset.tab;
        p.classList.toggle('active', on);
        p.hidden = !on;
      });
    });
  });
  // Suggestion chips
  document.querySelectorAll('.coding-chat-suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
      if (elPrompt) {
        elPrompt.value = btn.dataset.prompt || btn.textContent;
        elPrompt.focus();
      }
    });
  });

  // Prompt
  if (elSubmit) elSubmit.addEventListener('click', sendPrompt);
  if (elStop) elStop.addEventListener('click', () => {
    if (state.abort) state.abort.abort();
  });
  if (elPrompt) {
    elPrompt.addEventListener('input', () => {
      if (elSubmit) elSubmit.disabled = state.streaming || !elPrompt.value.trim() || !state.currentProject;
    });
    elPrompt.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        sendPrompt();
      }
    });
  }

  setBusy(false);
  document.body.classList.add('coding-active');

  // Boot
  (async () => {
    await loadModelsCatalog();
    fillEndpointSelect();
    fillModelSelect();
    await refreshProjects();
    // Auto-select the most recent project
    if (state.projects.length) {
      elProjectSelect.value = state.projects[0].id;
      await selectProject(state.projects[0].id);
    } else {
      appendChat('system', 'Welcome — click + New in the top bar to create your first project.');
    }
  })();
}

document.addEventListener('DOMContentLoaded', wire);
if (document.readyState !== 'loading') setTimeout(wire, 0);
