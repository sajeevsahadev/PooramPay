// Generates all raster PWA assets from the SVG logos:
//  - PNG app icons (192/512, maskable, apple-touch) for the Play Store / PWABuilder
//  - branded store screenshots (narrow + wide) for the manifest
// Run after changing any public/*.svg logo:  npm run gen:icons
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const pub = join('D:/AI/Pal', 'public');
const svg = (name) => readFileSync(join(pub, name));

// ---------- app icons ----------
const icons = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon-maskable.svg', 'icon-maskable-192.png', 192],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
  ['icon.svg', 'apple-touch-icon.png', 180],
];
for (const [src, out, size] of icons) {
  await sharp(svg(src), { density: 512 }).resize(size, size).png().toFile(join(pub, out));
  console.log('icon ', out, `${size}x${size}`);
}

// ---------- screenshots ----------
mkdirSync(join(pub, 'screenshots'), { recursive: true });
const FONT = 'Segoe UI, Roboto, Arial, sans-serif';
const logoBuf = (px) => sharp(svg('icon.svg'), { density: 512 }).resize(px, px).png().toBuffer();

const defs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2c1157"/><stop offset="1" stop-color="#140a2b"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.3" r="0.45">
      <stop offset="0" stop-color="#ffd06b" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#ffd06b" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

const pill = (cx, y, w, text) => `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="96" rx="48"
    fill="#ffffff" fill-opacity="0.07" stroke="#ffd571" stroke-opacity="0.5" stroke-width="2"/>
  <text x="${cx}" y="${y + 62}" text-anchor="middle" font-family="${FONT}" font-size="40" fill="#f3ecff">${text}</text>`;

const check = (x, y) => `
  <circle cx="${x}" cy="${y}" r="26" fill="#ffd571"/>
  <path d="M${x - 12} ${y} l8 9 16 -18" fill="none" stroke="#2c1157" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;

// s1 — hero (narrow)
const s1 = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  ${defs}
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <rect width="1080" height="1920" fill="url(#halo)"/>
  <text x="540" y="800" text-anchor="middle" font-family="${FONT}" font-size="120" font-weight="800" fill="#ffd571">PooramPay</text>
  <text x="540" y="872" text-anchor="middle" font-family="${FONT}" font-size="46" fill="#ffffff">Festival committee collections &amp; expenses</text>
  <text x="540" y="930" text-anchor="middle" font-family="${FONT}" font-size="37" fill="#c9b6f0">Temples · Churches · Clubs · Colleges in Kerala</text>
  ${pill(540, 1120, 760, 'Collections · Coupons · Subscriptions')}
  ${pill(540, 1246, 760, 'Expenses · Approvals · Cash book')}
  ${pill(540, 1372, 760, 'Reports · Budget · Audit trail')}
  <text x="540" y="1600" text-anchor="middle" font-family="${FONT}" font-size="40" fill="#c9b6f0">Role-based access · English + Malayalam</text>
  <text x="540" y="1838" text-anchor="middle" font-family="${FONT}" font-size="44" font-weight="700" fill="#ffd571">www.poorampay.com</text>
</svg>`;

// s2 — features (narrow)
const rows = [
  'House-to-house &amp; area collections',
  'Coupon books — issue, sell, settle',
  'Expense claims, bills &amp; approvals',
  'Cash book, budget &amp; P&amp;L reports',
  'Committee roles &amp; money visibility',
  'Tamper-proof audit of every change',
];
const s2 = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  ${defs}
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <rect width="1080" height="1920" fill="url(#halo)"/>
  <text x="540" y="300" text-anchor="middle" font-family="${FONT}" font-size="64" font-weight="800" fill="#ffd571">Everything the committee needs</text>
  ${rows.map((r, i) => `${check(150, 470 + i * 170)}
    <text x="215" y="${485 + i * 170}" font-family="${FONT}" font-size="46" fill="#ffffff">${r}</text>`).join('')}
  <text x="540" y="1770" text-anchor="middle" font-family="${FONT}" font-size="40" fill="#c9b6f0">Installable app · works offline · bilingual</text>
</svg>`;

// s3 — wide hero
const s3 = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  ${defs}
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <rect width="1920" height="1080" fill="url(#halo)"/>
  <text x="760" y="430" font-family="${FONT}" font-size="132" font-weight="800" fill="#ffd571">PooramPay</text>
  <text x="762" y="520" font-family="${FONT}" font-size="50" fill="#ffffff">Festival committee collections &amp; expense management</text>
  <text x="762" y="620" font-family="${FONT}" font-size="40" fill="#c9b6f0">Collections, coupons &amp; expenses in one place</text>
  <text x="762" y="686" font-family="${FONT}" font-size="40" fill="#c9b6f0">Reports, budgets &amp; a tamper-proof audit trail</text>
  <text x="762" y="752" font-family="${FONT}" font-size="40" fill="#c9b6f0">Role-based access · English + Malayalam</text>
  <text x="762" y="880" font-family="${FONT}" font-size="46" font-weight="700" fill="#ffd571">www.poorampay.com</text>
</svg>`;

const shots = [
  ['s1.png', s1, 400, 340, 250],
  ['s2.png', s2, 0, 0, 0],
  ['s3.png', s3, 460, 210, 310],
];
for (const [out, markup, logoPx, left, top] of shots) {
  let img = sharp(Buffer.from(markup));
  if (logoPx) img = img.composite([{ input: await logoBuf(logoPx), left, top }]);
  await img.png().toFile(join(pub, 'screenshots', out));
  console.log('shot ', out);
}
