// ============================================================
// keyboardControls.ts
// Port TypeScript dari js/space-play-control.js.
// Tujuan:
//   - Space bar = play/pause, tetapi IGNORED saat user mengetik
//     di input/textarea/contenteditable.
//   - Tombol otomatis kehilangan fokus setelah diklik sehingga
//     Space tidak "mengaktifkan ulang" tombol terakhir.
// Dipakai lewat import — tidak memerlukan tag <script> klasik.
// ============================================================

export interface KeyboardControlsController {
  disable(): void;
  enable(): void;
}

const TEXT_LIKE_TYPES = [
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number'
];

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  '[role="button"]'
].join(', ');

function isTypingElement(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  const tag = el.tagName;
  if (!tag) return false;
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    const type = (el.getAttribute('type') || '').toLowerCase();
    return TEXT_LIKE_TYPES.includes(type);
  }
  return false;
}

export function initKeyboardControls(): KeyboardControlsController {
  function onKeyDown(e: KeyboardEvent) {
    if (e.code !== 'Space') return;

    const active = document.activeElement;
    if (isTypingElement(active)) return;

    e.preventDefault();
    // Stop handler lain (mis. listener Space di player.js) agar tidak double-toggle.
    e.stopImmediatePropagation();

    // Prefer tombol play/pause yang sudah ada agar state Player tetap sinkron.
    const playBtn = document.getElementById('btnPlayPause');
    if (playBtn) {
      playBtn.click();
      return;
    }

    // Fallback: toggle <audio> langsung saat tombol belum tersedia.
    const audioEl = document.getElementById('audio');
    if (audioEl instanceof HTMLMediaElement) {
      if (audioEl.paused) {
        void audioEl.play().catch(() => {});
      } else {
        audioEl.pause();
      }
    }
  }

  function onClickBlur(e: MouseEvent) {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const tag = target.tagName;
    if (tag === 'INPUT') {
      const type = (target.getAttribute('type') || '').toLowerCase();
      if (TEXT_LIKE_TYPES.includes(type)) return;
    }
    if (tag === 'TEXTAREA' || target.isContentEditable) return;

    if (target.matches(INTERACTIVE_SELECTOR)) {
      setTimeout(() => {
        if (document.activeElement === target) target.blur();
      }, 0);
    }
  }

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('click', onClickBlur, true);

  return {
    disable() {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('click', onClickBlur, true);
    },
    enable() {
      document.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('click', onClickBlur, true);
    }
  };
}