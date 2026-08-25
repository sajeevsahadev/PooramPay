import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { useUnits } from '../lib/units';
import { ErrorNote, friendlyError, Empty } from '../components/ui';
import HouseRow from '../components/HouseRow';
import HouseModal from '../components/HouseModal';
import type { Area, House } from '../lib/types';

type Sort = 'name' | 'nameDesc' | 'unpaid' | 'sub' | 'recent';
const PAGE = 100;

/**
 * One area's register on its own page — search, sort, filter and paging, built to
 * stay fast with 1000+ members. Add/edit reuse the shared HouseModal.
 */
export default function AreaDetail() {
  const { id = '' } = useParams();
  const isNone = id === 'none';
  const { t } = useTranslation();
  const { currentProgramId, currentProgram, isCommitteeAdmin, frozen, can } = useApp();
  const { unit, units } = useUnits();
  const weekly = !!currentProgram?.weekly_amount;

  const [area, setArea] = useState<Area | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [paidSet, setPaidSet] = useState<Set<string>>(new Set());
  const [avatars, setAvatars] = useState<Map<string, string>>(new Map());
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const [entry, setEntry] = useState<{ mode: 'add' | 'edit'; house?: House } | null>(null);

  // rapid add
  const [rName, setRName] = useState('');
  const [rPhone, setRPhone] = useState('');
  const [rBusy, setRBusy] = useState(false);
  const [added, setAdded] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!currentProgramId) return;
    const houseQ = supabase.from('houses').select('*').eq('program_id', currentProgramId);
    const [a, all, h, paid, av] = await Promise.all([
      isNone ? Promise.resolve({ data: null }) : supabase.from('areas').select('*').eq('id', id).maybeSingle(),
      supabase.from('areas').select('*').eq('program_id', currentProgramId).order('name'),
      (isNone ? houseQ.is('area_id', null) : houseQ.eq('area_id', id)).order('name'),
      // aggregate (index-only) instead of pulling every transaction to the client
      supabase.rpc('program_paid_houses', { p_program: currentProgramId }),
      supabase.rpc('program_member_avatars', { p_program: currentProgramId }),
    ]);
    setArea((a.data ?? null) as Area | null);
    setAreas((all.data ?? []) as Area[]);
    setHouses((h.data ?? []) as House[]);
    setPaidSet(new Set(((paid.data ?? []) as { house_id: string }[]).map((r) => r.house_id)));
    setAvatars(new Map(((av.data ?? []) as { house_id: string; avatar_url: string }[])
      .map((r) => [r.house_id, r.avatar_url])));
  };
  useEffect(() => { load(); setLimit(PAGE); /* eslint-disable-next-line */ }, [currentProgramId, id]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = houses.filter((h) => {
      if (unpaidOnly && paidSet.has(h.id)) return false;
      if (!s) return true;
      return `${h.name} ${h.owner_name ?? ''} ${h.phone ?? ''}`.toLowerCase().includes(s);
    });
    const by = {
      name: (a: House, b: House) => a.name.localeCompare(b.name),
      nameDesc: (a: House, b: House) => b.name.localeCompare(a.name),
      unpaid: (a: House, b: House) => (paidSet.has(a.id) ? 1 : 0) - (paidSet.has(b.id) ? 1 : 0) || a.name.localeCompare(b.name),
      sub: (a: House, b: House) => (b.in_subscription ? 1 : 0) - (a.in_subscription ? 1 : 0) || a.name.localeCompare(b.name),
      recent: (a: House, b: House) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
    }[sort];
    return [...out].sort(by);
  }, [houses, q, unpaidOnly, paidSet, sort]);

  const paidCount = houses.filter((h) => paidSet.has(h.id)).length;

  const rapidAdd = async () => {
    const name = rName.trim();
    if (!name || rBusy) return;
    setRBusy(true); setErr(null);
    try {
      await supabase.from('houses').insert({
        program_id: currentProgramId, area_id: isNone ? null : id, name, phone: rPhone.trim() || null,
      }).throwOnError();
      setAdded((c) => c + 1); setRName(''); setRPhone('');
      nameRef.current?.focus();
      await load();
    } catch (e) { setErr(friendlyError(e)); }
    setRBusy(false);
  };

  const canAdd = can('collect') && !frozen;
  const title = isNone ? `— ${t('setup.noArea')}` : (area?.name ?? '…');

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Link to="/areas" className="text-brand-700 text-lg">←</Link>
        <h1 className="text-xl font-bold truncate">🗺️ {title}</h1>
        {area && !area.is_active && <span className="chip-gray">{t('setup.inactive')}</span>}
      </div>
      <p className="text-sm text-stone-500 mb-3">
        {units}: {houses.length} · ✅ {paidCount}/{houses.length} {t('setup.paidLabel')}
      </p>
      <ErrorNote msg={err} />

      {/* rapid add */}
      {canAdd && (
        <div className="card mb-3">
          <div className="text-sm font-semibold mb-2">⚡ {t('setup.quickAdd')}</div>
          <form onSubmit={(e) => { e.preventDefault(); rapidAdd(); }} className="flex gap-2">
            <input ref={nameRef} value={rName} onChange={(e) => setRName(e.target.value)}
              placeholder={t('collect.unitName', { unit })} className="flex-[2]" />
            <input value={rPhone} onChange={(e) => setRPhone(e.target.value)}
              type="tel" inputMode="tel" placeholder={t('common.phone')} className="flex-1" />
            <button type="submit" className="btn-primary px-4 shrink-0" disabled={rBusy || !rName.trim()}>＋</button>
          </form>
          <div className="flex items-center justify-between mt-2">
            {added > 0
              ? <span className="text-xs text-green-700 font-semibold">✓ {t('setup.addedCount', { count: added })}</span>
              : <span />}
            <button className="text-xs text-brand-700 font-semibold" onClick={() => setEntry({ mode: 'add' })}>
              {t('setup.editEntry')} ›
            </button>
          </div>
        </div>
      )}

      {/* search + sort + filter */}
      <div className="flex flex-wrap gap-2 mb-3">
        <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }}
          placeholder={`🔍 ${t('common.search')}`} className="flex-1 min-w-[160px]" />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-40">
          <option value="name">{t('sort.name')}</option>
          <option value="nameDesc">{t('sort.nameDesc')}</option>
          <option value="unpaid">{t('sort.unpaid')}</option>
          {weekly && <option value="sub">{t('sort.sub')}</option>}
          <option value="recent">{t('sort.recent')}</option>
        </select>
        <button onClick={() => { setUnpaidOnly((v) => !v); setLimit(PAGE); }}
          className={`btn text-sm px-3 whitespace-nowrap ${unpaidOnly ? 'bg-brand-700 text-white' : 'bg-surface border border-stone-300'}`}>
          ⚪ {t('setup.unpaidOnly')}
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-3 py-2 text-sm font-semibold text-stone-600 border-b border-stone-100">
          {list.length} {units}
        </div>
        {list.length === 0 && <Empty />}
        <div className="px-2">
          {list.slice(0, limit).map((h) => (
            <HouseRow key={h.id} h={h} paid={paidSet.has(h.id)} avatarUrl={avatars.get(h.id)}
              onClick={() => setEntry({ mode: 'edit', house: h })} />
          ))}
        </div>
        {list.length > limit && (
          <button className="w-full py-2.5 text-sm text-brand-700 font-semibold hover:bg-stone-50"
            onClick={() => setLimit((n) => n + PAGE)}>
            ↓ {list.length - limit} {t('common.more')}
          </button>
        )}
      </div>

      {entry && currentProgramId && (
        <HouseModal mode={entry.mode} house={entry.house} programId={currentProgramId}
          areas={areas} weekly={weekly} unit={unit} isCommitteeAdmin={isCommitteeAdmin}
          defaultAreaId={isNone ? '' : id}
          onClose={() => setEntry(null)} onSaved={load} />
      )}
    </div>
  );
}
