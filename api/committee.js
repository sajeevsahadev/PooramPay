import { rpc, SITE } from './_supabase.js';
import { renderShell, esc, fmtINR, initials } from './_render.js';
import { dict } from './_i18n.js';

function notFound(lang) {
  return renderShell({
    lang, title: 'Not found — PooramPay', description: 'This page is not available.',
    body: `<div class="wrap"><div class="cta" style="margin-top:40px"><div class="h1">404</div>
      <p>${lang === 'ml' ? 'ഈ പേജ് ലഭ്യമല്ല.' : 'This committee page is not available.'}</p>
      <a class="btn" href="${SITE}">PooramPay</a></div></div>`,
  });
}

/** Pure renderer — unit-testable with mock data. Returns full HTML or null. */
export function buildCommitteeHtml(data, slug, lang = 'en') {
  const t = dict[lang];
  if (!data || !data.org) return null;
  const o = data.org;
  const typeLabel = t.orgType[o.org_type] || t.orgType.other;
  const place = [o.place, o.district, o.state].filter(Boolean).join(', ');
  const canonical = `${SITE}/c/${slug}`;
  const image = o.cover_url || o.logo_url || `${SITE}/icon-512.png?v=2`;
  const latest = data.programs && data.programs[0];
  const groupPhoto = (data.programs || []).map((p) => p.group_photo_url).find(Boolean);

  const team = (data.committee || []).map((m) => `
    <div class="person">
      ${m.avatar_url
        ? `<img class="ava" src="${esc(m.avatar_url)}" alt="${esc(m.name)}" loading="lazy">`
        : `<div class="ava">${esc(initials(m.name))}</div>`}
      <div class="pname">${esc(m.name)}</div>
      ${m.position ? `<div class="ppos">${esc(m.position)}</div>` : ''}
    </div>`).join('');

  const accounts = (data.programs || []).map((p) => {
    const s = p.snapshot || {};
    const sigs = (p.signoffs || []).filter((x) => x.name)
      .map((x) => `<span class="chip">✍ ${esc(x.name)}</span>`).join('');
    const pubDate = p.published_at ? new Date(p.published_at).toLocaleDateString(lang === 'ml' ? 'ml-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap">
        <h2>${esc(p.name)} ${esc(p.year)}</h2>
        ${pubDate ? `<span class="muted" style="font-size:12px">${t.published}: ${esc(pubDate)}</span>` : ''}
      </div>
      ${p.group_photo_url ? `<img class="grp" src="${esc(p.group_photo_url)}" alt="${esc(t.conductedBy)}" loading="lazy" style="margin-top:12px">` : ''}
      <div class="acct">
        <div class="stat hero"><div class="l">${t.balance}</div><div class="v">${fmtINR(s.retained)}</div></div>
        <div class="stat"><div class="l">${t.income}</div><div class="v" style="color:var(--good)">${fmtINR(s.income_total)}</div></div>
        <div class="stat"><div class="l">${t.expense}</div><div class="v" style="color:#b91c1c">${fmtINR(s.expense_total)}</div></div>
        <div class="stat"><div class="l">${t.opening}</div><div class="v">${fmtINR(s.opening_balance)}</div></div>
        <div class="stat"><div class="l">${t.published}</div><div class="v" style="font-size:14px">${esc(pubDate || '—')}</div></div>
      </div>
      ${sigs ? `<div class="muted" style="font-size:12px;margin-top:14px">${t.signedBy}</div><div class="sig">${sigs}</div>` : ''}
    </div>`;
  }).join('');

  const other = lang === 'ml' ? 'en' : 'ml';
  const langSwitch = `<div class="top"><span class="lang">
    <a class="${lang === 'en' ? 'on' : ''}" href="${canonical}">EN</a>
    <a class="${lang === 'ml' ? 'on' : ''}" href="${canonical}?hl=ml">മല</a></span></div>`;

  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Organization',
    name: o.name, url: canonical, ...(o.logo_url ? { logo: o.logo_url } : {}),
    ...(place ? { location: { '@type': 'Place', name: place } } : {}),
  };

  const body = `<div class="wrap">
    ${langSwitch}
    <div class="cover" style="${o.cover_url ? `background-image:url('${esc(o.cover_url)}')` : ''}"></div>
    <div class="head">
      ${o.logo_url ? `<img class="logo" src="${esc(o.logo_url)}" alt="${esc(o.name)}">` : `<div class="logo ph">${esc(initials(o.name))}</div>`}
      <div style="padding-bottom:6px">
        <span class="badge">✓ ${t.verified}</span>
        <div class="h1" style="font-size:26px;margin-top:6px">${esc(o.name)}</div>
        <div class="muted" style="font-size:14px">${esc(typeLabel)}${place ? ' · ' + esc(place) : ''}</div>
      </div>
    </div>

    ${team ? `<div class="card"><p class="kick">${t.conductedBy} · ${t.committee}</p>
      ${groupPhoto ? `<img class="grp" src="${esc(groupPhoto)}" alt="${esc(t.conductedBy)}">` : ''}
      <div class="team">${team}</div></div>` : ''}

    <p class="kick" style="margin:26px 0 0">${t.publishedAccounts}</p>
    ${accounts}
    <p class="muted" style="font-size:12.5px;margin-top:14px">🔒 ${t.transparencyNote}</p>

    <div class="cta">
      <div class="h1">${t.runYours}</div>
      <p>${t.runYoursSub}</p>
      <a class="btn" href="${SITE}">${t.getStarted}</a>
    </div>
    <div class="foot"><a href="${SITE}/directory">${t.findMore}</a> · <a href="${SITE}">PooramPay</a> — ${esc(t.tagline)}</div>
  </div>`;

  return renderShell({
    lang,
    title: `${o.name} — ${t.publishedAccounts} | PooramPay`,
    description: latest
      ? `${o.name}${place ? ', ' + place : ''}: ${t.publishedAccounts} — ${t.balance} ${fmtINR((latest.snapshot || {}).retained)}. ${t.tagline}.`
      : `${o.name} — ${t.tagline}.`,
    canonical, image, jsonld,
    altUrls: { en: canonical, ml: `${canonical}?hl=ml` },
    body,
  });
}

export default async function handler(req, res) {
  const slug = String(req.query.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const lang = req.query.hl === 'ml' ? 'ml' : 'en';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  let data = null;
  try { data = await rpc('public_committee_page', { p_slug: slug }); } catch { data = null; }
  const html = buildCommitteeHtml(data, slug, lang);
  if (!html) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    res.status(404).send(notFound(lang));
    return;
  }
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
  res.status(200).send(html);
}
