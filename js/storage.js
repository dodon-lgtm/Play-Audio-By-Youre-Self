const KEYS = {
  library: 'musicplayer:library',
  favorites: 'musicplayer:favorites',
  playlists: 'musicplayer:playlists',
  lastPlayed: 'musicplayer:lastPlayed',
  settings: 'musicplayer:settings'
};

const DEFAULT_SETTINGS = {
  volume: 0.8,
  shuffle: false,
  repeat: 'off' // off | one | all
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getLibrary() {
  return readJSON(KEYS.library, []);
}

export function setLibrary(items) {
  writeJSON(KEYS.library, items);
}

export function getFavorites() {
  return readJSON(KEYS.favorites, []);
}

export function setFavorites(ids) {
  writeJSON(KEYS.favorites, ids);
}

export function getPlaylists() {
  return readJSON(KEYS.playlists, []);
}

export function setPlaylists(playlists) {
  writeJSON(KEYS.playlists, playlists);
}

export function getLastPlayed() {
  return readJSON(KEYS.lastPlayed, null);
}

export function setLastPlayed(last) {
  writeJSON(KEYS.lastPlayed, last);
}

export function getSettings() {
  const settings = readJSON(KEYS.settings, DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...settings };
}

export function setSettings(settings) {
  writeJSON(KEYS.settings, { ...DEFAULT_SETTINGS, ...settings });
}

export function uid() {
  // Lightweight unique id; enough for local metadata.
  return 'id_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16);
}

