/**
 * M8 — Swing show-to-show similarity (research R3).
 *
 * Two things about this file are worth knowing before anyone changes a number in it:
 *
 *  1. It is between SHOWS, never episodes. An episode is born with no interactions, and
 *     ItemCF cannot serve an item with no interactions (07_ColdStart_02). A show stays
 *     warm for years, so a similar show is expanded into its newest unheard episode.
 *
 *  2. It is Swing, not cosine ItemCF, because Swing's entire purpose is to discount a
 *     小圈子 — and this app's user base *is* one small circle. Cosine here would mostly
 *     measure "the owner subscribed to both".
 *
 *      sim(i1,i2) = Σ_{u1,u2 ∈ V, u1 < u2} 1 / (α + |J_u1 ∩ J_u2|),  V = likers of both
 *
 * The sum is over unordered PAIRS of co-likers, so a single shared listener produces
 * nothing at all. That is Swing working as intended, not a bug: one person liking two
 * things is not evidence that the two things are alike. At our size it means the channel
 * is often silent, which FR-018 makes the correct behaviour.
 */

/** Damping in the denominator. Higher ⇒ a small circle counts for less. */
export const SWING_ALPHA = 5;

/** Fewer likers than this and a show is similar to nothing (FR-018, guard G-R2). */
export const MIN_LIKERS = 3;

/** Neighbours kept per show. */
export const MAX_NEIGHBOURS = 50;

/** Below this many candidates the showcf channel contributes NOTHING, not noise (FR-018). */
export const MIN_USEFUL_CANDIDATES = 5;

/** Finished episodes of a show that count as a "like" without a subscription. */
export const LIKE_FINISHED = 3;

/** One listener's liked shows. `like` = subscribed, or ≥ LIKE_FINISHED episodes finished. */
export type Liker = { listenerId: string; shows: readonly string[] };

export type Neighbour = { show: string; sim: number };

export type SwingOptions = {
  alpha?: number;
  minLikers?: number;
  maxNeighbours?: number;
};

/**
 * Neighbours per show, strongest first.
 *
 * Scores are normalised **globally** — every raw score is divided by the largest raw
 * score in the whole result — rather than per show. Per-show normalisation would make
 * every show's best neighbour exactly 1.0 even when the evidence for it is one weak
 * pair, and the scorer compares candidates that came from different shows against each
 * other. Global normalisation keeps "weakly similar" weaker than "strongly similar".
 */
export function swingSimilarity(likers: readonly Liker[], opts: SwingOptions = {}): Map<string, readonly Neighbour[]> {
  const alpha = opts.alpha ?? SWING_ALPHA;
  const minLikers = opts.minLikers ?? MIN_LIKERS;
  const maxNeighbours = opts.maxNeighbours ?? MAX_NEIGHBOURS;

  // listener → their shows, and show → its likers. A listener listed twice, or a show
  // listed twice for one listener, must count once: the sets do that.
  const byListener = new Map<string, Set<string>>();
  for (const l of likers) {
    const set = byListener.get(l.listenerId) ?? new Set<string>();
    for (const s of l.shows) set.add(s);
    byListener.set(l.listenerId, set);
  }
  const byShow = new Map<string, string[]>();
  for (const [listenerId, shows] of byListener) {
    for (const s of shows) {
      const arr = byShow.get(s);
      if (arr === undefined) byShow.set(s, [listenerId]);
      else arr.push(listenerId);
    }
  }

  const eligible = [...byShow.entries()].filter(([, ls]) => ls.length >= minLikers);
  const overlapCache = new Map<string, number>();
  const overlap = (a: string, b: string): number => {
    // Cached under both orders rather than under a canonical one: overlap is symmetric,
    // and sorting the key here would be a branch that only one side of the data ever takes.
    const hit = overlapCache.get(`${a}\u0001${b}`);
    if (hit !== undefined) return hit;
    const A = byListener.get(a)!;
    const B = byListener.get(b)!;
    // Walk the smaller set.
    const [small, large] = A.size <= B.size ? [A, B] : [B, A];
    let n = 0;
    for (const s of small) if (large.has(s)) n++;
    overlapCache.set(`${a}\u0001${b}`, n);
    overlapCache.set(`${b}\u0001${a}`, n);
    return n;
  };

  const raw = new Map<string, Map<string, number>>();
  let max = 0;
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const [showA, likersA] = eligible[i]!;
      const [showB, likersB] = eligible[j]!;
      const setB = new Set(likersB);
      const both = likersA.filter((u) => setB.has(u));
      if (both.length < 2) continue; // Swing needs a PAIR of co-likers, not one person.
      let sim = 0;
      for (let x = 0; x < both.length; x++) {
        for (let y = x + 1; y < both.length; y++) sim += 1 / (alpha + overlap(both[x]!, both[y]!));
      }
      if (sim > max) max = sim;
      (raw.get(showA) ?? raw.set(showA, new Map()).get(showA)!).set(showB, sim);
      (raw.get(showB) ?? raw.set(showB, new Map()).get(showB)!).set(showA, sim);
    }
  }

  const out = new Map<string, readonly Neighbour[]>();
  for (const [show, neighbours] of raw) {
    const list = [...neighbours.entries()]
      .map(([s, sim]) => ({ show: s, sim: sim / max }))
      .sort((a, b) => b.sim - a.sim || (a.show < b.show ? -1 : 1))
      .slice(0, maxNeighbours);
    out.set(show, list);
  }
  return out;
}

/** The similarity of `show` to anything in `liked`, 0 when there is none. */
export function bestNeighbourSim(
  neighbours: ReadonlyMap<string, readonly Neighbour[]>,
  show: string,
  liked: ReadonlySet<string>,
): number {
  let best = 0;
  for (const n of neighbours.get(show) ?? []) if (liked.has(n.show) && n.sim > best) best = n.sim;
  return best;
}
