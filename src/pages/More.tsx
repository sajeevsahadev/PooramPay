import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { setLanguage } from '../i18n';

export default function More() {
  const { t, i18n } = useTranslation();
  const { profile, can, isCommitteeAdmin, isPadmin } = useApp();

  const links = [
    { to: '/transactions', icon: '📒', tile: 'tile-cyan', label: t('nav.transactions'), show: can('view_money') },
    { to: '/reports', icon: '📊', tile: 'tile-fuchsia', label: t('nav.reports'), show: true },
    { to: '/coupons', icon: '🎟️', tile: 'tile-violet', label: t('nav.coupons'), show: can('coupons') },
    { to: '/members', icon: '👥', tile: 'tile-lime', label: t('nav.members'), show: true },
    { to: '/areas', icon: '🗺️', tile: 'tile-amber', label: t('nav.areas'), show: true },
    { to: '/budget', icon: '🎯', tile: 'tile-rose', label: t('nav.budget'), show: isCommitteeAdmin },
    { to: '/setup', icon: '⚙️', tile: 'tile-cyan', label: t('nav.setup'), show: true },
    { to: '/audit', icon: '📜', tile: 'tile-violet', label: t('nav.auditLog'), show: true },
    { to: '/deleted', icon: '🗑️', tile: 'tile-rose', label: t('nav.deletedTx'), show: can('view_money') },
    { to: '/admin', icon: '🛡️', tile: 'tile-amber', label: t('nav.admin'), show: isPadmin },
  ].filter((x) => x.show);

  const changeLang = async (lang: string) => {
    setLanguage(lang);
    if (profile) await supabase.from('profiles').update({ language: lang }).eq('id', profile.id);
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="card mb-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-brand-700 text-white flex items-center justify-center text-xl font-bold shrink-0">
          {(profile?.full_name ?? '?')[0]}
        </div>
        <div className="min-w-0">
          <div className="font-bold truncate">{profile?.full_name}</div>
          <div className="text-xs text-stone-500 truncate">{profile?.email} · {profile?.phone}</div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden mb-4">
        {links.map((l) => (
          <Link key={l.to} to={l.to}
            className="flex items-center gap-3 px-4 py-2.5 border-b border-stone-100 last:border-0 hover:bg-brand-50">
            <span className={`tile ${l.tile} w-9 h-9 text-lg`}>{l.icon}</span>
            <span className="flex-1 font-medium">{l.label}</span>
            <span className="text-stone-300">›</span>
          </Link>
        ))}
      </div>

      <div className="card mb-4">
        <div className="text-sm font-semibold text-stone-600 mb-2">{t('common.language')}</div>
        <div className="flex gap-2">
          {[{ code: 'en', label: 'English' }, { code: 'ml', label: 'മലയാളം' }].map((l) => (
            <button key={l.code} onClick={() => changeLang(l.code)}
              className={`btn flex-1 ${i18n.language === l.code ? 'bg-brand-700 text-white' : 'bg-surface border border-stone-300'}`}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <button className="btn-secondary w-full" onClick={() => supabase.auth.signOut()}>
        {t('common.signOut')}
      </button>

      <div className="text-center mt-4">
        <Link to="/privacy" className="text-xs text-stone-500 underline">{t('privacy.title')}</Link>
      </div>
    </div>
  );
}
