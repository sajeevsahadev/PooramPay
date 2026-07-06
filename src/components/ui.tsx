import { useTranslation } from 'react-i18next';

export function Spinner() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center py-16 text-stone-500">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-700 border-t-transparent mr-3" />
      {t('common.loading')}
    </div>
  );
}

export function Empty({ label }: { label?: string }) {
  const { t } = useTranslation();
  return <div className="text-center text-stone-400 py-10">{label ?? t('common.none')}</div>;
}

export function Modal({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="text-stone-400 text-2xl leading-none px-2">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label, children, hint,
}: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block mb-3">
      <span className="block text-sm font-semibold text-stone-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-stone-400 mt-1">{hint}</span>}
    </label>
  );
}

export function StatusChip({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<string, { cls: string; key: string }> = {
    pending: { cls: 'chip-amber', key: 'expenses.pending' },
    approved: { cls: 'chip-blue', key: 'expenses.approved' },
    rejected: { cls: 'chip-red', key: 'expenses.rejected' },
    paid: { cls: 'chip-green', key: 'expenses.paid' },
    issued: { cls: 'chip-amber', key: 'coupons.issued' },
    partly: { cls: 'chip-blue', key: 'coupons.partly' },
    settled: { cls: 'chip-green', key: 'coupons.settled' },
    returned: { cls: 'chip-gray', key: 'coupons.returned' },
    active: { cls: 'chip-green', key: 'setup.active' },
    frozen: { cls: 'chip-gray', key: 'setup.frozen' },
    confirmed: { cls: 'chip-green', key: 'common.done' },
  };
  const m = map[status] ?? { cls: 'chip-gray', key: status };
  return <span className={m.cls}>{m.key.includes('.') ? t(m.key) : status}</span>;
}

export function ErrorNote({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-3 text-sm">{msg}</div>;
}

/** Translate a raised DB error into something a villager can read. */
export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (msg.includes('PROGRAM_FROZEN')) return 'This program is frozen — records are read-only.';
  if (msg.includes('NOT_ALLOWED')) return 'You do not have permission for this action.';
  if (msg.includes('REASON_REQUIRED')) return 'A reason is required.';
  if (msg.includes('NOTHING_TO_HANDOVER')) return 'You are not holding any cash right now.';
  if (msg.includes('row-level security')) return 'You do not have permission for this action.';
  return msg;
}
