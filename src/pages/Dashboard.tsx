import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase, fmtINR, fmtDate } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { friendlyError } from '../components/ui';

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
  const [pendingHandovers, setPendingHandovers] = useState<
    { id: string; amount: number; from_profile: string; name?: string }[]
  >([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    if (!currentProgramId) return;
    const pid = currentProgramId;
    const uid = session!.user.id;

    const [inc, exp, cash, books, tasks, hands] = await Promise.all([
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
        ? supabase.from('v_coupon_books').select('outstanding').eq('program_id', pid)
        : Promise.resolve({ data: [] as { outstanding: number }[] }),
      supabase.from('committee_tasks').select('id, program_members!assignee_member_id(profile_id)')
        .eq('program_id', pid).neq('status', 'done'),
      can('approve')
        ? supabase.from('cash_handovers').select('id, amount, from_profile')
            .eq('program_id', pid).eq('status', 'pending')
        : Promise.resolve({ data: [] as { id: string; amount: number; from_profile: string }[] }),
    ]);

    const rows: TxRow[] = [
      ...(inc.data ?? []).map((r) => ({
        id: r.id, kind: 'in' as const,
        label: `${t('collect.' + (r.entry_type === 'ad_brochure' || r.entry_type === 'ad_stage' ? r.entry_type : r.entry_type === 'house' ? 'house' : r.entry_type))}${r.payer_name ? ' · ' + r.payer_name : ''}`,
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
    setCouponOut(((books.data ?? []) as { outstanding: number }[])
      .reduce((s, b) => s + Number(b.outstanding || 0), 0));
    type TaskRow = { id: string; program_members: { profile_id: string | null } | null };
    setMyTasks(((tasks.data ?? []) as unknown as TaskRow[])
      .filter((x) => x.program_members?.profile_id === uid).length);
    setPendingHandovers((hands.data ?? []) as { id: string; amount: number; from_profile: string }[]);
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

  return (
    <div className="space-y-4">
      {msg && <div className="bg-brand-100 text-brand-800 rounded-lg p-3 text-sm" onClick={() => setMsg(null)}>{msg}</div>}

      {showMoney && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card bg-brand-800 text-white border-0">
            <div className="text-xs uppercase tracking-wide opacity-75">{t('dashboard.cashInHand')}</div>
            <div className="text-2xl font-black money">{fmtINR(finance?.cash_balance)}</div>
          </div>
          <div className="card bg-brand-700 text-white border-0">
            <div className="text-xs uppercase tracking-wide opacity-75">{t('dashboard.bankBalance')}</div>
            <div className="text-2xl font-black money">{fmtINR(finance?.bank_balance)}</div>
          </div>
          <div className="card">
            <div className="text-xs uppercase tracking-wide text-stone-500">{t('dashboard.collected')}</div>
            <div className="text-xl font-bold text-green-700 money">{fmtINR(finance?.income_total)}</div>
          </div>
          <div className="card">
            <div className="text-xs uppercase tracking-wide text-stone-500">{t('dashboard.spent')}</div>
            <div className="text-xl font-bold text-red-700 money">{fmtINR(finance?.expense_total)}</div>
          </div>
        </div>
      )}

      {/* Alerts */}
      <div className="space-y-2">
        {can('approve') && (finance?.pending_claims ?? 0) > 0 && (
          <Link to="/expenses" className="card flex justify-between items-center block hover:bg-brand-50">
            <span>⏳ {finance!.pending_claims} {t('dashboard.pendingApprovals')}</span><span>›</span>
          </Link>
        )}
        {can('coupons') && couponOut > 0 && (
          <Link to="/coupons" className="card flex justify-between items-center block hover:bg-brand-50">
            <span>🎟️ {t('dashboard.couponPending')}: <b className="money">{fmtINR(couponOut)}</b></span><span>›</span>
          </Link>
        )}
        {myTasks > 0 && (
          <Link to="/tasks" className="card flex justify-between items-center block hover:bg-brand-50">
            <span>📋 {t('dashboard.myTasks')}: <b>{myTasks}</b></span><span>›</span>
          </Link>
        )}
      </div>

      {/* My cash in hand */}
      {myCash > 0 && !frozen && (
        <div className="card flex items-center justify-between gap-3 border-amber-300 bg-amber-50">
          <div>
            <div className="text-xs text-stone-500">{t('dashboard.myCashInHand')}</div>
            <div className="text-lg font-bold money">{fmtINR(myCash)}</div>
          </div>
          <button className="btn-primary" onClick={handover}>{t('dashboard.handover')}</button>
        </div>
      )}

      {/* Treasurer: confirm handovers */}
      {pendingHandovers.map((h) => (
        <div key={h.id} className="card flex items-center justify-between gap-3 border-blue-300 bg-blue-50">
          <div className="text-sm">
            💵 {t('dashboard.handover')}: <b className="money">{fmtINR(h.amount)}</b>
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
