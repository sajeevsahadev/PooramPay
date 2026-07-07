/** Tiny dependency-free SVG charts, neon-styled. */

export function Donut({
  value, max, label, sub, size = 110,
}: { value: number; max: number; label: string; sub?: string; size?: number }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const over = max > 0 && value > max;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <defs>
        <linearGradient id="donut-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={over ? '#fb7185' : '#22d3ee'} />
          <stop offset="100%" stopColor={over ? '#f43f5e' : '#e879f9'} />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#261d49" strokeWidth="9" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="url(#donut-g)" strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ filter: 'drop-shadow(0 0 6px rgba(168,85,247,.7))', transition: 'stroke-dasharray .6s ease' }}
      />
      <text x="50%" y="47%" textAnchor="middle" fill="#ece7ff" fontSize={size / 5.2} fontWeight="800">
        {Math.round(pct * 100)}%
      </text>
      <text x="50%" y="63%" textAnchor="middle" fill="#a89ce0" fontSize={size / 10.5}>
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
          <stop offset="0%" stopColor="rgba(34,211,238,.45)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0)" />
        </linearGradient>
        <linearGradient id="spark-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="url(#spark-line)" strokeWidth="2.5" strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 0 4px rgba(34,211,238,.8))' }} />
    </svg>
  );
}

const BAR_COLORS = [
  'linear-gradient(90deg,#22d3ee,#2563eb)',
  'linear-gradient(90deg,#e879f9,#a855f7)',
  'linear-gradient(90deg,#a3e635,#10b981)',
  'linear-gradient(90deg,#fbbf24,#f97316)',
  'linear-gradient(90deg,#fb7185,#f43f5e)',
  'linear-gradient(90deg,#8b5cf6,#6366f1)',
  'linear-gradient(90deg,#2dd4bf,#0ea5e9)',
];

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
              borderRadius: 9999, backgroundImage: BAR_COLORS[i % BAR_COLORS.length],
              boxShadow: '0 0 8px rgba(168,85,247,.4)', transition: 'width .5s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}
