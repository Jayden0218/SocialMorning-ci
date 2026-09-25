/**
 * M8 — the ordering rules (specs/008-m8-for-you/contracts/recsys-core.ts).
 *
 * This file holds the constants only until Phase 4 implements the functions. They live
 * here, exported and named, because the whole point of putting the ordering in this
 * package is that changing a weight is a one-line diff with a test beside it rather than
 * a number buried in a SQL string.
 *
 * Every number below is a decision of specs/008-m8-for-you/research.md §R6 and §R8.
 * FRESHNESS_TAU_DAYS in particular is a **guess, not a measurement** (R8) and must not be
 * described as tuned until L7's per-channel counts exist.
 */

export const W_AFFINITY = 1.0;
export const W_SOCIAL = 0.4;
export const W_FRESHNESS = 0.8;
export const W_QUALITY = 0.3;
export const W_FATIGUE = 0.25;

/** 流量调控 (07_ColdStart_05): without a thumb on the scale, `quality` is self-reinforcing. */
export const NEW_BOOST = 1.2;
export const NEW_WINDOW_MS = 48 * 3_600_000;

/** Half-life ≈ 4.9 days. R8: a guess. */
export const FRESHNESS_TAU_DAYS = 7;

/** A NULL publish date is scored as this old — never as new (guard G-F1). */
export const UNDATED_AGE_DAYS = 7;

/** Shown this many times with no open ⇒ dropped (FR-017). */
export const FATIGUE_LIMIT = 3;

/** Affinity contribution of a category match, when nothing stronger applies. */
export const GENRE_AFFINITY = 0.3;

export type Channel = 'sub-new' | 'showcf' | 'social' | 'genre' | 'talked' | 'pick' | 'chart';

export const CHANNELS: readonly Channel[] = ['sub-new', 'showcf', 'social', 'genre', 'talked', 'pick', 'chart'];

/** Per-channel retrieval caps (research R6, plan §Scale). */
export const CHANNEL_CAP: Readonly<Record<Channel, number>> = {
  'sub-new': 40, showcf: 60, social: 40, genre: 40, talked: 20, pick: 3, chart: 20,
};

/** M8 candidate. Named `RecCandidate` because M5's next-up already exports a `Candidate`. */
export type RecCandidate = {
  episodeId: string;
  feedUrl: string;
  genreId: number | null;
  channel: Channel;
  /** Epoch ms of the PUBLISHER's date. `null` ⇒ UNDATED_AGE_DAYS old. */
  publishedAt: number | null;
  subscribed: boolean;
  /** Swing similarity of this episode's show to something the listener likes, 0–1. */
  neighbourSim: number;
  genreMatch: boolean;
  /** How many people the listener follows engaged with it. */
  socialCount: number;
  /** M5's talkedAbout score for the episode. */
  talkedScore: number;
  /** Impressions with no open, from rec_events. */
  impressions: number;
};
