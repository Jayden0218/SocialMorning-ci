/**
 * @socialmorning/player-core — the rules that decide what plays next, when to stop,
 * how fast, what may download, and what is new. Pure functions only, so every one of
 * them is exercised without a phone (M2 FR-024, SC-009).
 */
export type * from './types';
export { clampRate, rateFor, RATE_MIN, RATE_MAX, RATE_STEP } from './speed';
export { canStartDownload, usedBytesOf, nextDownload } from './downloads';
export { enqueue, move, remove, nextPlayable, QUEUE_MAX } from './queue';
export { armTimer, timerRemainingMs, timerFired, shouldAdvance } from './timer';
export { inboxOf } from './inbox';
export { parseChapters, currentChapter } from './chapters';
export { parseTranscript, parseSrt, parseVtt, currentLine } from './transcript';
