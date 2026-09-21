/** One observation of a listener's place in an episode (research R5). */
export type PositionObs = {
  episodeId: string;
  offsetMs: number;
  finished: boolean;
  /** M1's monotonic per-device counter. */
  progressSeq: number;
  /** True when the listener moved the position on purpose (SEEK), R5 rule 2. */
  explicitSeek: boolean;
  /** SERVER receipt time (ms since epoch). The phone fills it with 0 until the server answers. */
  receivedAt: number;
};

/** What the player knows when the comment box opens (FR-007). */
export type PlaybackSnapshot = { episodeId: string; offsetMs: number; durationMs?: number };

export type Moment = { offsetMs: number };

/** FR-023: "newest" or "by moment". */
export type CommentOrder = 'newest' | 'byMoment';
