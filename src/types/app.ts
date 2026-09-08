import type { LastPlayed } from './track';

/** Nama route/halaman aplikasi. */
export type Route = 'home' | 'search' | 'collection' | 'favorites' | 'playlists' | 'settings';

/** Konteks daftar yang sedang aktif (untuk queue pemutaran). */
export interface ActiveContext {
  type: 'library' | 'playlist';
  playlistId: string | null;
}

/** State global aplikasi (mirror js/app.js `state`). */
export interface AppState {
  route: Route;
  selectedPlaylistId: string | null;
  query: string;
  activeContext: ActiveContext;
  lastPlayed: LastPlayed | null;
}

/** Parameter navigasi (sesuai ui.js render(params)). */
export interface NavigateParams {
  playlistId?: string;
  query?: string;
}

/** Router yang di-ekspos ke modul UI. */
export interface Router {
  onPlay(trackId: string): void | Promise<void>;
  onToggleFavorite(trackId: string): void;
  navigate(route: Route, params?: NavigateParams): void;
}

/** Elemen DOM minimal untuk wiring Player. */
export interface PlayerDomElements {
  btnPlayPause: HTMLElement;
  btnPrev: HTMLElement;
  btnNext: HTMLElement;
  btnShuffle: HTMLElement;
  btnRepeat: HTMLElement;
  progressRange: HTMLInputElement;
  currentTime: HTMLElement;
  durationTime: HTMLElement;
  progressFill: HTMLElement;
  volumeRange: HTMLInputElement;
  volumeValue: HTMLElement;
  playerTitle: HTMLElement;
  playerSubtitle: HTMLElement;
}

/** Elemen DOM global yang dipakai seluruh modul UI. */
export interface AppElements extends PlayerDomElements {
  page: HTMLElement;
  /** Root section player (#player) — memegang class `is-expanded` di mobile. */
  player: HTMLElement;
  playerCover: HTMLElement;
  /** Modal full-screen player (mobile): album art besar. */
  playerModalCover: HTMLElement;
  /** Modal full-screen player (mobile): judul besar. */
  playerModalTitle: HTMLElement;
  /** Modal full-screen player (mobile): subjudul (konteks / file key). */
  playerModalSubtitle: HTMLElement;
  /** Area cover+judul di mini bar — tap untuk membuka modal (mobile). */
  playerExpand: HTMLElement;
  /** Tombol chevron-down penutup modal full-screen. */
  playerCollapse: HTMLElement;
  /** Tombol favorit lagu aktif di modal full-screen. */
  playerFavorite: HTMLElement;
  /** Canvas Audio Spectrum / VU Level Meter (strip bawah player, dekat Repeat/Shuffle). */
  playerVisualizer: HTMLCanvasElement;
  filePicker: HTMLInputElement;
  addAudioBtn: HTMLElement;
  addAudioBtnMobile: HTMLElement;
  addAudioBtnMenu: HTMLElement;
  hamburger: HTMLElement;
  hamburgerOverlay: HTMLElement;
  menuClose: HTMLElement;
  audio: HTMLAudioElement;
}
