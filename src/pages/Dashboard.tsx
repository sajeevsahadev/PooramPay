import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase, fmtINR, fmtDate } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { friendlyError } from '../components/ui';
import { Donut, MiniBars, Sparkline } from '../components/charts';

interface TxRow {
  id: string; kind: 'in' | 'out'; label: string; amount: number; date: string;
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { finance, current, currentProgramId, can, refreshFinance, session, frozen } = useApp();
  const [recent, setRecent] = useState<TxRow[]>([]);
  const [myCash, setMyCash] = useState(0);
  const [couponOut, setCouponOut] = useState(0);
  const [myTasks, setMyTasks] = useState(0);
  const [budgetExpense, setBudgetExpense] = useState(0);
  const [incomeByType, setIncomeByType] = useState<{ label: string; value: number }[]>([]);
  const [dailyIncome, setDailyIncome] = useState<number[]>([]);
  const [pendingHandovers, setPendingHandovers] = useState<
    { id: string; amount: number; from_profile: string }[]
  >([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    if (!currentProgramId) return;
    const pid = currentProgramId;
    const uid = session!.user.id;
    const since = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);

    const [inc, exp, cash, coupons, tasks, hands, bud, byType, byDay] = await Promise.all([
      supabase.from('income_entries')
        .select('id, amount, entry_type, payer_name, entry_date, created_at')
        .eq('program_id', pid).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(6),
      supabase.from('expenses')
        .select('id, amount, description, vendor_name, expense_date, created_at, status')
        .eq('program_id', pid).is('deleted_at', null).eq('status', 'paid')
        .order('created_at', { ascending: false }).limit(6),
      supabase.from('v_my_cash').select('cash_holding')
        .eq('program_id', pid).eq('collected_by', uid).maybeSingle(),
      can('coupons')
        ? supabase.from('v_coupon_totals').select('outstanding').eq('program_id', pid)
        : Promise.resolve({ data: [] as { outstanding: number }[] }),
      supabase.from('committee_tasks').select('id, program_members!assignee_member_id(profile_id)')
        .eq('program_id', pid).neq('status', 'done'),
      can('approve')
        ? supabase.from('cash_handovers').select('id, amount, from_profile')
            .eq('program_id', pid).eq('status', 'pending')
        : Promise.resolve({ data: [] as { id: string; amount: number; from_profile: string }[] }),
      supabase.from('budget_items').select('side, planned').eq('program_id', pid),
      supabase.from('v_income_by_type').select('entry_type, total').eq('program_id', pid),
      supabase.from('v_income_by_day').select('entry_date, total')
        .eq('program_id', pid).gte('entry_date', since).order('entry_date'),
    ]);

    const rows: TxRow[] = [
      ...(inc.data ?? []).map((r) => ({
        id: r.id, kind: 'in' as const,
        label: `${t('collect.' + r.entry_type)}${r.payer_name ? ' · ' + r.payer_name : ''}`,
        amount: r.amount, date: r.created_at,
      })),
      ...(exp.data ?? []).map((r) => ({
        id: r.id, kind: 'out' as const,
        label: r.description || r.vendor_name || t('expenses.title'),
        amount: r.amount, date: r.created_at,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    setRecent(rows);
    setMyCash((cash.data as { cash_holding: number } | null)?.cash_holding ?? 0);
    setCouponOut(((coupons.data ?? []) as { outstanding: number }[])
      .reduce((s, b) => s + Number(b.outstanding || 0), 0));
    type TaskRow = { id: string; program_members: { profile_id: string | null } | null };
    setMyTasks(((tasks.data ?? []) as unknown as TaskRow[])
      .filter((x) => x.program_members?.profile_id === uid).length);
    setPendingHandovers((hands.data ?? []) as { id: string; amount: number; from_profile: string }[]);

    setBudgetExpense(((bud.data ?? []) as { side: string; planned: number }[])
      .filter((b) => b.side === 'expense').reduce((s, b) => s + Number(b.planned), 0));
    setIncomeByType(((byType.data ?? []) as { entry_type: string; total: number }[])
      .map((r) => ({ label: t('collect.' + r.entry_type), value: Number(r.total) }))
      .sort((a, b) => b.value - a.value).slice(0, 5));

    // fill missing days with zero so the sparkline shows real rhythm
    const dayMap = new Map(((byDay.data ?? []) as { entry_date: string; total: number }[])
      .map((r) => [r.entry_date, Number(r.total)]));
    const days: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days.push(dayMap.get(d) ?? 0);
    }
    setDailyIncome(days);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentProgramId]);

  const handover = async () => {
    try {
      await supabase.rpc('create_handover', { p_program: currentProgramId }).throwOnError();
      setMsg(t('common.saved'));
      await Promise.all([load(), refreshFinance()]);
    } catch (e) { setMsg(friendlyError(e)); }
  };

  const confirmHandover = async (id: string) => {
    try {
      await supabase.rpc('confirm_handover', { p_id: id }).throwOnError();
      await Promise.all([load(), refreshFinance()]);
    } catch (e) { setMsg(friendlyError(e)); }
  };

  const showMoney = can('view_money');
  const spark14 = dailyIncome.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {msg && <div className="bg-brand-100 text-stone-800 rounded-lg p-3 text-sm" onClick={() => setMsg(null)}>{msg}</div>}

      {showMoney && (
        <div className="grid grid-cols-2 gap-3">
          <div className="stat stat-fuchsia">
            <div className="stat-label">💵 {t('dashboard.cashInHand')}</div>
            <div className="stat-value text-2xl font-black money">{fmtINR(finance?.cash_balance)}</div>
          </div>
          <div className="stat stat-cyan">
            <div className="stat-label">🏦 {t('dashboard.bankBalance')}</div>
            <div className="stat-value text-2xl font-black money">{fmtINR(finance?.bank_balance)}</div>
          </div>
          <div className="stat stat-green">
            <div className="stat-label">📈 {t('dashboard.collected')}</div>
            <div className="stat-value text-xl font-black money">{fmtINR(finance?.income_total)}</div>
          </div>
          <div className="stat stat-red">
            <div className="stat-label">📉 {t('dashboard.spent')}</div>
            <div className="stat-value text-xl font-black money">{fmtINR(finance?.expense_total)}</div>
          </div>
        </div>
      )}

      {/* Insights */}
      {showMoney && (incomeByType.length > 0 || budgetExpense > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="card flex items-center gap-4">
            <Donut value={Number(finance?.expense_total ?? 0)} max={budgetExpense}
              label={t('dashboard.budgetUsed')} sub={t('dashboard.budgetUsed')} />
            <div className="min-w-0">
              <div className="text-sm font-bold mb-1">🎯 {t('reports.budgetVsActual')}</div>
              <div className="text-xs text-stone-500">
                {t('reports.actual')}: <b className="money text-stone-700">{fmtINR(finance?.expense_total)}</b><br />
                {t('reports.planned')}: <b className="money text-stone-700">{fmtINR(budgetExpense)}</b>
              </div>
              <Link to="/reports" className="text-xs font-semibold text-brand-600">{t('nav.reports')} ›</Link>
            </div>
          </div>
          <div className="card">
            <div className="flex justify-between items-baseline mb-1">
              <div className="text-sm font-bold">⚡ {t('dashboard.collected')} · 14d</div>
              <div className="money text-sm font-bold text-green-700">{fmtINR(spark14)}</div>
            </div>
            <Sparkline points={dailyIncome} />
            <div className="mt-3 text-sm font-bold mb-1">🌈 {t('reports.byType')}</div>
            <MiniBars data={incomeByType} format={fmtINR} />
          </div>
        </div>
      )}

      {/* Alerts */}
      <div className="space-y-2">
        {can('approve') && (finance?.pending_claims ?? 0) > 0 && (
          <Link to="/expenses" className="card flex items-center gap-3 hover:bg-stone-100">
            <span className="tile tile-amber">⏳</span>
            <span className="flex-1">{finance!.pending_claims} {t('dashboard.pendingApprovals')}</span><span className="text-stone-400">›</span>
          </Link>
        )}
        {can('coupons') && couponOut > 0 && (
          <Link to="/coupons" className="card flex items-center gap-3 hover:bg-stone-100">
            <span className="tile tile-fuchsia">🎟️</span>
            <span className="flex-1">{t('dashboard.couponPending')}: <b className="money">{fmtINR(couponOut)}</b></span><span className="text-stone-400">›</span>
          </Link>
        )}
        {myTasks > 0 && (
          <Link to="/tasks" className="card flex items-center gap-3 hover:bg-stone-100">
            <span className="tile tile-cyan">📋</span>
            <span className="flex-1">{t('dashboard.myTasks')}: <b>{myTasks}</b></span><span className="text-stone-400">›</span>
          </Link>
        )}
      </div>

      {/* My cash in hand */}
      {myCash > 0 && !frozen && (
        <div className="card flex items-center justify-between gap-3 border-amber-300 bg-amber-50">
          <div className="flex items-center gap-3">
            <span className="tile tile-lime">💵</span>
            <div>
              <div className="text-xs text-stone-500">{t('dashboard.myCashInHand')}</div>
              <div className="text-lg font-bold money">{fmtINR(myCash)}</div>
            </div>
          </div>
          <button className="btn-primary" onClick={handover}>{t('dashboard.handover')}</button>
        </div>
      )}

      {/* Treasurer: confirm handovers */}
      {pendingHandovers.map((h) => (
        <div key={h.id} className="card flex items-center justify-between gap-3 border-blue-300 bg-blue-50">
          <div className="text-sm flex items-center gap-3">
            <span className="tile tile-violet">🤝</span>
            <span>{t('dashboard.handover')}: <b className="money">{fmtINR(h.amount)}</b></span>
          </div>
          <button className="btn-primary" onClick={() => confirmHandover(h.id)}>{t('common.confirm')}</button>
        </div>
      ))}

      {/* Recent transactions */}
      {showMoney && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 font-bold border-b border-stone-100 flex justify-between">
            {t('dashboard.recent')}
            <Link to="/transactions" className="text-brand-600 text-sm font-semibold">{t('common.view')} ›</Link>
          </div>
          {recent.length === 0 && <div className="p-4 text-stone-400 text-sm">{t('common.none')}</div>}
          {recent.map((r) => (
            <div key={r.kind + r.id} className="px-4 py-2.5 flex justify-between border-b border-stone-50 last:border-0 text-sm">
              <span className="truncate mr-2">{r.label}</span>
              <span className={`money font-semibold shrink-0 ${r.kind === 'in' ? 'text-green-700' : 'text-red-700'}`}>
                {r.kind === 'in' ? '+' : '−'} {fmtINR(r.amount)}
                <span className="text-stone-400 font-normal ml-2">{fmtDate(r.date, i18n.language)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {current && !showMoney && (
        <div className="card text-sm text-stone-500">
          {t('auth.welcome')}, {current.display_name ?? current.email} · {t(`roles.${current.role}`)}
        </div>
      )}
    </div>
  );
}
