// ============================================================
// settingsUI.ts — Halaman Pengaturan
// Port TypeScript dari js/settings.js.
// Memakai getAllTracks dari services/db (tanpa duplikasi koneksi IndexedDB).
// ============================================================

import { getAllTracks } from '../services/db';
import { getLibrary } from '../services/storage';
import { iconHardDrive, iconMusic, iconPackage, iconRefresh, iconSettings, iconZap } from './icons';

export const APP_VERSION = '2.0.0';

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return value < 10 ? value.toFixed(1) + ' ' + units[i] : Math.round(value) + ' ' + units[i];
}

export interface AudioStorageInfo {
  totalTracks: number;
  totalBytes: number;
}

async function getAudioStorageInfo(): Promise<AudioStorageInfo> {
  const library = getLibrary();
  const totalTracks = library.length;
  let totalBytes = 0;

  try {
    const all = await getAllTracks();
    for (const entry of all) {
      if (entry.blob?.size) totalBytes += entry.blob.size;
    }
  } catch (err) {
    console.warn('Gagal membaca ukuran audio dari IndexedDB:', err);
  }

  return { totalTracks, totalBytes };
}

async function getCacheStorageInfo(): Promise<number> {
  let totalBytes = 0;
  try {
    const keys = await caches.keys();
    for (const key of keys) {
      const cache = await caches.open(key);
      const requests = await cache.keys();
      for (const request of requests) {
        const response = await cache.match(request);
        if (response) {
          const clone = response.clone();
          const blob = await clone.blob();
          totalBytes += blob.size;
        }
      }
    }
  } catch (err) {
    console.warn('Gagal membaca ukuran cache:', err);
  }
  return totalBytes;
}

export async function performAppUpdate(buttonEl: HTMLButtonElement | null): Promise<void> {
  if (!navigator.onLine) {
    alert('Anda sedang offline.\n\nPerbarui aplikasi membutuhkan koneksi internet.');
    return;
  }

  const confirmed = confirm(
    'Perbarui aplikasi akan menghapus cache sementara dan mengunduh versi terbaru aplikasi.\n\n' +
      'File audio offline Anda TIDAK akan dihapus.\n\nLanjutkan?'
  );
  if (!confirmed) return;

  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = 'Memperbarui...';
  }

  try {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));
  } catch (err) {
    console.warn('Proses update mengalami gangguan, melanjutkan reload:', err);
  }

  window.location.reload();
}

export function bindSettingsEvents(): void {
  const updateBtn = document.getElementById('st-btn-update');
  if (updateBtn) {
    updateBtn.addEventListener('click', function () {
      performAppUpdate(updateBtn as HTMLButtonElement);
    });
  }
}

export async function renderSettings(): Promise<string> {
  const [storageInfo, cacheBytes] = await Promise.all([
    getAudioStorageInfo(),
    getCacheStorageInfo()
  ]);

  const { totalTracks, totalBytes } = storageInfo;
  const audioSizeFormatted = totalTracks > 0 ? formatBytes(totalBytes) : '0 B';
  const cacheFormatted = formatBytes(cacheBytes);

  const html = `<div class="st-wrapper">
    <div class="st-hero">
      <h2 class="flex items-center gap-2">${iconSettings(18)}<span>Pengaturan</span></h2>
      <p class="st-subtitle">Kelola aplikasi dan lihat informasi penyimpanan.</p>
    </div>

    <div class="st-section">
      <div class="st-card">
        <div class="st-card-header">
          <div class="st-card-icon st-card-icon--blue">${iconRefresh(20)}</div>
          <div>
            <h3 class="st-card-title">Perbarui Aplikasi</h3>
            <p class="st-card-subtitle">Hapus cache & muat ulang aplikasi versi terbaru</p>
          </div>
        </div>
        <div class="st-card-body">
          <p>Tindakan ini akan menghapus cache sementara aplikasi dan mendownload ulang file terbaru dari server. <strong>File audio offline Anda tetap aman</strong> karena tidak tersimpan di cache.</p>
          <button id="st-btn-update" class="st-btn st-btn--primary" type="button">${iconRefresh(16)}<span>Perbarui Sekarang</span></button>
        </div>
      </div>
    </div>

    <div class="st-section">
      <div class="st-card">
        <div class="st-card-header">
          <div class="st-card-icon st-card-icon--purple">${iconPackage(20)}</div>
          <div>
            <h3 class="st-card-title">Versi Aplikasi</h3>
            <p class="st-card-subtitle">Informasi versi aplikasi saat ini</p>
          </div>
        </div>
        <div class="st-card-body">
          <div class="st-version-badge"><span>v${APP_VERSION}</span></div>
        </div>
      </div>
    </div>

    <div class="st-section">
      <div class="st-card">
        <div class="st-card-header">
          <div class="st-card-icon st-card-icon--green">${iconHardDrive(20)}</div>
          <div>
            <h3 class="st-card-title">Informasi Penyimpanan</h3>
            <p class="st-card-subtitle">Status penyimpanan audio dan cache aplikasi</p>
          </div>
        </div>
        <div class="st-card-body">
          <div class="st-storage-grid">
            <div class="st-stat-item">
              <div class="st-stat-label">${iconMusic(15)}<span>Audio Offline</span></div>
              <div class="st-stat-value">${totalTracks} <span style="font-size:14px;font-weight:400;color:#94a3b8">Lagu</span></div>
              <div class="st-stat-sub">Total file audio tersimpan</div>
            </div>
            <div class="st-stat-item">
              <div class="st-stat-label">${iconPackage(15)}<span>Ukuran Audio</span></div>
              <div class="st-stat-value">${audioSizeFormatted}</div>
              <div class="st-stat-sub">Total ruang audio offline</div>
            </div>
            <div class="st-stat-item">
              <div class="st-stat-label">${iconZap(15)}<span>Cache Aplikasi</span></div>
              <div class="st-stat-value">${cacheFormatted}</div>
              <div class="st-stat-sub">Cache sementara aplikasi</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  return html;
}