import { getPlaylists, setPlaylists, uid } from './storage.js';

const MAX_PLAYLIST_NAME = 20;

export function createNewPlaylist(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Nama playlist kosong');
  if (trimmed.length > MAX_PLAYLIST_NAME) {
    throw new Error(`Nama playlist maksimal ${MAX_PLAYLIST_NAME} karakter`);
  }

  const playlists = getPlaylists();
  const pl = {
    id: uid(),
    name: trimmed,
    createdAt: Date.now(),
    items: [] // array of { trackId, addedAt }
  };
  playlists.push(pl);
  setPlaylists(playlists);
  return pl;
}

export function addTracksToPlaylist(playlistId, trackIds) {
  const playlists = getPlaylists();
  const pl = playlists.find((p) => p.id === playlistId);
  if (!pl) return;

  const set = new Set(pl.items.map((it) => it.trackId));
  for (const id of trackIds) {
    if (set.has(id)) continue;
    pl.items.push({ trackId: id, addedAt: Date.now() });
  }
  setPlaylists(playlists);
}

export function removeTrackFromPlaylist(playlistId, trackId) {
  const playlists = getPlaylists();
  const pl = playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  pl.items = pl.items.filter((it) => it.trackId !== trackId);
  setPlaylists(playlists);
}

export function reorderPlaylist(playlistId, fromIndex, toIndex) {
  const playlists = getPlaylists();
  const pl = playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  const items = pl.items;
  if (fromIndex < 0 || fromIndex >= items.length) return;
  if (toIndex < 0 || toIndex >= items.length) return;

  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  setPlaylists(playlists);
}

export function deletePlaylist(playlistId) {
  const playlists = getPlaylists();
  const filtered = playlists.filter((p) => p.id !== playlistId);
  setPlaylists(filtered);
}

