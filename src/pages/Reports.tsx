import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, fmtINR, fmtDate } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Empty, friendlyError } from '../components/ui';
import { incomeTypeLabel, useUnits } from '../lib/units';
import { displayName, type BudgetItem, type CouponBook, type ExpenseHead } from '../lib/types';

type Tab = 'pnl' | 'cashbook' | 'budget' | 'coupon';
const INCOME_TYPES = ['house', 'coupon', 'subscription', 'interest', 'ad_brochure', 'ad_stage', 'donation'];
const PAGE = 100;

interface CashRow { date: string; created: string; label: string; inAmt: number; outAmt: number; bal?: number }
interface Signoff {
  profile_id: string; role_at_signing: string | null; signed_at: string;
  profiles: { nickname: string | null; full_name: string | null } | null;
}

export default function Reports() {
  const { t, i18n } = useTranslation();
  const { currentProgramId, finance, currentProgram, can, isCommitteeAdmin, refresh } = useApp();
  const { unit } = useUnits();
  const canLive = can('view_money');
  const canCoupons = can('coupons');
  const published = !!currentProgram?.results_published;
  const snapshot = currentProgram?.results_snapshot ?? null;

  const [tab, setTab] = useState<Tab>('pnl');
  const [incomeByType, setIncomeByType] = useState<Map<string, number>>(new Map());
  const [expenseByHead, setExpenseByHead] = useState<Map<string, number>>(new Map());
  const [heads, setHeads] = useState<ExpenseHead[]>([]);
  const [budget, setBudget] = useState<BudgetItem[]>([]);
  const [books, setBooks] = useState<CouponBook[]>([]);
  const [cashRows, setCashRows] = useState<CashRow[]>([]);
  const [cashPage, setCashPage] = useState(0);
  const [cashDone, setCashDone] = useState(false);
  const [signoffs, setSignoffs] = useState<Signoff[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadSignoffs = useCallback(() => {
    if (!currentProgramId) return;
    supabase.from('program_signoffs')
      .select('profile_id, role_at_signing, signed_at, profiles(nickname, full_name)')
      .eq('program_id', currentProgramId).order('signed_at')
      .then(({ data }) => setSignoffs((data ?? []) as unknown as Signoff[]));
  }, [currentProgramId]);

  useEffect(() => { loadSignoffs(); }, [loadSignoffs]);

  // finance aggregates (live) — only fetched/shown for view_money users
  useEffect(() => {
    if (!currentProgramId || !canLive) return;
    Promise.all([
      supabase.rpc('income_by_type', { p_program: currentProgramId }),
      supabase.rpc('expense_by_head', { p_program: currentProgramId }),
      supabase.from('expense_heads').select('*').eq('program_id', currentProgramId).order('sort_order'),
      supabase.from('budget_items').select('*').eq('program_id', currentProgramId),
    ]).then(([i, e, h, b]) => {
      setIncomeByType(new Map(((i.data ?? []) as { entry_type: string; total: number }[])
        .map((r) => [r.entry_type, Number(r.total)])));
      setExpenseByHead(new Map(((e.data ?? []) as { head_id: string; total: number }[])
        .map((r) => [r.head_id, Number(r.total)])));
      setHeads((h.data ?? []) as ExpenseHead[]);
      setBudget((b.data ?? []) as BudgetItem[]);
    });
  }, [currentProgramId, canLive]);

  // coupon settlement (coupons permission)
  useEffect(() => {
    if (!currentProgramId || !canCoupons) return;
    supabase.from('v_coupon_books').select('*').eq('program_id', currentProgramId).order('book_no').limit(500)
      .then(({ data }) => setBooks((data ?? []) as CouponBook[]));
  }, [currentProgramId, canCoupons]);

  const headName = useCallback((id: string) => {
    const h = heads.find((x) => x.id === id);
    return (i18n.language === 'ml' && h?.name_ml) ? h.name_ml : h?.name ?? '';
  }, [heads, i18n.language]);

  const loadCashPage = useCallback(async (page: number) => {
    if (!currentProgramId) return;
    const from = page * PAGE, to = from + PAGE - 1;
    const [i, e] = await Promise.all([
      supabase.from('income_entries')
        .select('amount, entry_type, payer_name, receipt_no, entry_date, created_at')
        .eq('program_id', currentProgramId).is('deleted_at', null)
        .order('created_at', { ascending: false }).range(from, to),
      supabase.from('expenses')
        .select('amount, description, vendor_name, head_id, expense_date, created_at')
        .eq('program_id', currentProgramId).is('deleted_at', null).eq('status', 'paid')
        .order('created_at', { ascending: false }).range(from, to),
    ]);
    const inc = (i.data ?? []).map((r) => ({
      date: r.entry_date as string, created: r.created_at as string,
      label: `${incomeTypeLabel(t, r.entry_type, unit)}${r.payer_name ? ' · ' + r.payer_name : ''} #${r.receipt_no ?? ''}`,
      inAmt: Number(r.amount), outAmt: 0,
    }));
    const exp = (e.data ?? []).map((r) => ({
      date: r.expense_date as string, created: r.created_at as string,
      label: (r.description || r.vendor_name || headName(r.head_id as string)) as string,
      inAmt: 0, outAmt: Number(r.amount),
    }));
    if ((i.data?.length ?? 0) < PAGE && (e.data?.length ?? 0) < PAGE) setCashDone(true);
    setCashRows((prev) => [...prev, ...inc, ...exp].sort((a, b) => b.created.localeCompare(a.created)));
  }, [currentProgramId, headName, t]);

  useEffect(() => {
    setCashRows([]); setCashPage(0); setCashDone(false);
    if (canLive && tab === 'cashbook') loadCashPage(0);
  }, [tab, currentProgramId, loadCashPage, canLive]);

  const totalIncome = Number(finance?.income_total ?? 0);
  const totalExpense = Number(finance?.expense_total ?? 0);
  const opening = Number(finance?.opening_balance ?? 0);
  const retained = opening + totalIncome - totalExpense;

  const cashWithBal = useMemo(() => {
    let bal = retained;
    return cashRows.map((r) => { const row = { ...r, bal }; bal = bal - r.inAmt + r.outAmt; return row; });
  }, [cashRows, retained]);

  const budgetRows = useMemo(() => {
    const rows: { label: string; planned: number; actual: number }[] = [];
    for (const ty of INCOME_TYPES) {
      const planned = Number(budget.find((b) => b.side === 'income' && b.income_type === ty)?.planned ?? 0);
      const actual = incomeByType.get(ty) ?? 0;
      if (planned || actual) rows.push({ label: `▲ ${incomeTypeLabel(t, ty, unit)}`, planned, actual });
    }
    for (const h of heads) {
      const planned = Number(budget.find((b) => b.side === 'expense' && b.head_id === h.id)?.planned ?? 0);
      const actual = expenseByHead.get(h.id) ?? 0;
      if (planned || actual) rows.push({ label: `▼ ${headName(h.id)}`, planned, actual });
    }
    return rows;
  }, [budget, incomeByType, expenseByHead, heads, t, headName]);

  const signAndPublish = async () => {
    if (!window.confirm(t('reports.signConfirm'))) return;
    setPublishing(true); setMsg(null);
    try {
      await supabase.rpc('sign_and_publish_results', { p_program: currentProgramId }).throwOnError();
      setMsg(t('reports.signedOk'));
      await Promise.all([loadSignoffs(), refresh()]);
    } catch (e) { setMsg(friendlyError(e)); }
    setPublishing(false);
  };

  const Signatures = () => (
    <div className="mt-3 border-t border-stone-100 pt-3">
      <div className="text-xs font-semibold text-stone-500 mb-1">✍️ {t('reports.signedBy')}</div>
      {signoffs.length === 0 && <div className="text-xs text-stone-400">—</div>}
      {signoffs.map((s) => (
        <div key={s.profile_id} className="text-xs text-stone-600">
          ✓ {displayName({ profiles: s.profiles })}
          {s.role_at_signing ? ` · ${t(`roles.${s.role_at_signing}`, s.role_at_signing)}` : ''}
          <span className="text-stone-400"> · {fmtDate(s.signed_at, i18n.language)}</span>
        </div>
      ))}
    </div>
  );

  // ---------- NON-FINANCE VIEW: only the published, signed results ----------
  if (!canLive) {
    const snap = snapshot;
    return (
      <div>
        <h1 className="text-xl font-bold mb-3">📊 {t('reports.title')}</h1>
        {published && snap ? (
          <div className="card">
            <div className="chip-green mb-3">✓ {t('reports.finalResults')}</div>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-stone-100"><td className="py-2 font-semibold">{t('dashboard.openingBalance')}</td><td className="py-2 text-right money">{fmtINR(snap.opening_balance)}</td></tr>
                <tr className="border-b border-stone-100"><td className="py-2 font-semibold text-green-700">{t('common.total')} {t('reports.income')}</td><td className="py-2 text-right money text-green-700 font-bold">{fmtINR(snap.income_total)}</td></tr>
                <tr className="border-b border-stone-200"><td className="py-2 font-semibold text-red-700">{t('common.total')} {t('reports.expense')}</td><td className="py-2 text-right money text-red-700 font-bold">{fmtINR(snap.expense_total)}</td></tr>
                <tr><td className="py-3 font-black">{Number(snap.retained) >= 0 ? t('reports.surplus') : t('reports.deficit')}</td><td className={`py-3 text-right money font-black text-lg ${Number(snap.retained) >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtINR(snap.retained)}</td></tr>
              </tbody>
            </table>
            <p className="text-xs text-stone-400 mt-2">{t('reports.publishedOn')}: {currentProgram?.results_published_at && fmtDate(currentProgram.results_published_at, i18n.language)}</p>
            <Signatures />
          </div>
        ) : (
          <div className="card text-center py-8">
            <div className="text-4xl mb-2">🔒</div>
            <div className="font-semibold">{t('reports.pendingTitle')}</div>
            <p className="text-sm text-stone-500 mt-1 max-w-md mx-auto">{t('reports.pendingBody')}</p>
          </div>
        )}

        {canCoupons && (
          <div className="card p-0 overflow-x-auto mt-4">
            <div className="px-3 py-2 font-semibold text-sm border-b border-stone-100">🎟️ {t('reports.couponSettlement')}</div>
            <table className="w-full text-sm min-w-[520px]">
              <thead><tr className="text-left text-xs text-stone-500 border-b border-stone-200"><th className="p-2">{t('coupons.bookNo')}</th><th className="p-2">{t('coupons.holder')}</th><th className="p-2 text-right">{t('coupons.sold')}</th><th className="p-2 text-right">{t('coupons.remitted')}</th><th className="p-2 text-right">{t('coupons.outstanding')}</th></tr></thead>
              <tbody>
                {books.length === 0 && <tr><td colSpan={5}><Empty /></td></tr>}
                {books.map((b) => (
                  <tr key={b.id} className="border-b border-stone-50">
                    <td className="p-2 font-semibold">{b.book_no}</td><td className="p-2">{b.holder_name}</td>
                    <td className="p-2 text-right money">{fmtINR(b.sold_value)}</td>
                    <td className="p-2 text-right money text-green-700">{fmtINR(b.remitted)}</td>
                    <td className={`p-2 text-right money font-semibold ${Number(b.outstanding) > 0 ? 'text-red-700' : ''}`}>{fmtINR(b.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ---------- FINANCE VIEW: full live reports + sign/publish ----------
  const tabs: { id: Tab; label: string }[] = [
    { id: 'pnl', label: t('reports.pnl') },
    { id: 'cashbook', label: t('reports.cashBook') },
    { id: 'budget', label: t('reports.budgetVsActual') },
    ...(canCoupons ? [{ id: 'coupon' as Tab, label: t('reports.couponSettlement') }] : []),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3 print:hidden">
        <h1 className="text-xl font-bold">📊 {t('reports.title')}</h1>
        <button className="btn-secondary text-sm" onClick={() => window.print()}>🖨 {t('common.print')}</button>
      </div>
      {msg && <div className="bg-brand-100 text-stone-800 rounded-lg p-3 text-sm mb-3" onClick={() => setMsg(null)}>{msg}</div>}
      <div className="flex gap-1 mb-4 overflow-x-auto print:hidden">
        {tabs.map((x) => (
          <button key={x.id} onClick={() => setTab(x.id)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
              tab === x.id ? 'bg-brand-700 text-white font-semibold' : 'bg-surface border border-stone-300'}`}>
            {x.label}
          </button>
        ))}
      </div>

      <div className="hidden print:block mb-4">
        <h2 className="font-bold text-lg">{currentProgram?.name} {currentProgram?.year} — {tabs.find((x) => x.id === tab)?.label}</h2>
      </div>

      {tab === 'pnl' && (
        <>
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
                      <td className="py-1.5 pl-4">{incomeTypeLabel(t, ty, unit)}</td>
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
                  <td className="py-3 font-black">{retained >= 0 ? t('reports.surplus') : t('reports.deficit')}</td>
                  <td className={`py-3 text-right money font-black text-lg ${retained >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtINR(retained)}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-stone-400 mt-2">{t('reports.retainedNote')}</p>
          </div>

          {/* Sign & publish the final accounts to all members */}
          <div className="card mt-4 print:hidden">
            <div className="font-bold mb-1">🔏 {t('reports.finalResults')}</div>
            {published ? (
              <p className="text-sm text-green-700 mb-2">✓ {t('reports.publishedOn')}: {currentProgram?.results_published_at && fmtDate(currentProgram.results_published_at, i18n.language)}</p>
            ) : (
              <p className="text-sm text-stone-500 mb-2">{t('reports.signHint')}</p>
            )}
            {isCommitteeAdmin && (
              <button className="btn-primary" disabled={publishing} onClick={signAndPublish}>
                ✍️ {published ? t('reports.addSignature') : t('reports.signPublish')}
              </button>
            )}
            <Signatures />
          </div>
        </>
      )}

      {tab === 'cashbook' && (
        <>
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-xs text-stone-500 border-b border-stone-200">
                  <th className="p-2">{t('common.date')}</th><th className="p-2"></th>
                  <th className="p-2 text-right">{t('reports.inflow')}</th>
                  <th className="p-2 text-right">{t('reports.outflow')}</th>
                  <th className="p-2 text-right">{t('reports.runningBalance')}</th>
                </tr>
              </thead>
              <tbody>
                {cashWithBal.length === 0 && <tr><td colSpan={5}><Empty /></td></tr>}
                {cashWithBal.map((r, idx) => (
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
          {!cashDone && cashRows.length > 0 && (
            <button className="btn-secondary w-full mt-3 print:hidden"
              onClick={() => { const next = cashPage + 1; setCashPage(next); loadCashPage(next); }}>
              ↓ {t('common.more')}
            </button>
          )}
        </>
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
                <div className="bar-track">
                  <div className={over ? 'bar-fill-red' : 'bar-fill'} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'coupon' && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="text-left text-xs text-stone-500 border-b border-stone-200"><th className="p-2">{t('coupons.bookNo')}</th><th className="p-2">{t('coupons.holder')}</th><th className="p-2 text-right">{t('coupons.sold')}</th><th className="p-2 text-right">{t('coupons.remitted')}</th><th className="p-2 text-right">{t('coupons.outstanding')}</th></tr></thead>
            <tbody>
              {books.length === 0 && <tr><td colSpan={5}><Empty /></td></tr>}
              {books.map((b) => (
                <tr key={b.id} className="border-b border-stone-50">
                  <td className="p-2 font-semibold">{b.book_no}</td><td className="p-2">{b.holder_name}</td>
                  <td className="p-2 text-right money">{fmtINR(b.sold_value)}</td>
                  <td className="p-2 text-right money text-green-700">{fmtINR(b.remitted)}</td>
                  <td className={`p-2 text-right money font-semibold ${Number(b.outstanding) > 0 ? 'text-red-700' : ''}`}>{fmtINR(b.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
