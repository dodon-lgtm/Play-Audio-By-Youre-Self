// ============================================================
// searchUI.ts — Halaman pencarian (input tidak kehilangan fokus)
// Pecahan dari js/ui.js renderSearch() + searchResultsMarkup().
// ============================================================

import { getFavorites, getLibrary } from '../services/storage';
import { filterLibrary } from '../services/search';
import type { Track } from '../types/track';
import { attachLibraryRowHandlers, trackRowMini } from './libraryUI';
import { escapeAttr, pageTemplate, type UIHost } from './shared';

export function renderSearch(host: UIHost, query: string): void {
  const results = filterLibrary(getLibrary(), query);

  host.animTo(() => {
    // Input #searchInput dirender HANYA sekali. Saat mengetik, yang diperbarui
    // cukup kontainer #searchResults — sehingga fokus/kursor input tidak hilang.
    host.pageEl.innerHTML = pageTemplate(`
      <div class="page-hero">
        <h2>Cari</h2>
        <div class="small">Pencarian real-time berdasarkan nama file.</div>
      </div>
      <div style="height:14px"></div>
      <div class="card" style="padding:14px">
        <input id="searchInput" placeholder="Ketik nama audio..." value="${escapeAttr(query)}" autocomplete="off"
        class="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-neutral-200 outline-none placeholder:text-neutral-500 focus:border-[#1db954]/40 focus:ring-4 focus:ring-[#1db954]/10" />
      </div>
      <div style="height:12px"></div>
      <div class="card" style="padding:14px">
        <div class="small" style="margin-bottom:10px" id="searchCount">${results.length} hasil</div>
        <div id="searchResults">${searchResultsMarkup(results)}</div>
      </div>
    `);
    attachLibraryRowHandlers(host);

    const input = document.getElementById('searchInput');
    let searchTimeout: number | undefined;
    input?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = window.setTimeout(() => {
        const q = (e.target as HTMLInputElement).value;
        host.state.query = q;
        const res = filterLibrary(getLibrary(), q);
        const resEl = document.getElementById('searchResults');
        const countEl = document.getElementById('searchCount');
        if (resEl) resEl.innerHTML = searchResultsMarkup(res);
        if (countEl) countEl.textContent = `${res.length} hasil`;
        attachLibraryRowHandlers(host);
      }, 300);
    });
  });
}

function searchResultsMarkup(results: Track[]): string {
  return results.length
    ? results.map((t) => trackRowMini(t, { favorite: getFavorites().includes(t.id) })).join('')
    : `<div class="small">Tidak ada hasil.</div>`;
}