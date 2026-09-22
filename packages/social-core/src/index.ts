/**
 * @socialmorning/social-core — the rules the phone and the server must agree on.
 *
 * Everything exported here is a pure function. That is not a style preference:
 * the constitution's second-biggest risk is two devices disagreeing about a
 * listener's position, and the way this package retires that risk is by being
 * the ONE implementation both sides import.
 */
export type { PositionObs, PlaybackSnapshot, Moment, CommentOrder } from './types';
export { lockoutUntil, LOCKOUT_THRESHOLD, LOCKOUT_MAX_MS } from './lockout';
export { fnv1a64, hash } from './hash';
export { captureMoment } from './moment';
export { bucketOf, normaliseHeat, HEAT_BUCKETS } from './heat';
export { orderComments } from './order';
export { mergePosition } from './merge';
// M4 — the graph (specs/004-m4-the-graph/contracts/graph-core.ts)
export type { ClipRange, ClipCheck, ClipReason } from './clip';
export { proposeClip, validateClipRange, nudge, CLIP_MIN_MS, CLIP_MAX_MS, CLIP_PROPOSAL_MS, CLIP_NUDGE_MS } from './clip';
export type { Range, ListenAcc } from './intervals';
export { addTick, closeAcc, mergeRanges, unionLength, TICK_MAX_GAP_MS } from './intervals';
export type { ListenedRow, TopShow, StatsWindow, Stats } from './stats';
export { stats } from './stats';
export type { FeedItem } from './feed';
export { listenItemDue, orderFeed, unreadCount, LISTEN_ITEM_THRESHOLD_MS } from './feed';
// M5 — discovery (specs/005-m5-discovery/contracts/discovery-core.ts)
export type { PickIn } from './picks';
export { validatePicks, picksForDay, PICKS_PER_DAY } from './picks';
export type { ActivityRow } from './discover';
export { scoreTalkedAbout, rankTalkedAbout, fillWithTrending } from './discover';
export type { Reason, Candidate } from './nextup';
export { nextUp, enoughNextUp, REASON_ORDER, REASON_LABEL } from './nextup';
export { matchesTerm, collapseByFeed, mergeSearch, normaliseFeedUrl } from './search';
