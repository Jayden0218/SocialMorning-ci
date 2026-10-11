// Lane SG's copy module: follows, activity, mutes, notifications, muted threads, system notices, playlists and live listeners → their items.
/**
 * M26 lane MIG (MIG-01), lane SG (data-model.md "17. Lane SG changes", §4, §9). Every item here is what
 * src/db/repos/social/graph-ddb/** writes for the same data:
 *
 * - follows → `L#<a>/FOLLOW#<b>` + `L#<b>/FOLLOWER#<a>` ({ otherId, createdAt }). The counters on the listener items
 *   (`followerCount` / `followingCount`) are lane AC's to write; this module only CHECKS them against the edges.
 *   `L#<id>/BIGACTOR` (G4 `Q#bigactors`) for an account with more than FANOUT_MAX followers (none today).
 * - activity → `ACT#<actor>/<createdAt>#<id>` (sm-events), `U#ACT#<actor>#<kind>#<ep>#<day>` (rows with a day) carrying
 *   `owner` + `hidden`, `U#ACTREF#<kind>#<refId>` (rows with a ref) carrying `owner`, `actPK`, `actSK`; `SEQ#activity`
 *   = max(id). The listen index `LSN#` (lane DV) and the Studio facts (lane ST) are NOT written here.
 * - Feed inbox `FEED#<follower>/<createdAt>#<id>` (TTL 60 d): what the fan-out (`sg:fanout`) and the follow backfill
 *   (`sg:follow`) hold now — every visible (`hidden = false`) activity of each account the follower follows NOW, made
 *   in the last 60 days (older pointers have passed their TTL). Big actors get no pointers (merged at read time).
 *   The backfill caps at the newest 50 activities before the follow; the copy does not apply that cap, so the
 *   DynamoDB feed answers exactly as the Postgres feed (which has no cap) for everything in the 60-day window.
 * - Friends listening: `LR#<actor>/<episodeId>` (TTL 8 d) and `FL#<follower>/<ep>#<actor>` (TTL 7 d), from
 *   `listened_ranges` (lane LB's table) as `onListened` would have left them: per (listener, episode) the latest range
 *   (`updated_at` = the sync time `at`, its `day`) among those whose day's `listened` activity is not hidden — a hidden
 *   day is never fanned out, so the item keeps the last visible listen. Listens older than the window are dropped
 *   (TTL). The current private / suspended / hidden switches are filtered at read time, as on Postgres.
 * - listener_mutes → `L#<muter>/MUTE#<muted>`; muted_threads → `L#<id>/TMUTE#<kind>#<key>`.
 * - notifications → `L#<recipient>/NOTIF#<createdAt>#<id>` (`ref` as a map) + `NDEDUP#<hash>` for the dedupe kinds
 *   (one per (recipient, actor, kind, ref), pointing at the oldest notice — the SQL's NOT EXISTS gave one row anyway).
 * - system_notices → `SN#ALL` / `SN#<listenerId>` (nulls stored as null, as `insertNotice` does).
 * - playlists + playlist_items → ONE `L#<owner>/PLAYLIST#<id>` item with `items: [{ e, at }]` in position order, `v` 0
 *   (a new playlist's version), `deletedAt` only on a tombstone; `U#PLAYLIST#<id>` → owner for every playlist.
 * - live_listeners → `LIVE#<ep>/<hash>` (sm-events, the strict `liveListener` type) for rows seen in the last
 *   KEEP_S (600 s); older rows are what the next heartbeat deletes, so they are dropped.
 *
 * Times in the windows come from the frozen database's `now()`; run the count-check right after the copy.
 */
import { encode } from '../../src/db/ddb/codec.ts';
import * as K from '../../src/db/ddb/keys.ts';
import type { Item } from '../../src/db/ddb/store.ts';
import { feedPtr, flItem, FEED_TTL_DAYS, FRIENDS_DAYS } from '../../src/db/repos/social/graph-ddb/activity.ts';
import { FANOUT_MAX } from '../../src/db/repos/social/graph-ddb/follows.ts';
import { liveItem } from '../../src/db/repos/social/graph-ddb/live.ts';
import { dedupeHash } from '../../src/db/repos/social/graph-ddb/notifications.ts';
import { KEEP_S } from '../../src/db/repos/social/live-listeners.ts';
import {
  bool, dayOf, iso, isoReq, json, num, numReq, str, ttlFrom,
  type CounterCheck, type ItemIndex, type LaneModule, type Mismatch, type Out, type TableSpec,
} from './types.ts';

const DAY_MS = 86_400_000;
/** Kinds told once per (actor, ref) — graph-ddb/notifications.ts `DEDUPE`. */
const DEDUPE_KINDS = ['like', 'follow', 'like_post_like', 'status_reaction'] as const;
const DEDUPE_SQL = `kind IN (${DEDUPE_KINDS.map((k) => `'${k}'`).join(', ')})`;

const main = (item: Item): Out => ({ table: 'main', item });
const events = (item: Item): Out => ({ table: 'events', item });
const s = (v: unknown): string => {
  const x = str(v);
  if (x === null) throw new Error('copy sg: a required value is NULL');
  return x;
};
const keyText = (it: Item) => `${String(it['PK'])}|${String(it['SK'])}`;
const listenerOf = (pk: unknown) => String(pk).slice(2); // `L#<id>`
/** jsonb ref → the map the code keeps (a non-object — never written since 031 — becomes {} as the reader treats it). */
const refOf = (v: unknown): Record<string, unknown> => {
  const r = json<unknown>(v);
  return r !== null && typeof r === 'object' && !Array.isArray(r) ? (r as Record<string, unknown>) : {};
};

// ---------------------------------------------------------------- follows (+ big actors, friends listening)

/** Accounts over the fan-out limit; `since` = when the follower that crossed it came. */
const BIG_SQL = `SELECT f.followed_id::text AS id,
    (SELECT f2.created_at FROM follows f2 WHERE f2.followed_id = f.followed_id ORDER BY f2.created_at, f2.follower_id OFFSET ${FANOUT_MAX} LIMIT 1) AS since
  FROM follows f GROUP BY f.followed_id HAVING count(*) > ${FANOUT_MAX}`;
const NOT_BIG = `NOT IN (SELECT followed_id FROM follows GROUP BY followed_id HAVING count(*) > ${FANOUT_MAX})`;

/** Per (listener, episode): the latest listened range of the window whose day's `listened` activity is not hidden. */
const latestListens = (days: number) => `SELECT DISTINCT ON (lr.listener_id, lr.episode_id)
    lr.listener_id::text AS listener_id, lr.episode_id, lr.day::text AS day, lr.updated_at AS at
  FROM listened_ranges lr
  WHERE lr.updated_at > now() - interval '${days} days'
    AND NOT EXISTS (SELECT 1 FROM activity a WHERE a.actor_id = lr.listener_id AND a.kind = 'listened' AND a.episode_id = lr.episode_id AND a.day = lr.day AND a.hidden)
  ORDER BY lr.listener_id, lr.episode_id, lr.updated_at DESC, lr.day DESC`;
const LR_DAYS = FRIENDS_DAYS + 1;
const FL_SQL = `WITH r AS (${latestListens(FRIENDS_DAYS)})
  SELECT f.follower_id::text AS follower_id, r.listener_id, r.episode_id, r.day, r.at
  FROM r JOIN follows f ON f.followed_id = r.listener_id::uuid`;

const follows: TableSpec = {
  pgTable: 'follows',
  sources: [
    {
      name: 'sg.follows',
      sql: 'SELECT follower_id::text AS follower_id, followed_id::text AS followed_id, created_at FROM follows',
      keys: ['follower_id', 'followed_id'],
      map: (r) => {
        const a = s(r['follower_id']);
        const b = s(r['followed_id']);
        const createdAt = isoReq(r['created_at']);
        return [
          main(encode('follow', K.follow(a, b), { otherId: b, createdAt })),
          main(encode('follower', K.follower(b, a), { otherId: a, createdAt })),
        ];
      },
    },
    {
      name: 'sg.bigactors',
      sql: BIG_SQL,
      keys: ['id'],
      map: (r) => {
        const id = s(r['id']);
        const since = isoReq(r['since']);
        return [main(encode('bigActor', K.bigActor(id), { since }, { gsi: K.G4('bigactors', since, id) }))];
      },
    },
    {
      // `onListened`: the listener's latest listen of each episode (TTL 8 d), read by the follow backfill.
      name: 'sg.recent-listens',
      sql: latestListens(LR_DAYS),
      keys: ['listener_id', 'episode_id'],
      map: (r) => {
        const at = isoReq(r['at']);
        return [events(encode('recentListen', K.evSg.recentListen(s(r['listener_id']), s(r['episode_id'])), { episodeId: s(r['episode_id']), day: dayOf(r['day']), at }, {
          ttl: ttlFrom(at, LR_DAYS * DAY_MS),
        }))];
      },
    },
    {
      // `sg:listen` / the follow backfill: one item per (follower, episode, followed) of the last 7 days.
      name: 'sg.friends-listening',
      sql: FL_SQL,
      keys: ['follower_id', 'episode_id', 'listener_id'],
      map: (r) => [events(flItem(s(r['follower_id']), { actorId: s(r['listener_id']), episodeId: s(r['episode_id']), day: dayOf(r['day'])!, at: isoReq(r['at']) }))],
    },
  ],
  counts: [
    { label: 'follows → follow', type: 'follow' },
    { label: 'follows → follower', type: 'follower' },
    { label: 'big actors → bigActor', type: 'bigActor', sql: `SELECT count(*)::int AS n FROM (${BIG_SQL}) x` },
    { label: 'listened_ranges → recentListen (LR#)', type: 'recentListen', sql: `SELECT count(*)::int AS n FROM (${latestListens(LR_DAYS)}) x` },
    { label: 'listened_ranges × follows → friendsListening (FL#)', type: 'friendsListening', sql: `SELECT count(*)::int AS n FROM (${FL_SQL}) x` },
  ],
  back: [{
    pgTable: 'follows',
    pk: ['follower_id', 'followed_id'],
    match: (it) => it['t'] === 'follow',
    toRow: (it) => ({ follower_id: listenerOf(it['PK']), followed_id: String(it['otherId']), created_at: String(it['createdAt']) }),
  }],
};

// ---------------------------------------------------------------- activity (+ SEQ#, feed inbox)

const FEED_SQL = `SELECT f.follower_id::text AS follower_id, a.id::text AS id, a.actor_id::text AS actor_id, a.created_at
  FROM follows f JOIN activity a ON a.actor_id = f.followed_id
  WHERE a.hidden = false AND a.created_at > now() - interval '${FEED_TTL_DAYS} days' AND f.followed_id ${NOT_BIG}`;

const activity: TableSpec = {
  pgTable: 'activity',
  sources: [
    {
      name: 'sg.activity',
      sql: `SELECT id::text AS id, actor_id::text AS actor_id, kind, episode_id, moment_ms, ref_id::text AS ref_id, day::text AS day, hidden, created_at FROM activity`,
      keys: ['id'],
      map: (r) => {
        const id = numReq(r['id']);
        const actorId = s(r['actor_id']);
        const kind = s(r['kind']);
        const episodeId = s(r['episode_id']);
        const refId = str(r['ref_id']);
        const day = dayOf(r['day']);
        const hidden = bool(r['hidden']);
        const createdAt = isoReq(r['created_at']);
        const ak = K.ev.activity(actorId, createdAt, id);
        const owner = `${ak.PK}|${ak.SK}`;
        const out: Out[] = [events(encode('activity', ak, { id, actorId, kind, episodeId, momentMs: num(r['moment_ms']), refId, day, hidden, createdAt }))];
        if (day !== null) out.push(events(encode('unique', K.ev.activityDedupe(actorId, kind, episodeId, day), { owner, hidden })));
        if (refId) out.push(events(encode('unique', K.evSg.activityRef(kind, refId), { owner, actPK: ak.PK, actSK: ak.SK })));
        return out;
      },
    },
    {
      name: 'sg.activity-seq',
      sql: `SELECT 'activity'::text AS name, max(id)::text AS v FROM activity HAVING count(*) > 0`,
      keys: ['name'],
      map: (r) => [main(encode('seq', K.seq('activity'), { v: numReq(r['v']) }))],
    },
    {
      name: 'sg.feed-inbox',
      sql: FEED_SQL,
      keys: ['follower_id', 'id'],
      map: (r) => {
        const id = numReq(r['id']);
        const actorId = s(r['actor_id']);
        const createdAt = isoReq(r['created_at']);
        const ak = K.ev.activity(actorId, createdAt, id);
        return [events(feedPtr(s(r['follower_id']), { actorId, actPK: ak.PK, actSK: ak.SK, id, createdAt }))];
      },
    },
  ],
  counts: [
    { label: 'activity → activity', type: 'activity' },
    { label: 'activity (with a day) → U#ACT', type: 'unique', pk: 'U#ACT#', sql: 'SELECT count(*)::int AS n FROM activity WHERE day IS NOT NULL' },
    { label: 'activity (with a ref) → U#ACTREF', type: 'unique', pk: 'U#ACTREF#', sql: 'SELECT count(DISTINCT (kind, ref_id))::int AS n FROM activity WHERE ref_id IS NOT NULL' },
    { label: 'activity × follows → feedInbox (FEED#, 60 d)', type: 'feedInbox', sql: `SELECT count(*)::int AS n FROM (${FEED_SQL}) x` },
    { label: 'activity → SEQ#activity', type: 'seq', pk: 'SEQ#activity', sql: 'SELECT (count(*) > 0)::int AS n FROM activity' },
  ],
  back: [{
    pgTable: 'activity',
    pk: ['id'],
    match: (it) => it['t'] === 'activity',
    toRow: (it) => ({
      id: Number(it['id']), actor_id: String(it['actorId']), kind: String(it['kind']), episode_id: String(it['episodeId']),
      moment_ms: it['momentMs'] ?? null, ref_id: it['refId'] ?? null, day: it['day'] ?? null, hidden: it['hidden'] === true, created_at: String(it['createdAt']),
    }),
  }],
};

// ---------------------------------------------------------------- mutes, muted threads

const listenerMutes: TableSpec = {
  pgTable: 'listener_mutes',
  sources: [{
    name: 'sg.mutes',
    sql: 'SELECT muter_id::text AS muter_id, muted_id::text AS muted_id, created_at FROM listener_mutes',
    keys: ['muter_id', 'muted_id'],
    map: (r) => [main(encode('mute', K.mute(s(r['muter_id']), s(r['muted_id'])), { otherId: s(r['muted_id']), createdAt: isoReq(r['created_at']) }))],
  }],
  counts: [{ label: 'listener_mutes → mute', type: 'mute' }],
  back: [{
    pgTable: 'listener_mutes',
    pk: ['muter_id', 'muted_id'],
    match: (it) => it['t'] === 'mute',
    toRow: (it) => ({ muter_id: listenerOf(it['PK']), muted_id: String(it['otherId']), created_at: String(it['createdAt']) }),
  }],
};

const mutedThreads: TableSpec = {
  pgTable: 'muted_threads',
  sources: [{
    name: 'sg.muted-threads',
    sql: 'SELECT listener_id::text AS listener_id, thread_kind, thread_key, created_at FROM muted_threads',
    keys: ['listener_id', 'thread_kind', 'thread_key'],
    map: (r) => {
      const kind = s(r['thread_kind']);
      const key = s(r['thread_key']);
      return [main(encode('threadMute', K.mutedThread(s(r['listener_id']), kind, key), { threadKind: kind, threadKey: key, createdAt: isoReq(r['created_at']) }))];
    },
  }],
  counts: [{ label: 'muted_threads → threadMute', type: 'threadMute' }],
  back: [{
    pgTable: 'muted_threads',
    pk: ['listener_id', 'thread_kind', 'thread_key'],
    match: (it) => it['t'] === 'threadMute',
    toRow: (it) => ({ listener_id: listenerOf(it['PK']), thread_kind: String(it['threadKind']), thread_key: String(it['threadKey']), created_at: String(it['createdAt']) }),
  }],
};

// ---------------------------------------------------------------- notifications

const DEDUPE_GROUPS_SQL = `SELECT DISTINCT ON (recipient_id, actor_id, kind, ref)
    id::text AS id, recipient_id::text AS recipient_id, actor_id::text AS actor_id, kind, ref, created_at
  FROM notifications WHERE ${DEDUPE_SQL}
  ORDER BY recipient_id, actor_id, kind, ref, created_at, id`;

const notifications: TableSpec = {
  pgTable: 'notifications',
  sources: [
    {
      name: 'sg.notifications',
      sql: 'SELECT id::text AS id, recipient_id::text AS recipient_id, actor_id::text AS actor_id, kind, ref, created_at FROM notifications',
      keys: ['id'],
      map: (r) => {
        const id = s(r['id']);
        const recipientId = s(r['recipient_id']);
        const createdAt = isoReq(r['created_at']);
        return [main(encode('notification', K.notification(recipientId, createdAt, id), { id, recipientId, actorId: s(r['actor_id']), kind: s(r['kind']), ref: refOf(r['ref']), createdAt }))];
      },
    },
    {
      // The "told once" item of each (recipient, actor, kind, ref) of the dedupe kinds, pointing at its oldest notice.
      name: 'sg.notification-dedupe',
      sql: DEDUPE_GROUPS_SQL,
      keys: ['id'],
      map: (r) => {
        const ref = refOf(r['ref']) as Record<string, string>;
        return [main(encode('notificationDedupe', K.notificationDedupe(s(r['recipient_id']), dedupeHash(s(r['actor_id']), s(r['kind']), ref)), {
          notificationId: s(r['id']), createdAt: isoReq(r['created_at']),
        }))];
      },
    },
  ],
  counts: [
    { label: 'notifications → notification', type: 'notification' },
    { label: 'notifications (dedupe kinds) → notificationDedupe', type: 'notificationDedupe', sql: `SELECT count(*)::int AS n FROM (${DEDUPE_GROUPS_SQL}) x` },
  ],
  back: [{
    pgTable: 'notifications',
    pk: ['id'],
    match: (it) => it['t'] === 'notification',
    toRow: (it) => ({
      id: String(it['id']), recipient_id: String(it['recipientId']), actor_id: String(it['actorId']), kind: String(it['kind']),
      ref: (it['ref'] ?? {}) as Record<string, unknown>, created_at: String(it['createdAt']),
    }),
  }],
};

// ---------------------------------------------------------------- system notices

const systemNotices: TableSpec = {
  pgTable: 'system_notices',
  sources: [{
    name: 'sg.system-notices',
    sql: `SELECT id::text AS id, listener_id::text AS listener_id, title, body, link_label, link_route, push, created_by::text AS created_by, created_at FROM system_notices`,
    keys: ['id'],
    map: (r) => {
      const id = s(r['id']);
      const listenerId = str(r['listener_id']);
      const createdAt = isoReq(r['created_at']);
      return [main(encode('systemNotice', K.systemNotice(listenerId, createdAt, id), {
        id, listenerId, title: s(r['title']), body: s(r['body']), linkLabel: str(r['link_label']), linkRoute: str(r['link_route']),
        push: bool(r['push']), createdBy: str(r['created_by']), createdAt,
      }))];
    },
  }],
  counts: [
    { label: 'system_notices → systemNotice', type: 'systemNotice' },
    { label: 'system_notices (to everyone) → SN#ALL', type: 'systemNotice', pk: 'SN#ALL', sql: 'SELECT count(*)::int AS n FROM system_notices WHERE listener_id IS NULL' },
  ],
  back: [{
    pgTable: 'system_notices',
    pk: ['id'],
    match: (it) => it['t'] === 'systemNotice',
    toRow: (it) => ({
      id: String(it['id']), listener_id: it['listenerId'] ?? null, title: String(it['title']), body: String(it['body']),
      link_label: it['linkLabel'] ?? null, link_route: it['linkRoute'] ?? null, push: it['push'] === true,
      created_by: it['createdBy'] ?? null, created_at: String(it['createdAt']),
    }),
  }],
};

// ---------------------------------------------------------------- playlists (+ their items inside)

type Entry = { e: string; at: string };
const entriesOf = (it: Item): Entry[] => ((it['items'] as Entry[] | undefined) ?? []).map((x) => ({ e: String(x.e), at: String(x.at) }));

const playlists: TableSpec = {
  pgTable: 'playlists',
  sources: [{
    name: 'sg.playlists',
    sql: `SELECT p.id::text AS id, p.owner_id::text AS owner_id, p.title, p.is_public, p.created_at, p.updated_at, p.deleted_at,
        (SELECT coalesce(json_agg(json_build_object('e', pi.episode_id, 'at', to_char(pi.added_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                 ORDER BY pi.position, pi.episode_id), '[]'::json)
           FROM playlist_items pi WHERE pi.playlist_id = p.id) AS items
      FROM playlists p`,
    keys: ['id'],
    map: (r) => {
      const id = s(r['id']);
      const ownerId = s(r['owner_id']);
      const items = (json<{ e: string; at: string }[]>(r['items']) ?? []).map((x) => ({ e: String(x.e), at: isoReq(x.at) }));
      const deletedAt = iso(r['deleted_at']);
      return [
        main(encode('playlist', K.playlist(ownerId, id), {
          id, ownerId, title: s(r['title']), isPublic: bool(r['is_public']), items,
          createdAt: isoReq(r['created_at']), updatedAt: isoReq(r['updated_at']), ...(deletedAt ? { deletedAt } : {}), v: 0,
        })),
        main(encode('unique', K.playlistOwner(id), { owner: ownerId })),
      ];
    },
  }],
  counts: [
    { label: 'playlists → playlist', type: 'playlist' },
    { label: 'playlists → U#PLAYLIST (owner pointer)', type: 'unique', pk: 'U#PLAYLIST#' },
  ],
  back: [{
    pgTable: 'playlists',
    pk: ['id'],
    match: (it) => it['t'] === 'playlist',
    toRow: (it) => ({
      id: String(it['id']), owner_id: String(it['ownerId']), title: String(it['title']), is_public: it['isPublic'] === true,
      created_at: String(it['createdAt']), updated_at: String(it['updatedAt']), deleted_at: it['deletedAt'] ?? null,
    }),
    children: (it) => [{
      table: 'playlist_items',
      match: { playlist_id: String(it['id']) },
      rows: entriesOf(it).map((x, position) => ({ playlist_id: String(it['id']), episode_id: x.e, position, added_at: x.at })),
    }],
  }],
};

/** Held inside the playlist item (`items`); copied and copied back with `playlists`. Positions become 0…n-1 in order. */
const playlistItems: TableSpec = {
  pgTable: 'playlist_items',
  sources: [],
  counts: [{
    label: 'playlist_items → playlist.items',
    measure: (ix: ItemIndex) => ix.ofType('playlist').reduce((n, p) => n + entriesOf(p).length, 0),
  }],
};

// ---------------------------------------------------------------- live listeners

const LIVE_WHERE = `seen_at > now() - interval '${KEEP_S} seconds'`;

const liveListeners: TableSpec = {
  pgTable: 'live_listeners',
  sources: [{
    // Rows older than KEEP_S are what the next heartbeat to the episode deletes (and the TTL backstop): not copied.
    name: 'sg.live-listeners',
    sql: `SELECT episode_id, listener_hash, seen_at FROM live_listeners WHERE ${LIVE_WHERE}`,
    keys: ['episode_id', 'listener_hash'],
    map: (r) => [events(liveItem(s(r['episode_id']), s(r['listener_hash']), Date.parse(isoReq(r['seen_at']))))],
  }],
  counts: [{ label: 'live_listeners (last 600 s) → liveListener', type: 'liveListener', sql: `SELECT count(*)::int AS n FROM live_listeners WHERE ${LIVE_WHERE}` }],
  back: [{
    pgTable: 'live_listeners',
    pk: ['episode_id', 'listener_hash'],
    match: (it) => it['t'] === 'liveListener',
    toRow: (it) => ({ episode_id: String(it['episodeId']), listener_hash: String(it['listenerHash']), seen_at: String(it['seenAt']) }),
  }],
};

// ---------------------------------------------------------------- counter checks (read-only)

const mm = (counter: string, key: string, stored: unknown, recomputed: unknown): Mismatch => ({ counter, key, stored, recomputed });

const counters: CounterCheck[] = [
  {
    // G-M26-SG1: every edge has its twin (the follow TX writes both).
    name: 'follow.twin',
    check: (ix) => {
      const out: Mismatch[] = [];
      for (const f of ix.ofType('follow')) {
        const a = listenerOf(f['PK']);
        const twin = K.follower(String(f['otherId']), a);
        if (!ix.get('main', twin.PK, twin.SK)) out.push(mm('follow.twin', keyText(f), 'follow', 'no follower item'));
      }
      for (const f of ix.ofType('follower')) {
        const b = listenerOf(f['PK']);
        const twin = K.follow(String(f['otherId']), b);
        if (!ix.get('main', twin.PK, twin.SK)) out.push(mm('follow.twin', keyText(f), 'follower', 'no follow item'));
      }
      return out;
    },
  },
  {
    // G-M26-SG1: `followerCount` / `followingCount` (lane AC writes them; addFollowCount in SG's TX keeps them) = the edges.
    name: 'listener.followCounts',
    check: (ix) => {
      const out: Mismatch[] = [];
      for (const l of ix.ofType('listener')) {
        const part = ix.partition('main', String(l['PK']));
        const followers = part.filter((i) => String(i['SK']).startsWith(K.LISTENER_SK.followers)).length;
        const following = part.filter((i) => String(i['SK']).startsWith(K.LISTENER_SK.follows)).length;
        if (Number(l['followerCount'] ?? 0) !== followers) out.push(mm('listener.followerCount', keyText(l), l['followerCount'] ?? null, followers));
        if (Number(l['followingCount'] ?? 0) !== following) out.push(mm('listener.followingCount', keyText(l), l['followingCount'] ?? null, following));
      }
      return out;
    },
  },
  {
    // SEQ#activity must be at least the largest activity id (nextSeq issues v + 1).
    name: 'seq.activity',
    check: (ix) => {
      const max = ix.ofType('activity').reduce((m, a) => Math.max(m, Number(a['id'])), 0);
      const k = K.seq('activity');
      const it = ix.get('main', k.PK, k.SK);
      const v = it ? Number(it['v']) : 0;
      return v >= max ? [] : [mm('seq.activity', `${k.PK}|${k.SK}`, it ? v : null, max)];
    },
  },
  {
    // `BIGACTOR` exactly when the follower edges are over FANOUT_MAX (markBigActor's rule).
    name: 'bigActor.marker',
    check: (ix) => {
      const out: Mismatch[] = [];
      const followers = new Map<string, number>();
      for (const f of ix.ofType('follower')) followers.set(listenerOf(f['PK']), (followers.get(listenerOf(f['PK'])) ?? 0) + 1);
      const marked = new Set(ix.ofType('bigActor').map((b) => listenerOf(b['PK'])));
      for (const [id, n] of followers) if (n > FANOUT_MAX && !marked.has(id)) out.push(mm('bigActor.marker', `${K.bigActor(id).PK}|BIGACTOR`, 'absent', n));
      for (const id of marked) if ((followers.get(id) ?? 0) <= FANOUT_MAX) out.push(mm('bigActor.marker', `${K.bigActor(id).PK}|BIGACTOR`, 'present', followers.get(id) ?? 0));
      return out;
    },
  },
  {
    // Every `U#ACT` / `U#ACTREF` points at an activity item that exists, and the day item carries that item's `hidden`.
    name: 'activity.pointers',
    check: (ix) => {
      const out: Mismatch[] = [];
      for (const u of ix.ofType('unique')) {
        const pk = String(u['PK']);
        if (!pk.startsWith('U#ACT#') && !pk.startsWith('U#ACTREF#')) continue;
        const [actPK, actSK] = String(u['owner']).split('|');
        const act = ix.get('events', actPK ?? '', actSK ?? '');
        if (!act) { out.push(mm('activity.pointers', keyText(u), u['owner'], 'no activity item')); continue; }
        if (pk.startsWith('U#ACT#') && (u['hidden'] === true) !== (act['hidden'] === true)) out.push(mm('activity.hidden', keyText(u), u['hidden'], act['hidden']));
      }
      return out;
    },
  },
  {
    // Every playlist has its `U#PLAYLIST` owner pointer naming its owner.
    name: 'playlist.owner',
    check: (ix) => {
      const out: Mismatch[] = [];
      for (const p of ix.ofType('playlist')) {
        const k = K.playlistOwner(String(p['id']));
        const owner = ix.get('main', k.PK, k.SK)?.['owner'];
        if (owner !== p['ownerId']) out.push(mm('playlist.owner', keyText(p), owner ?? null, p['ownerId']));
      }
      return out;
    },
  },
];

export const lane: LaneModule = {
  lane: 'sg',
  tables: [follows, activity, listenerMutes, mutedThreads, notifications, systemNotices, playlists, playlistItems, liveListeners],
  counters,
};

