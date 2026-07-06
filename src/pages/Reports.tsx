import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, fmtINR, fmtDate } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Empty } from '../components/ui';
import type { BudgetItem, CouponBook, Expense, ExpenseHead, IncomeEntry } from '../lib/types';

type Tab = 'pnl' | 'cashbook' | 'budget' | 'coupon';
const INCOME_TYPES = ['house', 'coupon', 'subscription', 'interest', 'ad_brochure', 'ad_stage', 'donation'];

export default function Reports() {
  const { t, i18n } = useTranslation();
  const { currentProgramId, finance, current } = useApp();
  const [tab, setTab] = useState<Tab>('pnl');
  const [income, setIncome] = useState<IncomeEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [heads, setHeads] = useState<ExpenseHead[]>([]);
  const [budget, setBudget] = useState<BudgetItem[]>([]);
  const [books, setBooks] = useState<CouponBook[]>([]);

  useEffect(() => {
    if (!currentProgramId) return;
    Promise.all([
      supabase.from('income_entries').select('*').eq('program_id', currentProgramId).is('deleted_at', null),
      supabase.from('expenses').select('*').eq('program_id', currentProgramId).is('deleted_at', null),
      supabase.from('expense_heads').select('*').eq('program_id', currentProgramId).order('sort_order'),
      supabase.from('budget_items').select('*').eq('program_id', currentProgramId),
      supabase.from('v_coupon_books').select('*').eq('program_id', currentProgramId).order('book_no'),
    ]).then(([i, e, h, b, c]) => {
      setIncome((i.data ?? []) as IncomeEntry[]);
      setExpenses((e.data ?? []) as Expense[]);
      setHeads((h.data ?? []) as ExpenseHead[]);
      setBudget((b.data ?? []) as BudgetItem[]);
      setBooks((c.data ?? []) as CouponBook[]);
    });
  }, [currentProgramId]);

  const headName = (id: string) => {
    const h = heads.find((x) => x.id === id);
    return (i18n.language === 'ml' && h?.name_ml) ? h.name_ml : h?.name ?? '';
  };
  const paidExpenses = useMemo(() => expenses.filter((e) => e.status === 'paid'), [expenses]);

  const incomeByType = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of income) m.set(r.entry_type, (m.get(r.entry_type) ?? 0) + Number(r.amount));
    return m;
  }, [income]);

  const expenseByHead = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of paidExpenses) m.set(r.head_id, (m.get(r.head_id) ?? 0) + Number(r.amount));
    return m;
  }, [paidExpenses]);

  const cashbook = useMemo(() => {
    const rows = [
      ...income.map((r) => ({
        date: r.entry_date, label: `${t('collect.' + r.entry_type)}${r.payer_name ? ' · ' + r.payer_name : ''} #${r.receipt_no ?? ''}`,
        inAmt: Number(r.amount), outAmt: 0,
      })),
      ...paidExpenses.map((r) => ({
        date: r.expense_date, label: r.description || r.vendor_name || headName(r.head_id),
        inAmt: 0, outAmt: Number(r.amount),
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    let bal = Number(current?.programs?.opening_balance ?? 0);
    return rows.map((r) => { bal += r.inAmt - r.outAmt; return { ...r, bal }; });
  }, [income, paidExpenses, current, t]); // eslint-disable-line

  const totalIncome = Number(finance?.income_total ?? 0);
  const totalExpense = Number(finance?.expense_total ?? 0);
  const opening = Number(finance?.opening_balance ?? 0);
  const retained = opening + totalIncome - totalExpense;

  const budgetRows = useMemo(() => {
    const rows: { label: string; planned: number; actual: number }[] = [];
    for (const ty of INCOME_TYPES) {
      const planned = Number(budget.find((b) => b.side === 'income' && b.income_type === ty)?.planned ?? 0);
      const actual = incomeByType.get(ty) ?? 0;
      if (planned || actual) rows.push({ label: `▲ ${t('collect.' + ty)}`, planned, actual });
    }
    for (const h of heads) {
      const planned = Number(budget.find((b) => b.side === 'expense' && b.head_id === h.id)?.planned ?? 0);
      const actual = expenseByHead.get(h.id) ?? 0;
      if (planned || actual) rows.push({ label: `▼ ${headName(h.id)}`, planned, actual });
    }
    return rows;
  }, [budget, incomeByType, expenseByHead, heads, t]); // eslint-disable-line

  const tabs: { id: Tab; label: string }[] = [
    { id: 'pnl', label: t('reports.pnl') },
    { id: 'cashbook', label: t('reports.cashBook') },
    { id: 'budget', label: t('reports.budgetVsActual') },
    { id: 'coupon', label: t('reports.couponSettlement') },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3 print:hidden">
        <h1 className="text-xl font-bold">📊 {t('reports.title')}</h1>
        <button className="btn-secondary text-sm" onClick={() => window.print()}>🖨 {t('common.print')}</button>
      </div>
      <div className="flex gap-1 mb-4 overflow-x-auto print:hidden">
        {tabs.map((x) => (
          <button key={x.id} onClick={() => setTab(x.id)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
              tab === x.id ? 'bg-brand-700 text-white font-semibold' : 'bg-white border border-stone-300'}`}>
            {x.label}
          </button>
        ))}
      </div>

      <div className="hidden print:block mb-4">
        <h2 className="font-bold text-lg">{current?.programs?.name} {current?.programs?.year} — {tabs.find((x) => x.id === tab)?.label}</h2>
      </div>

      {tab === 'pnl' && (
        <div className="card">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-stone-100">
                <td className="py-2 font-semibold">{t('dashboard.openingBalance')}</td>
                <td className="py-2 text-right money">{fmtINR(opening)}</td>
              </tr>
              <tr><td colSpan={2} className="pt-3 pb-1 font-bold text-green-700">{t('reports.income')}</td></tr>
              {INCOME_TYPES.map((ty) => {
                const v = incomeByType.get(ty) ?? 0;
                if (!v) return null;
                return (
                  <tr key={ty} className="border-b border-stone-50">
                    <td className="py-1.5 pl-4">{t('collect.' + ty)}</td>
                    <td className="py-1.5 text-right money">{fmtINR(v)}</td>
                  </tr>
                );
              })}
              <tr className="border-b border-stone-200">
                <td className="py-2 font-semibold">{t('common.total')} {t('reports.income')}</td>
                <td className="py-2 text-right money font-bold text-green-700">{fmtINR(totalIncome)}</td>
              </tr>
              <tr><td colSpan={2} className="pt-3 pb-1 font-bold text-red-700">{t('reports.expense')}</td></tr>
              {heads.map((h) => {
                const v = expenseByHead.get(h.id) ?? 0;
                if (!v) return null;
                return (
                  <tr key={h.id} className="border-b border-stone-50">
                    <td className="py-1.5 pl-4">{headName(h.id)}</td>
                    <td className="py-1.5 text-right money">{fmtINR(v)}</td>
                  </tr>
                );
              })}
              <tr className="border-b border-stone-200">
                <td className="py-2 font-semibold">{t('common.total')} {t('reports.expense')}</td>
                <td className="py-2 text-right money font-bold text-red-700">{fmtINR(totalExpense)}</td>
              </tr>
              <tr>
                <td className="py-3 font-black">
                  {retained >= 0 ? t('reports.surplus') : t('reports.deficit')}
                </td>
                <td className={`py-3 text-right money font-black text-lg ${retained >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {fmtINR(retained)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-stone-400 mt-2">{t('reports.retainedNote')}</p>
        </div>
      )}

      {tab === 'cashbook' && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="text-left text-xs text-stone-500 border-b border-stone-200">
                <th className="p-2">{t('common.date')}</th>
                <th className="p-2"></th>
                <th className="p-2 text-right">{t('reports.inflow')}</th>
                <th className="p-2 text-right">{t('reports.outflow')}</th>
                <th className="p-2 text-right">{t('reports.runningBalance')}</th>
              </tr>
            </thead>
            <tbody>
              {cashbook.length === 0 && <tr><td colSpan={5}><Empty /></td></tr>}
              {cashbook.map((r, idx) => (
                <tr key={idx} className="border-b border-stone-50">
                  <td className="p-2 whitespace-nowrap">{fmtDate(r.date, i18n.language)}</td>
                  <td className="p-2">{r.label}</td>
                  <td className="p-2 text-right money text-green-700">{r.inAmt ? fmtINR(r.inAmt) : ''}</td>
                  <td className="p-2 text-right money text-red-700">{r.outAmt ? fmtINR(r.outAmt) : ''}</td>
                  <td className="p-2 text-right money font-semibold">{fmtINR(r.bal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'budget' && (
        <div className="space-y-2">
          {budgetRows.length === 0 && <Empty />}
          {budgetRows.map((r, idx) => {
            const pct = r.planned ? Math.min(150, Math.round((r.actual / r.planned) * 100)) : 100;
            const over = r.planned > 0 && r.actual > r.planned;
            return (
              <div key={idx} className="card py-3">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{r.label}</span>
                  <span className="money">
                    {fmtINR(r.actual)} / {fmtINR(r.planned)}
                    <span className={`ml-2 font-bold ${over ? 'text-red-600' : 'text-green-700'}`}>
                      {r.planned ? `${Math.round((r.actual / r.planned) * 100)}%` : ''}
                    </span>
                  </span>
                </div>
                <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div className={`h-full ${over ? 'bg-red-500' : 'bg-brand-600'}`}
                    style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'coupon' && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-xs text-stone-500 border-b border-stone-200">
                <th className="p-2">{t('coupons.bookNo')}</th>
                <th className="p-2">{t('coupons.holder')}</th>
                <th className="p-2 text-right">{t('coupons.sold')}</th>
                <th className="p-2 text-right">{t('coupons.remitted')}</th>
                <th className="p-2 text-right">{t('coupons.outstanding')}</th>
              </tr>
            </thead>
            <tbody>
              {books.length === 0 && <tr><td colSpan={5}><Empty /></td></tr>}
              {books.map((b) => (
                <tr key={b.id} className="border-b border-stone-50">
                  <td className="p-2 font-semibold">{b.book_no}</td>
                  <td className="p-2">{b.holder_name}</td>
                  <td className="p-2 text-right money">{fmtINR(b.sold_value)}</td>
                  <td className="p-2 text-right money text-green-700">{fmtINR(b.remitted)}</td>
                  <td className={`p-2 text-right money font-semibold ${Number(b.outstanding) > 0 ? 'text-red-700' : ''}`}>
                    {fmtINR(b.outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
