import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Empty } from '../components/ui';
import { displayName } from '../lib/types';

interface Row {
  id: number;
  email: string | null;
  ip: string | null;
  device: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  created_at: string;
  profiles: { full_name: string | null; nickname: string | null; phone: string | null } | null;
  programs: { name: string; year: number; committees: { name: string; organizations: { name: string } | null } | null } | null;
}

/** Login/session audit — platform (super) admins only. Newest first. */
export default function AccessLog() {
  const { t, i18n } = useTranslation();
  const { isPadmin } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isPadmin) { setLoading(false); return; }
    supabase.from('access_log')
      .select('id, email, ip, device, city, region, country, created_at, ' +
        'profiles(full_name, nickname, phone), ' +
        'programs(name, year, committees(name, organizations(name)))')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => { setRows((data ?? []) as unknown as Row[]); setLoading(false); });
  }, [isPadmin]);

  if (!isPadmin) return <Empty />;

  const loc = (r: Row) => [r.city, r.region, r.country].filter(Boolean).join(', ') || '—';
  const club = (r: Row) =>
    r.programs
      ? `${r.programs.committees?.organizations?.name ?? '—'} · ${r.programs.name} ${r.programs.year}`
      : '—';

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">🛰️ {t('access.title')}</h1>
      <p className="text-sm text-stone-500 mb-4">{t('access.subtitle')}</p>

      {loading ? (
        <p className="text-stone-400">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <Empty />
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left text-xs text-stone-500 border-b border-stone-200">
                <th className="p-2">{t('access.time')}</th>
                <th className="p-2">{t('access.user')}</th>
                <th className="p-2">{t('common.phone')}</th>
                <th className="p-2">{t('access.ip')}</th>
                <th className="p-2">{t('access.device')}</th>
                <th className="p-2">{t('access.location')}</th>
                <th className="p-2">{t('access.club')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-stone-50 align-top">
                  <td className="p-2 whitespace-nowrap text-stone-500">
                    {new Date(r.created_at).toLocaleString(i18n.language === 'ml' ? 'ml-IN' : 'en-IN')}
                  </td>
                  <td className="p-2">
                    <div className="font-medium">{displayName({ profiles: r.profiles, email: r.email })}</div>
                    <div className="text-xs text-stone-400">{r.email}</div>
                  </td>
                  <td className="p-2 whitespace-nowrap">{r.profiles?.phone ?? '—'}</td>
                  <td className="p-2 whitespace-nowrap font-mono text-xs">{r.ip ?? '—'}</td>
                  <td className="p-2 whitespace-nowrap">{r.device ?? '—'}</td>
                  <td className="p-2">{loc(r)}</td>
                  <td className="p-2">{club(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
