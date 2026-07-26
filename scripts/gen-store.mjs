// Google Play store listing graphics:
//   promo/store/feature-graphic.png   (1024x500)
//   promo/store/phone/*.png           (1080x1920, portrait 9:16)
//   promo/store/tablet/*.png          (1920x1080, landscape 16:9 — use for 7" & 10")
// Run:  node scripts/gen-store.mjs
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'D:/AI/Pal';
const OUT = join(ROOT, 'promo', 'store');
mkdirSync(join(OUT, 'phone'), { recursive: true });
mkdirSync(join(OUT, 'tablet'), { recursive: true });
const FONT = 'Segoe UI, Roboto, Arial, sans-serif';
const logo = (px) => sharp(readFileSync(join(ROOT, 'public', 'icon.svg')), { density: 512 })
  .resize(px, px).png().toBuffer();

const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2c1157"/><stop offset="1" stop-color="#140a2b"/>
  </linearGradient>
  <radialGradient id="halo" cx="0.5" cy="0.32" r="0.5">
    <stop offset="0" stop-color="#ffd06b" stop-opacity="0.2"/><stop offset="1" stop-color="#ffd06b" stop-opacity="0"/>
  </radialGradient>
</defs>`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const T = (x, y, size, fill, str, o = {}) =>
  `<text x="${x}" y="${y}" text-anchor="${o.anchor || 'start'}" font-family="${FONT}" font-size="${size}" font-weight="${o.weight || '400'}" fill="${fill}">${esc(str)}</text>`;
const check = (x, y, r) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffd571"/><path d="M${x - r * 0.42} ${y} l${r * 0.28} ${r * 0.32} l${r * 0.6} -${r * 0.66}" fill="none" stroke="#2c1157" stroke-width="${Math.max(3, r * 0.2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
const pill = (cx, y, w, h, str, size) =>
  `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#ffffff" fill-opacity="0.07" stroke="#ffd571" stroke-opacity="0.5" stroke-width="2"/>${T(cx, y + h / 2 + size * 0.35, size, '#f3ecff', str, { anchor: 'middle' })}`;
const shell = (w, h, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}<rect width="${w}" height="${h}" fill="url(#bg)"/><rect width="${w}" height="${h}" fill="url(#halo)"/>${inner}</svg>`;

const SLIDES = {
  collect: { icon: '💰', title: 'Collect every rupee', bullets: ['House-to-house collection', 'Coupon books & settlement', 'Weekly subscriptions', 'Automatic receipt numbers'] },
  expenses: { icon: '🧾', title: 'Spend with approval', bullets: ['Submit with a bill photo', 'Treasurer approves first', 'Vendor advances tracked', 'No spend without approval'] },
  reports: { icon: '📊', title: 'Transparent accounts', bullets: ['Cash book & P&L anytime', 'Budget vs actual', 'Signed, published results', 'Every change audit-logged'] },
  roles: { icon: '👥', title: 'Roles & privileges', bullets: ['President, Secretary, Treasurer', 'Add custom positions', 'You control who sees money', 'Access across all programs'] },
  cash: { icon: '🤝', title: 'Cash you can trust', bullets: ['See cash in your hand', 'Hand over in the app', 'Both sides confirm', 'Cash to bank tracked'] },
};

// ---------- feature graphic ----------
const feature = shell(1024, 500, `
  ${T(442, 208, 88, '#ffd571', 'PooramPay', { weight: '800' })}
  ${T(444, 278, 34, '#ffffff', 'Committee money, made simple')}
  ${T(444, 330, 28, '#c9c3f0', 'Collections · Expenses · Reports')}
  ${T(444, 380, 28, '#c9c3f0', 'Transparent · English + Malayalam')}
  ${T(444, 452, 29, '#ffd571', 'www.poorampay.com', { weight: '700' })}`);

// ---------- phone (portrait 1080x1920) ----------
const phoneHero = shell(1080, 1920, `
  ${T(540, 800, 116, '#ffd571', 'PooramPay', { anchor: 'middle', weight: '800' })}
  ${T(540, 872, 46, '#ffffff', 'Festival committee money', { anchor: 'middle' })}
  ${T(540, 930, 37, '#c9b6f0', 'Temples · Churches · Clubs · Colleges', { anchor: 'middle' })}
  ${pill(540, 1120, 780, 96, 'Collections · Coupons · Subscriptions', 38)}
  ${pill(540, 1246, 780, 96, 'Expenses · Approvals · Cash book', 38)}
  ${pill(540, 1372, 780, 96, 'Reports · Budget · Audit trail', 38)}
  ${T(540, 1600, 40, '#c9b6f0', 'Role-based access · English + Malayalam', { anchor: 'middle' })}
  ${T(540, 1838, 44, '#ffd571', 'www.poorampay.com', { anchor: 'middle', weight: '700' })}`);
const phoneFeature = (s) => shell(1080, 1920, `
  ${T(176, 112, 44, '#ffd571', 'PooramPay', { weight: '800' })}
  <circle cx="540" cy="470" r="142" fill="#fdeecb"/>
  ${T(540, 522, 132, '#3730a3', s.icon, { anchor: 'middle' })}
  ${T(540, 762, 72, '#ffd571', s.title, { anchor: 'middle', weight: '800' })}
  ${s.bullets.map((b, i) => check(196, 1000 + i * 152, 30) + T(258, 1016 + i * 152, 46, '#ffffff', b)).join('')}
  ${T(540, 1840, 40, '#ffd571', 'www.poorampay.com', { anchor: 'middle', weight: '700' })}`);

// ---------- tablet (landscape 1920x1080) ----------
const tabletHero = shell(1920, 1080, `
  ${T(760, 430, 120, '#ffd571', 'PooramPay', { weight: '800' })}
  ${T(762, 510, 44, '#ffffff', 'Festival committee collections & expenses')}
  ${T(762, 578, 36, '#c9c3f0', 'Transparent accounts for temples, clubs & more')}
  ${check(790, 690, 26) + T(842, 706, 40, '#ffffff', 'Collections, coupons & subscriptions')}
  ${check(790, 762, 26) + T(842, 778, 40, '#ffffff', 'Expenses, approvals & reports')}
  ${check(790, 834, 26) + T(842, 850, 40, '#ffffff', 'Roles, privileges & audit trail')}
  ${T(762, 966, 40, '#ffd571', 'www.poorampay.com', { weight: '700' })}`);
const tabletFeature = (s) => shell(1920, 1080, `
  ${T(160, 108, 44, '#ffd571', 'PooramPay', { weight: '800' })}
  <circle cx="520" cy="560" r="205" fill="#fdeecb"/>
  ${T(520, 622, 190, '#3730a3', s.icon, { anchor: 'middle' })}
  ${T(900, 415, 80, '#ffd571', s.title, { weight: '800' })}
  ${s.bullets.map((b, i) => check(936, 540 + i * 116, 30) + T(1004, 558 + i * 116, 48, '#ffffff', b)).join('')}
  ${T(900, 1000, 40, '#ffd571', 'www.poorampay.com', { weight: '700' })}`);

// ---------- render ----------
await sharp(Buffer.from(feature)).composite([{ input: await logo(300), left: 96, top: 100 }]).png().toFile(join(OUT, 'feature-graphic.png'));
console.log('feature-graphic.png');

const phone = [
  ['1-hero.png', phoneHero, 400, 340, 250],
  ['2-collect.png', phoneFeature(SLIDES.collect), 92, 60, 52],
  ['3-expenses.png', phoneFeature(SLIDES.expenses), 92, 60, 52],
  ['4-reports.png', phoneFeature(SLIDES.reports), 92, 60, 52],
  ['5-roles.png', phoneFeature(SLIDES.roles), 92, 60, 52],
  ['6-cash.png', phoneFeature(SLIDES.cash), 92, 60, 52],
];
for (const [f, svg, px, l, t] of phone) {
  await sharp(Buffer.from(svg)).composite([{ input: await logo(px), left: l, top: t }]).png().toFile(join(OUT, 'phone', f));
  console.log('phone/' + f);
}

const tablet = [
  ['1-hero.png', tabletHero, 460, 200, 300],
  ['2-collect.png', tabletFeature(SLIDES.collect), 72, 60, 56],
  ['3-reports.png', tabletFeature(SLIDES.reports), 72, 60, 56],
  ['4-roles.png', tabletFeature(SLIDES.roles), 72, 60, 56],
];
for (const [f, svg, px, l, t] of tablet) {
  await sharp(Buffer.from(svg)).composite([{ input: await logo(px), left: l, top: t }]).png().toFile(join(OUT, 'tablet', f));
  console.log('tablet/' + f);
}
console.log('\nSaved to', OUT);
