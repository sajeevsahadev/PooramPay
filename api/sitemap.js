import { rpc, SITE } from './_supabase.js';

export default async function handler(req, res) {
  let rows = [];
  try { rows = await rpc('public_directory', {}); } catch { rows = []; }
  const urls = [
    `${SITE}/`, `${SITE}/directory`,
    ...(rows || []).map((r) => `${SITE}/c/${r.slug}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
