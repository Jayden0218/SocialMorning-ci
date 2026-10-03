/**
 * M10b US9 — SocialNet outside the app: the home-screen widget (Android + iOS), the iPhone
 * lock-screen live activity, and Siri's "play my latest episode". This file is the pure
 * half — what each of them shows — so it is tested without any native code.
 */
import type { PlayerState } from '@/playback/types';
import type { Comment, Social } from '@/social/api';
import type { Stores } from '@/storage/types';
import { latestUpdates } from '@/me/updates';

/** What every outside surface shows. `undefined` = nothing loaded. */
export type NowPlaying = {
  episodeId: string;
  title: string;
  show: string;
  playing: boolean;
  /** The episode's best comment (see `bestComment`), once fetched. */
  comment?: { author: string; body: string; offsetMs: number };
};

export function nowPlayingOf(state: PlayerState, lookup: (episodeId: string) => { title: string; show: string } | undefined): NowPlaying | undefined {
  if (state.kind === 'idle' || state.episodeId === undefined) return undefined;
  const meta = lookup(state.episodeId);
  if (!meta) return undefined;
  const playing = state.kind === 'playing' || state.kind === 'buffering' || (state.kind === 'loading' && state.intent === 'play');
  return { episodeId: state.episodeId, title: meta.title, show: meta.show, playing };
}

/** Two snapshots that draw the same — a position TICK must not redraw a widget. */
export function sameCard(a: NowPlaying | undefined, b: NowPlaying | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.episodeId === b.episodeId && a.playing === b.playing && a.title === b.title && a.show === b.show
    && a.comment?.body === b.comment?.body && a.comment?.author === b.comment?.author;
}

const shown = (c: Comment): boolean => !c.deleted && !c.removed && !c.blocked && c.body !== null && c.body.length > 0 && c.offsetMs !== null;

/**
 * "The most-reacted comment" (spec US9 #2). Reactions in SocialNet are taps on the timeline,
 * summed into the heat curve, so the best comment is the one nearest the hottest moment; with
 * no heat curve it is the one with the most replies. Ties go to the earlier moment.
 */
export function bestComment(social: Social): NowPlaying['comment'] {
  const candidates = social.comments.filter(shown);
  if (candidates.length === 0) return undefined;
  let score: (c: Comment) => number;
  const dur = social.episode.durationMs;
  if (social.heat.available && dur !== null && dur > 0 && social.heat.buckets.some((b) => b > 0)) {
    const buckets = social.heat.buckets;
    const peak = buckets.indexOf(Math.max(...buckets));
    const peakMs = ((peak + 0.5) / buckets.length) * dur;
    score = (c) => -Math.abs(c.offsetMs! - peakMs);
  } else {
    score = (c) => c.replies?.length ?? 0;
  }
  const best = [...candidates].sort((a, b) => score(b) - score(a) || a.offsetMs! - b.offsetMs!)[0]!;
  return { author: best.displayName ?? 'A listener', body: best.body!, offsetMs: best.offsetMs! };
}

/**
 * Siri's "play my latest SocialNet episode" (spec US9 #3): the first unfinished episode in
 * the queue, else the newest unfinished one in Updates. `undefined` = nothing to play.
 */
export function latestToPlay(stores: Pick<Stores, 'queue' | 'positions' | 'subscriptions' | 'feeds' | 'settings'>, hidden: ReadonlySet<string>): string | undefined {
  const unfinished = (id: string) => stores.positions.get(id)?.finished !== true;
  const fromQueue = stores.queue.list().find(unfinished);
  if (fromQueue) return fromQueue;
  return latestUpdates(stores, hidden).map((r) => r.episode.id).find(unfinished);
}
