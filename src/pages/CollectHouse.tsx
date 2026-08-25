import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, fmtINR } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Field, ErrorNote, friendlyError, Modal } from '../components/ui';
import GpsPin from '../components/GpsPin';
import { useUnits } from '../lib/units';
import type { Area, House } from '../lib/types';

export default function CollectHouse() {
  const { t } = useTranslation();
  const { currentProgramId, session, refreshFinance } = useApp();
  const { unit, label } = useUnits();
  const [areas, setAreas] = useState<Area[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [areaId, setAreaId] = useState('');
  const [houseId, setHouseId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('cash');
  const [payer, setPayer] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ no: number; amount: number } | null>(null);

  // searchable member picker
  const [memberQuery, setMemberQuery] = useState('');
  const [memberOpen, setMemberOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // close the picker when tapping anywhere outside it (without blocking that tap,
  // so the tapped control — e.g. the area dropdown — still responds on the first tap)
  useEffect(() => {
    if (!memberOpen) return;
    const onDown = (e: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setMemberOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [memberOpen]);

  const [addHouse, setAddHouse] = useState(false);
  const [newHouse, setNewHouse] = useState({
    name: '', phone: '', email: '', areaId: '',
    lat: null as number | null, lng: null as number | null,
  });

  useEffect(() => {
    if (!currentProgramId) return;
    supabase.from('areas').select('*').eq('program_id', currentProgramId).eq('is_active', true).order('name')
      .then(({ data }) => setAreas((data ?? []) as Area[]));
    supabase.from('houses').select('*').eq('program_id', currentProgramId).order('sort_order').order('name')
      .then(({ data }) => setHouses((data ?? []) as House[]));
  }, [currentProgramId]);

  const filteredHouses = useMemo(
    () => houses.filter((h) => !areaId || h.area_id === areaId),
    [houses, areaId],
  );

  // members matching the typed search (respecting the area filter)
  const matches = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return filteredHouses;
    return filteredHouses.filter((h) => `${h.name} ${h.owner_name ?? ''}`.toLowerCase().includes(q));
  }, [filteredHouses, memberQuery]);

  const selectedHouse = houses.find((h) => h.id === houseId) || null;
  const areaName = (id: string | null | undefined) => areas.find((a) => a.id === id)?.name ?? '—';

  const selectMember = (h: House) => { setHouseId(h.id); setMemberOpen(false); setMemberQuery(''); setPayer(''); };
  const clearMember = () => { setHouseId(''); setMemberQuery(''); };
  const openAdd = (prefill: string) => {
    setNewHouse({ name: prefill.trim(), phone: '', email: '', areaId: areaId || '', lat: null, lng: null });
    setMemberOpen(false);
    setAddHouse(true);
  };

  const save = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return setErr(t('common.required'));
    setBusy(true); setErr(null);
    try {
      const house = houses.find((h) => h.id === houseId);
      const { data } = await supabase.from('income_entries').insert({
        program_id: currentProgramId,
        entry_type: 'house',
        amount: amt,
        mode,
        area_id: areaId || house?.area_id || null,
        house_id: houseId || null,
        payer_name: payer || house?.owner_name || house?.name || null,
        collected_by: session!.user.id,
        created_by: session!.user.id,
        notes: notes || null,
      }).select('receipt_no').single().throwOnError();
      setReceipt({ no: (data as { receipt_no: number }).receipt_no, amount: amt });
      setAmount(''); setPayer(''); setNotes(''); clearMember();
      refreshFinance();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const areaRequired = areas.length > 0;
  const saveHouse = async () => {
    if (!newHouse.name.trim()) return;
    if (areaRequired && !newHouse.areaId) return;
    const { data, error } = await supabase.from('houses').insert({
      program_id: currentProgramId, area_id: newHouse.areaId || null,
      name: newHouse.name.trim(), owner_name: null,
      phone: newHouse.phone.trim() || null, email: newHouse.email.trim() || null,
      gps_lat: newHouse.lat, gps_lng: newHouse.lng,
    }).select('*').single();
    if (!error && data) {
      setHouses((p) => [...p, data as House]);
      setHouseId((data as House).id);
      setAddHouse(false);
      setNewHouse({ name: '', phone: '', email: '', areaId: '', lat: null, lng: null });
    } else if (error) { setErr(friendlyError(error)); }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-4">
        {label === 'house' ? '🏠' : '🧑‍🤝‍🧑'} {t('collect.unitCollection', { unit })}
      </h1>
      <ErrorNote msg={err} />

      {receipt && (
        <div className="card bg-green-50 border-green-300 mb-4 text-center">
          <div className="text-green-800 font-bold text-lg">✓ {t('collect.paymentSaved')}</div>
          <div className="text-sm text-stone-600 mt-1">
            {t('collect.receiptNo')}: <b>#{receipt.no}</b> · <b className="money">{fmtINR(receipt.amount)}</b>
          </div>
          <button className="btn-secondary mt-3 w-full" onClick={() => setReceipt(null)}>{t('common.done')}</button>
        </div>
      )}

      <div className="card">
        <Field label={t('collect.selectArea')}>
          <select value={areaId} onChange={(e) => { setAreaId(e.target.value); clearMember(); }}>
            <option value="">{t('common.all')}</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>

        {/* searchable member picker: select existing · add new · or leave blank (walk-in) */}
        <Field label={t('collect.selectUnit', { unit })}>
          {selectedHouse ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{selectedHouse.name}</div>
                <div className="text-xs text-stone-500 truncate">
                  📍 {areaName(selectedHouse.area_id)}
                  {selectedHouse.phone && <> · 📞 <a className="underline" href={`tel:${selectedHouse.phone}`}>{selectedHouse.phone}</a></>}
                  {selectedHouse.gps_lat != null && selectedHouse.gps_lng != null && (
                    <> · <a className="text-brand-700 underline font-semibold" target="_blank" rel="noreferrer"
                      href={`https://maps.google.com/?q=${selectedHouse.gps_lat},${selectedHouse.gps_lng}`}>🗺️ {t('setup.openMap')}</a></>
                  )}
                </div>
              </div>
              <button className="text-sm text-brand-700 font-semibold shrink-0" onClick={clearMember}>
                {t('collect.changeSel')}
              </button>
            </div>
          ) : (
            <div className="relative" ref={pickerRef}>
              <div className="flex gap-2">
                <input value={memberQuery} onFocus={() => setMemberOpen(true)}
                  onChange={(e) => { setMemberQuery(e.target.value); setMemberOpen(true); }}
                  placeholder={`🔍 ${t('collect.memberSearch', { unit })}`} />
                <button className="btn-secondary shrink-0 px-3" title={t('collect.addUnit', { unit })}
                  onClick={() => openAdd(memberQuery)}>＋</button>
              </div>
              {memberOpen && (
                  <div className="absolute left-0 right-0 mt-1 z-20 bg-white border border-stone-200 rounded-lg shadow-lg max-h-64 overflow-auto">
                    {matches.slice(0, 60).map((h) => (
                      <button key={h.id} onClick={() => selectMember(h)}
                        className="w-full text-left px-3 py-2 hover:bg-brand-50 border-b border-stone-50 last:border-0">
                        <div className="font-medium truncate">{h.name}</div>
                        <div className="text-xs text-stone-400 truncate">
                          📍 {areaName(h.area_id)}{h.phone ? ` · ${h.phone}` : ''}
                        </div>
                      </button>
                    ))}
                    {matches.length === 0 && (
                      <div className="px-3 py-2 text-sm text-stone-400">{t('collect.noMatch')}</div>
                    )}
                    <button onClick={() => openAdd(memberQuery)}
                      className="w-full text-left px-3 py-2.5 text-brand-700 font-semibold hover:bg-brand-50 sticky bottom-0 bg-white border-t border-stone-100">
                      {memberQuery.trim() ? t('collect.addNamed', { name: memberQuery.trim() }) : t('collect.orAddNew', { unit })}
                    </button>
                  </div>
              )}
            </div>
          )}
          {!selectedHouse && !memberOpen && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-1.5">
              ⚠️ {t('collect.walkInHint', { unit })}
            </p>
          )}
        </Field>

        {/* payer only matters for walk-ins; a chosen member is already the payer */}
        {!selectedHouse && (
          <Field label={`${t('collect.payerName')} (${t('common.optional')})`}>
            <input value={payer} onChange={(e) => setPayer(e.target.value)} />
          </Field>
        )}
        <Field label={t('common.amount')}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)}
            type="number" inputMode="decimal" min="1" placeholder="500" className="text-2xl font-bold" />
        </Field>
        <Field label={t('collect.mode')}>
          <div className="grid grid-cols-3 gap-2">
            {['cash', 'upi', 'bank'].map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`btn ${mode === m ? 'bg-brand-700 text-white' : 'bg-surface border border-stone-300'}`}>
                {t(`collect.${m}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={`${t('common.notes')} (${t('common.optional')})`}>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button className="btn-primary w-full text-lg py-3" disabled={busy} onClick={save}>
          {t('collect.recordPayment')}
        </button>
      </div>

      {addHouse && (
        <Modal title={t('collect.addUnit', { unit })} onClose={() => setAddHouse(false)}>
          <Field label={t('collect.unitName', { unit })}>
            <input value={newHouse.name} autoFocus
              onChange={(e) => setNewHouse({ ...newHouse, name: e.target.value })} />
          </Field>

          {/* Area — highlighted, important: the member must be filed under an area */}
          {areaRequired && (
            <div className="rounded-lg border-2 border-brand-300 bg-brand-50 p-3 my-3">
              <label className="block text-sm font-bold text-brand-800 mb-1">📍 {t('collect.assignArea')} *</label>
              <select value={newHouse.areaId}
                onChange={(e) => setNewHouse({ ...newHouse, areaId: e.target.value })}>
                <option value="">— {t('collect.selectArea')} —</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <p className="text-xs text-brand-700/80 mt-1">{t('collect.assignAreaHint', { unit })}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={`${t('common.phone')} (${t('common.optional')})`}>
              <input type="tel" inputMode="tel" value={newHouse.phone}
                onChange={(e) => setNewHouse({ ...newHouse, phone: e.target.value })} />
            </Field>
            <Field label={`${t('setup.email')} (${t('common.optional')})`}>
              <input type="email" inputMode="email" value={newHouse.email}
                onChange={(e) => setNewHouse({ ...newHouse, email: e.target.value })} />
            </Field>
          </div>

          <GpsPin lat={newHouse.lat} lng={newHouse.lng} unit={unit}
            onChange={(lat, lng) => setNewHouse((h) => ({ ...h, lat, lng }))} onError={setErr} />

          <button className="btn-primary w-full mt-3"
            disabled={!newHouse.name.trim() || (areaRequired && !newHouse.areaId)} onClick={saveHouse}>
            {t('common.save')}
          </button>
        </Modal>
      )}
    </div>
  );
}
