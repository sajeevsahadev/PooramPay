import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n';

/** Tour steps: text lives in i18n under tour.s1..s10. */
const STEPS = [
  { key: 's1', icon: '🎉', tint: 'bg-brand-50' },
  { key: 's2', icon: '🏢', tint: 'bg-amber-50' },
  { key: 's3', icon: '🏛️', tint: 'bg-sky-50' },
  { key: 's4', icon: '🔐', tint: 'bg-rose-50' },
  { key: 's5', icon: '📅', tint: 'bg-green-50' },
  { key: 's6', icon: '💰', tint: 'bg-amber-50' },
  { key: 's7', icon: '🧾', tint: 'bg-indigo-50' },
  { key: 's8', icon: '🤝', tint: 'bg-sky-50' },
  { key: 's9', icon: '📊', tint: 'bg-green-50' },
  { key: 's10', icon: '🚀', tint: 'bg-brand-50' },
];

/**
 * "How this works" guided walkthrough — organization → committee → privileges →
 * program → daily operations. Openable from anywhere (login, no-program screen,
 * hamburger menu, More); bilingual with an in-tour language toggle.
 */
export default function Tour({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  // lock background scroll + Escape to close (same behaviour as Modal)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && !last) setStep((x) => x + 1);
      if (e.key === 'ArrowLeft' && step > 0) setStep((x) => x - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose, step, last]);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-[rgb(15_12_30/0.6)] backdrop-blur-sm"
      onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden
        pb-[env(safe-area-inset-bottom)] flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}>

        {/* header: title + language toggle + close */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <div className="font-bold text-sm flex-1">❓ {t('tour.title')}</div>
          <div className="flex rounded-full border border-stone-200 overflow-hidden text-xs">
            {[{ code: 'en', label: 'EN' }, { code: 'ml', label: 'മല' }].map((l) => (
              <button key={l.code} onClick={() => setLanguage(l.code)}
                className={`px-2.5 py-1 min-h-0 font-semibold ${
                  i18n.language === l.code ? 'bg-brand-700 text-white' : 'text-stone-500'}`}>
                {l.label}
              </button>
            ))}
          </div>
          <button className="text-stone-400 hover:text-stone-600 px-1 min-h-0" onClick={onClose}>✕</button>
        </div>

        {/* step content */}
        <div className="px-6 py-5 text-center overflow-y-auto">
          <div className={`w-24 h-24 mx-auto rounded-full ${s.tint} flex items-center justify-center text-5xl mb-4`}>
            {s.icon}
          </div>
          <h2 className="text-lg font-black mb-2">{t(`tour.${s.key}.title`)}</h2>
          <p className="text-sm text-stone-600 leading-relaxed mb-4">{t(`tour.${s.key}.body`)}</p>
          <div className="inline-block bg-brand-50 text-brand-800 text-xs font-semibold rounded-full px-4 py-2">
            💡 {t(`tour.${s.key}.tip`)}
          </div>
        </div>

        {/* progress + controls */}
        <div className="px-4 pb-4 pt-1">
          <div className="flex justify-center gap-1.5 mb-3">
            {STEPS.map((x, i) => (
              <button key={x.key} onClick={() => setStep(i)} aria-label={`step ${i + 1}`}
                className={`min-h-0 rounded-full transition-all ${
                  i === step ? 'w-5 h-2 bg-brand-700' : 'w-2 h-2 bg-stone-300'}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <button className="btn-secondary flex-1" onClick={() => setStep(step - 1)}>
                ‹ {t('tour.back')}
              </button>
            ) : (
              <button className="btn-secondary flex-1" onClick={onClose}>{t('tour.skip')}</button>
            )}
            <button className="btn-primary flex-[2]"
              onClick={() => (last ? onClose() : setStep(step + 1))}>
              {last ? `✓ ${t('tour.done')}` : `${t('tour.next')} ›`}
            </button>
          </div>
          <div className="text-center text-[11px] text-stone-400 mt-2">
            {t('tour.stepOf', { n: step + 1, total: STEPS.length })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
