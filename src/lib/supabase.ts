import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { auth: { flowType: 'pkce' } },
);

/** Upload an organization logo to the public 'logos' bucket; returns its URL. */
export async function uploadOrgLogo(orgId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${orgId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('logos')
    .upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return supabase.storage.from('logos').getPublicUrl(path).data.publicUrl;
}

export function fmtINR(amount: number | null | undefined): string {
  return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount ?? 0);
}

export function fmtDate(d: string | Date | null | undefined, lang: string): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString(lang === 'ml' ? 'ml-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
