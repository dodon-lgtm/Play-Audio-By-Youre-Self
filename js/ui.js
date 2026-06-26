import { getFavorites, getLibrary, getPlaylists } from './storage.js';
import { filterLibrary } from './search.js';
import { getCover, saveCover, deleteCover } from './db.js';

const DEFAULT_COVER = './assets/covers/default.png';


export function makeUI({ els, state, router }) {
  const pageEl = els.page;

  function navActive(route) {
    document.querySelectorAll('[data-route]').forEach((el) => {
      const r = el.getAttribute('data-route');
      el.classList.toggle('is-active', r === route);
    });
  }

  async function setPlayerMeta({ track, contextName }) {
    els.playerTitle.textContent = track?.title || 'Belum ada audio';
    els.playerSubtitle.textContent = contextName || (track?.playlistName || '');

    // Load cover from IndexedDB
    let coverUrl = null;
    if (track?.id) {
      coverUrl = await loadCoverForTrack(track.id);
    }

    // cover binding
    if (coverUrl) {
      els.playerCover.style.backgroundImage = `url('${coverUrl}')`;
      els.playerCover.style.backgroundSize = 'cover';
      els.playerCover.style.backgroundPosition = 'center';
      els.playerCover.style.borderColor = 'rgba(29,185,84,.25)';
    } else {
      els.playerCover.style.backgroundImage = '';
      els.playerCover.style.background = "linear-gradient(135deg, rgba(29,185,84,.22), rgba(255,255,255,.05))";
      els.playerCover.style.borderColor = 'rgba(255,255,255,.12)';
    }

    els.playerCover.textContent = '';
  }

  function pageTemplate(contentHtml) {
    return `<div class="page-inner">${contentHtml}</div>`;
  }

  function animTo(fn) {
    pageEl.classList.remove('page-animate');
    // force reflow
    void pageEl.offsetWidth;
    fn();
    pageEl.classList.add('page-animate');
  }

  function renderHome() {
    const library = getLibrary();
    const favorites = new Set(getFavorites());
    const lastPlayed = state.lastPlayed?.trackId ? library.find((t) => t.id === state.lastPlayed.trackId) : null;

    const recent = [...library].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, 8);
    const favTracks = [...library].filter((t) => favorites.has(t.id)).slice(0, 8);

    const total = library.length;

    animTo(() => {
      pageEl.innerHTML = pageTemplate(`
        <div class="page-hero">
          <h2>Home</h2>
          <div class="small">Tema gelap modern, fokus ke audio lokal offline.</div>
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
            ${lastPlayed ? trackRowCard(lastPlayed, { showAddedAt: false }) : `<div class="small">Belum ada riwayat.</div>`}
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

      attachLibraryRowHandlers();
    });
  }

  function recentPlaylistMarkup() {
    const pls = getPlaylists().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 4);
    if (!pls.length) return `<div class="small">Belum ada playlist.</div>`;
    return `<div>${pls.map((p) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)"><div style="font-weight:700">${escapeHtml(p.name)}</div><div class="small">${p.items?.length || 0} lagu</div></div>`).join('')}</div>`;
  }

  async function renderCollection() {
    const library = getLibrary().slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

    // Load covers in parallel
    const coverUrls = new Map();
    await Promise.all(library.map(async (t) => {
      const url = await loadCoverForTrack(t.id);
      if (url) coverUrls.set(t.id, url);
    }));

    animTo(() => {
      pageEl.innerHTML = pageTemplate(`
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
      attachLibraryRowHandlers();
    });
  }

  function renderSearch(query) {
    const library = getLibrary();
    const results = filterLibrary(library, query);

    animTo(() => {
      pageEl.innerHTML = pageTemplate(`
        <div class="page-hero">
          <h2>Cari</h2>
          <div class="small">Pencarian real-time berdasarkan nama file.</div>
        </div>
        <div style="height:14px"></div>
        <div class="card" style="padding:14px">
          <input class="input" id="searchInput" placeholder="Ketik nama audio..." value="${escapeAttr(query)}" />
        </div>
        <div style="height:12px"></div>
        <div class="card" style="padding:14px">
          <div class="small" style="margin-bottom:10px">${results.length} hasil</div>
          ${results.length ? results.map((t) => trackRowMini(t, { favorite: getFavorites().includes(t.id) })).join('') : `<div class="small">Tidak ada hasil.</div>`}
        </div>
      `);
      attachLibraryRowHandlers();

      const input = document.getElementById('searchInput');
      let searchTimeout;
      input?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          router.navigate('search', { query: e.target.value });
        }, 300);
      });
    });
  }

  function renderFavorites() {
    const favorites = new Set(getFavorites());
    const library = getLibrary().filter((t) => favorites.has(t.id));

    animTo(() => {
      pageEl.innerHTML = pageTemplate(`
        <div class="page-hero">
          <h2>Favorit</h2>
          <div class="small">Audio yang kamu tandai favorit.</div>
        </div>
        <div style="height:14px"></div>
        <div class="card" style="padding:14px">
          ${library.length ? library.map((t) => trackRowMini(t, { favorite: true })).join('') : `<div class="small">Belum ada favorit.</div>`}
        </div>
      `);
      attachLibraryRowHandlers();
    });
  }

  function renderPlaylists() {
    const playlists = getPlaylists().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const library = getLibrary();

    const favSet = new Set(getFavorites());

    animTo(() => {
      pageEl.innerHTML = pageTemplate(`
        <div class="page-hero">
          <h2>Playlist</h2>
          <div class="small">Buat playlist baru, tambah audio, hapus, dan ubah urutan (Up/Down).</div>
        </div>
        <div style="height:14px"></div>

        <section class="card" style="padding:14px; margin-bottom:14px">
          <div class="file-row">
            <input class="input" id="newPlaylistName" placeholder="Nama playlist" />
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
                    const pl = playlists.find(p => p.id === state.selectedPlaylistId);
                    return pl ? playlistDetailMarkup(pl) : (playlists[0] ? playlistDetailMarkup(playlists[0]) : `<div class="small">Tidak ada playlist.</div>`);
                  })()
                : (playlists[0] ? playlistDetailMarkup(playlists[0]) : `<div class="small">Tidak ada playlist.</div>`)}
            </div>
          </div>
        </section>

        <div style="height:14px"></div>

        <section class="card" style="padding:14px">
          <h2 style="font-size:16px;margin:0 0 10px">Tambah audio ke playlist</h2>
          <div class="small">Pilih playlist di kolom kiri, lalu cari dan tambah audio.</div>
          <div style="height:10px"></div>
          <input class="input" id="searchAddToPlaylist" placeholder="Cari audio..." />
          <div style="height:12px"></div>
          <div id="audioListForPlaylist" style="max-height:300px;overflow-y:auto">
            ${library.map((t) => `
              <div class="track-row" data-track-id="${t.id}" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)">
                <div style="min-width:0;flex:1">
                  <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.title)}</div>
                  <div class="small" style="font-size:11px">${formatDuration(t.durationSeconds)}</div>
                </div>
                <button class="btn" type="button" data-quick-add="${t.id}">${favSet.has(t.id) ? '⭐ ' : ''}Tambah</button>
              </div>
            `).join('')}
          </div>
        </section>
      `);

      const createBtn = document.getElementById('btnCreatePlaylist');
      createBtn?.addEventListener('click', () => {
        const name = (document.getElementById('newPlaylistName')?.value || '').trim();
        if (!name) return;
        const pl = awaitCreatePlaylist(name);
        router.navigate('playlists');
      });

      // quick add uses currently selected playlist (preserve existing selection)
      const currentId = state.selectedPlaylistId;
      const first = playlists[0] || null;
      state.selectedPlaylistId = currentId && playlists.some(p => p.id === currentId)
        ? currentId
        : (first?.id || null);
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
          addTrackToSelected(pid, [trackId]);
          router.navigate('playlists');
        });
      });

      // Search filter for adding audio to playlist
      const searchInput = document.getElementById('searchAddToPlaylist');
      let addSearchTimeout;
      searchInput?.addEventListener('input', (e) => {
        clearTimeout(addSearchTimeout);
        addSearchTimeout = setTimeout(() => {
          const query = (e.target.value || '').toLowerCase();
          const listDiv = document.getElementById('audioListForPlaylist');
          if (!listDiv) return;
          listDiv.querySelectorAll('[data-quick-add]').forEach((row) => {
            const rowEl = row.closest('div[style*="border-bottom"]');
            if (!rowEl) return;
            const text = rowEl.textContent || '';
            rowEl.style.display = text.toLowerCase().includes(query) ? '' : 'none';
          });
        }, 300);
      });

      attachLibraryRowHandlers();
      bindPlaylistDetailHandlers();

      function rerenderDetail() {
        const pls = getPlaylists();
        const pl = pls.find((x) => x.id === state.selectedPlaylistId);
        const detail = document.getElementById('playlistDetail');
        if (!detail) return;
        detail.innerHTML = pl ? playlistDetailMarkup(pl) : `<div class="small">Pilih playlist.</div>`;
        bindPlaylistDetailHandlers();
      }

      function bindPlaylistDetailHandlers() {
        const detail = document.getElementById('playlistDetail');
        if (!detail) return;

        // Play entire playlist button
        detail.querySelectorAll('[data-play-playlist]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const pid = btn.getAttribute('data-play-playlist');
            if (!pid) return;
            state.activeContext = { type: 'playlist', playlistId: pid };
            const pls = getPlaylists();
            const pl = pls.find((p) => p.id === pid);
            const firstTrackId = pl?.items?.[0]?.trackId;
            if (!firstTrackId) return;
            router.navigate('playlists');
            router.onPlay(firstTrackId);
          });
        });

        // Play individual track button
        detail.querySelectorAll('[data-play-track]').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const trackId = btn.getAttribute('data-play-track');
            if (!trackId) return;
            router.onPlay(trackId);
          });
        });

        detail.querySelectorAll('[data-move]').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const pid = state.selectedPlaylistId;
            const dir = btn.getAttribute('data-move');
            const idx = Number(btn.getAttribute('data-index'));
            if (!pid || !Number.isFinite(idx)) return;
            const toIndex = dir === 'up' ? idx - 1 : idx + 1;
            // reorder in storage handled by playlist.js in ui.js via dynamic import not used for speed.
            // We'll dispatch custom event for app.js.
            window.dispatchEvent(new CustomEvent('playlist:reorder', { detail: { pid, fromIndex: idx, toIndex } }));
            router.navigate('playlists');
          });
        });

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

        // Entire row clickable to play
        detail.querySelectorAll('.track-row').forEach((row) => {
          row.addEventListener('click', (e) => {
            // Ignore clicks on buttons inside the row
            if (e.target.closest('button')) return;
            const trackId = row.getAttribute('data-track-id');
            if (trackId) router.onPlay(trackId);
          });
        });
      }

      async function awaitCreatePlaylist(name) {
        window.dispatchEvent(new CustomEvent('playlist:create', { detail: { name } }));
      }

      function addTrackToSelected(pid, trackIds) {
        window.dispatchEvent(new CustomEvent('playlist:add', { detail: { pid, trackIds } }));
      }
    });
  }

  function attachLibraryRowHandlers() {
    // play buttons
    document.querySelectorAll('[data-play-track]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const trackId = btn.getAttribute('data-play-track');
        router.onPlay(trackId);
      });
    });

    // favorite toggle
    document.querySelectorAll('[data-toggle-fav]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const trackId = btn.getAttribute('data-toggle-fav');
        router.onToggleFavorite(trackId);
      });
    });

    // entire row clickable to play
    document.querySelectorAll('.track-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        // Ignore clicks on buttons inside the row
        if (e.target.closest('button')) return;
        const trackId = row.getAttribute('data-track-id');
        if (trackId) router.onPlay(trackId);
      });
    });

    // add to playlist from rows
    document.querySelectorAll('[data-add-to-playlist]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const trackId = btn.getAttribute('data-add-to-playlist');
        const pid = state.selectedPlaylistId || (getPlaylists()[0]?.id);
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

  function rowMarkup(t, coverUrl) {
    const coverStyle = coverUrl
      ? `background-image:url('${coverUrl}');background-size:cover;background-position:center;border:none`
      : 'background:rgba(255,255,255,.05)';
    const coverContent = coverUrl ? '' : '+';
    return `
      <tr class="track-row" data-track-id="${t.id}">
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="cover" data-add-cover="${t.id}" style="width:28px;height:28px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;${coverStyle};font-size:10px;color:rgba(255,255,255,.4)">${coverContent}</div>
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
            <button class="btn btn-primary" style="padding:4px 10px;font-size:12px" type="button" data-play-track="${t.id}">▶</button>
            <button class="btn btn-danger" style="padding:4px 8px;font-size:12px" type="button" data-delete-track="${t.id}">✕</button>
          </div>
        </td>
      </tr>
    `;
  }

  function trackRowCard(t) {
    return `
      <div class="track-row" data-track-id="${t.id}" style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 0;cursor:pointer">
        <div style="min-width:0;flex:1">
          <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.title)}</div>
          <div class="small" style="font-size:11px">${formatDuration(t.durationSeconds)}</div>
        </div>
        <button class="btn btn-primary" style="padding:4px 10px;font-size:12px" type="button" data-play-track="${t.id}">▶</button>
      </div>
    `;
  }

  function trackRowMini(t, { favorite }) {
    const fav = !!favorite;
    return `
      <div class="track-row" data-track-id="${t.id}" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer">
        <div style="min-width:0;flex:1">
          <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.title)}</div>
          <div class="small" style="font-size:11px">${formatDuration(t.durationSeconds)} • ${formatDate(t.addedAt)}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn" style="padding:4px 8px;font-size:12px" type="button" data-toggle-fav="${t.id}">${fav ? '★' : '☆'}</button>
          <button class="btn btn-primary" style="padding:4px 10px;font-size:12px" type="button" data-play-track="${t.id}">▶</button>
        </div>
      </div>
    `;
  }

  function playlistItemMarkup(p) {
    const active = state.selectedPlaylistId === p.id || (!state.selectedPlaylistId && state.selectedPlaylistId === p.id);
    return `
      <button class="btn" style="width:100%;margin-bottom:10px;text-align:left" type="button" data-playlist-id="${p.id}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div style="font-weight:900">${escapeHtml(p.name)}</div>
          <div class="small">${p.items?.length || 0}</div>
        </div>
      </button>
    `;
  }

  function playlistDetailMarkup(p) {
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
            const t = getLibrary().find((x) => x.id === it.trackId);
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
                  <button class="btn" type="button" data-move="up" data-index="${idx}">↑</button>
                  <button class="btn" type="button" data-move="down" data-index="${idx}">↓</button>
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

  function formatDate(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleDateString('id-ID', { year:'numeric', month:'short', day:'2-digit' });
  }

  function formatDuration(seconds) {
    const s = Number(seconds) || 0;
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    if (!s) return '0:00';
    return m + ':' + String(r).padStart(2, '0');
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '<')
      .replaceAll('>', '>')
      .replaceAll('"', '"')
      .replaceAll("'", '&#039;');
  }

  function blobToDataURL(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  async function loadCoverForTrack(trackId) {
    try {
      const stored = await getCover(trackId);
      if (stored?.blob) {
        return await blobToDataURL(stored.blob);
      }
    } catch {}
    return null;
  }

  function escapeAttr(s) {
    return escapeHtml(s).replaceAll('`', '&#096;');
  }

  return {
    render(route, params = {}) {
      navActive(route);
      if (route === 'home') return renderHome();
      if (route === 'collection') return renderCollection();
      if (route === 'search') return renderSearch(params.query || '');
      if (route === 'favorites') return renderFavorites();
      if (route === 'playlists') return renderPlaylists();
      // Handle async render functions
      return Promise.resolve();
    },
    setPlayerMeta
  };
}

