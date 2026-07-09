import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { setLanguage } from '../i18n';
import { Field, ErrorNote, friendlyError } from '../components/ui';

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { profile, refresh } = useApp();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [lang, setLang] = useState(i18n.language);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || !/^[0-9+ -]{10,15}$/.test(phone.trim())) {
      setErr(t('common.required'));
      return;
    }
    setBusy(true); setErr(null); setSaved(false);
    const { error } = await supabase.from('profiles').update({
      full_name: name.trim(),
      nickname: nickname.trim() || null,
      phone: phone.trim(),
      language: lang,
    }).eq('id', profile!.id);
    setBusy(false);
    if (error) return setErr(friendlyError(error));
    setLanguage(lang);
    setSaved(true);
    await refresh();
  };

  const initial = (nickname || name || profile?.email || '?')[0]?.toUpperCase();

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Link to="/more" className="text-brand-700 text-lg">←</Link>
        <h1 className="text-xl font-bold">👤 {t('profile.title')}</h1>
      </div>

      <div className="card flex items-center gap-3 mb-4">
        <div className="w-14 h-14 rounded-full bg-brand-700 text-white flex items-center justify-center text-2xl font-bold shrink-0">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="font-bold truncate">{nickname || name || '—'}</div>
          <div className="text-xs text-stone-500 truncate">{profile?.email}</div>
        </div>
      </div>

      <ErrorNote msg={err} />
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 mb-3 text-sm">
          ✓ {t('common.saved')}
        </div>
      )}

      <div className="card">
        <Field label={t('common.name')}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('profile.nickname')} hint={t('profile.nicknameHint')}>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)}
            placeholder={t('profile.nicknamePlaceholder')} maxLength={40} />
        </Field>
        <Field label={t('common.phone')} hint={t('auth.phoneHelp')}>
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            type="tel" inputMode="tel" placeholder="9876543210" />
        </Field>
        <Field label={t('common.language')}>
          <div className="flex gap-2">
            {[{ code: 'en', label: 'English' }, { code: 'ml', label: 'മലയാളം' }].map((l) => (
              <button key={l.code} type="button" onClick={() => setLang(l.code)}
                className={`btn flex-1 ${lang === l.code ? 'bg-brand-700 text-white' : 'bg-surface border border-stone-300'}`}>
                {l.label}
              </button>
            ))}
          </div>
        </Field>
        <button className="btn-primary w-full mt-2" disabled={busy} onClick={save}>
          {t('common.save')}
        </button>
      </div>

      <div className="text-center mt-4">
        <button className="btn-secondary" onClick={() => supabase.auth.signOut()}>{t('common.signOut')}</button>
      </div>
    </div>
  );
}
