// The Moments feed's rules, as plain functions: which card is active, when a preview runs, what the words say.
/**
 * M31 T025 (research T020 §4, design-pulse2 `index.html#home--moments`). No React, no native module:
 * every rule of the feed that a test can check without a phone is here.
 *
 * The autoplay rules (research T020 §4, owner's yes to autoplay recorded in the spec):
 *   1. The default is silent. A card in view runs a MUTED preview — the curve lights bar by bar and
 *      the comments rise. Sound starts only from a tap (the sound pill, the Play circle).
 *   2. One preview alive: the card that is more than 60 % in view runs, the one before it stops.
 *   3. The preview is at most 20 s and loops.
 *   4. It stops on a tab change, backgrounding, a call; with Reduce Motion, or on the web build, it
 *      does not run at all and the card shows a Play button.
 *   5. The mobile-data question is asked only from a tap, never from a scroll (the muted preview
 *      fetches no audio, so a scroll costs no data).
 */
import { compactCount, mmss } from '@/ui/kit/format';

/** A preview is never longer than this (research rule 6). */
export const PREVIEW_MAX_MS = 20_000;
/** A preview is never shorter than this, so a moment cut from a very short episode still shows. */
export const PREVIEW_MIN_MS = 5_000;
/** A card runs when more than this share of it is in view (research rule 6). */
export const ACTIVE_SHARE = 0.6;
/**
 * Whether the sound the listener turned on stays on for the next card. The owner approved
 * autoplay, but research rule 1 says "no audio ever starts from scrolling alone" — so each new card
 * starts silent. A decision for the owner (research T020 §4: "decisions for the owner to confirm").
 */
export const SOUND_CARRIES_OVER = false;
/** How many moments one page of the list asks for. */
export const PAGE_SIZE = 20;
/** How old the list may be before coming back to Home reads it again. */
export const REFRESH_AFTER_MS = 5 * 60_000;

export type MomentRange = { startMs: number; endMs: number };

/** The part of a moment that plays: its start, at most 20 s and at least 5 s long. */
export function previewRange(m: MomentRange): MomentRange {
  const length = Math.min(PREVIEW_MAX_MS, Math.max(PREVIEW_MIN_MS, m.endMs - m.startMs));
  return { startMs: m.startMs, endMs: m.startMs + length };
}

/** "HOT · 14:32 – 15:10" — the tag on a card. */
export function momentTag(m: MomentRange): string {
  return `HOT · ${mmss(m.startMs)} – ${mmss(m.endMs)}`;
}

/** 2400 → "2.4k", 999 → "999", 12000 → "12k", 12345678 → "12.3M". */
export function shortCount(n: number): string {
  if (n < 1000) return String(Math.max(0, Math.round(n)));
  if (n >= 999_500) return compactCount(n); // F10: "12.3M", not "12346k"
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`.replace('.0k', 'k');
}

/** The line under a card's title: "Morning Notes · 2.4k reacted here". */
export function momentLine(showTitle: string, reactions: number): string {
  return `${showTitle} · ${shortCount(reactions)} reacted here`;
}

/**
 * The bars of a `count`-bar curve that the moment covers, as `[first, last]` (both inclusive), or
 * `undefined` while the episode's length is not known. The 100 heat buckets are the episode cut in
 * 100 equal parts (`social-core` `bucketOf`), and a moment is one bucket.
 */
export function hotBars(m: MomentRange, durationMs: number | undefined, count: number): readonly [number, number] | undefined {
  if (durationMs === undefined || !(durationMs > 0) || count < 1) return undefined;
  const at = (ms: number): number => Math.min(count - 1, Math.max(0, Math.floor((ms / durationMs) * count)));
  const first = at(m.startMs);
  const last = Math.max(first, at(Math.max(m.startMs, m.endMs - 1)));
  return [first, last];
}

/**
 * Which card is active at a scroll offset: the one with more than `ACTIVE_SHARE` of its page in
 * view, or `undefined` while two cards are about half each (mid-swipe). Cards are one page tall.
 */
export function activeCard(offsetY: number, pageHeight: number, count: number): number | undefined {
  if (!(pageHeight > 0) || count < 1) return undefined;
  const at = offsetY / pageHeight;
  const nearest = Math.round(at);
  if (nearest < 0 || nearest > count - 1) return undefined;
  const share = 1 - Math.abs(at - nearest);
  return share > ACTIVE_SHARE ? nearest : undefined;
}

export type PreviewGate = {
  /** The card is the active one (more than 60 % in view). */
  active: boolean;
  /** Home is the screen in front, and the Moments view is chosen. */
  focused: boolean;
  /** The app is in front (not backgrounded, not locked, not in a call). */
  appActive: boolean;
  reduceMotion: boolean;
  web: boolean;
  /** The listener stopped this card's preview with the Play circle. */
  paused: boolean;
};

/** Whether this card's muted preview runs now. */
export function previewRuns(g: PreviewGate): boolean {
  return g.active && g.focused && g.appActive && !g.reduceMotion && !g.web && !g.paused;
}

/** How far into its loop a preview is at `elapsedMs`, 0 to 1 (it wraps; never 1). */
export function loopProgress(elapsedMs: number, loopMs: number): number {
  if (!(loopMs > 0) || elapsedMs <= 0) return 0;
  return (elapsedMs % loopMs) / loopMs;
}

/** The loop's length: the range's length (5 to 20 s). */
export function loopMs(m: MomentRange): number {
  const r = previewRange(m);
  return r.endMs - r.startMs;
}

export type SoundTapPlan = 'stop' | 'confirm-switch' | 'start';

/**
 * What a tap on the sound pill does. Sound already on → stop it. Something else is playing
 * (research rule 3: the main player wins) → ask "Switch to this moment?" first. Otherwise start.
 */
export function soundTapPlan(i: { soundOn: boolean; otherPlaying: boolean }): SoundTapPlan {
  if (i.soundOn) return 'stop';
  return i.otherPlaying ? 'confirm-switch' : 'start';
}

/** The moment with the most reactions on a page — the "Hot now" tile. The earlier one wins a tie. */
export function hottest<T extends { reactions: number }>(items: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const m of items) if (best === undefined || m.reactions > best.reactions) best = m;
  return best;
}

/** The clip a card's sound plays: the preview range of its moment. */
export function sameClip(a: { episodeId: string; startMs: number } | undefined, b: { episodeId: string; startMs: number }): boolean {
  return a !== undefined && a.episodeId === b.episodeId && a.startMs === b.startMs;
}

/** The key of a moment: an episode's bucket. */
export const momentKey = (m: { episodeId: string; startMs: number }): string => `${m.episodeId}@${m.startMs}`;

/** `more` appended to `items`, a moment already listed left out (a page can repeat one after a refresh). */
export function mergeMoments<T extends { episodeId: string; startMs: number }>(items: readonly T[], more: readonly T[]): T[] {
  const seen = new Set(items.map(momentKey));
  return [...items, ...more.filter((m) => { const k = momentKey(m); if (seen.has(k)) return false; seen.add(k); return true; })];
}
