import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { supabase, compressImage } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { setLanguage } from '../i18n';
import { Field, ErrorNote, friendlyError } from '../components/ui';

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { profile, refresh } = useApp();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [description, setDescription] = useState(profile?.description ?? '');
  const [dob, setDob] = useState(profile?.date_of_birth ?? '');
  const [gender, setGender] = useState<string>(profile?.gender ?? '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [avatar, setAvatar] = useState<string | null>(profile?.avatar_url ?? null);
  const [lang, setLang] = useState(i18n.language);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [detecting, setDetecting] = useState(false);

  // auto-fill country from the connection when it's not set yet
  useEffect(() => {
    if (country.trim()) return;
    let cancelled = false;
    setDetecting(true);
    fetch('https://ipwho.is/')
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.success !== false && d?.country) setCountry(d.country); })
      .catch(() => { /* best-effort */ })
      .finally(() => { if (!cancelled) setDetecting(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true); setErr(null);
    try {
      setAvatar(await compressImage(file));
    } catch {
      setErr(t('common.error'));
    }
    setPhotoBusy(false);
  };

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
      description: description.trim() || null,
      date_of_birth: dob || null,
      gender: gender || null,
      country: country.trim() || null,
      avatar_url: avatar,
      language: lang,
    }).eq('id', profile!.id);
    setBusy(false);
    if (error) return setErr(friendlyError(error));
    setLanguage(lang);
    setSaved(true);
    await refresh();
  };

  const initial = (nickname || name || profile?.email || '?')[0]?.toUpperCase();
  const genders = [
    { v: 'male', label: t('profile.genderMale') },
    { v: 'female', label: t('profile.genderFemale') },
    { v: 'other', label: t('profile.genderOther') },
    { v: '', label: t('profile.genderNA') },
  ];

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Link to="/more" className="text-brand-700 text-lg">←</Link>
        <h1 className="text-xl font-bold">👤 {t('profile.title')}</h1>
      </div>

      {/* avatar + identity */}
      <div className="card flex items-center gap-4 mb-4">
        <div className="relative shrink-0">
          {avatar ? (
            <img src={avatar} alt="" className="w-20 h-20 rounded-full object-cover border border-stone-200" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-brand-700 text-white flex items-center justify-center text-3xl font-bold">
              {initial}
            </div>
          )}
          {photoBusy && (
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center text-white text-xs">
              …
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold truncate">{nickname || name || '—'}</div>
          <div className="text-xs text-stone-500 truncate mb-2">{profile?.email}</div>
          <div className="flex gap-2">
            <label className="btn-secondary text-sm px-3 py-1.5 cursor-pointer">
              {avatar ? t('profile.changePhoto') : t('profile.addPhoto')}
              <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} disabled={photoBusy} />
            </label>
            {avatar && (
              <button type="button" className="btn-secondary text-sm px-3 py-1.5 text-red-600"
                onClick={() => setAvatar(null)}>
                {t('profile.removePhoto')}
              </button>
            )}
          </div>
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
        <Field label={t('profile.description')} hint={t('profile.descriptionHint')}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={t('profile.descriptionPlaceholder')} maxLength={200} rows={2} />
        </Field>
        <Field label={t('common.phone')} hint={t('auth.phoneHelp')}>
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            type="tel" inputMode="tel" placeholder="9876543210" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('profile.dob')}>
            <input type="date" value={dob ?? ''} max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDob(e.target.value)} />
          </Field>
          <Field label={t('profile.gender')}>
            <select value={gender} onChange={(e) => setGender(e.target.value)}>
              {genders.map((g) => <option key={g.v || 'na'} value={g.v}>{g.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t('profile.country')} hint={detecting ? t('profile.detecting') : t('profile.countryHint')}>
          <input value={country} onChange={(e) => setCountry(e.target.value)}
            placeholder={detecting ? t('profile.detecting') : 'India'} />
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
        <button className="btn-primary w-full mt-2" disabled={busy || photoBusy} onClick={save}>
          {t('common.save')}
        </button>
      </div>

      <div className="text-center mt-4">
        <button className="btn-secondary" onClick={() => supabase.auth.signOut()}>{t('common.signOut')}</button>
      </div>
    </div>
  );
}
