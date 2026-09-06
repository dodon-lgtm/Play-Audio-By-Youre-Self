// ============================================================
// playerUI.ts — Komponen UI player (mini bar + modal full-screen)
// Pecahan dari js/ui.js setPlayerMeta().
// Fitur:
//  - Mini bar: cover, judul, kontrol utama (desktop & mobile).
//  - Modal full-screen (mobile ≤760px): album art besar, judul +
//    artis/file key, progress + timestamp, tombol utama (shuffle,
//    prev, play/pause, next, repeat), volume, favorit, dan tombol
//    tutup (chevron-down) di pojok atas.
// ============================================================

import type { AppElements } from '../types/app';
import type { Track } from '../types/track';
import { DEFAULT_COVER, loadCoverForTrack } from './shared';
import { iconStar, iconStarFilled } from './icons';

/** Breakpoint mobile — HARUS sinkron dengan `@media (max-width: 760px)` di src/index.css. */
const MOBILE_QUERY = '(max-width: 760px)';

/** Elemen target pembaruan meta player (mini bar + modal full-screen). */
export interface PlayerMetaTargets {
  /** Judul di mini bar bawah. */
  titleEl: HTMLElement;
  /** Subjudul/konteks di mini bar bawah. */
  subtitleEl: HTMLElement;
  /** Album art kecil di mini bar bawah. */
  coverEl: HTMLElement;
  /** Judul besar di modal full-screen (mobile). */
  modalTitleEl?: HTMLElement;
  /** Subjudul modal (konteks, atau fallback file key `.ext`). */
  modalSubtitleEl?: HTMLElement;
  /** Album art besar di modal full-screen (mobile). */
  modalCoverEl?: HTMLElement;
}

/** Terapkan gambar cover ke elemen (dipakai mini bar & modal). */
function applyCover(el: HTMLElement, coverUrl: string): void {
  el.style.backgroundImage = `url('${coverUrl}')`;
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';
  el.textContent = '';
}

/** Viewport sedang berada dalam mode mobile (≤760px)? */
export function isMobileViewport(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** Buka modal full-screen player (hanya berefek di viewport mobile). */
export function openMobilePlayer(els: AppElements): void {
  if (!isMobileViewport()) return;
  els.player.classList.add('is-expanded');
  els.playerExpand.setAttribute('aria-expanded', 'true');
  document.body.classList.add('player-modal-open');
}

/** Tutup modal full-screen player & pulihkan scroll halaman. */
export function closeMobilePlayer(els: AppElements): void {
  els.player.classList.remove('is-expanded');
  els.playerExpand.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('player-modal-open');
}

/**
 * Perbarui judul/subjudul & album art di mini bar + modal full-screen.
 * Dipanggil setiap kali track berpindah (setPlayerMeta dari app.ts).
 */
export async function updatePlayerMeta(
  targets: PlayerMetaTargets,
  track: Track | null,
  contextName: string
): Promise<void> {
  const barSubtitle = contextName || (track?.playlistName || '');

  // Mini bar
  targets.titleEl.textContent = track?.title || 'Belum ada audio';
  targets.subtitleEl.textContent = barSubtitle;

  // Modal full-screen — fallback subjudul ke file key ringkas (.ext)
  if (targets.modalTitleEl) {
    targets.modalTitleEl.textContent = track?.title || 'Belum ada audio';
  }
  if (targets.modalSubtitleEl) {
    targets.modalSubtitleEl.textContent = barSubtitle || (track?.ext ? `.${track.ext}` : '');
  }

  // Load cover dari IndexedDB, fallback ke default.png
  let coverUrl = DEFAULT_COVER;
  if (track?.id) {
    const stored = await loadCoverForTrack(track.id);
    if (stored) coverUrl = stored;
  }

  applyCover(targets.coverEl, coverUrl);
  if (targets.modalCoverEl) applyCover(targets.modalCoverEl, coverUrl);
}

/** Sinkronkan tampilan tombol favorit di modal player (ikon + state aria). */
export function syncFavoriteButton(btn: HTMLElement, isFavorite: boolean): void {
  btn.classList.toggle('is-active', isFavorite);
  btn.setAttribute('aria-pressed', String(isFavorite));
  btn.setAttribute('aria-label', isFavorite ? 'Hapus dari favorit' : 'Tambah ke favorit');
  btn.innerHTML = isFavorite ? iconStarFilled(20) : iconStar(20);
}