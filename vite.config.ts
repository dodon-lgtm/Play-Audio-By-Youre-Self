import { defineConfig } from 'vite';

// Konfigurasi Vite untuk Music Player PWA 'Eternal Abyss'.
// base '/Play-Audio-By-Youre-Self/' agar asset build cocok dengan
// sub-path GitHub Pages (https://<user>.github.io/Play-Audio-By-Youre-Self/).
export default defineConfig({
  base: '/Play-Audio-By-Youre-Self/',
  server: {
    port: 5173
  },
  build: {
    target: 'es2020',
    sourcemap: false
  }
});