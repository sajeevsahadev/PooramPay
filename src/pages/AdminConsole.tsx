import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { supabase, fmtINR } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Empty, ErrorNote, friendlyError, StatusChip, Modal, Field } from '../components/ui';
import type { Committee, Organization, Program } from '../lib/types';

/** Platform administrator: sees every organization, manages admin list, can unfreeze. */
export default function AdminConsole() {
  const { t } = useTranslation();
  const { isPadmin, refresh } = useApp();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [finance, setFinance] = useState<Map<string, { income_total: number; expense_total: number }>>(new Map());
  const [admins, setAdmins] = useState<string[]>([]);
  const [newAdmin, setNewAdmin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [delOrg, setDelOrg] = useState<Organization | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [o, c, p, f, a] = await Promise.all([
      supabase.from('organizations').select('*').order('created_at'),
      supabase.from('committees').select('*'),
      supabase.from('programs').select('*').order('year', { ascending: false }),
      supabase.from('v_program_finance').select('program_id, income_total, expense_total'),
      supabase.from('platform_admin_emails').select('email'),
    ]);
    setOrgs((o.data ?? []) as Organization[]);
    setCommittees((c.data ?? []) as Committee[]);
    setPrograms((p.data ?? []) as Program[]);
    setFinance(new Map(((f.data ?? []) as { program_id: string; income_total: number; expense_total: number }[])
      .map((x) => [x.program_id, x])));
    setAdmins(((a.data ?? []) as { email: string }[]).map((x) => x.email));
  };
  useEffect(() => { if (isPadmin) load(); }, [isPadmin]);

  if (!isPadmin) return <Empty />;

  const addAdmin = async () => {
    try {
      await supabase.from('platform_admin_emails').insert({ email: newAdmin.trim().toLowerCase() }).throwOnError();
      setNewAdmin('');
      await load();
    } catch (e) { setErr(friendlyError(e)); }
  };

  const removeAdmin = async (email: string) => {
    if (admins.length <= 1) return;
    if (!window.confirm(`${t('common.delete')}: ${email}?`)) return;
    try {
      await supabase.from('platform_admin_emails').delete().eq('email', email).throwOnError();
      await load();
    } catch (e) { setErr(friendlyError(e)); }
  };

  const unfreeze = async (p: Program) => {
    try {
      await supabase.from('programs').update({ status: 'active' }).eq('id', p.id).throwOnError();
      await Promise.all([load(), refresh()]);
    } catch (e) { setErr(friendlyError(e)); }
  };

  const deleteOrg = async () => {
    if (!delOrg || confirmText.trim() !== delOrg.name) return;
    setBusy(true); setErr(null);
    try {
      await supabase.from('organizations').delete().eq('id', delOrg.id).throwOnError();
      setDelOrg(null); setConfirmText('');
      await Promise.all([load(), refresh()]);
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">🛡️ {t('admin.title')}</h1>
      <ErrorNote msg={err} />

      <Link to="/access-log" className="card mb-4 flex items-center justify-between hover:bg-brand-50">
        <span className="flex items-center gap-3">
          <span className="tile tile-violet">🛰️</span>
          <span className="font-semibold">{t('access.title')}</span>
        </span>
        <span className="text-stone-300">›</span>
      </Link>

      <div className="card mb-4">
        <div className="font-bold mb-2">{t('admin.platformAdmins')}</div>
        {admins.map((a) => (
          <div key={a} className="flex justify-between items-center py-1.5 border-b border-stone-50 last:border-0 text-sm">
            <span>{a}</span>
            {admins.length > 1 && (
              <button className="text-stone-300 hover:text-red-600" onClick={() => removeAdmin(a)}>🗑</button>
            )}
          </div>
        ))}
        <div className="flex gap-2 mt-3">
          <input type="email" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)}
            placeholder={t('admin.addAdmin')} className="flex-1" />
          <button className="btn-primary" disabled={!/\S+@\S+\.\S+/.test(newAdmin)} onClick={addAdmin}>
            {t('common.add')}
          </button>
        </div>
      </div>

      <div className="font-bold mb-2">{t('admin.allOrgs')} ({orgs.length})</div>
      {orgs.map((org) => (
        <div key={org.id} className="card mb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-bold">{org.name}</div>
              <div className="text-xs text-stone-500 mb-2">
                {t(`setup.${org.org_type === 'other' ? 'otherType' : org.org_type}`)}{org.place ? ` · ${org.place}` : ''}
              </div>
            </div>
            <button className="btn-secondary text-xs px-2.5 py-1.5 text-red-600 shrink-0"
              title={t('admin.deleteOrg')} onClick={() => { setDelOrg(org); setConfirmText(''); }}>
              🗑
            </button>
          </div>
          {committees.filter((c) => c.organization_id === org.id).map((c) => (
            <div key={c.id} className="pl-2 border-l-2 border-stone-100 mb-1">
              <div className="text-sm font-semibold">{c.name}</div>
              {programs.filter((p) => p.committee_id === c.id).map((p) => {
                const f = finance.get(p.id);
                return (
                  <div key={p.id} className="flex justify-between items-center text-sm py-1 pl-2">
                    <span>{p.name} {p.year} <StatusChip status={p.status} /></span>
                    <span className="text-xs text-stone-500 money">
                      +{fmtINR(f?.income_total)} / −{fmtINR(f?.expense_total)}
                      {p.status === 'frozen' && (
                        <button className="ml-2 text-brand-600 underline" onClick={() => unfreeze(p)}>
                          {t('admin.unfreeze')}
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
      {orgs.length === 0 && <Empty />}

      {delOrg && (
        <Modal title={`🗑 ${t('admin.deleteOrg')}`} onClose={() => setDelOrg(null)}>
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-3 text-sm">
            {t('admin.deleteOrgWarning')}
          </div>
          <Field label={t('admin.deleteOrgConfirm', { name: delOrg.name })}>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              placeholder={delOrg.name} autoFocus />
          </Field>
          <button className="btn-danger w-full" disabled={busy || confirmText.trim() !== delOrg.name}
            onClick={deleteOrg}>
            {t('admin.deleteOrg')}
          </button>
        </Modal>
      )}
    </div>
  );
}
