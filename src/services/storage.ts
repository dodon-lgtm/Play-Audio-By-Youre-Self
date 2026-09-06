import type { AppSettings, LastPlayed, Playlist, Track } from '../types/track';

const KEYS = {
  library: 'musicplayer:library',
  favorites: 'musicplayer:favorites',
  playlists: 'musicplayer:playlists',
  lastPlayed: 'musicplayer:lastPlayed',
  settings: 'musicplayer:settings'
} as const;

const DEFAULT_SETTINGS: AppSettings = {
  volume: 0.8,
  shuffle: false,
  repeat: 'off' // off | one | all
};

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getLibrary(): Track[] {
  return readJSON<Track[]>(KEYS.library, []);
}

export function setLibrary(items: Track[]): void {
  writeJSON(KEYS.library, items);
}

export function getFavorites(): string[] {
  return readJSON<string[]>(KEYS.favorites, []);
}

export function setFavorites(ids: string[]): void {
  writeJSON(KEYS.favorites, ids);
}

export function getPlaylists(): Playlist[] {
  return readJSON<Playlist[]>(KEYS.playlists, []);
}

export function setPlaylists(playlists: Playlist[]): void {
  writeJSON(KEYS.playlists, playlists);
}

export function getLastPlayed(): LastPlayed | null {
  return readJSON<LastPlayed | null>(KEYS.lastPlayed, null);
}

export function setLastPlayed(last: LastPlayed): void {
  writeJSON(KEYS.lastPlayed, last);
}

export function getSettings(): AppSettings {
  const partial = readJSON<Partial<AppSettings>>(KEYS.settings, {});
  return { ...DEFAULT_SETTINGS, ...partial };
}

export function setSettings(settings: Partial<AppSettings>): void {
  writeJSON(KEYS.settings, { ...DEFAULT_SETTINGS, ...settings });
}

/**
 * Lightweight unique id; cukup untuk metadata lokal.
 */
export function uid(): string {
  return 'id_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16);
}