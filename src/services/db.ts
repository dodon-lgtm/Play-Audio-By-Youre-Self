import type { StoredCover, StoredTrack } from '../types/track';

const DB_NAME = 'musicplayer-db';
const DB_VERSION = 2;
const STORE_TRACKS = 'tracks';
const STORE_COVERS = 'covers';

/** Instance koneksi IndexedDB yang di-cache (singleton). */
let dbInstance: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_COVERS)) {
        db.createObjectStore(STORE_COVERS, { keyPath: 'trackId' });
      }
    };

    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(dbInstance);
    };

    req.onerror = () => {
      reject(req.error);
    };
  });
}

function promisifyReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Deteksi error kuota penyimpanan lintas browser.
 * (Chrome/Edge: QuotaExceededError; Firefox lama: NS_ERROR_DOM_QUOTA_REACHED)
 */
export function isQuotaError(err: unknown): boolean {
  const name =
    err instanceof DOMException ? err.name : (err as { name?: string } | null)?.name ?? '';
  return (
    name === 'QuotaExceededError' ||
    name === 'QuotaExceeded' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED'
  );
}

function quotaMessage(): string {
  return 'Penyimpanan perangkat penuh (QuotaExceededError). Hapus beberapa audio lalu coba lagi.';
}

/**
 * Cek apakah track sudah tersimpan di IndexedDB.
 * @param id - id track
 */
export async function trackExists(id: string): Promise<boolean> {
  const db = await openDB();
  const tx = db.transaction(STORE_TRACKS, 'readonly');
  const store = tx.objectStore(STORE_TRACKS);
  const result = await promisifyReq(store.get(id));
  return !!result;
}

/**
 * Simpan blob audio ke IndexedDB.
 * Melempar Error ramah pengguna jika kuota penyimpanan penuh.
 */
export async function saveTrack(
  id: string,
  fileBlob: Blob,
  meta: { ext?: string } = {}
): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    const store = tx.objectStore(STORE_TRACKS);
    const payload: StoredTrack = { id, blob: fileBlob, savedAt: Date.now(), ...meta };
    const req = store.put(payload);

    req.onsuccess = () => resolve(true);

    req.onerror = () => {
      const err = req.error;
      if (err && isQuotaError(err)) {
        reject(new Error(quotaMessage()));
        return;
      }
      reject(err);
    };
  });
}
/**
 * Ambil blob audio dari IndexedDB.
 * @returns null jika track tidak ditemukan.
 */
export async function getTrack(id: string): Promise<StoredTrack | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_TRACKS, 'readonly');
  const store = tx.objectStore(STORE_TRACKS);
  const result = await promisifyReq(store.get(id));
  return result ?? null;
}

/**
 * Hapus track dari IndexedDB.
 */
export async function deleteTrack(id: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    const store = tx.objectStore(STORE_TRACKS);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Ambil semua id track yang tersimpan di IndexedDB.
 */
export async function getAllTrackIds(): Promise<IDBValidKey[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_TRACKS, 'readonly');
  const store = tx.objectStore(STORE_TRACKS);
  return promisifyReq(store.getAllKeys());
}

/**
 * Hapus semua track dari IndexedDB.
 */
export async function clearTracks(): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    const store = tx.objectStore(STORE_TRACKS);
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Simpan cover image untuk sebuah track.
 * Melempar Error ramah pengguna jika kuota penyimpanan penuh.
 */
export async function saveCover(trackId: string, coverBlob: Blob): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COVERS, 'readwrite');
    const store = tx.objectStore(STORE_COVERS);
    const payload: StoredCover = { trackId, blob: coverBlob, savedAt: Date.now() };
    const req = store.put(payload);

    req.onsuccess = () => resolve(true);

    req.onerror = () => {
      const err = req.error;
      if (err && isQuotaError(err)) {
        reject(new Error(quotaMessage()));
        return;
      }
      reject(err);
    };
  });
}

/**
 * Ambil cover image untuk sebuah track.
 * @returns null jika cover tidak ditemukan.
 */
export async function getCover(trackId: string): Promise<StoredCover | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_COVERS, 'readonly');
  const store = tx.objectStore(STORE_COVERS);
  const result = await promisifyReq(store.get(trackId));
  return result ?? null;
}

/**
 * Hapus cover image untuk sebuah track.
 */
export async function deleteCover(trackId: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COVERS, 'readwrite');
    const store = tx.objectStore(STORE_COVERS);
    const req = store.delete(trackId);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
/**
 * Ambil semua record track yang tersimpan di IndexedDB.
 */
export async function getAllTracks(): Promise<StoredTrack[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_TRACKS, 'readonly');
  const store = tx.objectStore(STORE_TRACKS);
  return promisifyReq(store.getAll());
}