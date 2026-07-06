import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, fmtINR } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Field, ErrorNote, friendlyError, Modal } from '../components/ui';
import type { Area, House } from '../lib/types';

export default function CollectHouse() {
  const { t } = useTranslation();
  const { currentProgramId, session, refreshFinance } = useApp();
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
  const [addHouse, setAddHouse] = useState(false);
  const [newHouse, setNewHouse] = useState({ name: '', owner: '' });

  useEffect(() => {
    if (!currentProgramId) return;
    supabase.from('areas').select('*').eq('program_id', currentProgramId).order('name')
      .then(({ data }) => setAreas((data ?? []) as Area[]));
    supabase.from('houses').select('*').eq('program_id', currentProgramId).order('sort_order').order('name')
      .then(({ data }) => setHouses((data ?? []) as House[]));
  }, [currentProgramId]);

  const filteredHouses = useMemo(
    () => houses.filter((h) => !areaId || h.area_id === areaId),
    [houses, areaId],
  );

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
      setAmount(''); setPayer(''); setNotes(''); setHouseId('');
      refreshFinance();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const saveHouse = async () => {
    if (!newHouse.name.trim()) return;
    const { data, error } = await supabase.from('houses').insert({
      program_id: currentProgramId, area_id: areaId || null,
      name: newHouse.name.trim(), owner_name: newHouse.owner.trim() || null,
    }).select('*').single();
    if (!error && data) {
      setHouses((p) => [...p, data as House]);
      setHouseId((data as House).id);
      setAddHouse(false); setNewHouse({ name: '', owner: '' });
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-4">🏠 {t('collect.house')}</h1>
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
          <select value={areaId} onChange={(e) => { setAreaId(e.target.value); setHouseId(''); }}>
            <option value="">{t('common.all')}</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label={t('collect.selectHouse')}>
          <div className="flex gap-2">
            <select value={houseId} onChange={(e) => setHouseId(e.target.value)}>
              <option value="">— {t('common.optional')} —</option>
              {filteredHouses.map((h) => (
                <option key={h.id} value={h.id}>{h.name}{h.owner_name ? ` (${h.owner_name})` : ''}</option>
              ))}
            </select>
            <button className="btn-secondary shrink-0 px-3" onClick={() => setAddHouse(true)}>＋</button>
          </div>
        </Field>
        <Field label={t('collect.payerName')}>
          <input value={payer} onChange={(e) => setPayer(e.target.value)} />
        </Field>
        <Field label={t('common.amount')}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)}
            type="number" inputMode="decimal" min="1" placeholder="500" className="text-2xl font-bold" />
        </Field>
        <Field label={t('collect.mode')}>
          <div className="grid grid-cols-3 gap-2">
            {['cash', 'upi', 'bank'].map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`btn ${mode === m ? 'bg-brand-700 text-white' : 'bg-white border border-stone-300'}`}>
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
        <Modal title={t('setup.newHouse')} onClose={() => setAddHouse(false)}>
          <Field label={t('collect.houseName')}>
            <input value={newHouse.name} onChange={(e) => setNewHouse({ ...newHouse, name: e.target.value })} />
          </Field>
          <Field label={t('setup.houseOwner')}>
            <input value={newHouse.owner} onChange={(e) => setNewHouse({ ...newHouse, owner: e.target.value })} />
          </Field>
          <button className="btn-primary w-full" onClick={saveHouse}>{t('common.save')}</button>
        </Modal>
      )}
    </div>
  );
}
