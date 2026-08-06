import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { ErrorNote, friendlyError } from '../components/ui';
import { incomeTypeLabel, useUnits } from '../lib/units';
import type { BudgetItem, ExpenseHead } from '../lib/types';

const INCOME_TYPES = ['house', 'coupon', 'subscription', 'interest', 'ad_brochure', 'ad_stage', 'donation'];

// Module-scoped so its identity is stable across renders. Defining it inside the
// component would remount the inputs on every keystroke (mobile keyboard closes).
function BudgetRow({
  label, value, notes, disabled, notesLabel, onChange, onNotes,
}: {
  label: string; value: string; notes: string; disabled: boolean; notesLabel: string;
  onChange: (v: string) => void; onNotes: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-2 border-b border-stone-50 last:border-0">
      <span className="w-28 sm:w-36 shrink-0 text-sm">{label}</span>
      <input type="text" disabled={disabled} className="flex-1 min-w-[120px] text-sm py-1.5"
        value={notes} placeholder={notesLabel} onChange={(e) => onNotes(e.target.value)} />
      <input type="number" inputMode="decimal" disabled={disabled}
        className="w-24 text-right money py-1.5" value={value} placeholder="0"
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function Budget() {
  const { t, i18n } = useTranslation();
  const { currentProgramId, isCommitteeAdmin, frozen } = useApp();
  const { unit } = useUnits();
  const [heads, setHeads] = useState<ExpenseHead[]>([]);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!currentProgramId) return;
    Promise.all([
      supabase.from('expense_heads').select('*').eq('program_id', currentProgramId).order('sort_order'),
      supabase.from('budget_items').select('*').eq('program_id', currentProgramId),
    ]).then(([h, b]) => {
      setHeads((h.data ?? []) as ExpenseHead[]);
      const list = (b.data ?? []) as BudgetItem[];
      setItems(list);
      const v: Record<string, string> = {};
      const n: Record<string, string> = {};
      for (const it of list) {
        const k = it.side === 'income' ? `i:${it.income_type}` : `e:${it.head_id}`;
        v[k] = String(it.planned);
        if (it.notes) n[k] = it.notes;
      }
      setValues(v);
      setNotes(n);
    });
  }, [currentProgramId]);

  const save = async () => {
    setBusy(true); setErr(null); setSaved(false);
    try {
      const rows: Omit<BudgetItem, 'id'>[] = [];
      for (const ty of INCOME_TYPES) {
        const k = `i:${ty}`;
        rows.push({
          program_id: currentProgramId!, side: 'income', income_type: ty, head_id: null,
          planned: parseFloat(values[k] || '0') || 0, notes: notes[k]?.trim() || null,
        });
      }
      for (const h of heads) {
        const k = `e:${h.id}`;
        rows.push({
          program_id: currentProgramId!, side: 'expense', income_type: null, head_id: h.id,
          planned: parseFloat(values[k] || '0') || 0, notes: notes[k]?.trim() || null,
        });
      }
      // upsert by natural key: delete + insert (committee_admin only anyway).
      // keep rows that have an amount OR a note.
      await supabase.from('budget_items').delete().eq('program_id', currentProgramId).throwOnError();
      await supabase.from('budget_items').insert(rows.filter((r) => r.planned > 0 || r.notes)).throwOnError();
      setSaved(true);
      const { data } = await supabase.from('budget_items').select('*').eq('program_id', currentProgramId);
      setItems((data ?? []) as BudgetItem[]);
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const totalIncome = INCOME_TYPES.reduce((s, ty) => s + (parseFloat(values[`i:${ty}`] || '0') || 0), 0);
  const totalExpense = heads.reduce((s, h) => s + (parseFloat(values[`e:${h.id}`] || '0') || 0), 0);
  const editable = isCommitteeAdmin && !frozen;
  const setVal = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));
  const setNote = (k: string, v: string) => setNotes((p) => ({ ...p, [k]: v }));
  const notesLabel = `${t('common.notes')} (${t('common.optional')})`;

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-1">🎯 {t('setup.budgetSetup')}</h1>
      <p className="text-sm text-stone-500 mb-4">{t('setup.budgetHelp')}</p>
      <ErrorNote msg={err} />
      {saved && <div className="bg-green-50 border border-green-300 text-green-800 rounded-lg p-3 mb-3 text-sm">✓ {t('common.saved')}</div>}
      {items.length === 0 && !editable && <p className="text-stone-400">{t('common.none')}</p>}

      <div className="card mb-4">
        <div className="font-bold text-green-700 mb-2">{t('reports.income')} — ₹{totalIncome.toLocaleString('en-IN')}</div>
        {INCOME_TYPES.map((ty) => (
          <BudgetRow key={ty} label={incomeTypeLabel(t, ty, unit)} disabled={!editable} notesLabel={notesLabel}
            value={values[`i:${ty}`] ?? ''} notes={notes[`i:${ty}`] ?? ''}
            onChange={(v) => setVal(`i:${ty}`, v)} onNotes={(v) => setNote(`i:${ty}`, v)} />
        ))}
      </div>
      <div className="card mb-4">
        <div className="font-bold text-red-700 mb-2">{t('reports.expense')} — ₹{totalExpense.toLocaleString('en-IN')}</div>
        {heads.map((h) => (
          <BudgetRow key={h.id} disabled={!editable} notesLabel={notesLabel}
            label={(i18n.language === 'ml' && h.name_ml) ? h.name_ml : h.name}
            value={values[`e:${h.id}`] ?? ''} notes={notes[`e:${h.id}`] ?? ''}
            onChange={(v) => setVal(`e:${h.id}`, v)} onNotes={(v) => setNote(`e:${h.id}`, v)} />
        ))}
      </div>
      {editable && (
        <button className="btn-primary w-full" disabled={busy} onClick={save}>{t('common.save')}</button>
      )}
    </div>
  );
}
