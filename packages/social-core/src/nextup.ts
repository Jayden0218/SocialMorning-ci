/**
 * M5 FR-008/FR-009 (research R5): "Next up" — four sources, one list. Sources are taken
 * in order of strength; the same episode appearing twice keeps its FIRST (strongest)
 * reason (guard G4); the current episode and the viewer's finished ones never appear
 * (guard G3); at most `cap`; if fewer than `min`, the lower sources keep filling.
 */
export type Reason = 'alsoListened' | 'talkedAboutOnShow' | 'newOnShow' | 'trendingInCategory';
export const REASON_ORDER: readonly Reason[] = ['alsoListened', 'talkedAboutOnShow', 'newOnShow', 'trendingInCategory'];
export const REASON_LABEL: Record<Reason, string> = {
  alsoListened: 'People who listened to this also listened',
  talkedAboutOnShow: 'Most talked about on this show',
  newOnShow: 'New on this show',
  trendingInCategory: 'Trending in this category',
};

export type Candidate = { key: string; reason: Reason };

export function nextUp<T extends Candidate>(sources: Record<Reason, readonly T[]>, exclude: ReadonlySet<string>, cap: number = 8): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  // Sources are drained in order of strength up to the cap, so the lower sources are
  // consulted exactly when the stronger ones run short — that IS the "fill to min" rule.
  // `min` is kept so a caller can tell "too few to show" from "enough": the list is
  // returned either way (the screen decides), never padded with duplicates.
  for (const reason of REASON_ORDER) {
    for (const c of sources[reason]) {
      if (out.length >= cap) return out;
      if (exclude.has(c.key) || seen.has(c.key)) continue;
      seen.add(c.key);
      out.push(c);
    }
  }
  return out;
}

/** True when a Next-up list is worth showing at all. */
export function enoughNextUp(items: readonly unknown[], min: number = 3): boolean {
  return items.length >= min;
}
