import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { mulberry32, randSeed, between, chance, pookalam, parasol, spark } from '../lib/decor';

/**
 * Ambient festival watermark behind every page — a faint pookalam and parasol in
 * the page gutters, re-seeded on each navigation so no two screens (or visits)
 * look identical, yet all share the same theme. Extremely low opacity on the
 * tinted canvas: felt more than seen, never competing with content.
 */
const INK = '#4f46e5';
const AMBER = '#bd7d17';

const SPOTS = [
  { x: 90, y: 120 }, { x: 910, y: 130 }, { x: 120, y: 680 }, { x: 890, y: 660 },
];

export function AmbientScene({ seed }: { seed: number }) {
  const r = mulberry32(seed);
  // two distinct corners for the two large motifs
  const i = Math.floor(r() * SPOTS.length);
  let j = Math.floor(r() * SPOTS.length);
  if (j === i) j = (j + 1) % SPOTS.length;
  const pk = SPOTS[i];
  const pr = SPOTS[j];
  const sparks = Array.from({ length: chance(r, 0.5) ? 3 : 2 }, () => ({
    x: between(r, 120, 880), y: between(r, 120, 680), s: between(r, 16, 30),
  }));

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true"
      viewBox="0 0 1000 800" preserveAspectRatio="xMidYMid slice">
      <g transform={`rotate(${between(r, -20, 20)} ${pk.x} ${pk.y})`}>
        {pookalam(pk.x, pk.y, between(r, 1.9, 2.6), [INK, INK, INK, INK], 0.05)}
      </g>
      {parasol(pr.x, pr.y, between(r, 34, 46), AMBER, 0.06)}
      {sparks.map((x, k) => <g key={k}>{spark(x.x, x.y, x.s, INK, 0.045)}</g>)}
    </svg>
  );
}

/** App-wide watermark behind Shell pages (the Shell root has no background). */
export default function PageDecor() {
  const { pathname } = useLocation();
  const seed = useMemo(() => randSeed(), [pathname]);
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden" aria-hidden="true">
      <AmbientScene seed={seed} />
    </div>
  );
}
