import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, fmtINR } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Empty, ErrorNote, friendlyError, StatusChip, Modal, Field, OrgAvatar } from '../components/ui';
import { displayName, type Committee, type Organization, type Program } from '../lib/types';
import AccessLog from './AccessLog';

interface Profile {
  id: string; full_name: string | null; nickname: string | null;
  phone: string | null; email: string; is_platform_admin: boolean; created_at: string;
}
interface Access {
  profile_id: string | null; device: string | null; ip: string | null;
  city: string | null; region: string | null; country: string | null; created_at: string;
}
interface CMember {
  profile_id: string | null; email: string;
  committees: { organization_id: string; organizations: { name: string } | null } | null;
}
type Tab = 'users' | 'orgs' | 'access' | 'admins';

/** Platform administrator: users, organizations, access log, admin management. */
export default function AdminConsole() {
  const { t, i18n } = useTranslation();
  const { isPadmin, refresh } = useApp();
  const [tab, setTab] = useState<Tab>('users');

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [finance, setFinance] = useState<Map<string, { income_total: number; expense_total: number }>>(new Map());
  const [admins, setAdmins] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [access, setAccess] = useState<Access[]>([]);
  const [cmembers, setCmembers] = useState<CMember[]>([]);

  const [newAdmin, setNewAdmin] = useState('');
  const [uq, setUq] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [delOrg, setDelOrg] = useState<Organization | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [o, c, p, f, a, prof, acc, cm] = await Promise.all([
      supabase.from('organizations').select('*').order('created_at'),
      supabase.from('committees').select('*'),
      supabase.from('programs').select('*').order('year', { ascending: false }),
      supabase.from('v_program_finance').select('program_id, income_total, expense_total'),
      supabase.from('platform_admin_emails').select('email'),
      supabase.from('profiles').select('id, full_name, nickname, phone, email, is_platform_admin, created_at'),
      supabase.from('access_log').select('profile_id, device, ip, city, region, country, created_at')
        .order('created_at', { ascending: false }).limit(3000),
      supabase.from('committee_members').select('profile_id, email, committees(organization_id, organizations(name))'),
    ]);
    setOrgs((o.data ?? []) as Organization[]);
    setCommittees((c.data ?? []) as Committee[]);
    setPrograms((p.data ?? []) as Program[]);
    setFinance(new Map(((f.data ?? []) as { program_id: string; income_total: number; expense_total: number }[])
      .map((x) => [x.program_id, x])));
    setAdmins(((a.data ?? []) as { email: string }[]).map((x) => x.email));
    setProfiles((prof.data ?? []) as Profile[]);
    setAccess((acc.data ?? []) as Access[]);
    setCmembers((cm.data ?? []) as unknown as CMember[]);
  };
  useEffect(() => { if (isPadmin) load(); }, [isPadmin]);

  // latest access-log entry per user
  const lastSeen = useMemo(() => {
    const m = new Map<string, Access>();
    for (const r of access) if (r.profile_id && !m.has(r.profile_id)) m.set(r.profile_id, r);
    return m;
  }, [access]);

  // clubs (org names) per user, and distinct member count per org
  const { userClubs, orgMemberCount } = useMemo(() => {
    const clubs = new Map<string, Set<string>>();
    const members = new Map<string, Set<string>>();
    for (const m of cmembers) {
      const orgId = m.committees?.organization_id;
      const orgName = m.committees?.organizations?.name;
      if (m.profile_id && orgName) {
        if (!clubs.has(m.profile_id)) clubs.set(m.profile_id, new Set());
        clubs.get(m.profile_id)!.add(orgName);
      }
      if (orgId) {
        if (!members.has(orgId)) members.set(orgId, new Set());
        members.get(orgId)!.add(m.email);
      }
    }
    return { userClubs: clubs, orgMemberCount: members };
  }, [cmembers]);

  const filteredUsers = useMemo(() => {
    const s = uq.trim().toLowerCase();
    const list = s
      ? profiles.filter((p) => `${p.full_name ?? ''} ${p.nickname ?? ''} ${p.email} ${p.phone ?? ''}`.toLowerCase().includes(s))
      : profiles;
    // newest sign-ups first
    return [...list].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  }, [profiles, uq]);

  if (!isPadmin) return <Empty />;

  const addAdmin = async () => {
    try {
      await supabase.from('platform_admin_emails').insert({ email: newAdmin.trim().toLowerCase() }).throwOnError();
      setNewAdmin(''); await load();
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

  const totalMembers = new Set(cmembers.map((m) => m.email)).size;
  const totalIncome = programs.reduce((s, p) => s + Number(finance.get(p.id)?.income_total ?? 0), 0);
  const locOf = (a?: Access) => a ? ([a.city, a.region, a.country].filter(Boolean).join(', ') || '—') : '—';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'users', label: `${t('admin.tabUsers')} (${profiles.length})` },
    { id: 'orgs', label: `${t('admin.tabOrgs')} (${orgs.length})` },
    { id: 'access', label: t('access.title') },
    { id: 'admins', label: t('admin.tabAdmins') },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold mb-3">🛡️ {t('admin.title')}</h1>
      <ErrorNote msg={err} />

      {/* summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          { label: t('admin.tabUsers'), value: profiles.length },
          { label: t('admin.tabOrgs'), value: orgs.length },
          { label: t('admin.programs'), value: programs.length },
          { label: t('admin.members'), value: totalMembers },
        ].map((s) => (
          <div key={s.label} className="card p-3 text-center">
            <div className="text-2xl font-black text-brand-800">{s.value}</div>
            <div className="text-[11px] uppercase tracking-wide text-stone-500">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="text-sm text-stone-500 mb-4">
        {t('dashboard.collected')}: <b className="money text-stone-700">{fmtINR(totalIncome)}</b>
      </div>

      {/* tabs — 2×2 on mobile, single row on wider screens (no horizontal scroll) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {tabs.map((x) => (
          <button key={x.id} onClick={() => setTab(x.id)}
            className={`px-3 py-2 rounded-lg text-sm text-center truncate ${
              tab === x.id ? 'bg-brand-700 text-white font-semibold' : 'bg-surface border border-stone-300'}`}>
            {x.label}
          </button>
        ))}
      </div>

      {/* ---- Users ---- */}
      {tab === 'users' && (
        <div>
          <input value={uq} onChange={(e) => setUq(e.target.value)}
            placeholder={`🔍 ${t('admin.searchUsers')}`} className="mb-3" />
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[960px]">
              <thead>
                <tr className="text-left text-xs text-stone-500 border-b border-stone-200">
                  <th className="p-2">{t('access.user')}</th>
                  <th className="p-2">{t('common.phone')}</th>
                  <th className="p-2">{t('access.device')}</th>
                  <th className="p-2">{t('access.location')}</th>
                  <th className="p-2">{t('admin.clubs')}</th>
                  <th className="p-2 whitespace-nowrap">{t('admin.joined')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((p) => {
                  const a = lastSeen.get(p.id);
                  const clubs = [...(userClubs.get(p.id) ?? [])];
                  return (
                    <tr key={p.id} className="border-b border-stone-50 align-top">
                      <td className="p-2">
                        <div className="font-medium flex items-center gap-1.5">
                          {displayName(p)}
                          {p.is_platform_admin && <span className="chip-blue">🛡️</span>}
                        </div>
                        <div className="text-xs text-stone-400">{p.email}</div>
                      </td>
                      <td className="p-2 whitespace-nowrap">{p.phone ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap">{a?.device ?? '—'}</td>
                      <td className="p-2">{locOf(a)}</td>
                      <td className="p-2">
                        {clubs.length ? clubs.map((c) => <span key={c} className="chip-gray mr-1 mb-1 inline-block">{c}</span>) : '—'}
                      </td>
                      <td className="p-2 whitespace-nowrap text-xs text-stone-500">
                        {p.created_at
                          ? new Date(p.created_at).toLocaleString(i18n.language === 'ml' ? 'ml-IN' : 'en-IN',
                              { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredUsers.length === 0 && <Empty />}
        </div>
      )}

      {/* ---- Organizations ---- */}
      {tab === 'orgs' && (
        <div>
          {orgs.map((org) => {
            const orgCommittees = committees.filter((c) => c.organization_id === org.id);
            const orgPrograms = programs.filter((p) => orgCommittees.some((c) => c.id === p.committee_id));
            const place = [org.place, org.district, org.state, org.country].filter(Boolean).join(', ');
            return (
              <div key={org.id} className="card mb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <OrgAvatar url={org.logo_url} name={org.name} className="w-10 h-10" />
                    <div className="min-w-0">
                      <div className="font-bold truncate">{org.name}</div>
                      <div className="text-xs text-stone-500 truncate">
                        {t(`setup.${org.org_type === 'other' ? 'otherType' : org.org_type}`)}{place ? ` · ${place}` : ''}
                      </div>
                    </div>
                  </div>
                  <button className="btn-secondary text-xs px-2.5 py-1.5 text-red-600 shrink-0"
                    title={t('admin.deleteOrg')} onClick={() => { setDelOrg(org); setConfirmText(''); }}>🗑</button>
                </div>
                <div className="flex gap-3 text-xs text-stone-500 mt-2 mb-1">
                  <span>🏛 {orgCommittees.length} {t('setup.committees')}</span>
                  <span>📅 {orgPrograms.length} {t('admin.programs')}</span>
                  <span>👥 {orgMemberCount.get(org.id)?.size ?? 0} {t('admin.members')}</span>
                </div>
                {orgCommittees.map((c) => (
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
            );
          })}
          {orgs.length === 0 && <Empty />}
        </div>
      )}

      {/* ---- Access Log ---- */}
      {tab === 'access' && <AccessLog />}

      {/* ---- Admins ---- */}
      {tab === 'admins' && (
        <div className="card">
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
      )}

      {delOrg && (
        <Modal title={`🗑 ${t('admin.deleteOrg')}`} onClose={() => setDelOrg(null)}>
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-3 text-sm">
            {t('admin.deleteOrgWarning')}
          </div>
          <Field label={t('admin.deleteOrgConfirm', { name: delOrg.name })}>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              placeholder={delOrg.name} autoFocus />
          </Field>
          <button className="btn-danger w-full" disabled={busy || confirmText.trim() !== delOrg.name} onClick={deleteOrg}>
            {t('admin.deleteOrg')}
          </button>
        </Modal>
      )}
    </div>
  );
}
