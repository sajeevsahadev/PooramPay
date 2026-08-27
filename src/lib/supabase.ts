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

/**
 * Compress an image file to a small square JPEG data URL, entirely in the
 * browser, so it can be stored directly in a text column (profiles.avatar_url).
 * Scales to fit `max`px (cover-cropped to a square) and drops quality until the
 * result is under ~roughly 90 KB.
 */
export async function compressImage(file: File, max = 320): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = max;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unsupported');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, max, max);
  bitmap.close?.();
  let quality = 0.82;
  let out = canvas.toDataURL('image/jpeg', quality);
  while (out.length > 92_000 && quality > 0.4) {
    quality -= 0.12;
    out = canvas.toDataURL('image/jpeg', quality);
  }
  return out;
}

/** Compress to a landscape JPEG Blob (keeps aspect), for cover/committee photos. */
async function compressLandscape(file: File, maxW = 1100): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unsupported');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.82);
  });
}

/** Compress and upload a public-page photo (cover / committee) to the public
 *  'logos' bucket under the org's folder; returns its public URL. */
export async function uploadPublicPhoto(orgId: string, file: File, kind: 'cover' | 'group'): Promise<string> {
  const blob = await compressLandscape(file);
  const path = `${orgId}/${kind}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('logos').upload(path, blob, { contentType: 'image/jpeg' });
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
