import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { Empty, OrgAvatar } from '../components/ui';

interface DirOrg {
  id: string; name: string; org_type: string;
  place: string | null; district: string | null; state: string | null;
  country: string | null; logo_url: string | null;
}

/** Public directory of committees using PooramPay — browse/search by area. */
export default function Nearby() {
  const { t } = useTranslation();
  const [orgs, setOrgs] = useState<DirOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    supabase.rpc('public_org_directory').then(({ data }) => {
      setOrgs((data ?? []) as DirOrg[]); setLoading(false);
    });
  }, []);

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? orgs.filter((o) => `${o.name} ${o.place ?? ''} ${o.district ?? ''} ${o.state ?? ''}`.toLowerCase().includes(s))
      : orgs;
    const m = new Map<string, DirOrg[]>();
    for (const o of list) {
      const key = o.district || o.state || o.country || '—';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(o);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [orgs, q]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Link to="/" className="text-brand-700 text-lg">←</Link>
        <h1 className="text-xl font-bold">📍 {t('demo.directoryTitle')}</h1>
      </div>
      <p className="text-sm text-stone-500 mb-3">{t('demo.directorySubtitle')}</p>

      <input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={`🔍 ${t('demo.searchPlaceholder')}`} className="mb-4" />

      {loading ? (
        <p className="text-stone-400">{t('common.loading')}</p>
      ) : groups.length === 0 ? (
        <Empty label={t('demo.noClubs')} />
      ) : (
        groups.map(([district, list]) => (
          <div key={district} className="mb-4">
            <div className="text-sm font-semibold text-stone-500 mb-2">{district} ({list.length})</div>
            <div className="card p-0 overflow-hidden">
              {list.map((o) => (
                <div key={o.id} className="flex items-center gap-3 px-4 py-3 border-b border-stone-50 last:border-0">
                  <OrgAvatar url={o.logo_url} name={o.name} className="w-10 h-10" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{o.name}</div>
                    <div className="text-xs text-stone-500 truncate">
                      {t(`setup.${o.org_type === 'other' ? 'otherType' : o.org_type}`)}
                      {[o.place, o.district, o.state].filter(Boolean).length > 0 &&
                        ` · ${[o.place, o.district, o.state].filter(Boolean).join(', ')}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
