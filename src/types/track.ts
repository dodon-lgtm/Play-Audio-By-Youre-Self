// ============================================================
// TIPE DATA INTI — Music Player PWA 'Eternal Abyss'
// Dibuat berdasarkan struktur data yang digunakan di js/db.js
// dan js/storage.js agar migrasi ke TypeScript aman.
// ============================================================

/** Mode pengulangan pemutaran. */
export type RepeatMode = 'off' | 'one' | 'all';

/** Metadata audio di localStorage (kunci: `musicplayer:library`). */
export interface Track {
  /** ID unik (dihasilkan `uid()` di storage.js). */
  id: string;
  /** Judul — diambil dari nama file tanpa ekstensi. */
  title: string;
  /** Ekstensi file (`.mp3`, `.wav`, `.opus`). */
  ext: string;
  /** Durasi audio dalam detik. */
  durationSeconds: number;
  /** Timestamp (ms) saat audio ditambahkan ke library. */
  addedAt: number;
  /** Key dedup file: `nama::ukuran::lastModified`. */
  fileKey: string;
  /** Nama konteks playlist (opsional). */
  playlistName?: string;
}

/** Satu item di dalam playlist. */
export interface PlaylistItem {
  /** ID track di library. */
  trackId: string;
  /** Timestamp (ms) saat track ditambahkan ke playlist. */
  addedAt: number;
}

/** Struktur playlist (kunci: `musicplayer:playlists`). */
export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  items: PlaylistItem[];
}

/** Pengaturan aplikasi (kunci: `musicplayer:settings`). */
export interface AppSettings {
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

/** Lagu terakhir diputar (kunci: `musicplayer:lastPlayed`). */
export interface LastPlayed {
  /** ID track yang terakhir diputar. */
  trackId: string;
  /** Nama konteks pemutaran ((Koleksi Saya, Playlist, atau hasil Cari). */
  contextName?: string;
  /** Timestamp (ms). */
  ts: number;
}

/** Record di IndexedDB store `tracks`. */
export interface StoredTrack {
  id: string;
  blob: Blob;
  savedAt: number;
  ext?: string;
}

/** Record di IndexedDB store `covers`. */
export interface StoredCover {
  trackId: string;
  blob: Blob;
  savedAt: number;
}