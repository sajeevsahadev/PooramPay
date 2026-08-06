import type { House } from '../lib/types';

/** A scannable one-line register row, shared by Areas and the area detail page. */
export default function HouseRow({
  h, areaName, paid, onClick,
}: { h: House; areaName?: string; paid: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center justify-between gap-2 py-2 px-1 border-b border-stone-100 last:border-0 text-left hover:bg-stone-50">
      <div className="min-w-0 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${paid ? 'bg-green-500' : 'bg-stone-300'}`}
          title={paid ? 'paid' : 'not paid'} />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{h.name}</div>
          {(h.owner_name || h.phone) && (
            <div className="text-xs text-stone-500 truncate">
              {h.owner_name}{h.owner_name && h.phone ? ' · ' : ''}{h.phone}
              {areaName ? ` · ${areaName}` : ''}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 text-stone-400 text-sm">
        {h.gps_lat != null && <span title="location pinned">📍</span>}
        {h.in_subscription && <span title="weekly">📅</span>}
        <span>›</span>
      </div>
    </button>
  );
}
