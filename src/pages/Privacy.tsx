import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';

const CONTACT_EMAIL = 'sajeevsahadev@gmail.com';

/** Privacy policy + data-deletion request. Required for Play Store / App Store. */
export default function Privacy() {
  const { t } = useTranslation();
  const { profile } = useApp();

  const requestDeletion = () => {
    const subject = encodeURIComponent('PooramPay — delete my account and data');
    const body = encodeURIComponent(
      `Please delete my PooramPay account and associated personal data.\n\nAccount email: ${profile?.email ?? ''}\n`,
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <div className="flex items-center gap-2 mb-4">
        <Link to="/more" className="text-brand-700">←</Link>
        <h1 className="text-xl font-bold">🔒 {t('privacy.title')}</h1>
      </div>

      <div className="card space-y-4 text-sm leading-relaxed text-stone-700">
        <p className="text-stone-500">{t('privacy.updated')}: 2026-07-09</p>

        <section>
          <h2 className="font-bold text-stone-800 mb-1">{t('privacy.collectTitle')}</h2>
          <p>{t('privacy.collectBody')}</p>
        </section>
        <section>
          <h2 className="font-bold text-stone-800 mb-1">{t('privacy.useTitle')}</h2>
          <p>{t('privacy.useBody')}</p>
        </section>
        <section>
          <h2 className="font-bold text-stone-800 mb-1">{t('privacy.locationTitle')}</h2>
          <p>{t('privacy.locationBody')}</p>
        </section>
        <section>
          <h2 className="font-bold text-stone-800 mb-1">{t('privacy.shareTitle')}</h2>
          <p>{t('privacy.shareBody')}</p>
        </section>
        <section>
          <h2 className="font-bold text-stone-800 mb-1">{t('privacy.securityTitle')}</h2>
          <p>{t('privacy.securityBody')}</p>
        </section>
        <section>
          <h2 className="font-bold text-stone-800 mb-1">{t('privacy.rightsTitle')}</h2>
          <p className="mb-3">{t('privacy.rightsBody')}</p>
          <button className="btn-danger" onClick={requestDeletion}>🗑 {t('privacy.deleteBtn')}</button>
        </section>
        <section>
          <h2 className="font-bold text-stone-800 mb-1">{t('privacy.contactTitle')}</h2>
          <p><a className="text-brand-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
        </section>
      </div>

      <div className="mt-4 text-center">
        <button className="btn-secondary" onClick={() => supabase.auth.signOut()}>{t('common.signOut')}</button>
      </div>
    </div>
  );
}
