import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Field, ErrorNote, friendlyError, Modal, Empty } from '../components/ui';
import type { Area, House, Membership } from '../lib/types';

export default function Areas() {
  const { t } = useTranslation();
  const { currentProgramId, isCommitteeAdmin, frozen, can } = useApp();
  const [areas, setAreas] = useState<Area[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [showArea, setShowArea] = useState(false);
  const [showHouse, setShowHouse] = useState<string | null>(null); // area id or '' for none
  const [areaName, setAreaName] = useState('');
  const [houseForm, setHouseForm] = useState({ name: '', owner: '', phone: '', sub: false });
  const [editArea, setEditArea] = useState<Area | null>(null);

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

  const saveHouse = async () => {
    try {
      await supabase.from('houses').insert({
        program_id: currentProgramId,
        area_id: showHouse || null,
        name: houseForm.name.trim(),
        owner_name: houseForm.owner.trim() || null,
        phone: houseForm.phone.trim() || null,
        in_subscription: houseForm.sub,
      }).throwOnError();
      setShowHouse(null); setHouseForm({ name: '', owner: '', phone: '', sub: false });
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

  const unassigned = houses.filter((h) => !h.area_id);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">🗺️ {t('setup.areas')}</h1>
        <div className="flex gap-2">
          {can('collect') && !frozen && (
            <button className="btn-secondary text-sm" onClick={() => setShowHouse('')}>＋ {t('setup.newHouse')}</button>
          )}
          {isCommitteeAdmin && !frozen && (
            <button className="btn-primary text-sm" onClick={() => setShowArea(true)}>＋ {t('setup.newArea')}</button>
          )}
        </div>
      </div>
      <ErrorNote msg={err} />
      {areas.length === 0 && unassigned.length === 0 && <Empty />}

      {areas.map((a) => (
        <div key={a.id} className="card mb-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold">{a.name}</div>
              <div className="text-xs text-stone-500">
                {t('setup.houses')}: {houses.filter((h) => h.area_id === a.id).length}
                {a.assigned_member_ids.length > 0 && (
                  <> · 👤 {a.assigned_member_ids.map(memberName).join(', ')}</>
                )}
              </div>
            </div>
            {isCommitteeAdmin && !frozen && (
              <div className="flex gap-1">
                <button className="btn-secondary text-xs" onClick={() => setEditArea(a)}>{t('setup.assignTeam')}</button>
                <button className="btn-secondary text-xs" onClick={() => setShowHouse(a.id)}>＋🏠</button>
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {houses.filter((h) => h.area_id === a.id).map((h) => (
              <span key={h.id} className="chip-gray">{h.name}{h.in_subscription ? ' 📅' : ''}</span>
            ))}
          </div>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div className="card">
          <div className="font-semibold text-sm text-stone-500 mb-2">—</div>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map((h) => <span key={h.id} className="chip-gray">{h.name}</span>)}
          </div>
        </div>
      )}

      {showArea && (
        <Modal title={t('setup.newArea')} onClose={() => setShowArea(false)}>
          <Field label={t('common.name')}>
            <input value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="Ward 1 / Kizhakke Nada" />
          </Field>
          <button className="btn-primary w-full" disabled={!areaName.trim()} onClick={saveArea}>{t('common.save')}</button>
        </Modal>
      )}

      {showHouse !== null && (
        <Modal title={t('setup.newHouse')} onClose={() => setShowHouse(null)}>
          <Field label={t('collect.houseName')}>
            <input value={houseForm.name} onChange={(e) => setHouseForm({ ...houseForm, name: e.target.value })} />
          </Field>
          <Field label={t('setup.houseOwner')}>
            <input value={houseForm.owner} onChange={(e) => setHouseForm({ ...houseForm, owner: e.target.value })} />
          </Field>
          <Field label={t('common.phone')}>
            <input type="tel" value={houseForm.phone} onChange={(e) => setHouseForm({ ...houseForm, phone: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 mb-3 text-sm">
            <input type="checkbox" className="w-5 h-5 min-h-0" checked={houseForm.sub}
              onChange={(e) => setHouseForm({ ...houseForm, sub: e.target.checked })} />
            {t('collect.subscription')}
          </label>
          <button className="btn-primary w-full" disabled={!houseForm.name.trim()} onClick={saveHouse}>
            {t('common.save')}
          </button>
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
