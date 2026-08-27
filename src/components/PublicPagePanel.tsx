import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, uploadPublicPhoto } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { friendlyError } from './ui';

const SITE = 'https://www.poorampay.com';

/** Committee-admin panel: publish the club's public page + set the cover and the
 *  committee ("conducted by") photo. Shown in Reports for committee admins. */
export default function PublicPagePanel() {
  const { t } = useTranslation();
  const { currentProgram, currentProgramId, isCommitteeAdmin, refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isCommitteeAdmin || !currentProgram) return null;
  const org = currentProgram.committees?.organizations;
  const isPublic = !!currentProgram.is_public;
  const published = !!currentProgram.results_published;
  const slug = org?.slug;
  const url = slug ? `${SITE}/c/${slug}` : '';

  const toggle = async () => {
    setBusy(true); setErr(null);
    try {
      await supabase.rpc('set_public_page', { p_program: currentProgramId, p_is_public: !isPublic }).throwOnError();
      await refresh();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const pickPhoto = (kind: 'cover' | 'group') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !org) return;
    setBusy(true); setErr(null);
    try {
      const publicUrl = await uploadPublicPhoto(org.id, file, kind);
      await supabase.rpc('save_public_page_media', {
        p_program: currentProgramId,
        p_cover_url: kind === 'cover' ? publicUrl : null,
        p_group_photo_url: kind === 'group' ? publicUrl : null,
      }).throwOnError();
      await refresh();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(`${t('public.shareText')} ${url}`)}`;

  return (
    <div className="card mt-4 print:hidden">
      <div className="font-bold mb-1">🌐 {t('public.title')}</div>
      <p className="text-sm text-stone-500 mb-3">{t('public.intro')}</p>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-2 mb-3 text-sm">{err}</div>}

      <button className={`btn w-full mb-2 ${isPublic ? 'bg-surface border border-stone-300 text-stone-700' : 'btn-primary'}`}
        disabled={busy} onClick={toggle}>
        {isPublic ? `✓ ${t('public.on')} · ${t('public.toggleOff')}` : t('public.toggleOn')}
      </button>

      {isPublic && !published && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mb-2">
          ⚠️ {t('public.needPublish')}
        </p>
      )}

      {isPublic && url && (
        <>
          <div className="text-xs text-stone-500 mt-2">{t('public.url')}</div>
          <div className="flex items-center gap-2 mt-1">
            <a href={url} target="_blank" rel="noreferrer"
              className="flex-1 truncate text-brand-700 underline text-sm">{url.replace('https://', '')}</a>
            <button className="btn-secondary text-xs px-3 py-1.5" onClick={copy}>{copied ? `✓ ${t('public.copied')}` : t('public.copy')}</button>
          </div>
          <a href={shareUrl} target="_blank" rel="noreferrer"
            className="btn w-full mt-2" style={{ background: '#25D366', color: '#fff' }}>
            ↗ {t('public.share')}
          </a>
        </>
      )}

      {/* photos */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <div className="text-xs font-semibold text-stone-600 mb-1">{t('public.committeePhoto')}</div>
          {currentProgram.group_photo_url
            ? <img src={currentProgram.group_photo_url} alt="" className="w-full h-20 object-cover rounded-lg border border-stone-200 mb-1" />
            : <div className="w-full h-20 rounded-lg bg-stone-100 border border-dashed border-stone-300 grid place-items-center text-stone-400 text-xs mb-1">👥</div>}
          <label className="btn-secondary text-xs px-3 py-1.5 cursor-pointer inline-block w-full text-center">
            {currentProgram.group_photo_url ? t('public.change') : t('public.addPhoto')}
            <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={pickPhoto('group')} />
          </label>
        </div>
        <div>
          <div className="text-xs font-semibold text-stone-600 mb-1">{t('public.cover')}</div>
          {org?.cover_url
            ? <img src={org.cover_url} alt="" className="w-full h-20 object-cover rounded-lg border border-stone-200 mb-1" />
            : <div className="w-full h-20 rounded-lg bg-stone-100 border border-dashed border-stone-300 grid place-items-center text-stone-400 text-xs mb-1">🖼️</div>}
          <label className="btn-secondary text-xs px-3 py-1.5 cursor-pointer inline-block w-full text-center">
            {org?.cover_url ? t('public.change') : t('public.addPhoto')}
            <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={pickPhoto('cover')} />
          </label>
        </div>
      </div>
    </div>
  );
}
