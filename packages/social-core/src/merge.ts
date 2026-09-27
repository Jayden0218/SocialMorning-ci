import type { PositionObs } from './types';

/**
 * Research R5 — the one position-conflict rule, run by the phone AND the server.
 *
 *   1. Nothing stored → incoming wins.
 *   2. Incoming is an explicit seek and is newer (receivedAt) → incoming wins,
 *      even backwards, and it clears `finished` (the listener chose a place).
 *   3. Otherwise incoming wins only if its offset is ≥ the stored one — ties broken
 *      by progressSeq, then receivedAt. `finished` is sticky: once true it stays
 *      true unless rule 2 clears it.
 *   4. Otherwise stored wins.
 *
 * For two non-seek observations this is symmetric (max offset wins), which is
 * what SC-012's property test asserts — guard G3. Guard G4 is rule 2.
 * Always returns one of its two inputs (possibly with `finished` recomputed).
 */
export function mergePosition(stored: PositionObs | null, incoming: PositionObs): PositionObs {
  if (stored === null) return incoming;
  if (stored.episodeId !== incoming.episodeId) throw new RangeError('mergePosition: different episodes');

  // Rule 2: an explicit seek that is newer wins outright and clears finished.
  if (incoming.explicitSeek && !stored.explicitSeek && incoming.receivedAt > stored.receivedAt) {
    return incoming.finished ? { ...incoming, finished: false } : incoming;
  }
  if (stored.explicitSeek && !incoming.explicitSeek && stored.receivedAt > incoming.receivedAt) {
    return stored;
  }
  if (incoming.explicitSeek && stored.explicitSeek && incoming.receivedAt !== stored.receivedAt) {
    // Two seeks: the later one is the listener's latest choice.
    return incoming.receivedAt > stored.receivedAt ? incoming : stored;
  }

  // Rule 3/4: progress never goes backwards.
  const finished = stored.finished || incoming.finished;
  const winner =
    incoming.offsetMs > stored.offsetMs ? incoming
    : incoming.offsetMs < stored.offsetMs ? stored
    : incoming.progressSeq > stored.progressSeq ? incoming
    : incoming.progressSeq < stored.progressSeq ? stored
    : incoming.receivedAt >= stored.receivedAt ? incoming
    : stored;
  return winner.finished === finished ? winner : { ...winner, finished };
}
