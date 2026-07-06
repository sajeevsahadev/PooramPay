import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, fmtINR, fmtDate } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Field, ErrorNote, friendlyError, Modal, Empty, StatusChip } from '../components/ui';
import type { Expense, ExpenseHead } from '../lib/types';

type Tab = 'mine' | 'approvals' | 'payables' | 'advances';

export default function Expenses() {
  const { t, i18n } = useTranslation();
  const { currentProgramId, session, can, frozen, refreshFinance, isCommitteeAdmin, current } = useApp();
  const [tab, setTab] = useState<Tab>('mine');
  const [heads, setHeads] = useState<ExpenseHead[]>([]);
  const [rows, setRows] = useState<Expense[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState<null | 'claim' | 'wallet' | 'advance'>(null);
  const [form, setForm] = useState({
    headId: '', amount: '', description: '', vendor: '', mode: 'cash', eventDay: '', file: null as File | null,
  });
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<Expense | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const treasurerish = isCommitteeAdmin || current?.role === 'treasurer' || can('approve');

  const load = async () => {
    if (!currentProgramId) return;
    const [h, e] = await Promise.all([
      supabase.from('expense_heads').select('*').eq('program_id', currentProgramId).order('sort_order'),
      supabase.from('expenses').select('*').eq('program_id', currentProgramId)
        .is('deleted_at', null).order('created_at', { ascending: false }).limit(300),
    ]);
    setHeads((h.data ?? []) as ExpenseHead[]);
    setRows((e.data ?? []) as Expense[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentProgramId]);

  const headName = (id: string) => {
    const h = heads.find((x) => x.id === id);
    return (i18n.language === 'ml' && h?.name_ml) ? h.name_ml : h?.name ?? '';
  };

  const uploadBill = async (file: File): Promise<string | null> => {
    const path = `${currentProgramId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    const { error } = await supabase.storage.from('bills').upload(path, file);
    if (error) throw error;
    return path;
  };

  const save = async () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0 || !form.headId) return setErr(t('common.required'));
    setBusy(true); setErr(null);
    try {
      let billUrl: string | null = null;
      if (form.file) billUrl = await uploadBill(form.file);
      const kind = showNew === 'claim' ? 'claim' : showNew === 'advance' ? 'advance' : 'wallet';
      await supabase.from('expenses').insert({
        program_id: currentProgramId,
        head_id: form.headId,
        kind,
        amount: amt,
        description: form.description || null,
        vendor_name: form.vendor || null,
        mode: form.mode,
        event_day: form.eventDay ? parseInt(form.eventDay) : null,
        bill_url: billUrl,
        claimant: kind === 'claim' ? session!.user.id : null,
        status: kind === 'claim' ? 'pending' : 'paid',
        paid_at: kind === 'claim' ? null : new Date().toISOString(),
        paid_by: kind === 'claim' ? null : session!.user.id,
        created_by: session!.user.id,
      }).throwOnError();
      setShowNew(null);
      setForm({ headId: '', amount: '', description: '', vendor: '', mode: 'cash', eventDay: '', file: null });
      await load(); refreshFinance();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const decide = async (exp: Expense, approve: boolean, reason?: string) => {
    setBusy(true); setErr(null);
    try {
      await supabase.rpc('approve_expense', {
        p_id: exp.id, p_approve: approve, p_reason: reason ?? null,
      }).throwOnError();
      setRejecting(null); setRejectReason('');
      await load(); refreshFinance();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const pay = async (exp: Expense) => {
    setBusy(true); setErr(null);
    try {
      await supabase.rpc('pay_expense', { p_id: exp.id, p_mode: exp.mode }).throwOnError();
      await load(); refreshFinance();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const openBill = async (path: string) => {
    const { data } = await supabase.storage.from('bills').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const mine = rows.filter((r) => r.claimant === session!.user.id || r.created_by === session!.user.id);
  const pending = rows.filter((r) => r.status === 'pending');
  const payables = rows.filter((r) => r.status === 'approved');
  const advances = rows.filter((r) => r.kind === 'advance' || r.kind === 'advance_settlement');

  const tabs: { id: Tab; label: string; count?: number; show: boolean }[] = [
    { id: 'mine', label: t('expenses.myClaims'), show: true },
    { id: 'approvals', label: t('expenses.approvals'), count: pending.length, show: treasurerish },
    { id: 'payables', label: t('expenses.payables'), count: payables.length, show: treasurerish },
    { id: 'advances', label: t('expenses.advances'), show: treasurerish },
  ];

  const list = tab === 'mine' ? mine : tab === 'approvals' ? pending : tab === 'payables' ? payables : advances;

  const ExpCard = ({ r }: { r: Expense }) => (
    <div className="card">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">
            {r.description || r.vendor_name || headName(r.head_id)}
          </div>
          <div className="text-xs text-stone-500">
            {headName(r.head_id)} · {fmtDate(r.expense_date, i18n.language)}
            {r.kind !== 'wallet' && <> · {t(`expenses.${r.kind === 'claim' ? 'ownPocket' : 'advance'}`)}</>}
            {r.event_day && <> · {t('expenses.eventDay')} {r.event_day}</>}
          </div>
          {r.reject_reason && <div className="text-xs text-red-600 mt-1">{r.reject_reason}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold money">{fmtINR(r.amount)}</div>
          <StatusChip status={r.status} />
        </div>
      </div>
      <div className="flex gap-2 mt-2 flex-wrap">
        {r.bill_url && (
          <button className="btn-secondary text-xs py-1" onClick={() => openBill(r.bill_url!)}>
            📎 {t('expenses.billPhoto')}
          </button>
        )}
        {tab === 'approvals' && r.status === 'pending' && !frozen && (
          <>
            <button className="btn-primary text-sm py-1.5" disabled={busy} onClick={() => decide(r, true)}>
              ✓ {t('expenses.approve')}
            </button>
            <button className="btn-danger text-sm py-1.5" disabled={busy} onClick={() => setRejecting(r)}>
              ✕ {t('expenses.reject')}
            </button>
          </>
        )}
        {tab === 'payables' && r.status === 'approved' && !frozen && (
          <button className="btn-primary text-sm py-1.5" disabled={busy} onClick={() => pay(r)}>
            💸 {t('expenses.markPaid')}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold">🧾 {t('expenses.title')}</h1>
        {!frozen && (
          <div className="flex gap-2">
            {can('expense') && (
              <button className="btn-primary text-sm" onClick={() => setShowNew('claim')}>
                ＋ {t('expenses.newClaim')}
              </button>
            )}
            {treasurerish && (
              <button className="btn-secondary text-sm" onClick={() => setShowNew('wallet')}>
                ＋ {t('expenses.newExpense')}
              </button>
            )}
          </div>
        )}
      </div>
      <ErrorNote msg={err} />

      <div className="flex gap-1 mb-3 overflow-x-auto">
        {tabs.filter((x) => x.show).map((x) => (
          <button key={x.id} onClick={() => setTab(x.id)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
              tab === x.id ? 'bg-brand-700 text-white font-semibold' : 'bg-white border border-stone-300'}`}>
            {x.label}{x.count ? ` (${x.count})` : ''}
          </button>
        ))}
      </div>

      {list.length === 0 && <Empty />}
      <div className="space-y-2">{list.map((r) => <ExpCard key={r.id} r={r} />)}</div>

      {showNew && (
        <Modal
          title={showNew === 'claim' ? t('expenses.newClaim') : showNew === 'advance' ? t('expenses.advance') : t('expenses.newExpense')}
          onClose={() => setShowNew(null)}>
          {showNew !== 'claim' && treasurerish && (
            <div className="flex gap-2 mb-3">
              <button onClick={() => setShowNew('wallet')}
                className={`btn text-sm flex-1 ${showNew === 'wallet' ? 'bg-brand-700 text-white' : 'bg-white border border-stone-300'}`}>
                {t('expenses.wallet')}
              </button>
              <button onClick={() => setShowNew('advance')}
                className={`btn text-sm flex-1 ${showNew === 'advance' ? 'bg-brand-700 text-white' : 'bg-white border border-stone-300'}`}>
                {t('expenses.advance')}
              </button>
            </div>
          )}
          <Field label={t('expenses.head')}>
            <select value={form.headId} onChange={(e) => setForm({ ...form, headId: e.target.value })}>
              <option value="">— {t('common.select')} —</option>
              {heads.map((h) => (
                <option key={h.id} value={h.id}>
                  {(i18n.language === 'ml' && h.name_ml) ? h.name_ml : h.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('common.amount')}>
            <input type="number" inputMode="decimal" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} className="text-2xl font-bold" />
          </Field>
          <Field label={`${t('expenses.vendor')} (${t('common.optional')})`}>
            <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
          </Field>
          <Field label={t('common.notes')}>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('collect.mode')}>
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                {['cash', 'upi', 'bank'].map((m) => <option key={m} value={m}>{t(`collect.${m}`)}</option>)}
              </select>
            </Field>
            <Field label={`${t('expenses.eventDay')} (${t('common.optional')})`}>
              <input type="number" inputMode="numeric" value={form.eventDay}
                onChange={(e) => setForm({ ...form, eventDay: e.target.value })} placeholder="1" />
            </Field>
          </div>
          <Field label={`${t('expenses.billPhoto')} (${showNew === 'claim' ? t('common.required') : t('common.optional')})`}>
            <input type="file" accept="image/*" capture="environment"
              onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })}
              className="text-sm" />
          </Field>
          <button className="btn-primary w-full mt-2" onClick={save}
            disabled={busy || !form.headId || !form.amount || (showNew === 'claim' && !form.file)}>
            {showNew === 'claim' ? t('common.submit') : t('common.save')}
          </button>
        </Modal>
      )}

      {rejecting && (
        <Modal title={t('expenses.reject')} onClose={() => setRejecting(null)}>
          <p className="text-sm mb-3">{rejecting.description || headName(rejecting.head_id)} · <b className="money">{fmtINR(rejecting.amount)}</b></p>
          <Field label={t('expenses.rejectReason')}>
            <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </Field>
          <button className="btn-danger w-full" disabled={busy || !rejectReason.trim()}
            onClick={() => decide(rejecting, false, rejectReason.trim())}>
            {t('expenses.reject')}
          </button>
        </Modal>
      )}
    </div>
  );
}
