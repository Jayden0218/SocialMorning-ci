/**
 * M5 FR-001 (research R4): "listened and talked about" over the app's own public
 * activity. Aggregates only — a row never names a listener.
 */
export type ActivityRow = { key: string; listeners: number; comments: number; clips: number; reactions: number; newestAt: number };

export function scoreTalkedAbout(r: ActivityRow): number {
  return 3 * r.listeners + 2 * r.comments + 2 * r.clips + r.reactions;
}

export function rankTalkedAbout<T extends ActivityRow>(rows: readonly T[], n: number = 10): T[] {
  return rows
    .map((r) => ({ r, s: scoreTalkedAbout(r) }))
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s || b.r.newestAt - a.r.newestAt)
    .slice(0, n)
    .map((x) => x.r);
}

/** Appends trending items not already present (by key) until at least `min` items. */
export function fillWithTrending<T extends { key: string }>(items: readonly T[], trending: readonly T[], min: number = 5): T[] {
  const out = [...items];
  const seen = new Set(items.map((i) => i.key));
  for (const t of trending) {
    if (out.length >= min) break;
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    out.push(t);
  }
  return out;
}
