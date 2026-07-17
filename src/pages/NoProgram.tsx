import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import Tour from '../components/Tour';

export default function NoProgram() {
  const { t } = useTranslation();
  const { profile } = useApp();
  const [showTour, setShowTour] = useState(false);
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-brand-50">
      <div className="card w-full max-w-md text-center">
        <img src="/icon.svg" alt="" className="w-16 h-16 mx-auto mb-4 rounded-2xl" />
        <h1 className="text-lg font-bold mb-2">{t('auth.noProgram')}</h1>
        <p className="text-sm text-stone-500 mb-1">{t('auth.noProgramHelp')}</p>
        <p className="font-mono text-sm bg-stone-100 rounded p-2 mb-6">{profile?.email}</p>
        {/* guided wizard — the right entry point for someone starting from zero */}
        <Link to="/setup/new" className="btn-primary w-full mb-3">{t('setup.newOrganization')}</Link>
        <button onClick={() => setShowTour(true)} className="btn-secondary w-full mb-3">
          ❓ {t('tour.title')}
        </button>
        <button className="btn w-full text-stone-500 hover:bg-stone-50" onClick={() => supabase.auth.signOut()}>
          {t('common.signOut')}
        </button>
      </div>
      {showTour && <Tour onClose={() => setShowTour(false)} />}
    </div>
  );
}
