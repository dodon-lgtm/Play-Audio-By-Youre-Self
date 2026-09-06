import { defineConfig } from 'vite';

// Konfigurasi Vite untuk Music Player PWA 'Eternal Abyss'.
// base './' agar hasil build memakai path relatif (penting untuk PWA / offline).
export default defineConfig({
  base: './',
  server: {
    port: 5173
  },
  build: {
    target: 'es2020',
    sourcemap: false
  }
});