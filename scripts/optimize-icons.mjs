// ============================================================
// optimize-icons.mjs
// Optimasi aset ikon PWA: resize + kompres ke ukuran kecil.
// Jalankan: npm run icons
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ICONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'assets',
  'icons'
);

const TARGETS = [
  { file: 'icon-192.png', width: 192, height: 192, fit: 'cover' },
  { file: 'icon-512.png', width: 512, height: 512, fit: 'cover' },
  { file: 'logoAS.png', width: 128, fit: 'inside' }
];

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

for (const target of TARGETS) {
  const inputPath = path.join(ICONS_DIR, target.file);
  const outputPath = inputPath;

  const beforeSize = (await fs.stat(inputPath)).size;
  const meta = await sharp(inputPath).metadata();
  console.log(
    `[before] ${target.file} -> ${meta.width}x${meta.height}, ${formatBytes(beforeSize)}`
  );

  await sharp(inputPath)
    .resize(target.width, target.height ?? target.width, { fit: target.fit, withoutEnlargement: false })
    .png({ compressionLevel: 9, palette: true, quality: 100 })
    .toFile(outputPath + '.tmp');

  await fs.rename(outputPath + '.tmp', outputPath);

  const afterSize = (await fs.stat(inputPath)).size;
  const afterMeta = await sharp(inputPath).metadata();
  console.log(
    `[after ] ${target.file} -> ${afterMeta.width}x${afterMeta.height}, ${formatBytes(afterSize)}`
  );
}

// Rekap total ukuran
const files = await Promise.all(
  TARGETS.map(async (t) => ({
    file: t.file,
    size: (await fs.stat(path.join(ICONS_DIR, t.file))).size
  }))
);
const total = files.reduce((sum, f) => sum + f.size, 0);
for (const f of files) console.log(`${formatBytes(f.size)}  ${f.file}`);
console.log(`Total: ${formatBytes(total)}`);