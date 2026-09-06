// ============================================================
// shared.ts — Helper bersama & tipe UIHost untuk modul UI.
// Pecahan dari js/ui.js (helpers murni, tanpa DOM page).
// ============================================================

import { getCover } from '../services/db';
import type { AppElements, AppState, Router } from '../types/app';

export const DEFAULT_COVER = './assets/covers/default.png';

/** Kontainer default untuk halaman. */
export function pageTemplate(contentHtml: string): string {
  return `<div class="page-inner">${contentHtml}</div>`;
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function escapeAttr(s: unknown): string {
  return escapeHtml(s).replaceAll('`', '&#096;');
}

export function formatDuration(seconds?: number | null): string {
  const s = Number(seconds) || 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  if (!s) return '0:00';
  return m + ':' + String(r).padStart(2, '0');
}

export function formatDate(ts?: number | null): string {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: '2-digit' });
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
}

export async function loadCoverForTrack(trackId: string): Promise<string | null> {
  try {
    const stored = await getCover(trackId);
    if (stored?.blob) {
      return await blobToDataURL(stored.blob);
    }
  } catch {}
  return null;
}

/**
 * Kontainer mutual untuk modul UI.
 * Menyimpan akses ke elemen global, state, router, dan helper animasi halaman.
 */
export interface UIHost {
  els: AppElements;
  pageEl: HTMLElement;
  state: AppState;
  router: Router;
  animTo(fn: () => void): void;
}