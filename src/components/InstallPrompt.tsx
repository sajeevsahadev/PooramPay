import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pp-install-dismissed';
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as unknown as { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/(crios|fxios)/i.test(navigator.userAgent);

/**
 * Custom "Install app" prompt. On Chrome/Android it captures the browser's
 * beforeinstallprompt and installs on tap. On iOS Safari (no such event) it
 * shows the Share -> Add to Home Screen instructions.
 */
export default function InstallPrompt() {
  const { t } = useTranslation();
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;                 // already installed
    const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (Date.now() - dismissed < 7 * 86400000) return;   // snoozed within a week

    const onBIP = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); setShow(true); };
    window.addEventListener('beforeinstallprompt', onBIP);

    // iOS never fires beforeinstallprompt — offer the manual instructions
    if (isIOS()) { setIos(true); setShow(true); }

    const onInstalled = () => { setShow(false); localStorage.setItem(DISMISS_KEY, String(Date.now())); };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    setShow(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };
  const dismiss = () => { setShow(false); localStorage.setItem(DISMISS_KEY, String(Date.now())); };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 md:bottom-4 z-[55] flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md card flex items-center gap-3 shadow-xl border-brand-200">
        <img src="/icon.svg?v=2" alt="" className="w-10 h-10 rounded-lg shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{t('install.title')}</div>
          <div className="text-xs text-stone-500">{ios ? t('install.iosHelp') : t('install.body')}</div>
        </div>
        <button className="btn-secondary text-xs px-3 py-1.5" onClick={dismiss}>{t('install.later')}</button>
        {!ios && (
          <button className="btn-primary text-sm px-3 py-1.5" onClick={install}>⬇️ {t('install.btn')}</button>
        )}
      </div>
    </div>
  );
}
