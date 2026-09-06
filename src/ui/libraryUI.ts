// ============================================================
// libraryUI.ts — render halaman Home, Koleksi, Favorit & handlers
// Pecahan dari js/ui.js (renderHome, renderCollection,
// renderFavorites, attachLibraryRowHandlers, row markup).
// ============================================================

import { getFavorites, getLibrary, getPlaylists } from '../services/storage';
import { saveCover } from '../services/db';
import type { Track } from '../types/track';
import {
  DEFAULT_COVER,
  escapeHtml,
  formatDate,
  formatDuration,
  loadCoverForTrack,
  pageTemplate,
  type UIHost
} from './shared';
import { iconPlay, iconStar, iconStarFilled, iconTrash } from './icons';

export function renderHome(host: UIHost): void {
  const library = getLibrary();
  const favorites = new Set(getFavorites());
  const lastPlayed = host.state.lastPlayed?.trackId
    ? library.find((t) => t.id === host.state.lastPlayed?.trackId)
    : null;

  const recent = [...library].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, 8);
  const favTracks = [...library].filter((t) => favorites.has(t.id)).slice(0, 8);
  const total = library.length;

  host.animTo(() => {
    host.pageEl.innerHTML = pageTemplate(`
      <div class="page-hero">
        <h2>Home</h2>
        <div class="small">dodon_lgtm™</div>
      </div>

      <div style="height:14px"></div>

      <div class="grid-3">
        <div class="card kpi">
          <div class="small">Total audio</div>
          <div class="num">${total}</div>
        </div>
        <div class="card kpi">
          <div class="small">Favorit</div>
          <div class="num">${favorites.size}</div>
        </div>
        <div class="card kpi">
          <div class="small">Playlist</div>
          <div class="num">${getPlaylists().length}</div>
        </div>
      </div>

      <div style="height:16px"></div>

      <div class="grid-2">
        <section class="card" style="padding:14px">
          <h2 style="margin:0 0 10px;font-size:16px">Audio terakhir diputar</h2>
          ${lastPlayed ? trackRowCard(lastPlayed) : `<div class="small">Belum ada riwayat.</div>`}
          <div style="height:10px"></div>
          <div class="small">Catatan : Jangan pernah MENGHAPUS BROWSER Anda jika tidak mau kehilangan audio</div>
        </section>

        <section class="card" style="padding:14px">
          <h2 style="margin:0 0 10px;font-size:16px">Playlist terbaru</h2>
          ${recentPlaylistMarkup()}
        </section>
      </div>

      <div style="height:16px"></div>

      <section class="card" style="padding:14px">
        <h2 style="margin:0 0 10px;font-size:16px">Audio favorit</h2>
        ${favTracks.length ? favTracks.map((t) => trackRowMini(t, { favorite: true })).join('') : `<div class="small">Belum ada favorit.</div>`}
      </section>

      <div style="height:16px"></div>

      <section class="card" style="padding:14px">
        <h2 style="margin:0 0 10px;font-size:16px">Playlist terbaru (dari Koleksi)</h2>
        <div class="small">Daftar audio terbaru (berdasarkan tanggal ditambahkan).</div>
        <div style="height:10px"></div>
        ${recent.length ? recent.map((t) => trackRowMini(t, { favorite: favorites.has(t.id) })).join('') : `<div class="small">Tambahkan audio untuk mulai.</div>`}
      </section>
    `);

    attachLibraryRowHandlers(host);
  });
}

/** Ringkasan 4 playlist terbaru (dipakai renderHome). */
export function recentPlaylistMarkup(): string {
  const pls = getPlaylists()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 4);
  if (!pls.length) return `<div class="small">Belum ada playlist.</div>`;
  return `<div>${pls
    .map(
      (p) =>
        `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)"><div style="font-weight:700">${escapeHtml(p.name)}</div><div class="small">${p.items?.length || 0} lagu</div></div>`
    )
    .join('')}</div>`;
}

export async function renderCollection(host: UIHost): Promise<void> {
  const library = getLibrary().slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

  // Load cover secara paralel
  const coverUrls = new Map<string, string>();
  await Promise.all(
    library.map(async (t) => {
      const url = await loadCoverForTrack(t.id);
      if (url) coverUrls.set(t.id, url);
    })
  );

  host.animTo(() => {
    host.pageEl.innerHTML = pageTemplate(`
      <div class="page-hero">
        <h2>Koleksi Saya</h2>
        <div class="small">Semua audio yang telah kamu tambahkan.</div>
      </div>
      <div style="height:14px"></div>
      <div class="card" style="padding:14px">
        <table class="table" aria-label="Daftar audio">
          <thead>
            <tr>
              <th>Audio</th>
              <th>Durasi</th>
              <th>Tanggal ditambahkan</th>
              <th style="text-align:right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${library.length ? library.map((t) => rowMarkup(t, coverUrls.get(t.id))).join('') : `<tr><td colspan="4" class="small">Belum ada audio. Gunakan tombol Tambah audio.</td></tr>`}
          </tbody>
        </table>
      </div>
    `);
    attachLibraryRowHandlers(host);
  });
}

export function renderFavorites(host: UIHost): void {
  const favorites = new Set(getFavorites());
  const library = getLibrary().filter((t) => favorites.has(t.id));

  host.animTo(() => {
    host.pageEl.innerHTML = pageTemplate(`
      <div class="page-hero">
        <h2>Favorit</h2>
        <div class="small">Audio yang kamu tandai favorit.</div>
      </div>
      <div style="height:14px"></div>
      <div class="card" style="padding:14px">
        ${library.length ? library.map((t) => trackRowMini(t, { favorite: true })).join('') : `<div class="small">Belum ada favorit.</div>`}
      </div>
    `);
    attachLibraryRowHandlers(host);
  });
}

/** Pasang handler interaksi baris lagu: play, favorit, tambah playlist, hapus, cover. */
export function attachLibraryRowHandlers(host: UIHost): void {
  const { state, router } = host;

  // play buttons
  document.querySelectorAll('[data-play-track]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const trackId = btn.getAttribute('data-play-track');
      router.onPlay(trackId as string);
    });
  });

  // favorite toggle
  document.querySelectorAll('[data-toggle-fav]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const trackId = btn.getAttribute('data-toggle-fav');
      router.onToggleFavorite(trackId as string);
    });
  });

  // entire row clickable to play
  document.querySelectorAll('.track-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      // Ignore clicks on buttons inside the row
      if ((e.target as HTMLElement).closest('button')) return;
      const trackId = row.getAttribute('data-track-id');
      if (trackId) router.onPlay(trackId);
    });
  });

  // add to playlist from rows
  document.querySelectorAll('[data-add-to-playlist]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const trackId = btn.getAttribute('data-add-to-playlist');
      const pid = state.selectedPlaylistId || getPlaylists()[0]?.id;
      if (!pid) return;
      window.dispatchEvent(new CustomEvent('playlist:add', { detail: { pid, trackIds: [trackId] } }));
      router.navigate('playlists');
    });
  });

  // delete track
  document.querySelectorAll('[data-delete-track]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const trackId = btn.getAttribute('data-delete-track');
      if (!trackId) return;
      if (confirm('Hapus audio ini dari koleksi?')) {
        window.dispatchEvent(new CustomEvent('track:delete', { detail: { trackId } }));
        router.navigate(state.route, { query: state.query });
      }
    });
  });

  // add cover image
  document.querySelectorAll('[data-add-cover]').forEach((div) => {
    div.addEventListener('click', async (e) => {
      e.stopPropagation();
      const trackId = div.getAttribute('data-add-cover');
      if (!trackId) return;
      // create hidden file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        await saveCover(trackId, file);
        router.navigate(state.route, { query: state.query });
      };
      input.click();
    });
  });
}

/** Baris lengkap untuk tabel Koleksi. */
export function rowMarkup(t: Track, coverUrl?: string): string {
  const finalCover = coverUrl || DEFAULT_COVER;
  const coverStyle = `background-image:url('${finalCover}');background-size:cover;background-position:center;border:none`;
  return `
    <tr class="track-row" data-track-id="${t.id}">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="cover" data-add-cover="${t.id}" style="width:28px;height:28px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;${coverStyle};font-size:10px;color:rgba(255,255,255,.4)"></div>
          <div style="min-width:0;flex:1">
            <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.title)}</div>
            <div class="small" style="font-size:11px">.${escapeHtml(t.ext)}</div>
          </div>
        </div>
      </td>
      <td class="small" style="font-size:12px;white-space:nowrap">${formatDuration(t.durationSeconds)}</td>
      <td class="small" style="font-size:12px">${formatDate(t.addedAt)}</td>
      <td>
        <div class="row-actions" style="justify-content:flex-end">
          <button class="btn btn-primary px-2.5 py-1 text-xs" type="button" data-play-track="${t.id}" aria-label="Putar">${iconPlay(13)}</button>
          <button class="btn btn-danger px-2 py-1 text-xs" type="button" data-delete-track="${t.id}" aria-label="Hapus">${iconTrash(13)}</button>
        </div>
      </td>
    </tr>
  `;
}

/** Kartu ringkas (dipakai Home untuk last played). */
export function trackRowCard(t: Track): string {
  return `
    <div class="track-row flex cursor-pointer items-center justify-between gap-2 py-2" data-track-id="${t.id}">
      <div class="min-w-0 flex-1">
        <div class="truncate text-[13px] font-bold">${escapeHtml(t.title)}</div>
        <div class="small text-[11px]">${formatDuration(t.durationSeconds)}</div>
      </div>
      <button class="btn btn-primary px-2.5 py-1 text-xs" type="button" data-play-track="${t.id}" aria-label="Putar">${iconPlay(13)}</button>
    </div>
  `;
}

/** Baris mini (Favorit, hasil Cari, Home). */
export function trackRowMini(t: Track, opts: { favorite?: boolean }): string {
  const fav = !!opts.favorite;
  return `
    <div class="track-row flex cursor-pointer items-center justify-between gap-2 border-b border-white/5 py-2" data-track-id="${t.id}">
      <div class="min-w-0 flex-1">
        <div class="truncate text-[13px] font-bold">${escapeHtml(t.title)}</div>
        <div class="small text-[11px]">${formatDuration(t.durationSeconds)} • ${formatDate(t.addedAt)}</div>
      </div>
      <div class="flex items-center gap-1.5">
        <button class="btn px-2 py-1 text-xs" type="button" data-toggle-fav="${t.id}" aria-label="Toggle favorit">${fav ? iconStarFilled(14) : iconStar(14)}</button>
        <button class="btn btn-primary px-2.5 py-1 text-xs" type="button" data-play-track="${t.id}" aria-label="Putar">${iconPlay(13)}</button>
      </div>
    </div>
  `;
}