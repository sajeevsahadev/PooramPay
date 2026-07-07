/** Tiny dependency-free SVG charts, professional palette. */

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
  points, width = 260, height = 64,
}: { points: number[]; width?: number; height?: number }) {
  if (points.length === 0) points = [0];
  const max = Math.max(...points, 1);
  const stepX = width / Math.max(points.length - 1, 1);
  const y = (v: number) => height - 6 - (v / max) * (height - 14);
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(67,56,202,.18)" />
          <stop offset="100%" stopColor="rgba(67,56,202,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="#4338ca" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

const BAR_COLORS = ['#4338ca', '#0369a1', '#15803d', '#b45309', '#be123c', '#6d28d9', '#0f766e'];

export function MiniBars({
  data, format,
}: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={d.label}>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-stone-600">{d.label}</span>
            <span className="money font-semibold text-stone-700">{format(d.value)}</span>
          </div>
          <div className="bar-track">
            <div style={{
              width: `${Math.max(3, (d.value / max) * 100)}%`, height: '100%',
              borderRadius: 9999, background: BAR_COLORS[i % BAR_COLORS.length],
              transition: 'width .5s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}
