/** M14 US6: a 14-day sparkline under a stat (accent line; decorative — the number beside it is the value). */
export function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const max = Math.max(1, ...points);
  const w = 120, h = 28;
  const d = points.map((v, i) => `${(i / (points.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(' ');
  return (
    <svg className="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
