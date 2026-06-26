import { getFavorites, getLibrary, setFavorites, setLibrary, getPlaylists, getSettings, uid, setPlaylists, setLastPlayed } from './storage.js';
import { Player } from './player.js';
import { addTracksToPlaylist, createNewPlaylist, removeTrackFromPlaylist, reorderPlaylist, deletePlaylist } from './playlist.js';
import { makeUI } from './ui.js';
import { saveTrack, getTrack as dbGetTrack, deleteTrack as dbDeleteTrack, deleteCover } from './db.js';
import { filterLibrary } from './search.js';

function extOf(name) {
  const m = String(name || '').match(/\.[a-zA-Z0-9]+$/);
  return m ? m[0].toLowerCase() : '';
}

function isAllowedFile(file) {
  const ext = extOf(file.name);
  return ['.mp3', '.wav', '.opus'].includes(ext);
}

function getFileTitle(file) {
  return (file.name || '').replace(/\.[a-zA-Z0-9]+$/, '');
}

async function loadDurationForFile(file, audioEl) {
  const objectUrl = URL.createObjectURL(file);
  audioEl.src = objectUrl;
  return new Promise((resolve) => {
    const cleanup = () => {
      audioEl.removeEventListener('loadedmetadata', onLoaded);
      audioEl.removeEventListener('error', onErr);
    };
    const onLoaded = () => {
      const d = audioEl.duration;
      cleanup();
      resolve(isFinite(d) ? d : 0);
      URL.revokeObjectURL(objectUrl);
    };
    const onErr = () => {
      cleanup();
      resolve(0);
      URL.revokeObjectURL(objectUrl);
    };

    audioEl.addEventListener('loadedmetadata', onLoaded, { once: true });
    audioEl.addEventListener('error', onErr, { once: true });
  });
}

const els = {
  filePicker: document.getElementById('filePicker'),
  addAudioBtn: document.getElementById('addAudioBtn'),
  addAudioBtnMobile: document.getElementById('addAudioBtnMobile'),

  btnPrev: document.getElementById('btnPrev'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  btnNext: document.getElementById('btnNext'),
  btnShuffle: document.getElementById('btnShuffle'),
  btnRepeat: document.getElementById('btnRepeat'),

  progressRange: document.getElementById('progressRange'),
  currentTime: document.getElementById('currentTime'),
  durationTime: document.getElementById('durationTime'),
  progressFill: document.getElementById('progressFill'),

  volumeRange: document.getElementById('volumeRange'),
  volumeValue: document.getElementById('volumeValue'),

  page: document.getElementById('page'),
  playerCover: document.getElementById('playerCover'),
  playerTitle: document.getElementById('playerTitle'),
  playerSubtitle: document.getElementById('playerSubtitle'),

  audio: document.getElementById('audio'),

  hamburger: document.getElementById('hamburger'),
  hamburgerOverlay: document.getElementById('hamburgerOverlay'),
  menuClose: document.getElementById('menuClose'),
  addAudioBtnMenu: document.getElementById('addAudioBtnMenu')
};

const state = {
  route: 'home',
  selectedPlaylistId: null,
  query: '',
  activeContext: { type: 'library', playlistId: null },
  lastPlayed: null
};

const router = {
  onPlay: async (trackId) => {
    const track = getLibrary().find((t) => t.id === trackId);
    if (!track) return;

    const { queue, contextName } = getActiveQueue();
    const idx = queue.indexOf(trackId);
    player.state.currentIndex = idx;

    // player.js akan mengambil Blob dari IndexedDB
    player.bindAndPlayTrack({
      id: track.id,
      title: track.title,
      ext: track.ext,
      playlistName: track.playlistName
    });

    await ui.setPlayerMeta({ track, contextName });
  },

  onToggleFavorite: (trackId) => {
    const fav = new Set(getFavorites());
    if (fav.has(trackId)) fav.delete(trackId);
    else fav.add(trackId);
    setFavorites([...fav]);
    if (state.route === 'favorites') router.navigate('favorites');
    else ui.render(state.route, { query: state.query });
  },

  navigate: (route, params = {}) => {
    state.route = route;
    if (params?.playlistId) state.activeContext = { type: 'playlist', playlistId: params.playlistId };
    if (params?.query !== undefined) state.query = params.query;
    ui.render(route, params);
  }
};

function getActiveQueue() {
  const settings = getSettings();
  const shuffle = !!settings.shuffle;

  // Search mode - use filtered results as queue
  if (state.route === 'search' && state.query) {
    const library = getLibrary();
    const results = filterLibrary(library, state.query);
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

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleCopy(arr) {
  return shuffleArray(arr);
}

const player = new Player({
  audioEl: els.audio,
  elements: els,
  getActiveQueue
});

player.onSeekToIndex = async (trackId) => {
  const track = getLibrary().find((t) => t.id === trackId);
  if (!track) return;
  await player.bindAndPlayTrack({ id: track.id, title: track.title, ext: track.ext, playlistName: track.playlistName });
  await ui.setPlayerMeta({ track, contextName: getActiveQueue().contextName });
};

// Called on init to restore last played track
player.onTrackBindingRequired = async (trackId) => {
  const track = getLibrary().find((t) => t.id === trackId);
  if (!track) return;
  await player.bindAndPlayTrack({ id: track.id, title: track.title, ext: track.ext, playlistName: track.playlistName });
  await ui.setPlayerMeta({ track, contextName: getActiveQueue().contextName });
};

const ui = makeUI({ els, state, router });

async function addFiles(files) {
  const supported = [...files].filter(isAllowedFile);
  if (!supported.length) return;

  const audioMetaEl = els.audio;
  const library = getLibrary();
  const existing = new Set(library.map((t) => t.fileKey));

  let addedCount = 0;
  const total = supported.length;

  for (const file of supported) {
    const fileKey = file.name + '::' + file.size + '::' + file.lastModified;
    if (existing.has(fileKey)) continue;

    const id = uid();
    const title = getFileTitle(file);
    const ext = extOf(file.name);
    const durationSeconds = await loadDurationForFile(file, audioMetaEl);

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
    addedCount++;
  }

  setLibrary(library);
  router.navigate('collection');
}

function wireNav() {
  document.querySelectorAll('.nav-item[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = btn.dataset.route;
      router.navigate(r);
      state.activeContext = { type: 'library', playlistId: null };
    });
  });

  document.querySelectorAll('.bottom-item[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => router.navigate(btn.dataset.route));
  });

  els.addAudioBtn?.addEventListener('click', () => els.filePicker.click());
  els.addAudioBtnMobile?.addEventListener('click', () => els.filePicker.click());
  els.addAudioBtnMenu?.addEventListener('click', () => {
    closeHamburgerMenu();
    els.filePicker.click();
  });

  els.filePicker.addEventListener('change', async (e) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    await addFiles(files);
    els.filePicker.value = '';
  });
}

function bindTrackEvents() {
  window.addEventListener('track:delete', async (e) => {
    const { trackId } = e.detail || {};
    if (!trackId) return;
    // Hapus dari library
    let library = getLibrary();
    library = library.filter((t) => t.id !== trackId);
    setLibrary(library);
    // Hapus dari IndexedDB
    await dbDeleteTrack(trackId);
    // Hapus cover dari IndexedDB
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

function bindPlaylistEvents() {
  window.addEventListener('playlist:create', (e) => {
    const { name } = e.detail || {};
    if (!name) return;
    try {
      createNewPlaylist(name);
      router.navigate('playlists');
    } catch (err) {
      alert(err.message);
    }
  });

  window.addEventListener('playlist:add', (e) => {
    const { pid, trackIds } = e.detail || {};
    if (!pid || !Array.isArray(trackIds)) return;
    addTracksToPlaylist(pid, trackIds);
    router.navigate('playlists');
  });

  window.addEventListener('playlist:remove', (e) => {
    const { pid, trackId } = e.detail || {};
    if (!pid || !trackId) return;
    removeTrackFromPlaylist(pid, trackId);
    router.navigate('playlists');
  });

  window.addEventListener('playlist:reorder', (e) => {
    const { pid, fromIndex, toIndex } = e.detail || {};
    if (!pid) return;
    reorderPlaylist(pid, fromIndex, toIndex);
    router.navigate('playlists');
  });

  window.addEventListener('playlist:delete', (e) => {
    const { pid } = e.detail || {};
    if (!pid) return;
    deletePlaylist(pid);
    state.selectedPlaylistId = null;
    router.navigate('playlists');
  });

  document.addEventListener('click', (e) => {
    const btnPlay = e.target.closest('[data-play-playlist]');
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

    const btnDelete = e.target.closest('[data-delete-playlist]');
    if (!btnDelete) return;
    const pidToDelete = btnDelete.getAttribute('data-delete-playlist');
    if (!pidToDelete) return;
    if (!confirm('Hapus playlist ini?')) return;
    window.dispatchEvent(new CustomEvent('playlist:delete', { detail: { pid: pidToDelete } }));
  });
}

function openHamburgerMenu() {
  if (!els.hamburger || !els.hamburgerOverlay) return;
  els.hamburger.classList.add('active');
  els.hamburgerOverlay.classList.add('active');
}

function closeHamburgerMenu() {
  if (!els.hamburger || !els.hamburgerOverlay) return;
  els.hamburger.classList.remove('active');
  els.hamburgerOverlay.classList.remove('active');
}

function wireHamburgerMenu() {
  if (!els.hamburger || !els.menuClose || !els.hamburgerOverlay) return;

  els.hamburger.addEventListener('click', openHamburgerMenu);
  els.menuClose.addEventListener('click', closeHamburgerMenu);
  els.hamburgerOverlay.addEventListener('click', (e) => {
    if (e.target === els.hamburgerOverlay) closeHamburgerMenu();
  });

  // Menu navigation
  document.querySelectorAll('.menu-item[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = btn.dataset.route;
      router.navigate(r);
      state.activeContext = { type: 'library', playlistId: null };
      closeHamburgerMenu();
    });
  });
}

function init() {
  wireNav();
  wireHamburgerMenu();
  bindTrackEvents();
  bindPlaylistEvents();

  // Restore last played info but don't auto-play
  state.lastPlayed = JSON.parse(localStorage.getItem('musicplayer:lastPlayed') || 'null');
  player.initFromStorage();

  ui.render('home');
}

init();