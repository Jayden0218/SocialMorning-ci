// Sorts the show's episodes: newest, oldest, unplayed only, or most played.
/**
 * The show page's list controls (owner, 2026-10-01, after the 小宇宙 show page): newest or
 * oldest first, an "Unplayed" filter, and the "All" / "Most played" chips. Pure, so it is
 * tested without a screen.
 */

export type ListView = 'all' | 'mostPlayed';

/** "Most played" only means something when at least one row has a play count. */
export function hasPlays(listeners: Readonly<Record<string, number>> | undefined): boolean {
  return listeners !== undefined && Object.values(listeners).some((n) => n > 0);
}

/**
 * The rows in the order the controls ask for. `episodes` arrive newest first (the feed store's
 * order). "Most played" ignores the newest/oldest toggle except as the tie-break.
 */
export function orderEpisodes<T extends { id: string }>(
  episodes: readonly T[],
  opts: { oldestFirst: boolean; view: ListView; unplayedOnly: boolean; isFinished: (id: string) => boolean; listeners?: Readonly<Record<string, number>> },
): T[] {
  let rows = opts.oldestFirst ? [...episodes].reverse() : [...episodes];
  if (opts.unplayedOnly) rows = rows.filter((e) => !opts.isFinished(e.id));
  if (opts.view === 'mostPlayed' && hasPlays(opts.listeners)) {
    const plays = opts.listeners ?? {};
    // Array.prototype.sort is stable, so equal counts keep the newest/oldest order.
    rows = rows.sort((a, b) => (plays[b.id] ?? 0) - (plays[a.id] ?? 0));
  }
  return rows;
}
