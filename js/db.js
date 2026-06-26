const DB_NAME = 'musicplayer-db';
const DB_VERSION = 2;
const STORE_TRACKS = 'tracks';
const STORE_COVERS = 'covers';

/** @type {IDBDatabase|null} */
let dbInstance = null;

async function openDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = /** @type {IDBDatabase} */ (event.target.result);
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

function promisifyReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Check if track exists in IndexedDB.
 * @param {string} id - track id
 * @returns {Promise<boolean>}
 */
export async function trackExists(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readonly');
    const store = tx.objectStore(STORE_TRACKS);
    const req = store.get(id);
    req.onsuccess = () => resolve(!!req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save track blob to IndexedDB.
 * @param {string} id - track id
 * @param {Blob} fileBlob - audio file blob
 * @param {object} [meta={}] - optional metadata (ext, etc)
 * @returns {Promise<boolean>}
 */
export async function saveTrack(id, fileBlob, meta = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    const store = tx.objectStore(STORE_TRACKS);
    const payload = {
      id,
      blob: fileBlob,
      savedAt: Date.now(),
      ...meta
    };
    const req = store.put(payload);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get track blob from IndexedDB.
 * @param {string} id - track id
 * @returns {Promise<{id:string, blob:Blob}|null>}
 */
export async function getTrack(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_TRACKS, 'readonly');
  const store = tx.objectStore(STORE_TRACKS);
  const req = store.get(id);
  const result = await promisifyReq(req);
  if (!result) return null;
  return {
    id: result.id,
    blob: result.blob,
    ext: result.ext
  };
}

/**
 * Delete track from IndexedDB.
 * @param {string} id - track id
 * @returns {Promise<boolean>}
 */
export async function deleteTrack(id) {
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
 * Get all track ids stored in IndexedDB.
 * @returns {Promise<string[]>}
 */
export async function getAllTrackIds() {
  const db = await openDB();
  const tx = db.transaction(STORE_TRACKS, 'readonly');
  const store = tx.objectStore(STORE_TRACKS);
  const req = store.getAllKeys();
  return promisifyReq(req);
}

/**
 * Clear all tracks from IndexedDB.
 * @returns {Promise<boolean>}
 */
export async function clearTracks() {
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
 * Save cover image for a track.
 * @param {string} trackId - track id
 * @param {Blob} coverBlob - image blob
 * @returns {Promise<boolean>}
 */
export async function saveCover(trackId, coverBlob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COVERS, 'readwrite');
    const store = tx.objectStore(STORE_COVERS);
    const payload = { trackId, blob: coverBlob, savedAt: Date.now() };
    const req = store.put(payload);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get cover image for a track.
 * @param {string} trackId - track id
 * @returns {Promise<{trackId:string, blob:Blob}|null>}
 */
export async function getCover(trackId) {
  const db = await openDB();
  const tx = db.transaction(STORE_COVERS, 'readonly');
  const store = tx.objectStore(STORE_COVERS);
  const req = store.get(trackId);
  const result = await promisifyReq(req);
  if (!result) return null;
  return { trackId: result.trackId, blob: result.blob };
}

/**
 * Delete cover image for a track.
 * @param {string} trackId - track id
 * @returns {Promise<boolean>}
 */
export async function deleteCover(trackId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COVERS, 'readwrite');
    const store = tx.objectStore(STORE_COVERS);
    const req = store.delete(trackId);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}