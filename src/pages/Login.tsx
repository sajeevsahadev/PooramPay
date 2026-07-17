import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { setLanguage } from '../i18n';
import Tour from '../components/Tour';

export default function Login() {
  const { t, i18n } = useTranslation();
  const [showTour, setShowTour] = useState(false);

  const signIn = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-brand-50 to-stone-100">
      <div className="card w-full max-w-sm flex flex-col items-center py-10 px-8">
        <img src="/icon.svg" alt="" className="w-20 h-20 rounded-2xl shadow-sm mb-5" />
        <h1 className="text-3xl font-black mb-2 text-brand-800">{t('app.name')}</h1>
        <p className="text-stone-500 text-center text-sm mb-8">{t('app.tagline')}</p>

        <button onClick={signIn}
          className="btn bg-white border border-stone-300 text-stone-800 hover:bg-stone-50 w-full py-3 shadow-sm">
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
          </svg>
          {t('auth.signInWithGoogle')}
        </button>

        <button onClick={() => setShowTour(true)}
          className="mt-4 text-sm font-semibold text-brand-600 hover:text-brand-800">
          ❓ {t('tour.title')}
        </button>

        <div className="mt-6 flex gap-2">
          {[
            { code: 'en', label: 'English' },
            { code: 'ml', label: 'മലയാളം' },
          ].map((l) => (
            <button key={l.code} onClick={() => setLanguage(l.code)}
              className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${
                i18n.language === l.code
                  ? 'bg-brand-700 text-white font-semibold border-brand-700'
                  : 'border-stone-300 text-stone-600 hover:bg-stone-50'}`}>
              {l.label}
            </button>
          ))}
        </div>
        <Link to="/privacy" className="mt-6 text-xs text-stone-400 underline">{t('privacy.title')}</Link>
      </div>
      {showTour && <Tour onClose={() => setShowTour(false)} />}
    </div>
  );
}
