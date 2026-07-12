import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Field, ErrorNote, friendlyError, Modal, Empty } from '../components/ui';
import { displayName, TIERS, type CommitteeMember, type CommitteePosition, type Tier } from '../lib/types';

/** Small colored badge per access tier. */
function TierBadge({ tier }: { tier: Tier }) {
  const { t } = useTranslation();
  const cls: Record<Tier, string> = {
    admin: 'bg-brand-50 text-brand-700 border-brand-200',
    finance: 'bg-green-50 text-green-700 border-green-200',
    own: 'bg-amber-50 text-amber-700 border-amber-200',
    released: 'bg-stone-100 text-stone-600 border-stone-200',
    viewer: 'bg-stone-100 text-stone-500 border-stone-200',
  };
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls[tier]}`}>
      {t(`tiers.${tier}.label`)}
    </span>
  );
}

/**
 * Committee-scoped team management. Members are added once to the committee with
 * a position (an extensible label) that maps to an access tier; that access flows
 * to every program under the committee.
 */
export default function Members() {
  const { t } = useTranslation();
  const { currentProgram, isCommitteeAdmin, refresh } = useApp();
  const committeeId = currentProgram?.committee_id ?? null;

  const [members, setMembers] = useState<CommitteeMember[]>([]);
  const [positions, setPositions] = useState<CommitteePosition[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', positionId: '', viewAll: false });
  const [showAddPos, setShowAddPos] = useState(false);
  const [posForm, setPosForm] = useState({ label: '', tier: 'own' as Tier });

  const positionById = (id: string | null) => positions.find((p) => p.id === id) ?? null;

  const load = async () => {
    if (!committeeId) { setMembers([]); setPositions([]); return; }
    const [{ data: pos }, { data: mem }] = await Promise.all([
      supabase.from('committee_positions').select('*')
        .eq('committee_id', committeeId).order('sort_order').order('created_at'),
      supabase.from('committee_members').select('*, profiles(nickname, full_name)')
        .eq('committee_id', committeeId).order('created_at'),
    ]);
    setPositions((pos ?? []) as CommitteePosition[]);
    setMembers((mem ?? []) as CommitteeMember[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [committeeId]);

  const add = async () => {
    setBusy(true); setErr(null);
    try {
      const pos = positionById(form.positionId);
      await supabase.from('committee_members').insert({
        committee_id: committeeId,
        email: form.email.trim().toLowerCase(),
        display_name: form.name.trim() || null,
        position_id: form.positionId || null,
        view_all_money: pos?.tier === 'own' ? form.viewAll : false,
      }).throwOnError();
      setShowAdd(false); setForm({ email: '', name: '', positionId: '', viewAll: false });
      await Promise.all([load(), refresh()]);
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const changePosition = async (m: CommitteeMember, positionId: string) => {
    try {
      await supabase.from('committee_members')
        .update({ position_id: positionId || null }).eq('id', m.id).throwOnError();
      await Promise.all([load(), refresh()]);
    } catch (e) { setErr(friendlyError(e)); }
  };

  const toggleViewAll = async (m: CommitteeMember) => {
    try {
      await supabase.from('committee_members')
        .update({ view_all_money: !m.view_all_money }).eq('id', m.id).throwOnError();
      await Promise.all([load(), refresh()]);
    } catch (e) { setErr(friendlyError(e)); }
  };

  const remove = async (m: CommitteeMember) => {
    if (!window.confirm(`${t('common.delete')}: ${m.email}?`)) return;
    try {
      await supabase.from('committee_members').delete().eq('id', m.id).throwOnError();
      await Promise.all([load(), refresh()]);
    } catch (e) { setErr(friendlyError(e)); }
  };

  const addPosition = async () => {
    setBusy(true); setErr(null);
    try {
      const maxSort = positions.reduce((mx, p) => Math.max(mx, p.sort_order), 0);
      const { data } = await supabase.from('committee_positions').insert({
        committee_id: committeeId,
        label: posForm.label.trim(),
        tier: posForm.tier,
        sort_order: maxSort + 1,
      }).select('id').single().throwOnError();
      setShowAddPos(false); setPosForm({ label: '', tier: 'own' });
      await load();
      // preselect the new position in the add-member form
      if (data) setForm((f) => ({ ...f, positionId: (data as { id: string }).id, viewAll: false }));
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  if (!committeeId) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">👥 {t('setup.team')}</h1>
        <Empty label={t('members.noCommittee')} />
      </div>
    );
  }

  const selectedPos = positionById(form.positionId);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold">👥 {t('setup.team')}</h1>
        {isCommitteeAdmin && (
          <button className="btn-primary text-sm" onClick={() => setShowAdd(true)}>＋ {t('setup.addMember')}</button>
        )}
      </div>
      <p className="text-xs text-stone-500 mb-4">{t('members.scopeNote')}</p>
      <ErrorNote msg={err} />
      {members.length === 0 && <Empty />}

      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="card">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{displayName(m)}</div>
                <div className="text-xs text-stone-500 truncate">
                  {m.email} {!m.profile_id && <span className="chip-amber ml-1">⏳</span>}
                </div>
                <div className="mt-1"><TierBadge tier={m.tier} /></div>
              </div>
              {isCommitteeAdmin ? (
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1">
                    <select value={m.position_id ?? ''} className="text-sm w-44"
                      onChange={(e) => changePosition(m, e.target.value)}>
                      <option value="">{m.position_label || t(`tiers.${m.tier}.label`)}</option>
                      {positions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                    <button className="text-stone-300 hover:text-red-600 px-1" onClick={() => remove(m)}>🗑</button>
                  </div>
                  {m.tier === 'own' && (
                    <label className="flex items-center gap-1.5 text-xs text-stone-600">
                      <input type="checkbox" className="w-4 h-4 min-h-0" checked={m.view_all_money}
                        onChange={() => toggleViewAll(m)} />
                      {t('setup.seeAllMoney')}
                    </label>
                  )}
                </div>
              ) : (
                <span className="shrink-0">{m.position_label || t(`tiers.${m.tier}.label`)}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <Modal title={t('setup.addMember')} onClose={() => setShowAdd(false)}>
          <Field label={t('setup.memberEmail')} hint={t('auth.noProgramHelp')}>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@gmail.com" />
          </Field>
          <Field label={`${t('common.name')} (${t('common.optional')})`}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t('setup.position')}>
            <select value={form.positionId}
              onChange={(e) => setForm({ ...form, positionId: e.target.value, viewAll: false })}>
              <option value="" disabled>—</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>{p.label} · {t(`tiers.${p.tier}.label`)}</option>
              ))}
            </select>
          </Field>
          <button type="button" className="text-brand-600 text-sm font-semibold mb-2"
            onClick={() => { setPosForm({ label: '', tier: 'own' }); setShowAddPos(true); }}>
            ＋ {t('setup.addPosition')}
          </button>
          {selectedPos && (
            <p className="text-xs text-stone-500 mb-2">{t(`tiers.${selectedPos.tier}.hint`)}</p>
          )}
          {selectedPos?.tier === 'own' && (
            <label className="flex items-center gap-2 mb-3 text-sm">
              <input type="checkbox" className="w-5 h-5 min-h-0" checked={form.viewAll}
                onChange={(e) => setForm({ ...form, viewAll: e.target.checked })} />
              {t('setup.seeAllMoney')}
            </label>
          )}
          <p className="text-xs text-stone-400 mb-3">📌 {t('setup.appliesAllPrograms')}</p>
          <button className="btn-primary w-full"
            disabled={busy || !/\S+@\S+\.\S+/.test(form.email) || !form.positionId} onClick={add}>
            {t('common.add')}
          </button>
        </Modal>
      )}

      {showAddPos && (
        <Modal title={t('setup.newPosition')} onClose={() => setShowAddPos(false)}>
          <Field label={t('setup.positionLabel')}>
            <input value={posForm.label} autoFocus placeholder="Magazine Editor"
              onChange={(e) => setPosForm({ ...posForm, label: e.target.value })} />
          </Field>
          <Field label={t('setup.accessTier')}>
            <div className="space-y-2">
              {TIERS.map((tier) => (
                <button key={tier} type="button" onClick={() => setPosForm({ ...posForm, tier })}
                  className={`w-full rounded-lg border p-3 text-left ${
                    posForm.tier === tier ? 'border-brand-600 bg-brand-50' : 'border-stone-200'}`}>
                  <div className="text-sm font-medium">{t(`tiers.${tier}.label`)}</div>
                  <div className="text-xs text-stone-500">{t(`tiers.${tier}.hint`)}</div>
                </button>
              ))}
            </div>
          </Field>
          <button className="btn-primary w-full" disabled={busy || !posForm.label.trim()} onClick={addPosition}>
            {t('common.save')}
          </button>
        </Modal>
      )}
    </div>
  );
}
