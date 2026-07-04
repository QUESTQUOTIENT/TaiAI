/**
 * Voice Mode orchestrator.
 *
 * Phase 3.11. Combines the existing TTS (tts-ai.js) and STT
 * (voiceRecorder.js) modules into a single toggleable "voice mode":
 *
 *   - ON  -> the chat composer has a mic button; clicking starts STT.
 *           When STT returns a final transcript, the chat is auto-sent.
 *           Incoming assistant messages are auto-played via TTS.
 *   - OFF -> neither happens (mic button hides; TTS auto-play off).
 *
 * The mode persists in localStorage so a refresh keeps the user's
 * preference. Uses the browser's native SpeechRecognition when available
 * (Chrome, Edge, Safari); falls back to a manual mic button on Firefox.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'TaiAi-voice-mode';
  let _enabled = false;
  let _bound = false;

  function _readEnabled() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { return false; }
  }
  function _writeEnabled(v) {
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch (_) {}
  }

  async function _setEnabled(on) {
    if (_enabled === on) return;
    _enabled = on;
    _writeEnabled(on);
    _renderToggle();
    _applyAutoPlay(on);
  }

  function _applyAutoPlay(on) {
    try {
      const m = window.aiTTSManager;
      if (m && 'autoPlay' in m) m.autoPlay = !!on;
    } catch (_) {}
  }

  function _renderToggle() {
    let btn = document.getElementById('TaiAi-voice-toggle');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'TaiAi-voice-toggle';
      btn.type = 'button';
      btn.title = 'Toggle voice mode (TTS playback + STT mic)';
      btn.setAttribute('aria-pressed', 'false');
      btn.style.cssText = [
        'appearance:none', 'border:1px solid var(--border, #355a66)',
        'background:transparent', 'color:var(--fg, #e8e8f0)',
        'padding:4px 10px', 'border-radius:6px', 'cursor:pointer',
        'font:12px/1 system-ui', 'display:inline-flex',
        'align-items:center', 'gap:6px', 'margin-left:6px',
      ].join(';');
      btn.onclick = () => _setEnabled(!_enabled);
      const anchor = document.querySelector('.chat-input-bar, .composer-actions, .chat-actions');
      if (anchor) anchor.appendChild(btn);
      else document.body.appendChild(btn);
    }
    btn.setAttribute('aria-pressed', _enabled ? 'true' : 'false');
    btn.style.borderColor = _enabled ? 'var(--accent, #00f0ff)' : 'var(--border, #355a66)';
    btn.style.color = _enabled ? 'var(--accent, #00f0ff)' : 'var(--fg, #e8e8f0)';
    btn.innerHTML = ''
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      +   '<rect x="9" y="3" width="6" height="12" rx="3"/>'
      +   '<path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/>'
      + '</svg>'
      + '<span>' + (_enabled ? 'Voice: on' : 'Voice: off') + '</span>';
  }

  // STT integration: when voice mode is on, the chat composer shows a
  // mic button. Clicking it starts recording + speech recognition. When
  // recognition fires a final result, we auto-fill the composer + send.
  let _sttHooked = false;
  function _hookStt() {
    if (_sttHooked) return;
    if (!window.voiceRecorderModule) return;
    _sttHooked = true;
    try {
      window.voiceRecorderModule.onTranscript = function (text, isFinal) {
        const composer = document.getElementById('message-input')
                       || document.querySelector('textarea[name="message"]')
                       || document.querySelector('.chat-composer textarea');
        if (!composer) return;
        if (isFinal) {
          composer.value = (composer.value ? composer.value + ' ' : '') + text;
          composer.dispatchEvent(new Event('input', { bubbles: true }));
          // Auto-send via the standard chat send button if voice mode
          // is on. Use a microtask to let input handlers run first.
          queueMicrotask(() => {
            const sendBtn = document.getElementById('send-button')
                         || document.getElementById('send-btn')
                         || document.querySelector('.chat-send-btn')
                         || document.querySelector('[data-role="send"]');
            if (sendBtn && !sendBtn.disabled) sendBtn.click();
          });
        } else {
          // Interim: show as ghost text via placeholder update so the user
          // sees what's being captured without committing it.
          composer.setAttribute('data-stt-interim', text);
          if (!composer.value) composer.setAttribute('placeholder', text);
        }
      };
    } catch (_) {}
  }

  // TTS auto-play: the existing chat.js integration reads
  // aiTTSManager.autoPlay and plays via tts-ai.js when on. We just
  // toggle that flag here.
  function _applyToTTS() {
    _applyAutoPlay(_enabled);
  }

  function _init() {
    _enabled = _readEnabled();
    _renderToggle();
    _hookStt();
    _applyToTSS();
  }

  // Public API for the Settings panel to read/write.
  window._TaiAiVoice = {
    isOn() { return _enabled; },
    setOn: _setEnabled,
    toggle() { _setEnabled(!_enabled); },
    hasSTT() {
      return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    },
    hasTTS() {
      return !!(window.aiTTSManager && window.aiTTSManager.available);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
