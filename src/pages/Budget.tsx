import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { ErrorNote, friendlyError } from '../components/ui';
import type { BudgetItem, ExpenseHead } from '../lib/types';

const INCOME_TYPES = ['house', 'coupon', 'subscription', 'interest', 'ad_brochure', 'ad_stage', 'donation'];

export default function Budget() {
  const { t, i18n } = useTranslation();
  const { currentProgramId, isCommitteeAdmin, frozen } = useApp();
  const [heads, setHeads] = useState<ExpenseHead[]>([]);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
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
      for (const it of list) {
        v[it.side === 'income' ? `i:${it.income_type}` : `e:${it.head_id}`] = String(it.planned);
      }
      setValues(v);
    });
  }, [currentProgramId]);

  const save = async () => {
    setBusy(true); setErr(null); setSaved(false);
    try {
      const rows: Omit<BudgetItem, 'id'>[] = [];
      for (const ty of INCOME_TYPES) {
        const val = parseFloat(values[`i:${ty}`] || '0') || 0;
        rows.push({ program_id: currentProgramId!, side: 'income', income_type: ty, head_id: null, planned: val });
      }
      for (const h of heads) {
        const val = parseFloat(values[`e:${h.id}`] || '0') || 0;
        rows.push({ program_id: currentProgramId!, side: 'expense', income_type: null, head_id: h.id, planned: val });
      }
      // upsert by natural key: delete + insert (committee_admin only anyway)
      await supabase.from('budget_items').delete().eq('program_id', currentProgramId).throwOnError();
      await supabase.from('budget_items').insert(rows.filter((r) => r.planned > 0)).throwOnError();
      setSaved(true);
      const { data } = await supabase.from('budget_items').select('*').eq('program_id', currentProgramId);
      setItems((data ?? []) as BudgetItem[]);
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const totalIncome = INCOME_TYPES.reduce((s, ty) => s + (parseFloat(values[`i:${ty}`] || '0') || 0), 0);
  const totalExpense = heads.reduce((s, h) => s + (parseFloat(values[`e:${h.id}`] || '0') || 0), 0);
  const editable = isCommitteeAdmin && !frozen;

  const Row = ({ k, label }: { k: string; label: string }) => (
    <div className="flex items-center gap-3 py-1.5 border-b border-stone-50 last:border-0">
      <span className="flex-1 text-sm">{label}</span>
      <input type="number" inputMode="decimal" disabled={!editable}
        className="w-36 text-right money"
        value={values[k] ?? ''} placeholder="0"
        onChange={(e) => setValues((p) => ({ ...p, [k]: e.target.value }))} />
    </div>
  );

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-1">🎯 {t('setup.budgetSetup')}</h1>
      <p className="text-sm text-stone-500 mb-4">{t('setup.budgetHelp')}</p>
      <ErrorNote msg={err} />
      {saved && <div className="bg-green-50 border border-green-300 text-green-800 rounded-lg p-3 mb-3 text-sm">✓ {t('common.saved')}</div>}
      {items.length === 0 && !editable && <p className="text-stone-400">{t('common.none')}</p>}

      <div className="card mb-4">
        <div className="font-bold text-green-700 mb-2">{t('reports.income')} — ₹{totalIncome.toLocaleString('en-IN')}</div>
        {INCOME_TYPES.map((ty) => <Row key={ty} k={`i:${ty}`} label={t('collect.' + ty)} />)}
      </div>
      <div className="card mb-4">
        <div className="font-bold text-red-700 mb-2">{t('reports.expense')} — ₹{totalExpense.toLocaleString('en-IN')}</div>
        {heads.map((h) => (
          <Row key={h.id} k={`e:${h.id}`}
            label={(i18n.language === 'ml' && h.name_ml) ? h.name_ml : h.name} />
        ))}
      </div>
      {editable && (
        <button className="btn-primary w-full" disabled={busy} onClick={save}>{t('common.save')}</button>
      )}
    </div>
  );
}
