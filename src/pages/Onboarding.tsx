import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Field, ErrorNote, friendlyError } from '../components/ui';

/** First-login screen: name confirmation + mandatory mobile number. */
export default function Onboarding() {
  const { t, i18n } = useTranslation();
  const { profile, refresh } = useApp();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || !/^[0-9+ -]{10,15}$/.test(phone.trim())) {
      setErr(t('common.required'));
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim(), phone: phone.trim(), language: i18n.language })
      .eq('id', profile!.id);
    setBusy(false);
    if (error) return setErr(friendlyError(error));
    await refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-brand-50">
      <div className="card w-full max-w-md">
        <h1 className="text-xl font-bold mb-1">{t('auth.completeProfile')}</h1>
        <p className="text-sm text-stone-500 mb-4">{profile?.email}</p>
        <ErrorNote msg={err} />
        <Field label={t('common.name')}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('common.phone')} hint={t('auth.phoneHelp')}>
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            type="tel" inputMode="tel" placeholder="9876543210" />
        </Field>
        <button className="btn-primary w-full mt-2" disabled={busy} onClick={save}>
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}
