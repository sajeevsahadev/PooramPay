import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase, fmtINR, fmtDate } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { friendlyError } from '../components/ui';
import { Donut, MiniBars, Sparkline } from '../components/charts';
import { incomeTypeLabel, useUnits } from '../lib/units';

interface TxRow {
  id: string; kind: 'in' | 'out'; label: string; amount: number; date: string;
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { profile, memberships, finance, current, currentProgram, currentProgramId, setCurrentProgramId,
    can, refreshFinance, session, frozen, isCommitteeAdmin } = useApp();
  const { unit } = useUnits();
  const [recent, setRecent] = useState<TxRow[]>([]);
  const [myCash, setMyCash] = useState(0);
  const [couponOut, setCouponOut] = useState(0);
  const [myTaskList, setMyTaskList] = useState<
    { id: string; title: string; status: string; due_date: string | null }[]
  >([]);
  const myTasks = myTaskList.length;
  const [myCollected, setMyCollected] = useState(0);

  // non-finance members: show their OWN collection (org totals stay hidden)
  useEffect(() => {
    if (!currentProgramId || can('view_money')) return;
    supabase.from('income_entries').select('amount')
      .eq('program_id', currentProgramId).eq('collected_by', session!.user.id).is('deleted_at', null)
      .then(({ data }) => setMyCollected((data ?? []).reduce((s, r) => s + Number(r.amount), 0)));
    // eslint-disable-next-line
  }, [currentProgramId]);
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
      supabase.rpc('program_my_cash', { p_program: pid, p_user: uid }),
      can('coupons')
        ? supabase.from('v_coupon_totals').select('outstanding').eq('program_id', pid)
        : Promise.resolve({ data: [] as { outstanding: number }[] }),
      supabase.from('committee_tasks')
        .select('id, title, status, due_date, program_members!assignee_member_id(profile_id)')
        .eq('program_id', pid).neq('status', 'done').order('due_date', { nullsFirst: false }),
      can('approve')
        ? supabase.from('cash_handovers').select('id, amount, from_profile')
            .eq('program_id', pid).eq('status', 'pending')
        : Promise.resolve({ data: [] as { id: string; amount: number; from_profile: string }[] }),
      supabase.from('budget_items').select('side, planned').eq('program_id', pid),
      supabase.rpc('income_by_type', { p_program: pid }),
      supabase.rpc('income_by_day', { p_program: pid, p_since: since }),
    ]);

    const rows: TxRow[] = [
      ...(inc.data ?? []).map((r) => ({
        id: r.id, kind: 'in' as const,
        label: `${incomeTypeLabel(t, r.entry_type, unit)}${r.payer_name ? ' · ' + r.payer_name : ''}`,
        amount: r.amount, date: r.created_at,
      })),
      ...(exp.data ?? []).map((r) => ({
        id: r.id, kind: 'out' as const,
        label: r.description || r.vendor_name || t('expenses.title'),
        amount: r.amount, date: r.created_at,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    setRecent(rows);
    setMyCash(Number((cash as { data: number | null }).data ?? 0));
    setCouponOut(((coupons.data ?? []) as { outstanding: number }[])
      .reduce((s, b) => s + Number(b.outstanding || 0), 0));
    type TaskRow = {
      id: string; title: string; status: string; due_date: string | null;
      program_members: { profile_id: string | null } | null;
    };
    setMyTaskList(((tasks.data ?? []) as unknown as TaskRow[])
      .filter((x) => x.program_members?.profile_id === uid)
      .map((x) => ({ id: x.id, title: x.title, status: x.status, due_date: x.due_date })));
    setPendingHandovers((hands.data ?? []) as { id: string; amount: number; from_profile: string }[]);

    setBudgetExpense(((bud.data ?? []) as { side: string; planned: number }[])
      .filter((b) => b.side === 'expense').reduce((s, b) => s + Number(b.planned), 0));
    setIncomeByType(((byType.data ?? []) as { entry_type: string; total: number }[])
      .map((r) => ({ label: incomeTypeLabel(t, r.entry_type, unit), value: Number(r.total) }))
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
  const pendingApprovals = can('approve') ? (finance?.pending_claims ?? 0) : 0;

  const hour = new Date().getHours();
  const greetKey = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const myName = profile?.nickname || profile?.full_name || '';

  // quick actions — circular chips, gated by what this member may actually do
  const quickActions = [
    { to: '/collect', icon: '💰', label: t('nav.collect'), show: can('collect') && !frozen },
    { to: '/coupons', icon: '🎟️', label: t('nav.coupons'), show: can('coupons') },
    { to: '/expenses', icon: '🧾', label: t('nav.expenses'), show: can('expense') || can('approve') },
    { to: '/reports', icon: '📊', label: t('nav.reports'), show: true },
    { to: '/tasks', icon: '✅', label: t('nav.tasks'), show: true },
    { to: '/areas', icon: '🏘️', label: t('setup.areas'), show: can('collect') || isCommitteeAdmin },
    { to: '/transactions', icon: '📒', label: t('nav.transactions'), show: showMoney },
    { to: '/more', icon: '☰', label: t('nav.more'), show: true },
  ].filter((x) => x.show);

  return (
    <div className="space-y-5">
      {/* personalized greeting */}
      <div>
        <h1 className="text-xl font-black">
          {greetKey === 'morning' ? '☀️' : greetKey === 'afternoon' ? '🌤️' : '🌙'}{' '}
          {t('home.' + greetKey)}{myName ? `, ${myName}` : ''}
        </h1>
        <p className="text-sm text-stone-500 truncate">
          {currentProgram?.committees?.organizations?.name
            ? `${currentProgram.name} · ${currentProgram.committees.organizations.name}`
            : `${t('home.myGroups')}: ${memberships.length}`}
        </p>
      </div>

      {msg && <div className="bg-brand-100 text-stone-800 rounded-xl p-3 text-sm" onClick={() => setMsg(null)}>{msg}</div>}

      {/* hero balance card */}
      {showMoney && (
        <div className="hero">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <div className="hero-label">{t('dashboard.cashInHand')}</div>
              <div className="text-3xl font-black money mt-0.5">{fmtINR(finance?.cash_balance)}</div>
            </div>
            <div className="text-right min-w-0">
              <div className="hero-label">{t('dashboard.bankBalance')}</div>
              <div className="text-xl font-bold money mt-0.5">{fmtINR(finance?.bank_balance)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-white/15">
            <div>
              <div className="hero-label">{t('dashboard.collected')}</div>
              <div className="text-lg font-bold money text-green-300">{fmtINR(finance?.income_total)}</div>
            </div>
            <div>
              <div className="hero-label">{t('dashboard.spent')}</div>
              <div className="text-lg font-bold money text-rose-200">{fmtINR(finance?.expense_total)}</div>
            </div>
          </div>
        </div>
      )}

      {!showMoney && (
        <div className="hero">
          <div className="hero-label">🙌 {t('home.myCollected')}</div>
          <div className="text-3xl font-black money mt-0.5">{fmtINR(myCollected)}</div>
        </div>
      )}

      {/* quick actions */}
      <div>
        <div className="section-title">{t('home.quickActions')}</div>
        <div className="card">
          <div className="grid grid-cols-4 gap-y-4">
            {quickActions.map((q) => (
              <Link key={q.to} to={q.to} className="qa">
                <span className="qa-icon">{q.icon}</span>
                <span className="qa-label">{q.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* my committees — quick switch */}
      {memberships.length > 1 && (
        <div>
          <div className="section-title">{t('home.myGroups')}</div>
          <div className="card p-0 overflow-hidden">
            {memberships.map((m) => (
              <button key={m.program_id}
                onClick={() => setCurrentProgramId(m.program_id)}
                className={`rowcard w-full text-left ${m.program_id === currentProgramId ? 'bg-brand-50/60' : ''}`}>
                <span className="tile tile-violet">🏛</span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-sm truncate block">
                    {m.programs?.name} {m.programs?.year}
                  </span>
                  <span className="text-xs text-stone-500 truncate block">
                    {m.programs?.committees?.organizations?.name} · {t(`roles.${m.role}`)}
                  </span>
                </span>
                {m.program_id === currentProgramId
                  ? <span className="chip-blue">✓</span>
                  : <span className="text-stone-300">›</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* tasks assigned to me */}
      {myTaskList.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="section-title mb-0">📋 {t('home.myTasksTitle')}</div>
            <Link to="/tasks" className="text-brand-600 text-sm font-semibold">{t('home.viewAll')} ›</Link>
          </div>
          <div className="card p-0 overflow-hidden">
            {myTaskList.slice(0, 5).map((tk) => (
              <Link key={tk.id} to="/tasks" className="rowcard text-sm">
                <span className={`w-2 h-2 rounded-full shrink-0 ${tk.status === 'in_progress' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                <span className="flex-1 truncate">{tk.title}</span>
                {tk.due_date && <span className="text-xs text-stone-500 shrink-0">{t('home.due')} {fmtDate(tk.due_date, i18n.language)}</span>}
              </Link>
            ))}
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

      {/* Needs attention */}
      {(pendingApprovals > 0 || (can('coupons') && couponOut > 0) || myTasks > 0) && (
        <div>
          <div className="section-title">{t('home.needsAttention')}</div>
          <div className="card p-0 overflow-hidden">
            {pendingApprovals > 0 && (
              <Link to="/expenses" className="rowcard">
                <span className="tile tile-amber">⏳</span>
                <span className="flex-1 text-sm">{pendingApprovals} {t('dashboard.pendingApprovals')}</span>
                <span className="text-stone-300">›</span>
              </Link>
            )}
            {can('coupons') && couponOut > 0 && (
              <Link to="/coupons" className="rowcard">
                <span className="tile tile-fuchsia">🎟️</span>
                <span className="flex-1 text-sm">{t('dashboard.couponPending')}: <b className="money">{fmtINR(couponOut)}</b></span>
                <span className="text-stone-300">›</span>
              </Link>
            )}
            {myTasks > 0 && (
              <Link to="/tasks" className="rowcard">
                <span className="tile tile-cyan">📋</span>
                <span className="flex-1 text-sm">{t('dashboard.myTasks')}: <b>{myTasks}</b></span>
                <span className="text-stone-300">›</span>
              </Link>
            )}
          </div>
        </div>
      )}

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
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="section-title mb-0">{t('dashboard.recent')}</div>
            <Link to="/transactions" className="text-brand-600 text-sm font-semibold">{t('common.view')} ›</Link>
          </div>
          <div className="card p-0 overflow-hidden">
            {recent.length === 0 && <div className="p-4 text-stone-400 text-sm">{t('common.none')}</div>}
            {recent.map((r) => (
              <div key={r.kind + r.id} className="px-4 py-3 flex justify-between border-b border-stone-50 last:border-0 text-sm">
                <span className="truncate mr-2">{r.label}</span>
                <span className={`money font-semibold shrink-0 ${r.kind === 'in' ? 'text-green-700' : 'text-red-700'}`}>
                  {r.kind === 'in' ? '+' : '−'} {fmtINR(r.amount)}
                  <span className="text-stone-400 font-normal ml-2">{fmtDate(r.date, i18n.language)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
