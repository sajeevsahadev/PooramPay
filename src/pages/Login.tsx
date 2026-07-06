import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { setLanguage } from '../i18n';

export default function Login() {
  const { t, i18n } = useTranslation();

  const signIn = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-brand-800 to-brand-600 text-white">
      <img src="/icon.svg" alt="" className="w-24 h-24 rounded-3xl shadow-lg mb-6" />
      <h1 className="text-4xl font-black mb-2">{t('app.name')}</h1>
      <p className="text-brand-100 text-center mb-10 max-w-sm">{t('app.tagline')}</p>

      <button onClick={signIn}
        className="btn bg-white text-stone-800 hover:bg-stone-100 w-full max-w-xs shadow-lg py-3">
        <svg width="20" height="20" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
        </svg>
        {t('auth.signInWithGoogle')}
      </button>

      <div className="mt-10 flex gap-2">
        {[
          { code: 'en', label: 'English' },
          { code: 'ml', label: 'മലയാളം' },
        ].map((l) => (
          <button key={l.code} onClick={() => setLanguage(l.code)}
            className={`px-4 py-1.5 rounded-full text-sm border ${
              i18n.language === l.code
                ? 'bg-white text-brand-800 font-bold border-white'
                : 'border-brand-100/50 text-brand-100'}`}>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
