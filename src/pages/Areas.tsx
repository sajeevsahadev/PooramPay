import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { useUnits } from '../lib/units';
import { Field, ErrorNote, friendlyError, Modal, Empty } from '../components/ui';
import GpsPin from '../components/GpsPin';
import type { Area, House, Membership } from '../lib/types';

function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 },
    );
  });
}

const EMPTY_FORM = {
  name: '', owner: '', phone: '', email: '', areaId: '', sub: false,
  lat: null as number | null, lng: null as number | null,
};

export default function Areas() {
  const { t } = useTranslation();
  const { currentProgramId, currentProgram, isCommitteeAdmin, frozen, can } = useApp();
  const { unit, units } = useUnits();
  const weekly = !!currentProgram?.weekly_amount;
  const [areas, setAreas] = useState<Area[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [showArea, setShowArea] = useState(false);
  const [areaName, setAreaName] = useState('');
  const [editArea, setEditArea] = useState<Area | null>(null);

  // quick add (bulk / rapid)
  const [showQuick, setShowQuick] = useState(false);
  const [qArea, setQArea] = useState('');
  const [qName, setQName] = useState('');
  const [qPhone, setQPhone] = useState('');
  const [qGps, setQGps] = useState(false);
  const [qCount, setQCount] = useState(0);
  const [qBusy, setQBusy] = useState(false);
  const [bulk, setBulk] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  // single entry add / edit
  const [entry, setEntry] = useState<{ mode: 'add' | 'edit'; house?: House } | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);

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

  const countIn = (areaId: string | null) => houses.filter((h) => h.area_id === areaId).length;
  const activeAreas = areas.filter((a) => a.is_active);
  const inactiveAreas = areas.filter((a) => !a.is_active);

  const saveArea = async () => {
    try {
      await supabase.from('areas').insert({ program_id: currentProgramId, name: areaName.trim() }).throwOnError();
      setShowArea(false); setAreaName('');
      await load();
    } catch (e) { setErr(friendlyError(e)); }
  };

  const setAreaActive = async (a: Area, active: boolean) => {
    if (!active && !window.confirm(t('setup.confirmDeactivate'))) return;
    try {
      await supabase.from('areas').update({ is_active: active }).eq('id', a.id).throwOnError();
      await load();
    } catch (e) { setErr(friendlyError(e)); }
  };

  const deleteArea = async (a: Area) => {
    if (countIn(a.id) > 0) { setErr(t('setup.areaNotEmpty')); return; }
    if (!window.confirm(t('setup.confirmDeleteArea'))) return;
    try {
      await supabase.from('areas').delete().eq('id', a.id).throwOnError();
      await load();
    } catch (e) { setErr(friendlyError(e)); }
  };

  // ---- quick add ----
  const quickSave = async () => {
    const name = qName.trim();
    if (!name || qBusy) return;
    setQBusy(true); setErr(null);
    try {
      let gps: { lat: number; lng: number } | null = null;
      if (qGps) { try { gps = await getPosition(); } catch { setErr(t('setup.gpsError')); } }
      await supabase.from('houses').insert({
        program_id: currentProgramId, area_id: qArea || null, name,
        phone: qPhone.trim() || null, gps_lat: gps?.lat ?? null, gps_lng: gps?.lng ?? null,
      }).throwOnError();
      setQCount((c) => c + 1); setQName(''); setQPhone('');
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
            program_id: currentProgramId, area_id: qArea || null,
            name: r.name, owner_name: r.owner, phone: r.phone, email: r.email,
          })),
        ).throwOnError();
      }
      setQCount((c) => c + bulkRows.length); setBulk('');
      await load();
    } catch (e) { setErr(friendlyError(e)); }
    setQBusy(false);
  };

  // ---- single entry add / edit ----
  const openAdd = (areaId: string) => {
    setForm({ ...EMPTY_FORM, areaId });
    setEntry({ mode: 'add' });
  };
  const openEdit = (h: House) => {
    setForm({
      name: h.name, owner: h.owner_name ?? '', phone: h.phone ?? '', email: h.email ?? '',
      areaId: h.area_id ?? '', sub: h.in_subscription, lat: h.gps_lat, lng: h.gps_lng,
    });
    setEntry({ mode: 'edit', house: h });
  };

  const saveEntry = async () => {
    if (!form.name.trim() || busy) return;
    setBusy(true); setErr(null);
    const payload = {
      name: form.name.trim(),
      owner_name: form.owner.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      area_id: form.areaId || null,
      in_subscription: form.sub,
      gps_lat: form.lat,
      gps_lng: form.lng,
    };
    try {
      if (entry?.mode === 'edit' && entry.house) {
        await supabase.from('houses').update(payload).eq('id', entry.house.id).throwOnError();
      } else {
        await supabase.from('houses').insert({ program_id: currentProgramId, ...payload }).throwOnError();
      }
      setEntry(null);
      await load();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const removeEntry = async () => {
    if (entry?.mode !== 'edit' || !entry.house) return;
    if (!window.confirm(`${t('common.delete')}: ${entry.house.name}?`)) return;
    try {
      await supabase.from('houses').delete().eq('id', entry.house.id).throwOnError();
      setEntry(null);
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

  const AreaCard = ({ a }: { a: Area }) => {
    const n = countIn(a.id);
    return (
      <div className={`card mb-3 ${a.is_active ? '' : 'opacity-70'}`}>
        <div className="flex justify-between items-start gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="font-bold flex items-center gap-2">
              {a.name}
              {!a.is_active && <span className="chip-gray">{t('setup.inactive')}</span>}
            </div>
            <div className="text-xs text-stone-500">
              {units}: {n}
              {a.assigned_member_ids.length > 0 && (
                <> · 👤 {a.assigned_member_ids.map(memberName).join(', ')}</>
              )}
            </div>
          </div>
          {isCommitteeAdmin && !frozen && (
            <div className="flex flex-wrap gap-1.5 justify-end">
              {can('collect') && a.is_active && (
                <button className="btn-primary text-xs px-2.5 py-1.5" onClick={() => openAdd(a.id)}>
                  ＋ {unit}
                </button>
              )}
              <button className="btn-secondary text-xs px-2.5 py-1.5" onClick={() => setEditArea(a)}>
                👥 {t('setup.team')}
              </button>
              {a.is_active ? (
                <button className="btn-secondary text-xs px-2.5 py-1.5" onClick={() => setAreaActive(a, false)}>
                  🚫
                </button>
              ) : (
                <button className="btn-secondary text-xs px-2.5 py-1.5" onClick={() => setAreaActive(a, true)}>
                  ✓ {t('setup.activate')}
                </button>
              )}
              <button className={`btn-secondary text-xs px-2.5 py-1.5 ${n > 0 ? 'opacity-40' : 'text-red-600'}`}
                title={n > 0 ? t('setup.areaNotEmpty') : t('setup.deleteArea')}
                onClick={() => deleteArea(a)}>
                🗑
              </button>
            </div>
          )}
        </div>
        {n > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {houses.filter((h) => h.area_id === a.id).map((h) => <Chip key={h.id} h={h} />)}
          </div>
        )}
      </div>
    );
  };

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

      {activeAreas.map((a) => <AreaCard key={a.id} a={a} />)}

      {unassigned.length > 0 && (
        <div className="card mb-3">
          <div className="flex justify-between items-center">
            <div className="font-semibold text-sm text-stone-500">—</div>
            {can('collect') && !frozen && (
              <button className="btn-primary text-xs px-2.5 py-1.5" onClick={() => openAdd('')}>
                ＋ {unit}
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unassigned.map((h) => <Chip key={h.id} h={h} />)}
          </div>
        </div>
      )}

      {inactiveAreas.length > 0 && (
        <>
          <div className="text-sm font-semibold text-stone-500 mt-6 mb-2">
            {t('setup.inactiveAreas')} ({inactiveAreas.length})
          </div>
          {inactiveAreas.map((a) => <AreaCard key={a.id} a={a} />)}
        </>
      )}

      {showArea && (
        <Modal title={t('setup.newArea')} onClose={() => setShowArea(false)}>
          <Field label={t('common.name')}>
            <input value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="Ward 1" autoFocus />
          </Field>
          <button className="btn-primary w-full" disabled={!areaName.trim()} onClick={saveArea}>{t('common.save')}</button>
        </Modal>
      )}

      {/* single entry add/edit — full details incl. person name, email, GPS */}
      {entry && (
        <Modal
          title={entry.mode === 'add' ? t('collect.addUnit', { unit }) : `${t('setup.editEntry')} — ${entry.house?.name}`}
          onClose={() => setEntry(null)}>
          <Field label={t('collect.unitName', { unit })}>
            <input value={form.name} autoFocus
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <GpsPin lat={form.lat} lng={form.lng} unit={unit}
            onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))} onError={setErr} />
          <Field label={t('setup.houseOwner')} hint={t('setup.personHint')}>
            <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.phone')}>
              <input type="tel" inputMode="tel" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label={t('setup.email')}>
              <input type="email" inputMode="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          <Field label={t('setup.area')}>
            <select value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })}>
              <option value="">—</option>
              {activeAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          {weekly && (
            <label className="flex items-center gap-2 mb-3 text-sm">
              <input type="checkbox" className="w-5 h-5 min-h-0" checked={form.sub}
                onChange={(e) => setForm({ ...form, sub: e.target.checked })} />
              📅 {t('collect.subscription')}
            </label>
          )}

          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={saveEntry} disabled={busy || !form.name.trim()}>
              {t('common.save')}
            </button>
            {entry.mode === 'edit' && isCommitteeAdmin && (
              <button className="btn-danger px-3" onClick={removeEntry}>🗑</button>
            )}
          </div>
        </Modal>
      )}

      {showQuick && (
        <Modal title={`⚡ ${t('setup.quickAdd')} — ${units}`} onClose={() => { setShowQuick(false); load(); }}>
          <p className="text-xs text-stone-500 mb-3">{t('setup.quickAddHelp')}</p>
          <Field label={t('setup.area')}>
            <select value={qArea} onChange={(e) => setQArea(e.target.value)}>
              <option value="">—</option>
              {activeAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
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
            {members.length === 0 && <Empty />}
          </div>
        </Modal>
      )}
    </div>
  );
}
