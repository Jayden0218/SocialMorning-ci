// Lane LB's copy: episodes + shows + heat, subscriptions, positions, listened ranges, library, rec/subscription events, the cache.
/**
 * M26 lane MIG for lane LB (data-model.md §3–§6, §12–§13, §16 "Lane LB changes"). Each Postgres row becomes the
 * items lane LB's DynamoDB code (src/db/repos/library/ddb/, src/heat/ddb.ts) would have written for it:
 *
 * - episodes → `EP#<id>/META` (+ G2 `SHEPS#`, G3 `GENREEPS#` with a genre and a date; `hidden: true` while lane ST's
 *   hidden_episodes holds its (feed, guid) — ST's hint) and `U#GUID#<feedKey>#<sha(guid)>` → id.
 * - shows (derived, one per feed in episodes ∪ subscriptions) → `SH#<feedKey>/META`: newest title/cover/latest
 *   episode with their ranks (the episode's ISO date, '' = no date), genre (+ G3 `GENRESH#`), `subscriberCount`
 *   (live subscriptions) and G4 `Q#feeds` while > 0. No other lane writes attributes on it (grep `K.show(`).
 * - episode_heat (derived) → `EP#/HEAT` + `HM#<bb>#<listener>` from reactions and visible timestamped comments
 *   (the SQL rule of heat/rebuild.ts: not deleted, not host-hidden, author known, episode length known — a removed
 *   comment still counts). The Postgres table is rebuilt by the API, so it has no way back.
 * - subscriptions → `L#/SUB#<feedKey>` (G2 `SHSUBS#` while live) and `L#/SUBORDER` (rows with a sort_pos).
 * - subscription_events → `SE#<feedKey>` (sm-events, E1 `DAY#`/`se#…`) + `SEQ#subscription_events`.
 * - positions → `L#/POS#`; listened_ranges → `L#/RANGE#…` + `L#/LDAY#<day>` (union per episode).
 * - rec_events → `RE#<listener>` (sm-events, E1 `DAY#`/`re#…`, TTL at + 90 d) + `SEQ#rec_events` + hourly `R#recs#all`.
 * - library_items → `L#/LIB#<kind>#<key>` (lane LB's own `libraryItem`, tombstones with their 30-day TTL).
 * - cache → `CACHE#<sha(key)>/V` (+ `CHUNK#n` over 350 KB), gzipped as `writeEntry` does, `gen` 0 (no `CGEN#`
 *   item exists at cutover, so every generation reads as 0), `w` derived from (key, fetchedAt).
 *   `status-photo:` rows are NOT cache entries on DynamoDB (lane SC's `VPUP#` items) and are left to lane SC.
 *   `feed-block:` markers stay cache entries (touchCacheMarker still writes them) — lane SF's `PUB#` mark is SF's.
 *   `billing:voided` stays a cache entry (lane PD reads it with readEntry).
 *
 * Every `v` is the value a brand-new item gets (1). Times come from the rows only.
 */
import { gunzipSync, gzipSync } from 'node:zlib';
import { unionLength, type Range } from '@socialmorning/social-core';
import { encode } from '../../src/db/ddb/codec.ts';
import * as K from '../../src/db/ddb/keys.ts';
import type { Item } from '../../src/db/ddb/store.ts';
import { CHUNK_BYTES, ttlFor } from '../../src/db/repos/library/ddb/cache.ts';
import { libraryItem } from '../../src/db/repos/library/ddb/library.ts';
import { subscriptionItem } from '../../src/db/repos/library/ddb/subscriptions.ts';
import { REC_KEEP_DAYS } from '../../src/db/repos/library/ddb/rec-events.ts';
import { countsOnHeat } from '../../src/db/repos/social/ddb/sc-common.ts';
import type { Kind } from '../../src/db/repos/library/library.ts';
import {
  bool, dayOf, isoReq, iso, json, num, numReq, str, ttlFrom,
  type CounterCheck, type ItemIndex, type LaneModule, type Mismatch, type Out, type TableSpec,
} from './types.ts';

const DAY_MS = 86_400_000;
const main = (item: Item): Out => ({ table: 'main', item });
const events = (item: Item): Out => ({ table: 'events', item });
const cache = (item: Item): Out => ({ table: 'cache', item });
const s = (v: unknown): string => String(v);
const keyOf = (it: Record<string, unknown>) => `${s(it['PK'])}|${s(it['SK'])}`;

// ---------- episodes, shows ----------

/** The marks the heat curve counts: reactions (bucket stored) ∪ visible timestamped comments (bucket from the length). */
const MARKS_SQL = `
  SELECT r.episode_id, r.listener_id::text AS listener_id, r.bucket::int AS bucket, r.created_at AS at FROM reactions r
  UNION ALL
  SELECT c.episode_id, c.author_id::text AS listener_id, least(99, floor(c.offset_ms * 100.0 / e.duration_ms))::int AS bucket, c.created_at AS at
    FROM comments c JOIN episodes e ON e.id = c.episode_id
   WHERE c.offset_ms IS NOT NULL AND c.deleted_at IS NULL AND c.host_hidden_at IS NULL AND c.author_id IS NOT NULL AND e.duration_ms IS NOT NULL`;

const FEEDS_SQL = 'SELECT feed_url FROM episodes UNION SELECT feed_url FROM subscriptions';

const episodes: TableSpec = {
  pgTable: 'episodes',
  sources: [
    {
      name: 'lb.episodes',
      sql: `SELECT e.id, e.feed_url, e.guid, e.title, e.show_title, e.enclosure_url, e.image_url, e.duration_ms, e.published_at, e.genre_id,
                   e.media_kind, e.first_seen_at, e.updated_at,
                   EXISTS (SELECT 1 FROM hidden_episodes h WHERE h.feed_url = e.feed_url AND h.guid = e.guid) AS hidden
              FROM episodes e`,
      keys: ['id'],
      map(r) {
        const id = s(r['id']);
        const feedUrl = s(r['feed_url']);
        const guid = s(r['guid']);
        const publishedAt = iso(r['published_at']);
        const genreId = num(r['genre_id']);
        // writeEpisode: nulls are omitted; `hidden` is lane ST's hint (page.ts hideByGuid), never stored as false.
        const attrs: Record<string, unknown> = {
          id, feedUrl, feedKey: K.feedKey(feedUrl), guid, title: s(r['title']), enclosureUrl: s(r['enclosure_url']), mediaKind: str(r['media_kind']) ?? 'audio',
          firstSeenAt: isoReq(r['first_seen_at']), updatedAt: isoReq(r['updated_at']), v: 1,
        };
        const opt: Record<string, unknown> = { showTitle: str(r['show_title']), imageUrl: str(r['image_url']), durationMs: num(r['duration_ms']), publishedAt, genreId };
        for (const [k, v] of Object.entries(opt)) if (v !== null) attrs[k] = v;
        if (bool(r['hidden'])) attrs['hidden'] = true;
        const gsi = { ...K.G2eps(feedUrl, publishedAt, id), ...(genreId !== null && publishedAt !== null ? K.G3eps(genreId, publishedAt, id) : {}) };
        return [
          main(encode('episode', K.episode(id), attrs, { gsi })),
          main(encode('unique', K.U.guid(feedUrl, guid), { owner: id })),
        ];
      },
    },
    {
      // One show META per feed: built whole here (one writer per key), with the subscription count.
      name: 'lb.shows',
      sql: `SELECT f.feed_url,
                   nt.show_title AS newest_title, nt.published_at AS title_at,
                   ni.image_url AS newest_image, ni.published_at AS image_at,
                   le.id AS latest_id, le.published_at AS latest_at,
                   ge.genre_id,
                   (SELECT count(*) FROM subscriptions x WHERE x.feed_url = f.feed_url AND x.deleted_at IS NULL)::int AS live_subs,
                   EXISTS (SELECT 1 FROM subscriptions x WHERE x.feed_url = f.feed_url) AS has_subs
              FROM (${FEEDS_SQL}) f
              LEFT JOIN LATERAL (SELECT show_title, published_at FROM episodes e WHERE e.feed_url = f.feed_url AND e.show_title IS NOT NULL
                                  ORDER BY e.published_at DESC NULLS LAST, e.first_seen_at DESC, e.id DESC LIMIT 1) nt ON true
              LEFT JOIN LATERAL (SELECT image_url, published_at FROM episodes e WHERE e.feed_url = f.feed_url AND e.image_url IS NOT NULL
                                  ORDER BY e.published_at DESC NULLS LAST, e.first_seen_at DESC, e.id DESC LIMIT 1) ni ON true
              LEFT JOIN LATERAL (SELECT id, published_at FROM episodes e WHERE e.feed_url = f.feed_url
                                  ORDER BY e.published_at DESC NULLS LAST, e.first_seen_at DESC, e.id DESC LIMIT 1) le ON true
              LEFT JOIN LATERAL (SELECT genre_id FROM episodes e WHERE e.feed_url = f.feed_url AND e.genre_id IS NOT NULL
                                  ORDER BY e.published_at DESC NULLS LAST, e.first_seen_at DESC, e.id DESC LIMIT 1) ge ON true`,
      keys: ['feed_url'],
      map(r) {
        const feedUrl = s(r['feed_url']);
        const attrs: Record<string, unknown> = { feedUrl };
        const gsi: Record<string, string> = {};
        // touchShow (episodes.ts): ranks are the episode's ISO date or '' (NULLS LAST); they only move forward.
        if (r['newest_title'] !== null && r['newest_title'] !== undefined) Object.assign(attrs, { newestTitle: s(r['newest_title']), titleRank: iso(r['title_at']) ?? '' });
        if (r['newest_image'] !== null && r['newest_image'] !== undefined) Object.assign(attrs, { newestImage: s(r['newest_image']), imageRank: iso(r['image_at']) ?? '' });
        const hasEpisodes = r['latest_id'] !== null && r['latest_id'] !== undefined;
        if (hasEpisodes) {
          const latestAt = iso(r['latest_at']);
          // touchShow SETs latestPublishedAt to the episode's date, null when it has none.
          Object.assign(attrs, { latestEpisodeId: s(r['latest_id']), latestRank: latestAt ?? '', latestPublishedAt: latestAt, v: 1 });
          const genre = num(r['genre_id']);
          if (genre !== null) {
            attrs['genreId'] = genre;
            if (latestAt) Object.assign(gsi, K.G3shows(genre, latestAt, feedUrl));
          }
        }
        // subscriptions.ts addFlip: `ADD subscriberCount ±1` (the attribute exists once a flip happened); `Q#feeds` while > 0.
        const live = numReq(r['live_subs']);
        if (bool(r['has_subs'])) attrs['subscriberCount'] = live;
        if (live > 0) Object.assign(gsi, K.G4feeds(feedUrl));
        return [main(encode('show', K.show(feedUrl), attrs, { gsi }))];
      },
    },
  ],
  counts: [
    { type: 'episode' },
    { label: 'episodes → U#GUID', type: 'unique', pk: 'U#GUID#' },
    { label: 'feeds → show META', type: 'show', sql: `SELECT count(*)::int AS n FROM (${FEEDS_SQL}) f` },
  ],
  back: [{
    pgTable: 'episodes',
    pk: ['id'],
    match: (it) => it['t'] === 'episode',
    toRow: (it) => ({
      id: it['id'], feed_url: it['feedUrl'], guid: it['guid'], title: it['title'], show_title: it['showTitle'] ?? null, enclosure_url: it['enclosureUrl'],
      image_url: it['imageUrl'] ?? null, duration_ms: it['durationMs'] ?? null, published_at: it['publishedAt'] ?? null, genre_id: it['genreId'] ?? null,
      media_kind: it['mediaKind'] ?? 'audio', first_seen_at: it['firstSeenAt'], updated_at: it['updatedAt'],
    }),
  }],
};

// ---------- heat ----------

const episodeHeat: TableSpec = {
  // Derived: the API rebuilds `episode_heat` from reactions and comments (heat/rebuild.ts), so there is no way back.
  pgTable: 'episode_heat',
  sources: [
    {
      name: 'lb.heat-marks',
      sql: `SELECT episode_id, bucket, listener_id, count(*)::int AS refs FROM (${MARKS_SQL}) m GROUP BY episode_id, bucket, listener_id`,
      keys: ['episode_id', 'bucket', 'listener_id'],
      map(r) {
        const episodeId = s(r['episode_id']);
        const listenerId = s(r['listener_id']);
        const bucket = numReq(r['bucket']);
        return [main(encode('heatMark', K.heatMark(episodeId, bucket, listenerId), { episodeId, listenerId, bucket, refs: numReq(r['refs']) }))];
      },
    },
    {
      name: 'lb.heat',
      sql: `SELECT episode_id, json_agg(json_build_array(bucket, n)) AS buckets, max(last_at) AS updated_at FROM (
              SELECT episode_id, bucket, count(DISTINCT listener_id)::int AS n, max(at) AS last_at FROM (${MARKS_SQL}) m GROUP BY episode_id, bucket
            ) x GROUP BY episode_id`,
      keys: ['episode_id'],
      map(r) {
        const episodeId = s(r['episode_id']);
        const b = Array.from({ length: 100 }, () => 0);
        for (const [bucket, n] of json<[number, number][]>(r['buckets']) ?? []) b[Number(bucket)] = Number(n);
        return [main(encode('heat', K.heat(episodeId), { episodeId, b, v: 1, updatedAt: isoReq(r['updated_at']) }))];
      },
    },
  ],
  counts: [
    { label: 'episode_heat → HEAT buckets', measure: (ix) => ix.ofType('heat').reduce((n, it) => n + (it['b'] as number[]).filter((x) => Number(x) > 0).length, 0) },
    { label: 'heat marks → HM#', type: 'heatMark', sql: `SELECT count(*)::int AS n FROM (SELECT DISTINCT episode_id, bucket, listener_id FROM (${MARKS_SQL}) m) x` },
    { label: 'episodes with marks → HEAT', type: 'heat', sql: `SELECT count(DISTINCT episode_id)::int AS n FROM (${MARKS_SQL}) m` },
  ],
};

// ---------- positions ----------

const positions: TableSpec = {
  pgTable: 'positions',
  sources: [{
    name: 'lb.positions',
    sql: 'SELECT listener_id::text AS listener_id, episode_id, offset_ms, finished, progress_seq::text AS progress_seq, explicit_seek, device_id, received_at FROM positions',
    keys: ['listener_id', 'episode_id'],
    map(r) {
      const listenerId = s(r['listener_id']);
      const episodeId = s(r['episode_id']);
      return [main(encode('position', K.position(listenerId, episodeId), {
        listenerId, episodeId, offsetMs: numReq(r['offset_ms']), finished: bool(r['finished']), progressSeq: numReq(r['progress_seq']),
        explicitSeek: bool(r['explicit_seek']), deviceId: s(r['device_id']), receivedAt: isoReq(r['received_at']), v: 1,
      }))];
    },
  }],
  counts: [{ type: 'position' }],
  back: [{
    pgTable: 'positions',
    pk: ['listener_id', 'episode_id'],
    match: (it) => it['t'] === 'position',
    toRow: (it) => ({
      listener_id: it['listenerId'], episode_id: it['episodeId'], offset_ms: it['offsetMs'], finished: it['finished'] === true, progress_seq: it['progressSeq'],
      explicit_seek: it['explicitSeek'] === true, device_id: it['deviceId'], received_at: it['receivedAt'],
    }),
  }],
};

// ---------- listened ranges ----------

const listenedRanges: TableSpec = {
  pgTable: 'listened_ranges',
  sources: [
    {
      name: 'lb.listened-ranges',
      sql: 'SELECT listener_id::text AS listener_id, episode_id, day::text AS day, device_id, ranges, updated_at FROM listened_ranges',
      keys: ['listener_id', 'episode_id', 'day', 'device_id'],
      map(r) {
        const listenerId = s(r['listener_id']);
        const episodeId = s(r['episode_id']);
        const day = dayOf(r['day'])!;
        const deviceId = s(r['device_id']);
        return [main(encode('listenedRange', K.listenedRange(listenerId, episodeId, day, deviceId), {
          listenerId, episodeId, day, deviceId, ranges: json<Range[]>(r['ranges']) ?? [], updatedAt: isoReq(r['updated_at']),
        }))];
      },
    },
    {
      // listened.ts replaceOne: `eps` = { episodeId → union ms across the day's devices }.
      name: 'lb.listened-days',
      sql: `SELECT listener_id::text AS listener_id, day::text AS day, json_agg(json_build_array(episode_id, ranges)) AS sets, max(updated_at) AS updated_at
              FROM listened_ranges GROUP BY listener_id, day`,
      keys: ['listener_id', 'day'],
      map(r) {
        const listenerId = s(r['listener_id']);
        const day = dayOf(r['day'])!;
        const per = new Map<string, Range[][]>();
        for (const [episodeId, ranges] of json<[string, unknown][]>(r['sets']) ?? []) {
          const list = per.get(String(episodeId)) ?? [];
          list.push(json<Range[]>(ranges) ?? []);
          per.set(String(episodeId), list);
        }
        const eps: Record<string, number> = {};
        for (const [episodeId, sets] of [...per].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) eps[episodeId] = unionLength(sets);
        return [main(encode('listenedDay', K.listenedDay(listenerId, day), { listenerId, day, eps, v: 1, updatedAt: isoReq(r['updated_at']) }))];
      },
    },
  ],
  counts: [
    { type: 'listenedRange' },
    { label: 'listened days → LDAY#', type: 'listenedDay', sql: 'SELECT count(*)::int AS n FROM (SELECT DISTINCT listener_id, day FROM listened_ranges) x' },
  ],
  back: [{
    pgTable: 'listened_ranges',
    pk: ['listener_id', 'episode_id', 'day', 'device_id'],
    match: (it) => it['t'] === 'listenedRange',
    toRow: (it) => ({ listener_id: it['listenerId'], episode_id: it['episodeId'], day: it['day'], device_id: it['deviceId'], ranges: it['ranges'], updated_at: it['updatedAt'] }),
  }],
};

// ---------- cache ----------

const NOT_PHOTO = "key NOT LIKE 'status-photo:%'";

const cacheTable: TableSpec = {
  pgTable: 'cache',
  sources: [{
    // `status-photo:` rows became lane SC's `VPUP#` items (keys.ts statusPhoto) — SC copies them.
    name: 'lb.cache',
    sql: `SELECT key, body, fetched_at FROM cache WHERE ${NOT_PHOTO}`,
    keys: ['key'],
    map(r) {
      const key = s(r['key']);
      const fetchedAt = isoReq(r['fetched_at']);
      const gz = gzipSync(Buffer.from(JSON.stringify(json(r['body'])), 'utf8'));
      const w = K.sha(`${key}\u0001${fetchedAt}`).slice(0, 32); // the write's id, from the row (writeEntry uses a uuid)
      const ttl = ttlFor(key, Date.parse(fetchedAt));
      const extra = ttl !== undefined ? { ttl } : {};
      if (gz.length <= CHUNK_BYTES) return [cache(encode('cacheEntry', K.cacheEntry(key), { key, gz: new Uint8Array(gz), fetchedAt, w, gen: 0 }, extra))];
      const n = Math.ceil(gz.length / CHUNK_BYTES);
      const out: Out[] = [];
      for (let i = 0; i < n; i++) out.push(cache(encode('cacheChunk', K.cacheChunk(key, i), { n: i, data: new Uint8Array(gz.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES)), w }, extra)));
      out.push(cache(encode('cacheEntry', K.cacheEntry(key), { key, chunks: n, fetchedAt, w, gen: 0 }, extra)));
      return out;
    },
  }],
  counts: [{ type: 'cacheEntry', sql: `SELECT count(*)::int AS n FROM cache WHERE ${NOT_PHOTO}` }],
  back: [{
    // The cache is disposable (sm-cache, no PITR): an entry whose body is in one item goes back; a chunked one (a large
    // feed body) cannot be rebuilt from its entry alone and is left out — the feed is fetched again (Principle IV).
    pgTable: 'cache',
    pk: ['key'],
    match: (it) => it['t'] === 'cacheEntry' && (it['gz'] !== undefined || it['body'] !== undefined),
    toRow: (it) => {
      const body = it['body'] !== undefined ? it['body'] : JSON.parse(gunzipSync(Buffer.from(it['gz'] as Uint8Array)).toString('utf8'));
      return { key: it['key'], body, fetched_at: it['fetchedAt'] };
    },
  }],
};

// ---------- subscriptions ----------

const subscriptions: TableSpec = {
  pgTable: 'subscriptions',
  sources: [
    {
      name: 'lb.subscriptions',
      sql: 'SELECT listener_id::text AS listener_id, feed_url, starred, created_at, deleted_at, starred_at FROM subscriptions',
      keys: ['listener_id', 'feed_url'],
      map(r) {
        return [main(subscriptionItem(s(r['listener_id']), {
          feed_url: s(r['feed_url']), starred: bool(r['starred']), created_at: isoReq(r['created_at']), deleted_at: iso(r['deleted_at']), starred_at: iso(r['starred_at']),
        }, 1))];
      },
    },
    {
      // setOrder: one list of the feeds the account held (live or not) in the saved order; getOrder keeps the live ones.
      name: 'lb.sub-order',
      sql: `SELECT listener_id::text AS listener_id, json_agg(feed_url ORDER BY sort_pos, feed_url) AS feeds, max(created_at) AS updated_at
              FROM subscriptions WHERE sort_pos IS NOT NULL GROUP BY listener_id`,
      keys: ['listener_id'],
      map(r) {
        const listenerId = s(r['listener_id']);
        return [main(encode('subOrder', K.subOrder(listenerId), { listenerId, feedUrls: (json<string[]>(r['feeds']) ?? []).map(String), updatedAt: isoReq(r['updated_at']) }))];
      },
    },
  ],
  counts: [
    { type: 'subscription' },
    { label: 'saved orders → SUBORDER', type: 'subOrder', sql: 'SELECT count(DISTINCT listener_id)::int AS n FROM subscriptions WHERE sort_pos IS NOT NULL' },
  ],
  back: [{
    // `sort_pos` lives in the SUBORDER item, not here: copy-back leaves the column as Postgres has it (see the report).
    pgTable: 'subscriptions',
    pk: ['listener_id', 'feed_url'],
    match: (it) => it['t'] === 'subscription',
    toRow: (it) => ({
      listener_id: it['listenerId'], feed_url: it['feedUrl'], starred: it['starred'] === true, created_at: it['createdAt'],
      deleted_at: it['deletedAt'] ?? null, starred_at: it['starredAt'] ?? null,
    }),
  }],
};

const subscriptionEvents: TableSpec = {
  pgTable: 'subscription_events',
  sources: [
    {
      name: 'lb.subscription-events',
      sql: 'SELECT id::text AS id, listener_id::text AS listener_id, feed_url, kind, at FROM subscription_events',
      keys: ['id'],
      map(r) {
        const id = numReq(r['id']);
        const feedUrl = s(r['feed_url']);
        const at = isoReq(r['at']);
        return [events(encode('subscriptionEvent', K.ev.subscriptionEvent(feedUrl, at, id), { id, listenerId: s(r['listener_id']), feedUrl, kind: s(r['kind']), at }, {
          gsi: K.E1(at.slice(0, 10), 'se', `${K.feedKey(feedUrl)}#${id}`),
        }))];
      },
    },
    {
      name: 'lb.seq-subscription-events',
      sql: "SELECT 'subscription_events' AS name, max(id)::text AS v FROM subscription_events HAVING max(id) IS NOT NULL",
      keys: ['name'],
      map: (r) => [main(encode('seq', K.seq('subscription_events'), { v: numReq(r['v']) }))],
    },
  ],
  counts: [
    { type: 'subscriptionEvent' },
    { label: 'SEQ#subscription_events', type: 'seq', pk: 'SEQ#subscription_events', sql: 'SELECT (count(*) > 0)::int AS n FROM subscription_events' },
  ],
  back: [{
    pgTable: 'subscription_events',
    pk: ['id'],
    match: (it) => it['t'] === 'subscriptionEvent',
    toRow: (it) => ({ id: it['id'], listener_id: it['listenerId'], feed_url: it['feedUrl'], kind: it['kind'], at: it['at'] }),
  }],
};

// ---------- rec events ----------

const HOUR_SQL = `to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24')`;

const recEvents: TableSpec = {
  pgTable: 'rec_events',
  sources: [
    {
      // Every row is copied: the hourly sweep (90 days) keeps Postgres inside the window, and a TTL in the past is only a backstop.
      name: 'lb.rec-events',
      sql: 'SELECT id::text AS id, listener_id::text AS listener_id, episode_id, channel, rank, kind, at FROM rec_events',
      keys: ['id'],
      map(r) {
        const id = numReq(r['id']);
        const listenerId = s(r['listener_id']);
        const at = isoReq(r['at']);
        return [events(encode('recEvent', K.ev.recEvent(listenerId, at, id), {
          id, listenerId, episodeId: s(r['episode_id']), channel: s(r['channel']), rank: numReq(r['rank']), kind: s(r['kind']), at,
        }, { gsi: K.E1(at.slice(0, 10), 're', `${listenerId}#${id}`), ttl: ttlFrom(at, REC_KEEP_DAYS * DAY_MS) }))];
      },
    },
    {
      name: 'lb.seq-rec-events',
      sql: "SELECT 'rec_events' AS name, max(id)::text AS v FROM rec_events HAVING max(id) IS NOT NULL",
      keys: ['name'],
      map: (r) => [main(encode('seq', K.seq('rec_events'), { v: numReq(r['v']) }))],
    },
    {
      // rec-events.ts: `R#recs#all` / `<yyyy-mm-ddThh>`, one counter per `channel|kind`.
      name: 'lb.rec-rollups',
      sql: `SELECT hour, json_agg(json_build_array(ck, n) ORDER BY ck) AS counts FROM (
              SELECT ${HOUR_SQL} AS hour, channel || '|' || kind AS ck, count(*)::int AS n FROM rec_events GROUP BY 1, 2
            ) x GROUP BY hour`,
      keys: ['hour'],
      map(r) {
        const attrs: Record<string, number> = {};
        for (const [ck, n] of json<[string, number][]>(r['counts']) ?? []) attrs[String(ck)] = Number(n);
        return [events(encode('rollup', K.ev.rollup('recs', 'all', `${s(r['hour'])}:00:00.000Z`), attrs))];
      },
    },
  ],
  counts: [
    { type: 'recEvent' },
    { label: 'SEQ#rec_events', type: 'seq', pk: 'SEQ#rec_events', sql: 'SELECT (count(*) > 0)::int AS n FROM rec_events' },
    { label: 'rec event hours → R#recs#all', type: 'rollup', pk: 'R#recs#all', sql: `SELECT count(DISTINCT ${HOUR_SQL})::int AS n FROM rec_events` },
  ],
  back: [{
    pgTable: 'rec_events',
    pk: ['id'],
    match: (it) => it['t'] === 'recEvent',
    toRow: (it) => ({ id: it['id'], listener_id: it['listenerId'], episode_id: it['episodeId'], channel: it['channel'], rank: it['rank'], kind: it['kind'], at: it['at'] }),
  }],
};

// ---------- library ----------

const libraryItems: TableSpec = {
  pgTable: 'library_items',
  sources: [{
    // Every row, tombstones included (reads hide those past 30 days; their TTL is the backstop the code sets).
    name: 'lb.library',
    sql: 'SELECT listener_id::text AS listener_id, kind, item_key, payload, updated_at, deleted_at FROM library_items',
    keys: ['listener_id', 'kind', 'item_key'],
    map(r) {
      return [main(libraryItem(s(r['listener_id']), {
        kind: s(r['kind']) as Kind, item_key: s(r['item_key']), payload: json<Record<string, unknown>>(r['payload']) ?? {},
        updated_at: isoReq(r['updated_at']), deleted_at: iso(r['deleted_at']),
      }, 1))];
    },
  }],
  counts: [{ type: 'libraryItem' }],
  back: [{
    pgTable: 'library_items',
    pk: ['listener_id', 'kind', 'item_key'],
    match: (it) => it['t'] === 'libraryItem',
    toRow: (it) => ({ listener_id: it['listenerId'], kind: it['kind'], item_key: it['itemKey'], payload: it['payload'] ?? {}, updated_at: it['updatedAt'], deleted_at: it['deletedAt'] ?? null }),
  }],
};

// ---------- counter checks (read only) ----------

const mm = (counter: string, it: Item | string, stored: unknown, recomputed: unknown): Mismatch => ({ counter, key: typeof it === 'string' ? it : keyOf(it), stored, recomputed });
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const counters: CounterCheck[] = [
  {
    // subscriptions.ts addFlip / syncFeedQueue: live subscriptions per show; `Q#feeds` exactly while > 0.
    name: 'show.subscriberCount',
    check(ix: ItemIndex) {
      const live = new Map<string, number>();
      for (const it of ix.ofType('subscription')) if (!it['deletedAt']) live.set(s(it['feedUrl']), (live.get(s(it['feedUrl'])) ?? 0) + 1);
      const out: Mismatch[] = [];
      const seen = new Set<string>();
      for (const it of ix.ofType('show')) {
        const feed = s(it['feedUrl']);
        seen.add(feed);
        const n = live.get(feed) ?? 0;
        if (Number(it['subscriberCount'] ?? 0) !== n) out.push(mm('show.subscriberCount', it, it['subscriberCount'] ?? null, n));
        if ((it['G4PK'] === 'Q#feeds') !== (n > 0)) out.push(mm('show.Q#feeds', it, it['G4PK'] ?? null, n > 0 ? 'Q#feeds' : null));
      }
      for (const [feed, n] of live) if (!seen.has(feed)) out.push(mm('show.subscriberCount', `${K.show(feed).PK}|META`, null, n));
      return out;
    },
  },
  {
    // touchShow: the latest rank is the newest episode date ('' when none has a date).
    name: 'show.latestRank',
    check(ix: ItemIndex) {
      const best = new Map<string, string>();
      for (const e of ix.ofType('episode')) {
        const rank = e['publishedAt'] ? s(e['publishedAt']) : '';
        const f = s(e['feedUrl']);
        if (!best.has(f) || rank > best.get(f)!) best.set(f, rank);
      }
      const out: Mismatch[] = [];
      for (const it of ix.ofType('show')) {
        const want = best.get(s(it['feedUrl']));
        if (want !== undefined && it['latestRank'] !== want) out.push(mm('show.latestRank', it, it['latestRank'] ?? null, want));
      }
      return out;
    },
  },
  {
    name: 'episode.U#GUID',
    check(ix: ItemIndex) {
      const out: Mismatch[] = [];
      for (const e of ix.ofType('episode')) {
        const u = K.U.guid(s(e['feedUrl']), s(e['guid']));
        const owner = ix.get('main', u.PK, u.SK)?.['owner'];
        if (owner !== e['id']) out.push(mm('episode.U#GUID', e, owner ?? null, e['id']));
      }
      return out;
    },
  },
  {
    // heat/ddb.ts repairHeat: a bucket's count = marks with refs > 0.
    name: 'heat.b',
    check(ix: ItemIndex) {
      const curves = new Map<string, number[]>();
      for (const m of ix.ofType('heatMark')) {
        if (!(Number(m['refs']) > 0)) continue;
        const pk = s(m['PK']);
        const b = curves.get(pk) ?? Array.from({ length: 100 }, () => 0);
        b[Number(m['bucket'])] = (b[Number(m['bucket'])] ?? 0) + 1;
        curves.set(pk, b);
      }
      const out: Mismatch[] = [];
      for (const h of ix.ofType('heat')) {
        const want = curves.get(s(h['PK'])) ?? Array.from({ length: 100 }, () => 0);
        curves.delete(s(h['PK']));
        const have = ((h['b'] as unknown[]) ?? []).map(Number);
        if (!eq(have, want)) out.push(mm('heat.b', h, have, want));
      }
      for (const [pk, want] of curves) out.push(mm('heat.b', `${pk}|HEAT`, null, want));
      return out;
    },
  },
  {
    // A mark's refs = the listener's reactions + visible placed comments in that bucket (lane SC's items, SC's rule).
    name: 'heatMark.refs',
    check(ix: ItemIndex) {
      const want = new Map<string, number>();
      const add = (episodeId: string, bucket: number, listenerId: string) => {
        const k = keyOf(K.heatMark(episodeId, bucket, listenerId));
        want.set(k, (want.get(k) ?? 0) + 1);
      };
      for (const r of ix.ofType('reaction')) add(s(r['episodeId']), Number(r['bucket']), s(r['listenerId']));
      for (const c of ix.ofType('comment')) if (countsOnHeat(c)) add(s(c['episodeId']), Number(c['bucket']), s(c['authorId']));
      const out: Mismatch[] = [];
      for (const m of ix.ofType('heatMark')) {
        const k = keyOf(m);
        const n = want.get(k) ?? 0;
        want.delete(k);
        if (Number(m['refs']) !== n) out.push(mm('heatMark.refs', m, m['refs'], n));
      }
      for (const [k, n] of want) out.push(mm('heatMark.refs', k, null, n));
      return out;
    },
  },
  {
    // listened.ts: LDAY `eps[episode]` = union of the day's device ranges.
    name: 'listenedDay.eps',
    check(ix: ItemIndex) {
      const sets = new Map<string, Map<string, Range[][]>>();
      for (const r of ix.ofType('listenedRange')) {
        const k = keyOf(K.listenedDay(s(r['listenerId']), s(r['day'])));
        const per = sets.get(k) ?? new Map<string, Range[][]>();
        const list = per.get(s(r['episodeId'])) ?? [];
        list.push((r['ranges'] as Range[]) ?? []);
        per.set(s(r['episodeId']), list);
        sets.set(k, per);
      }
      const out: Mismatch[] = [];
      for (const d of ix.ofType('listenedDay')) {
        const per = sets.get(keyOf(d)) ?? new Map<string, Range[][]>();
        sets.delete(keyOf(d));
        const want: Record<string, number> = {};
        for (const [ep, list] of per) want[ep] = unionLength(list);
        const have = Object.fromEntries(Object.entries((d['eps'] as Record<string, unknown>) ?? {}).map(([k, v]) => [k, Number(v)]));
        const sorted = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
        if (!eq(sorted(have), sorted(want))) out.push(mm('listenedDay.eps', d, have, want));
      }
      for (const k of sets.keys()) out.push(mm('listenedDay.eps', k, null, 'missing'));
      return out;
    },
  },
  {
    // SEQ# ≥ the largest id issued, so the next id never repeats one.
    name: 'seq.lb',
    check(ix: ItemIndex) {
      const out: Mismatch[] = [];
      for (const [name, type] of [['subscription_events', 'subscriptionEvent'], ['rec_events', 'recEvent']] as const) {
        const max = ix.ofType(type).reduce((m, it) => Math.max(m, Number(it['id'])), 0);
        const k = K.seq(name);
        const v = Number(ix.get('main', k.PK, k.SK)?.['v'] ?? 0);
        if (v < max) out.push(mm(`seq.${name}`, `${k.PK}|${k.SK}`, v, max));
      }
      return out;
    },
  },
  {
    // rec-events.ts: hourly `channel|kind` counters (exact right after the copy; the 90-day sweep later removes events, not rollups).
    name: 'rollup.recs',
    check(ix: ItemIndex) {
      const want = new Map<string, Record<string, number>>();
      for (const e of ix.ofType('recEvent')) {
        const sk = K.ev.rollup('recs', 'all', s(e['at'])).SK;
        const c = want.get(sk) ?? {};
        const a = `${s(e['channel'])}|${s(e['kind'])}`;
        c[a] = (c[a] ?? 0) + 1;
        want.set(sk, c);
      }
      const pk = K.ev.rollup('recs', 'all', '2000-01-01T00:00:00Z').PK;
      const out: Mismatch[] = [];
      for (const it of ix.partition('events', pk)) {
        const sk = s(it['SK']);
        const w = want.get(sk) ?? {};
        want.delete(sk);
        const have: Record<string, number> = {};
        for (const [k, v] of Object.entries(it)) if (k.includes('|')) have[k] = Number(v);
        const sorted = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
        if (!eq(sorted(have), sorted(w))) out.push(mm('rollup.recs', it, have, w));
      }
      for (const [sk, w] of want) out.push(mm('rollup.recs', `${pk}|${sk}`, null, w));
      return out;
    },
  },
  {
    // cache.ts readEntry: a chunked entry is whole only with chunks 0…n-1 of its own write.
    name: 'cache.chunks',
    check(ix: ItemIndex) {
      const out: Mismatch[] = [];
      for (const e of ix.ofType('cacheEntry')) {
        if (e['chunks'] === undefined) continue;
        const mine = ix.partition('cache', s(e['PK'])).filter((c) => c['t'] === 'cacheChunk' && c['w'] === e['w']).map((c) => Number(c['n'])).sort((a, b) => a - b);
        const n = Number(e['chunks']);
        if (mine.length !== n || mine.some((x, i) => x !== i)) out.push(mm('cache.chunks', e, n, mine.length));
      }
      return out;
    },
  },
];

export const lane: LaneModule = {
  lane: 'lb',
  tables: [episodes, episodeHeat, positions, listenedRanges, cacheTable, subscriptions, subscriptionEvents, recEvents, libraryItems],
  counters,
};
