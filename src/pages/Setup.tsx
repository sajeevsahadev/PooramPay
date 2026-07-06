import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Field, ErrorNote, friendlyError, Modal, StatusChip } from '../components/ui';
import type { Committee, Organization, Program } from '../lib/types';

const ORG_TYPES = ['temple', 'church', 'mosque', 'college', 'cultural', 'other'];

/** Organization → Committee → yearly Program management, incl. freeze. */
export default function Setup() {
  const { t } = useTranslation();
  const { session, refresh, isPadmin, memberships, current } = useApp();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showOrg, setShowOrg] = useState(false);
  const [showCommittee, setShowCommittee] = useState<string | null>(null); // org id
  const [showProgram, setShowProgram] = useState<Committee | null>(null);
  const [orgForm, setOrgForm] = useState({ name: '', type: 'temple', place: '' });
  const [comForm, setComForm] = useState({ name: '', desc: '' });
  const [progForm, setProgForm] = useState({
    name: '', year: String(new Date().getFullYear()), opening: '0', weekly: '', weeks: '52',
  });

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

  const saveOrg = async () => {
    setBusy(true); setErr(null);
    try {
      await supabase.from('organizations').insert({
        name: orgForm.name.trim(), org_type: orgForm.type,
        place: orgForm.place.trim() || null, created_by: session!.user.id,
      }).throwOnError();
      setShowOrg(false); setOrgForm({ name: '', type: 'temple', place: '' });
      await load();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

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
    setBusy(true); setErr(null);
    try {
      await supabase.from('programs').insert({
        committee_id: showProgram!.id,
        name: progForm.name.trim() || showProgram!.name,
        year: parseInt(progForm.year),
        opening_balance: parseFloat(progForm.opening) || 0,
        weekly_amount: progForm.weekly ? parseFloat(progForm.weekly) : null,
        total_weeks: parseInt(progForm.weeks) || 52,
        created_by: session!.user.id,
      }).throwOnError();
      setShowProgram(null);
      setProgForm({ name: '', year: String(new Date().getFullYear()), opening: '0', weekly: '', weeks: '52' });
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">⚙️ {t('setup.title')}</h1>
        <button className="btn-primary text-sm" onClick={() => setShowOrg(true)}>
          ＋ {t('setup.newOrganization')}
        </button>
      </div>
      <ErrorNote msg={err} />

      {orgs.map((org) => (
        <div key={org.id} className="card mb-4">
          <div className="flex justify-between items-center mb-2">
            <div>
              <div className="font-bold">{org.name}</div>
              <div className="text-xs text-stone-500">{t(`setup.${org.org_type === 'other' ? 'otherType' : org.org_type}`)}{org.place ? ` · ${org.place}` : ''}</div>
            </div>
            {(isPadmin || org.created_by === session!.user.id) && (
              <button className="btn-secondary text-xs" onClick={() => setShowCommittee(org.id)}>
                ＋ {t('setup.newCommittee')}
              </button>
            )}
          </div>
          {committees.filter((c) => c.organization_id === org.id).map((c) => (
            <div key={c.id} className="border-t border-stone-100 pt-2 mt-2">
              <div className="flex justify-between items-center">
                <div className="font-semibold text-sm">🏛 {c.name}</div>
                {(isPadmin || org.created_by === session!.user.id) && (
                  <button className="text-brand-600 text-xs font-semibold" onClick={() => setShowProgram(c)}>
                    ＋ {t('setup.newProgram')}
                  </button>
                )}
              </div>
              {programs.filter((p) => p.committee_id === c.id).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-1.5 pl-4 text-sm">
                  <span>
                    {p.name} <b>{p.year}</b> <StatusChip status={p.status} />
                    {current?.program_id === p.id && <span className="chip-blue ml-1">✓</span>}
                  </span>
                  {canFreeze(p) && (
                    p.status === 'active'
                      ? <button className="text-stone-500 text-xs underline" onClick={() => freeze(p)}>❄️ {t('setup.freeze')}</button>
                      : isPadmin && <button className="text-stone-500 text-xs underline" onClick={() => unfreeze(p)}>{t('admin.unfreeze')}</button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {showOrg && (
        <Modal title={t('setup.newOrganization')} onClose={() => setShowOrg(false)}>
          <Field label={t('common.name')}>
            <input value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} />
          </Field>
          <Field label={t('setup.orgType')}>
            <select value={orgForm.type} onChange={(e) => setOrgForm({ ...orgForm, type: e.target.value })}>
              {ORG_TYPES.map((x) => (
                <option key={x} value={x}>{t(`setup.${x === 'other' ? 'otherType' : x}`)}</option>
              ))}
            </select>
          </Field>
          <Field label={`${t('common.name')} / Place`}>
            <input value={orgForm.place} onChange={(e) => setOrgForm({ ...orgForm, place: e.target.value })} />
          </Field>
          <button className="btn-primary w-full" disabled={busy || !orgForm.name.trim()} onClick={saveOrg}>
            {t('common.save')}
          </button>
        </Modal>
      )}

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
          <button className="btn-primary w-full" disabled={busy} onClick={saveProgram}>
            {t('common.save')}
          </button>
        </Modal>
      )}
    </div>
  );
}
