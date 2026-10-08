// The phone↔API contract: JSON Schemas of the answers the phone reads, each with an example, and a small validator.
/**
 * M25 G8. One file on purpose — no dependency and no internal imports, so the API tests (tsx,
 * `import … from '…/packages/contracts/src/index.ts'`) and the phone tests (jest + babel,
 * `import … from '…/packages/contracts/src/index'`) load the same object. It is NOT an npm
 * workspace (no package.json), so the lockfile does not change.
 *
 * Both sides are tested against it:
 *   - apps/api/test/contracts.test.ts — the REAL answers of the real app (real routes, real SQL)
 *     must match each schema;
 *   - apps/mobile/__tests__/contracts.test.ts — each schema's `example` is fed through the
 *     phone's own client and parsers (src/social/api.ts, notifications-api.ts, m12-api.ts,
 *     src/config/**), which must read it.
 * A field the server renames or retypes fails the API side; a schema changed to follow it fails
 * the phone side if the phone still reads the old field. Schemas are open (extra fields are
 * allowed): the phone ignores what it does not read, so only what it reads is pinned.
 *
 * Written by hand from the phone's types and the server's routes (the server has no zod for its
 * answers, only for its inputs). Every schema is plain JSON (draft 2020-12 keywords; `$defs`/`$ref`
 * within one schema) — `JSON.stringify(CONTRACTS[x].schema)` is the file a JSON Schema tool takes.
 */

export type Schema = {
  type?: SchemaType | SchemaType[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
  minItems?: number;
  enum?: readonly (string | number | boolean | null)[];
  anyOf?: Schema[];
  $ref?: string;
  $defs?: Record<string, Schema>;
  description?: string;
};
type SchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

/** Every problem with `value` against `schema` ([] = valid). Paths look like `$.items[0].id`. */
export function validate(schema: Schema, value: unknown, root: Schema = schema, path = '$'): string[] {
  if (schema.$ref) {
    const name = /^#\/\$defs\/(.+)$/.exec(schema.$ref)?.[1];
    const target = name ? root.$defs?.[name] : undefined;
    if (!target) return [`${path}: unknown $ref ${schema.$ref}`];
    return validate(target, value, root, path);
  }
  if (schema.anyOf) {
    const results = schema.anyOf.map((s) => validate(s, value, root, path));
    if (results.some((r) => r.length === 0)) return [];
    return [`${path}: matches none of anyOf (${results.map((r) => r[0]).join(' | ')})`];
  }
  const out: string[] = [];
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => isType(t, value))) return [`${path}: expected ${types.join('|')}, got ${kindOf(value)}`];
  }
  if (schema.enum && !schema.enum.includes(value as never)) out.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.items) value.forEach((v, i) => out.push(...validate(schema.items!, v, root, `${path}[${i}]`)));
  } else if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in o) || o[k] === undefined) out.push(`${path}.${k}: missing`);
    for (const [k, v] of Object.entries(o)) {
      const p = schema.properties?.[k];
      if (p) out.push(...validate(p, v, root, `${path}.${k}`));
      else if (schema.additionalProperties === false) out.push(`${path}.${k}: not allowed`);
      else if (typeof schema.additionalProperties === 'object') out.push(...validate(schema.additionalProperties, v, root, `${path}.${k}`));
    }
  }
  return out;
}

function isType(t: SchemaType, v: unknown): boolean {
  switch (t) {
    case 'null': return v === null;
    case 'array': return Array.isArray(v);
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
    case 'integer': return typeof v === 'number' && Number.isInteger(v);
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    default: return typeof v === t;
  }
}
const kindOf = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

// ---- builders (they only make plain JSON Schema objects) ----
const S: Schema = { type: 'string' };
const SN: Schema = { type: ['string', 'null'] };
const I: Schema = { type: 'integer' };
const IN: Schema = { type: ['integer', 'null'] };
const N: Schema = { type: 'number' };
const B: Schema = { type: 'boolean' };
const arr = (items: Schema, minItems?: number): Schema => ({ type: 'array', items, ...(minItems !== undefined ? { minItems } : {}) });
/** An open object: `req` fields required, `opt` fields typed when present. */
const obj = (req: Record<string, Schema>, opt: Record<string, Schema> = {}): Schema => ({
  type: 'object', properties: { ...req, ...opt }, required: Object.keys(req),
});
const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` });

const LISTENER = obj(
  { id: S, email: S, displayName: S, createdAt: S },
  {
    privateListening: B, avatarUrl: S, bio: S, ageRange: SN, gender: SN, likesPublic: B, plus: B, plusUntil: SN,
    birthday: S, industry: S, hideBadge: B, hideStickers: B, hideDecorations: B, privateSubscriptions: B,
  },
);
const EPISODE_CARD = obj(
  { id: S, feedUrl: S, guid: S, title: S, showTitle: S, enclosureUrl: S },
  { imageUrl: S, durationMs: I, publishedAt: S },
);
const SHOW_CARD = obj({ feedUrl: S, title: S, author: S, genres: arr(S) }, { appleId: I, imageUrl: S, episodeCount: I, pinned: B });
const DISCOVER_ITEM = obj(
  { kind: { type: 'string', enum: ['pick', 'talkedAbout', 'trending'] }, key: S, episode: ref('episodeCard') },
  { why: S, reason: S, score: N, date: S, stats: obj({ listeners: I, comments: I }) },
);
const COMMENT: Schema = obj(
  { id: S, authorId: SN, displayName: SN, body: SN, offsetMs: IN, parentId: SN, createdAt: S, deleted: B },
  {
    mine: B, replies: arr(ref('comment')), held: B, removed: B, blocked: B, reported: B, host: B, hiddenByHost: B,
    likeCount: I, likedByMe: B, initials: SN, avatarUrl: S,
  },
);
const ACTOR = obj({ id: S, displayName: SN }, { avatarUrl: S, bio: S, youFollow: B });

export type Contract = { method: 'GET' | 'POST'; path: string; schema: Schema; example: unknown; note: string };

export const CONTRACTS = {
  signIn: {
    method: 'POST', path: '/v1/auth/sign-in (also /v1/auth/code/verify)', note: 'api.signIn / verifyCode → token + listener',
    schema: { ...obj({ token: S, listener: ref('listener') }), $defs: { listener: LISTENER } },
    example: { token: 'tok-1', listener: { id: 'L1', email: 'a@example.com', displayName: 'Alex', createdAt: '2026-10-01T00:00:00.000Z' } },
  },
  me: {
    method: 'GET', path: '/v1/me', note: 'api.me() → listener',
    schema: { ...obj({ listener: ref('listener') }), $defs: { listener: LISTENER } },
    example: {
      listener: {
        id: 'L1', email: 'a@example.com', displayName: 'Alex', createdAt: '2026-10-01T00:00:00.000Z', privateListening: false,
        likesPublic: true, plus: false, plusUntil: null, hideBadge: false, hideStickers: false, hideDecorations: false, privateSubscriptions: false,
      },
    },
  },
  social: {
    method: 'GET', path: '/v1/episodes/:id/social', note: 'api.social() → the comments list, heat, my reactions',
    schema: {
      ...obj(
        { serverTime: S, episode: obj({ id: S, durationMs: IN }), comments: arr(ref('comment')), heat: { anyOf: [obj({ available: { type: 'boolean', enum: [true] }, buckets: arr(N) }), obj({ available: { type: 'boolean', enum: [false] } })] } },
        { myReactionBuckets: arr(I) },
      ),
      $defs: { comment: COMMENT },
    },
    example: {
      serverTime: '2026-10-08T00:00:00.000Z', episode: { id: 'E1', durationMs: 2_000_000 },
      comments: [{
        id: 'c1', authorId: 'L1', displayName: 'Alex', body: 'At 0:20 — love it', offsetMs: 20_000, parentId: null, createdAt: '2026-10-08T00:00:00.000Z', deleted: false,
        likeCount: 1, likedByMe: false, initials: 'A',
        replies: [{ id: 'c2', authorId: 'L2', displayName: 'Bea', body: 'Same', offsetMs: null, parentId: 'c1', createdAt: '2026-10-08T00:01:00.000Z', deleted: false }],
      }],
      heat: { available: true, buckets: [0, 0.5, 1] },
      myReactionBuckets: [3],
    },
  },
  feed: {
    method: 'GET', path: '/v1/me/feed', note: 'api.feed() → what people I follow did',
    schema: {
      ...obj({
        serverTime: S,
        items: arr(obj({
          id: I, kind: { type: 'string', enum: ['listened', 'clipped', 'commented'] }, actor: ref('actor'),
          episode: obj({ id: S, title: S, showTitle: SN, imageUrl: SN }), momentMs: IN, refId: SN, createdAt: S,
        })),
      }, { next: S }),
      $defs: { actor: ACTOR },
    },
    example: {
      serverTime: '2026-10-08T00:00:00.000Z',
      items: [{ id: 7, kind: 'commented', actor: { id: 'L2', displayName: 'Bea' }, episode: { id: 'E1', title: 'Ep 1', showTitle: 'Show', imageUrl: null }, momentMs: 20_000, refId: 'c2', createdAt: '2026-10-08T00:01:00.000Z' }],
    },
  },
  discover: {
    method: 'GET', path: '/v1/discover', note: 'api.discover() → the Discover page',
    schema: {
      ...obj(
        { picks: arr(ref('item')), talkedAbout: arr(ref('item')), trending: arr(ref('item')), stale: B, serverTime: S },
        {
          date: S, shows: arr(ref('show')), video: arr(ref('item')), premium: arr(ref('show')),
          newShows: arr(obj({ show: ref('show'), episode: ref('episodeCard') })),
          newArrivals: arr(obj({ show: ref('show'), episode: ref('episodeCard') })),
          said: arr(obj({ commentId: S, authorId: S, body: S, createdAt: S, episode: ref('episodeCard') })),
          collections: arr(obj({ id: S, title: S, items: arr(ref('item')) }, { subtitle: S })),
          layout: obj({ order: arr(S), hidden: arr(S) }),
        },
      ),
      $defs: { item: DISCOVER_ITEM, episodeCard: EPISODE_CARD, show: SHOW_CARD },
    },
    example: {
      date: '2026-10-08', stale: false, serverTime: '2026-10-08T00:00:00.000Z',
      picks: [{ kind: 'pick', key: 'p1', why: 'The pick of the day.', episode: { id: 'E1', feedUrl: 'https://feeds.example.com/a.xml', guid: 'g1', title: 'Ep 1', showTitle: 'Show', enclosureUrl: 'https://cdn.example.com/1.mp3' } }],
      talkedAbout: [], trending: [],
      shows: [{ feedUrl: 'https://feeds.example.com/a.xml', title: 'Show', author: 'Host', genres: ['Comedy'] }],
      layout: { order: ['picks', 'shows'], hidden: [] },
    },
  },
  config: {
    method: 'GET', path: '/v1/config', note: 'createConfigApi().config → createConfigLoader().refresh → readConfig(body.config)',
    schema: obj({
      config: obj({
        shortcuts: arr(obj({ id: S }, { label: S, hidden: B })),
        genres: arr(obj({ id: I }, { name: S, hidden: B })),
        sectionTitles: { type: 'object', additionalProperties: S },
        listSizes: obj({ discoverCategories: I, searchCategories: I, searchHints: I }),
        ratePrompt: obj({ enabled: B, delayMs: I, reaskAfterDays: IN, storeUrls: obj({}, { ios: S, android: S }) }),
        searchHints: arr(S),
      }),
      version: I, updatedAt: SN,
    }),
    example: {
      version: 1, updatedAt: '2026-10-08T00:00:00.000Z',
      config: {
        shortcuts: [{ id: 'categories' }, { id: 'queue', label: 'Up next' }], genres: [{ id: 1321, name: 'Business' }],
        sectionTitles: { 'For You': 'Just for you' }, listSizes: { discoverCategories: 6, searchCategories: 4, searchHints: 5 },
        ratePrompt: { enabled: false, delayMs: 1500, reaskAfterDays: null, storeUrls: {} }, searchHints: ['history', 'science'],
      },
    },
  },
  content: {
    method: 'GET', path: '/v1/content/:kind (academy | faq)', note: 'createConfigApi().content → Academy / Help pages',
    schema: obj({ items: arr(obj({ slug: S, title: S, summary: SN, tag: SN, body: S, position: I, updatedAt: S })) }),
    example: { items: [{ slug: 'start', title: 'Getting started', summary: 'Your first show', tag: null, body: '# Hello\n\nPress **Play**.', position: 0, updatedAt: '2026-10-08T00:00:00.000Z' }] },
  },
  notifications: {
    method: 'GET', path: '/v1/me/notifications', note: 'createNotificationsApi().list → Interactions',
    schema: obj({
      items: arr(obj({
        id: S, kind: { type: 'string', enum: ['reply', 'like', 'mention', 'follow'] },
        actor: obj({ id: S, name: S, avatarUrl: SN }),
        ref: { type: 'object', additionalProperties: S, properties: { commentId: S, parentId: S, episodeId: S, excerpt: S, episodeTitle: S } },
        createdAt: S, unread: B,
      })),
      next: SN,
    }),
    example: {
      items: [{ id: 'n1', kind: 'reply', actor: { id: 'L2', name: 'Bea', avatarUrl: null }, ref: { commentId: 'c2', parentId: 'c1', episodeId: 'E1', excerpt: 'Same', episodeTitle: 'Ep 1' }, createdAt: '2026-10-08T00:01:00.000Z', unread: true }],
      next: null,
    },
  },
  systemNotices: {
    method: 'GET', path: '/v1/me/notifications/system', note: 'createNotificationsApi().system → parseSystemNotices',
    schema: obj({ items: arr(obj({ id: S, title: S, body: S, createdAt: S }, { action: obj({ label: S, route: S }), to: { type: 'string', enum: ['everyone', 'you'] } })) }),
    example: { items: [{ id: 's1', title: 'Welcome', body: 'Hello from SocialNet.', createdAt: '2026-10-08T00:00:00.000Z', action: { label: 'Open Discover', route: '/discover' }, to: 'everyone' }] },
  },
  purchases: {
    method: 'GET', path: '/v1/me/purchases', note: 'createM12Api().purchases → the wallet',
    schema: obj(
      {
        items: arr(obj({ id: S, store: S, productId: S, status: S, expiresAt: SN, amountMicros: { type: ['number', 'null'] }, currency: SN, createdAt: S })),
        storeReady: B,
      },
      { stores: obj({ google: B, apple: B }), entitlements: arr(obj({ kind: S, ref: S, until: SN }, { startsAt: S })) },
    ),
    example: {
      items: [{ id: 'p1', store: 'google', productId: 'plus_month', status: 'active', expiresAt: '2026-11-08T00:00:00.000Z', amountMicros: 9_900_000, currency: 'MYR', createdAt: '2026-10-08T00:00:00.000Z' }],
      storeReady: true, stores: { google: true, apple: false }, entitlements: [{ kind: 'plus', ref: '', until: '2026-11-08T00:00:00.000Z' }],
    },
  },
  tips: {
    method: 'GET', path: '/v1/me/tips', note: 'createM12Api().tips → the wallet',
    schema: obj({ items: arr(obj({ id: S, feedUrl: S, showTitle: SN, createdAt: S, amountMicros: { type: ['number', 'null'] }, currency: SN })), storeReady: B }),
    example: { items: [{ id: 't1', feedUrl: 'https://feeds.example.com/a.xml', showTitle: 'Show', createdAt: '2026-10-08T00:00:00.000Z', amountMicros: 4_900_000, currency: 'MYR' }], storeReady: true },
  },
} satisfies Record<string, Contract>;

export type ContractName = keyof typeof CONTRACTS;
