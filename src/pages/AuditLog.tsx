import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Empty } from '../components/ui';

interface AuditRow {
  id: number; table_name: string; action: string; actor: string | null;
  at: string; after: Record<string, unknown> | null; before: Record<string, unknown> | null;
}

const ACTION_ICON: Record<string, string> = {
  insert: '➕', update: '✏️', delete: '🗑', restore: '♻️', hard_delete: '❌',
};

export default function AuditLog() {
  const { t, i18n } = useTranslation();
  const { currentProgramId } = useApp();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actors, setActors] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!currentProgramId) return;
    supabase.from('audit_log').select('*').eq('program_id', currentProgramId)
      .order('at', { ascending: false }).limit(300)
      .then(async ({ data }) => {
        const list = (data ?? []) as AuditRow[];
        setRows(list);
        const ids = [...new Set(list.map((r) => r.actor).filter(Boolean))] as string[];
        if (ids.length) {
          const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', ids);
          setActors(new Map((profs ?? []).map((p) => [p.id, p.full_name || p.email])));
        }
      });
  }, [currentProgramId]);

  const describe = (r: AuditRow) => {
    const rec = (r.after ?? r.before ?? {}) as Record<string, unknown>;
    const amount = rec.amount ? ` ₹${Number(rec.amount).toLocaleString('en-IN')}` : '';
    const who = rec.payer_name || rec.holder_name || rec.vendor_name || rec.description || rec.title || rec.email || '';
    return `${r.table_name}${amount}${who ? ' · ' + who : ''}`;
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">📜 {t('audit.title')}</h1>
      {rows.length === 0 && <Empty />}
      <div className="card p-0 overflow-hidden">
        {rows.map((r) => (
          <div key={r.id} className="px-4 py-2.5 border-b border-stone-50 last:border-0 text-sm flex gap-2">
            <span>{ACTION_ICON[r.action] ?? '•'}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate">{describe(r)}</div>
              <div className="text-xs text-stone-400">
                {r.actor ? actors.get(r.actor) ?? '' : 'system'} ·{' '}
                {new Date(r.at).toLocaleString(i18n.language === 'ml' ? 'ml-IN' : 'en-IN')}
              </div>
            </div>
            <span className="chip-gray shrink-0 self-center">{r.action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
