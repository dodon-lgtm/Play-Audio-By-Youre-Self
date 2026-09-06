// ============================================================
// app.ts — Glue aplikasi (port js/app.js) ke services TypeScript.
// Menginisialisasi Player, UI, router, dan semua event wiring.
// ============================================================

import { Player } from './services/player';
import {
  addTracksToPlaylist,
  createNewPlaylist,
  deletePlaylist,
  removeTrackFromPlaylist,
  reorderPlaylist
} from './services/playlist';
import { filterLibrary } from './services/search';
import { deleteCover, deleteTrack as dbDeleteTrack, saveTrack } from './services/db';
import {
  getFavorites,
  getLastPlayed,
  getLibrary,
  getPlaylists,
  getSettings,
  setFavorites,
  setLibrary,
  uid
} from './services/storage';
import { createUI } from './ui';
import { closeMobilePlayer, openMobilePlayer, syncFavoriteButton } from './ui/playerUI';
import type { AppElements, AppState, NavigateParams, Route } from './types/app';

function extOf(name: string): string {
  const m = String(name || '').match(/\.[a-zA-Z0-9]+$/);
  return m ? m[0].toLowerCase() : '';
}

function isAllowedFile(file: File): boolean {
  const ext = extOf(file.name);
  return ['.mp3', '.wav', '.opus'].includes(ext);
}

function getFileTitle(file: File): string {
  return (file.name || '').replace(/\.[a-zA-Z0-9]+$/, '');
}

async function loadDurationForFile(file: File): Promise<number> {
  // Gunakan instance Audio() terpisah, bukan elemen <audio id="audio"> milik player.
  const probe = new Audio();
  probe.preload = 'metadata';
  const objectUrl = URL.createObjectURL(file);
  probe.src = objectUrl;

  return new Promise((resolve) => {
    const cleanup = () => {
      probe.removeEventListener('loadedmetadata', onLoaded);
      probe.removeEventListener('error', onErr);
      URL.revokeObjectURL(objectUrl);
    };
    const onLoaded = () => {
      const d = probe.duration;
      cleanup();
      resolve(isFinite(d) && d > 0 ? d : 0);
    };
    const onErr = () => {
      cleanup();
      resolve(0);
    };
    probe.addEventListener('loadedmetadata', onLoaded, { once: true });
    probe.addEventListener('error', onErr, { once: true });
  });
}

function getElements(): AppElements {
  const req = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Elemen #${id} tidak ditemukan`);
    return el as T;
  };
  return {
    page: req('page'),
    player: req('player'),
    playerCover: req('playerCover'),
    playerModalCover: req('playerModalCover'),
    playerModalTitle: req('playerModalTitle'),
    playerModalSubtitle: req('playerModalSubtitle'),
    playerExpand: req('playerExpand'),
    playerCollapse: req('playerCollapse'),
    playerFavorite: req('playerFavorite'),
    playerTitle: req('playerTitle'),
    playerSubtitle: req('playerSubtitle'),
    currentTime: req('currentTime'),
    durationTime: req('durationTime'),
    progressFill: req('progressFill'),
    volumeValue: req('volumeValue'),
    btnPrev: req('btnPrev'),
    btnPlayPause: req('btnPlayPause'),
    btnNext: req('btnNext'),
    btnShuffle: req('btnShuffle'),
    btnRepeat: req('btnRepeat'),
    progressRange: req('progressRange'),
    volumeRange: req('volumeRange'),
    filePicker: req<HTMLInputElement>('filePicker'),
    addAudioBtn: req('addAudioBtn'),
    addAudioBtnMobile: req('addAudioBtnMobile'),
    addAudioBtnMenu: req('addAudioBtnMenu'),
    hamburger: req('hamburger'),
    hamburgerOverlay: req('hamburgerOverlay'),
    menuClose: req('menuClose'),
    audio: req<HTMLAudioElement>('audio')
  };
}

function shuffleArray(arr: string[]): string[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function startApp(): void {
  const els = getElements();

  const state: AppState = {
    route: 'home',
    selectedPlaylistId: null,
    query: '',
    activeContext: { type: 'library', playlistId: null },
    lastPlayed: null
  };

  function getActiveQueue(): { queue: string[]; contextName: string } {
    const settings = getSettings();
    const shuffle = !!settings.shuffle;

    // Mode pencarian: pakai hasil filter sebagai queue
    if (state.route === 'search' && state.query) {
      const results = filterLibrary(getLibrary(), state.query);
      const base = results.map((t) => t.id);
      const queue = shuffle ? shuffleArray(base) : base;
      return { queue, contextName: `Cari: "${state.query}"` };
    }

    if (state.activeContext.type === 'playlist' && state.activeContext.playlistId) {
      const pl = getPlaylists().find((p) => p.id === state.activeContext.playlistId);
      const base = (pl?.items || []).map((it) => it.trackId);
      const queue = shuffle ? shuffleArray(base) : base;
      return { queue, contextName: pl?.name || '' };
    }

    const all = getLibrary().map((t) => t.id);
    const queue = shuffle ? shuffleArray(all) : all;
    return { queue, contextName: 'Koleksi Saya' };
  }

  const player = new Player({
    audioEl: els.audio,
    elements: els,
    getActiveQueue
  });

  const router = {
    onPlay: async (trackId: string) => {
      const track = getLibrary().find((t) => t.id === trackId);
      if (!track) return;
      const { queue, contextName } = getActiveQueue();
      player.state.currentIndex = queue.indexOf(trackId);
      await player.bindAndPlayTrack({
        id: track.id,
        title: track.title,
        ext: track.ext,
        playlistName: track.playlistName
      });
      await ui.setPlayerMeta({ track, contextName, isFavorite: getFavorites().includes(track.id) });
    },
    onToggleFavorite: (trackId: string) => {
      const fav = new Set(getFavorites());
      if (fav.has(trackId)) fav.delete(trackId);
      else fav.add(trackId);
      setFavorites([...fav]);
      // Sinkronkan tombol favorit di player full-screen bila lagu yang
      // di-toggle adalah lagu yang sedang aktif di player.
      if (getLastPlayed()?.trackId === trackId) {
        syncFavoriteButton(els.playerFavorite, fav.has(trackId));
      }
      if (state.route === 'favorites') router.navigate('favorites');
      else ui.render(state.route, { query: state.query });
    },
    navigate: (route: Route, params: NavigateParams = {}) => {
      state.route = route;
      if (params?.playlistId) state.activeContext = { type: 'playlist', playlistId: params.playlistId };
      if (params?.query !== undefined) state.query = params.query;
      ui.render(route, params);
    }
  };

  const ui = createUI(els, state, router);

  player.onSeekToIndex = async (trackId: string) => {
    const track = getLibrary().find((t) => t.id === trackId);
    if (!track) return;
    await player.bindAndPlayTrack({
      id: track.id,
      title: track.title,
      ext: track.ext,
      playlistName: track.playlistName
    });
    await ui.setPlayerMeta({ track, contextName: getActiveQueue().contextName, isFavorite: getFavorites().includes(track.id) });
  };

  async function addFiles(files: File[]): Promise<void> {
    const supported = [...files].filter(isAllowedFile);
    if (!supported.length) return;

    const library = getLibrary();
    const existing = new Set(library.map((t) => t.fileKey));

    for (const file of supported) {
      const fileKey = file.name + '::' + file.size + '::' + file.lastModified;
      if (existing.has(fileKey)) continue;

      const id = uid();
      const title = getFileTitle(file);
      const ext = extOf(file.name);
      const durationSeconds = await loadDurationForFile(file);

      // Simpan blob audio ke IndexedDB agar bisa diputar setelah reload/restart
      await saveTrack(id, file, { ext });

      library.push({
        id,
        title,
        ext,
        durationSeconds,
        addedAt: Date.now(),
        fileKey
      });
    }

    setLibrary(library);
    router.navigate('collection');
  }

  function wireNav(): void {
    document.querySelectorAll('.nav-item[data-route]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = btn.getAttribute('data-route') as Route;
        router.navigate(r);
        state.activeContext = { type: 'library', playlistId: null };
      });
    });

    document.querySelectorAll('.bottom-item[data-route]').forEach((btn) => {
      btn.addEventListener('click', () => {
        router.navigate(btn.getAttribute('data-route') as Route);
      });
    });

    els.addAudioBtn.addEventListener('click', () => els.filePicker.click());
    els.addAudioBtnMobile.addEventListener('click', () => els.filePicker.click());
    els.addAudioBtnMenu.addEventListener('click', () => {
      closeHamburgerMenu();
      els.filePicker.click();
    });

    els.filePicker.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      const files = target.files ? Array.from(target.files) : [];
      await addFiles(files);
      els.filePicker.value = '';
    });
  }

  function openHamburgerMenu(): void {
    els.hamburger.classList.add('active');
    els.hamburgerOverlay.classList.add('active');
  }

  function closeHamburgerMenu(): void {
    els.hamburger.classList.remove('active');
    els.hamburgerOverlay.classList.remove('active');
  }

  function wireHamburgerMenu(): void {
    els.hamburger.addEventListener('click', openHamburgerMenu);
    els.menuClose.addEventListener('click', closeHamburgerMenu);
    els.hamburgerOverlay.addEventListener('click', (e) => {
      if (e.target === els.hamburgerOverlay) closeHamburgerMenu();
    });

    document.querySelectorAll('.menu-item[data-route]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = btn.getAttribute('data-route') as Route;
        router.navigate(r);
        state.activeContext = { type: 'library', playlistId: null };
        closeHamburgerMenu();
      });
    });
  }

  /**
   * Wire modal full-screen player (mobile):
   * - Tap cover/judul di mini bar → buka modal.
   * - Chevron-down / tombol Escape → tutup modal.
   * - Tombol favorit → toggle favorit lagu aktif.
   * - Kembali ke viewport desktop saat modal terbuka → tutup otomatis.
   */
  function wirePlayerModal(): void {
    els.playerExpand.addEventListener('click', () => openMobilePlayer(els));
    els.playerCollapse.addEventListener('click', () => closeMobilePlayer(els));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMobilePlayer(els);
    });

    const mobileQuery = window.matchMedia('(max-width: 760px)');
    const onViewportChange = (e: MediaQueryListEvent) => {
      if (!e.matches) closeMobilePlayer(els);
    };
    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', onViewportChange);
    } else if (typeof mobileQuery.addListener === 'function') {
      mobileQuery.addListener(onViewportChange);
    }

    // Status favorit awal (lagu terakhir yang diputar).
    const initialId = getLastPlayed()?.trackId;
    syncFavoriteButton(els.playerFavorite, !!initialId && getFavorites().includes(initialId));

    els.playerFavorite.addEventListener('click', () => {
      const trackId = getLastPlayed()?.trackId;
      if (trackId) router.onToggleFavorite(trackId);
    });
  }

  function bindTrackEvents(): void {
    window.addEventListener('track:delete', async (e) => {
      const detail = (e as CustomEvent<{ trackId?: string }>).detail || {};
      const trackId = detail.trackId;
      if (!trackId) return;

      // Hapus dari library
      let library = getLibrary();
      library = library.filter((t) => t.id !== trackId);
      setLibrary(library);

      // Hapus dari IndexedDB
      await dbDeleteTrack(trackId);
      await deleteCover(trackId);

      // Hapus dari favorit
      const fav = new Set(getFavorites());
      fav.delete(trackId);
      setFavorites([...fav]);

      // Hapus dari semua playlist
      getPlaylists().forEach((pl) => {
        removeTrackFromPlaylist(pl.id, trackId);
      });
    });
  }

  function bindPlaylistEvents(): void {
    window.addEventListener('playlist:create', (e) => {
      const detail = (e as CustomEvent<{ name?: string }>).detail || {};
      const name = detail.name;
      if (!name) return;
      try {
        createNewPlaylist(name);
        router.navigate('playlists');
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });

    window.addEventListener('playlist:add', (e) => {
      const detail = (e as CustomEvent<{ pid?: string; trackIds?: string[] }>).detail || {};
      if (!detail.pid || !Array.isArray(detail.trackIds)) return;
      addTracksToPlaylist(detail.pid, detail.trackIds);
      router.navigate('playlists');
    });

    window.addEventListener('playlist:remove', (e) => {
      const detail = (e as CustomEvent<{ pid?: string; trackId?: string }>).detail || {};
      if (!detail.pid || !detail.trackId) return;
      removeTrackFromPlaylist(detail.pid, detail.trackId);
      router.navigate('playlists');
    });

    window.addEventListener('playlist:reorder', (e) => {
      const detail = (e as CustomEvent<{ pid?: string; fromIndex?: number; toIndex?: number }>).detail || {};
      if (!detail.pid) return;
      reorderPlaylist(detail.pid, detail.fromIndex as number, detail.toIndex as number);
      router.navigate('playlists');
    });

    window.addEventListener('playlist:delete', (e) => {
      const detail = (e as CustomEvent<{ pid?: string }>).detail || {};
      if (!detail.pid) return;
      deletePlaylist(detail.pid);
      state.selectedPlaylistId = null;
      router.navigate('playlists');
    });

    document.addEventListener('click', (e) => {
      const btnPlay = (e.target as HTMLElement).closest('[data-play-playlist]');
      if (btnPlay) {
        const pid = btnPlay.getAttribute('data-play-playlist');
        if (!pid) return;
        state.activeContext = { type: 'playlist', playlistId: pid };
        const pl = getPlaylists().find((p) => p.id === pid);
        const firstTrackId = pl?.items?.[0]?.trackId;
        if (!firstTrackId) return;
        router.navigate('playlists');
        router.onPlay(firstTrackId);
        return;
      }

      const btnDelete = (e.target as HTMLElement).closest('[data-delete-playlist]');
      if (!btnDelete) return;
      const pidToDelete = btnDelete.getAttribute('data-delete-playlist');
      if (!pidToDelete) return;
      if (!confirm('Hapus playlist ini?')) return;
      window.dispatchEvent(new CustomEvent('playlist:delete', { detail: { pid: pidToDelete } }));
    });
  }

  // Wire & init
  wireNav();
  wireHamburgerMenu();
  wirePlayerModal();
  bindTrackEvents();
  bindPlaylistEvents();

  state.lastPlayed = getLastPlayed();
  player.initFromStorage();

  ui.render('home');
}