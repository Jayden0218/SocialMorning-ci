// The Show screen's Hot moments tab, as plain functions: one card per episode, and what a card says.
/**
 * M31 W3-A2 (T040; design-pulse2 `show--screen`, right phone): "a Deck of 290 x 340 cards, one per episode's hottest moment: cover,
 * solid 'HOT · 14:32' chip, title, the top comment there, 'n reacted here', the curve with the hot run lit, Play (plays from the moment)".
 * The server (`GET /v1/discover/moments?feedUrl=`, contract `moments.md`) answers up to ten moments per episode, hottest first within
 * the show; the deck keeps each episode's hottest and puts the most reacted episode first.
 */
import { mmss } from '@/ui/kit/format';
import { shortCount } from '@/ui/discover/moments-logic';
import type { Moment } from '@/discover/moments-api';

/** How many of the show's moments one read asks for (the server pages by 50 at most). */
export const SHOW_MOMENTS_LIMIT = 50;

/** Each episode's hottest moment (most reactions, then the earlier one), the most reacted episode first. */
export function hottestPerEpisode(items: readonly Moment[]): Moment[] {
  const best = new Map<string, Moment>();
  for (const m of items) {
    const have = best.get(m.episodeId);
    if (!have || m.reactions > have.reactions || (m.reactions === have.reactions && m.startMs < have.startMs)) best.set(m.episodeId, m);
  }
  return [...best.values()].sort((a, b) => b.reactions - a.reactions || a.startMs - b.startMs || (a.episodeId < b.episodeId ? -1 : 1));
}

/** The solid chip on a card: "HOT · 14:32" (the drawing writes the start only). */
export const hotChip = (m: Pick<Moment, 'startMs'>): string => `HOT · ${mmss(m.startMs)}`;

/** "2.4k reacted here". */
export const reactedLine = (m: Pick<Moment, 'reactions'>): string => `${shortCount(m.reactions)} reacted here`;

/** The words a screen reader hears for a card. */
export function cardLabel(m: Moment): string {
  const top = m.comments[0];
  return `${m.episodeTitle}. Hot at ${mmss(m.startMs)}. ${reactedLine(m)}.${top ? ` ${top.author ? `${top.author}: ` : ''}${top.text}` : ''}`;
}

/** The hottest moment of one episode among the deck's cards (the newest episode's tile shows its time). */
export function hottestOf(cards: readonly Moment[], episodeId: string): Moment | undefined {
  return cards.find((m) => m.episodeId === episodeId);
}

/**
 * A card's curve: the episode's own peaks. The server answers each episode's hottest buckets (up to ten, the top 10 %), not the whole
 * curve, so the bars are those peaks — each bucket at its height against the hottest, every other bar at its least. With no known
 * length nothing can be placed and the curve is flat.
 */
export function peakCurve(moments: readonly Pick<Moment, 'startMs' | 'endMs' | 'reactions'>[], durationMs: number | undefined): number[] {
  const out = Array.from({ length: 100 }, () => 0);
  if (durationMs === undefined || !(durationMs > 0)) return out;
  const top = Math.max(1, ...moments.map((m) => m.reactions));
  for (const m of moments) {
    const bucket = Math.min(99, Math.max(0, Math.floor((((m.startMs + m.endMs) / 2) * 100) / durationMs)));
    out[bucket] = Math.max(out[bucket]!, m.reactions / top);
  }
  return out;
}

/** The curve the card draws: the server's whole-episode curve (0..100 -> 0..1) when it sent one, else the peaks. */
export function cardCurve(m: Pick<Moment, 'curve' | 'episodeId' | 'startMs' | 'endMs' | 'reactions'>, all: readonly Pick<Moment, 'episodeId' | 'startMs' | 'endMs' | 'reactions'>[], durationMs: number | undefined): number[] {
  if (m.curve && m.curve.length > 0) return m.curve.map((v) => v / 100);
  return peakCurve(all.filter((x) => x.episodeId === m.episodeId), durationMs);
}
