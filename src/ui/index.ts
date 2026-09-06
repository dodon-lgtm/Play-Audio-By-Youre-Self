// ============================================================
// index.ts - Pemungut (aggregator) modul UI.
// createUI() adalah pengganti makeUI() dari js/ui.js yang dipecah.
// ============================================================

import { renderHome, renderCollection, renderFavorites } from './libraryUI';
import { renderSearch } from './searchUI';
import { renderPlaylists } from './playlistUI';
import { renderSettings, bindSettingsEvents } from './settingsUI';
import { syncFavoriteButton, updatePlayerMeta } from './playerUI';
import { pageTemplate, type UIHost } from './shared';
import type { AppElements, AppState, NavigateParams, Router } from '../types/app';
import type { Track } from '../types/track';

export type { UIHost };

export interface SetPlayerMetaParams {
  track: Track | null;
  contextName: string;
  /** Status favorit lagu aktif (untuk tombol favorit di modal player). */
  isFavorite?: boolean;
}

export interface UI {
  render(route: string, params?: NavigateParams): void | Promise<void>;
  setPlayerMeta(params: SetPlayerMetaParams): Promise<void>;
}

export function createUI(els: AppElements, state: AppState, router: Router): UI {
  const pageEl = els.page;

  function navActive(route: string): void {
    document.querySelectorAll('[data-route]').forEach((el) => {
      const r = el.getAttribute('data-route');
      el.classList.toggle('is-active', r === route);
    });
  }

  function animTo(fn: () => void): void {
    pageEl.classList.remove('page-animate');
    void pageEl.offsetWidth;
    fn();
    pageEl.classList.add('page-animate');
  }

  const host: UIHost = { els, pageEl, state, router, animTo };

  return {
    async render(route: string, params: NavigateParams = {}) {
      navActive(route);
      switch (route) {
        case 'home':
          return renderHome(host);
        case 'collection':
          return renderCollection(host);
        case 'search':
          return renderSearch(host, params.query ?? state.query ?? '');
        case 'favorites':
          return renderFavorites(host);
        case 'playlists':
          return renderPlaylists(host);
        case 'settings': {
          const html = await renderSettings();
          pageEl.innerHTML = pageTemplate(html);
          bindSettingsEvents();
          return;
        }
      }
    },
    async setPlayerMeta(params: SetPlayerMetaParams) {
      await updatePlayerMeta(
        {
          titleEl: els.playerTitle,
          subtitleEl: els.playerSubtitle,
          coverEl: els.playerCover,
          modalTitleEl: els.playerModalTitle,
          modalSubtitleEl: els.playerModalSubtitle,
          modalCoverEl: els.playerModalCover
        },
        params.track,
        params.contextName
      );
      if (typeof params.isFavorite === 'boolean') {
        syncFavoriteButton(els.playerFavorite, params.isFavorite);
      }
    }
  };
}
