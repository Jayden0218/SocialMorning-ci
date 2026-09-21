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
