import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Field, ErrorNote, friendlyError, Modal, Empty } from '../components/ui';
import type { Membership, Perm, Role } from '../lib/types';

const ROLES: Role[] = ['committee_admin', 'treasurer', 'collector', 'member', 'viewer'];
const PERMS: Perm[] = ['view_money', 'collect', 'expense', 'approve', 'coupons', 'tasks'];
const PERM_KEYS: Record<Perm, string> = {
  view_money: 'setup.permViewMoney', collect: 'setup.permCollect', expense: 'setup.permExpense',
  approve: 'setup.permApprove', coupons: 'setup.permCoupons', tasks: 'setup.permTasks',
};

export default function Members() {
  const { t } = useTranslation();
  const { currentProgramId, isCommitteeAdmin, frozen, refresh } = useApp();
  const [members, setMembers] = useState<Membership[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Membership | null>(null);
  const [form, setForm] = useState({ email: '', name: '', role: 'member' as Role });

  const load = async () => {
    if (!currentProgramId) return;
    const { data } = await supabase.from('program_members').select('*')
      .eq('program_id', currentProgramId).order('created_at');
    setMembers((data ?? []) as Membership[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentProgramId]);

  const add = async () => {
    setBusy(true); setErr(null);
    try {
      await supabase.from('program_members').insert({
        program_id: currentProgramId,
        email: form.email.trim().toLowerCase(),
        display_name: form.name.trim() || null,
        role: form.role,
      }).throwOnError();
      setShowAdd(false); setForm({ email: '', name: '', role: 'member' });
      await Promise.all([load(), refresh()]);
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  // mirrors public.default_perms() in the database
  const DEFAULTS: Record<Role, Record<Perm, boolean>> = {
    committee_admin: { view_money: true, collect: true, expense: true, approve: true, coupons: true, tasks: true },
    treasurer: { view_money: true, collect: true, expense: true, approve: true, coupons: true, tasks: true },
    collector: { view_money: false, collect: true, expense: true, approve: false, coupons: true, tasks: false },
    member: { view_money: false, collect: false, expense: true, approve: false, coupons: false, tasks: false },
    viewer: { view_money: true, collect: false, expense: false, approve: false, coupons: true, tasks: false },
  };

  const updateRole = async (m: Membership, role: Role) => {
    try {
      await supabase.from('program_members')
        .update({ role, permissions: DEFAULTS[role] })
        .eq('id', m.id).throwOnError();
      await load();
    } catch (e) { setErr(friendlyError(e)); }
  };

  const togglePerm = async (m: Membership, p: Perm) => {
    try {
      const perms = { ...m.permissions, [p]: !m.permissions?.[p] };
      await supabase.from('program_members').update({ permissions: perms }).eq('id', m.id).throwOnError();
      await load();
    } catch (e) { setErr(friendlyError(e)); }
  };

  const remove = async (m: Membership) => {
    if (!window.confirm(`${t('common.delete')}: ${m.email}?`)) return;
    try {
      await supabase.from('program_members').delete().eq('id', m.id).throwOnError();
      await load();
    } catch (e) { setErr(friendlyError(e)); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">👥 {t('setup.members')}</h1>
        {isCommitteeAdmin && !frozen && (
          <button className="btn-primary text-sm" onClick={() => setShowAdd(true)}>＋ {t('setup.addMember')}</button>
        )}
      </div>
      <ErrorNote msg={err} />
      {members.length === 0 && <Empty />}

      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="card">
            <div className="flex justify-between items-center gap-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{m.display_name || m.email}</div>
                <div className="text-xs text-stone-500 truncate">
                  {m.email} {!m.profile_id && <span className="chip-amber ml-1">⏳</span>}
                </div>
              </div>
              {isCommitteeAdmin && !frozen ? (
                <div className="flex items-center gap-1 shrink-0">
                  <select value={m.role} className="text-sm w-40"
                    onChange={(e) => updateRole(m, e.target.value as Role)}>
                    {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
                  </select>
                  <button className="text-stone-300 hover:text-brand-700 px-1" onClick={() => setEditing(m)}>⚙</button>
                  <button className="text-stone-300 hover:text-red-600 px-1" onClick={() => remove(m)}>🗑</button>
                </div>
              ) : (
                <span className="chip-blue shrink-0">{t(`roles.${m.role}`)}</span>
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
          <Field label={t('setup.role')}>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </select>
          </Field>
          <button className="btn-primary w-full" disabled={busy || !/\S+@\S+\.\S+/.test(form.email)} onClick={add}>
            {t('common.add')}
          </button>
        </Modal>
      )}

      {editing && (
        <Modal title={`${t('setup.permissions')} — ${editing.display_name || editing.email}`}
          onClose={() => setEditing(null)}>
          <div className="space-y-2">
            {PERMS.map((p) => {
              const m = members.find((x) => x.id === editing.id) ?? editing;
              const on = m.role === 'committee_admin' || !!m.permissions?.[p];
              return (
                <button key={p} onClick={() => m.role !== 'committee_admin' && togglePerm(m, p)}
                  className={`w-full flex items-center justify-between rounded-lg border p-3 text-left text-sm ${
                    on ? 'border-brand-600 bg-brand-50' : 'border-stone-200'}`}>
                  <span>{t(PERM_KEYS[p])}</span>
                  <span className={`w-10 h-6 rounded-full relative transition-colors ${on ? 'bg-brand-600' : 'bg-stone-300'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                  </span>
                </button>
              );
            })}
          </div>
          {editing.role === 'committee_admin' && (
            <p className="text-xs text-stone-400 mt-3">{t('roles.committee_admin')} = {t('common.all')}</p>
          )}
        </Modal>
      )}
    </div>
  );
}
