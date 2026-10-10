// Every DynamoDB key shape in data-model.md §3–§5, one function each, so no repo spells a key by hand.
/**
 * M26 F0-06. Conventions (data-model.md §2):
 * - `PK`/`SK` strings on every table; GSI keys `G1PK/G1SK` … `G6PK/G6SK` on sm-main, `E1PK/E1SK` on sm-events.
 * - Time in sort keys: ISO-8601 UTC with milliseconds, so string order = time order (`ts`).
 *   A NULL that SQL sorted `NULLS LAST` is `~` (sorts after digits) — `NULL_LAST`.
 * - Feed URLs never appear in keys or logs: `feedKey(url)` = base64url(sha256(url)) first 22 chars.
 * - Numeric ids that are sort keys are zero-padded (`pad`) so string order = number order.
 * A new key shape needs a row in data-model.md in the same commit (tasks.md, common rules).
 */
import { createHash } from 'node:crypto';
import type { Key } from './store.ts';

export const NULL_LAST = '~';

/** ISO-8601 UTC with milliseconds; accepts ms, a Date or an ISO string. */
export function ts(t: number | Date | string): string {
  const d = typeof t === 'string' ? new Date(t) : typeof t === 'number' ? new Date(t) : t;
  if (Number.isNaN(d.getTime())) throw new Error(`keys.ts: not a time: ${String(t)}`);
  return d.toISOString();
}
/** `ts` or `~` for a missing time (NULLS LAST under descending order is handled by the caller's ScanIndexForward). */
export const tsOrLast = (t: number | Date | string | null | undefined): string => (t === null || t === undefined ? NULL_LAST : ts(t));

/** Zero-padded non-negative integer (default 16 digits — every bigserial id we have fits). */
export function pad(n: number, width = 16): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`keys.ts: pad needs a non-negative safe integer, got ${n}`);
  return String(n).padStart(width, '0');
}
/** Heat bucket 0–99 as two digits. */
export function bucket(b: number): string {
  if (!Number.isInteger(b) || b < 0 || b > 99) throw new Error(`keys.ts: bucket must be 0–99, got ${b}`);
  return String(b).padStart(2, '0');
}

const b64url = (buf: Buffer): string => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** sha256 → base64url, full length (43). */
export const sha = (s: string): string => b64url(createHash('sha256').update(s).digest());
/** A show's key: never the URL itself (long, and must not leak into keys or logs). */
export const feedKey = (feedUrl: string): string => sha(feedUrl).slice(0, 22);
/** UTC day `yyyy-mm-dd` of a time. */
export const day = (t: number | Date | string): string => ts(t).slice(0, 10);

const k = (PK: string, SK: string): Key => ({ PK, SK });

// ---- sm-main: listener partition `L#<id>` (data-model.md §3) ----
export const L = (id: string) => `L#${id}`;
export const listener = (id: string) => k(L(id), 'PROFILE');
export const listenerSessionPtr = (id: string, publicId: string) => k(L(id), `SESS#${publicId}`);
export const subscription = (id: string, feedUrl: string) => k(L(id), `SUB#${feedKey(feedUrl)}`);
export const subOrder = (id: string) => k(L(id), 'SUBORDER');
export const position = (id: string, episodeId: string) => k(L(id), `POS#${episodeId}`);
export const libraryItem = (id: string, kind: string, itemKey: string) => k(L(id), `LIB#${kind}#${itemKey}`);
export const listenedRange = (id: string, episodeId: string, d: string, device: string) => k(L(id), `RANGE#${episodeId}#${d}#${device}`);
export const listenedDay = (id: string, d: string) => k(L(id), `LDAY#${d}`);
export const reaction = (id: string, episodeId: string, b: number) => k(L(id), `REACT#${episodeId}#${bucket(b)}`);
export const commentLike = (id: string, episodeId: string, commentId: string) => k(L(id), `CLIKE#${episodeId}#${commentId}`);
export const follow = (id: string, otherId: string) => k(L(id), `FOLLOW#${otherId}`);
export const follower = (id: string, otherId: string) => k(L(id), `FOLLOWER#${otherId}`);
export const block = (id: string, otherId: string) => k(L(id), `BLOCK#${otherId}`);
export const blockedBy = (id: string, otherId: string) => k(L(id), `BLOCKEDBY#${otherId}`);
export const mute = (id: string, otherId: string) => k(L(id), `MUTE#${otherId}`);
export const mutedBy = (id: string, otherId: string) => k(L(id), `MUTEDBY#${otherId}`);
export const suggestionMute = (id: string, otherId: string) => k(L(id), `SMUTE#${otherId}`);
export const threadMute = (id: string, threadId: string) => k(L(id), `TMUTE#${threadId}`);
export const entitlement = (id: string, kind: string, ref: string) => k(L(id), `ENT#${kind}#${ref}`);
export const notification = (id: string, createdAt: string, notifId: string) => k(L(id), `NOTIF#${ts(createdAt)}#${notifId}`);
export const notificationDedupe = (id: string, hash: string) => k(L(id), `NDEDUP#${hash}`);
export const conversation = (id: string, partnerId: string) => k(L(id), `CONV#${partnerId}`);
export const pushToken = (id: string, token: string) => k(L(id), `PUSHTOK#${sha(token)}`);
export const listenerSingleton = (id: string, name: 'PUSHPREF' | 'QUEUE' | 'INTERESTS' | 'STICKERS' | 'DELETION' | 'EMAILCHG') => k(L(id), name);
export const identity = (id: string, provider: string) => k(L(id), `IDENT#${provider}`);
export const playlist = (id: string, playlistId: string) => k(L(id), `PLAYLIST#${playlistId}`);
export const roles = (id: string, feedUrl: string) => k(L(id), `ROLES#${feedKey(feedUrl)}`);
/** Prefixes for begins_with on the listener partition. */
export const LISTENER_SK = {
  sessions: 'SESS#', subs: 'SUB#', positions: 'POS#', library: 'LIB#', reactions: 'REACT#', commentLikes: 'CLIKE#',
  follows: 'FOLLOW#', followers: 'FOLLOWER#', blocks: 'BLOCK#', blockedBy: 'BLOCKEDBY#', entitlements: 'ENT#',
  notifications: 'NOTIF#', conversations: 'CONV#', pushTokens: 'PUSHTOK#', playlists: 'PLAYLIST#',
} as const;

// ---- sessions `SESS#<tokenHash>` ----
export const session = (tokenHash: string) => k(`SESS#${tokenHash}`, 'S');

// ---- shows `SH#<feedKey>` ----
export const SH = (feedUrl: string) => `SH#${feedKey(feedUrl)}`;
export const show = (feedUrl: string) => k(SH(feedUrl), 'META');
export const showChild = (feedUrl: string, sk: string) => k(SH(feedUrl), sk);
export const teamMember = (feedUrl: string, listenerId: string) => k(SH(feedUrl), `TEAM#${listenerId}`);
export const invite = (feedUrl: string, inviteId: string) => k(SH(feedUrl), `INVITE#${inviteId}`);
export const claim = (feedUrl: string, claimId: string) => k(SH(feedUrl), `CLAIM#${claimId}`);
export const announcement = (feedUrl: string, createdAt: string, id: string) => k(SH(feedUrl), `ANN#${ts(createdAt)}#${id}`);
export const poll = (feedUrl: string, pollId: string) => k(SH(feedUrl), `POLL#${pollId}`);
export const pollVote = (feedUrl: string, pollId: string, listenerId: string) => k(SH(feedUrl), `POLLVOTE#${pollId}#${listenerId}`);
export const showMute = (feedUrl: string, listenerId: string) => k(SH(feedUrl), `SMUTE#${listenerId}`);
export const hiddenEpisode = (feedUrl: string, episodeId: string) => k(SH(feedUrl), `HIDDENEP#${episodeId}`);
export const earning = (feedUrl: string, createdAt: string, purchaseId: string) => k(SH(feedUrl), `EARN#${ts(createdAt)}#${purchaseId}`);
export const milestone = (feedUrl: string, id: string) => k(SH(feedUrl), `MILESTONE#${id}`);
export const showSingleton = (feedUrl: string, name: 'OVERRIDE' | 'POLICY' | 'DEMO' | 'ALSO') => k(SH(feedUrl), name);

// ---- episodes `EP#<id>` ----
export const EP = (id: string) => `EP#${id}`;
export const episode = (id: string) => k(EP(id), 'META');
export const heat = (id: string) => k(EP(id), 'HEAT');
export const heatMark = (id: string, b: number, listenerId: string) => k(EP(id), `HM#${bucket(b)}#${listenerId}`);
export const retention = (id: string) => k(EP(id), 'RET');
/** Top-level comment: `C#<rootCreatedAt>#<rootId>`; a reply sorts right after its root (one level only). */
export const comment = (episodeId: string, createdAt: string, commentId: string) => k(EP(episodeId), `C#${ts(createdAt)}#${commentId}`);
export const reply = (episodeId: string, root: { createdAt: string; id: string }, createdAt: string, replyId: string) =>
  k(EP(episodeId), `C#${ts(root.createdAt)}#${root.id}#R#${ts(createdAt)}#${replyId}`);
export const unfriendlyMark = (episodeId: string, commentId: string, listenerId: string) => k(EP(episodeId), `CU#${commentId}#${listenerId}`);
export const heldComment = (episodeId: string, id: string) => k(EP(episodeId), `HELD#${id}`);
export const clip = (episodeId: string, createdAt: string, id: string) => k(EP(episodeId), `CLIP#${ts(createdAt)}#${id}`);

// ---- other partitions ----
export const voicePost = (id: string) => k(`VP#${id}`, 'POST');
export const voicePostChild = (id: string, sk: string) => k(`VP#${id}`, sk);
/** Chat pair partition, the two ids in order so both sides find the same one. */
export const chatPair = (a: string, b: string) => (a < b ? `CH#${a}#${b}` : `CH#${b}#${a}`);
export const chatMessage = (a: string, b: string, seq: number) => k(chatPair(a, b), `M#${pad(seq)}`);
export const report = (targetKind: string, targetId: string, reporterId: string) => k(`RPT#${targetKind}#${targetId}`, `BY#${reporterId}`);
export const moderationAction = (id: string) => k(`MA#${id}`, 'A');
export const appeal = (actionId: string) => k(`APPEAL#${actionId}`, 'A');
export const purchase = (purchaseToken: string) => k(`PUR#${sha(purchaseToken)}`, 'P');
export const redeemCode = (codeHash: string) => k(`RC#${codeHash}`, 'CODE');
export const redeemUse = (codeHash: string, listenerId: string) => k(`RC#${codeHash}`, `USE#${listenerId}`);
export const gift = (code: string) => k(`GIFT#${code}`, 'G');
export const config = (name: string) => k(`CFG#${name}`, 'V');
export const hiddenFeed = (feedUrl: string) => k('CFG#hidden-feeds', feedKey(feedUrl));
export const contentPage = (kind: string, slug: string) => k(`CONTENT#${kind}`, slug);
/** Admin audit, append-only; month partition, padded numeric id. */
export const audit = (createdAt: string, id: number) => k(`AUDIT#${ts(createdAt).slice(0, 7)}`, pad(id));
export const similarity = (generation: string, feedUrl: string, score: number, otherFeedUrl: string) =>
  k(`SIM#${generation}#${feedKey(feedUrl)}`, `${pad(Math.max(0, Math.round((1 - score) * 1e9)), 10)}#${feedKey(otherFeedUrl)}`);
export const OUTBOX_SHARDS = 4;
export const outbox = (shard: number, createdAt: string, id: string) => k(`OUTBOX#${shard}`, `${ts(createdAt)}#${id}`);
export const job = (kind: string, id: string) => k(`JOB#${kind}#${id}`, 'J');
export const seq = (name: string) => k(`SEQ#${name}`, 'S');

// ---- uniqueness items `U#…` (data-model.md §5) ----
export const unique = (kind: string, value: string) => k(`U#${kind}#${value}`, 'U');
export const U = {
  email: (email: string) => unique('EMAIL', email.trim().toLowerCase()),
  guid: (feedUrl: string, guid: string) => unique('GUID', `${feedKey(feedUrl)}#${sha(guid)}`),
  clip: (authorId: string, clientId: string) => unique('CLIP', `${authorId}#${clientId}`),
  claimCode: (code: string) => unique('CLAIMCODE', code),
  proven: (feedUrl: string) => unique('PROVEN', feedKey(feedUrl)),
  txn: (orderId: string) => unique('TXN', orderId),
  hostedGuid: (guid: string) => unique('HGUID', sha(guid)),
  invite: (tokenHash: string) => unique('INVITE', tokenHash),
  error: (scope: string, message: string, appVersion: string, platform: string) => unique('ERR', sha(JSON.stringify([scope, message, appVersion, platform]))),
  listened: (listenerId: string, episodeId: string) => unique('LISTENED', `${listenerId}#${episodeId}`),
  applied: (outboxId: string) => unique('APPLIED', outboxId),
  lock: (name: string) => unique('LOCK', name),
} as const;

// ---- GSI key attributes (data-model.md §4). Each returns the two attributes to spread into an item. ----
export const G1 = (authorId: string, kind: string, createdAt: string, id: string) => ({ G1PK: `AUTH#${authorId}`, G1SK: `${kind}#${ts(createdAt)}#${id}` });
export const G2eps = (feedUrl: string, publishedAt: string | null | undefined, episodeId: string) => ({ G2PK: `SHEPS#${feedKey(feedUrl)}`, G2SK: `${tsOrLast(publishedAt)}#${episodeId}` });
export const G2subs = (feedUrl: string, createdAt: string, listenerId: string) => ({ G2PK: `SHSUBS#${feedKey(feedUrl)}`, G2SK: `${ts(createdAt)}#${listenerId}` });
export const G3eps = (genreId: number | string, publishedAt: string, episodeId: string) => ({ G3PK: `GENREEPS#${genreId}`, G3SK: `${ts(publishedAt)}#${episodeId}` });
export const G3shows = (genreId: number | string, latestPublishedAt: string, feedUrl: string) => ({ G3PK: `GENRESH#${genreId}`, G3SK: `${ts(latestPublishedAt)}#${feedKey(feedUrl)}` });
/** Sparse queue: set while waiting, REMOVE G4PK, G4SK when done. `dayOf` adds a day bucket (hot-key rule, research R7). */
export const G4 = (queue: string, sortTs: string, id: string, dayOf?: string) => ({ G4PK: `Q#${queue}${dayOf ? `#${dayOf}` : ''}`, G4SK: `${ts(sortTs)}#${id}` });
export const G5 = (kind: string, value: string, createdAt: string) => ({ G5PK: `REF#${kind}#${value}`, G5SK: ts(createdAt) });
export const G6 = (displayName: string, listenerId: string) => ({ G6PK: `NAME#${displayName.trim().toLowerCase()}`, G6SK: listenerId });
/** Lane LB: the hourly feed list `Q#feeds` (a show META while it has a live subscriber), in feed-key order — no time to sort by. */
export const G4feeds = (feedUrl: string) => ({ G4PK: 'Q#feeds', G4SK: feedKey(feedUrl) });

// ---- sm-events partitions (data-model.md §4, last paragraph) ----
export const ev = {
  activity: (actorId: string, createdAt: string, id: number) => k(`ACT#${actorId}`, `${ts(createdAt)}#${pad(id)}`),
  activityDedupe: (actorId: string, kind: string, episodeId: string, d: string) => unique('ACT', `${actorId}#${kind}#${episodeId}#${d}`),
  feedInbox: (followerId: string, createdAt: string, id: string) => k(`FEED#${followerId}`, `${ts(createdAt)}#${id}`),
  friendsListening: (followerId: string, episodeId: string, actorId: string) => k(`FL#${followerId}`, `${episodeId}#${actorId}`),
  recEvent: (listenerId: string, createdAt: string, id: number) => k(`RE#${listenerId}`, `${ts(createdAt)}#${pad(id)}`),
  subscriptionEvent: (feedUrl: string, createdAt: string, id: number) => k(`SE#${feedKey(feedUrl)}`, `${ts(createdAt)}#${pad(id)}`),
  dailyActive: (d: string, listenerId: string) => k(`DA#${d}`, listenerId),
  live: (episodeId: string, installHash: string) => k(`LIVE#${episodeId}`, installHash),
  rate: (rateKey: string, windowStart: string) => k(`RATE#${rateKey}`, ts(windowStart)),
  pushSent: (listenerId: string, episodeId: string, kind: string) => k(`PUSHSENT#${listenerId}`, `${episodeId}#${kind}`),
  /** Hourly rollup: `R#<scope>#<metric>` / `yyyy-mm-ddThh`. */
  rollup: (scope: string, metric: string, at: string) => k(`R#${scope}#${metric}`, ts(at).slice(0, 13)),
} as const;
export const E1 = (d: string, kind: string, key: string) => ({ E1PK: `DAY#${d}`, E1SK: `${kind}#${key}` });

// ---- Lane AC (account) additions — data-model.md "Lane AC changes" ----
/** Act-as pointer under the ADMIN's partition (replaces the `acting_admin_id` lookup; strongly consistent, no GSI). */
export const actAsPtr = (adminId: string, publicId: string) => k(L(adminId), `ACTAS#${publicId}`);
/** "Not liking these?" answers, newest last. */
export const recFeedback = (id: string, createdAt: string, fbId: string) => k(L(id), `RECFB#${ts(createdAt)}#${fbId}`);
/** One show's new-episode switch (notify_show_prefs). */
export const notifyShow = (id: string, feedUrl: string) => k(L(id), `NOTIFYSHOW#${feedKey(feedUrl)}`);
/** A like-grouping window for social pushes (push_like_windows). */
export const pushWindow = (id: string, groupKey: string) => k(L(id), `PUSHWIN#${sha(groupKey)}`);
/** A weekly digest; the key is the once-per-ISO-week rule. */
export const weeklyDigest = (id: string, isoWeek: string) => k(L(id), `DIGEST#${isoWeek}`);
/** An emailed sign-in code, by address (there may be no account yet). */
export const emailCode = (email: string) => k(`ECODE#${email.trim().toLowerCase()}`, 'C');
/** Feedback and its images under one partition. */
export const feedback = (id: string) => k(`FB#${id}`, 'F');
export const feedbackImage = (id: string, n: number) => k(`FB#${id}`, `IMG#${n}`);
/** A push token's owner (a token moves to whoever registered it last; sendExpo knows only the token). */
export const pushTokenOwner = (token: string) => unique('PUSHTOK', sha(token));
/** Statuses that pushed today, per author (status_push_log), in sm-events. */
export const statusPushLog = (authorId: string, d: string) => k(`SPL#${authorId}`, d);
/** Account prefixes: everything of a listener's partition that the deletion job removes. */
export const AC_SK = { actAs: 'ACTAS#', recFeedback: 'RECFB#', notifyShow: 'NOTIFYSHOW#', pushWindow: 'PUSHWIN#', digest: 'DIGEST#' } as const;

// ---- sm-cache ----
export const cacheEntry = (cacheKey: string) => k(`CACHE#${sha(cacheKey)}`, 'V');
export const cacheChunk = (cacheKey: string, n: number) => k(`CACHE#${sha(cacheKey)}`, `CHUNK#${pad(n, 4)}`);
/** Lane LB: a cache key prefix's generation (prefix invalidation without a Scan — data-model.md §13 note). */
export const cacheGen = (prefix: string) => k(`CGEN#${sha(prefix)}`, 'G');

/**
 * The index names in infra/tables.yaml and the key attributes of each (paginate.ts builds resume keys from them).
 * data-model.md calls the indexes G1…G6 and E1; their NAMES are GSI1…GSI6 and EV1 because DynamoDB index
 * names "must be between 3 and 255 characters long" (https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.NamingRulesDataTypes.html).
 * The key ATTRIBUTES keep the short names (G1PK, G1SK …).
 */
export const INDEX = { G1: 'GSI1', G2: 'GSI2', G3: 'GSI3', G4: 'GSI4', G5: 'GSI5', G6: 'GSI6', E1: 'EV1' } as const;
export const INDEX_KEYS: Readonly<Record<string, readonly [string, string]>> = {
  GSI1: ['G1PK', 'G1SK'], GSI2: ['G2PK', 'G2SK'], GSI3: ['G3PK', 'G3SK'], GSI4: ['G4PK', 'G4SK'], GSI5: ['G5PK', 'G5SK'], GSI6: ['G6PK', 'G6SK'],
  EV1: ['E1PK', 'E1SK'],
};
