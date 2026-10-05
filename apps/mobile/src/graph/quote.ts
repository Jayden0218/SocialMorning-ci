// Works out the lines a listener picked from a transcript: their text, start, end and limits.
/**
 * M20 US1 (spec FR-001, FR-002). Pure: the transcript pane keeps the picked line numbers,
 * this file turns them into what is shared. A quote is a range like a clip — no audio is
 * stored — plus the words. Limits: 280 characters for the card (the server refuses more),
 * 60 s for a video (the clip-video module's own cap).
 */
import type { Transcript, TranscriptLine } from '@socialmorning/player-core';

/** The server's card limit (`QUOTE_MAX` in apps/api/src/share/card.ts). */
export const QUOTE_CARD_MAX = 280;
/** The video's limit (`MAX_CLIP_VIDEO_MS` in modules/clip-video). */
export const QUOTE_VIDEO_MAX_MS = 60_000;

export type Quote = {
  /** Where the link opens; undefined for a transcript with no times (it opens at the start). */
  startMs?: number;
  endMs?: number;
  text: string;
  /** Over 280 characters: no card — the listener picks fewer lines. */
  tooLong: boolean;
  /** A video can be made: timed, and 60 s or less. */
  video: boolean;
  /** Each picked line at its moment, for the video's captions (timed transcripts only). */
  captions?: { atMs: number; text: string }[];
};

/** The lines a transcript offers for picking: timed lines as they are; plain text by paragraph. */
export function pickableLines(t: Transcript): { lines: TranscriptLine[]; timed: boolean } {
  if ('lines' in t) return { lines: t.lines, timed: true };
  const paras = t.text.split(/\n\s*\n|\r\n\s*\r\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  return { lines: paras.map((text) => ({ startMs: 0, text })), timed: false };
}

/** Tap a line while picking: add it, or take it out. Kept in reading order. */
export function toggleLine(picked: readonly number[], index: number): number[] {
  return picked.includes(index) ? picked.filter((i) => i !== index) : [...picked, index].sort((a, b) => a - b);
}

/**
 * What the picked lines share as. The range runs from the first line's start to the last
 * line's end (its own end, else the next line's start, else its start), clamped to the
 * episode when its length is known. `undefined` = nothing picked.
 */
export function quoteOf(lines: readonly TranscriptLine[], picked: readonly number[], timed: boolean, durationMs?: number): Quote | undefined {
  const chosen = [...new Set(picked)].filter((i) => i >= 0 && i < lines.length).sort((a, b) => a - b);
  if (chosen.length === 0) return undefined;
  const text = chosen.map((i) => lines[i]!.text.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 0).join(' ');
  const tooLong = text.length > QUOTE_CARD_MAX;
  if (!timed) return { text, tooLong, video: false };
  const first = chosen[0]!;
  const last = chosen[chosen.length - 1]!;
  const clamp = (ms: number) => Math.max(0, durationMs !== undefined ? Math.min(ms, durationMs) : ms);
  const startMs = clamp(lines[first]!.startMs);
  const endMs = Math.max(startMs, clamp(lines[last]!.endMs ?? lines[last + 1]?.startMs ?? lines[last]!.startMs));
  const captions = chosen.map((i) => ({ atMs: clamp(lines[i]!.startMs), text: lines[i]!.text.replace(/\s+/g, ' ').trim() })).filter((c) => c.text.length > 0);
  return { startMs, endMs, text, tooLong, video: endMs > startMs && endMs - startMs <= QUOTE_VIDEO_MAX_MS, captions };
}
