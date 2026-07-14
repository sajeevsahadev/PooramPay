// Rasterizes the SVG logos into the PNG sizes the Play Store / PWABuilder need.
// Run after changing any public/*.svg logo:  node scripts/gen-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pub = join('D:/AI/Pal', 'public');
const jobs = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon-maskable.svg', 'icon-maskable-192.png', 192],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
  ['icon.svg', 'apple-touch-icon.png', 180],
];
for (const [src, out, size] of jobs) {
  await sharp(readFileSync(join(pub, src)), { density: 512 })
    .resize(size, size)
    .png()
    .toFile(join(pub, out));
  console.log('wrote', out, `${size}x${size}`);
}
