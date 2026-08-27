import { SITE } from './_supabase.js';

export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400');
  res.status(200).send(`User-agent: *
Allow: /
Sitemap: ${SITE}/sitemap.xml
`);
}
