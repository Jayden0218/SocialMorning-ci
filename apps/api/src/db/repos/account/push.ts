// Sends new-episode push notifications through Expo, never twice to one device.
/**
 * M10b US3 — notifications that are actually sent (research R4).
 *
 * The hourly rebuild's `feeds` step already re-reads every followed feed. An episode it
 * registers for the first time, published in the last 48 h, is "new": each follower with
 * "New episodes" on gets one notification per show per cycle (the newest), through Expo's
 * free push service. `push_sent`'s primary key is the "never twice" rule (guard G-N1): a
 * device is told about an episode once, whatever reruns or retries happen.
 */
import type { Db } from '../../db.ts';
import { shouldPush, type PushKind, type PushPrefs } from '@socialmorning/social-core';

export const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
export const NEW_WINDOW_HOURS = 48;
const BATCH = 100;

export type PushMessage = {
  to: string; title: string; body: string; data: Record<string, string>; sound: 'default';
  /** M22: Android channel and the key that makes a later push replace an earlier one. */
  channelId?: string; tag?: string; threadId?: string;
};

export async function saveToken(db: Db, listenerId: string, token: string, platform: 'ios' | 'android'): Promise<void> {
  await db.query(
    `INSERT INTO push_tokens (token, listener_id, platform) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET listener_id = excluded.listener_id, platform = excluded.platform`,
    [token, listenerId, platform],
  );
}

export async function deleteToken(db: Db, listenerId: string, token: string): Promise<void> {
  await db.query('DELETE FROM push_tokens WHERE token = $1 AND listener_id = $2', [token, listenerId]);
}

export type PrefsPatch = {
  newEpisodes?: boolean; popular?: boolean;
  replies?: boolean; likes?: boolean; follows?: boolean; mentions?: boolean; statuses?: boolean; digest?: boolean;
};

const PREF_COLUMNS: Record<keyof PrefsPatch, string> = {
  newEpisodes: 'new_episodes', popular: 'popular', replies: 'replies', likes: 'likes',
  follows: 'follows', mentions: 'mentions', statuses: 'statuses', digest: 'digest',
};

/** Saves only the switches sent; the rest keep their value (all default on). */
export async function setPrefs(db: Db, listenerId: string, p: PrefsPatch): Promise<void> {
  const keys = (Object.keys(PREF_COLUMNS) as (keyof PrefsPatch)[]).filter((k) => typeof p[k] === 'boolean');
  await db.query('INSERT INTO push_prefs (listener_id) VALUES ($1) ON CONFLICT (listener_id) DO NOTHING', [listenerId]);
  if (keys.length === 0) return;
  const sets = keys.map((k, i) => `${PREF_COLUMNS[k]} = $${i + 2}`).join(', ');
  await db.query(`UPDATE push_prefs SET ${sets} WHERE listener_id = $1`, [listenerId, ...keys.map((k) => p[k])]);
}

export async function getPrefs(db: Db, listenerId: string): Promise<Required<PrefsPatch>> {
  const [r] = await db.query<{ new_episodes: boolean; popular: boolean; replies: boolean; likes: boolean; follows: boolean; mentions: boolean; statuses: boolean; digest: boolean }>(
    'SELECT * FROM push_prefs WHERE listener_id = $1', [listenerId]);
  return {
    newEpisodes: r?.new_episodes ?? true, popular: r?.popular ?? true, replies: r?.replies ?? true, likes: r?.likes ?? true,
    follows: r?.follows ?? true, mentions: r?.mentions ?? true, statuses: r?.statuses ?? true, digest: r?.digest ?? true,
  };
}

/**
 * Sends through Expo in batches of 100. A `DeviceNotRegistered` answer deletes that token
 * (the app was uninstalled); any other error leaves it for the next cycle.
 */
export async function sendExpo(db: Db, f: typeof fetch, messages: readonly PushMessage[]): Promise<{ sent: number; dropped: number }> {
  let sent = 0;
  let dropped = 0;
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    const res = await f(EXPO_PUSH, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(batch) });
    if (!res.ok) throw new Error(`Expo push answered ${res.status}`);
    const body = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    const tickets = body.data ?? [];
    for (let j = 0; j < batch.length; j++) {
      const t = tickets[j];
      const token = batch[j]!.to;
      if (t?.status === 'ok') { sent++; await db.query('UPDATE push_tokens SET last_ok_at = now() WHERE token = $1', [token]); }
      else if (t?.details?.error === 'DeviceNotRegistered') { dropped++; await db.query('DELETE FROM push_tokens WHERE token = $1', [token]); }
    }
  }
  return { sent, dropped };
}

/**
 * One new episode of one show → every follower's devices, once. The `push_sent` insert
 * happens before sending and only for listeners not already told (G-N1).
 */
export async function fanOutNewEpisode(db: Db, f: typeof fetch, ep: { id: string; feedUrl: string; title: string; showTitle: string }): Promise<{ sent: number; dropped: number }> {
  const told = await db.query<{ listener_id: string }>(
    `INSERT INTO push_sent (listener_id, episode_id, kind)
     SELECT s.listener_id, $2, 'new_episode' FROM subscriptions s
     LEFT JOIN push_prefs p ON p.listener_id = s.listener_id
     LEFT JOIN notify_show_prefs n ON n.listener_id = s.listener_id AND n.feed_url = s.feed_url
     WHERE s.feed_url = $1 AND s.deleted_at IS NULL AND COALESCE(p.new_episodes, true)
       AND COALESCE(n.enabled, true) -- M12 FR-093: this show turned off
     ON CONFLICT (listener_id, episode_id, kind) DO NOTHING
     RETURNING listener_id`,
    [ep.feedUrl, ep.id],
  );
  if (told.length === 0) return { sent: 0, dropped: 0 };
  const tokens = await db.query<{ token: string }>('SELECT token FROM push_tokens WHERE listener_id = ANY($1::uuid[])', [told.map((t) => t.listener_id)]);
  const messages = tokens.map((t): PushMessage => ({ to: t.token, title: ep.showTitle || 'New episode', body: ep.title, data: { episodeId: ep.id, kind: 'new_episode' }, sound: 'default' }));
  return messages.length === 0 ? { sent: 0, dropped: 0 } : sendExpo(db, f, messages);
}

/** The day's pick → listeners with "Popular content" on, at most once a day each. */
export async function sendPopular(db: Db, f: typeof fetch, pick: { id: string; title: string; why?: string }): Promise<{ sent: number; dropped: number }> {
  const told = await db.query<{ listener_id: string }>(
    `INSERT INTO push_sent (listener_id, episode_id, kind)
     SELECT t.listener_id, $1, 'popular' FROM (SELECT DISTINCT listener_id FROM push_tokens) t
     LEFT JOIN push_prefs p ON p.listener_id = t.listener_id
     WHERE COALESCE(p.popular, true)
       AND NOT EXISTS (SELECT 1 FROM push_sent x WHERE x.listener_id = t.listener_id AND x.kind = 'popular' AND x.sent_at > now() - interval '1 day')
     ON CONFLICT (listener_id, episode_id, kind) DO NOTHING
     RETURNING listener_id`,
    [pick.id],
  );
  if (told.length === 0) return { sent: 0, dropped: 0 };
  const tokens = await db.query<{ token: string }>('SELECT token FROM push_tokens WHERE listener_id = ANY($1::uuid[])', [told.map((t) => t.listener_id)]);
  const messages = tokens.map((t): PushMessage => ({ to: t.token, title: "Today's pick", body: pick.why ? `${pick.title} — ${pick.why}` : pick.title, data: { episodeId: pick.id, kind: 'popular' }, sound: 'default' }));
  return messages.length === 0 ? { sent: 0, dropped: 0 } : sendExpo(db, f, messages);
}

// ---- M22 US1/US3/US6: pushes for interactions (specs/023 research R2) ----

/** The fetch social pushes use. `createApp` sets it from `deps.pushFetch` so tests can fake Expo. */
let socialFetch: typeof fetch = (...a) => fetch(...a);
export function setSocialPushFetch(f: typeof fetch): void { socialFetch = f; }

export type SocialNotice = { recipientId: string; actorId: string; kind: PushKind; ref: Record<string, string> };

/** The in-app place a push opens (contracts/api.md "Push"). */
export function hrefFor(n: SocialNotice): string {
  const r = n.ref;
  switch (n.kind) {
    case 'reply': case 'mention': case 'like':
      return `/comments/thread/${r['parentId'] ?? r['commentId']}`;
    case 'follow': return `/profile/${n.actorId}`;
    case 'like_post_comment': case 'like_post_like': return `/like/${r['ownerId']}/${r['episodeId']}`;
    default: return `/status/${r['postId']}`;
  }
}

/** The thread a notice belongs to, for "Mute this" (US3) and for grouping likes. */
export function threadOf(n: SocialNotice): { kind: 'comment' | 'like_post'; key: string } | null {
  const r = n.ref;
  if (n.kind === 'like_post_comment' || n.kind === 'like_post_like') return { kind: 'like_post', key: `${r['ownerId']}:${r['episodeId']}` };
  if (n.kind === 'reply' || n.kind === 'mention') return { kind: 'comment', key: r['parentId'] ?? r['commentId']! };
  if (n.kind === 'like') return { kind: 'comment', key: r['commentId']! };
  return null;
}

function words(kind: PushKind, name: string, count: number, excerpt: string | null): { title: string; body: string } {
  const who = count > 1 ? `${name} and ${count - 1} other${count - 1 === 1 ? '' : 's'}` : name;
  switch (kind) {
    case 'reply': return { title: `${name} replied`, body: excerpt ?? 'to your comment' };
    case 'mention': return { title: `${name} mentioned you`, body: excerpt ?? '' };
    case 'like': return { title: `${who} liked your comment`, body: excerpt ?? '' };
    case 'follow': return { title: `${name} followed you`, body: 'Tap to see their profile' };
    case 'like_post_comment': return { title: `${name} commented on your like`, body: excerpt ?? '' };
    case 'like_post_like': return { title: `${who} reacted to your like`, body: '' };
    case 'status_reply': return { title: `${name} replied to your status`, body: excerpt ?? '' };
    case 'status_reaction': return { title: `${who} reacted to your status`, body: '' };
    case 'status_milestone': return { title: 'Your status got 100 reactions', body: 'Tap to see who' };
  }
}

/**
 * One notice → at most one push to each of the recipient's devices. Never throws: a push that
 * fails must not undo the act it reports. Returns how many devices were told.
 */
export async function pushFor(db: Db, n: SocialNotice, now = Date.now()): Promise<number> {
  try {
    const tokens = await db.query<{ token: string }>('SELECT token FROM push_tokens WHERE listener_id = $1', [n.recipientId]);
    if (tokens.length === 0) return 0;
    const prefs = await getPrefs(db, n.recipientId);
    const thread = threadOf(n);
    const [rel] = await db.query<{ blocked: boolean; muted: boolean; thread_muted: boolean; likes_off: boolean; name: string; excerpt: string | null }>(
      `SELECT EXISTS (SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)) AS blocked,
              EXISTS (SELECT 1 FROM listener_mutes WHERE muter_id = $1 AND muted_id = $2) AS muted,
              EXISTS (SELECT 1 FROM muted_threads WHERE listener_id = $1 AND thread_kind = $3 AND thread_key = $4) AS thread_muted,
              COALESCE((SELECT like_notices_off FROM comments WHERE id::text = $5), false) AS likes_off,
              (SELECT display_name FROM listeners WHERE id = $2) AS name,
              (SELECT left(body, 120) FROM comments WHERE id::text = $5) AS excerpt`,
      [n.recipientId, n.actorId, thread?.kind ?? '', thread?.key ?? '', n.ref['commentId'] ?? ''],
    );
    const groupKey = thread && n.kind !== 'reply' && n.kind !== 'mention' ? `${n.kind}:${thread.key}` : `${n.kind}:${n.ref['postId'] ?? n.ref['commentId'] ?? n.actorId}`;
    let window: { firstAt: number; count: number } | null = null;
    if (n.kind === 'like' || n.kind === 'like_post_like' || n.kind === 'status_reaction') {
      const [w] = await db.query<{ first_at: string | Date; count: number }>('SELECT first_at, count FROM push_like_windows WHERE listener_id = $1 AND target_key = $2', [n.recipientId, groupKey]);
      window = w ? { firstAt: new Date(w.first_at).getTime(), count: Number(w.count) } : null;
    }
    const decision = shouldPush(
      { kind: n.kind, actorId: n.actorId, recipientId: n.recipientId, at: now },
      { replies: prefs.replies, likes: prefs.likes, follows: prefs.follows, mentions: prefs.mentions, statuses: prefs.statuses } satisfies PushPrefs,
      { blocked: rel?.blocked === true, muted: rel?.muted === true, threadMuted: rel?.thread_muted === true, likeNoticesOff: rel?.likes_off === true },
      window,
    );
    if (!decision.send) return 0;
    if (window !== null || n.kind === 'like' || n.kind === 'like_post_like' || n.kind === 'status_reaction') {
      if (decision.grouped) await db.query('UPDATE push_like_windows SET count = count + 1 WHERE listener_id = $1 AND target_key = $2', [n.recipientId, groupKey]);
      else await db.query(
        `INSERT INTO push_like_windows (listener_id, target_key, first_at, count) VALUES ($1, $2, to_timestamp($3 / 1000.0), 1)
         ON CONFLICT (listener_id, target_key) DO UPDATE SET first_at = excluded.first_at, count = 1`,
        [n.recipientId, groupKey, now]);
    }
    const w = words(n.kind, rel?.name ?? 'Someone', decision.grouped ? decision.count : 1, n.ref['excerpt'] ?? rel?.excerpt ?? null);
    const href = hrefFor(n);
    const messages = tokens.map((t): PushMessage => ({
      to: t.token, title: w.title, body: w.body, sound: 'default',
      data: { kind: n.kind, href, ...(n.ref['episodeId'] ? { episodeId: n.ref['episodeId'] } : {}) },
      channelId: 'social', tag: groupKey, threadId: groupKey,
    }));
    return (await sendExpo(db, socialFetch, messages)).sent;
  } catch (e) {
    console.warn(`[push] social push skipped: ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  }
}

// ---- M22 US6 (FR-022): a push to followers when someone posts a status ----

/** A poster's statuses push at most this many times a day (Kuala Lumpur day). */
export const STATUS_PUSHES_PER_DAY = 5;

/**
 * One new status → each follower with "Statuses" on gets one push, unless the follower and the
 * poster blocked each other (either way) or the follower muted them. `status_push_log` counts the
 * poster's pushing statuses per day; the 6th and later post normally but push no one. Never
 * throws (like `pushFor`).
 */
export async function pushNewStatus(db: Db, authorId: string, postId: string, isVoice: boolean): Promise<number> {
  try {
    const [slot] = await db.query<{ count: number }>(
      `INSERT INTO status_push_log (author_id, day, count) VALUES ($1, ((now() AT TIME ZONE 'UTC') + interval '8 hours')::date, 1)
       ON CONFLICT (author_id, day) DO UPDATE SET count = status_push_log.count + 1
       RETURNING count`,
      [authorId],
    );
    if (Number(slot?.count ?? 0) > STATUS_PUSHES_PER_DAY) return 0;
    const rows = await db.query<{ token: string; name: string }>(
      `SELECT t.token, a.display_name AS name FROM follows f
         JOIN push_tokens t ON t.listener_id = f.follower_id
         JOIN listeners a ON a.id = f.followed_id
         LEFT JOIN push_prefs p ON p.listener_id = f.follower_id
        WHERE f.followed_id = $1 AND f.follower_id <> $1 AND COALESCE(p.statuses, true)
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = f.follower_id AND b.blocked_id = $1) OR (b.blocker_id = $1 AND b.blocked_id = f.follower_id))
          AND NOT EXISTS (SELECT 1 FROM listener_mutes m WHERE m.muter_id = f.follower_id AND m.muted_id = $1)`,
      [authorId],
    );
    if (rows.length === 0) return 0;
    const href = `/status/${postId}`;
    const messages = rows.map((r): PushMessage => ({
      to: r.token, title: `${r.name || 'Someone'} posted a status`, body: isVoice ? 'Tap to listen' : 'Tap to read', sound: 'default',
      data: { kind: 'status_new', href }, channelId: 'social', tag: `status_new:${authorId}`, threadId: `status_new:${authorId}`,
    }));
    return (await sendExpo(db, socialFetch, messages)).sent;
  } catch (e) {
    console.warn(`[push] status push skipped: ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  }
}
