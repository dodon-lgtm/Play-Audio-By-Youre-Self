# TODO - Music Player PWA Offline (HTML/CSS/JS murni)

## Step 1 — Setup project structure
- [x] Buat file: index.html, manifest.json, service-worker.js
- [ ] Buat folder: css/, js/, assets/covers/, assets/icons/

## Step 2 — UI layout
- [ ] Implement layout sidebar (desktop) + bottom menu (mobile)
- [ ] Implement container halaman dinamis (Home/Search/Koleksi/Favorit/Playlist)
- [ ] Implement player bar fixed di bawah + semua kontrol UI

## Step 3 — Styling
- [x] css/style.css (tema gelap Spotify, animasi transisi)
- [x] css/sidebar.css (sidebar + bottom menu)
- [x] css/player.css (progress, buttons, volume)
- [x] css/responsive.css (mobile/desktop breakpoints)


## Step 4 — JavaScript modules
- [x] js/storage.js (LocalStorage: playlists, favorites, lastPlayed, settings)
- [x] js/player.js (Audio wrapper: play/pause/next/prev/shuffle/repeat/progress/volume)
- [x] js/playlist.js (create playlist, add/remove/reorder via Up/Down)
- [x] js/search.js (real-time filter)
- [x] js/ui.js (render semua halaman)
- [x] js/app.js (router + wiring event + integrasi semua modul)


## Step 5 — PWA (offline app shell)
- [x] Implement service worker cache assets (app shell)
- [x] Pastikan manifest terhubung di index.html


## Step 6 — Audio file management
- [ ] Support add multiple files: mp3/wav/opus via extension filter
- [ ] Durasi + metadata masuk ke library
- [ ] Favorites & playlists update dari library
- [ ] Tampilkan peringatan jika objectURL hilang setelah reload (batasan lokal file)

## Step 7 — QA
- [ ] Cek navigasi antar halaman + animasi
- [ ] Cek player controls (progress, volume, shuffle, repeat one/all)
- [ ] Cek pencarian real-time
- [ ] Cek reordering playlist (Up/Down)
- [ ] Cek install PWA di Chrome/Edge

