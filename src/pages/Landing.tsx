import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { setLanguage } from '../i18n';
import Tour from '../components/Tour';
import { HeroScene } from '../components/HeroDecor';
import { randSeed } from '../lib/decor';

const INDIGO = 'linear-gradient(135deg,#4f46e5 0%,#3730a3 55%,#312e81 100%)';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
  </svg>
);

/** A miniature of the real app dashboard — the product shot for the hero. */
function PhoneMock() {
  const Row = ({ l, a, up }: { l: string; a: string; up: boolean }) => (
    <div className="flex justify-between text-[8px]">
      <span className="text-stone-600 truncate mr-1">{l}</span>
      <span className={`font-bold shrink-0 ${up ? 'text-green-700' : 'text-red-700'}`}>{a}</span>
    </div>
  );
  return (
    <div className="mx-auto w-[236px] shrink-0" aria-hidden="true">
      <div className="rounded-[2.3rem] bg-stone-900 p-2 shadow-2xl ring-1 ring-black/10">
        <div className="rounded-[1.8rem] bg-[#eef0fa] overflow-hidden">
          <div className="flex items-center gap-1.5 px-2.5 py-2 bg-white">
            <img src="/icon.svg?v=2" alt="" className="w-4 h-4 rounded" />
            <span className="text-[8px] font-bold text-stone-800">Onam 2026</span>
            <span className="ml-auto text-[7px] bg-blue-100 text-blue-800 rounded-full px-1.5 py-0.5 font-semibold">Admin</span>
          </div>
          <div className="p-2 space-y-2">
            <div className="rounded-xl p-2.5 text-white" style={{ background: INDIGO }}>
              <div className="flex justify-between">
                <div><div className="text-[6px] uppercase tracking-wide text-white/70">Cash in hand</div><div className="text-[14px] font-black">₹48,250</div></div>
                <div className="text-right"><div className="text-[6px] uppercase tracking-wide text-white/70">Bank</div><div className="text-[11px] font-bold">₹1,20,000</div></div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1.5 pt-1.5 border-t border-white/15">
                <div><div className="text-[6px] uppercase tracking-wide text-white/70">Collected</div><div className="text-[9px] font-bold text-green-300">₹2,10,400</div></div>
                <div><div className="text-[6px] uppercase tracking-wide text-white/70">Spent</div><div className="text-[9px] font-bold text-rose-200">₹42,150</div></div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-2 grid grid-cols-4 gap-1.5">
              {['💰', '🎟️', '🧾', '📊'].map((e, i) => (
                <div key={i} className="w-7 h-7 mx-auto rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-[13px]">{e}</div>
              ))}
            </div>
            <div className="bg-white rounded-xl p-2 space-y-1.5">
              <Row l="Member Collection · Sanu" a="+ ₹500" up />
              <Row l="Light & sound" a="− ₹12,000" up={false} />
              <Row l="Coupon remit · B-12" a="+ ₹2,500" up />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { t, i18n } = useTranslation();
  const [showTour, setShowTour] = useState(false);
  const seed = useMemo(() => randSeed(), []);
  const signIn = () =>
    supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });

  const journey = t('landing.journey', { returnObjects: true }) as { t: string; b: string }[];
  const journeyIcons = ['😟', '🏛️', '💰', '🧾', '🤝', '📊', '🌐'];
  const features = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'].map((k) => t(`landing.${k}`));

  return (
    <div className="min-h-screen bg-app">
      {/* top bar */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-stone-100">
        <div className="max-w-5xl mx-auto flex items-center gap-2 px-4 py-2.5">
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

      {/* HERO — full-width festival gradient + product mockup */}
      <section className="relative overflow-hidden text-white" style={{ background: INDIGO }}>
        <HeroScene seed={seed} />
        <div className="relative max-w-5xl mx-auto px-4 py-12 sm:py-16 grid md:grid-cols-2 gap-10 items-center">
          <div className="text-center md:text-left">
            <div className="inline-block text-[11px] font-semibold bg-white/15 rounded-full px-3 py-1 mb-4">🎪 {t('landing.eyebrow')}</div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black leading-tight mb-4">{t('landing.heroTitle')}</h1>
            <p className="text-white/85 mb-6 max-w-md mx-auto md:mx-0">{t('landing.heroSub')}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              <button onClick={signIn} className="btn bg-white text-brand-800 hover:bg-stone-100 px-6 py-3 font-bold shadow-lg">
                <GoogleIcon /> {t('landing.signIn')}
              </button>
              <button onClick={() => setShowTour(true)} className="btn bg-white/10 border border-white/30 text-white hover:bg-white/20 px-6 py-3">
                ❓ {t('landing.heroTour')}
              </button>
            </div>
            <p className="text-white/60 text-xs mt-4">{t('landing.trust')}</p>
          </div>
          <PhoneMock />
        </div>
      </section>

      <main className="max-w-3xl mx-auto px-4 py-12 space-y-12">
        {/* story */}
        <section className="card">
          <h2 className="text-xl font-bold mb-2">{t('landing.storyTitle')}</h2>
          <p className="text-stone-600 leading-relaxed mb-3">{t('landing.storyBody')}</p>
          <p className="font-semibold text-brand-800">{t('landing.storySolve')}</p>
        </section>

        {/* storytelling journey — the whole season, feature by feature */}
        <section>
          <h2 className="text-2xl font-black text-center mb-1">{t('landing.journeyTitle')}</h2>
          <p className="text-center text-stone-500 mb-7">{t('landing.journeySub')}</p>
          <div className="relative">
            <div className="absolute left-[26px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-brand-200 via-brand-200 to-transparent" aria-hidden="true" />
            <div className="space-y-4">
              {journey.map((c, i) => (
                <div key={i} className="relative flex gap-4">
                  <div className="relative z-10 w-[54px] h-[54px] shrink-0 rounded-2xl bg-white border-2 border-brand-100 shadow-sm flex items-center justify-center text-2xl">
                    {journeyIcons[i] ?? '•'}
                  </div>
                  <div className="card flex-1">
                    <div className="text-[11px] font-bold text-brand-500 uppercase tracking-wide mb-0.5">
                      {i + 1} / {journey.length}
                    </div>
                    <div className="font-bold mb-0.5">{c.t}</div>
                    <div className="text-sm text-stone-600 leading-snug">{c.b}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-center mt-6">
            <a href="/directory" className="text-brand-700 font-semibold underline underline-offset-2">
              {t('landing.directoryCta')} ›
            </a>
          </div>
        </section>

        {/* features */}
        <section>
          <h2 className="text-2xl font-black text-center mb-6">{t('landing.featuresTitle')}</h2>
          <div className="card grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {features.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="w-5 h-5 shrink-0 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs">✓</span>
                <span className="text-stone-700 pt-0.5">{f}</span>
              </div>
            ))}
          </div>
        </section>

        {/* trust */}
        <section className="hero">
          <HeroScene seed={seed + 5} />
          <div className="relative">
            <h2 className="text-xl font-bold mb-2">🔒 {t('landing.trustTitle')}</h2>
            <p className="text-white/85 leading-relaxed">{t('landing.trustBody')}</p>
          </div>
        </section>

        {/* closing CTA band */}
        <section className="rounded-3xl p-8 text-center text-white relative overflow-hidden shadow-lg" style={{ background: INDIGO }}>
          <HeroScene seed={seed + 9} />
          <div className="relative">
            <h2 className="text-2xl sm:text-3xl font-black mb-2">{t('landing.ctaTitle')}</h2>
            <p className="text-white/85 mb-6 max-w-md mx-auto">{t('landing.ctaBody')}</p>
            <button onClick={signIn} className="btn bg-white text-brand-800 hover:bg-stone-100 px-7 py-3 font-bold shadow-lg">
              <GoogleIcon /> {t('landing.signIn')}
            </button>
            <div className="mt-5 text-xs text-white/60">
              English · മലയാളം &nbsp;·&nbsp;
              <Link to="/privacy" className="underline">{t('privacy.title')}</Link>
              &nbsp;·&nbsp; www.poorampay.com
            </div>
          </div>
        </section>
      </main>
      {showTour && <Tour onClose={() => setShowTour(false)} />}
    </div>
  );
}
