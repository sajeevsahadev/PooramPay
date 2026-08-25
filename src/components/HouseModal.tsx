import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { Field, Modal, ErrorNote, friendlyError } from './ui';
import GpsPin from './GpsPin';
import type { Area, House } from '../lib/types';

/** Add / edit a single register entry (house/member/shop…). Self-contained. */
export default function HouseModal({
  mode, house, programId, areas, weekly, unit, isCommitteeAdmin, defaultAreaId = '', onClose, onSaved,
}: {
  mode: 'add' | 'edit';
  house?: House;
  programId: string;
  areas: Area[];
  weekly: boolean;
  unit: string;
  isCommitteeAdmin: boolean;
  defaultAreaId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: house?.name ?? '', phone: house?.phone ?? '',
    email: house?.email ?? '', areaId: house?.area_id ?? defaultAreaId,
    sub: house?.in_subscription ?? false, lat: house?.gps_lat ?? null, lng: house?.gps_lng ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const activeAreas = areas.filter((a) => a.is_active);
  const areaRequired = activeAreas.length > 0;

  const save = async () => {
    if (!form.name.trim() || busy) return;
    if (areaRequired && !form.areaId) return;
    setBusy(true); setErr(null);
    const payload = {
      name: form.name.trim(), owner_name: null,
      phone: form.phone.trim() || null, email: form.email.trim() || null,
      area_id: form.areaId || null, in_subscription: form.sub, gps_lat: form.lat, gps_lng: form.lng,
    };
    try {
      if (mode === 'edit' && house) {
        await supabase.from('houses').update(payload).eq('id', house.id).throwOnError();
      } else {
        await supabase.from('houses').insert({ program_id: programId, ...payload }).throwOnError();
      }
      onSaved(); onClose();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const remove = async () => {
    if (mode !== 'edit' || !house) return;
    if (!window.confirm(`${t('common.delete')}: ${house.name}?`)) return;
    try {
      await supabase.from('houses').delete().eq('id', house.id).throwOnError();
      onSaved(); onClose();
    } catch (e) { setErr(friendlyError(e)); }
  };

  return (
    <Modal
      title={mode === 'add' ? t('collect.addUnit', { unit }) : `${t('setup.editEntry')} — ${house?.name}`}
      onClose={onClose}>
      <ErrorNote msg={err} />
      <Field label={t('collect.unitName', { unit })}>
        <input value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>

      {/* Area — highlighted, important: every member belongs to an area */}
      {areaRequired && (
        <div className="rounded-lg border-2 border-brand-300 bg-brand-50 p-3 my-3">
          <label className="block text-sm font-bold text-brand-800 mb-1">📍 {t('collect.assignArea')} *</label>
          <select value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })}>
            <option value="">— {t('collect.selectArea')} —</option>
            {activeAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <p className="text-xs text-brand-700/80 mt-1">{t('collect.assignAreaHint', { unit })}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={`${t('common.phone')} (${t('common.optional')})`}>
          <input type="tel" inputMode="tel" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label={`${t('setup.email')} (${t('common.optional')})`}>
          <input type="email" inputMode="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
      </div>

      <GpsPin lat={form.lat} lng={form.lng} unit={unit}
        onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))} onError={setErr} />

      {weekly && (
        <label className="flex items-center gap-2 mb-3 text-sm">
          <input type="checkbox" className="w-5 h-5 min-h-0" checked={form.sub}
            onChange={(e) => setForm({ ...form, sub: e.target.checked })} />
          📅 {t('collect.subscription')}
        </label>
      )}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" onClick={save}
          disabled={busy || !form.name.trim() || (areaRequired && !form.areaId)}>
          {t('common.save')}
        </button>
        {mode === 'edit' && isCommitteeAdmin && (
          <button className="btn-danger px-3" onClick={remove}>🗑</button>
        )}
      </div>
    </Modal>
  );
}
