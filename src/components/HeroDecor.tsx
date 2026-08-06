/**
 * Subtle Kerala-festival motifs for the dashboard hero card — a pookalam (floral
 * mandala), kudamattam parasols, fireworks and a festoon. Gold/white line-art at
 * low opacity so the balance figures stay perfectly readable. Concentrated on the
 * right so the left (where the amounts sit) stays clean. Purely decorative.
 */
const GOLD = '#ffd571';
const WARM = '#ffc58a';

// a ring of small "petals" for the pookalam
function ring(cx: number, cy: number, r: number, n: number, pr: number, color: string, opacity: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return <circle key={`${r}-${i}`} cx={cx + Math.cos(a) * r} cy={cy + Math.sin(a) * r} r={pr} fill={color} opacity={opacity} />;
  });
}

// a firework starburst
function spark(cx: number, cy: number, s: number, color: string, opacity: number) {
  return (
    <g opacity={opacity} stroke={color} strokeWidth="2" strokeLinecap="round">
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <line key={i} x1={cx + Math.cos(a) * s * 0.3} y1={cy + Math.sin(a) * s * 0.3}
          x2={cx + Math.cos(a) * s} y2={cy + Math.sin(a) * s} />;
      })}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <circle key={`d${i}`} cx={cx + Math.cos(a) * s} cy={cy + Math.sin(a) * s} r="2.4" fill={color} />;
      })}
    </g>
  );
}

// a kudamattam parasol (dome + finial)
function parasol(cx: number, cy: number, r: number, opacity: number) {
  return (
    <g opacity={opacity}>
      <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z`} fill={GOLD} />
      <path d={`M${cx - r} ${cy} q ${r / 3} 12 ${(2 * r) / 3} 0 q ${r / 3} 12 ${(2 * r) / 3} 0`}
        fill="none" stroke={GOLD} strokeWidth="2" />
      <line x1={cx} y1={cy} x2={cx} y2={cy + r * 0.85} stroke={GOLD} strokeWidth="2" />
      <line x1={cx} y1={cy - r * 0.55} x2={cx} y2={cy - r * 0.85} stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      <circle cx={cx} cy={cy - r * 0.9} r="2.6" fill={GOLD} />
    </g>
  );
}

export default function HeroDecor() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true"
      viewBox="0 0 800 200" preserveAspectRatio="xMidYMid slice">
      {/* festoon across the top */}
      <path d="M-10 22 Q 60 46 130 22 T 270 22 T 410 22 T 550 22 T 690 22 T 830 22"
        fill="none" stroke={GOLD} strokeWidth="2" opacity="0.2" />
      <g opacity="0.2" fill={GOLD}>
        {Array.from({ length: 13 }, (_, i) => <circle key={i} cx={-10 + i * 70} cy={i % 2 ? 40 : 22} r="3" />)}
      </g>

      {/* pookalam (floral mandala), right side */}
      <g>
        <circle cx="660" cy="104" r="16" fill={GOLD} opacity="0.16" />
        {ring(660, 104, 34, 8, 6, WARM, 0.14)}
        {ring(660, 104, 62, 14, 6, GOLD, 0.12)}
        {ring(660, 104, 92, 20, 5, '#ffffff', 0.1)}
        {ring(660, 104, 122, 26, 4.5, GOLD, 0.09)}
      </g>

      {/* kudamattam parasols */}
      {parasol(520, 70, 24, 0.16)}
      {parasol(772, 132, 28, 0.15)}

      {/* fireworks */}
      {spark(470, 120, 26, '#ffffff', 0.14)}
      {spark(784, 58, 20, GOLD, 0.18)}
      {spark(560, 168, 18, WARM, 0.14)}
    </svg>
  );
}
