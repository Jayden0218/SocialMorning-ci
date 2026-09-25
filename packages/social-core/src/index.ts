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
export { matchesTerm, collapseByFeed, collapseEpisodes, mergeSearch, normaliseFeedUrl } from './search';
export { REPORT_REASONS, REPORT_NOTE_MAX, TARGET_KINDS, canReport, canBlock, hiddenKey, applyBlocks } from './safety';
export type { ReportReason, TargetKind, BlockedPlaceholder, ReportedPlaceholder, Named } from './safety';
export { RETENTION_DAYS, REPORTS_PER_HOUR, DELETED_REPORTER, groupReports, actionsFor, closeReason } from './moderation';
export type { ReportRow, QueueItem, Action } from './moderation';
export { EMPTY_STATES, SURFACES, LOADING_AFTER_MS, GIVE_UP_AFTER_MS, OFFLINE_SENTENCE, ERROR_SENTENCE, emptyState } from './empty';
export type { Surface, EmptyAction, EmptySpec, EmptyView } from './empty';
// M8 — For You (specs/008-m8-for-you/contracts/recsys-core.ts)
export type { Channel, RecCandidate } from './rank';
export {
  W_AFFINITY, W_SOCIAL, W_FRESHNESS, W_QUALITY, W_FATIGUE,
  NEW_BOOST, NEW_WINDOW_MS, FRESHNESS_TAU_DAYS, UNDATED_AGE_DAYS, FATIGUE_LIMIT,
  GENRE_AFFINITY, CHANNELS, CHANNEL_CAP, SOCIAL_SATURATION, QUALITY_SATURATION,
  scoreCandidate, isFatigued, ageDays,
} from './rank';
export type { Liker, Neighbour } from './swing';
export { SWING_ALPHA, MIN_LIKERS, MAX_NEIGHBOURS, MIN_USEFUL_CANDIDATES, LIKE_FINISHED, swingSimilarity, bestNeighbourSim } from './swing';
export type { Scored } from './rerank';
export { MMR_THETA, LIST_SIZE, MAX_PER_SHOW_TOP10, TOP10, MAX_PER_GENRE_TOP20, SIM_SAME_SHOW, SIM_SAME_GENRE, pairSimilarity, rerank } from './rerank';
export { REASON_MAX } from './reason';
export { REPLAY_TARGET_PERCENTILE, REPLAY_FIELD } from './replay';
