import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Empty, OrgAvatar, friendlyError, ErrorNote } from '../components/ui';

interface DirOrg {
  id: string; name: string; org_type: string;
  place: string | null; district: string | null; state: string | null;
  country: string | null; logo_url: string | null;
  gps_lat: number | null; gps_lng: number | null;
}
type Status = 'pending' | 'approved' | 'rejected' | 'member';

function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Find committees near you and request to join one. */
export default function Nearby() {
  const { t } = useTranslation();
  const { programOptions } = useApp();
  const [orgs, setOrgs] = useState<DirOrg[]>([]);
  const [status, setStatus] = useState<Map<string, Status>>(new Map());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const joinedOrgIds = useMemo(
    () => new Set(programOptions.map((p) => p.committees?.organizations?.id).filter(Boolean) as string[]),
    [programOptions],
  );

  const load = async () => {
    const [dir, reqs] = await Promise.all([
      supabase.rpc('public_org_directory'),
      supabase.rpc('my_join_requests'),
    ]);
    setOrgs((dir.data ?? []) as DirOrg[]);
    const m = new Map<string, Status>();
    for (const r of (reqs.data ?? []) as { org_id: string; status: Status }[]) {
      // keep the most relevant status (approved/pending win over rejected)
      if (!m.has(r.org_id) || r.status !== 'rejected') m.set(r.org_id, r.status);
    }
    setStatus(m);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const statusOf = (id: string): Status | null =>
    joinedOrgIds.has(id) ? 'member' : status.get(id) ?? null;

  const findNearMe = () => {
    if (!navigator.geolocation) { setErr(t('nearby.locationOff')); return; }
    setLocating(true); setErr(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false); },
      () => { setErr(t('nearby.locationOff')); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const join = async (id: string) => {
    setBusyId(id); setErr(null); setMsg(null);
    try {
      const { data } = await supabase.rpc('request_to_join', { p_org: id }).throwOnError();
      setStatus((m) => new Map(m).set(id, (data as Status) ?? 'pending'));
      setMsg(t('nearby.requestSent'));
    } catch (e) { setErr(friendlyError(e)); }
    setBusyId(null);
  };

  // filter + (optionally) sort by distance
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = orgs.filter((o) => !s ||
      `${o.name} ${o.place ?? ''} ${o.district ?? ''} ${o.state ?? ''}`.toLowerCase().includes(s));
    if (pos) {
      out = [...out].map((o) => ({
        o, d: o.gps_lat != null && o.gps_lng != null ? distKm(pos, { lat: o.gps_lat, lng: o.gps_lng }) : Infinity,
      })).sort((a, b) => a.d - b.d).map((x) => ({ ...x.o, _d: x.d } as DirOrg & { _d: number }));
    }
    return out as (DirOrg & { _d?: number })[];
  }, [orgs, q, pos]);

  // group by district only when not location-sorted
  const groups = useMemo(() => {
    if (pos) return null;
    const m = new Map<string, DirOrg[]>();
    for (const o of list) {
      const key = o.district || o.state || o.country || '—';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(o);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [list, pos]);

  const Row = (o: DirOrg & { _d?: number }) => {
    const st = statusOf(o.id);
    const place = [o.place, o.district, o.state].filter(Boolean).join(', ');
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-50 last:border-0">
        <OrgAvatar url={o.logo_url} name={o.name} className="w-10 h-10" />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{o.name}</div>
          <div className="text-xs text-stone-500 truncate">
            {t(`setup.${o.org_type === 'other' ? 'otherType' : o.org_type}`)}
            {place && ` · ${place}`}
            {o._d != null && o._d !== Infinity && ` · ${t('nearby.away', { km: o._d.toFixed(o._d < 10 ? 1 : 0) })}`}
          </div>
        </div>
        {st === 'member' || st === 'approved' ? (
          <span className="chip-blue shrink-0">✓ {t(st === 'member' ? 'nearby.member' : 'nearby.approved')}</span>
        ) : st === 'pending' ? (
          <span className="chip-amber shrink-0">⏳ {t('nearby.requested')}</span>
        ) : (
          <button className="btn-primary text-xs px-3 py-1.5 shrink-0" disabled={busyId === o.id}
            onClick={() => join(o.id)}>{t('nearby.join')}</button>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Link to="/" className="text-brand-700 text-lg">←</Link>
        <h1 className="text-xl font-bold">📍 {t('demo.directoryTitle')}</h1>
      </div>
      <p className="text-sm text-stone-500 mb-3">{t('nearby.joinHint')}</p>
      <ErrorNote msg={err} />
      {msg && <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-2 mb-3 text-sm">✓ {msg}</div>}

      <div className="flex gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={`🔍 ${t('demo.searchPlaceholder')}`} className="flex-1" />
        <button className={`btn shrink-0 px-3 ${pos ? 'bg-brand-700 text-white' : 'bg-surface border border-stone-300'}`}
          disabled={locating} onClick={findNearMe}>
          {locating ? `⏳ ${t('nearby.locating')}` : `📍 ${t('nearby.findNear')}`}
        </button>
      </div>

      {loading ? (
        <p className="text-stone-400">{t('common.loading')}</p>
      ) : list.length === 0 ? (
        <Empty label={t('demo.noClubs')} />
      ) : pos ? (
        <>
          <div className="text-sm font-semibold text-stone-500 mb-2">{t('nearby.nearest')}</div>
          <div className="card p-0 overflow-hidden">{list.map((o) => <Row key={o.id} {...o} />)}</div>
        </>
      ) : (
        groups!.map(([district, l]) => (
          <div key={district} className="mb-4">
            <div className="text-sm font-semibold text-stone-500 mb-2">{district} ({l.length})</div>
            <div className="card p-0 overflow-hidden">{l.map((o) => <Row key={o.id} {...o} />)}</div>
          </div>
        ))
      )}
    </div>
  );
}
