import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { useNavigate } from 'react-router-dom';
import { Field, ErrorNote, friendlyError, Modal, StatusChip } from '../components/ui';
import type { Committee, Organization, Program } from '../lib/types';

const UNIT_LABELS = ['house', 'member', 'family', 'shop', 'unit'] as const;
// sensible default register type per organization type
const DEFAULT_UNIT: Record<string, string> = {
  temple: 'house', church: 'house', mosque: 'house', association: 'unit',
  college: 'member', cultural: 'member', club: 'member', political: 'member', other: 'house',
};

type ManageKind = 'org' | 'committee' | 'program';

/** Small rename/delete icon pair, shown only to those who can manage the item. */
function ManageBtns({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="flex items-center gap-0.5 shrink-0">
      <button className="text-stone-300 hover:text-brand-700 px-1" onClick={onEdit}>✏️</button>
      <button className="text-stone-300 hover:text-red-600 px-1" onClick={onDelete}>🗑</button>
    </span>
  );
}

/** Organization → Committee → yearly Program management, incl. freeze. */
export default function Setup() {
  const { t } = useTranslation();
  const { session, refresh, isPadmin, memberships, current } = useApp();
  const nav = useNavigate();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCommittee, setShowCommittee] = useState<string | null>(null); // org id
  const [showProgram, setShowProgram] = useState<Committee | null>(null);
  const [comForm, setComForm] = useState({ name: '', desc: '' });
  const [progForm, setProgForm] = useState({
    name: '', year: String(new Date().getFullYear()), opening: '0', weekly: '', weeks: '52',
    unitLabel: 'house', copyFrom: '' as string,
  });
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);
  const [rename, setRename] = useState<{ kind: ManageKind; id: string; name: string } | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [del, setDel] = useState<{ kind: ManageKind; id: string; name: string } | null>(null);
  const [delConfirm, setDelConfirm] = useState('');

  const load = async () => {
    const [o, c, p] = await Promise.all([
      supabase.from('organizations').select('*').order('created_at'),
      supabase.from('committees').select('*').order('created_at'),
      supabase.from('programs').select('*').order('year', { ascending: false }),
    ]);
    setOrgs((o.data ?? []) as Organization[]);
    setCommittees((c.data ?? []) as Committee[]);
    setPrograms((p.data ?? []) as Program[]);
  };
  useEffect(() => { load(); }, []);

  const saveCommittee = async () => {
    setBusy(true); setErr(null);
    try {
      await supabase.from('committees').insert({
        organization_id: showCommittee, name: comForm.name.trim(),
        description: comForm.desc.trim() || null, created_by: session!.user.id,
      }).throwOnError();
      setShowCommittee(null); setComForm({ name: '', desc: '' });
      await load();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const saveProgram = async () => {
    setBusy(true); setErr(null); setCopiedMsg(null);
    try {
      const { data: created } = await supabase.from('programs').insert({
        committee_id: showProgram!.id,
        name: progForm.name.trim() || showProgram!.name,
        year: parseInt(progForm.year),
        opening_balance: parseFloat(progForm.opening) || 0,
        weekly_amount: progForm.weekly ? parseFloat(progForm.weekly) : null,
        total_weeks: parseInt(progForm.weeks) || 52,
        unit_label: progForm.unitLabel,
        created_by: session!.user.id,
      }).select('id').single().throwOnError();
      if (progForm.copyFrom && created) {
        const { data: count } = await supabase.rpc('copy_register', {
          p_from: progForm.copyFrom, p_to: (created as { id: string }).id,
        }).throwOnError();
        setCopiedMsg(t('setup.copiedRegister', { count: count ?? 0 }));
      }
      setShowProgram(null);
      setProgForm({ name: '', year: String(new Date().getFullYear()), opening: '0', weekly: '', weeks: '52', unitLabel: 'house', copyFrom: '' });
      await Promise.all([load(), refresh()]);
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const freeze = async (p: Program) => {
    if (!window.confirm(t('setup.freezeWarning'))) return;
    try {
      await supabase.from('programs').update({ status: 'frozen' }).eq('id', p.id).throwOnError();
      await Promise.all([load(), refresh()]);
    } catch (e) { setErr(friendlyError(e)); }
  };

  const unfreeze = async (p: Program) => {
    try {
      await supabase.from('programs').update({ status: 'active' }).eq('id', p.id).throwOnError();
      await Promise.all([load(), refresh()]);
    } catch (e) { setErr(friendlyError(e)); }
  };

  const canFreeze = (p: Program) =>
    isPadmin || memberships.some((m) => m.program_id === p.id && m.role === 'committee_admin');

  const myUid = session!.user.id;
  const canManageOrg = (o: Organization) => isPadmin || o.created_by === myUid;
  const canManageCommittee = (o: Organization, committeeId: string) =>
    isPadmin || o.created_by === myUid ||
    memberships.some((m) => m.role === 'committee_admin' && m.programs?.committee_id === committeeId);

  const openRename = (kind: ManageKind, id: string, name: string) => {
    setErr(null); setRenameVal(name); setRename({ kind, id, name });
  };
  const openDelete = (kind: ManageKind, id: string, name: string) => {
    setErr(null); setDelConfirm(''); setDel({ kind, id, name });
  };
  const tableOf = (kind: ManageKind) =>
    kind === 'org' ? 'organizations' : kind === 'committee' ? 'committees' : 'programs';

  const doRename = async () => {
    if (!rename) return;
    setBusy(true); setErr(null);
    try {
      await supabase.from(tableOf(rename.kind)).update({ name: renameVal.trim() }).eq('id', rename.id).throwOnError();
      setRename(null);
      await Promise.all([load(), refresh()]);
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const doDelete = async () => {
    if (!del) return;
    setBusy(true); setErr(null);
    try {
      await supabase.from(tableOf(del.kind)).delete().eq('id', del.id).throwOnError();
      setDel(null); setDelConfirm('');
      await Promise.all([load(), refresh()]);
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? '');
      setErr(msg.includes('CANNOT_DELETE_FROZEN') ? t('setup.cannotDeleteFrozen') : friendlyError(e));
    }
    setBusy(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">⚙️ {t('setup.title')}</h1>
        <button className="btn-primary text-sm" onClick={() => nav('/setup/new')}>
          ＋ {t('setup.newOrganization')}
        </button>
      </div>
      <ErrorNote msg={err} />
      {copiedMsg && (
        <div className="bg-green-50 border border-green-100 text-green-800 rounded-lg p-3 mb-3 text-sm">
          ✓ {copiedMsg}
        </div>
      )}

      {orgs.map((org) => (
        <div key={org.id} className="card mb-4">
          <div className="flex justify-between items-center mb-2">
            <div>
              <div className="font-bold">{org.name}</div>
              <div className="text-xs text-stone-500">
                {t(`setup.${org.org_type === 'other' ? 'otherType' : org.org_type}`)}
                {[org.place, org.district, org.state].filter(Boolean).length > 0 &&
                  ` · ${[org.place, org.district, org.state].filter(Boolean).join(', ')}`}
              </div>
            </div>
            {canManageOrg(org) && (
              <div className="flex items-center gap-1 shrink-0">
                <ManageBtns onEdit={() => openRename('org', org.id, org.name)}
                  onDelete={() => openDelete('org', org.id, org.name)} />
                <button className="btn-secondary text-xs" onClick={() => setShowCommittee(org.id)}>
                  ＋ {t('setup.newCommittee')}
                </button>
              </div>
            )}
          </div>
          {committees.filter((c) => c.organization_id === org.id).map((c) => (
            <div key={c.id} className="border-t border-stone-100 pt-2 mt-2">
              <div className="flex justify-between items-center gap-2">
                <div className="flex items-center gap-1 min-w-0">
                  <div className="font-semibold text-sm truncate">🏛 {c.name}</div>
                  {canManageCommittee(org, c.id) && (
                    <ManageBtns onEdit={() => openRename('committee', c.id, c.name)}
                      onDelete={() => openDelete('committee', c.id, c.name)} />
                  )}
                </div>
                {canManageOrg(org) && (
                  <button className="text-brand-600 text-xs font-semibold shrink-0"
                    onClick={() => {
                      const prev = programs.filter((p) => p.committee_id === c.id)
                        .sort((a, b) => b.year - a.year)[0];
                      setProgForm((f) => ({
                        ...f,
                        unitLabel: prev?.unit_label ?? DEFAULT_UNIT[org.org_type] ?? 'house',
                        copyFrom: prev?.id ?? '',
                      }));
                      setShowProgram(c);
                    }}>
                    ＋ {t('setup.newProgram')}
                  </button>
                )}
              </div>
              {programs.filter((p) => p.committee_id === c.id).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 py-1.5 pl-4 text-sm">
                  <span className="min-w-0 truncate">
                    {p.name} <b>{p.year}</b> <StatusChip status={p.status} />
                    {current?.program_id === p.id && <span className="chip-blue ml-1">✓</span>}
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    {canFreeze(p) && (
                      p.status === 'active'
                        ? <button className="text-stone-500 text-xs underline" onClick={() => freeze(p)}>❄️ {t('setup.freeze')}</button>
                        : isPadmin && <button className="text-stone-500 text-xs underline" onClick={() => unfreeze(p)}>{t('admin.unfreeze')}</button>
                    )}
                    {canManageCommittee(org, c.id) && (p.status !== 'frozen' || isPadmin) && (
                      <ManageBtns onEdit={() => openRename('program', p.id, p.name)}
                        onDelete={() => openDelete('program', p.id, p.name)} />
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {showCommittee && (
        <Modal title={t('setup.newCommittee')} onClose={() => setShowCommittee(null)}>
          <Field label={t('common.name')}>
            <input value={comForm.name} onChange={(e) => setComForm({ ...comForm, name: e.target.value })}
              placeholder="Ganamela Committee" />
          </Field>
          <Field label={`${t('common.notes')} (${t('common.optional')})`}>
            <input value={comForm.desc} onChange={(e) => setComForm({ ...comForm, desc: e.target.value })} />
          </Field>
          <button className="btn-primary w-full" disabled={busy || !comForm.name.trim()} onClick={saveCommittee}>
            {t('common.save')}
          </button>
        </Modal>
      )}

      {showProgram && (
        <Modal title={`${t('setup.newProgram')} — ${showProgram.name}`} onClose={() => setShowProgram(null)}>
          <Field label={t('setup.programName')}>
            <input value={progForm.name} onChange={(e) => setProgForm({ ...progForm, name: e.target.value })}
              placeholder={showProgram.name} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('setup.programYear')}>
              <input type="number" value={progForm.year}
                onChange={(e) => setProgForm({ ...progForm, year: e.target.value })} />
            </Field>
            <Field label={t('setup.openingBalance')}>
              <input type="number" inputMode="decimal" value={progForm.opening}
                onChange={(e) => setProgForm({ ...progForm, opening: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${t('setup.weeklyAmount')} (${t('common.optional')})`}>
              <input type="number" inputMode="decimal" value={progForm.weekly}
                onChange={(e) => setProgForm({ ...progForm, weekly: e.target.value })} placeholder="200" />
            </Field>
            <Field label={t('setup.totalWeeks')}>
              <input type="number" inputMode="numeric" value={progForm.weeks}
                onChange={(e) => setProgForm({ ...progForm, weeks: e.target.value })} />
            </Field>
          </div>
          <Field label={t('setup.registerType')}>
            <div className="grid grid-cols-5 gap-1">
              {UNIT_LABELS.map((u) => (
                <button key={u} type="button"
                  onClick={() => setProgForm({ ...progForm, unitLabel: u })}
                  className={`btn text-xs px-1 ${progForm.unitLabel === u
                    ? 'bg-brand-700 text-white' : 'bg-surface border border-stone-300'}`}>
                  {t(`units.${u}.many`)}
                </button>
              ))}
            </div>
          </Field>
          {(() => {
            const prev = programs.filter((p) => p.committee_id === showProgram.id)
              .sort((a, b) => b.year - a.year)[0];
            if (!prev) return null;
            return (
              <label className="flex items-center gap-2 mb-3 text-sm">
                <input type="checkbox" className="w-5 h-5 min-h-0" checked={!!progForm.copyFrom}
                  onChange={(e) => setProgForm({ ...progForm, copyFrom: e.target.checked ? prev.id : '' })} />
                📋 {t('setup.copyRegister', { name: prev.name, year: prev.year })}
              </label>
            );
          })()}
          <button className="btn-primary w-full" disabled={busy} onClick={saveProgram}>
            {t('common.save')}
          </button>
        </Modal>
      )}

      {rename && (
        <Modal title={t('setup.rename')} onClose={() => setRename(null)}>
          <Field label={t('common.name')}>
            <input value={renameVal} autoFocus onChange={(e) => setRenameVal(e.target.value)} />
          </Field>
          <button className="btn-primary w-full" disabled={busy || !renameVal.trim()} onClick={doRename}>
            {t('common.save')}
          </button>
        </Modal>
      )}

      {del && (
        <Modal title={`${t('common.delete')}: ${del.name}`} onClose={() => { setDel(null); setDelConfirm(''); }}>
          <p className="text-sm text-stone-600 mb-3">
            {t(del.kind === 'org' ? 'setup.deleteWarnOrg'
              : del.kind === 'committee' ? 'setup.deleteWarnCommittee' : 'setup.deleteWarnProgram')}
          </p>
          <Field label={t('setup.typeToConfirm', { name: del.name })}>
            <input value={delConfirm} autoFocus onChange={(e) => setDelConfirm(e.target.value)} />
          </Field>
          <button className="btn-danger w-full" disabled={busy || delConfirm.trim() !== del.name} onClick={doDelete}>
            {t('common.delete')}
          </button>
        </Modal>
      )}
    </div>
  );
}
