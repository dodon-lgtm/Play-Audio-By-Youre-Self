import { getTrack, getCover } from './db.js';
import { setLastPlayed, setSettings, getSettings, getLibrary } from './storage.js';

export class Player {

  constructor({ audioEl, elements, getActiveQueue }) {
    this.audio = audioEl;
    this.el = elements;
    this.getActiveQueue = getActiveQueue;

    this.state = {
      currentIndex: -1,
      isShuffling: false,
      repeatMode: 'off'
    };

    // Track current objectUrl for cleanup
    this._currentObjectUrl = null;

    this._bind();
  }

  initFromStorage() {
    const settings = getSettings();
    this.audio.volume = settings.volume;
    this.el.volumeRange.value = String(settings.volume);
    this.el.volumeValue.textContent = Math.round(settings.volume * 100) + '%';

    this.state.isShuffling = !!settings.shuffle;
    this.state.repeatMode = settings.repeat || 'off';
    this._syncShuffleRepeatUI();
  }

  onTrackBindingRequired(trackId) {
    // Optional hook - implemented by app.js
  }

  _bind() {
    this.el.btnPlayPause.addEventListener('click', () => {
      if (this.audio.paused) this.play();
      else this.pause();
    });

    this.el.btnPrev.addEventListener('click', () => this.prev());
    this.el.btnNext.addEventListener('click', () => this.next());

    // Keyboard: Space bar untuk play/stop
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.audio.paused) this.play();
        else this.pause();
      }
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
      const order = ['off', 'one', 'all'];
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

  _setupMediaSession() {
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

    // Custom: Volume up/down via long press (fallback)
    this._mediaSessionVolumeHandler = (dir) => this.setVolume(dir === 'up' ? 0.1 : -0.1);
  }

  // Volume control via Bluetooth - panggil dengan player.setVolume(0.1) atau -0.1 - dipanggil dari luar
  setVolume(delta) {
    const newVol = Math.max(0, Math.min(1, this.audio.volume + delta));
    this.audio.volume = newVol;
    this.el.volumeRange.value = String(newVol);
    this.el.volumeValue.textContent = Math.round(newVol * 100) + '%';
    const s = getSettings();
    setSettings({ ...s, volume: newVol });
  }

  async _updateMediaSession(track) {
    if (!('mediaSession' in navigator)) return;

    // Ambil cover dari IndexedDB
    let artwork = [];
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

  _updateMediaSessionState() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.playbackState = this.audio.paused ? 'paused' : 'playing';
  }

  _syncShuffleRepeatUI() {
    this.el.btnShuffle.classList.toggle('is-active', this.state.isShuffling);
    const label = this.state.repeatMode === 'off'
      ? 'Repeat: off'
      : this.state.repeatMode === 'one'
        ? 'Repeat: one'
        : 'Repeat: all';
    this.el.btnRepeat.textContent = label;
  }

  _setPlayIcon(isPlaying) {
    this.el.btnPlayPause.textContent = isPlaying ? '⏸' : '▶';
  }

  async bindAndPlayTrack(track) {
    // track: { id, title, ext, playlistName? }
    if (!track || !track.id) return;

    // Ambil Blob dari IndexedDB
    let objectUrl = null;
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
        // Ignore errors
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

    // Update Media Session metadata with title & cover
    this._updateMediaSession(track);
  }

  play() {
    this.audio.play().catch(() => {});
  }

  pause() {
    this.audio.pause();
  }

  prev() {
    const { queue } = this.getActiveQueue();
    if (!queue.length) return;

    const nextIndex = this._getPrevIndex(queue);
    if (nextIndex < 0) return;

    this.state.currentIndex = nextIndex;
    this.onSeekToIndex?.(queue[nextIndex]);
  }

  next() {
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

  _getPrevIndex(queue) {
    if (this.state.currentIndex === -1) return queue.length - 1;
    return this.state.currentIndex - 1;
  }

  _getNextIndex(queue) {
    const lastIdx = queue.length - 1;
    if (this.state.currentIndex === -1) return 0;

    if (this.state.currentIndex >= lastIdx) {
      if (this.state.repeatMode === 'all') return 0;
      return null;
    }
    return this.state.currentIndex + 1;
  }

  _onTimeUpdate() {
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

  _onDurationChange() {
    const dur = this.audio.duration;
    if (!dur || !isFinite(dur)) return;
    this.el.durationTime.textContent = formatTime(dur);
    this._syncProgressMax();
  }

  _syncProgressMax() {
    const dur = this.audio.duration;
    if (!dur || !isFinite(dur) || dur <= 0) return;
    this.el.progressRange.max = '1000';
    this.el.progressRange.value = '0';
    this.el.progressFill.style.width = '0%';
    this.el.durationTime.textContent = formatTime(dur);
  }

  _rangeToTime() {
    const dur = this.audio.duration || 0;
    const max = Number(this.el.progressRange.max);
    const v = Number(this.el.progressRange.value);
    if (!dur || max <= 0) return 0;
    return (v / max) * dur;
  }

  _onEnded() {
    if (this.state.repeatMode === 'one') {
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
      return;
    }
    this.next();
  }
}

function formatTime(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return m + ':' + String(r).padStart(2, '0');
}

function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}
