// Shared HTML shell + helpers for the public pages. Mobile-first, self-contained,
// light + fast (SEO). Full document (this is served by a function, not an artifact).
import { SITE } from './_supabase.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtINR = (n) =>
  '₹' + new Intl.NumberFormat('en-IN').format(Math.round(Number(n || 0)));

export const initials = (name) =>
  (String(name || '?').trim()[0] || '?').toUpperCase();

const CSS = `
*{box-sizing:border-box}
:root{--brand:#4338ca;--brand-deep:#312e81;--gold:#b7791f;--gold-soft:#e0b153;
--ground:#faf8f4;--card:#fff;--ink:#211d30;--soft:#5b556b;--faint:#8a8398;--line:#ece5d8;
--good:#15803d}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--ground);color:var(--ink);
font-family:system-ui,-apple-system,"Segoe UI","Noto Sans Malayalam",Roboto,sans-serif;
line-height:1.55;font-size:16px}
.mal{font-family:"Noto Sans Malayalam",system-ui,sans-serif}
a{color:var(--brand);text-decoration:none}
.wrap{max-width:720px;margin:0 auto;padding:0 16px 48px}
.h1{font-family:Fraunces,Georgia,serif;font-weight:600;letter-spacing:-.01em;line-height:1.1;margin:0}
.cover{height:150px;background:linear-gradient(135deg,var(--brand),var(--brand-deep));background-size:cover;background-position:center}
.head{margin-top:-46px;display:flex;gap:14px;align-items:flex-end}
.logo{width:84px;height:84px;border-radius:20px;object-fit:cover;border:3px solid #fff;background:#fff;box-shadow:0 6px 20px -10px rgba(0,0,0,.4);flex:none}
.logo.ph{display:grid;place-items:center;font-size:34px;color:var(--brand);font-weight:800}
.badge{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--good);background:#eaf6ee;border:1px solid #cfe9d7;border-radius:999px;padding:2px 9px}
.muted{color:var(--soft)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:0 1px 2px rgba(33,29,48,.04);margin-top:16px}
.kick{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin:0 0 12px}
.team{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:14px}
.person{text-align:center}
.ava{width:58px;height:58px;border-radius:50%;object-fit:cover;margin:0 auto 6px;border:1px solid var(--line);display:grid;place-items:center;background:#eef0fa;color:var(--brand);font-weight:700;font-size:20px}
.pname{font-size:13px;font-weight:600;line-height:1.2}
.ppos{font-size:11px;color:var(--faint)}
.grp{width:100%;border-radius:12px;margin-bottom:14px;display:block}
.acct{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}
.stat{background:var(--ground);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.stat .l{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--faint)}
.stat .v{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
.stat.hero{grid-column:1/-1;background:linear-gradient(135deg,var(--brand),var(--brand-deep));border:0;color:#fff}
.stat.hero .l{color:#c9c5f5}
.sig{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.chip{font-size:12px;background:#f1ecff;color:var(--brand-deep);border:1px solid #e0d8ff;border-radius:999px;padding:3px 10px}
.cta{margin-top:26px;background:linear-gradient(135deg,var(--brand),var(--brand-deep));color:#fff;border-radius:20px;padding:24px 20px;text-align:center}
.cta .h1{color:#fff;font-size:22px}
.cta p{color:#dcd9fb;margin:8px 0 16px}
.btn{display:inline-block;background:#fff;color:var(--brand-deep);font-weight:700;border-radius:12px;padding:12px 22px}
.foot{margin-top:28px;text-align:center;color:var(--faint);font-size:13px}
.lang{display:inline-flex;gap:6px;border:1px solid var(--line);border-radius:999px;overflow:hidden;font-size:13px}
.lang a{padding:4px 12px;color:var(--soft)}
.lang a.on{background:var(--brand);color:#fff;font-weight:600}
.top{display:flex;justify-content:flex-end;padding:12px 0}
h2{font-size:19px;margin:2px 0}
`;

export function renderShell({ lang = 'en', title, description, canonical, image, jsonld, altUrls, body }) {
  const alts = altUrls
    ? Object.entries(altUrls).map(([l, u]) => `<link rel="alternate" hreflang="${l}" href="${esc(u)}">`).join('') +
      `<link rel="alternate" hreflang="x-default" href="${esc(altUrls.en || canonical)}">`
    : '';
  const og = image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : '';
  const ld = jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : '';
  return `<!doctype html><html lang="${lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
${alts}
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}${og}
<link rel="icon" href="${SITE}/favicon.svg?v=2">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Noto+Sans+Malayalam:wght@400;600;700&display=swap">
<style>${CSS}</style>${ld}
</head><body${lang === 'ml' ? ' class="mal"' : ''}>${body}</body></html>`;
}
