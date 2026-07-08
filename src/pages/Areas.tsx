import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { useUnits } from '../lib/units';
import { Field, ErrorNote, friendlyError, Modal, Empty } from '../components/ui';
import type { Area, House, Membership } from '../lib/types';

function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}

export default function Areas() {
  const { t } = useTranslation();
  const { currentProgramId, isCommitteeAdmin, frozen, can } = useApp();
  const { unit, units } = useUnits();
  const [areas, setAreas] = useState<Area[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [showArea, setShowArea] = useState(false);
  const [areaName, setAreaName] = useState('');
  const [editArea, setEditArea] = useState<Area | null>(null);

  // quick add
  const [showQuick, setShowQuick] = useState(false);
  const [qArea, setQArea] = useState('');
  const [qName, setQName] = useState('');
  const [qPhone, setQPhone] = useState('');
  const [qGps, setQGps] = useState(false);
  const [qCount, setQCount] = useState(0);
  const [qBusy, setQBusy] = useState(false);
  const [bulk, setBulk] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  // edit entry
  const [editing, setEditing] = useState<House | null>(null);
  const [eForm, setEForm] = useState({
    name: '', owner: '', phone: '', email: '', areaId: '', sub: false,
    lat: null as number | null, lng: null as number | null,
  });
  const [gpsBusy, setGpsBusy] = useState(false);

  const load = async () => {
    if (!currentProgramId) return;
    const [a, h, m] = await Promise.all([
      supabase.from('areas').select('*').eq('program_id', currentProgramId).order('name'),
      supabase.from('houses').select('*').eq('program_id', currentProgramId).order('sort_order').order('name'),
      supabase.from('program_members').select('*').eq('program_id', currentProgramId),
    ]);
    setAreas((a.data ?? []) as Area[]);
    setHouses((h.data ?? []) as House[]);
    setMembers((m.data ?? []) as Membership[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentProgramId]);

  const saveArea = async () => {
    try {
      await supabase.from('areas').insert({ program_id: currentProgramId, name: areaName.trim() }).throwOnError();
      setShowArea(false); setAreaName('');
      await load();
    } catch (e) { setErr(friendlyError(e)); }
  };

  const quickSave = async () => {
    const name = qName.trim();
    if (!name || qBusy) return;
    setQBusy(true); setErr(null);
    try {
      let gps: { lat: number; lng: number } | null = null;
      if (qGps) {
        try { gps = await getPosition(); } catch { setErr(t('setup.gpsError')); }
      }
      await supabase.from('houses').insert({
        program_id: currentProgramId,
        area_id: qArea || null,
        name,
        phone: qPhone.trim() || null,
        gps_lat: gps?.lat ?? null,
        gps_lng: gps?.lng ?? null,
      }).throwOnError();
      setQCount((c) => c + 1);
      setQName(''); setQPhone('');
      nameRef.current?.focus();
    } catch (e) { setErr(friendlyError(e)); }
    setQBusy(false);
  };

  const bulkRows = useMemo(() =>
    bulk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
      const [name, owner, phone, email] = line.split(/[,\t]/).map((x) => x?.trim());
      return { name, owner: owner || null, phone: phone || null, email: email || null };
    }).filter((r) => r.name), [bulk]);

  const bulkImport = async () => {
    if (bulkRows.length === 0 || qBusy) return;
    setQBusy(true); setErr(null);
    try {
      for (let i = 0; i < bulkRows.length; i += 200) {
        await supabase.from('houses').insert(
          bulkRows.slice(i, i + 200).map((r) => ({
            program_id: currentProgramId,
            area_id: qArea || null,
            name: r.name,
            owner_name: r.owner,
            phone: r.phone,
            email: r.email,
          })),
        ).throwOnError();
      }
      setQCount((c) => c + bulkRows.length);
      setBulk('');
      await load();
    } catch (e) { setErr(friendlyError(e)); }
    setQBusy(false);
  };

  const openEdit = (h: House) => {
    setEditing(h);
    setEForm({
      name: h.name, owner: h.owner_name ?? '', phone: h.phone ?? '', email: h.email ?? '',
      areaId: h.area_id ?? '', sub: h.in_subscription, lat: h.gps_lat, lng: h.gps_lng,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await supabase.from('houses').update({
        name: eForm.name.trim(),
        owner_name: eForm.owner.trim() || null,
        phone: eForm.phone.trim() || null,
        email: eForm.email.trim() || null,
        area_id: eForm.areaId || null,
        in_subscription: eForm.sub,
        gps_lat: eForm.lat,
        gps_lng: eForm.lng,
      }).eq('id', editing.id).throwOnError();
      setEditing(null);
      await load();
    } catch (e) { setErr(friendlyError(e)); }
  };

  const pinGps = async () => {
    setGpsBusy(true);
    try {
      const p = await getPosition();
      setEForm((f) => ({ ...f, lat: p.lat, lng: p.lng }));
    } catch { setErr(t('setup.gpsError')); }
    setGpsBusy(false);
  };

  const removeEntry = async () => {
    if (!editing || !window.confirm(`${t('common.delete')}: ${editing.name}?`)) return;
    try {
      await supabase.from('houses').delete().eq('id', editing.id).throwOnError();
      setEditing(null);
      await load();
    } catch (e) { setErr(friendlyError(e)); }
  };

  const toggleTeam = async (area: Area, memberId: string) => {
    const ids = area.assigned_member_ids.includes(memberId)
      ? area.assigned_member_ids.filter((x) => x !== memberId)
      : [...area.assigned_member_ids, memberId];
    try {
      await supabase.from('areas').update({ assigned_member_ids: ids }).eq('id', area.id).throwOnError();
      await load();
      setEditArea((prev) => prev ? { ...prev, assigned_member_ids: ids } : prev);
    } catch (e) { setErr(friendlyError(e)); }
  };

  const memberName = (id: string) => {
    const m = members.find((x) => x.id === id);
    return m?.display_name || m?.email || '';
  };

  const Chip = ({ h }: { h: House }) => (
    <button onClick={() => openEdit(h)}
      className="chip-gray hover:bg-brand-50 hover:text-brand-800 cursor-pointer min-h-0"
      title={t('setup.editEntry')}>
      {h.name}
      {h.phone ? ' 📞' : ''}{h.gps_lat != null ? ' 📍' : ''}{h.in_subscription ? ' 📅' : ''}
    </button>
  );

  const unassigned = houses.filter((h) => !h.area_id);

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h1 className="text-xl font-bold">🗺️ {t('nav.areas')}</h1>
        <div className="flex gap-2">
          {can('collect') && !frozen && (
            <button className="btn-primary text-sm" onClick={() => { setShowQuick(true); setQCount(0); }}>
              ⚡ {t('setup.quickAdd')}
            </button>
          )}
          {isCommitteeAdmin && !frozen && (
            <button className="btn-secondary text-sm" onClick={() => setShowArea(true)}>
              ＋ {t('setup.newArea')}
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-stone-500 mb-4">{units}: {houses.length}</p>
      <ErrorNote msg={err} />
      {areas.length === 0 && unassigned.length === 0 && <Empty />}

      {areas.map((a) => (
        <div key={a.id} className="card mb-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold">{a.name}</div>
              <div className="text-xs text-stone-500">
                {units}: {houses.filter((h) => h.area_id === a.id).length}
                {a.assigned_member_ids.length > 0 && (
                  <> · 👤 {a.assigned_member_ids.map(memberName).join(', ')}</>
                )}
              </div>
            </div>
            {isCommitteeAdmin && !frozen && (
              <button className="btn-secondary text-xs" onClick={() => setEditArea(a)}>{t('setup.assignTeam')}</button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {houses.filter((h) => h.area_id === a.id).map((h) => <Chip key={h.id} h={h} />)}
          </div>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div className="card">
          <div className="font-semibold text-sm text-stone-500 mb-2">—</div>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map((h) => <Chip key={h.id} h={h} />)}
          </div>
        </div>
      )}

      {showArea && (
        <Modal title={t('setup.newArea')} onClose={() => setShowArea(false)}>
          <Field label={t('common.name')}>
            <input value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="Ward 1" />
          </Field>
          <button className="btn-primary w-full" disabled={!areaName.trim()} onClick={saveArea}>{t('common.save')}</button>
        </Modal>
      )}

      {showQuick && (
        <Modal title={`⚡ ${t('setup.quickAdd')} — ${units}`} onClose={() => { setShowQuick(false); load(); }}>
          <p className="text-xs text-stone-500 mb-3">{t('setup.quickAddHelp')}</p>
          <Field label={t('setup.area')}>
            <select value={qArea} onChange={(e) => setQArea(e.target.value)}>
              <option value="">—</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <form onSubmit={(e) => { e.preventDefault(); quickSave(); }}>
            <div className="flex gap-2 mb-2">
              <input ref={nameRef} value={qName} onChange={(e) => setQName(e.target.value)}
                placeholder={t('collect.unitName', { unit })} autoFocus className="flex-[2]" />
              <input value={qPhone} onChange={(e) => setQPhone(e.target.value)}
                type="tel" inputMode="tel" placeholder={t('common.phone')} className="flex-1" />
              <button type="submit" className="btn-primary px-4 shrink-0" disabled={qBusy || !qName.trim()}>＋</button>
            </div>
          </form>
          <label className="flex items-center gap-2 mb-2 text-sm">
            <input type="checkbox" className="w-5 h-5 min-h-0" checked={qGps}
              onChange={(e) => setQGps(e.target.checked)} />
            📍 {t('setup.gpsEachEntry')}
          </label>
          {qCount > 0 && (
            <div className="bg-green-50 border border-green-100 text-green-800 rounded-lg p-2 mb-3 text-sm font-semibold">
              ✓ {t('setup.addedCount', { count: qCount })}
            </div>
          )}

          <div className="border-t border-stone-200 mt-4 pt-4">
            <div className="font-semibold text-sm mb-1">📋 {t('setup.bulkPaste')}</div>
            <p className="text-xs text-stone-500 mb-2">{t('setup.bulkPasteHelp')}</p>
            <textarea rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)}
              placeholder={'Puthenveedu, Raman Nair, 9847012345, raman@gmail.com\nKaithavalappil, Suresh Kumar, 9946054321'}
              className="font-mono text-sm" />
            {bulkRows.length > 0 && (
              <button className="btn-primary w-full mt-2" disabled={qBusy} onClick={bulkImport}>
                {t('setup.bulkImport', { count: bulkRows.length })}
              </button>
            )}
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={`${t('setup.editEntry')} — ${editing.name}`} onClose={() => setEditing(null)}>
          <Field label={t('collect.unitName', { unit })}>
            <input value={eForm.name} onChange={(e) => setEForm({ ...eForm, name: e.target.value })} />
          </Field>
          <Field label={t('setup.houseOwner')}>
            <input value={eForm.owner} onChange={(e) => setEForm({ ...eForm, owner: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.phone')}>
              <input type="tel" inputMode="tel" value={eForm.phone}
                onChange={(e) => setEForm({ ...eForm, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input type="email" value={eForm.email}
                onChange={(e) => setEForm({ ...eForm, email: e.target.value })} />
            </Field>
          </div>
          <Field label={t('setup.area')}>
            <select value={eForm.areaId} onChange={(e) => setEForm({ ...eForm, areaId: e.target.value })}>
              <option value="">—</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 mb-3 text-sm">
            <input type="checkbox" className="w-5 h-5 min-h-0" checked={eForm.sub}
              onChange={(e) => setEForm({ ...eForm, sub: e.target.checked })} />
            📅 {t('collect.subscription')}
          </label>

          <div className="card bg-stone-50 p-3 mb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button className="btn-secondary text-sm" disabled={gpsBusy} onClick={pinGps}>
                📍 {gpsBusy ? t('common.loading') : t('setup.pinGps')}
              </button>
              {eForm.lat != null && eForm.lng != null && (
                <span className="text-xs text-stone-600">
                  ✓ {t('setup.gpsAttached')} ·{' '}
                  <a className="text-brand-700 underline font-semibold" target="_blank" rel="noreferrer"
                    href={`https://maps.google.com/?q=${eForm.lat},${eForm.lng}`}>
                    🗺️ {t('setup.openMap')}
                  </a>
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={saveEdit} disabled={!eForm.name.trim()}>
              {t('common.save')}
            </button>
            {isCommitteeAdmin && (
              <button className="btn-danger px-3" onClick={removeEntry}>🗑</button>
            )}
          </div>
        </Modal>
      )}

      {editArea && (
        <Modal title={`${t('setup.assignTeam')} — ${editArea.name}`} onClose={() => setEditArea(null)}>
          <div className="space-y-2">
            {members.map((m) => {
              const on = editArea.assigned_member_ids.includes(m.id);
              return (
                <button key={m.id} onClick={() => toggleTeam(editArea, m.id)}
                  className={`w-full flex items-center justify-between rounded-lg border p-3 text-left text-sm ${
                    on ? 'border-brand-600 bg-brand-50' : 'border-stone-200'}`}>
                  <span>{m.display_name || m.email}</span>
                  <span>{on ? '✓' : ''}</span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
