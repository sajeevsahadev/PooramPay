import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Checks the server for a new app version on every load, when the app returns
 * to the foreground, and hourly while open. When a new version is ready it
 * shows a prompt asking the user to update immediately.
 */
export default function UpdatePrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (!r) return;
      // check right away, then hourly
      r.update();
      setInterval(() => r.update(), 60 * 60 * 1000);
      // check whenever the user brings the app back to the foreground
      const check = () => { if (document.visibilityState === 'visible') r.update(); };
      document.addEventListener('visibilitychange', check);
      window.addEventListener('focus', check);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 md:bottom-4 z-[60] flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md card flex items-center gap-3 shadow-xl border-brand-200">
        <span className="text-2xl">🎉</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{t('update.available')}</div>
          <div className="text-xs text-stone-500">{t('update.help')}</div>
        </div>
        <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => setNeedRefresh(false)}>
          {t('update.later')}
        </button>
        <button className="btn-primary text-sm px-3 py-1.5" onClick={() => updateServiceWorker(true)}>
          {t('update.now')}
        </button>
      </div>
    </div>
  );
}
