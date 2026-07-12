import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Field, ErrorNote, friendlyError } from '../components/ui';
import { COUNTRIES, statesOf, districtsOf } from '../lib/geo';
import { TIERS, type CommitteeMember, type CommitteePosition, type Tier } from '../lib/types';

const ORG_TYPES = ['temple', 'church', 'mosque', 'college', 'cultural', 'club', 'association', 'political', 'other'];
const UNIT_LABELS = ['house', 'member', 'family', 'shop', 'unit'] as const;
const DEFAULT_UNIT: Record<string, string> = {
  temple: 'house', church: 'house', mosque: 'house', association: 'unit',
  college: 'member', cultural: 'member', club: 'member', political: 'member', other: 'house',
};

const STEPS = 5;

/**
 * Full-screen guided wizard: Organization → Committee → Members → Program → Done.
 * Each step persists as it completes, so a half-finished setup can be resumed
 * later from the Setup page.
 */
export default function SetupWizard() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { session, refresh, setCurrentProgramId } = useApp();
  const year = new Date().getFullYear();

  const [step, setStep] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // persisted ids as we advance
  const [org, setOrg] = useState<{ id: string; name: string; type: string } | null>(null);
  const [committee, setCommittee] = useState<{ id: string; name: string } | null>(null);
  const [positions, setPositions] = useState<CommitteePosition[]>([]);
  const [members, setMembers] = useState<CommitteeMember[]>([]);
  const [program, setProgram] = useState<{ id: string; name: string } | null>(null);

  // form state
  const [orgForm, setOrgForm] = useState({
    name: '', type: 'cultural', country: 'India', state: 'Kerala', district: 'Thrissur', place: '',
  });
  const [comForm, setComForm] = useState({ name: '', desc: '' });
  const [progForm, setProgForm] = useState({
    name: '', year: String(year), opening: '0', weekly: '', weeks: '52', unitLabel: 'house',
  });

  // ---- step 1: organization ----
  const createOrg = async () => {
    setBusy(true); setErr(null);
    try {
      const { data } = await supabase.from('organizations').insert({
        name: orgForm.name.trim(), org_type: orgForm.type,
        country: orgForm.country.trim() || null, state: orgForm.state.trim() || null,
        district: orgForm.district.trim() || null, place: orgForm.place.trim() || null,
        created_by: session!.user.id,
      }).select('id').single().throwOnError();
      const id = (data as { id: string }).id;
      setOrg({ id, name: orgForm.name.trim(), type: orgForm.type });
      setComForm({ name: `${orgForm.name.trim()} Committee ${year}`, desc: '' });
      setProgForm((f) => ({ ...f, unitLabel: DEFAULT_UNIT[orgForm.type] ?? 'house' }));
      setStep(2);
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  // ---- step 2: committee ----
  const loadCommittee = async (committeeId: string) => {
    const [{ data: pos }, { data: mem }] = await Promise.all([
      supabase.from('committee_positions').select('*').eq('committee_id', committeeId).order('sort_order'),
      supabase.from('committee_members').select('*, profiles(nickname, full_name)')
        .eq('committee_id', committeeId).order('created_at'),
    ]);
    setPositions((pos ?? []) as CommitteePosition[]);
    setMembers((mem ?? []) as CommitteeMember[]);
  };

  const createCommittee = async () => {
    setBusy(true); setErr(null);
    try {
      const { data } = await supabase.from('committees').insert({
        organization_id: org!.id, name: comForm.name.trim(),
        description: comForm.desc.trim() || null, created_by: session!.user.id,
      }).select('id').single().throwOnError();
      const id = (data as { id: string }).id;
      setCommittee({ id, name: comForm.name.trim() });
      await loadCommittee(id);
      setStep(3);
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  // ---- step 4: program ----
  const createProgram = async () => {
    setBusy(true); setErr(null);
    try {
      const { data } = await supabase.from('programs').insert({
        committee_id: committee!.id,
        name: progForm.name.trim() || committee!.name,
        year: parseInt(progForm.year),
        opening_balance: parseFloat(progForm.opening) || 0,
        weekly_amount: progForm.weekly ? parseFloat(progForm.weekly) : null,
        total_weeks: parseInt(progForm.weeks) || 52,
        unit_label: progForm.unitLabel,
        created_by: session!.user.id,
      }).select('id').single().throwOnError();
      const id = (data as { id: string }).id;
      setProgram({ id, name: progForm.name.trim() || committee!.name });
      await refresh();
      setStep(5);
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const finish = () => {
    if (program) setCurrentProgramId(program.id);
    nav('/');
  };

  return (
    <div className="min-h-screen bg-stone-100">
      <div className="max-w-xl mx-auto p-4">
        <div className="flex items-center justify-between mb-1">
          <button className="text-stone-400 text-sm" onClick={() => nav('/setup')}>✕</button>
          <span className="text-xs text-stone-500">{t('wizard.step', { n: step, total: STEPS })}</span>
        </div>
        <div className="flex gap-1 mb-5">
          {Array.from({ length: STEPS }, (_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-brand-600' : 'bg-stone-200'}`} />
          ))}
        </div>
        <ErrorNote msg={err} />

        {step === 1 && (
          <div className="card">
            <h1 className="text-lg font-bold mb-1">🏢 {t('wizard.newOrgTitle')}</h1>
            <p className="text-sm text-stone-500 mb-4">{t('wizard.introOrg')}</p>
            <Field label={t('setup.orgName')}>
              <input value={orgForm.name} autoFocus
                onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} placeholder="Rock Star" />
            </Field>
            <Field label={t('setup.orgType')}>
              <select value={orgForm.type} onChange={(e) => setOrgForm({ ...orgForm, type: e.target.value })}>
                {ORG_TYPES.map((x) => <option key={x} value={x}>{t(`setup.${x === 'other' ? 'otherType' : x}`)}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('setup.country')}>
                <select value={orgForm.country} onChange={(e) => {
                  const country = e.target.value; const state = statesOf(country)[0] ?? '';
                  setOrgForm({ ...orgForm, country, state, district: districtsOf(state)[0] ?? '' });
                }}>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label={t('setup.state')}>
                <select value={orgForm.state} onChange={(e) => {
                  const state = e.target.value;
                  setOrgForm({ ...orgForm, state, district: districtsOf(state)[0] ?? '' });
                }}>
                  {statesOf(orgForm.country).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('setup.district')}>
                <select value={orgForm.district} onChange={(e) => setOrgForm({ ...orgForm, district: e.target.value })}>
                  {districtsOf(orgForm.state).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label={t('setup.place')}>
                <input value={orgForm.place} onChange={(e) => setOrgForm({ ...orgForm, place: e.target.value })} />
              </Field>
            </div>
            <button className="btn-primary w-full" disabled={busy || !orgForm.name.trim()} onClick={createOrg}>
              {t('wizard.createOrgContinue')}
            </button>
          </div>
        )}

        {step === 2 && org && (
          <div className="card">
            <h1 className="text-lg font-bold mb-1">🏛 {t('wizard.committeeTitle')}</h1>
            <p className="text-sm text-stone-500 mb-4">{t('wizard.introCommittee', { org: org.name })}</p>
            <Field label={t('common.name')} hint={t('wizard.committeeNameHint', { year })}>
              <input value={comForm.name} autoFocus
                onChange={(e) => setComForm({ ...comForm, name: e.target.value })} />
            </Field>
            <Field label={`${t('common.notes')} (${t('common.optional')})`}>
              <input value={comForm.desc} onChange={(e) => setComForm({ ...comForm, desc: e.target.value })} />
            </Field>
            <button className="btn-primary w-full" disabled={busy || !comForm.name.trim()} onClick={createCommittee}>
              {t('wizard.createCommitteeContinue')}
            </button>
          </div>
        )}

        {step === 3 && committee && (
          <MembersStep
            committeeId={committee.id} positions={positions} members={members}
            myUserId={session!.user.id}
            reload={() => loadCommittee(committee.id)}
            onContinue={() => setStep(4)}
            setErr={setErr}
          />
        )}

        {step === 4 && committee && (
          <div className="card">
            <h1 className="text-lg font-bold mb-1">📅 {t('wizard.programTitle')}</h1>
            <p className="text-sm text-stone-500 mb-4">{t('wizard.introProgram')}</p>
            <Field label={t('setup.programName')}>
              <input value={progForm.name} onChange={(e) => setProgForm({ ...progForm, name: e.target.value })}
                placeholder={`${committee.name}`} />
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
                  <button key={u} type="button" onClick={() => setProgForm({ ...progForm, unitLabel: u })}
                    className={`btn text-xs px-1 ${progForm.unitLabel === u
                      ? 'bg-brand-700 text-white' : 'bg-surface border border-stone-300'}`}>
                    {t(`units.${u}.many`)}
                  </button>
                ))}
              </div>
            </Field>
            <button className="btn-primary w-full" disabled={busy} onClick={createProgram}>
              {t('wizard.createProgramFinish')}
            </button>
          </div>
        )}

        {step === 5 && (
          <div className="card text-center">
            <div className="text-5xl mb-2">🎉</div>
            <h1 className="text-lg font-bold mb-2">{t('wizard.doneTitle')}</h1>
            <p className="text-sm text-stone-500 mb-5">
              {t('wizard.doneSummary', {
                org: org?.name, committee: committee?.name,
                members: members.length, program: program?.name,
              })}
            </p>
            <button className="btn-primary w-full" onClick={finish}>{t('wizard.goToDashboard')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Step 3: add committee members with a position + visibility. */
function MembersStep({
  committeeId, positions, members, myUserId, reload, onContinue, setErr,
}: {
  committeeId: string;
  positions: CommitteePosition[];
  members: CommitteeMember[];
  myUserId: string;
  reload: () => Promise<void>;
  onContinue: () => void;
  setErr: (m: string | null) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ email: '', name: '', positionId: '', viewAll: false });
  const [busy, setBusy] = useState(false);
  const [showAddPos, setShowAddPos] = useState(false);
  const [posForm, setPosForm] = useState({ label: '', tier: 'own' as Tier });

  const selectedPos = positions.find((p) => p.id === form.positionId) ?? null;

  const add = async () => {
    setBusy(true); setErr(null);
    try {
      await supabase.from('committee_members').insert({
        committee_id: committeeId,
        email: form.email.trim().toLowerCase(),
        display_name: form.name.trim() || null,
        position_id: form.positionId || null,
        view_all_money: selectedPos?.tier === 'own' ? form.viewAll : false,
      }).throwOnError();
      setForm({ email: '', name: '', positionId: '', viewAll: false });
      await reload();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const addPosition = async () => {
    setBusy(true); setErr(null);
    try {
      const maxSort = positions.reduce((mx, p) => Math.max(mx, p.sort_order), 0);
      const { data } = await supabase.from('committee_positions').insert({
        committee_id: committeeId, label: posForm.label.trim(), tier: posForm.tier, sort_order: maxSort + 1,
      }).select('id').single().throwOnError();
      setShowAddPos(false); setPosForm({ label: '', tier: 'own' });
      await reload();
      if (data) setForm((f) => ({ ...f, positionId: (data as { id: string }).id, viewAll: false }));
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  return (
    <div className="card">
      <h1 className="text-lg font-bold mb-1">👥 {t('wizard.membersTitle')}</h1>
      <p className="text-sm text-stone-500 mb-4">{t('wizard.introMembers')}</p>

      <div className="space-y-1.5 mb-4">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between text-sm border border-stone-100 rounded-lg px-3 py-2">
            <span className="truncate">
              {m.display_name || m.email.split('@')[0]}
              {m.profile_id === myUserId && <span className="text-stone-400"> ({t('wizard.you')})</span>}
            </span>
            <span className="text-xs text-stone-500 shrink-0">{m.position_label || t(`tiers.${m.tier}.label`)}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-stone-100 pt-3">
        <Field label={t('setup.memberEmail')}>
          <input type="email" value={form.email} placeholder="name@gmail.com"
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t('common.name')} (${t('common.optional')})`}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t('setup.position')}>
            <select value={form.positionId}
              onChange={(e) => setForm({ ...form, positionId: e.target.value, viewAll: false })}>
              <option value="" disabled>—</option>
              {positions.map((p) => <option key={p.id} value={p.id}>{p.label} · {t(`tiers.${p.tier}.label`)}</option>)}
            </select>
          </Field>
        </div>
        <button type="button" className="text-brand-600 text-sm font-semibold"
          onClick={() => { setPosForm({ label: '', tier: 'own' }); setShowAddPos(true); }}>
          ＋ {t('setup.addPosition')}
        </button>
        {selectedPos && <p className="text-xs text-stone-500 mt-1">{t(`tiers.${selectedPos.tier}.hint`)}</p>}
        {selectedPos?.tier === 'own' && (
          <label className="flex items-center gap-2 mt-2 text-sm">
            <input type="checkbox" className="w-5 h-5 min-h-0" checked={form.viewAll}
              onChange={(e) => setForm({ ...form, viewAll: e.target.checked })} />
            {t('setup.seeAllMoney')}
          </label>
        )}
        <button className="btn-secondary w-full mt-3"
          disabled={busy || !/\S+@\S+\.\S+/.test(form.email) || !form.positionId} onClick={add}>
          ＋ {t('setup.addMember')}
        </button>
      </div>

      {showAddPos && (
        <div className="mt-3 border border-brand-100 bg-brand-50 rounded-lg p-3">
          <Field label={t('setup.positionLabel')}>
            <input value={posForm.label} autoFocus placeholder="Magazine Editor"
              onChange={(e) => setPosForm({ ...posForm, label: e.target.value })} />
          </Field>
          <div className="space-y-1.5 mb-3">
            {TIERS.map((tier) => (
              <button key={tier} type="button" onClick={() => setPosForm({ ...posForm, tier })}
                className={`w-full rounded-lg border p-2 text-left bg-white ${
                  posForm.tier === tier ? 'border-brand-600' : 'border-stone-200'}`}>
                <div className="text-sm font-medium">{t(`tiers.${tier}.label`)}</div>
                <div className="text-xs text-stone-500">{t(`tiers.${tier}.hint`)}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => setShowAddPos(false)}>{t('common.cancel')}</button>
            <button className="btn-primary flex-1" disabled={busy || !posForm.label.trim()} onClick={addPosition}>
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      <button className="btn-primary w-full mt-5" onClick={onContinue}>{t('wizard.continue')}</button>
    </div>
  );
}
