// ============================================================
// playlistUI.ts — Halaman Playlist (Render + CRUD + reorder)
// Pecahan dari js/ui.js renderPlaylists & binding-nya.
// ============================================================

import { getFavorites, getLibrary, getPlaylists } from '../services/storage';
import { attachLibraryRowHandlers } from './libraryUI';
import { iconChevronDown, iconChevronUp, iconStarFilled } from './icons';
import { escapeHtml, formatDuration, pageTemplate, type UIHost } from './shared';
import type { Playlist } from '../types/track';

export function renderPlaylists(host: UIHost): void {
  const state = host.state;
  const router = host.router;
  const playlists = getPlaylists().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const library = getLibrary();
  const favSet = new Set(getFavorites());

  host.animTo(() => {
    host.pageEl.innerHTML = pageTemplate(`
      <div class="page-hero">
        <h2>Playlist</h2>
        <div class="small">Buat playlist baru, tambah audio, hapus, dan ubah urutan (Up/Down).</div>
      </div>
      <div style="height:14px"></div>

      <section class="card" style="padding:14px; margin-bottom:14px">
        <div class="flex flex-wrap items-center gap-2.5">
          <input id="newPlaylistName" placeholder="Nama playlist" class="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-neutral-200 outline-none placeholder:text-neutral-500 focus:border-[#1db954]/40 focus:ring-4 focus:ring-[#1db954]/10" />
          <button class="btn btn-primary" id="btnCreatePlaylist" type="button">Buat</button>
        </div>
        <div style="height:8px"></div>
        <div class="small">Tip: pilih audio dari Koleksi/Semua item dengan tombol tambah ke playlist.</div>
      </section>

      <section class="grid-2" style="align-items:start">
        <div class="card" style="padding:14px">
          <h2 style="font-size:16px;margin:0 0 10px">Daftar playlist</h2>
          ${playlists.length ? playlists.map((p) => playlistItemMarkup(p)).join('') : `<div class="small">Belum ada playlist. Buat untuk mulai.</div>`}
        </div>

        <div class="card" style="padding:14px">
          <h2 style="font-size:16px;margin:0 0 10px">Kontrol playlist</h2>
          <div class="small">Pilih playlist di kolom kiri.</div>
          <div style="height:12px"></div>
          <div id="playlistDetail">
            ${state.selectedPlaylistId
              ? (() => {
                  const pl = playlists.find((p) => p.id === state.selectedPlaylistId);
                  return pl
                    ? playlistDetailMarkup(pl)
                    : playlists[0]
                      ? playlistDetailMarkup(playlists[0])
                      : `<div class="small">Tidak ada playlist.</div>`;
                })()
              : playlists[0]
                ? playlistDetailMarkup(playlists[0])
                : `<div class="small">Tidak ada playlist.</div>`}
          </div>
        </div>
      </section>

      <div style="height:14px"></div>

      <section class="card" style="padding:14px">
        <h2 style="font-size:16px;margin:0 0 10px">Tambah audio ke playlist</h2>
        <div class="small">Pilih playlist di kolom kiri, lalu cari dan tambah audio.</div>
        <div style="height:10px"></div>
        <input id="searchAddToPlaylist" placeholder="Cari audio..." class="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-neutral-200 outline-none placeholder:text-neutral-500 focus:border-[#1db954]/40 focus:ring-4 focus:ring-[#1db954]/10" />
        <div style="height:12px"></div>
        <div id="audioListForPlaylist" style="max-height:300px;overflow-y:auto">
          ${library.map((t) => `
            <div class="track-row" data-track-id="${t.id}" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)">
              <div style="min-width:0;flex:1">
                <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.title)}</div>
                <div class="small" style="font-size:11px">${formatDuration(t.durationSeconds)}</div>
              </div>
              <button class="btn" type="button" data-quick-add="${t.id}">${favSet.has(t.id) ? iconStarFilled(13) : ''}<span>Tambah</span></button>
            </div>
          `).join('')}
        </div>
      </section>
    `);

    const createBtn = document.getElementById('btnCreatePlaylist');
    createBtn?.addEventListener('click', () => {
      const name = ((document.getElementById('newPlaylistName') as HTMLInputElement | null)?.value || '').trim();
      if (!name) return;
      // app.ts mendengarkan CustomEvent ini untuk membuat playlist.
      window.dispatchEvent(new CustomEvent('playlist:create', { detail: { name } }));
      router.navigate('playlists');
    });

    // quick add: pertahankan seleksi playlist bila masih ada
    const currentId = state.selectedPlaylistId;
    const first = playlists[0] || null;
    state.selectedPlaylistId =
      currentId && playlists.some((p) => p.id === currentId) ? currentId : first?.id || null;

    document.querySelectorAll('[data-playlist-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedPlaylistId = btn.getAttribute('data-playlist-id');
        rerenderDetail();
      });
    });

    document.querySelectorAll('[data-quick-add]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = state.selectedPlaylistId;
        if (!pid) {
          alert('Pilih playlist terlebih dahulu di kolom kiri.');
          return;
        }
        const trackId = b.getAttribute('data-quick-add');
        window.dispatchEvent(new CustomEvent('playlist:add', { detail: { pid, trackIds: [trackId] } }));
        router.navigate('playlists');
      });
    });

    // filter pencarian audio untuk ditambahkan ke playlist
    const searchInput = document.getElementById('searchAddToPlaylist');
    let addSearchTimeout: number | undefined;
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(addSearchTimeout);
      addSearchTimeout = window.setTimeout(() => {
        const query = ((e.target as HTMLInputElement).value || '').toLowerCase();
        const listDiv = document.getElementById('audioListForPlaylist');
        if (!listDiv) return;
        listDiv.querySelectorAll('[data-quick-add]').forEach((row) => {
          const rowEl = row.closest('div[style*="border-bottom"]') as HTMLElement | null;
          if (!rowEl) return;
          const text = rowEl.textContent || '';
          rowEl.style.display = text.toLowerCase().includes(query) ? '' : 'none';
        });
      }, 300);
    });

    attachLibraryRowHandlers(host);
    bindPlaylistDetailHandlers();

    function rerenderDetail(): void {
      const pls = getPlaylists();
      const pl = pls.find((x) => x.id === state.selectedPlaylistId);
      const detail = document.getElementById('playlistDetail');
      if (!detail) return;
      detail.innerHTML = pl ? playlistDetailMarkup(pl) : `<div class="small">Pilih playlist.</div>`;
      bindPlaylistDetailHandlers();
    }

    function bindPlaylistDetailHandlers(): void {
      const detail = document.getElementById('playlistDetail');
      if (!detail) return;

      // Putar seluruh playlist
      detail.querySelectorAll('[data-play-playlist]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const pid = btn.getAttribute('data-play-playlist');
          if (!pid) return;
          state.activeContext = { type: 'playlist', playlistId: pid };
          const pl = getPlaylists().find((p) => p.id === pid);
          const firstTrackId = pl?.items?.[0]?.trackId;
          if (!firstTrackId) return;
          router.navigate('playlists');
          router.onPlay(firstTrackId);
        });
      });

      // Putar lagu individu
      detail.querySelectorAll('[data-play-track]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const trackId = btn.getAttribute('data-play-track');
          if (!trackId) return;
          router.onPlay(trackId);
        });
      });

      // Reorder (naik/turun)
      detail.querySelectorAll('[data-move]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const pid = state.selectedPlaylistId;
          const dir = btn.getAttribute('data-move');
          const idx = Number(btn.getAttribute('data-index'));
          if (!pid || !Number.isFinite(idx)) return;
          const toIndex = dir === 'up' ? idx - 1 : idx + 1;
          window.dispatchEvent(new CustomEvent('playlist:reorder', { detail: { pid, fromIndex: idx, toIndex } }));
          router.navigate('playlists');
        });
      });

      // Hapus lagu dari playlist
      detail.querySelectorAll('[data-remove]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const pid = state.selectedPlaylistId;
          const trackId = btn.getAttribute('data-remove');
          if (!pid || !trackId) return;
          window.dispatchEvent(new CustomEvent('playlist:remove', { detail: { pid, trackId } }));
          router.navigate('playlists');
        });
      });

      // Klik seluruh baris untuk memutar
      detail.querySelectorAll('.track-row').forEach((row) => {
        row.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          const trackId = row.getAttribute('data-track-id');
          if (trackId) router.onPlay(trackId);
        });
      });
    }
  });

  /** Baris ringkas satu playlist di kolom kiri (kolom "Daftar playlist"). */
  function playlistItemMarkup(p: Playlist): string {
    const active = state.selectedPlaylistId === p.id;
    return `
      <button class="btn" style="width:100%;margin-bottom:10px;text-align:left;${active ? 'border-color:rgba(29,185,84,.6);background:rgba(29,185,84,.12);' : ''}" type="button" data-playlist-id="${p.id}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div style="font-weight:900">${escapeHtml(p.name)}</div>
          <div class="small">${p.items?.length || 0}</div>
        </div>
      </button>
    `;
  }

  /** Detail playlist: judul, tombol hapus/putar, daftar lagu dengan reorder. */
  function playlistDetailMarkup(p: Playlist): string {
    const items = p.items || [];
    return `
      <div>
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center; margin-bottom:10px">
          <div>
            <div style="font-weight:900">${escapeHtml(p.name)}</div>
            <div class="small">${items.length} lagu</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-danger" type="button" data-delete-playlist="${p.id}">Hapus</button>
            <button class="btn btn-primary" type="button" data-play-playlist="${p.id}">Putar</button>
          </div>
        </div>

        <div style="max-height:280px;overflow-y:auto">
          ${items.length ? items.map((it, idx) => {
            const t = library.find((x) => x.id === it.trackId);
            if (!t) {
              return `<div class="small" style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)">Audio tidak ditemukan: ${escapeHtml(it.trackId)}</div>`;
            }
            return `
              <div class="track-row" data-track-id="${t.id}" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer">
                <div style="min-width:0;flex:1">
                  <div class="marquee-wrap"><div class="marquee-inner" style="font-weight:900;white-space:nowrap">${escapeHtml(t.title)}</div></div>
                  <div class="small">${formatDuration(t.durationSeconds)}</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  <button class="btn" type="button" data-move="up" data-index="${idx}" aria-label="Naikkan">${iconChevronUp(14)}</button>
                  <button class="btn" type="button" data-move="down" data-index="${idx}" aria-label="Turunkan">${iconChevronDown(14)}</button>
                  <button class="btn btn-danger" type="button" data-remove="${t.id}">Hapus</button>
                  <button class="btn btn-primary" type="button" data-play-track="${t.id}">Putar</button>
                </div>
              </div>
            `;
          }).join('') : `<div class="small">Playlist kosong.</div>`}
        </div>
      </div>
    `;
  }
}