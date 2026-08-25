import { useEffect, useMemo, useState } from 'react';
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
  const [q, setQ] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!isPadmin) { setLoading(false); return; }
    supabase.from('access_log')
      .select('id, email, ip, device, city, region, country, created_at, ' +
        'profiles(full_name, nickname, phone), ' +
        'programs(name, year, committees(name, organizations(name)))')
      .order('created_at', { ascending: false })
      .limit(3000)
      .then(({ data }) => { setRows((data ?? []) as unknown as Row[]); setLoading(false); });
  }, [isPadmin]);

  const loc = (r: Row) => [r.city, r.region, r.country].filter(Boolean).join(', ') || '—';
  const club = (r: Row) =>
    r.programs
      ? `${r.programs.committees?.organizations?.name ?? '—'} · ${r.programs.name} ${r.programs.year}`
      : '—';
  const timeStr = (r: Row) => new Date(r.created_at).toLocaleString(i18n.language === 'ml' ? 'ml-IN' : 'en-IN');

  // search across every visible column
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [timeStr(r), displayName({ profiles: r.profiles, email: r.email }), r.email,
       r.profiles?.phone, r.ip, r.device, loc(r), club(r)]
        .filter(Boolean).join(' ').toLowerCase().includes(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, i18n.language]);

  // reset to first page whenever the result set changes
  useEffect(() => { setPage(0); }, [q, pageSize]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const from = total === 0 ? 0 : safePage * pageSize;
  const pageRows = filtered.slice(from, from + pageSize);

  if (!isPadmin) return <Empty />;

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">🛰️ {t('access.title')}</h1>
      <p className="text-sm text-stone-500 mb-4">{t('access.subtitle')}</p>

      <input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={`🔍 ${t('access.search')}`} className="mb-3" />

      {loading ? (
        <p className="text-stone-400">{t('common.loading')}</p>
      ) : total === 0 ? (
        <Empty />
      ) : (
        <>
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
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-b border-stone-50 align-top">
                    <td className="p-2 whitespace-nowrap text-stone-500">{timeStr(r)}</td>
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

          {/* pagination bar */}
          <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-stone-600">
            <span>{t('common.showing', { from: from + 1, to: from + pageRows.length, total })}</span>
            <label className="flex items-center gap-1.5 ml-auto">
              <span className="text-stone-500">{t('common.perPage')}</span>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
                className="border border-stone-300 rounded-lg px-2 py-1 h-auto min-h-0">
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
                disabled={safePage <= 0} onClick={() => setPage(safePage - 1)}>
                ‹ {t('common.prev')}
              </button>
              <span className="px-2 tabular-nums">{safePage + 1} / {pageCount}</span>
              <button className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
                disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                {t('common.next')} ›
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
