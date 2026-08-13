import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { setLanguage } from '../i18n';
import Tour from '../components/Tour';
import { HeroScene } from '../components/HeroDecor';
import { AmbientScene } from '../components/PageDecor';
import { randSeed } from '../lib/decor';

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
  </svg>
);

/** Public marketing / SEO landing page — storytelling, features, bilingual, CTA. */
export default function Landing() {
  const { t, i18n } = useTranslation();
  const [showTour, setShowTour] = useState(false);
  const seed = useMemo(() => randSeed(), []);

  const signIn = () =>
    supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });

  const SignInBtn = ({ className = '' }: { className?: string }) => (
    <button onClick={signIn}
      className={`btn bg-white border border-stone-300 text-stone-800 hover:bg-stone-50 shadow-sm ${className}`}>
      <GoogleIcon /> {t('landing.signIn')}
    </button>
  );

  const steps = [
    { icon: '🏛️', title: t('landing.how1Title'), body: t('landing.how1Body') },
    { icon: '💰', title: t('landing.how2Title'), body: t('landing.how2Body') },
    { icon: '🧾', title: t('landing.how3Title'), body: t('landing.how3Body') },
    { icon: '📊', title: t('landing.how4Title'), body: t('landing.how4Body') },
  ];
  const features = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'].map((k) => t(`landing.${k}`));

  return (
    <div className="min-h-screen bg-app relative overflow-hidden">
      <AmbientScene seed={seed} />
      <div className="relative">
        {/* top bar */}
        <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-stone-100">
          <div className="max-w-3xl mx-auto flex items-center gap-2 px-4 py-2.5">
            <img src="/icon.svg?v=2" alt="PooramPay" className="w-8 h-8 rounded-lg" />
            <span className="font-black text-brand-800">{t('app.name')}</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex rounded-full border border-stone-200 overflow-hidden text-xs">
                {[{ c: 'en', l: 'EN' }, { c: 'ml', l: 'മല' }].map((x) => (
                  <button key={x.c} onClick={() => setLanguage(x.c)}
                    className={`px-2.5 py-1 min-h-0 font-semibold ${i18n.language === x.c ? 'bg-brand-700 text-white' : 'text-stone-500'}`}>
                    {x.l}
                  </button>
                ))}
              </div>
              <button onClick={signIn} className="btn-primary text-sm px-3 py-1.5">{t('landing.heroCta')}</button>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 pb-16">
          {/* hero */}
          <section className="text-center pt-10 pb-8">
            <img src="/icon.svg?v=2" alt="" className="w-20 h-20 rounded-2xl shadow-sm mx-auto mb-5" />
            <h1 className="text-3xl sm:text-4xl font-black text-brand-800 leading-tight mb-3">{t('landing.heroTitle')}</h1>
            <p className="text-stone-600 max-w-xl mx-auto mb-6">{t('landing.heroSub')}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <SignInBtn className="w-full sm:w-auto px-6 py-3" />
              <button onClick={() => setShowTour(true)} className="btn-secondary w-full sm:w-auto px-6 py-3">
                ❓ {t('landing.heroTour')}
              </button>
            </div>
            <p className="text-xs text-stone-400 mt-4">{t('landing.forWho')}</p>
          </section>

          {/* story */}
          <section className="card mb-8">
            <h2 className="text-xl font-bold mb-2">{t('landing.storyTitle')}</h2>
            <p className="text-stone-600 leading-relaxed mb-3">{t('landing.storyBody')}</p>
            <p className="font-semibold text-brand-800">{t('landing.storySolve')}</p>
          </section>

          {/* how it works */}
          <section className="mb-8">
            <h2 className="section-title text-lg">{t('landing.howTitle')}</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {steps.map((s, i) => (
                <div key={i} className="card flex gap-3">
                  <div className="w-11 h-11 shrink-0 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-2xl">
                    {s.icon}
                  </div>
                  <div>
                    <div className="font-bold text-sm mb-0.5">
                      <span className="text-brand-600">{i + 1}.</span> {s.title}
                    </div>
                    <div className="text-sm text-stone-600 leading-snug">{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* trust — indigo hero card with festival motifs */}
          <section className="hero mb-8">
            <HeroScene seed={seed + 7} />
            <div className="relative">
              <h2 className="text-xl font-bold mb-2">🔒 {t('landing.trustTitle')}</h2>
              <p className="text-white/85 leading-relaxed">{t('landing.trustBody')}</p>
            </div>
          </section>

          {/* features */}
          <section className="mb-8">
            <h2 className="section-title text-lg">{t('landing.featuresTitle')}</h2>
            <div className="card grid sm:grid-cols-2 gap-x-6 gap-y-3">
              {features.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-brand-600 mt-0.5 shrink-0">✓</span>
                  <span className="text-stone-700">{f}</span>
                </div>
              ))}
            </div>
          </section>

          {/* final CTA */}
          <section className="text-center card">
            <h2 className="text-2xl font-black text-brand-800 mb-2">{t('landing.ctaTitle')}</h2>
            <p className="text-stone-600 mb-5 max-w-md mx-auto">{t('landing.ctaBody')}</p>
            <SignInBtn className="px-6 py-3" />
            <div className="mt-5 text-xs text-stone-400">
              English · മലയാളം &nbsp;·&nbsp;
              <Link to="/privacy" className="underline">{t('privacy.title')}</Link>
              &nbsp;·&nbsp; www.poorampay.com
            </div>
          </section>
        </main>
      </div>
      {showTour && <Tour onClose={() => setShowTour(false)} />}
    </div>
  );
}
