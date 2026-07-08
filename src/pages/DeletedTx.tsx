import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, fmtINR, fmtDate } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Empty, ErrorNote, friendlyError } from '../components/ui';
import { incomeTypeLabel, useUnits } from '../lib/units';
import type { Expense, IncomeEntry } from '../lib/types';

interface DelRow {
  id: string; table: 'income_entries' | 'expenses'; label: string; amount: number;
  deleted_at: string; delete_reason: string; deleted_by_name?: string;
}

/** Transparency bucket: everything ever deleted stays visible here. */
export default function DeletedTx() {
  const { t, i18n } = useTranslation();
  const { currentProgramId, isCommitteeAdmin, frozen, refreshFinance } = useApp();
  const { unit } = useUnits();
  const [rows, setRows] = useState<DelRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    if (!currentProgramId) return;
    const [i, e] = await Promise.all([
      supabase.from('income_entries').select('*').eq('program_id', currentProgramId)
        .not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('expenses').select('*').eq('program_id', currentProgramId)
        .not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    ]);
    const list: DelRow[] = [
      ...((i.data ?? []) as IncomeEntry[]).map((r) => ({
        id: r.id, table: 'income_entries' as const,
        label: `+ ${incomeTypeLabel(t, r.entry_type, unit)}${r.payer_name ? ' · ' + r.payer_name : ''}`,
        amount: r.amount, deleted_at: r.deleted_at!, delete_reason: r.delete_reason ?? '',
      })),
      ...((e.data ?? []) as Expense[]).map((r) => ({
        id: r.id, table: 'expenses' as const,
        label: `− ${r.description || r.vendor_name || t('expenses.title')}`,
        amount: r.amount, deleted_at: r.deleted_at!, delete_reason: r.delete_reason ?? '',
      })),
    ].sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
    setRows(list);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentProgramId]);

  const restore = async (r: DelRow) => {
    try {
      await supabase.rpc('restore_record', { p_table: r.table, p_id: r.id }).throwOnError();
      await load(); refreshFinance();
    } catch (e) { setErr(friendlyError(e)); }
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">🗑️ {t('audit.deletedBucket')}</h1>
      <ErrorNote msg={err} />
      {rows.length === 0 && <Empty />}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.table + r.id} className="card bg-stone-50">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="font-semibold line-through text-stone-500 truncate">{r.label}</div>
                <div className="text-xs text-stone-500 mt-1">
                  {t('audit.deleteReason')}: <b>{r.delete_reason}</b> · {fmtDate(r.deleted_at, i18n.language)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="money font-bold text-stone-400">{fmtINR(r.amount)}</div>
                {isCommitteeAdmin && !frozen && (
                  <button className="text-brand-600 text-xs underline mt-1" onClick={() => restore(r)}>
                    ♻️ {t('common.confirm')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
