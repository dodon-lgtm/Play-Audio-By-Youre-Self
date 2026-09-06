// ============================================================
// player.ts — Mesin Pemutar (Player Engine)
// Port TypeScript dari js/player.js.
// Fitur: queue (shuffle/repeat), Media Session API (Bluetooth/TWS),
// progress bar, volume, dan pembebasan Object URL.
// ============================================================

import { getCover, getTrack } from './db';
import { getSettings, setLastPlayed, setSettings } from './storage';
import type { RepeatMode } from '../types/track';
import type { PlayerDomElements } from '../types/app';
// Helper ikon SVG presentational (digunakan untuk swap play/pause & pill shuffle/repeat).
import { iconPause, iconPlay, iconRepeat, iconShuffle } from '../ui/icons';

/** Track ringkas yang siap dimainkan (data lengkap diambil dari IndexedDB saat bind). */
export interface PlayableTrack {
  id: string;
  title: string;
  ext?: string;
  playlistName?: string;
}

/** Informasi queue aktif dari konteks saat ini. */
export interface PlayerQueueInfo {
  queue: string[];
  contextName: string;
}

interface PlayerOptions {
  audioEl: HTMLAudioElement;
  elements: PlayerDomElements;
  getActiveQueue: () => PlayerQueueInfo;
}

export class Player {
  audio: HTMLAudioElement;
  el: PlayerDomElements;
  getActiveQueue: () => PlayerQueueInfo;

  state: {
    currentIndex: number;
    isShuffling: boolean;
    repeatMode: RepeatMode;
  };

  /** Dipanggil saat pengguna pindah lagu (prev/next). */
  onSeekToIndex?: (trackId: string) => void | Promise<void>;
  /** Dipanggil saat lagu berhasil di-bind ke audio. */
  onTrackChanged?: (track: PlayableTrack) => void;
  /** Hook opsional untuk restore lagu terakhir (dipakai app jika ingin). */
  onTrackBindingRequired?: (trackId: string) => void | Promise<void>;

  /** Object URL lagu aktif; di-revoke saat ganti lagu (cegah memory leak). */
  private _currentObjectUrl: string | null = null;

  constructor({ audioEl, elements, getActiveQueue }: PlayerOptions) {
    this.audio = audioEl;
    this.el = elements;
    this.getActiveQueue = getActiveQueue;

    this.state = {
      currentIndex: -1,
      isShuffling: false,
      repeatMode: 'off'
    };

    this._bind();
  }

  initFromStorage(): void {
    const settings = getSettings();
    this.audio.volume = settings.volume;
    this.el.volumeRange.value = String(settings.volume);
    this.el.volumeValue.textContent = Math.round(settings.volume * 100) + '%';

    this.state.isShuffling = !!settings.shuffle;
    this.state.repeatMode = settings.repeat || 'off';
    this._syncShuffleRepeatUI();
  }

  private _bind(): void {
    this.el.btnPlayPause.addEventListener('click', () => {
      if (this.audio.paused) this.play();
      else this.pause();
    });

    this.el.btnPrev.addEventListener('click', () => this.prev());
    this.el.btnNext.addEventListener('click', () => this.next());

    // Keyboard: Space bar untuk play/stop.
    // Diabaikan saat user mengetik di input/textarea agar tidak memicu play/pause.
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space') return;
      if (isTypingElement(document.activeElement)) return;
      e.preventDefault();
      if (this.audio.paused) this.play();
      else this.pause();
    });

    // Bluetooth/TWS/Headphone media controls (Media Session API)
    this._setupMediaSession();

    this.el.btnShuffle.addEventListener('click', () => {
      this.state.isShuffling = !this.state.isShuffling;
      this._syncShuffleRepeatUI();
      const s = getSettings();
      setSettings({ ...s, shuffle: this.state.isShuffling });
    });

    this.el.btnRepeat.addEventListener('click', () => {
      const order: RepeatMode[] = ['off', 'one', 'all'];
      const idx = order.indexOf(this.state.repeatMode);
      this.state.repeatMode = order[(idx + 1) % order.length];
      this._syncShuffleRepeatUI();
      const s = getSettings();
      setSettings({ ...s, repeat: this.state.repeatMode });
    });

    this.el.progressRange.addEventListener('input', () => {
      const t = this._rangeToTime();
      this.el.currentTime.textContent = formatTime(t);
    });

    this.el.progressRange.addEventListener('change', () => {
      const t = this._rangeToTime();
      this.audio.currentTime = t;
    });

    this.el.volumeRange.addEventListener('input', () => {
      const vol = Number(this.el.volumeRange.value);
      this.audio.volume = vol;
      this.el.volumeValue.textContent = Math.round(vol * 100) + '%';
    });

    this.el.volumeRange.addEventListener('change', () => {
      const s = getSettings();
      setSettings({ ...s, volume: Number(this.el.volumeRange.value) });
    });

    this.audio.addEventListener('timeupdate', () => this._onTimeUpdate());
    this.audio.addEventListener('durationchange', () => this._onDurationChange());
    this.audio.addEventListener('ended', () => this._onEnded());
    this.audio.addEventListener('play', () => {
      this._setPlayIcon(true);
      this._updateMediaSessionState();
    });
    this.audio.addEventListener('pause', () => {
      this._setPlayIcon(false);
      this._updateMediaSessionState();
    });
  }

  private _setupMediaSession(): void {
    // Media Session API untuk Bluetooth/TWS/Headphone controls
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => this.play());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      // Mundur 10 detik
      this.audio.currentTime = Math.max(0, this.audio.currentTime - (details.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      // Maju 10 detik
      const dur = this.audio.duration || 0;
      this.audio.currentTime = Math.min(dur, this.audio.currentTime + 10);
    });
  }

  // Volume control via Bluetooth - panggil dengan player.setVolume(0.1) atau -0.1
  setVolume(delta: number): void {
    const newVol = Math.max(0, Math.min(1, this.audio.volume + delta));
    this.audio.volume = newVol;
    this.el.volumeRange.value = String(newVol);
    this.el.volumeValue.textContent = Math.round(newVol * 100) + '%';
    const s = getSettings();
    setSettings({ ...s, volume: newVol });
  }

  private async _updateMediaSession(track: PlayableTrack): Promise<void> {
    if (!('mediaSession' in navigator)) return;

    // Ambil cover dari IndexedDB
    let artwork: MediaImage[] = [];
    if (track?.id) {
      try {
        const stored = await getCover(track.id);
        if (stored?.blob) {
          const dataUrl = await blobToDataURL(stored.blob);
          artwork = [
            { src: dataUrl, sizes: '512x512', type: stored.blob.type || 'image/png' }
          ];
        }
      } catch {}
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track?.title || '',
      artist: '',
      album: '',
      artwork
    });
    this._updateMediaSessionState();
  }

  private _updateMediaSessionState(): void {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = this.audio.paused ? 'paused' : 'playing';
  }

  private _syncShuffleRepeatUI(): void {
    this.el.btnShuffle.classList.toggle('is-active', this.state.isShuffling);
    this.el.btnShuffle.innerHTML = `${iconShuffle(13)}<span>Shuffle</span>`;
    const label = this.state.repeatMode === 'off'
      ? 'Repeat: off'
      : this.state.repeatMode === 'one'
        ? 'Repeat: one'
        : 'Repeat: all';
    this.el.btnRepeat.innerHTML = `${iconRepeat(13)}<span>${label}</span>`;
  }

  private _setPlayIcon(isPlaying?: boolean): void {
    this.el.btnPlayPause.innerHTML = isPlaying ? iconPause(18) : iconPlay(18);
  }

  async bindAndPlayTrack(track: PlayableTrack): Promise<void> {
    // track: { id, title, ext, playlistName? }
    if (!track || !track.id) return;

    // Ambil Blob dari IndexedDB
    let objectUrl: string | null = null;
    const stored = await getTrack(track.id);

    if (!stored?.blob) {
      this.el.playerTitle.textContent = track.title || 'Audio diperlukan';
      this.el.playerSubtitle.textContent = 'File audio belum tersedia. Tambahkan ulang file.';
      this.pause();
      return;
    }

    objectUrl = URL.createObjectURL(stored.blob);

    // Cleanup previous object URL (avoid memory leak)
    if (this._currentObjectUrl) {
      try {
        URL.revokeObjectURL(this._currentObjectUrl);
      } catch {
        // ignore errors
      }
    }
    this._currentObjectUrl = objectUrl;

    const { queue, contextName } = this.getActiveQueue();
    const idx = queue.indexOf(track.id);

    this.state.currentIndex = idx;
    this.audio.src = objectUrl;
    this.audio.play().catch(() => {});

    setLastPlayed({ trackId: track.id, contextName, ts: Date.now() });

    this.el.playerTitle.textContent = track.title;
    this.el.playerSubtitle.textContent = contextName || (track.playlistName ? track.playlistName : '');

    this.onTrackChanged?.(track);
    this._syncProgressMax();
    this._setPlayIcon(true);

    // Update Media Session metadata dengan judul & cover
    void this._updateMediaSession(track);
  }

  play(): void {
    this.audio.play().catch(() => {});
  }

  pause(): void {
    this.audio.pause();
  }

  prev(): void {
    const { queue } = this.getActiveQueue();
    if (!queue.length) return;

    const nextIndex = this._getPrevIndex(queue);
    if (nextIndex < 0) return;

    this.state.currentIndex = nextIndex;
    this.onSeekToIndex?.(queue[nextIndex]);
  }

  next(): void {
    const { queue } = this.getActiveQueue();
    if (!queue.length) return;

    if (this.state.repeatMode === 'one') {
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
      return;
    }

    const nextIndex = this._getNextIndex(queue);
    if (nextIndex === null) return;

    this.state.currentIndex = nextIndex;
    this.onSeekToIndex?.(queue[nextIndex]);
  }

  private _getPrevIndex(queue: string[]): number {
    if (this.state.currentIndex === -1) return queue.length - 1;
    return this.state.currentIndex - 1;
  }

  private _getNextIndex(queue: string[]): number | null {
    const lastIdx = queue.length - 1;
    if (this.state.currentIndex === -1) return 0;

    if (this.state.currentIndex >= lastIdx) {
      if (this.state.repeatMode === 'all') return 0;
      return null;
    }
    return this.state.currentIndex + 1;
  }

  private _onTimeUpdate(): void {
    const cur = this.audio.currentTime || 0;
    const dur = this.audio.duration || 0;

    this.el.currentTime.textContent = formatTime(cur);

    if (dur > 0) {
      const ratio = cur / dur;
      const max = Number(this.el.progressRange.max);
      this.el.progressRange.value = String(Math.floor(ratio * max));
      this.el.progressFill.style.width = (ratio * 100).toFixed(2) + '%';
    }

    this.el.progressFill.style.opacity = dur ? '1' : '0';
  }

  private _onDurationChange(): void {
    const dur = this.audio.duration;
    if (!dur || !isFinite(dur)) return;
    this.el.durationTime.textContent = formatTime(dur);
    this._syncProgressMax();
  }

  private _syncProgressMax(): void {
    const dur = this.audio.duration;
    if (!dur || !isFinite(dur) || dur <= 0) return;
    this.el.progressRange.max = '1000';
    this.el.progressRange.value = '0';
    this.el.progressFill.style.width = '0%';
    this.el.durationTime.textContent = formatTime(dur);
  }

  private _rangeToTime(): number {
    const dur = this.audio.duration || 0;
    const max = Number(this.el.progressRange.max);
    const v = Number(this.el.progressRange.value);
    if (!dur || max <= 0) return 0;
    return (v / max) * dur;
  }

  private _onEnded(): void {
    if (this.state.repeatMode === 'one') {
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
      return;
    }
    this.next();
  }
}

function isTypingElement(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  const tag = el.tagName;
  if (!tag) return false;
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    const type = (el.getAttribute('type') || '').toLowerCase();
    const textLike = ['text', 'search', 'email', 'url', 'tel', 'password', 'number'];
    return textLike.includes(type) || tag === 'TEXTAREA';
  }
  return false;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return m + ':' + String(r).padStart(2, '0');
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
}