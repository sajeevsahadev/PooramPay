// Minimal Supabase REST helper for the public (anon) serverless pages.
// Uses the publishable anon key (RLS-protected); never the service key.
const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export const SITE = 'https://www.poorampay.com';

export async function rpc(fn, args) {
  if (!URL || !KEY) throw new Error('SUPABASE_ENV_MISSING');
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify(args || {}),
  });
  if (!r.ok) throw new Error(`rpc ${fn} -> ${r.status}`);
  return r.json();
}
