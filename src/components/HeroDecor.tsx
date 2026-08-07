import { useMemo } from 'react';
import { mulberry32, randSeed, between, chance, pookalam, spark, parasol, festoon } from '../lib/decor';

/**
 * Kerala-festival motifs for the hero card — pookalam, kudamattam parasols,
 * fireworks and a festoon in gold/white at low opacity, concentrated on the right
 * so the amounts stay readable. Seeded so each visit is a little different.
 */
const GOLD = '#ffd571';
const WARM = '#ffc58a';

export function HeroScene({ seed }: { seed: number }) {
  const r = mulberry32(seed);
  const p = { cx: between(r, 610, 705), cy: between(r, 90, 116), rot: between(r, -22, 22),
    scale: between(r, 1.25, 1.5) };
  const ringColors = chance(r, 0.5) ? [GOLD, WARM, '#ffffff', GOLD] : [WARM, GOLD, GOLD, '#ffffff'];
  const parasols = Array.from({ length: chance(r, 0.55) ? 2 : 1 }, () => ({
    cx: between(r, 470, 790), cy: between(r, 54, 148), rr: between(r, 20, 30),
  }));
  const sparks = Array.from({ length: chance(r, 0.5) ? 3 : 2 }, () => ({
    cx: between(r, 430, 800), cy: between(r, 48, 182), s: between(r, 15, 27),
    c: chance(r, 0.5) ? '#ffffff' : GOLD,
  }));
  const fy = between(r, 16, 26);

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true"
      viewBox="0 0 800 200" preserveAspectRatio="xMidYMid slice">
      {festoon(fy, GOLD, 0.18)}
      <g transform={`rotate(${p.rot} ${p.cx} ${p.cy})`}>
        {pookalam(p.cx, p.cy, p.scale, ringColors, 0.12)}
      </g>
      {parasols.map((x, i) => <g key={`p${i}`}>{parasol(x.cx, x.cy, x.rr, GOLD, 0.15)}</g>)}
      {sparks.map((x, i) => <g key={`s${i}`}>{spark(x.cx, x.cy, x.s, x.c, 0.14)}</g>)}
    </svg>
  );
}

export default function HeroDecor() {
  const seed = useMemo(() => randSeed(), []);
  return <HeroScene seed={seed} />;
}
