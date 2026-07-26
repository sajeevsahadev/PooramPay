// Google Play store listing graphics.  node scripts/gen-store.mjs
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'D:/AI/Pal';
const OUT = join(ROOT, 'promo', 'store');
mkdirSync(OUT, { recursive: true });
const FONT = 'Segoe UI, Arial, sans-serif';
const logo = await sharp(readFileSync(join(ROOT, 'public', 'icon.svg')), { density: 512 })
  .resize(300, 300).png().toBuffer();

// Feature graphic — 1024 x 500, required by Google Play
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f46e5"/><stop offset="0.6" stop-color="#3730a3"/><stop offset="1" stop-color="#2a2472"/>
    </linearGradient>
    <radialGradient id="h" cx="0.68" cy="0.28" r="0.6">
      <stop offset="0" stop-color="#ffd06b" stop-opacity="0.22"/><stop offset="1" stop-color="#ffd06b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#g)"/>
  <rect width="1024" height="500" fill="url(#h)"/>
  <text x="442" y="208" font-family="${FONT}" font-size="88" font-weight="800" fill="#ffd571">PooramPay</text>
  <text x="444" y="278" font-family="${FONT}" font-size="34" fill="#ffffff">Committee money, made simple</text>
  <text x="444" y="330" font-family="${FONT}" font-size="28" fill="#c9c3f0">Collections · Expenses · Reports</text>
  <text x="444" y="380" font-family="${FONT}" font-size="28" fill="#c9c3f0">Transparent · English + Malayalam</text>
  <text x="444" y="452" font-family="${FONT}" font-size="29" font-weight="700" fill="#ffd571">www.poorampay.com</text>
</svg>`;
await sharp(Buffer.from(svg))
  .composite([{ input: logo, left: 96, top: 100 }])
  .png().toFile(join(OUT, 'feature-graphic.png'));
console.log('wrote promo/store/feature-graphic.png (1024x500)');
