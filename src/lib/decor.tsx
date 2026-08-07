// Shared "festival motif" engine — a tiny seeded PRNG plus the SVG primitives
// used by the hero and the ambient page background, so every surface draws from
// the same Kerala-festival vocabulary (pookalam, kudamattam parasol, fireworks,
// festoon) while varying per visit.

/** Deterministic PRNG (mulberry32): same seed → same scene, different seed → new. */
export function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randSeed = () => Math.floor(Math.random() * 2 ** 31);
export const between = (r: () => number, min: number, max: number) => min + (max - min) * r();
export const chance = (r: () => number, p: number) => r() < p;

// ---- motifs (all take explicit colour + opacity so both layers can reuse them) ----

/** A ring of small "petals" — a slice of a pookalam. */
export function petalRing(cx: number, cy: number, r: number, n: number, pr: number, color: string, op: number, k = '') {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return <circle key={k + i} cx={cx + Math.cos(a) * r} cy={cy + Math.sin(a) * r} r={pr} fill={color} opacity={op} />;
  });
}

/** A concentric pookalam of several petal rings. */
export function pookalam(cx: number, cy: number, scale: number, colors: string[], op: number) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={14 * scale} fill={colors[0]} opacity={op} />
      {petalRing(cx, cy, 30 * scale, 8, 5.5 * scale, colors[1], op, 'a')}
      {petalRing(cx, cy, 56 * scale, 14, 5 * scale, colors[2], op * 0.9, 'b')}
      {petalRing(cx, cy, 84 * scale, 20, 4.5 * scale, colors[3], op * 0.8, 'c')}
    </g>
  );
}

/** A firework starburst. */
export function spark(cx: number, cy: number, s: number, color: string, op: number) {
  return (
    <g opacity={op} stroke={color} strokeWidth={Math.max(1.3, s * 0.07)} strokeLinecap="round">
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <line key={i} x1={cx + Math.cos(a) * s * 0.3} y1={cy + Math.sin(a) * s * 0.3}
          x2={cx + Math.cos(a) * s} y2={cy + Math.sin(a) * s} />;
      })}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <circle key={`d${i}`} cx={cx + Math.cos(a) * s} cy={cy + Math.sin(a) * s} r={s * 0.09} fill={color} />;
      })}
    </g>
  );
}

/** A kudamattam parasol. */
export function parasol(cx: number, cy: number, r: number, color: string, op: number) {
  return (
    <g opacity={op}>
      <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z`} fill={color} />
      <line x1={cx} y1={cy} x2={cx} y2={cy + r * 0.85} stroke={color} strokeWidth="2" />
      <line x1={cx} y1={cy - r * 0.55} x2={cx} y2={cy - r * 0.85} stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx={cx} cy={cy - r * 0.9} r={Math.max(2, r * 0.09)} fill={color} />
    </g>
  );
}

/** A hanging festoon (toran) across a horizontal line. */
export function festoon(y: number, color: string, op: number) {
  return (
    <>
      <path d={`M-10 ${y} Q 60 ${y + 22} 130 ${y} T 270 ${y} T 410 ${y} T 550 ${y} T 690 ${y} T 830 ${y}`}
        fill="none" stroke={color} strokeWidth="2" opacity={op} />
      <g opacity={op} fill={color}>
        {Array.from({ length: 13 }, (_, i) => <circle key={i} cx={-10 + i * 70} cy={i % 2 ? y + 16 : y} r="3" />)}
      </g>
    </>
  );
}
