import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, fmtINR, fmtDate } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { ErrorNote, friendlyError, Modal, Field, Empty } from '../components/ui';
import { incomeTypeLabel, useUnits } from '../lib/units';
import type { Expense, ExpenseHead, IncomeEntry } from '../lib/types';

interface Row {
  id: string; table: 'income_entries' | 'expenses'; kind: 'in' | 'out';
  label: string; sub: string; amount: number; date: string; mode: string;
}

export default function Transactions() {
  const { t, i18n } = useTranslation();
  const { currentProgramId, isCommitteeAdmin, frozen, refreshFinance } = useApp();
  const { unit } = useUnits();
  const [income, setIncome] = useState<IncomeEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [heads, setHeads] = useState<ExpenseHead[]>([]);
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const PAGE = 200;

  // Paginated: fetches `pages` * PAGE newest rows of each ledger. Search and
  // filters apply to loaded rows; older history loads on demand.
  const load = async (pageCount = pages) => {
    if (!currentProgramId) return;
    const to = pageCount * PAGE - 1;
    const [i, e, h] = await Promise.all([
      supabase.from('income_entries').select('*').eq('program_id', currentProgramId)
        .is('deleted_at', null).order('created_at', { ascending: false }).range(0, to),
      supabase.from('expenses').select('*').eq('program_id', currentProgramId)
        .is('deleted_at', null).eq('status', 'paid').order('created_at', { ascending: false }).range(0, to),
      supabase.from('expense_heads').select('*').eq('program_id', currentProgramId),
    ]);
    setIncome((i.data ?? []) as IncomeEntry[]);
    setExpenses((e.data ?? []) as Expense[]);
    setHeads((h.data ?? []) as ExpenseHead[]);
    setHasMore((i.data?.length ?? 0) === to + 1 || (e.data?.length ?? 0) === to + 1);
  };
  useEffect(() => { setPages(1); load(1); /* eslint-disable-next-line */ }, [currentProgramId]);

  const rows: Row[] = useMemo(() => {
    const headName = (id: string) => heads.find((x) => x.id === id)?.name ?? '';
    const list: Row[] = [
      ...income.map((r) => ({
        id: r.id, table: 'income_entries' as const, kind: 'in' as const,
        label: `${incomeTypeLabel(t, r.entry_type, unit)}${r.payer_name ? ' · ' + r.payer_name : ''}`,
        sub: `#${r.receipt_no ?? ''}`,
        amount: r.amount, date: r.created_at, mode: r.mode,
      })),
      ...expenses.map((r) => ({
        id: r.id, table: 'expenses' as const, kind: 'out' as const,
        label: r.description || r.vendor_name || headName(r.head_id),
        sub: headName(r.head_id),
        amount: r.amount, date: r.created_at, mode: r.mode,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    return list.filter((r) =>
      (filter === 'all' || r.kind === filter) &&
      (!q || (r.label + r.sub).toLowerCase().includes(q.toLowerCase())),
    );
  }, [income, expenses, heads, filter, q, t]);

  const doDelete = async () => {
    if (!deleting || !reason.trim()) return;
    setBusy(true); setErr(null);
    try {
      await supabase.rpc('soft_delete_record', {
        p_table: deleting.table, p_id: deleting.id, p_reason: reason.trim(),
      }).throwOnError();
      setDeleting(null); setReason('');
      await load(); refreshFinance();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-3">📒 {t('nav.transactions')}</h1>
      <ErrorNote msg={err} />
      <div className="flex gap-2 mb-3">
        <input placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} className="flex-1" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="w-32">
          <option value="all">{t('common.all')}</option>
          <option value="in">{t('reports.inflow')}</option>
          <option value="out">{t('reports.outflow')}</option>
        </select>
      </div>

      {rows.length === 0 && <Empty />}
      <div className="card p-0 overflow-hidden">
        {rows.map((r) => (
          <div key={r.table + r.id} className="px-4 py-2.5 flex items-center justify-between border-b border-stone-50 last:border-0 text-sm gap-2">
            <div className="min-w-0">
              <div className="truncate">{r.label}</div>
              <div className="text-xs text-stone-400">
                {r.sub} · {t(`collect.${r.mode}`)} · {fmtDate(r.date, i18n.language)}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`money font-semibold ${r.kind === 'in' ? 'text-green-700' : 'text-red-700'}`}>
                {r.kind === 'in' ? '+' : '−'} {fmtINR(r.amount)}
              </span>
              {isCommitteeAdmin && !frozen && (
                <button className="text-stone-300 hover:text-red-600 px-1" title={t('common.delete')}
                  onClick={() => setDeleting(r)}>🗑</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button className="btn-secondary w-full mt-3"
          onClick={() => { const n = pages + 1; setPages(n); load(n); }}>
          ↓ {t('common.view')}
        </button>
      )}

      {deleting && (
        <Modal title={t('common.delete')} onClose={() => setDeleting(null)}>
          <p className="text-sm text-stone-600 mb-3">{t('audit.deleteWarning')}</p>
          <p className="text-sm mb-3">{deleting.label} · <b className="money">{fmtINR(deleting.amount)}</b></p>
          <Field label={t('audit.deleteReason')}>
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <button className="btn-danger w-full" disabled={busy || !reason.trim()} onClick={doDelete}>
            {t('common.delete')}
          </button>
        </Modal>
      )}
    </div>
  );
}
