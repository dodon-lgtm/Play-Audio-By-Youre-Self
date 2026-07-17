(function () {
  'use strict';

  // Production-ready: no startup debug log

  function isTypingElement(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (!tag) return false;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      const type = el.type && el.type.toLowerCase();
      const textLike = ['text','search','email','url','tel','password','number'];
      return textLike.includes(type) || tag === 'TEXTAREA';
    }
    return false;
  }

  function onKeyDown(e) {
    if (e.code !== 'Space') return;

    const active = document.activeElement;
    if (isTypingElement(active)) return;

    e.preventDefault();
    // Stop other key handlers (e.g. Player's own Space listener) to avoid double-toggle
    e.stopImmediatePropagation();

    // Prefer triggering the play/pause button so the existing Player
    // instance (created in app.js) handles the action. This avoids
    // blocking other listeners and works when Player isn't exported.
    const playBtn = document.getElementById('btnPlayPause');
      if (playBtn) {
        try {
          playBtn.click();
          return;
        } catch (err) {
          try { console.warn('space-play-control: playBtn.click() failed, dispatching MouseEvent', err); } catch (e) {}
          // Fallback: dispatch a proper mouse event
          try {
            const ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
            playBtn.dispatchEvent(ev);
            return;
          } catch (err2) {
            try { console.error('space-play-control: dispatch fallback failed', err2); } catch (e) {}
          }
        }
      }

      // Final fallback: toggle the <audio> element directly so playback state changes
      // even if Player instance listeners were not attached yet.
      const audioEl = document.getElementById('audio');
      if (audioEl && audioEl instanceof HTMLMediaElement) {
        try {
          if (audioEl.paused) audioEl.play().catch(() => {});
          else audioEl.pause();
        } catch (err) {
          try { console.error('space-play-control: audio toggle failed', err); } catch (e) {}
        }
      }
  }

  function onClickBlur(e) {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const tag = target.tagName;
    if (tag === 'INPUT') {
      const type = (target.type || '').toLowerCase();
      const nonBlurTypes = ['text','search','email','url','tel','password','number'];
      if (nonBlurTypes.includes(type)) return;
    }
    if (tag === 'TEXTAREA' || target.isContentEditable) return;

    const interactiveSelector = 'button, a[href], input[type="button"], input[type="submit"], input[type="reset"], input[type="checkbox"], input[type="radio"], [role="button"]';
    if (target.matches(interactiveSelector)) {
      setTimeout(() => {
        if (document.activeElement === target) target.blur();
      }, 0);
    }
  }

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('click', onClickBlur, true);

  window.__spacePlayControl = {
    disable: function () {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('click', onClickBlur, true);
    },
    enable: function () {
      document.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('click', onClickBlur, true);
    }
  };
})();
