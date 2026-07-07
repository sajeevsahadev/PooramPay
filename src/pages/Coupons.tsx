import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, fmtINR } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Field, ErrorNote, friendlyError, Modal, Empty, StatusChip } from '../components/ui';
import type { CouponBook, CouponScheme } from '../lib/types';

export default function Coupons() {
  const { t } = useTranslation();
  const { currentProgramId, session, isCommitteeAdmin, can, frozen, refreshFinance, current } = useApp();
  const [schemes, setSchemes] = useState<CouponScheme[]>([]);
  const [books, setBooks] = useState<CouponBook[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [showScheme, setShowScheme] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [remitBook, setRemitBook] = useState<CouponBook | null>(null);
  const [scheme, setScheme] = useState({ name: '', price: '', total: '', perBook: '25' });
  const [issue, setIssue] = useState({ schemeId: '', bookNo: '', holder: '', phone: '', count: '' });
  const [remit, setRemit] = useState({ amount: '', sold: '', mode: 'cash' });
  const [busy, setBusy] = useState(false);
  const treasurerish = isCommitteeAdmin || current?.role === 'treasurer';

  const load = async () => {
    if (!currentProgramId) return;
    const [s, b] = await Promise.all([
      supabase.from('coupon_schemes').select('*').eq('program_id', currentProgramId).order('created_at'),
      supabase.from('v_coupon_books').select('*').eq('program_id', currentProgramId).order('book_no'),
    ]);
    setSchemes((s.data ?? []) as CouponScheme[]);
    setBooks((b.data ?? []) as CouponBook[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentProgramId]);

  const saveScheme = async () => {
    setBusy(true); setErr(null);
    try {
      await supabase.from('coupon_schemes').insert({
        program_id: currentProgramId,
        name: scheme.name || 'Coupon',
        price: parseFloat(scheme.price),
        total_coupons: parseInt(scheme.total),
        coupons_per_book: parseInt(scheme.perBook) || 25,
        created_by: session!.user.id,
      }).throwOnError();
      setShowScheme(false); setScheme({ name: '', price: '', total: '', perBook: '25' });
      await load();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const saveIssue = async () => {
    setBusy(true); setErr(null);
    try {
      const s = schemes.find((x) => x.id === issue.schemeId) ?? schemes[0];
      if (!s) throw new Error(t('coupons.newScheme'));
      await supabase.from('coupon_books').insert({
        scheme_id: s.id,
        program_id: currentProgramId,
        book_no: issue.bookNo,
        coupons_count: parseInt(issue.count) || s.coupons_per_book,
        holder_name: issue.holder,
        holder_phone: issue.phone || null,
        created_by: session!.user.id,
      }).throwOnError();
      setShowIssue(false); setIssue({ schemeId: '', bookNo: '', holder: '', phone: '', count: '' });
      await load();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const saveRemit = async () => {
    if (!remitBook) return;
    setBusy(true); setErr(null);
    try {
      await supabase.rpc('record_coupon_remit', {
        p_book: remitBook.id,
        p_amount: parseFloat(remit.amount),
        p_sold: parseInt(remit.sold) || 0,
        p_mode: remit.mode,
      }).throwOnError();
      setRemitBook(null); setRemit({ amount: '', sold: '', mode: 'cash' });
      await load(); refreshFinance();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const totals = books.reduce(
    (a, b) => ({
      sold: a.sold + Number(b.sold_value ?? 0),
      remitted: a.remitted + Number(b.remitted ?? 0),
      out: a.out + Number(b.outstanding ?? 0),
    }),
    { sold: 0, remitted: 0, out: 0 },
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">🎟️ {t('coupons.title')}</h1>
        {treasurerish && !frozen && (
          <div className="flex gap-2">
            <button className="btn-secondary text-sm" onClick={() => setShowScheme(true)}>
              ＋ {t('coupons.scheme')}
            </button>
            <button className="btn-primary text-sm" onClick={() => setShowIssue(true)}
              disabled={schemes.length === 0}>
              ＋ {t('coupons.issueBook')}
            </button>
          </div>
        )}
      </div>
      <ErrorNote msg={err} />

      {schemes.map((s) => (
        <div key={s.id} className="card mb-3 flex justify-between text-sm">
          <div>
            <b>{s.name}</b> · {fmtINR(s.price)} × {s.total_coupons}
          </div>
          <div className="text-stone-500">{t('coupons.couponsPerBook')}: {s.coupons_per_book}</div>
        </div>
      ))}

      {books.length > 0 && (
        <div className="card mb-3 grid grid-cols-3 text-center text-sm">
          <div><div className="text-stone-500 text-xs">{t('coupons.sold')}</div><b className="money">{fmtINR(totals.sold)}</b></div>
          <div><div className="text-stone-500 text-xs">{t('coupons.remitted')}</div><b className="money text-green-700">{fmtINR(totals.remitted)}</b></div>
          <div><div className="text-stone-500 text-xs">{t('coupons.outstanding')}</div><b className="money text-red-700">{fmtINR(totals.out)}</b></div>
        </div>
      )}

      {books.length === 0 && <Empty />}
      <div className="space-y-2">
        {books.map((b) => (
          <div key={b.id} className="card">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold">{t('coupons.book')} {b.book_no} <StatusChip status={b.status} /></div>
                <div className="text-sm text-stone-600">{b.holder_name}{b.holder_phone ? ` · ${b.holder_phone}` : ''}</div>
                <div className="text-xs text-stone-500 mt-1">
                  {t('coupons.soldCount')}: {b.sold_count}/{b.coupons_count} ·
                  {' '}{t('coupons.remitted')}: <span className="money">{fmtINR(b.remitted)}</span>
                  {Number(b.outstanding) > 0 && (
                    <> · {t('coupons.outstanding')}: <b className="money text-red-700">{fmtINR(b.outstanding)}</b></>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2 w-56 max-w-full">
                  <div className="bar-track flex-1" title={t('coupons.sold')}>
                    <div className="bar-fill" style={{ width: `${Math.min(100, (b.sold_count / Math.max(b.coupons_count, 1)) * 100)}%` }} />
                  </div>
                  <div className="bar-track flex-1" title={t('coupons.remitted')}>
                    <div className={Number(b.outstanding) > 0 ? 'bar-fill-red' : 'bar-fill-green'}
                      style={{ width: `${Number(b.sold_value) > 0 ? Math.min(100, (Number(b.remitted) / Number(b.sold_value)) * 100) : 0}%` }} />
                  </div>
                </div>
              </div>
              {can('collect') && !frozen && b.status !== 'settled' && b.status !== 'returned' && (
                <button className="btn-secondary text-sm shrink-0" onClick={() => setRemitBook(b)}>
                  {t('coupons.recordRemit')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showScheme && (
        <Modal title={t('coupons.newScheme')} onClose={() => setShowScheme(false)}>
          <Field label={t('common.name')}>
            <input value={scheme.name} onChange={(e) => setScheme({ ...scheme, name: e.target.value })} />
          </Field>
          <Field label={t('coupons.denomination')}>
            <input type="number" inputMode="decimal" value={scheme.price}
              onChange={(e) => setScheme({ ...scheme, price: e.target.value })} placeholder="500" />
          </Field>
          <Field label={t('coupons.totalCoupons')}>
            <input type="number" inputMode="numeric" value={scheme.total}
              onChange={(e) => setScheme({ ...scheme, total: e.target.value })} placeholder="5000" />
          </Field>
          <Field label={t('coupons.couponsPerBook')}>
            <input type="number" inputMode="numeric" value={scheme.perBook}
              onChange={(e) => setScheme({ ...scheme, perBook: e.target.value })} />
          </Field>
          <button className="btn-primary w-full" disabled={busy} onClick={saveScheme}>{t('common.save')}</button>
        </Modal>
      )}

      {showIssue && (
        <Modal title={t('coupons.issueBook')} onClose={() => setShowIssue(false)}>
          {schemes.length > 1 && (
            <Field label={t('coupons.scheme')}>
              <select value={issue.schemeId} onChange={(e) => setIssue({ ...issue, schemeId: e.target.value })}>
                {schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <Field label={t('coupons.bookNo')}>
            <input value={issue.bookNo} onChange={(e) => setIssue({ ...issue, bookNo: e.target.value })} placeholder="B-001" />
          </Field>
          <Field label={t('coupons.holder')}>
            <input value={issue.holder} onChange={(e) => setIssue({ ...issue, holder: e.target.value })} />
          </Field>
          <Field label={t('coupons.holderPhone')}>
            <input value={issue.phone} type="tel" onChange={(e) => setIssue({ ...issue, phone: e.target.value })} />
          </Field>
          <Field label={`${t('coupons.totalCoupons')} (${t('common.optional')})`}>
            <input value={issue.count} type="number" inputMode="numeric"
              onChange={(e) => setIssue({ ...issue, count: e.target.value })}
              placeholder={String(schemes[0]?.coupons_per_book ?? 25)} />
          </Field>
          <button className="btn-primary w-full" disabled={busy || !issue.bookNo || !issue.holder}
            onClick={saveIssue}>{t('common.save')}</button>
        </Modal>
      )}

      {remitBook && (
        <Modal title={`${t('coupons.recordRemit')} — ${t('coupons.book')} ${remitBook.book_no}`}
          onClose={() => setRemitBook(null)}>
          <p className="text-sm text-stone-500 mb-3">{remitBook.holder_name}</p>
          <Field label={t('common.amount')}>
            <input type="number" inputMode="decimal" value={remit.amount}
              onChange={(e) => setRemit({ ...remit, amount: e.target.value })} className="text-2xl font-bold" />
          </Field>
          <Field label={t('coupons.soldCount')}>
            <input type="number" inputMode="numeric" value={remit.sold}
              onChange={(e) => setRemit({ ...remit, sold: e.target.value })} />
          </Field>
          <Field label={t('collect.mode')}>
            <div className="grid grid-cols-3 gap-2">
              {['cash', 'upi', 'bank'].map((m) => (
                <button key={m} onClick={() => setRemit({ ...remit, mode: m })}
                  className={`btn ${remit.mode === m ? 'bg-brand-700 text-white' : 'bg-surface border border-stone-300'}`}>
                  {t(`collect.${m}`)}
                </button>
              ))}
            </div>
          </Field>
          <button className="btn-primary w-full" disabled={busy || !remit.amount} onClick={saveRemit}>
            {t('common.save')}
          </button>
        </Modal>
      )}
    </div>
  );
}
