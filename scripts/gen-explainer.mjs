// Generates a set of Malayalam "how it works" cards for sharing (WhatsApp etc.).
//   node scripts/gen-explainer.mjs   ->  promo/how-it-works-ml/*.png
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'D:/AI/Pal';
const OUT = join(ROOT, 'promo', 'how-it-works-ml');
mkdirSync(OUT, { recursive: true });
const W = 1080, H = 1350;
const ML = 'Nirmala UI, Noto Sans Malayalam, sans-serif';
const EN = 'Segoe UI, Arial, sans-serif';
const logo = (px) => sharp(readFileSync(join(ROOT, 'public', 'icon.svg')), { density: 512 })
  .resize(px, px).png().toBuffer();

const defs = `<defs>
  <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4f46e5"/><stop offset="0.6" stop-color="#3730a3"/><stop offset="1" stop-color="#2a2472"/>
  </linearGradient>
  <radialGradient id="halo" cx="0.5" cy="0.32" r="0.5">
    <stop offset="0" stop-color="#ffd06b" stop-opacity="0.28"/><stop offset="1" stop-color="#ffd06b" stop-opacity="0"/>
  </radialGradient></defs>`;

// centered multi-line text
const lines = (arr, x, y, size, fill, lh, font = ML, weight = '400', anchor = 'middle') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}">${
    arr.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lh}">${l}</tspan>`).join('')}</text>`;

const wordmark = `${lines(['പൂരം പേ'], 200, 116, 46, '#3730a3', 0, ML, '700', 'start')}
  ${lines(['www.poorampay.com'], 1020, 112, 26, '#8b83c9', 0, EN, '600', 'end')}`;

const stepDots = (active) => Array.from({ length: 4 }, (_, i) =>
  `<circle cx="${470 + i * 48}" cy="1258" r="${i === active ? 11 : 8}" fill="${i === active ? '#dda017' : '#c7c3e6'}"/>`).join('');

// ---- feature card (steps 1-4) ----
function feature({ step, icon, heading, body, note }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}
    <rect width="${W}" height="${H}" fill="#eef0fa"/>
    ${wordmark}
    <rect x="60" y="196" width="960" height="1000" rx="44" fill="#ffffff" stroke="#e6e4f5" stroke-width="2"/>
    <rect x="446" y="250" width="188" height="60" rx="30" fill="#eef0fa"/>
    ${lines([`ഘട്ടം ${step}`], 540, 291, 34, '#3730a3', 0, ML, '700')}
    <circle cx="540" cy="470" r="118" fill="#fdeecb"/>
    <text x="540" y="512" text-anchor="middle" font-size="116" fill="#3730a3">${icon}</text>
    ${lines([heading], 540, 690, 58, '#241d63', 0, ML, '800')}
    ${lines(body, 540, 770, 41, '#4b4763', 60)}
    <rect x="96" y="1028" width="888" height="98" rx="24" fill="#f4f2fd"/>
    ${lines([note], 540, 1086, 30, '#5b5486', 0, ML, '600')}
    ${stepDots(step - 1)}
    ${lines(['www.poorampay.com'], 540, 1320, 30, '#8b83c9', 0, EN, '700')}
  </svg>`;
}

// ---- hero card (cover / closing) ----
function hero({ title, titleSize = 92, sub, small, badge }) {
  const bw = badge ? Math.min(940, badge.length * 19 + 110) : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}
    <rect width="${W}" height="${H}" fill="url(#ink)"/>
    <rect width="${W}" height="${H}" fill="url(#halo)"/>
    ${lines([title], 540, 830, titleSize, '#ffd571', 0, ML, '800')}
    ${lines(sub, 540, 918, 40, '#ffffff', 58, ML, '600')}
    ${small ? lines([small], 540, 1086, 32, '#c9c3f0', 0, ML, '500') : ''}
    ${badge ? `<rect x="${540 - bw / 2}" y="1168" width="${bw}" height="74" rx="37" fill="#ffffff" fill-opacity="0.12" stroke="#ffd571" stroke-opacity="0.55" stroke-width="2"/>
      ${lines([badge], 540, 1214, 32, '#ffd571', 0, ML, '700')}` : ''}
    ${lines(['www.poorampay.com'], 540, 1310, 32, '#ffd571', 0, EN, '700')}
  </svg>`;
}

const cards = [
  { file: '1-cover.png', logoPx: 300, logoAt: [390, 400],
    svg: hero({
      title: 'പൂരം പേ',
      sub: ['കമ്മിറ്റിയുടെ പണവും കാര്യങ്ങളും', 'ഒരൊറ്റ ആപ്പിൽ'],
      small: 'ക്ഷേത്രം · പള്ളി · ക്ലബ്ബ് · കോളേജ് കമ്മിറ്റികൾക്ക്',
      badge: '👇  എങ്ങനെ പ്രവർത്തിക്കുന്നു?',
    }) },
  { file: '2-committee.png', logoPx: 96, logoAt: [70, 58],
    svg: feature({
      step: 1, icon: '👥', heading: 'കമ്മിറ്റിയും അംഗങ്ങളും',
      body: ['സംഘടന, കമ്മിറ്റി, പ്രോഗ്രാം ഉണ്ടാക്കുക.', 'അംഗങ്ങളെ ചേർത്ത് ഓരോരുത്തർക്കും', 'ചുമതലയും അധികാരവും നൽകുക.'],
      note: 'കാണാനുള്ള അധികാരം നിങ്ങൾ നിശ്ചയിക്കും',
    }) },
  { file: '3-collections.png', logoPx: 96, logoAt: [70, 58],
    svg: feature({
      step: 2, icon: '💰', heading: 'പിരിവ് എളുപ്പത്തിൽ',
      body: ['വീടുവീടാന്തരം, കൂപ്പൺ, ആഴ്ചവരി', 'പിരിവുകൾ രേഖപ്പെടുത്തുക.', 'ഓരോന്നിനും യാന്ത്രിക രസീത് നമ്പർ.'],
      note: 'പിരിച്ച പണം ട്രഷററെ ഏൽപ്പിക്കാം',
    }) },
  { file: '4-expenses.png', logoPx: 96, logoAt: [70, 58],
    svg: feature({
      step: 3, icon: '🧾', heading: 'ചെലവുകൾ അംഗീകാരത്തോടെ',
      body: ['ബില്ലിന്റെ ഫോട്ടോ സഹിതം ചെലവ്', 'സമർപ്പിക്കുക → ട്രഷററുടെ അംഗീകാരം', '→ പണം നൽകി രേഖപ്പെടുത്തുന്നു.'],
      note: 'അനുവാദമില്ലാതെ ഒരു രൂപയും പോകില്ല',
    }) },
  { file: '5-reports.png', logoPx: 96, logoAt: [70, 58],
    svg: feature({
      step: 4, icon: '📊', heading: 'സുതാര്യമായ കണക്കുകൾ',
      body: ['ക്യാഷ് ബുക്ക്, ബഡ്ജറ്റ്, ലാഭനഷ്ട', 'കണക്ക് — എപ്പോൾ വേണമെങ്കിലും', 'കാണാം, പ്രിന്റ് ചെയ്യാം.'],
      note: 'ഓരോ മാറ്റവും രേഖപ്പെടും; മായ്ക്കാനാവില്ല',
    }) },
  { file: '6-start.png', logoPx: 220, logoAt: [430, 360],
    svg: hero({
      title: 'ഇന്നു തന്നെ തുടങ്ങൂ', titleSize: 66,
      sub: ['കമ്മിറ്റിയുടെ വിശ്വാസ്യത കൂട്ടൂ,', 'പണം സുതാര്യമായി കൈകാര്യം ചെയ്യൂ.'],
      small: 'മലയാളം · English — സൗജന്യമായി തുടങ്ങാം',
      badge: '📱  ആപ്പായി ഇൻസ്റ്റാൾ ചെയ്യാം',
    }) },
];

for (const c of cards) {
  await sharp(Buffer.from(c.svg))
    .composite([{ input: await logo(c.logoPx), left: c.logoAt[0], top: c.logoAt[1] }])
    .png().toFile(join(OUT, c.file));
  console.log('card', c.file);
}
console.log('\nSaved to', OUT);
