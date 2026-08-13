import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { friendlyError, ErrorNote } from '../components/ui';
import Tour from '../components/Tour';
import { AmbientScene } from '../components/PageDecor';
import { randSeed } from '../lib/decor';

export default function NoProgram() {
  const { t } = useTranslation();
  const { profile, refresh } = useApp();
  const nav = useNavigate();
  const [showTour, setShowTour] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seed = useMemo(() => randSeed(), []);

  const joinDemo = async () => {
    setBusy(true); setErr(null);
    try {
      await supabase.rpc('join_demo').throwOnError();
      await refresh();
      nav('/');
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-brand-50 relative overflow-hidden">
      <AmbientScene seed={seed} />
      <div className="card w-full max-w-md text-center relative">
        <img src="/icon.svg?v=2" alt="" className="w-16 h-16 mx-auto mb-4 rounded-2xl" />
        <h1 className="text-lg font-bold mb-1">{t('auth.welcome')}, {profile?.nickname || profile?.full_name || ''} 🎉</h1>
        <p className="text-sm text-stone-500 mb-5">{t('demo.getStarted')}</p>
        <ErrorNote msg={err} />

        {/* Try the demo — the fastest way to see the app populated */}
        <button onClick={joinDemo} disabled={busy}
          className="w-full rounded-2xl border-2 border-brand-200 bg-brand-50 p-4 mb-3 text-left hover:border-brand-400 transition-colors disabled:opacity-60">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎪</span>
            <div className="min-w-0">
              <div className="font-bold text-brand-800">{t('demo.try')}</div>
              <div className="text-xs text-stone-600">{t('demo.tryHint')}</div>
            </div>
          </div>
        </button>

        <Link to="/setup/new"
          className="w-full rounded-2xl border border-stone-200 bg-white p-4 mb-3 text-left hover:bg-stone-50 flex items-center gap-3">
          <span className="text-2xl">🏛️</span>
          <div className="min-w-0">
            <div className="font-semibold">{t('demo.create')}</div>
            <div className="text-xs text-stone-500">{t('demo.createHint')}</div>
          </div>
        </Link>

        <Link to="/nearby"
          className="w-full rounded-2xl border border-stone-200 bg-white p-4 mb-4 text-left hover:bg-stone-50 flex items-center gap-3">
          <span className="text-2xl">📍</span>
          <div className="min-w-0">
            <div className="font-semibold">{t('demo.nearby')}</div>
            <div className="text-xs text-stone-500">{t('demo.nearbyHint')}</div>
          </div>
        </Link>

        <button onClick={() => setShowTour(true)} className="btn-secondary w-full mb-3">
          ❓ {t('tour.title')}
        </button>
        <p className="font-mono text-[11px] text-stone-400 mb-2">{profile?.email}</p>
        <button className="text-xs text-stone-400 underline" onClick={() => supabase.auth.signOut()}>
          {t('common.signOut')}
        </button>
      </div>
      {showTour && <Tour onClose={() => setShowTour(false)} />}
    </div>
  );
}
