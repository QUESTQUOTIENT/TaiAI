/**
 * Info & Feature Guide modal.
 *
 * Lazy-builds a comprehensive in-app guide into #info-modal-body on first
 * open. Subsequent opens are no-ops for the build step — the modal just
 * un-hides, registers with modalManager so the minimize/restore cycle
 * works, and the existing close button tears it down.
 *
 * Pattern mirrors cookbook.js / gallery.js — register + toggle via
 * modalManager, so the same `_` (minimize) and ✕ (close) affordances
 * Just Work.
 */

import * as Modals from './modalManager.js';

const MODAL_ID = 'info-modal';
const BODY_ID  = 'info-modal-body';
let _built = false;
let _registered = false;

const SECTIONS = [
  { id: 'welcome',    title: 'Welcome' },
  { id: 'first-steps',title: 'Getting started' },
  { id: 'workflow',   title: 'How it all fits together' },
  { id: 'models',     title: 'Models & connections' },
  { id: 'chat',       title: 'Chat' },
  { id: 'agent',      title: 'Agent' },
  { id: 'cookbook',   title: 'Cookbook' },
  { id: 'research',   title: 'Deep Research' },
  { id: 'compare',    title: 'Compare' },
  { id: 'documents',  title: 'Documents' },
  { id: 'memory',     title: 'Memory & Skills' },
  { id: 'email',      title: 'Email' },
  { id: 'notes',      title: 'Notes' },
  { id: 'tasks',      title: 'Tasks' },
  { id: 'calendar',   title: 'Calendar' },
  { id: 'gallery',    title: 'Gallery' },
  { id: 'library',    title: 'Library' },
  { id: 'coding',     title: 'Coding workspace' },
  { id: 'themes',     title: 'Themes & customization' },
  { id: 'settings',   title: 'Settings, tokens & integrations' },
  { id: 'privacy',    title: 'Privacy & data ownership' },
  { id: 'shortcuts',  title: 'Keyboard shortcuts' },
  { id: 'help',       title: 'Where to get more help' },
];

// Helper that lets the long section HTML below stay readable.
const h = (s) => s.trim();

function _build() {
  if (_built) return;
  const body = document.getElementById(BODY_ID);
  if (!body) return;
  body.classList.add('info-prose');

  const toc = '<nav class="info-toc" aria-label="Info sections">' +
    SECTIONS.map(s =>
      '<a href="#info-' + s.id + '">' + s.title + '</a>'
    ).join('') +
    '</nav>';

  const sections = SECTIONS.map(s =>
    '<section id="info-' + s.id + '" class="info-section">' +
    '<h2>' + s.title + '</h2>' + _content(s.id) +
    '</section>'
  ).join('');

  body.innerHTML = toc + sections;

  // Smooth-scroll for in-modal anchors. Don't break ordinary # links that
  // point outside the modal — only intercept targets that exist inside
  // #info-modal-body.
  body.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#info-"]');
    if (!a) return;
    const tgt = body.querySelector(a.getAttribute('href'));
    if (tgt) {
      e.preventDefault();
      tgt.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  _built = true;
}

function _content(id) {
  switch (id) {
    case 'welcome': return h(`
      <p>TaiAi is a self-hosted AI workspace. It runs on your hardware, owns
      your data, and exposes the same kind of experience you get from ChatGPT
      or Claude — chat, an autonomous agent, document editing, research,
      email, calendar, and more — but locally and under your control.</p>
      <p>This guide explains how the pieces fit together and how to use each
      one. It's written for the first-time visitor; if you already know
      TaiAi, the <a href="#info-shortcuts">Keyboard shortcuts</a> and
      <a href="#info-settings">Settings</a> sections are the quickest refresher.</p>
      <div class="info-callout"><strong>Tip:</strong> hit the
      <code>Ctrl+K</code> search at any time to jump to a chat, jump to a
      model, or run a command without leaving the keyboard.</div>
    `);

    case 'first-steps': return h(`
      <h3>What to do on day one</h3>
      <ol>
        <li><strong>Sign in.</strong> The first user to sign up becomes the
            admin. Subsequent users are created by the admin (or by an
            invite).</li>
        <li><strong>Add a model.</strong> Open the <em>Models</em> dropdown in
            the sidebar and connect a local server (Ollama, vLLM, llama.cpp)
            or a hosted provider (OpenAI, OpenRouter, GitHub Copilot,
            ChatGPT subscription). TaiAi auto-discovers local servers on
            <code>localhost</code>.</li>
        <li><strong>Run the Cookbook scan.</strong> The Cookbook tab
            inspects your hardware (CPU, RAM, VRAM) and recommends models
            that fit, with one-click download + serve.</li>
        <li><strong>Send your first message.</strong> The chat composer is
            the home of TaiAi — type, hit Enter, talk to your model.</li>
        <li><strong>Turn on a feature.</strong> Most integrations (Email,
            Calendar, Webhooks) are off by default. Open
            <a href="#info-settings">Settings</a> to wire them up when you
            need them.</li>
      </ol>
      <blockquote>You don't have to do all of this in one sitting. The
      chat works the moment any model is connected; everything else is
      optional.</blockquote>
    `);

    case 'workflow': return h(`
      <p>Most of TaiAi flows in one direction: <em>data in</em>,
      <em>model</em>, <em>data out</em>. Here's the picture:</p>
      <svg class="info-diagram" width="640" height="160" viewBox="0 0 640 160" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="10"  y="55" width="120" height="50" rx="8"/>
        <text x="70"  y="83"  text-anchor="middle" font-size="13" fill="currentColor" stroke="none">Models</text>
        <text x="70"  y="100" text-anchor="middle" font-size="10" fill="currentColor" stroke="none" opacity="0.6">local or API</text>
        <rect x="180" y="35" width="120" height="50" rx="8"/>
        <text x="240" y="63" text-anchor="middle" font-size="13" fill="currentColor" stroke="none">Chat</text>
        <text x="240" y="80" text-anchor="middle" font-size="10" fill="currentColor" stroke="none" opacity="0.6">messages</text>
        <rect x="180" y="95" width="120" height="50" rx="8"/>
        <text x="240" y="123" text-anchor="middle" font-size="13" fill="currentColor" stroke="none">Agent</text>
        <text x="240" y="140" text-anchor="middle" font-size="10" fill="currentColor" stroke="none" opacity="0.6">tools + memory</text>
        <rect x="350" y="55" width="120" height="50" rx="8"/>
        <text x="410" y="83"  text-anchor="middle" font-size="13" fill="currentColor" stroke="none">Memory</text>
        <text x="410" y="100" text-anchor="middle" font-size="10" fill="currentColor" stroke="none" opacity="0.6">facts + skills</text>
        <rect x="520" y="20" width="100" height="32" rx="6"/>
        <text x="570" y="40"  text-anchor="middle" font-size="11" fill="currentColor" stroke="none">Email</text>
        <rect x="520" y="58" width="100" height="32" rx="6"/>
        <text x="570" y="78"  text-anchor="middle" font-size="11" fill="currentColor" stroke="none">Calendar</text>
        <rect x="520" y="96" width="100" height="32" rx="6"/>
        <text x="570" y="116" text-anchor="middle" font-size="11" fill="currentColor" stroke="none">Notes</text>
        <rect x="520" y="134" width="100" height="22" rx="6"/>
        <text x="570" y="149" text-anchor="middle" font-size="10" fill="currentColor" stroke="none">Tasks</text>
        <line x1="130" y1="80"  x2="180" y2="60"/>
        <line x1="130" y1="80"  x2="180" y2="120"/>
        <line x1="300" y1="60"  x2="350" y2="80"/>
        <line x1="300" y1="120" x2="350" y2="80"/>
        <line x1="470" y1="80"  x2="520" y2="36"/>
        <line x1="470" y1="80"  x2="520" y2="74"/>
        <line x1="470" y1="80"  x2="520" y2="112"/>
        <line x1="470" y1="80"  x2="520" y2="145"/>
      </svg>
      <h3>Models — the brain</h3>
      <p>Pick a model from the sidebar. It can be a local server (Ollama,
      vLLM, llama.cpp), a hosted API (OpenAI, OpenRouter, GitHub Copilot,
      ChatGPT), or a combination. The model you choose is what powers
      Chat, Agent, Deep Research, Compare, and the AI helpers in
      Documents and Email.</p>
      <h3>Chat and Agent — the work surface</h3>
      <p><strong>Chat</strong> is a turn-based conversation. <strong>Agent</strong>
      is the same model with a tool belt (file system, web search, shell,
      MCP, memory) and a loop that lets it plan and execute multi-step
      tasks on its own.</p>
      <h3>Memory — the long-term state</h3>
      <p>The agent and chat write to <em>Memory</em>: durable facts about
      you, your projects, and your preferences. Memory is keyed to your
      account, fetched on every turn, and editable from the Memory
      sidebar. Skills are user-defined instruction packs the agent can
      pick up on demand.</p>
      <h3>Integrations — the reach</h3>
      <p>Email, Calendar, Notes, and Tasks all live outside the chat
      surface but are first-class to the agent. Tell it "schedule a
      meeting with the team next Tuesday" and it can act on the calendar.
      Tell it "summarize unread mail from yesterday" and it queries the
      inbox.</p>
    `);

    case 'models': return h(`
      <h3>What it does</h3>
      <p>The Models layer connects TaiAi to language models. You can mix
      and match: one model for fast replies, another for deep research,
      another for image generation. Models live in the sidebar dropdown
      and can be added/removed at any time.</p>
      <h3>Supported providers</h3>
      <table>
        <thead><tr><th>Provider</th><th>Type</th><th>How to add it</th></tr></thead>
        <tbody>
          <tr><td>Ollama</td><td>Local</td><td>Run <code>ollama serve</code> on the host; TaiAi auto-discovers it.</td></tr>
          <tr><td>vLLM</td><td>Local / server</td><td>Start vLLM with an OpenAI-compatible server; point TaiAi at its URL.</td></tr>
          <tr><td>llama.cpp</td><td>Local</td><td>Start llama.cpp with <code>--server</code>; add the endpoint in Settings.</td></tr>
          <tr><td>OpenAI</td><td>API</td><td>Add an OpenAI API key in Settings → Models.</td></tr>
          <tr><td>OpenRouter</td><td>API</td><td>Add an OpenRouter key; pick from hundreds of routed models.</td></tr>
          <tr><td>GitHub Copilot</td><td>API</td><td>Sign in with a GitHub account that has Copilot access.</td></tr>
          <tr><td>ChatGPT subscription</td><td>API</td><td>Sign in with your ChatGPT account (uses your subscription quota).</td></tr>
        </tbody>
      </table>
      <h3>How to use it</h3>
      <ol>
        <li>Open the <em>Models</em> section in the sidebar. TaiAi lists
            any local servers it can see, plus the configured API
            providers.</li>
        <li>Click <strong>+ Add model</strong> for the type you want.
            For APIs you'll be asked for a key; for local servers you'll
            be asked for a URL.</li>
        <li>To make a model your default, click the star icon next to
            its name. The starred model is preselected on every new
            chat.</li>
        <li>Switch models mid-conversation with the same dropdown — the
            chat continues, just from a different engine.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>Local servers must be reachable on the same machine or LAN as
            TaiAi. Defaults probe <code>localhost</code> and
            <code>host.docker.internal</code>.</li>
        <li>For Ollama, models you have pulled but not running still
            appear in the list; TaiAi will load them on demand.</li>
        <li>API keys are stored locally in <code>data/</code>, never sent
            anywhere except the provider's own API endpoint.</li>
      </ul>
    `);

    case 'chat': return h(`
      <h3>What it does</h3>
      <p>Chat is a turn-based conversation with the currently selected
      model. It supports streaming replies, markdown, code blocks with
      syntax highlighting, file attachments (vision and PDF), web search,
      tool use, image generation, and a tree of sub-conversations
      (branches) off any message.</p>
      <h3>How to use it</h3>
      <ol>
        <li>Type into the composer at the bottom. Hit <code>Enter</code>
            to send; <code>Shift+Enter</code> for a new line.</li>
        <li>Click the paperclip to attach a file. PDFs and images are
            passed straight to the model; other files are indexed as
            RAG context.</li>
        <li>Click the <em>web</em> toggle in the composer toolbar to
            allow the model to issue web searches before answering.</li>
        <li>Click the <em>RAG</em> toggle to pull context from your
            uploaded documents and personal knowledge base.</li>
        <li>Click the <em>bash</em> toggle to let the model run shell
            commands on the host (sandboxed by default).</li>
        <li>Branch a message: hover the message, click the branch icon.
            Useful for trying a different prompt without losing the
            original.</li>
        <li>Regenerate: click the circular arrow on any assistant
            message to retry with a different model or seed.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>Long chats auto-summarize older turns into Memory so the
            context window isn't blown on the first 50 messages.</li>
        <li>Web search and RAG can be turned on for the whole chat or
            per-message using the <code>/commands</code> prefix.</li>
        <li>The <em>incognito</em> button (compass icon) starts a chat
            that is excluded from history and memory.</li>
        <li>To export a chat, click the menu in the top right of the
            chat and pick <em>Export</em>. Markdown, JSON, and plain
            text are supported.</li>
      </ul>
    `);

    case 'agent': return h(`
      <h3>What it does</h3>
      <p>The Agent is the same model layer as Chat, but with a tool belt
      and a loop. Tell it "research X and put it in a note" and it will
      plan the work, call web search, fetch pages, summarize them, and
      write the note — possibly taking 20+ steps before reporting back.
      The Agent can use the file system, the shell, the web, MCP tools,
      memory, sessions, the UI itself, and any integrations you've
      configured.</p>
      <h3>How to use it</h3>
      <ol>
        <li>Switch to <strong>Agent</strong> mode in the chat composer
            (or click the <em>Brain</em> tab in the sidebar to enter
            agent mode from scratch).</li>
        <li>Describe the goal in natural language. Be specific about
            success criteria ("find three sources and put a one-paragraph
            summary in a new note called 'X research'").</li>
        <li>Watch the live trace: the agent lists the steps it's about
            to take. You can pause, steer, or cancel at any point.</li>
        <li>Approve or reject tool calls. Some tool calls (file writes,
            shell commands, web fetches) prompt for permission. The
            per-session "auto-approve" toggle whitelists safe tools so
            the loop doesn't stall.</li>
        <li>When the agent finishes, the chat composer shows a summary
            of what it did and links to any artifacts (notes, files,
            calendar events) it created.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>The Agent runs on the same model as Chat by default. Slower,
            more capable models (e.g. 70B+) are usually better agent
            substrates than tiny ones.</li>
        <li>Long agent runs run in the background — feel free to start
            another chat. The background monitor
            (<code>src.bg_monitor</code>) streams progress into the
            session when you come back.</li>
        <li>The Agent has access to your Memory. Tell it "remember that
            I prefer metric units" and it will write that to Memory for
            future runs.</li>
        <li>Built on <a href="https://github.com/anomalyco/opencode">opencode</a>.
            Custom tools can be added as MCP servers (see
            <a href="#info-settings">Settings</a>).</li>
      </ul>
    `);

    case 'cookbook': return h(`
      <h3>What it does</h3>
      <p>Cookbook is a hardware-aware model recommender and one-click
      runner. It scans your CPU, RAM, and VRAM, scores every GGUF /
      FP8 / AWQ model it knows about for fit, and lets you download and
      serve the right one with two clicks. Under the hood it's built
      on <a href="https://github.com/AlexsJones/llmfit">llmfit</a>.</p>
      <h3>How to use it</h3>
      <ol>
        <li>Open the <em>Cookbook</em> tab in the sidebar.</li>
        <li>The first time, click <strong>Scan hardware</strong>.
            Cookbook inspects your machine (CPU cores, RAM, GPU model
            and VRAM, disk space) and remembers the result.</li>
        <li>Browse the recommended list. Each entry shows the model's
            fit score, expected tokens/sec, and quantization options.</li>
        <li>Click a model → <strong>Download</strong>. Cookbook pulls
            the GGUF, FP8, or AWQ weights into <code>data/cookbook/</code>.</li>
        <li>Click <strong>Serve</strong>. Cookbook starts vLLM or
            llama.cpp with the right flags, waits for the model to
            load, and adds it to your Models list. You'll see a
            notification when it's ready.</li>
        <li>Use the new model from the Models dropdown in Chat or
            Agent.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>The status dot in the sidebar shows whether the cookbook
            background task is running, idle, or errored.</li>
        <li>Bookmarks: any model you've favorited stays in the
            "Pinned" row at the top of the Cookbook list.</li>
        <li>Cookbook's "background" status is updated automatically; you
            don't need to refresh.</li>
        <li>For multi-GPU boxes, Cookbook picks the best device per
            model. Override in the model's settings if you want a
            different mapping.</li>
      </ul>
    `);

    case 'research': return h(`
      <h3>What it does</h3>
      <p>Deep Research is a multi-step research runner. It plans a
      research question into sub-questions, fetches and reads each one
      in parallel, evaluates the sources, fills gaps, and synthesizes a
      cited report. The output is a long-form Markdown document with
      inline citations and a "Sources" appendix. Adapted from
      <a href="https://github.com/Alibaba-NLP/DeepResearch">Tongyi
      DeepResearch</a>.</p>
      <h3>How to use it</h3>
      <ol>
        <li>Click the <em>Deep Research</em> tab in the sidebar.</li>
        <li>Type a research question. Be specific ("How do transformer
            attention patterns differ in mixture-of-experts models
            compared to dense ones?") rather than vague ("Tell me
            about AI").</li>
        <li>Pick a model and a depth. Depth controls how many
            sub-questions get explored and how many sources per
            sub-question.</li>
        <li>Watch the live progress: planning → searching →
            reading → synthesizing.</li>
        <li>When the run finishes, the report opens in the
            Documents tab with citations as clickable links.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>Deep Research is slow by design — plan on a few minutes for
            a typical run, more for deep mode. It runs in the
            background; you can keep using TaiAi.</li>
        <li>The "Legacy research engine" is gone; only the
            DeepResearcher implementation is shipped today.</li>
        <li>Web search requires a search provider key (Tavily, Bing,
            SerpAPI, or DuckDuckGo) configured in
            <a href="#info-settings">Settings → Search</a>.</li>
        <li>Exported reports save as Markdown in the
            <em>Documents</em> tab and can be re-edited there.</li>
      </ul>
    `);

    case 'compare': return h(`
      <h3>What it does</h3>
      <p>Compare is a blind side-by-side A/B tester for models. You
      ask one question; two (or more) models each answer. You vote
      for the better one without seeing which is which; only after
      voting does Compare reveal the identities and a synthesis of
      the two answers.</p>
      <h3>How to use it</h3>
      <ol>
        <li>Click the <em>Compare</em> tab in the sidebar.</li>
        <li>Pick two or more models from the picker (the more you
            pick, the more rounds).</li>
        <li>Type a prompt. Hit <strong>Run</strong>.</li>
        <li>Each model answers in parallel. Their identities are
            hidden behind labels (A, B, C…).</li>
        <li>Vote for the one you'd rather have used. You can change
            your vote as many times as you want before revealing.</li>
        <li>Click <strong>Reveal</strong>. Compare shows the
            identities, your vote history, and an optional
            AI-generated synthesis that calls out strengths and
            weaknesses of each answer.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>Compare is the best way to settle "is the bigger model
            actually better for my use case?" — vote honestly before
            peeking.</li>
        <li>For blind tests across runs, save the prompt as a
            Compare preset from the top menu.</li>
        <li>If one model errors out mid-run, the rest still
            complete; the errored slot is marked as "no answer" in
            the reveal.</li>
      </ul>
    `);

    case 'documents': return h(`
      <h3>What it does</h3>
      <p>Documents is a multi-tab editor for Markdown, HTML, and CSV.
      You write; AI is there to help, not the other way around. The
      editor supports syntax highlighting, multi-tab work, image
      paste, and a small AI menu (rewrite, expand, summarize, change
      tone) that operates on the selection.</p>
      <h3>How to use it</h3>
      <ol>
        <li>Open the <em>Documents</em> tab (or hit
            <code>Ctrl+Shift+D</code>).</li>
        <li>Click <strong>+ New</strong> to create a document. Pick
            Markdown, HTML, or CSV.</li>
        <li>Type or paste. The editor saves automatically; the title
            bar shows a dirty marker until the save lands.</li>
        <li>Select text → right-click → <em>AI actions</em> for
            rewrite, expand, summarize, and tone changes. The
            results show as an inline diff you can accept or
            reject.</li>
        <li>Multi-tab: click <strong>+</strong> in the tab bar to
            add another document. Drag tabs to reorder, click
            <em>×</em> on a tab to close (closes the document if
            it's empty, otherwise shows "save & close" / "discard"
            / "cancel").</li>
        <li>Use the AI suggestion gutter (right edge) to accept or
            reject the model's suggestions one at a time.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>Documents are stored in <code>data/personal_docs/</code>
            (or per-user under <code>data/users/&lt;id&gt;/docs/</code>
            if you're using multi-user mode).</li>
        <li>Export to PDF, HTML, or Markdown from the document
            menu.</li>
        <li>AI actions stream in-place; long operations show a
            progress indicator at the cursor.</li>
        <li>The library sidebar (see <a href="#info-library">Library</a>)
            is where archived / non-active documents live.</li>
      </ul>
    `);

    case 'memory': return h(`
      <h3>What it does</h3>
      <p>Memory is TaiAi's long-term state. It has two pieces:
      <em>Memory</em> — durable facts the agent learns about you and
      your projects (e.g. "user prefers metric units", "current
      project: TaiAi"), and <em>Skills</em> — user-defined
      instruction packs the agent can pick up on demand. Together
      they make the agent smarter about you over time.</p>
      <p>Under the hood, Memory is a hybrid vector (ChromaDB) +
      keyword store. Embeddings are local by default
      (fastembed / ONNX), so the memory system works offline.</p>
      <h3>How to use it</h3>
      <ol>
        <li>Open the <em>Brain</em> tab in the sidebar.</li>
        <li>Browse your facts in the list. Each fact has a
            confidence score, source, and timestamp.</li>
        <li>Add a fact manually with the <strong>+ Add memory</strong>
            button. Use the type picker (preference, project, person,
            fact) to help the agent retrieve it later.</li>
        <li>Edit a fact: click it. Change the text, mark it
            private, or delete it. Changes propagate to the
            vector store on save.</li>
        <li>Skills: switch to the <em>Skills</em> sub-tab. Create
            a new skill with a name and an instruction body. The
            agent will use the skill when its description matches
            the current task.</li>
        <li>Export / import: use the menu to back up memory as a
            JSON file. Imports are additive — no overwriting
            unless you ask.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>Memory is per-user. Admin users can see and edit other
            users' memory from the admin panel.</li>
        <li>Vector memory needs ChromaDB running on
            <code>localhost:8100</code>. If you see "vector memory
            unavailable", start ChromaDB via
            <code>docker compose up chromadb</code>.</li>
        <li>Skills are versioned; older versions are kept in case
            you need to roll back.</li>
        <li>Disable Memory on a per-chat basis with the
            <em>Memory off</em> toggle in the composer (useful for
            incognito or experiment sessions).</li>
      </ul>
    `);

    case 'email': return h(`
      <h3>What it does</h3>
      <p>The Email tab is an IMAP / SMTP inbox with AI triage built
      in. It connects to any standard mail provider, classifies
      incoming mail by urgency, drafts auto-replies, summarizes
      threads, and tags spam. Per-account routing rules let you
      send different addresses for different personas.</p>
      <h3>How to use it</h3>
      <ol>
        <li>Open <a href="#info-settings">Settings → Email</a> and
            add an account. You'll need the IMAP and SMTP host,
            port, username, and an app password.</li>
        <li>Click the <em>Email</em> section in the sidebar. The
            inbox opens.</li>
        <li>Click <strong>Sync now</strong> to pull new mail. By
            default, TaiAi syncs every few minutes in the
            background.</li>
        <li>Read a message. The right pane shows the body, a
            one-paragraph AI summary, suggested tags, and a
            draft reply you can send, edit, or discard.</li>
        <li>Use the urgency flag (red dot) to mark messages that
            should ping you via your reminder channel (browser
            push, ntfy, or email).</li>
        <li>Set per-account routing rules: e.g. "send from
            <code>work@…</code> when the chat persona is
            <em>Work</em>".</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>App passwords (not your normal account password) are
            strongly recommended. Most providers require them
            when third-party apps connect.</li>
        <li>CalDAV-aware: the Email tab can read calendar
            invitations from incoming mail and offer to RSVP
            directly.</li>
        <li>Auto-reply drafts are created by the Agent, not
            silently sent. Nothing leaves your account without
            you clicking send.</li>
        <li>Attachments are saved to
            <code>data/mail-attachments/</code> and can be
            re-attached to other messages or dragged into
            Documents.</li>
      </ul>
    `);

    case 'notes': return h(`
      <h3>What it does</h3>
      <p>Notes is a fast, lightweight notepad. Each note is a
      checklist + a freeform body. Notes can be pinned, tagged,
      searched, and sent to the Agent as context. A note can also
      trigger reminders: a note with a "ping at" timestamp will
      fire on schedule through your chosen channel.</p>
      <h3>How to use it</h3>
      <ol>
        <li>Click the <em>Notes</em> tab in the sidebar.</li>
        <li>Click <strong>+ New note</strong>. The note opens in
            the main panel; the body has a title and a body
            field.</li>
        <li>Type a body. Use the checklist toggle to switch to
            a list view.</li>
        <li>Add a reminder: click the clock icon, pick a time
            and a channel (browser, ntfy, email).</li>
        <li>Pin a note (top of the list) by clicking the pin
            icon.</li>
        <li>Send a note's contents to the Agent: click the
            paper-plane icon. The Agent gets the note as
            context for its next turn.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>Notes are stored per-user. Switching accounts
            shows a different set of notes.</li>
        <li>Tags use <code>#hashtags</code> inside the body;
            they're auto-extracted and become filters in the
            sidebar.</li>
        <li>Notes have a max body size of ~256 KB; for longer
            pieces, use Documents instead.</li>
        <li>Reminder channels (browser / ntfy / email) are
            configured in <a href="#info-settings">Settings</a>.</li>
      </ul>
    `);

    case 'tasks': return h(`
      <h3>What it does</h3>
      <p>Tasks is a scheduled-jobs system the Agent can act on.
      A task is a cron-style schedule + a prompt (or a direct
      agent invocation). Tasks run in the background, fire
      notifications, and can post results into a chosen session
      or channel.</p>
      <h3>How to use it</h3>
      <ol>
        <li>Click the <em>Tasks</em> tab in the sidebar.</li>
        <li>Click <strong>+ New task</strong>. Set a name,
            a schedule (cron or natural-language like
            "every weekday at 9am"), a prompt, and a target
            channel.</li>
        <li>Pick the executor: a one-shot prompt to Chat, or
            a full Agent run with tools.</li>
        <li>Save. The task shows in the list with next-run
            and last-run timestamps.</li>
        <li>Click any task to see its run history, edit it,
            pause it, or delete it.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>Tasks run on a single-worker scheduler by default
            (concurrency cap: 1) to keep prompt costs bounded.
            Increase the cap in Settings if you need parallel
            runs.</li>
        <li>Webhook tasks: a task can also be triggered by
            an external HTTP POST. Configure the webhook URL
            and an auth token per task; the Agent receives
            the POST body as input.</li>
        <li>Schedules are in your local timezone unless
            explicitly set otherwise.</li>
        <li>Paused tasks keep their history; deleting a task
            removes it permanently.</li>
      </ul>
    `);

    case 'calendar': return h(`
      <h3>What it does</h3>
      <p>Calendar is a local-first calendar with CalDAV sync. It
      works standalone or syncs to Radicale, Nextcloud, Apple
      iCloud, Fastmail, or any other CalDAV server. Each calendar
      has its own color, and the Agent can create, move, and
      delete events on your behalf.</p>
      <h3>How to use it</h3>
      <ol>
        <li>Click the <em>Calendar</em> tab in the sidebar.</li>
        <li>Click <strong>+ New event</strong>. Set a title,
            start, end, calendar, and an optional description
            (Markdown).</li>
        <li>Switch views with the toolbar: day, week, month,
            agenda.</li>
        <li>Click an event to edit, delete, or RSVP.</li>
        <li>For CalDAV sync: open the calendar settings (gear
            icon), add a CalDAV URL, username, and app password.
            The first sync pulls all events; subsequent syncs
            are incremental.</li>
        <li>Import / export: <em>…</em> menu →
            <em>Import .ics</em> or <em>Export .ics</em>. The
            export is RFC 5545 compliant and works in every
            major calendar app.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>Per-calendar colors are saved in the local DB and
            re-applied on every sync.</li>
        <li>Reminders on calendar events fire through the
            same channels as Notes (browser / ntfy / email).</li>
        <li>The Agent respects CalDAV server-side alarms; if
            you set an alarm in the event, the server (not
            TaiAi) will fire it.</li>
        <li>Two-way sync: events created in another CalDAV
            client appear in TaiAi within the sync interval;
            events created here push back the same way.</li>
      </ul>
    `);

    case 'gallery': return h(`
      <h3>What it does</h3>
      <p>Gallery is a visual browser for everything the system
      has generated or uploaded: AI-generated images, uploaded
      photos, image attachments from chat, and exported
      document thumbnails. It supports grid / list views, tag
      filtering, and a small set of light edits (rotate, crop,
      thumbnail regenerate).</p>
      <h3>How to use it</h3>
      <ol>
        <li>Click the <em>Gallery</em> tab in the sidebar.</li>
        <li>Browse in grid view. Click any image to open the
            full-size viewer with metadata and a delete
            button.</li>
        <li>Filter with the tag chips in the toolbar; search
            by filename or prompt in the search box.</li>
        <li>Light edit: click the pencil icon on a thumbnail
            to rotate, crop, or regenerate a thumbnail.</li>
        <li>Drag-and-drop an image onto the gallery to add
            it. Drop targets are highlighted when you start
            dragging.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>Generated images store the prompt, model, and
            seed alongside the file; click an image to see
            the prompt in the metadata pane.</li>
        <li>Gallery respects per-user storage quotas if
            multi-user mode is on. Admins can change quotas
            in the admin panel.</li>
        <li>Delete is permanent — there's no trash. Export
            the image first if you might want it back.</li>
      </ul>
    `);

    case 'library': return h(`
      <h3>What it does</h3>
      <p>Library is the archive of all your documents and
      research outputs that aren't currently open in a tab. It's
      the long-term home for saved research, exported reports,
      archived conversations (as documents), and any Documents
      you've closed without deleting.</p>
      <h3>How to use it</h3>
      <ol>
        <li>Click the <em>Library</em> tab in the sidebar.</li>
        <li>Browse the list. Use the search box to filter by
            title, content, tag, or date.</li>
        <li>Click an entry to open it in a Documents tab.</li>
        <li>Right-click (or use the <em>…</em> menu) for
            export, rename, tag, or delete.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>Library is per-user. Switching accounts shows a
            different library.</li>
        <li>Storage is unlimited locally (subject to disk
            space); quotas apply in multi-user mode.</li>
        <li>Tags are shared with Documents and Notes; a tag
            you add in the library is searchable everywhere.</li>
      </ul>
    `);

    case 'coding': return h(`
      <h3>What it does</h3>
      <p>Coding is a dedicated full-page workspace for working
      with the Agent on a software project. It pairs a file
      tree and code editor on the left with a chat panel on the
      right. The Agent can read, edit, and create files in the
      workspace; you can preview HTML, run shell commands, and
      check the file diff as you go.</p>
      <h3>How to use it</h3>
      <ol>
        <li>Click the <em>Code</em> tab in the sidebar (or
            visit <code>/coding</code>).</li>
        <li>The workspace starts empty. Either open an existing
            folder (top toolbar → <em>Open folder</em>) or
            create a new one.</li>
        <li>Browse the file tree on the left. Click any file
            to open it in the editor.</li>
        <li>Tell the Agent what to do in the chat panel.
            Examples:
            <ul>
              <li>"Add a /health route that returns the current
                  server time."</li>
              <li>"Refactor <code>utils.py</code> to use
                  <code>pathlib</code>."</li>
              <li>"Write a unit test for <code>parse()</code>."</li>
            </ul>
        </li>
        <li>Watch the diff in the lower pane. Accept or reject
            each file change.</li>
        <li>Use the terminal tab to run shell commands in the
            workspace root. The Agent also has its own shell
            tool — yours is for you.</li>
        <li>Preview HTML / Markdown files by clicking the eye
            icon in the file header.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>Workspaces are sandboxed by default. The Agent
            can only touch files inside the folder you
            opened.</li>
        <li>Each session has its own chat history. Reopening
            the workspace later picks up the same files and
            the same chat context.</li>
        <li>Files are stored under
            <code>data/coding_sandboxes/</code> by default;
            sandbox location is configurable per workspace.</li>
        <li>The Agent respects <code>.gitignore</code> if the
            folder is a git repo.</li>
      </ul>
    `);

    case 'themes': return h(`
      <h3>What it does</h3>
      <p>TaiAi ships with 12 themes (Cyberpunk default, plus
      Chibi Anime, Claymorphic, Kawaii Doodle, Pixel Art, Pop
      Art, Retro Comic, Synthwave, Vaporwave, Watercolor
      Sketch, Y2K Futuristic, and the system default). Every
      theme respects the same color variables, so the same UI
      works in every style. Beyond picking a theme, the Theme
      tab lets you tweak individual colors, fonts, density, and
      background patterns.</p>
      <h3>How to use it</h3>
      <ol>
        <li>Click the <em>Theme</em> tab in the sidebar (or
            visit <code>/?open=theme</code>).</li>
        <li>Pick a preset from the gallery. The change applies
            immediately and persists across reloads.</li>
        <li>Switch to <em>Customize</em> to tweak individual
            tokens (background, foreground, accent, panel
            background, border, etc.).</li>
        <li>Adjust density: <em>Compact</em> or
            <em>Spacious</em>. Affects padding and font
            sizes.</li>
        <li>Pick a background pattern: solid, gradient, or one
            of the built-in patterns. The change is reflected
            on every page of the app.</li>
        <li>Save your custom theme as a new preset to share
            or come back to later.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>Themes are per-user, not per-machine. Different
            accounts on the same install can have different
            themes.</li>
        <li>The theme switcher is a no-FOIT affair — your
            saved theme is applied in a blocking script
            before the page paints, so you never see a
            flash of the default theme.</li>
        <li>Custom themes are stored in
            <code>data/themes/</code>. Copy that folder to
            another install to share.</li>
        <li>Mobile: density is forced to "Spacious" on small
            screens; this is by design.</li>
      </ul>
    `);

    case 'settings': return h(`
      <h3>What it does</h3>
      <p>Settings is where every configurable piece of TaiAi
      lives. It's organized into tabs: <em>Services</em>,
      <em>AI</em>, <em>Search</em>, <em>Integrations</em>,
      <em>Email</em>, <em>Reminders</em>, <em>Appearance</em>,
      <em>Shortcuts</em>, <em>Account</em>, <em>Tools</em>
      (admin), <em>Users</em> (admin), and <em>System</em>
      (admin).</p>
      <h3>How to use it</h3>
      <ol>
        <li>Click the gear icon in the user bar at the bottom
            of the sidebar.</li>
        <li>Walk through each tab. Most tabs have a "Test
            connection" button that runs a quick check
            against the service.</li>
        <li>API tokens live under <em>Account → API tokens</em>.
            Click <strong>+ New token</strong> to mint a
            bearer token for an external client. The token
            is shown once; copy it immediately.</li>
        <li>Webhooks live under <em>Account → Webhooks</em>.
            Each webhook has a URL, a signing secret, and a
            list of subscribed events.</li>
        <li>MCP servers: <em>Tools → MCP</em> (admin). Add a
            server with a command, args, and env. TaiAi
            connects on save and lists its tools.</li>
        <li>Backups: <em>System → Backup</em> (admin). Snap a
            full backup of <code>data/</code> to a zip. The
            backup can be restored on the same or a different
            machine.</li>
      </ol>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>Most settings take effect immediately. A few
            (auth mode, port) require a restart.</li>
        <li>Settings are stored per-user, not per-machine.
            Account-scoped settings (e.g. your API keys) only
            affect your sessions.</li>
        <li>Search providers: Tavily, Bing, SerpAPI, and
            DuckDuckGo are supported. Some need an API key;
            DuckDuckGo is the no-key fallback.</li>
        <li>TTS / STT: pick a provider in the AI tab. Local
            (whisper.cpp) and cloud options are available.
            The TTS / STT buttons in the composer only show
            up when a provider is configured.</li>
      </ul>
    `);

    case 'privacy': return h(`
      <h3>What it does</h3>
      <p>TaiAi is built around the principle that your data is
      yours. There is no telemetry, no analytics call-home, no
      third-party tracker on any page of the app. The only
      network calls TaiAi makes are:</p>
      <ol>
        <li>To the model providers you configure (Ollama, vLLM,
            llama.cpp on <code>localhost</code>; OpenAI,
            OpenRouter, GitHub Copilot, ChatGPT over their
            public APIs).</li>
        <li>To the integration services you opt into (IMAP /
            SMTP, CalDAV, web search, image generation,
            TTS / STT providers).</li>
        <li>To MCP servers you explicitly add (the Agent
            invokes them as you configure).</li>
      </ol>
      <p>Anything you store — chats, memory, skills, notes,
      documents, gallery, calendar, email, settings — lives in
      the local <code>data/</code> directory on the host
      running TaiAi. Back up that directory; it's the whole
      app's worth of state.</p>
      <h3>How to think about privacy</h3>
      <ul>
        <li><strong>Local-only mode.</strong> Run TaiAi with
            only a local model and no cloud integrations, and
            nothing ever leaves the machine. This is the
            default for many users.</li>
        <li><strong>Hybrid mode.</strong> Use a local model for
            most things; opt into a hosted model (OpenAI,
            etc.) for the few tasks where it does better.
            Memory and storage stay local regardless.</li>
        <li><strong>Hosted-everything mode.</strong> Use only
            hosted models. Functionally identical to a hosted
            chat product, but you still own the data and
            can switch providers at will.</li>
      </ul>
      <h3>Tips and gotchas</h3>
      <ul>
        <li>When you delete a chat, it's removed from the DB
            and from disk; there's no soft-delete recovery
            unless you have a backup.</li>
        <li>Memory is per-user, not per-machine. Switching
            accounts on a shared install gives each user
            their own memory, even if they share a model.</li>
        <li>API tokens can be revoked at any time from
            <em>Account → API tokens</em>. Revocation is
            immediate.</li>
        <li>See <code>THREAT_MODEL.md</code> in the repo for
            a detailed security review of the
            authentication, network, and storage
            boundaries.</li>
      </ul>
    `);

    case 'shortcuts': return h(`
      <h3>Global</h3>
      <table>
        <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td><code>Ctrl+K</code> / <code>⌘K</code></td><td>Open search / command palette</td></tr>
          <tr><td><code>Ctrl+/</code> / <code>⌘/</code></td><td>Show this keyboard shortcut sheet</td></tr>
          <tr><td><code>Ctrl+Shift+D</code></td><td>Open Documents tab</td></tr>
          <tr><td><code>Ctrl+,</code> / <code>⌘,</code></td><td>Open Settings</td></tr>
          <tr><td><code>Esc</code></td><td>Close the topmost modal</td></tr>
        </tbody>
      </table>
      <h3>Chat</h3>
      <table>
        <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td><code>Enter</code></td><td>Send message</td></tr>
          <tr><td><code>Shift+Enter</code></td><td>New line</td></tr>
          <tr><td><code>↑</code> (in empty input)</td><td>Recall last prompt</td></tr>
          <tr><td><code>Ctrl+Shift+R</code></td><td>Regenerate last assistant message</td></tr>
          <tr><td><code>Ctrl+B</code></td><td>Branch the current message</td></tr>
          <tr><td><code>Ctrl+I</code></td><td>Toggle incognito mode for this session</td></tr>
        </tbody>
      </table>
      <h3>Documents</h3>
      <table>
        <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td><code>Ctrl+S</code></td><td>Save (autosave is on, but this forces a flush)</td></tr>
          <tr><td><code>Ctrl+F</code></td><td>Find in document</td></tr>
          <tr><td><code>Ctrl+H</code></td><td>Find and replace</td></tr>
          <tr><td><code>Ctrl+Shift+K</code></td><td>Toggle AI suggestion gutter</td></tr>
        </tbody>
      </table>
      <h3>Modals</h3>
      <table>
        <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td><code>Tab-down</code> (swipe)</td><td>Minimize the current modal (it parks as a chip in the bottom dock)</td></tr>
          <tr><td>Click the <code>_</code> button</td><td>Same as swipe-down</td></tr>
          <tr><td><code>Esc</code></td><td>Close the topmost modal</td></tr>
        </tbody>
      </table>
      <div class="info-callout"><strong>Tip:</strong> keyboard shortcuts
      are fully configurable in <a href="#info-settings">Settings →
      Shortcuts</a>.</div>
    `);

    case 'help': return h(`
      <h3>In the app</h3>
      <ul>
        <li>This guide (<em>Info</em> in the sidebar) — what
            you're reading right now.</li>
        <li>The landing page at <code>docs/index.html</code>
            ships with a hover-to-play tour of every feature.</li>
        <li>Each modal has a <code>?</code> help icon in its
            header that opens the relevant section of this
            guide.</li>
      </ul>
      <h3>On the web</h3>
      <ul>
        <li><strong>GitHub:</strong>
            <a href="https://github.com/TieAI-archdaemon/TaiAi">github.com/TieAI-archdaemon/TaiAi</a>
            — source, issues, releases.</li>
        <li><strong>README:</strong> the README in the repo root
            is the most up-to-date feature list.</li>
        <li><strong>ROADMAP:</strong> see what we're working on
            next.</li>
        <li><strong>THREAT_MODEL</strong> &amp;
            <strong>SECURITY</strong> in the repo root cover
            the security model and reporting.</li>
        <li><strong>ACKNOWLEDGMENTS</strong> credits the
            upstream projects TaiAi builds on (opencode,
            llmfit, Tongyi DeepResearch, fastembed, ChromaDB,
            llama.cpp, vLLM, and many more).</li>
      </ul>
      <h3>Contributing</h3>
      <p>Bug reports, feature requests, and pull requests are
      welcome. The CONTRIBUTING guide in the repo covers dev
      setup, code style, and the PR process. New MCP servers
      are the easiest way to extend TaiAi — drop one into
      Settings → Tools → MCP and it shows up as tools the
      Agent can call.</p>
      <h3>Diagnostics</h3>
      <p>If something is misbehaving, the <em>Diagnostics</em>
      page in Settings (admin) bundles a one-click "send
      diagnostic bundle" action that packages logs, recent
      errors, and system info into a single file you can
      attach to a bug report. Nothing leaves your machine
      until you click the button.</p>
      <hr>
      <p style="opacity:0.6;font-size:12px;margin-top:24px">
      TaiAi is open source under the project's license. Build
      it, modify it, host it for your friends, sell support
      around it — it's yours.</p>
    `);

    default: return '<p>Coming soon.</p>';
  }
}

function _closeFn() {
  const modal = document.getElementById(MODAL_ID);
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

export function open() {
  if (!_built) _build();
  const modal = document.getElementById(MODAL_ID);
  if (!modal) return;
  // Wire the X button once. The button element is part of the static HTML
  // (#info-modal at static/index.html:443-454) so the listener can be
  // attached on the first open. close() calls the registered modalManager
  // closeFn, which in turn unregisters the chip — so the next open() call
  // re-registers cleanly.
  const closeBtn = document.getElementById('close-info-modal');
  if (closeBtn && !closeBtn._infoWired) {
    closeBtn._infoWired = true;
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
  }
  modal.classList.remove('hidden');
  modal.style.display = '';
  if (!_registered) {
    Modals.register(MODAL_ID, {
      railBtnId: ['rail-info', 'tool-info-btn'],
      sidebarBtnId: 'tool-info-btn',
      closeFn: _closeFn,
      restoreFn: () => {
        // Reset scroll to top on restore so the user doesn't land mid-page
        // if they minimized while scrolled down.
        const body = document.getElementById(BODY_ID);
        if (body) body.scrollTop = 0;
      },
    });
    _registered = true;
  }
}

export function close() {
  _closeFn();
}

export function isOpen() {
  const m = document.getElementById(MODAL_ID);
  return !!m && !m.classList.contains('hidden');
}

export default { open, close, isOpen };
