import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, fmtINR } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { ErrorNote, friendlyError, Empty } from '../components/ui';
import type { House, IncomeEntry } from '../lib/types';

/** Weekly subscription grid: houses × weeks, tap a cell to record payment. */
export default function CollectWeekly() {
  const { t } = useTranslation();
  const { currentProgramId, current, session, refreshFinance, frozen, can } = useApp();
  const program = current?.programs;
  const [houses, setHouses] = useState<House[]>([]);
  const [paid, setPaid] = useState<Map<string, IncomeEntry>>(new Map());
  const [err, setErr] = useState<string | null>(null);
  const [busyCell, setBusyCell] = useState<string | null>(null);

  const weeks = program?.total_weeks ?? 52;
  const weeklyAmount = Number(program?.weekly_amount ?? 0);

  const load = async () => {
    if (!currentProgramId) return;
    const [h, e] = await Promise.all([
      supabase.from('houses').select('*').eq('program_id', currentProgramId)
        .eq('in_subscription', true).order('sort_order').order('name'),
      supabase.from('income_entries').select('id, house_id, subscription_week')
        .eq('program_id', currentProgramId)
        .eq('entry_type', 'subscription').is('deleted_at', null),
    ]);
    setHouses((h.data ?? []) as House[]);
    const map = new Map<string, IncomeEntry>();
    for (const row of (e.data ?? []) as IncomeEntry[]) {
      if (row.house_id && row.subscription_week) map.set(`${row.house_id}:${row.subscription_week}`, row);
    }
    setPaid(map);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentProgramId]);

  const markPaid = async (house: House, week: number) => {
    if (frozen || !can('collect')) return;
    const key = `${house.id}:${week}`;
    if (paid.has(key) || busyCell) return;
    setBusyCell(key);
    try {
      await supabase.from('income_entries').insert({
        program_id: currentProgramId,
        entry_type: 'subscription',
        amount: weeklyAmount,
        mode: 'cash',
        house_id: house.id,
        area_id: house.area_id,
        subscription_week: week,
        payer_name: house.owner_name || house.name,
        collected_by: session!.user.id,
        created_by: session!.user.id,
      }).throwOnError();
      await load();
      refreshFinance();
    } catch (e) { setErr(friendlyError(e)); }
    setBusyCell(null);
  };

  const arrears = useMemo(() => {
    const currentWeek = Math.min(
      weeks,
      Math.max(1, Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000)),
    );
    return houses.map((h) => {
      let paidCount = 0;
      for (let w = 1; w <= weeks; w++) if (paid.has(`${h.id}:${w}`)) paidCount++;
      return { house: h, paidCount, due: Math.max(0, currentWeek - paidCount) };
    });
  }, [houses, paid, weeks]);

  if (!weeklyAmount) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">📅 {t('collect.subscription')}</h1>
        <Empty label={`${t('setup.weeklyAmount')}: — (${t('nav.setup')})`} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">📅 {t('collect.subscription')}</h1>
      <p className="text-sm text-stone-500 mb-4">
        {fmtINR(weeklyAmount)} / {t('collect.weekN', { n: '' })} × {weeks}
      </p>
      <ErrorNote msg={err} />
      {houses.length === 0 && <Empty />}

      <div className="space-y-3">
        {arrears.map(({ house, paidCount, due }) => (
          <details key={house.id} className="card p-0 overflow-hidden">
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none">
              <div>
                <div className="font-semibold">{house.name}</div>
                <div className="text-xs text-stone-500">{house.owner_name}</div>
              </div>
              <div className="text-right text-sm">
                <div className="money font-bold text-green-700">{paidCount}/{weeks}</div>
                {due > 0 && <div className="chip-red">{t('collect.arrears')}: {due}</div>}
              </div>
            </summary>
            <div className="px-3 pb-3 grid grid-cols-8 sm:grid-cols-[repeat(13,minmax(0,1fr))] gap-1">
              {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => {
                const isPaid = paid.has(`${house.id}:${w}`);
                const key = `${house.id}:${w}`;
                return (
                  <button key={w} onClick={() => markPaid(house, w)}
                    disabled={isPaid || frozen || busyCell === key}
                    title={`${t('collect.weekN', { n: w })}`}
                    className={`h-9 rounded text-[11px] font-semibold ${
                      isPaid ? 'bg-green-600 text-white'
                        : busyCell === key ? 'bg-stone-300'
                        : 'bg-stone-100 text-stone-500 hover:bg-brand-100'}`}>
                    {w}
                  </button>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
