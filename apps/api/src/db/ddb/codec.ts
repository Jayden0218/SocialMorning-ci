// Row ↔ item: every item gets its type `t`, dates become ISO strings, and each type's attribute allowlist is enforced.
/**
 * M26 F0-06 / F0-12. Replaces the Postgres jsonb tests (`jsonb-postgres`, `jsonb-repair`): a value goes in
 * and comes back equal (test/ddb-codec.test.ts), and replaces the `information_schema` privacy guards
 * (G-L1 live listeners, G-L2 promotions): a STRICT type refuses any attribute outside its allowlist, so an
 * account column can never be added to those items by accident.
 *
 * Values (DocumentClient marshalling, https://github.com/aws/aws-sdk-js-v3/blob/main/lib/lib-dynamodb/README.md):
 * - Date → ISO-8601 string (what the repos return today after `toISOString`). It comes back a string.
 * - bigint → number when safe, else refused (the marshaller refuses imprecise numbers by default).
 * - Buffer → Uint8Array (Binary). NaN/Infinity, JS Map, class instances, functions: refused.
 * - `undefined` attributes are dropped; `null` is kept (NULL).
 * - A JS Set of strings/numbers → SS/NS. An EMPTY set is refused: DynamoDB has no empty set
 *   ("DynamoDB does not support empty sets" — https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.NamingRulesDataTypes.html).
 * Item size: 400 KB including attribute names (https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html);
 * `encode` refuses a bigger item here, with its type in the message, instead of a ValidationException later.
 */
import type { Item, Key, TableRole } from './store.ts';

/** Attribute names the codec owns. Repo attributes may not use them. */
export const RESERVED = new Set(['PK', 'SK', 't', 'ttl', 'G1PK', 'G1SK', 'G2PK', 'G2SK', 'G3PK', 'G3SK', 'G4PK', 'G4SK', 'G5PK', 'G5SK', 'G6PK', 'G6SK', 'E1PK', 'E1SK']);
const GSI_ATTR = /^(G[1-6]|E1)(PK|SK)$/;

export const ITEM_MAX_BYTES = 400 * 1024;

/**
 * Attributes that identify a person. A STRICT type that must never be linked to an account
 * (live listeners — G-L1; promotions — G-L2) may not list any of these.
 */
export const PERSON_ATTRS = ['listenerId', 'accountId', 'authorId', 'actorId', 'ownerId', 'reporterId', 'userId', 'email', 'ip', 'deviceId', 'installId', 'sessionId', 'displayName'] as const;

type TypeDef = { table: TableRole; attrs: readonly string[] | 'open' };

/** Lane SG: a follow / mute edge holds only the other listener and when (data-model.md "Lane SG changes"). */
const SG_EDGE = ['otherId', 'createdAt'] as const;

/**
 * Every item type in data-model.md §3–§13. `attrs: 'open'` until the domain lane that owns the type fixes
 * its attribute list (tasks.md: a lane that changes an item shape updates data-model.md in the same
 * commit); a STRICT list is enforced by `encode`.
 */
export const ITEM_TYPES = {
  // listener partition
  listener: { table: 'main', attrs: 'open' }, sessionPtr: { table: 'main', attrs: 'open' }, subscription: { table: 'main', attrs: 'open' },
  subOrder: { table: 'main', attrs: 'open' }, position: { table: 'main', attrs: 'open' }, libraryItem: { table: 'main', attrs: 'open' },
  listenedRange: { table: 'main', attrs: 'open' }, listenedDay: { table: 'main', attrs: 'open' }, reaction: { table: 'main', attrs: 'open' },
  commentLike: { table: 'main', attrs: 'open' }, follow: { table: 'main', attrs: SG_EDGE }, follower: { table: 'main', attrs: SG_EDGE },
  block: { table: 'main', attrs: 'open' }, mute: { table: 'main', attrs: SG_EDGE }, threadMute: { table: 'main', attrs: ['threadKind', 'threadKey', 'createdAt'] },
  entitlement: { table: 'main', attrs: 'open' }, notification: { table: 'main', attrs: ['id', 'recipientId', 'actorId', 'kind', 'ref', 'createdAt'] }, conversation: { table: 'main', attrs: 'open' },
  pushToken: { table: 'main', attrs: 'open' }, pushPrefs: { table: 'main', attrs: 'open' }, queue: { table: 'main', attrs: 'open' },
  interests: { table: 'main', attrs: 'open' }, stickers: { table: 'main', attrs: 'open' }, deletion: { table: 'main', attrs: 'open' },
  emailChange: { table: 'main', attrs: 'open' }, identity: { table: 'main', attrs: 'open' }, playlist: { table: 'main', attrs: ['id', 'ownerId', 'title', 'isPublic', 'items', 'createdAt', 'updatedAt', 'deletedAt', 'v'] },
  roles: { table: 'main', attrs: 'open' },
  // Lane AC (data-model.md "Lane AC changes")
  actAsPtr: { table: 'main', attrs: 'open' }, recFeedback: { table: 'main', attrs: 'open' }, notifyShow: { table: 'main', attrs: 'open' },
  pushWindow: { table: 'main', attrs: 'open' }, weeklyDigest: { table: 'main', attrs: 'open' }, emailCode: { table: 'main', attrs: 'open' },
  feedback: { table: 'main', attrs: 'open' }, feedbackImage: { table: 'main', attrs: ['n', 'mime', 'bytes', 'createdAt'] }, errorReport: { table: 'main', attrs: 'open' },
  pushTokenOwner: { table: 'main', attrs: ['owner', 'token'] },
  // sessions, shows, episodes
  session: { table: 'main', attrs: 'open' }, show: { table: 'main', attrs: 'open' }, teamMember: { table: 'main', attrs: 'open' },
  invite: { table: 'main', attrs: 'open' }, claim: { table: 'main', attrs: 'open' }, announcement: { table: 'main', attrs: 'open' },
  poll: { table: 'main', attrs: 'open' }, pollVote: { table: 'main', attrs: 'open' }, showMute: { table: 'main', attrs: 'open' },
  showOverride: { table: 'main', attrs: 'open' }, commentPolicy: { table: 'main', attrs: 'open' }, hiddenEpisode: { table: 'main', attrs: 'open' },
  earning: { table: 'main', attrs: 'open' }, milestone: { table: 'main', attrs: 'open' }, hostPick: { table: 'main', attrs: 'open' },
  episode: { table: 'main', attrs: 'open' }, heat: { table: 'main', attrs: 'open' }, heatMark: { table: 'main', attrs: 'open' },
  comment: { table: 'main', attrs: 'open' }, unfriendlyMark: { table: 'main', attrs: 'open' }, heldComment: { table: 'main', attrs: 'open' },
  clip: { table: 'main', attrs: 'open' }, retention: { table: 'main', attrs: 'open' },
  // other partitions
  voicePost: { table: 'main', attrs: 'open' }, chatMessage: { table: 'main', attrs: 'open' }, report: { table: 'main', attrs: 'open' },
  moderationAction: { table: 'main', attrs: 'open' }, appeal: { table: 'main', attrs: 'open' }, purchase: { table: 'main', attrs: 'open' },
  redeemCode: { table: 'main', attrs: 'open' }, redeemUse: { table: 'main', attrs: 'open' }, gift: { table: 'main', attrs: 'open' },
  config: { table: 'main', attrs: 'open' }, hiddenFeed: { table: 'main', attrs: 'open' }, contentPage: { table: 'main', attrs: 'open' },
  audit: { table: 'main', attrs: 'open' }, similarity: { table: 'main', attrs: 'open' }, unique: { table: 'main', attrs: 'open' },
  outbox: { table: 'main', attrs: ['kind', 'id', 'payload', 'createdAt', 'attempts', 'lastError', 'lastTriedAt'] },
  job: { table: 'main', attrs: ['kind', 'id', 'state', 'cursor', 'v', 'done', 'createdAt', 'updatedAt', 'runs', 'lastError'] },
  seq: { table: 'main', attrs: ['v'] },
  /** G-L2: a promotion counts impressions and taps, never who saw or tapped it. */
  promotion: { table: 'main', attrs: ['id', 'imageUrl', 'imageBytes', 'targetKind', 'targetId', 'url', 'label', 'weight', 'dailyCap', 'startsAt', 'endsAt', 'impressions', 'taps', 'createdAt'] },
  // sm-events
  activity: { table: 'events', attrs: ['id', 'actorId', 'kind', 'episodeId', 'momentMs', 'refId', 'day', 'hidden', 'createdAt'] },
  feedInbox: { table: 'events', attrs: ['actorId', 'activityId', 'actPK', 'actSK', 'createdAt'] },
  friendsListening: { table: 'events', attrs: ['actorId', 'episodeId', 'day', 'at'] },
  recEvent: { table: 'events', attrs: 'open' }, subscriptionEvent: { table: 'events', attrs: 'open' }, shareEvent: { table: 'events', attrs: 'open' },
  dailyActive: { table: 'events', attrs: 'open' }, rate: { table: 'events', attrs: ['count', 'windowStart'] }, pushSent: { table: 'events', attrs: 'open' },
  rollup: { table: 'events', attrs: 'open' },
  statusPushLog: { table: 'events', attrs: ['count'] },
  /** G-L1: "listening now" keeps a daily-salted install hash and a time — no account, ever. */
  liveListener: { table: 'events', attrs: ['episodeId', 'listenerHash', 'seenAt'] },
  // Lane SG (data-model.md "Lane SG changes"): strict lists.
  notificationDedupe: { table: 'main', attrs: ['notificationId', 'createdAt'] },
  systemNotice: { table: 'main', attrs: ['id', 'listenerId', 'title', 'body', 'linkLabel', 'linkRoute', 'push', 'createdBy', 'createdAt'] },
  bigActor: { table: 'main', attrs: ['since'] },
  recentListen: { table: 'events', attrs: ['episodeId', 'day', 'at'] },
  // sm-cache
  // Lane LB: `w` = the write that made an entry and its chunks (a reader never mixes two writes); `cacheGen` = a prefix's generation.
  cacheEntry: { table: 'cache', attrs: ['key', 'body', 'gz', 'chunks', 'fetchedAt', 'gen', 'w'] },
  cacheChunk: { table: 'cache', attrs: ['n', 'data', 'w'] },
  cacheGen: { table: 'cache', attrs: ['prefix', 'gen'] },
} as const satisfies Record<string, TypeDef>;

export type ItemType = keyof typeof ITEM_TYPES;
export const STRICT_TYPES = (Object.keys(ITEM_TYPES) as ItemType[]).filter((t) => ITEM_TYPES[t].attrs !== 'open');

export class CodecError extends Error {
  constructor(message: string) { super(`codec: ${message}`); this.name = 'CodecError'; }
}

type Plain = string | number | boolean | null | Uint8Array | Set<string> | Set<number> | Plain[] | { [k: string]: Plain };

function norm(v: unknown, path: string): Plain | undefined {
  if (v === undefined) return undefined;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new CodecError(`${path} is not a finite number`);
    return v;
  }
  if (typeof v === 'bigint') {
    if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) throw new CodecError(`${path} bigint is beyond 2^53`);
    return Number(v);
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) throw new CodecError(`${path} is an invalid Date`);
    return v.toISOString();
  }
  if (v instanceof Uint8Array) return Buffer.isBuffer(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice() : v;
  if (v instanceof Set) {
    if (v.size === 0) throw new CodecError(`${path} is an empty Set (DynamoDB has no empty set; store a list or omit it)`);
    const all = [...v];
    if (all.every((x) => typeof x === 'string')) return new Set(all as string[]);
    if (all.every((x) => typeof x === 'number' && Number.isFinite(x))) return new Set(all as number[]);
    throw new CodecError(`${path} Set must hold only strings or only finite numbers`);
  }
  if (Array.isArray(v)) return v.map((x, i) => norm(x, `${path}[${i}]`) ?? null);
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, Plain> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const n = norm(x, `${path}.${k}`);
      if (n !== undefined) out[k] = n;
    }
    return out;
  }
  throw new CodecError(`${path} has an unsupported value (${Object.prototype.toString.call(v)})`);
}

/** Approximate stored size in bytes (AWS sizing rules: names + values; numbers ≈ 1 byte per 2 digits + 1). */
export function itemSize(item: Record<string, unknown>): number {
  const size = (v: unknown): number => {
    if (v === null || v === undefined || typeof v === 'boolean') return 1;
    if (typeof v === 'string') return Buffer.byteLength(v, 'utf8');
    if (typeof v === 'number') return Math.ceil(String(Math.abs(v)).replace(/[.e+-]/g, '').length / 2) + 1;
    if (v instanceof Uint8Array) return v.byteLength;
    if (v instanceof Set) return [...v].reduce<number>((s, x) => s + size(x), 0);
    if (Array.isArray(v)) return 3 + v.reduce<number>((s, x) => s + 1 + size(x), 0);
    if (typeof v === 'object') return 3 + Object.entries(v as Record<string, unknown>).reduce((s, [k, x]) => s + 1 + Buffer.byteLength(k, 'utf8') + size(x), 0);
    return 0;
  };
  return Object.entries(item).reduce((s, [k, v]) => s + Buffer.byteLength(k, 'utf8') + size(v), 0);
}

export type EncodeExtra = {
  /** GSI key attributes from keys.ts (`G1(...)`, `G4(...)` …). */
  gsi?: Record<string, string>;
  /** TTL backstop, epoch SECONDS (research R5). Never the rule a read relies on. */
  ttl?: number;
};

/** A repo row → the item to Put. Throws CodecError on an unknown/forbidden attribute or a bad value. */
export function encode(type: ItemType, key: Key, attrs: Record<string, unknown>, extra: EncodeExtra = {}): Item {
  const def: TypeDef = ITEM_TYPES[type];
  if (!def) throw new CodecError(`unknown item type ${String(type)}`);
  const item: Item = { PK: key.PK, SK: key.SK, t: type };
  for (const [name, value] of Object.entries(attrs)) {
    if (RESERVED.has(name)) throw new CodecError(`${type}.${name} is a reserved attribute name`);
    if (def.attrs !== 'open' && !def.attrs.includes(name)) throw new CodecError(`${type}.${name} is not in the ${type} allowlist`);
    const n = norm(value, `${type}.${name}`);
    if (n !== undefined) item[name] = n;
  }
  for (const [name, value] of Object.entries(extra.gsi ?? {})) {
    if (!GSI_ATTR.test(name)) throw new CodecError(`${name} is not a GSI key attribute`);
    if (typeof value !== 'string' || value.length === 0) throw new CodecError(`${name} must be a non-empty string`);
    item[name] = value;
  }
  if (extra.ttl !== undefined) {
    if (!Number.isInteger(extra.ttl) || extra.ttl < 1_000_000_000 || extra.ttl > 99_999_999_999) throw new CodecError(`ttl must be epoch SECONDS, got ${extra.ttl}`);
    item['ttl'] = extra.ttl;
  }
  const bytes = itemSize(item);
  if (bytes > ITEM_MAX_BYTES) throw new CodecError(`${type} item is ~${bytes} bytes, over the 400 KB item limit (chunk it — data-model.md §13)`);
  return item;
}

export type Decoded<T = Record<string, unknown>> = { type: string; key: Key; attrs: T };

/** An item read back → the repo row (reserved attributes removed). */
export function decode<T = Record<string, unknown>>(item: Item): Decoded<T> {
  const attrs: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(item)) if (!RESERVED.has(name)) attrs[name] = value;
  return { type: String(item['t']), key: { PK: String(item['PK']), SK: String(item['SK']) }, attrs: attrs as T };
}

/** Epoch seconds for a TTL attribute, `afterMs` after `nowMs`. */
export const ttlAfter = (nowMs: number, afterMs: number): number => Math.floor((nowMs + afterMs) / 1000);
