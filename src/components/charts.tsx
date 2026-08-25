/** Tiny dependency-free SVG charts, professional palette. */
import { useRef, useState } from 'react';

export function Donut({
  value, max, label, sub, size = 110,
}: { value: number; max: number; label: string; sub?: string; size?: number }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const over = max > 0 && value > max;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e7e5e4" strokeWidth="9" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={over ? '#dc2626' : '#4338ca'} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray .6s ease' }}
      />
      <text x="50%" y="47%" textAnchor="middle" fill="#1c1917" fontSize={size / 5.2} fontWeight="800">
        {Math.round(pct * 100)}%
      </text>
      <text x="50%" y="63%" textAnchor="middle" fill="#78716c" fontSize={size / 10.5}>
        {sub ?? label}
      </text>
    </svg>
  );
}

export function Sparkline({
  points, labels, format = (v) => String(v), width = 260, height = 64,
}: {
  points: number[]; labels?: string[]; format?: (v: number) => string;
  width?: number; height?: number;
}) {
  if (points.length === 0) points = [0];
  const max = Math.max(...points, 1);
  const stepX = width / Math.max(points.length - 1, 1);
  const xAt = (i: number) => i * stepX;
  const y = (v: number) => height - 6 - (v / max) * (height - 14);
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const track = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setActive(Math.round(frac * (points.length - 1)));
  };
  const leftPct = active === null ? 0 : Math.min(92, Math.max(8, (active / Math.max(points.length - 1, 1)) * 100));

  return (
    <div ref={ref} className="relative touch-none select-none cursor-crosshair"
      onPointerMove={(e) => track(e.clientX)}
      onPointerDown={(e) => track(e.clientX)}
      onPointerLeave={() => setActive(null)}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(67,56,202,.18)" />
            <stop offset="100%" stopColor="rgba(67,56,202,0)" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#spark-fill)" />
        <path d={line} fill="none" stroke="#4338ca" strokeWidth="2.5" strokeLinecap="round" />
        {active !== null && (
          <>
            <line x1={xAt(active)} y1="0" x2={xAt(active)} y2={height}
              stroke="#4338ca" strokeWidth="1" strokeDasharray="3 3" opacity="0.4"
              vectorEffect="non-scaling-stroke" />
            <circle cx={xAt(active)} cy={y(points[active])} r="4"
              fill="#4338ca" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {active !== null && (
        <div className="absolute -top-1 -translate-x-1/2 -translate-y-full pointer-events-none
          bg-stone-900 text-white text-[11px] rounded-md px-2 py-1 whitespace-nowrap shadow-lg z-10"
          style={{ left: `${leftPct}%` }}>
          <span className="font-semibold money">{format(points[active])}</span>
          {labels?.[active] && <span className="text-stone-300 ml-1.5">{labels[active]}</span>}
        </div>
      )}
    </div>
  );
}

const BAR_COLORS = ['#4338ca', '#0369a1', '#15803d', '#b45309', '#be123c', '#6d28d9', '#0f766e'];

export function MiniBars({
  data, format,
}: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="space-y-1">
      {data.map((d, i) => {
        const pct = Math.round((d.value / total) * 100);
        return (
          <div key={d.label} className="group rounded-lg px-1 py-1 -mx-1 hover:bg-stone-50 transition-colors">
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-stone-600">{d.label}</span>
              <span className="money font-semibold text-stone-700">
                {format(d.value)}
                <span className="ml-1.5 text-stone-400 font-normal opacity-0 group-hover:opacity-100 transition-opacity">
                  {pct}%
                </span>
              </span>
            </div>
            <div className="bar-track">
              <div style={{
                width: `${Math.max(3, (d.value / max) * 100)}%`, height: '100%',
                borderRadius: 9999, background: BAR_COLORS[i % BAR_COLORS.length],
                transition: 'width .5s ease',
              }} className="group-hover:brightness-110" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
