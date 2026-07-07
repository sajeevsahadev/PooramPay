import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, fmtINR } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Field, ErrorNote, friendlyError } from '../components/ui';

const TYPES = ['donation', 'interest', 'ad_brochure', 'ad_stage'] as const;

export default function CollectOther() {
  const { t } = useTranslation();
  const { currentProgramId, session, refreshFinance } = useApp();
  const [type, setType] = useState<string>('donation');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState('');
  const [mode, setMode] = useState('cash');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return setErr(t('common.required'));
    setBusy(true); setErr(null); setOk(null);
    try {
      const { data } = await supabase.from('income_entries').insert({
        program_id: currentProgramId,
        entry_type: type,
        amount: amt,
        mode,
        payer_name: payer || null,
        collected_by: session!.user.id,
        created_by: session!.user.id,
        notes: notes || null,
      }).select('receipt_no').single().throwOnError();
      setOk(`✓ ${t('collect.paymentSaved')} · ${t('collect.receiptNo')} #${(data as { receipt_no: number }).receipt_no} · ${fmtINR(amt)}`);
      setAmount(''); setPayer(''); setNotes('');
      refreshFinance();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-4">➕ {t('collect.other')}</h1>
      <ErrorNote msg={err} />
      {ok && <div className="bg-green-50 border border-green-300 text-green-800 rounded-lg p-3 mb-3 text-sm">{ok}</div>}
      <div className="card">
        <Field label={t('collect.source')}>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((x) => (
              <button key={x} onClick={() => setType(x)}
                className={`btn text-sm ${type === x ? 'bg-brand-700 text-white' : 'bg-surface border border-stone-300'}`}>
                {t(`collect.${x}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={type.startsWith('ad_') ? t('collect.advertiser') : t('collect.payerName')}>
          <input value={payer} onChange={(e) => setPayer(e.target.value)} />
        </Field>
        <Field label={t('common.amount')}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)}
            type="number" inputMode="decimal" min="1" className="text-2xl font-bold" />
        </Field>
        <Field label={t('collect.mode')}>
          <div className="grid grid-cols-3 gap-2">
            {['cash', 'upi', 'bank'].map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`btn ${mode === m ? 'bg-brand-700 text-white' : 'bg-surface border border-stone-300'}`}>
                {t(`collect.${m}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={`${t('common.notes')} (${t('common.optional')})`}>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button className="btn-primary w-full text-lg py-3" disabled={busy} onClick={save}>
          {t('collect.recordPayment')}
        </button>
      </div>
    </div>
  );
}
