// ============================================================
// ENTRY POINT UTAMA (Vite)
// 1. Styling Tailwind (bundle CSS)
// 2. Kontrol keyboard (Space, anti-typing-jack)
// 3. Bootstrap aplikasi (app.ts): Player, router, UI, event wiring
// 4. Registrasi Service Worker (hanya saat production build)
// ============================================================

import './index.css';
import { initKeyboardControls } from './services/keyboardControls';
import { startApp } from './app';

const APP_TAG = '[Eternal Abyss]';

// Kontrol keyboard: Space = play/pause, aman saat mengetik, blur tombol setelah diklik.
initKeyboardControls();

// Bootstrap aplikasi utama.
startApp();

// Daftarkan Service Worker hanya di mode produksi (build/preview),
// agar tidak mengganggu pengembangan (HMR / hot reload di `vite dev`).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./service-worker.js')
      .then((reg) => {
        console.info(`${APP_TAG} Service Worker terdaftar:`, reg);
      })
      .catch((err) => {
        console.error(`${APP_TAG} Service Worker gagal:`, err);
      });
  });
}