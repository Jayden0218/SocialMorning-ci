// Brings positions played on the Apple Watch into the phone, and decides when "Download to Watch" shows.
/**
 * M21 US12 (FR-105). The Watch sends {episodeId, positionMs, durationMs?, finished, updatedAt}
 * (targets/watch/PhoneLink.swift) through `modules/watch-link`. Here, pure over injected pieces:
 *
 *   which wins: the NEWER position. The Watch's wins only when its `updatedAt` is later than the
 *               phone row's `updatedAt`, and never while the phone is playing that episode (the
 *               phone's own player is the newest truth and saves again within seconds).
 *   how:        `positions.save` — the same store call the player makes — so the row's
 *               `progressSeq` grows and the existing position sync uploads it (`onApplied` flushes).
 *               When the Watch moved BACK (the listener rewound), the row is saved as an explicit
 *               seek, or the server's "progress never goes backwards" rule (social-core
 *               `mergePosition`) would put the phone's later offset back.
 *   shows:      "Download to Watch" only with a paired Watch that has our app, for an episode with
 *               an http(s) audio address (spec US12 scenario 1).
 *
 * `__tests__/m21-watch.test.ts` is the spec. Whether a real Watch sends these is NOT VERIFIED (B19).
 */
import type { PositionRow, PositionStore } from '@/storage/types';

export type WatchPosition = { episodeId: string; positionMs: number; durationMs?: number; finished: boolean; updatedAt: number };

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** A raw message from the Watch → a position, or undefined when it is not one. */
export function parseWatchPosition(raw: unknown): WatchPosition | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (r['kind'] !== undefined && r['kind'] !== 'position') return undefined;
  const episodeId = r['episodeId'];
  const positionMs = num(r['positionMs']);
  const updatedAt = num(r['updatedAt']);
  if (typeof episodeId !== 'string' || episodeId === '' || positionMs === undefined || updatedAt === undefined) return undefined;
  const durationMs = num(r['durationMs']);
  return {
    episodeId,
    positionMs: Math.max(0, Math.round(positionMs)),
    ...(durationMs !== undefined && durationMs > 0 ? { durationMs: Math.round(durationMs) } : {}),
    finished: r['finished'] === true,
    updatedAt,
  };
}

/** True when the Watch's position should replace the phone's. */
export function watchPositionWins(local: PositionRow | undefined, p: WatchPosition, playingNow: string | undefined): boolean {
  if (playingNow === p.episodeId) return false;
  if (local === undefined) return true;
  return p.updatedAt > local.updatedAt;
}

export type ApplyDeps = {
  positions: PositionStore;
  now: () => number;
  /** The episode the phone is playing (or buffering) right now, if any. */
  playingNow: () => string | undefined;
};

/** Applies one raw Watch message. Returns the saved row, or undefined when the phone's stays. */
export function applyWatchPosition(deps: ApplyDeps, raw: unknown): PositionRow | undefined {
  const p = parseWatchPosition(raw);
  if (p === undefined) return undefined;
  const local = deps.positions.get(p.episodeId);
  if (!watchPositionWins(local, p, deps.playingNow())) return undefined;
  const durationMsAtSave = p.durationMs ?? local?.durationMsAtSave;
  return deps.positions.save({
    episodeId: p.episodeId,
    offsetMs: p.positionMs,
    finished: p.finished,
    ...(durationMsAtSave !== undefined ? { durationMsAtSave } : {}),
    explicitSeek: local !== undefined && p.positionMs < local.offsetMs,
  }, deps.now());
}

export type WatchLinkPort = { onPositions(listener: (raw: unknown) => void): () => void };

/** Listens for the Watch's positions for the app's life; `onApplied` runs after each one saved. */
export function startWatchLink(deps: ApplyDeps & { link: WatchLinkPort; onApplied: (row: PositionRow) => void }): () => void {
  return deps.link.onPositions((raw) => {
    const row = applyWatchPosition(deps, raw);
    if (row !== undefined) deps.onApplied(row);
  });
}

/** Spec US12 scenario 1: hidden unless a paired Watch has our app and the episode has an audio address. */
export function showDownloadToWatch(state: { paired: boolean; installed: boolean }, audioUrl: string | undefined): boolean {
  return state.paired && state.installed && typeof audioUrl === 'string' && /^https?:\/\//i.test(audioUrl);
}

/** What the phone sends: the episode, its show, and where the listener is in it (ms). */
export function toWatchEpisode(
  e: { id: string; title: string; enclosureUrl: string; imageUrl?: string; durationMs?: number; enclosureBytes?: number },
  showTitle: string | undefined,
  position: PositionRow | undefined,
): { id: string; title: string; show: string; url: string; artworkUrl?: string; positionMs: number; durationMs?: number; bytes?: number } {
  return {
    id: e.id,
    title: e.title,
    show: showTitle ?? '',
    url: e.enclosureUrl,
    ...(e.imageUrl ? { artworkUrl: e.imageUrl } : {}),
    positionMs: position && !position.finished ? position.offsetMs : 0,
    ...(e.durationMs !== undefined ? { durationMs: e.durationMs } : {}),
    ...(e.enclosureBytes !== undefined && e.enclosureBytes > 0 ? { bytes: e.enclosureBytes } : {}),
  };
}
