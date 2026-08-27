import { rpc, SITE } from './_supabase.js';
import { renderShell, esc, initials } from './_render.js';
import { dict } from './_i18n.js';

export default async function handler(req, res) {
  const lang = req.query.hl === 'ml' ? 'ml' : 'en';
  const district = req.query.district ? String(req.query.district) : null;
  const t = dict[lang];
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  let rows = [];
  try { rows = await rpc('public_directory', { p_district: district }); } catch { rows = []; }

  const canonical = district ? `${SITE}/directory/${encodeURIComponent(district)}` : `${SITE}/directory`;
  const cards = (rows || []).map((r) => {
    const place = [r.place, r.district, r.state].filter(Boolean).join(', ');
    return `<a class="card" href="${SITE}/c/${esc(r.slug)}${lang === 'ml' ? '?hl=ml' : ''}" style="display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit">
      ${r.logo_url ? `<img class="logo" style="width:52px;height:52px;border-width:1px;box-shadow:none" src="${esc(r.logo_url)}" alt="" loading="lazy">`
        : `<div class="logo ph" style="width:52px;height:52px;font-size:22px;border-width:1px;box-shadow:none">${esc(initials(r.name))}</div>`}
      <div style="min-width:0">
        <div style="font-weight:700">${esc(r.name)}</div>
        <div class="muted" style="font-size:13px">${esc((t.orgType[r.org_type] || t.orgType.other))}${place ? ' · ' + esc(place) : ''}</div>
      </div>
      <span style="margin-left:auto;color:var(--faint)">›</span></a>`;
  }).join('');

  const title = `${t.directoryTitle}${district ? ` ${t.inDistrict} ${district}` : ''}`;
  const body = `<div class="wrap">
    <div class="top"><span class="lang">
      <a class="${lang === 'en' ? 'on' : ''}" href="${canonical}">EN</a>
      <a class="${lang === 'ml' ? 'on' : ''}" href="${canonical}?hl=ml">മല</a></span></div>
    <div class="h1" style="font-size:26px;margin-top:8px">${esc(title)}</div>
    <p class="muted">${t.directorySub}</p>
    ${cards || `<div class="card">${t.noneYet}</div>`}
    <div class="cta"><div class="h1">${t.runYours}</div><p>${t.runYoursSub}</p>
      <a class="btn" href="${SITE}">${t.getStarted}</a></div>
    <div class="foot"><a href="${SITE}">PooramPay</a> — ${esc(t.tagline)}</div>
  </div>`;

  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
  res.status(200).send(renderShell({
    lang, title: `${title} | PooramPay`, description: t.directorySub, canonical,
    altUrls: { en: district ? `${SITE}/directory/${encodeURIComponent(district)}` : `${SITE}/directory`,
               ml: `${canonical}?hl=ml` },
    body,
  }));
}
