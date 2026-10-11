// Lane AC's copy: listeners, sessions, codes, push, feedback, errors, deletions … from Postgres into the items lane AC's code writes.
/**
 * M26 lane MIG (MIG-01/02/04) for lane AC (data-model.md "Lane AC changes", src/db/repos/account/ddb/**, src/auth/**).
 * Every item below is the item the account lane's DynamoDB code would have written for the same data — same keys,
 * attributes, GSI keys and TTL backstops — with the writer's NULL handling: an attribute the writer only ever SETs
 * when it has a value (lockedUntil, avatarBytes, rulesAcceptedAt …) is OMITTED for a NULL column, because readers and
 * conditions use `attribute_not_exists` / `if_not_exists` on it (a stored NULL would block `if_not_exists`, and
 * `avatarBytes = :old` / `lockedUntil < :u` can never match a NULL).
 *
 * Shared items this lane owns (brief "one writer per key"):
 * - `L#<id>/PROFILE` with every attribute any lane keeps on it: AC's profile fields, lane SG's `followerCount` /
 *   `followingCount` (counted from `follows`), `hideOftenListened`, `notificationsSeenAt`, `privateListening`,
 *   lane LB's `listenedMs` (the Postgres column), lane SF's `suspendedAt` / `madeBy`, the deletion's
 *   `hiddenAt` / `deletingAt`; G6 `NAME#…` and G4 `Q#listeners`.
 * - `CFG#bytes / V`: every byte ceiling, each the SUM the Postgres code used (avatar, feedback images, comment
 *   images, held-comment images, status photos, hosted audio).
 * Expired rows (old codes, sessions past their cap, windows, logs) are copied as they are: every one carries the
 * TTL backstop the code gives it, and every reader checks the real time — nothing is dropped, so counts are
 * plain `count(*)`.
 * Never prints a row.
 */
import * as K from '../../src/db/ddb/keys.ts';
import { encode } from '../../src/db/ddb/codec.ts';
import type { Item } from '../../src/db/ddb/store.ts';
import { ROTATE_GRACE_SECONDS, SESSION_MAX_DAYS } from '../../src/auth/session.ts';
import { DIGEST_KEEP_DAYS } from '../../src/db/repos/account/digest.ts';
import { ERROR_DAYS } from '../../src/db/repos/account/error-reports.ts';
import {
  arr, bool, bytes, dayOf, iso, isoReq, json, num, numReq, str, ttlFrom,
  type CounterCheck, type ItemIndex, type LaneModule, type Mismatch, type Out, type Row, type TableSpec,
} from './types.ts';

const DAY = 86_400_000;
const main = (item: Item): Out => ({ table: 'main', item });
const events = (item: Item): Out => ({ table: 'events', item });
/** A bytea key selected as hex → the session-key form the code uses (common.ts `hashKey`: base64url of the bytes). */
const hk = (hex: string): string => Buffer.from(hex, 'hex').toString('base64url');
/** Only the attributes that have a value (the writers' "SET when present, REMOVE when cleared"). */
const present = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
const s = (r: Row, c: string): string => String(r[c]);
const buf = (v: unknown): Buffer | null => (v === null || v === undefined ? null : Buffer.from(v as Uint8Array));
const after = (prefix: string, v: unknown): string => String(v).slice(prefix.length);
/** The Kuala Lumpur day's start (the day daily_active and status pushes count by — common.ts `klDay`). */
const klStart = (d: string): string => `${d}T00:00:00+08:00`;

const PREF_COLS = [['newEpisodes', 'new_episodes'], ['popular', 'popular'], ['replies', 'replies'], ['likes', 'likes'], ['follows', 'follows'],
  ['mentions', 'mentions'], ['statuses', 'statuses'], ['digest', 'digest'], ['system', 'system']] as const;

// ---------------------------------------------------------------------------------------------------------------
// listeners (+ U#EMAIL, + CFG#bytes)

const LISTENERS_SQL = `
SELECT l.id::text AS id, l.email::text AS email, l.password_hash, l.display_name, l.failed_attempts, l.locked_until, l.created_at,
       l.suspended_at, l.country::text AS country, l.bio, l.made_by::text AS made_by, l.avatar_url, l.avatar_path, l.avatar_bytes,
       l.age_range, l.gender, l.likes_public, l.private_listening, l.listened_ms::text AS listened_ms, l.rules_accepted_at,
       l.hide_badge, l.hide_stickers, l.hide_decorations, l.private_subscriptions, l.birthday::text AS birthday, l.industry,
       l.notifications_seen_at, l.hidden_at, l.tz, l.hide_often_listened,
       (SELECT count(*)::int FROM follows f WHERE f.followed_id = l.id) AS follower_count,
       (SELECT count(*)::int FROM follows f WHERE f.follower_id = l.id) AS following_count,
       (SELECT d.due_at FROM account_deletions d WHERE d.listener_id = l.id AND d.cancelled_at IS NULL) AS deleting_at
  FROM listeners l`;

function listenerOut(r: Row): Out[] {
  const id = s(r, 'id');
  const createdAt = isoReq(r['created_at']);
  const displayName = s(r, 'display_name');
  const email = s(r, 'email');
  // listeners.ts createListener (+ admin-ops.ts createMadeListener) and every later SET on the item.
  const attrs = {
    id, email, passwordHash: s(r, 'password_hash'), displayName, createdAt,
    failedAttempts: numReq(r['failed_attempts']), listenedMs: numReq(r['listened_ms']),
    followerCount: numReq(r['follower_count']), followingCount: numReq(r['following_count']),
    likesPublic: bool(r['likes_public']), privateListening: bool(r['private_listening']),
    hideBadge: bool(r['hide_badge']), hideStickers: bool(r['hide_stickers']), hideDecorations: bool(r['hide_decorations']),
    privateSubscriptions: bool(r['private_subscriptions']), hideOftenListened: bool(r['hide_often_listened']),
    ...present({
      lockedUntil: iso(r['locked_until']), suspendedAt: iso(r['suspended_at']), hiddenAt: iso(r['hidden_at']), deletingAt: iso(r['deleting_at']),
      country: str(r['country']), tz: str(r['tz']), bio: str(r['bio']), madeBy: str(r['made_by']),
      avatarUrl: str(r['avatar_url']), avatarPath: str(r['avatar_path']), avatarBytes: num(r['avatar_bytes']),
      ageRange: str(r['age_range']), gender: str(r['gender']), birthday: dayOf(r['birthday']), industry: str(r['industry']),
      rulesAcceptedAt: iso(r['rules_accepted_at']), notificationsSeenAt: iso(r['notifications_seen_at']),
    }),
  };
  return [
    main(encode('listener', K.listener(id), attrs, { gsi: { ...K.G6(displayName, id), ...K.G4('listeners', createdAt, id) } })),
    main(encode('unique', K.U.email(email), { owner: id })),
  ];
}

/** Every byte ceiling (data-model §7 B), each with the SUM rule of the Postgres code it replaces. */
const BYTES_SQL = `
SELECT 'bytes' AS k,
  (SELECT coalesce(sum(avatar_bytes), 0)::text FROM listeners) AS avatar,                               -- account/profile.ts avatarBytesOthers
  (SELECT coalesce(sum(octet_length(bytes)), 0)::text FROM feedback_images) AS feedback_images,         -- account/feedback.ts
  (SELECT coalesce(sum(image_bytes), 0)::text FROM comments) AS comment_images,                         -- social/status-writes.ts, comment-writes.ts
  (SELECT coalesce(sum(image_bytes), 0)::text FROM held_comments) AS held_images,                       -- social/comment-writes.ts (held part)
  (SELECT coalesce(sum((body->>'bytes')::bigint), 0)::text FROM cache WHERE key LIKE 'status-photo:%') AS status_photos, -- social/status-items.ts
  (SELECT coalesce(sum(audio_bytes), 0)::text FROM hosted_episodes WHERE deleted_at IS NULL) AS hosted_audio -- studio/hosted.ts`;

const BYTE_ATTRS = [
  ['avatarBytes', 'avatar'], ['feedbackImageBytes', 'feedback_images'], ['commentImageBytes', 'comment_images'],
  ['heldImageBytes', 'held_images'], ['statusPhotoBytes', 'status_photos'], ['hostedAudioBytes', 'hosted_audio'],
] as const;

const listenerRow = (i: Item): Row => ({
  id: i['id'], email: i['email'], password_hash: i['passwordHash'], display_name: i['displayName'], created_at: i['createdAt'],
  failed_attempts: i['failedAttempts'] ?? 0, locked_until: i['lockedUntil'] ?? null, suspended_at: i['suspendedAt'] ?? null,
  country: i['country'] ?? null, bio: i['bio'] ?? null, made_by: i['madeBy'] ?? null,
  avatar_url: i['avatarUrl'] ?? null, avatar_path: i['avatarPath'] ?? null, avatar_bytes: i['avatarBytes'] ?? null,
  age_range: i['ageRange'] ?? null, gender: i['gender'] ?? null, likes_public: i['likesPublic'] ?? true, private_listening: i['privateListening'] ?? false,
  listened_ms: i['listenedMs'] ?? 0, rules_accepted_at: i['rulesAcceptedAt'] ?? null,
  hide_badge: i['hideBadge'] ?? false, hide_stickers: i['hideStickers'] ?? false, hide_decorations: i['hideDecorations'] ?? false,
  private_subscriptions: i['privateSubscriptions'] ?? false, birthday: i['birthday'] ?? null, industry: i['industry'] ?? null,
  notifications_seen_at: i['notificationsSeenAt'] ?? null, hidden_at: i['hiddenAt'] ?? null, tz: i['tz'] ?? null,
  hide_often_listened: i['hideOftenListened'] ?? false,
});

const listeners: TableSpec = {
  pgTable: 'listeners',
  sources: [
    { name: 'ac.listeners', sql: LISTENERS_SQL, keys: ['id'], map: listenerOut },
    {
      name: 'ac.bytes', sql: BYTES_SQL, keys: ['k'],
      map: (r) => [main(encode('config', K.config('bytes'), Object.fromEntries(BYTE_ATTRS.map(([a, c]) => [a, numReq(r[c])]))))],
    },
  ],
  counts: [
    { type: 'listener' },
    { label: 'listeners → U#EMAIL', type: 'unique', pk: 'U#EMAIL#' },
    { label: 'CFG#bytes', type: 'config', pk: 'CFG#bytes', sql: 'SELECT 1 AS n' },
  ],
  back: [{ pgTable: 'listeners', pk: ['id'], match: (i) => i['t'] === 'listener', toRow: listenerRow }],
};

// ---------------------------------------------------------------------------------------------------------------
// sessions (+ L#/SESS# pointers, + ACTAS# pointers)

const SESSIONS_SQL = `
SELECT encode(s.token_hash, 'hex') AS k, s.listener_id::text AS listener_id, s.id::text AS public_id, s.device_label, s.country::text AS country,
       s.created_at, s.last_seen_at, s.rotated_at, s.replaced_at, encode(s.replaced_by, 'hex') AS replaced_by,
       s.acting_admin_id::text AS acting_admin_id, s.second_factor_at, s.second_factor_code, s.second_factor_sent_at, s.second_factor_tries,
       (SELECT encode(p.token_hash, 'hex') FROM sessions p WHERE p.replaced_by = s.token_hash ORDER BY p.replaced_at DESC NULLS LAST, 1 LIMIT 1) AS predecessor,
       l.email::text AS email, l.display_name, l.created_at AS listener_created_at, l.suspended_at
  FROM sessions s JOIN listeners l ON l.id = s.listener_id`;

function sessionOut(r: Row): Out[] {
  const key = hk(s(r, 'k'));
  const listenerId = s(r, 'listener_id');
  const publicId = s(r, 'public_id');
  const createdAt = isoReq(r['created_at']);
  const replacedAt = iso(r['replaced_at']);
  const actingAdminId = str(r['acting_admin_id']) ?? undefined;
  const code = bytes(r['second_factor_code']);
  // sessions.ts newSessionItems; rotateSessionRow sets replacedAt/replacedBy and shortens the TTL to the grace window.
  const session = encode('session', K.session(key), {
    tokenHash: key, listenerId, publicId, deviceLabel: str(r['device_label']), country: str(r['country']),
    createdAt, lastSeenAt: isoReq(r['last_seen_at']), rotatedAt: isoReq(r['rotated_at']),
    secondFactorTries: numReq(r['second_factor_tries']),
    email: s(r, 'email'), displayName: s(r, 'display_name'), listenerCreatedAt: isoReq(r['listener_created_at']), suspendedAt: iso(r['suspended_at']),
    ...present({
      secondFactorAt: iso(r['second_factor_at']), secondFactorSentAt: iso(r['second_factor_sent_at']),
      secondFactorCode: code ? new Uint8Array(code) : null, actingAdminId,
      replacedAt, replacedBy: r['replaced_by'] ? hk(s(r, 'replaced_by')) : null, predecessor: r['predecessor'] ? hk(s(r, 'predecessor')) : null,
    }),
  }, { ttl: replacedAt ? ttlFrom(replacedAt, ROTATE_GRACE_SECONDS * 1000 + DAY) : ttlFrom(createdAt, SESSION_MAX_DAYS * DAY) });
  const out: Out[] = [main(session)];
  // Only the live end of a rotation chain has a pointer (rotation moves it to the new session).
  if (!r['replaced_by']) {
    out.push(main(encode('sessionPtr', K.listenerSessionPtr(listenerId, publicId), { tokenHash: key, publicId, deviceLabel: str(r['device_label']), actingAdminId, createdAt })));
  }
  if (actingAdminId) out.push(main(encode('actAsPtr', K.actAsPtr(actingAdminId, publicId), { tokenHash: key, targetId: listenerId, createdAt })));
  return out;
}

const sessions: TableSpec = {
  pgTable: 'sessions',
  sources: [{ name: 'ac.sessions', sql: SESSIONS_SQL, keys: ['k'], map: sessionOut }],
  counts: [
    { type: 'session' },
    { label: 'sessions → SESS# pointers', type: 'sessionPtr', sql: 'SELECT count(*)::int AS n FROM sessions WHERE replaced_by IS NULL' },
    { label: 'sessions → ACTAS# pointers', type: 'actAsPtr', sql: 'SELECT count(*)::int AS n FROM sessions WHERE acting_admin_id IS NOT NULL' },
  ],
  back: [{
    pgTable: 'sessions', pk: ['token_hash'], match: (i) => i['t'] === 'session',
    // `replaced_by` references another session row: the way back must write the chain's live end first (or defer the FK).
    toRow: (i) => ({
      token_hash: Buffer.from(String(i['tokenHash']), 'base64url'), listener_id: i['listenerId'], id: i['publicId'],
      device_label: i['deviceLabel'] ?? null, country: i['country'] ?? null, created_at: i['createdAt'], last_seen_at: i['lastSeenAt'],
      rotated_at: i['rotatedAt'], replaced_at: i['replacedAt'] ?? null,
      replaced_by: i['replacedBy'] ? Buffer.from(String(i['replacedBy']), 'base64url') : null, acting_admin_id: i['actingAdminId'] ?? null,
      second_factor_at: i['secondFactorAt'] ?? null, second_factor_code: buf(i['secondFactorCode']),
      second_factor_sent_at: i['secondFactorSentAt'] ?? null, second_factor_tries: i['secondFactorTries'] ?? 0,
    }),
  }],
};

// ---------------------------------------------------------------------------------------------------------------
// email_codes, email_changes

const emailCodes: TableSpec = {
  pgTable: 'email_codes',
  sources: [{
    name: 'ac.email-codes', keys: ['email'],
    sql: 'SELECT email::text AS email, code_hash, sent_at, expires_at, attempts FROM email_codes',
    map: (r) => [main(encode('emailCode', K.emailCode(s(r, 'email')), {
      email: s(r, 'email'), codeHash: new Uint8Array(bytes(r['code_hash'])!), sentAt: isoReq(r['sent_at']), expiresAt: isoReq(r['expires_at']), attempts: numReq(r['attempts']),
    }, { ttl: ttlFrom(r['expires_at'], DAY) }))],
  }],
  counts: [{ type: 'emailCode' }],
  back: [{
    pgTable: 'email_codes', pk: ['email'], match: (i) => i['t'] === 'emailCode',
    toRow: (i) => ({ email: i['email'], code_hash: buf(i['codeHash']), sent_at: i['sentAt'], expires_at: i['expiresAt'], attempts: i['attempts'] ?? 0 }),
  }],
};

const emailChanges: TableSpec = {
  pgTable: 'email_changes',
  sources: [{
    name: 'ac.email-changes', keys: ['listener_id'],
    sql: 'SELECT listener_id::text AS listener_id, new_email::text AS new_email, code_hash, old_code_hash, sent_at, expires_at, tries FROM email_changes',
    map: (r) => {
      const old = bytes(r['old_code_hash']);
      // account.ts saveEmailChange; rows from before M25 have no old-address code (omitted — the reader gives null).
      return [main(encode('emailChange', K.listenerSingleton(s(r, 'listener_id'), 'EMAILCHG'), {
        newEmail: s(r, 'new_email'), codeHash: new Uint8Array(bytes(r['code_hash'])!), ...(old ? { oldCodeHash: new Uint8Array(old) } : {}),
        sentAt: isoReq(r['sent_at']), expiresAt: isoReq(r['expires_at']), tries: numReq(r['tries']),
      }, { ttl: ttlFrom(r['expires_at'], DAY) }))];
    },
  }],
  counts: [{ type: 'emailChange' }],
  back: [{
    pgTable: 'email_changes', pk: ['listener_id'], match: (i) => i['t'] === 'emailChange',
    toRow: (i) => ({
      listener_id: after('L#', i['PK']), new_email: i['newEmail'], code_hash: buf(i['codeHash']), old_code_hash: buf(i['oldCodeHash']),
      sent_at: i['sentAt'], expires_at: i['expiresAt'], tries: i['tries'] ?? 0,
    }),
  }],
};

// ---------------------------------------------------------------------------------------------------------------
// push: tokens (+ U#PUSHTOK owner), switches, sent log, like windows, per-show switches, status-push day counts, digests

const pushTokens: TableSpec = {
  pgTable: 'push_tokens',
  sources: [{
    name: 'ac.push-tokens', keys: ['token'],
    sql: 'SELECT token, listener_id::text AS listener_id, platform, created_at, last_ok_at FROM push_tokens',
    map: (r) => {
      const token = s(r, 'token');
      const listenerId = s(r, 'listener_id');
      const createdAt = isoReq(r['created_at']);
      const owner = encode('pushTokenOwner', K.pushTokenOwner(token), { owner: listenerId, token });
      // push.ts sendExpo keeps `lastOkAt` on the owner item with an UpdateItem (outside the codec's strict list for the type).
      const lastOk = iso(r['last_ok_at']);
      if (lastOk) owner['lastOkAt'] = lastOk;
      return [
        main(encode('pushToken', K.pushToken(listenerId, token), { token, platform: s(r, 'platform'), listenerId, createdAt }, { gsi: K.G4('pushtok', createdAt, `${listenerId}#${K.sha(token)}`) })),
        main(owner),
      ];
    },
  }],
  counts: [{ type: 'pushToken' }, { label: 'push_tokens → U#PUSHTOK', type: 'pushTokenOwner' }],
  back: [{
    pgTable: 'push_tokens', pk: ['token'], match: (i) => i['t'] === 'pushToken',
    // last_ok_at lives on the owner item (U#PUSHTOK): the way back leaves it NULL.
    toRow: (i) => ({ token: i['token'], listener_id: i['listenerId'], platform: i['platform'], created_at: i['createdAt'], last_ok_at: null }),
  }],
};

/**
 * `PUSHPREF`: the switches (push_prefs) and `lastPopularAt` — the once-a-day "popular" rule, which Postgres read from
 * push_sent (`kind = 'popular' AND sent_at > now() - 1 day`). A listener with a popular push but no switches row gets
 * an item holding only `lastPopularAt`, as push.ts sendPopular's UpdateItem would have made it.
 */
const PREFS_SQL = `
SELECT l.id::text AS listener_id, (p.listener_id IS NOT NULL) AS has_prefs,
       p.new_episodes, p.popular, p.replies, p.likes, p.follows, p.mentions, p.statuses, p.digest, p.system,
       (SELECT max(x.sent_at) FROM push_sent x WHERE x.listener_id = l.id AND x.kind = 'popular') AS last_popular
  FROM listeners l LEFT JOIN push_prefs p ON p.listener_id = l.id
 WHERE p.listener_id IS NOT NULL OR EXISTS (SELECT 1 FROM push_sent x WHERE x.listener_id = l.id AND x.kind = 'popular')`;

const pushPrefs: TableSpec = {
  pgTable: 'push_prefs',
  sources: [{
    name: 'ac.push-prefs', sql: PREFS_SQL, keys: ['listener_id'],
    map: (r) => [main(encode('pushPrefs', K.listenerSingleton(s(r, 'listener_id'), 'PUSHPREF'), {
      ...(bool(r['has_prefs']) ? Object.fromEntries(PREF_COLS.map(([a, c]) => [a, bool(r[c])])) : {}),
      ...present({ lastPopularAt: iso(r['last_popular']) }),
    }))],
  }],
  counts: [
    { label: 'push_prefs → PUSHPREF with switches', type: 'pushPrefs', where: (i) => 'newEpisodes' in i },
    { label: 'PUSHPREF items (switches or a popular push)', type: 'pushPrefs', sql: `SELECT count(*)::int AS n FROM (${PREFS_SQL}) q` },
  ],
  back: [{
    pgTable: 'push_prefs', pk: ['listener_id'], match: (i) => i['t'] === 'pushPrefs' && PREF_COLS.some(([a]) => a in i),
    toRow: (i) => ({ listener_id: after('L#', i['PK']), ...Object.fromEntries(PREF_COLS.map(([a, c]) => [c, i[a] ?? true])) }),
  }],
};

const pushSent: TableSpec = {
  pgTable: 'push_sent',
  sources: [{
    name: 'ac.push-sent', keys: ['listener_id', 'episode_id', 'kind'],
    sql: 'SELECT listener_id::text AS listener_id, episode_id, kind, sent_at FROM push_sent',
    // push.ts pushSentItem (also studio/ddb/announce.ts for kind 'announcement': the same shape).
    map: (r) => [events(encode('pushSent', K.ev.pushSent(s(r, 'listener_id'), s(r, 'episode_id'), s(r, 'kind')), {
      listenerId: s(r, 'listener_id'), episodeId: s(r, 'episode_id'), kind: s(r, 'kind'), sentAt: isoReq(r['sent_at']),
    }, { ttl: ttlFrom(r['sent_at'], 31 * DAY) }))],
  }],
  counts: [{ type: 'pushSent' }],
  back: [{
    pgTable: 'push_sent', pk: ['listener_id', 'episode_id', 'kind'], match: (i) => i['t'] === 'pushSent',
    toRow: (i) => ({ listener_id: i['listenerId'], episode_id: i['episodeId'], kind: i['kind'], sent_at: i['sentAt'] }),
  }],
};

const pushLikeWindows: TableSpec = {
  pgTable: 'push_like_windows',
  sources: [{
    name: 'ac.push-like-windows', keys: ['listener_id', 'target_key'],
    sql: 'SELECT listener_id::text AS listener_id, target_key, first_at, count FROM push_like_windows',
    map: (r) => [main(encode('pushWindow', K.pushWindow(s(r, 'listener_id'), s(r, 'target_key')), {
      groupKey: s(r, 'target_key'), firstAt: isoReq(r['first_at']), count: numReq(r['count']),
    }, { ttl: ttlFrom(r['first_at'], 7 * DAY) }))],
  }],
  counts: [{ type: 'pushWindow' }],
  back: [{
    pgTable: 'push_like_windows', pk: ['listener_id', 'target_key'], match: (i) => i['t'] === 'pushWindow',
    toRow: (i) => ({ listener_id: after('L#', i['PK']), target_key: i['groupKey'], first_at: i['firstAt'], count: i['count'] }),
  }],
};

const notifyShowPrefs: TableSpec = {
  pgTable: 'notify_show_prefs',
  sources: [{
    name: 'ac.notify-show-prefs', keys: ['listener_id', 'feed_url'],
    sql: 'SELECT listener_id::text AS listener_id, feed_url, enabled FROM notify_show_prefs',
    map: (r) => [main(encode('notifyShow', K.notifyShow(s(r, 'listener_id'), s(r, 'feed_url')), { feedUrl: s(r, 'feed_url'), enabled: bool(r['enabled']) }))],
  }],
  counts: [{ type: 'notifyShow' }],
  back: [{
    pgTable: 'notify_show_prefs', pk: ['listener_id', 'feed_url'], match: (i) => i['t'] === 'notifyShow',
    toRow: (i) => ({ listener_id: after('L#', i['PK']), feed_url: i['feedUrl'], enabled: i['enabled'] }),
  }],
};

const statusPushLog: TableSpec = {
  pgTable: 'status_push_log',
  sources: [{
    name: 'ac.status-push-log', keys: ['author_id', 'day'],
    sql: 'SELECT author_id::text AS author_id, day::text AS day, count FROM status_push_log',
    // push.ts statusPushHandler: TTL = the last push + 3 days; the day's end is the latest a push of that day can be.
    map: (r) => {
      const d = dayOf(r['day'])!;
      return [events(encode('statusPushLog', K.statusPushLog(s(r, 'author_id'), d), { count: numReq(r['count']) }, { ttl: ttlFrom(klStart(d), 4 * DAY) }))];
    },
  }],
  counts: [{ type: 'statusPushLog' }],
  back: [{
    pgTable: 'status_push_log', pk: ['author_id', 'day'], match: (i) => i['t'] === 'statusPushLog',
    toRow: (i) => ({ author_id: after('SPL#', i['PK']), day: i['SK'], count: i['count'] }),
  }],
};

const weeklyDigests: TableSpec = {
  pgTable: 'weekly_digests',
  sources: [{
    name: 'ac.weekly-digests', keys: ['listener_id', 'iso_week'],
    sql: 'SELECT listener_id::text AS listener_id, iso_week, episode_ids, sent_at FROM weekly_digests',
    map: (r) => {
      const id = s(r, 'listener_id');
      const week = s(r, 'iso_week');
      const sentAt = isoReq(r['sent_at']);
      return [main(encode('weeklyDigest', K.weeklyDigest(id, week), { isoWeek: week, episodeIds: arr(r['episode_ids']) ?? [], sentAt }, {
        gsi: K.G4('digests', sentAt, `${id}#${week}`), ttl: ttlFrom(sentAt, (DIGEST_KEEP_DAYS + 1) * DAY),
      }))];
    },
  }],
  counts: [{ type: 'weeklyDigest' }],
  back: [{
    pgTable: 'weekly_digests', pk: ['listener_id', 'iso_week'], match: (i) => i['t'] === 'weeklyDigest',
    toRow: (i) => ({ listener_id: after('L#', i['PK']), iso_week: i['isoWeek'], episode_ids: i['episodeIds'] ?? [], sent_at: i['sentAt'] }),
  }],
};

// ---------------------------------------------------------------------------------------------------------------
// feedback (+ the sender's FBIMG log), feedback_images, error_reports

/** feedback.ts createFeedback: `L#<sender>/FBIMG` = the times of their picture messages in the last day (the "5 a day" check). */
const FBIMG_SQL = `
SELECT f.listener_id::text AS listener_id, json_agg(to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ORDER BY f.created_at, f.id) AS times, max(f.created_at) AS last
  FROM feedback f
 WHERE f.listener_id IS NOT NULL AND f.created_at > now() - interval '1 day'
   AND EXISTS (SELECT 1 FROM feedback_images i WHERE i.feedback_id = f.id)
 GROUP BY f.listener_id`;

const feedback: TableSpec = {
  pgTable: 'feedback',
  sources: [
    {
      name: 'ac.feedback', keys: ['id'],
      sql: `SELECT f.id::text AS id, f.listener_id::text AS listener_id, f.kind, f.body, f.app_version, f.created_at,
                   (SELECT count(*)::int FROM feedback_images i WHERE i.feedback_id = f.id) AS images
              FROM feedback f`,
      // No G1 on feedback: createFeedback does not set one (the deletion's `authored` phase never finds it).
      map: (r) => {
        const id = s(r, 'id');
        const createdAt = isoReq(r['created_at']);
        return [main(encode('feedback', K.feedback(id), {
          id, listenerId: str(r['listener_id']), kind: s(r, 'kind'), body: s(r, 'body'), appVersion: str(r['app_version']), createdAt, images: numReq(r['images']),
        }, { gsi: { ...K.G4('feedback', createdAt, id), ...(r['listener_id'] ? K.G1(s(r, 'listener_id'), 'feedback', createdAt, id) : {}) } }))]; // lane LE: G1 as the app writes it
      },
    },
    {
      name: 'ac.feedback-image-log', sql: FBIMG_SQL, keys: ['listener_id'],
      map: (r) => {
        const times = (json<unknown[]>(r['times']) ?? []).map((t) => isoReq(t));
        return [main(encode('feedback', { PK: K.L(s(r, 'listener_id')), SK: 'FBIMG' }, { times, v: 1 }, { ttl: ttlFrom(r['last'], 2 * DAY) }))];
      },
    },
  ],
  counts: [
    { type: 'feedback', pk: 'FB#' },
    { label: 'feedback → FBIMG (picture senders, last day)', type: 'feedback', sk: 'FBIMG', sql: `SELECT count(*)::int AS n FROM (${FBIMG_SQL}) q` },
  ],
  back: [{
    pgTable: 'feedback', pk: ['id'], match: (i) => i['t'] === 'feedback' && String(i['PK']).startsWith('FB#'),
    toRow: (i) => ({ id: i['id'], listener_id: i['listenerId'] ?? null, kind: i['kind'], body: i['body'], app_version: i['appVersion'] ?? null, created_at: i['createdAt'] }),
  }],
};

const feedbackImages: TableSpec = {
  pgTable: 'feedback_images',
  sources: [{
    name: 'ac.feedback-images', keys: ['feedback_id', 'n'],
    sql: 'SELECT feedback_id::text AS feedback_id, n, mime, bytes, created_at FROM feedback_images',
    map: (r) => {
      const id = s(r, 'feedback_id');
      const n = numReq(r['n']);
      const createdAt = isoReq(r['created_at']);
      return [main(encode('feedbackImage', K.feedbackImage(id, n), { n, mime: s(r, 'mime'), bytes: new Uint8Array(bytes(r['bytes'])!), createdAt }, {
        gsi: K.G4('feedback-images', createdAt, `${id}#${n}`),
      }))];
    },
  }],
  counts: [{ type: 'feedbackImage' }],
  back: [{
    pgTable: 'feedback_images', pk: ['feedback_id', 'n'], match: (i) => i['t'] === 'feedbackImage',
    toRow: (i) => ({ feedback_id: after('FB#', i['PK']), n: i['n'], mime: i['mime'], bytes: buf(i['bytes']), created_at: i['createdAt'] }),
  }],
};

const errorReports: TableSpec = {
  pgTable: 'error_reports',
  sources: [{
    name: 'ac.error-reports', keys: ['id'],
    sql: 'SELECT id::text AS id, listener_id::text AS listener_id, scope, message, stack, app_version, platform, count, first_seen, last_seen FROM error_reports',
    // feedback.ts upsertError: the U#ERR item IS the row (G4 `Q#errors` by lastSeen, G1 by the last sender, TTL lastSeen + 31 d).
    map: (r) => {
      const key = K.U.error(s(r, 'scope'), s(r, 'message'), s(r, 'app_version'), s(r, 'platform'));
      const sig = after('U#ERR#', key.PK);
      const lastSeen = isoReq(r['last_seen']);
      const listenerId = str(r['listener_id']);
      return [main(encode('errorReport', key, {
        scope: s(r, 'scope'), message: s(r, 'message'), appVersion: s(r, 'app_version'), platform: s(r, 'platform'),
        firstSeen: isoReq(r['first_seen']), lastSeen, listenerId, stack: str(r['stack']), count: numReq(r['count']),
      }, { gsi: { ...K.G4('errors', lastSeen, sig), ...(listenerId ? K.G1(listenerId, 'error', lastSeen, sig) : {}) }, ttl: ttlFrom(lastSeen, (ERROR_DAYS + 1) * DAY) }))];
    },
  }],
  counts: [{ type: 'errorReport' }],
  back: [{
    // The item keeps no uuid (the U#ERR key is the identity): the way back upserts on the unique four and lets Postgres make an id.
    pgTable: 'error_reports', pk: ['scope', 'message', 'app_version', 'platform'], match: (i) => i['t'] === 'errorReport',
    toRow: (i) => ({
      listener_id: i['listenerId'] ?? null, scope: i['scope'], message: i['message'], stack: i['stack'] ?? null, app_version: i['appVersion'] ?? '',
      platform: i['platform'] ?? '', count: i['count'] ?? 1, first_seen: i['firstSeen'], last_seen: i['lastSeen'],
    }),
  }],
};

// ---------------------------------------------------------------------------------------------------------------
// profile singletons and lists: interests, rec feedback, stickers, queue, identities

const listenerInterests: TableSpec = {
  pgTable: 'listener_interests',
  sources: [{
    name: 'ac.interests', keys: ['listener_id'],
    sql: 'SELECT listener_id::text AS listener_id, genre_ids, skipped_at, updated_at FROM listener_interests',
    map: (r) => [main(encode('interests', K.listenerSingleton(s(r, 'listener_id'), 'INTERESTS'), {
      genreIds: (arr<number | string>(r['genre_ids']) ?? []).map(Number), skippedAt: iso(r['skipped_at']), updatedAt: isoReq(r['updated_at']),
    }))],
  }],
  counts: [{ type: 'interests' }],
  back: [{
    pgTable: 'listener_interests', pk: ['listener_id'], match: (i) => i['t'] === 'interests',
    toRow: (i) => ({ listener_id: after('L#', i['PK']), genre_ids: i['genreIds'] ?? [], skipped_at: i['skippedAt'] ?? null, updated_at: i['updatedAt'] }),
  }],
};

const recFeedback: TableSpec = {
  pgTable: 'rec_feedback',
  sources: [{
    name: 'ac.rec-feedback', keys: ['id'],
    sql: 'SELECT id::text AS id, listener_id::text AS listener_id, reason, note, created_at FROM rec_feedback',
    map: (r) => {
      const createdAt = isoReq(r['created_at']);
      return [main(encode('recFeedback', K.recFeedback(s(r, 'listener_id'), createdAt, s(r, 'id')), { reason: s(r, 'reason'), note: str(r['note']), createdAt }))];
    },
  }],
  counts: [{ type: 'recFeedback' }],
  back: [{
    pgTable: 'rec_feedback', pk: ['id'], match: (i) => i['t'] === 'recFeedback',
    toRow: (i) => ({ id: String(i['SK']).split('#').pop(), listener_id: after('L#', i['PK']), reason: i['reason'], note: i['note'] ?? null, created_at: i['createdAt'] }),
  }],
};

/** profile.ts replacePlacements: one `STICKERS` item holding every placement (reals selected as text: no float4 → float8 noise). */
const stickerPlacements: TableSpec = {
  pgTable: 'sticker_placements',
  sources: [{
    name: 'ac.stickers', keys: ['listener_id'],
    sql: `SELECT listener_id::text AS listener_id,
                 json_agg(json_build_object('stickerId', sticker_id, 'x', x::text, 'y', y::text, 'scale', scale::text, 'rot', rot::text, 'z', z) ORDER BY z, sticker_id) AS items
            FROM sticker_placements GROUP BY listener_id`,
    map: (r) => {
      const items = (json<Record<string, unknown>[]>(r['items']) ?? []).map((p) => ({
        stickerId: String(p['stickerId']), x: Number(p['x']), y: Number(p['y']), scale: Number(p['scale']), rot: Number(p['rot']), z: Number(p['z']),
      }));
      return [main(encode('stickers', K.listenerSingleton(s(r, 'listener_id'), 'STICKERS'), { items }))];
    },
  }],
  counts: [
    { label: 'sticker_placements → STICKERS items[]', measure: (ix) => ix.ofType('stickers').reduce((n, i) => n + ((i['items'] as unknown[] | undefined)?.length ?? 0), 0) },
    { label: 'STICKERS items (one per listener)', type: 'stickers', sql: 'SELECT count(DISTINCT listener_id)::int AS n FROM sticker_placements' },
  ],
  // No `back`: a STICKERS item is a set of rows with no parent row of its own, and BackSpec needs one (`toRow`).
  // The way back needs a children-only form: DELETE FROM sticker_placements WHERE listener_id, then INSERT `items`
  // (updated_at is not kept on the item — Postgres' default now()). Raised with the lead.
};

const queues: TableSpec = {
  pgTable: 'queues',
  sources: [{
    name: 'ac.queues', keys: ['listener_id'],
    sql: 'SELECT listener_id::text AS listener_id, items, version, device_id, updated_at FROM queues',
    map: (r) => [main(encode('queue', K.listenerSingleton(s(r, 'listener_id'), 'QUEUE'), {
      items: json<unknown[]>(r['items']) ?? [], version: numReq(r['version']), deviceId: str(r['device_id']), updatedAt: isoReq(r['updated_at']),
    }))],
  }],
  counts: [{ type: 'queue' }],
  back: [{
    pgTable: 'queues', pk: ['listener_id'], match: (i) => i['t'] === 'queue',
    toRow: (i) => ({ listener_id: after('L#', i['PK']), items: i['items'] ?? [], version: i['version'] ?? 0, device_id: i['deviceId'] ?? null, updated_at: i['updatedAt'] }),
  }],
};

/**
 * Google / Facebook links (M20 US5): `L#<id>/IDENT#<provider>` (data-model.md §3, §5 — the SK is the one-per-provider
 * rule). No repo reads or writes this table on either backend today; the rows are carried so nothing is lost.
 * (provider, subject) has no U# kind in keys.ts yet — nothing looks a listener up by it.
 */
const listenerIdentities: TableSpec = {
  pgTable: 'listener_identities',
  sources: [{
    name: 'ac.identities', keys: ['provider', 'subject'],
    sql: 'SELECT provider, subject, listener_id::text AS listener_id, email::text AS email, created_at FROM listener_identities',
    map: (r) => [main(encode('identity', K.identity(s(r, 'listener_id'), s(r, 'provider')), {
      provider: s(r, 'provider'), subject: s(r, 'subject'), ...present({ email: str(r['email']) }), createdAt: isoReq(r['created_at']),
    }))],
  }],
  counts: [{ type: 'identity' }],
  back: [{
    pgTable: 'listener_identities', pk: ['provider', 'subject'], match: (i) => i['t'] === 'identity',
    toRow: (i) => ({ provider: i['provider'], subject: i['subject'], listener_id: after('L#', i['PK']), email: i['email'] ?? null, created_at: i['createdAt'] }),
  }],
};

// ---------------------------------------------------------------------------------------------------------------
// account_deletions, rate_counters, daily_active

const accountDeletions: TableSpec = {
  pgTable: 'account_deletions',
  sources: [{
    name: 'ac.deletions', keys: ['listener_id'],
    sql: 'SELECT listener_id::text AS listener_id, requested_at, due_at, cancelled_at FROM account_deletions',
    // deletion.ts requestDeletion: G4 `Q#deletions` by dueAt while waiting; cancelDeletion sets cancelledAt and removes it.
    // Postgres has no "job started" state (its hourly step deleted the whole account at once), so no JOB# item is made.
    map: (r) => {
      const id = s(r, 'listener_id');
      const dueAt = isoReq(r['due_at']);
      const cancelledAt = iso(r['cancelled_at']);
      return [main(encode('deletion', K.listenerSingleton(id, 'DELETION'), { listenerId: id, requestedAt: isoReq(r['requested_at']), dueAt, ...present({ cancelledAt }) },
        cancelledAt ? {} : { gsi: K.G4('deletions', dueAt, id) }))];
    },
  }],
  counts: [
    { type: 'deletion' },
    { label: 'account_deletions pending → on Q#deletions', type: 'deletion', where: (i) => i['G4PK'] === 'Q#deletions', sql: 'SELECT count(*)::int AS n FROM account_deletions WHERE cancelled_at IS NULL' },
  ],
  back: [{
    pgTable: 'account_deletions', pk: ['listener_id'], match: (i) => i['t'] === 'deletion',
    toRow: (i) => ({ listener_id: i['listenerId'], requested_at: i['requestedAt'], due_at: i['dueAt'], cancelled_at: i['cancelledAt'] ?? null }),
  }],
};

const rateCounters: TableSpec = {
  pgTable: 'rate_counters',
  sources: [{
    name: 'ac.rate-counters', keys: ['key', 'ws'],
    sql: `SELECT key, to_char(window_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS ws, window_start, count FROM rate_counters`,
    // codes.ts bumpRateCounter: `RATE#<key>/<windowStart>` in sm-events, TTL windowStart + 3 days.
    map: (r) => {
      const w = isoReq(r['window_start']);
      return [events(encode('rate', K.ev.rate(s(r, 'key'), w), { count: numReq(r['count']), windowStart: w }, { ttl: ttlFrom(w, 3 * DAY) }))];
    },
  }],
  counts: [{ type: 'rate' }],
  back: [{
    pgTable: 'rate_counters', pk: ['key', 'window_start'], match: (i) => i['t'] === 'rate',
    toRow: (i) => ({ key: after('RATE#', i['PK']), window_start: i['windowStart'], count: i['count'] }),
  }],
};

const dailyActive: TableSpec = {
  pgTable: 'daily_active',
  sources: [{
    name: 'ac.daily-active', keys: ['day', 'listener_id'],
    sql: 'SELECT day::text AS day, listener_id::text AS listener_id FROM daily_active',
    // sessions.ts listenerForTokenRows: `DA#<KL day>/<listener>` in sm-events, TTL first use + 400 days (from the day here).
    // Sessions get no `activeDay`: the next request finds the marker already there (a no-op put) and sets it.
    map: (r) => {
      const d = dayOf(r['day'])!;
      return [events(encode('dailyActive', K.ev.dailyActive(d, s(r, 'listener_id')), { day: d, listenerId: s(r, 'listener_id') }, { ttl: ttlFrom(klStart(d), 400 * DAY) }))];
    },
  }],
  counts: [{ type: 'dailyActive' }],
  back: [{
    pgTable: 'daily_active', pk: ['day', 'listener_id'], match: (i) => i['t'] === 'dailyActive',
    toRow: (i) => ({ day: i['day'], listener_id: i['listenerId'] }),
  }],
};

// ---------------------------------------------------------------------------------------------------------------
// counter checks (read only)

const mm = (counter: string, it: Item, stored: unknown, recomputed: unknown): Mismatch => ({ counter, key: `${String(it['PK'])}|${String(it['SK'])}`, stored, recomputed });
const sumOf = (xs: readonly Item[], f: (i: Item) => number): number => xs.reduce((n, i) => n + f(i), 0);
const byteLen = (v: unknown): number => (v instanceof Uint8Array ? v.byteLength : 0);

/** One CFG#bytes attribute vs the items it counts (the SUM the code keeps with ADD in each upload / delete transaction). */
function bytesCheck(attr: string, recompute: (ix: ItemIndex) => number): CounterCheck {
  return {
    name: `bytes.${attr}`,
    check: (ix) => {
      const cfg = ix.get('main', K.config('bytes').PK, 'V');
      const stored = Number(cfg?.[attr] ?? 0);
      const want = recompute(ix);
      return stored === want ? [] : [{ counter: `bytes.${attr}`, key: 'CFG#bytes|V', stored, recomputed: want }];
    },
  };
}

const counters: CounterCheck[] = [
  {
    // Lane SG's follow counters on the listener item (kind A): one FOLLOWER# / FOLLOW# edge each (graph-ddb, listeners.ts addFollowCount).
    name: 'listener.followerCount+followingCount',
    check: (ix) => {
      const out: Mismatch[] = [];
      for (const l of ix.ofType('listener')) {
        const part = ix.partition('main', String(l['PK']));
        const followers = part.filter((i) => String(i['SK']).startsWith(K.LISTENER_SK.followers)).length;
        const following = part.filter((i) => String(i['SK']).startsWith(K.LISTENER_SK.follows)).length;
        if (Number(l['followerCount'] ?? 0) !== followers) out.push(mm('listener.followerCount', l, l['followerCount'], followers));
        if (Number(l['followingCount'] ?? 0) !== following) out.push(mm('listener.followingCount', l, l['followingCount'], following));
      }
      return out;
    },
  },
  // `listenedMs` is NOT recomputed: library/ddb/listened.ts adds clamped deltas (max 0) and the pre-M21 total came from a
  // one-time backfill, so no rule over the LDAY items gives the stored value; it is copied from listeners.listened_ms.
  {
    // The email's uniqueness item (§5): one per listener, owned by it.
    name: 'listener.U#EMAIL',
    check: (ix) => ix.ofType('listener').flatMap((l) => {
      const u = K.U.email(String(l['email']));
      const owner = ix.get('main', u.PK, u.SK)?.['owner'];
      return owner === l['id'] ? [] : [mm('listener.U#EMAIL', l, owner ?? null, l['id'])];
    }),
  },
  {
    // The session's copies of the listener (common.ts refreshSessionCopies), and its pointer when it is a chain's live end.
    name: 'session.copies',
    check: (ix) => ix.ofType('session').flatMap((sx) => {
      const l = ix.get('main', K.listener(String(sx['listenerId'])).PK, 'PROFILE');
      if (!l) return [mm('session.listener', sx, sx['listenerId'], null)];
      const out: Mismatch[] = [];
      const pairs: [string, unknown, unknown][] = [
        ['email', sx['email'], l['email']], ['displayName', sx['displayName'], l['displayName']],
        ['listenerCreatedAt', sx['listenerCreatedAt'], l['createdAt']], ['suspendedAt', sx['suspendedAt'] ?? null, l['suspendedAt'] ?? null],
      ];
      for (const [name, a, b] of pairs) if (a !== b) out.push(mm(`session.${name}`, sx, a, b));
      if (!sx['replacedBy']) {
        const p = K.listenerSessionPtr(String(sx['listenerId']), String(sx['publicId']));
        if (ix.get('main', p.PK, p.SK)?.['tokenHash'] !== sx['tokenHash']) out.push(mm('session.pointer', sx, null, sx['tokenHash']));
      }
      return out;
    }),
  },
  bytesCheck('avatarBytes', (ix) => sumOf(ix.ofType('listener'), (l) => Number(l['avatarBytes'] ?? 0))),
  bytesCheck('feedbackImageBytes', (ix) => sumOf(ix.ofType('feedbackImage'), (i) => byteLen(i['bytes']))),
  bytesCheck('commentImageBytes', (ix) => sumOf(ix.ofType('comment'), (i) => Number(i['imageBytes'] ?? 0))),
  bytesCheck('heldImageBytes', (ix) => sumOf(ix.ofType('heldComment'), (i) => Number(i['imageBytes'] ?? 0))),
  bytesCheck('statusPhotoBytes', (ix) => sumOf(ix.ofType('statusPhoto'), (i) => Number(i['bytes'] ?? 0))),
  bytesCheck('hostedAudioBytes', (ix) => sumOf(ix.ofType('hostedEpisode').filter((e) => !e['deletedAt']), (e) => Number(e['audioBytes'] ?? 0))),
];

export const lane: LaneModule = {
  lane: 'ac',
  tables: [
    listeners, sessions, emailCodes, emailChanges, pushTokens, pushPrefs, pushSent, pushLikeWindows, notifyShowPrefs,
    statusPushLog, weeklyDigests, feedback, feedbackImages, errorReports, listenerInterests, recFeedback, stickerPlacements,
    queues, listenerIdentities, accountDeletions, rateCounters, dailyActive,
  ],
  counters,
};
