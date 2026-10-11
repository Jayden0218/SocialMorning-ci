// Push tokens, switches, the "never twice" record, social pushes, the status fan-out (outbox), the weekly digest and per-show switches on DynamoDB.
/**
 * M26 lane AC (AC-T06, AC-T07; patterns AC-100…AC-123, AC-139, AC-140).
 * - Tokens: `L#<listener>/PUSHTOK#<sha(token)>` (G4 `Q#pushtok` — every token holder, for the daily pick)
 *   plus `U#PUSHTOK#<sha(token)>` → owner, because a token moves to whoever registered it last and
 *   `sendExpo` knows only the token (dead tokens are deleted, `lastOkAt` is kept on the owner item).
 * - "Never twice" (guard G-N1): `PUSHSENT#<listener>/<episode>#<kind>` in sm-events, put with
 *   `attribute_not_exists(PK)` BEFORE sending — only a successful first put sends (data-model §7 D).
 * - New-episode and popular pushes already run inside the hourly job (`/v1/internal` steps), so they stay
 *   there; the one fan-out that ran inside a REQUEST — a new status to every follower — becomes an outbox
 *   entry (`push:status`, data-model §9) drained after the commit.
 * - Weekly digest: `L#<listener>/DIGEST#<isoWeek>` — the key is the once-per-ISO-week rule (G-M22-13);
 *   G4 `Q#digests` by sent time for the 28-day sweep.
 * Lanes still on Postgres (subscriptions, follows, blocks, entitlements, episodes) are read in foreign.ts.
 */
import { shouldPush, type PushPrefs } from '@socialmorning/social-core';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, type Store } from '../../../ddb/store.ts';
import { isConditionFailed, withVersionRetry } from '../../../ddb/retry.ts';
import { TxCancelled } from '../../../ddb/tx.ts';
import { enqueue, registerHandler, type OutboxEntry } from '../../../../jobs/outbox.ts';
import {
  EXPO_PUSH, STATUS_PUSHES_PER_DAY, hrefFor, socialPushFetch, threadOf, words,
  type PrefsPatch, type PushMessage, type SocialNotice,
} from '../push.ts';
import { DEFAULT_TZ, DIGEST_KEEP_DAYS, isoWeek, localClock, validTz, type DigestCard } from '../digest.ts';
import type { NotifyShowRow } from '../notify-shows.ts';
import { adel, aput, DAY_MS, getListener, iso, klDay, nowMs, partitionItems, queueBefore, txa, unlessCondition, upd, type Hybrid, pgOf } from './common.ts';
import { digestPick, episodesByIds, liveSubscribers, liveSubscriptionsWithTitles, plusMembers, pushRelations, statusFollowers } from './foreign.ts';

const BATCH = 100;
const PREF_KEYS = ['newEpisodes', 'popular', 'replies', 'likes', 'follows', 'mentions', 'statuses', 'digest', 'system'] as const;

/** The tokens of one listener (strongly read from their own partition). */
async function tokensOf(h: Hybrid, listenerId: string): Promise<string[]> {
  return (await partitionItems(h, K.L(listenerId), K.LISTENER_SK.pushTokens)).map((i) => String(i['token']));
}

/** A conditional first put: true when it was new (the "ON CONFLICT DO NOTHING RETURNING" outcome). */
async function putNew(store: Store, table: 'main' | 'events', item: Record<string, unknown>): Promise<boolean> {
  try { await aput(store, table, item, { condition: 'attribute_not_exists(PK)' }); return true; } catch (e) { if (isConditionFailed(e)) return false; throw e; }
}

const pushSentItem = (now: number, listenerId: string, episodeId: string, kind: string) =>
  encode('pushSent', K.ev.pushSent(listenerId, episodeId, kind), { listenerId, episodeId, kind, sentAt: iso(now) }, { ttl: ttlAfter(now, 31 * DAY_MS) });

export async function saveToken(h: Hybrid, listenerId: string, token: string, platform: 'ios' | 'android'): Promise<void> {
  await withVersionRetry(async () => {
    const own = await get(h.store, 'main', K.pushTokenOwner(token));
    const old = own?.['owner'] as string | undefined;
    const createdAt = iso(nowMs(h));
    const t = txa(h.store)
      .put('main', encode('pushTokenOwner', K.pushTokenOwner(token), { owner: listenerId, token }), own ? { condition: 'owner = :o', values: { ':o': old } } : { condition: 'attribute_not_exists(PK)' })
      .put('main', encode('pushToken', K.pushToken(listenerId, token), { token, platform, listenerId, createdAt }, { gsi: K.G4('pushtok', createdAt, `${listenerId}#${K.sha(token)}`) }));
    if (old && old !== listenerId) t.delete('main', K.pushToken(old, token));
    await t.commit();
  });
}

export async function deleteToken(h: Hybrid, listenerId: string, token: string): Promise<void> {
  try {
    await txa(h.store).delete('main', K.pushToken(listenerId, token), { condition: 'attribute_exists(PK)' })
      .delete('main', K.pushTokenOwner(token), { condition: 'owner = :me', values: { ':me': listenerId } }).commit();
  } catch (e) { if (!(e instanceof TxCancelled)) throw e; }
}

const PREFS = (id: string) => K.listenerSingleton(id, 'PUSHPREF');

export async function setPrefs(h: Hybrid, listenerId: string, p: PrefsPatch): Promise<void> {
  const keys = PREF_KEYS.filter((k) => typeof p[k] === 'boolean');
  await upd(h.store, 'main', PREFS(listenerId), {
    update: `SET t = :t${keys.map((k) => `, ${k} = :${k}`).join('')}`,
    values: { ':t': 'pushPrefs', ...Object.fromEntries(keys.map((k) => [`:${k}`, p[k]])) },
  });
}

export async function getPrefs(h: Hybrid, listenerId: string): Promise<Required<PrefsPatch>> {
  const r = await get(h.store, 'main', PREFS(listenerId));
  return Object.fromEntries(PREF_KEYS.map((k) => [k, (r?.[k] as boolean | undefined) ?? true])) as Required<PrefsPatch>;
}

export async function sendExpo(h: Hybrid, f: typeof fetch, messages: readonly PushMessage[]): Promise<{ sent: number; dropped: number }> {
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
      if (t?.status === 'ok') {
        sent++;
        await unlessCondition(upd(h.store, 'main', K.pushTokenOwner(token), { update: 'SET lastOkAt = :now', condition: 'attribute_exists(PK)', values: { ':now': iso(nowMs(h)) } }));
      } else if (t?.details?.error === 'DeviceNotRegistered') {
        dropped++;
        const own = await get(h.store, 'main', K.pushTokenOwner(token));
        if (own) {
          try { await txa(h.store).delete('main', K.pushTokenOwner(token)).delete('main', K.pushToken(String(own['owner']), token)).commit(); } catch (e) { if (!(e instanceof TxCancelled)) throw e; }
        }
      }
    }
  }
  return { sent, dropped };
}

async function sendTo(h: Hybrid, f: typeof fetch, listenerIds: readonly string[], make: (token: string) => PushMessage): Promise<{ sent: number; dropped: number }> {
  const messages: PushMessage[] = [];
  for (const id of listenerIds) for (const token of await tokensOf(h, id)) messages.push(make(token));
  return messages.length === 0 ? { sent: 0, dropped: 0 } : sendExpo(h, f, messages);
}

/** One new episode → each subscriber with "New episodes" on and this show not turned off, once (G-N1). */
export async function fanOutNewEpisode(h: Hybrid, f: typeof fetch, ep: { id: string; feedUrl: string; title: string; showTitle: string }): Promise<{ sent: number; dropped: number }> {
  const now = nowMs(h);
  const told: string[] = [];
  for (const id of await liveSubscribers(h.pg, ep.feedUrl)) {
    if (!(await getPrefs(h, id)).newEpisodes) continue;
    const show = await get(h.store, 'main', K.notifyShow(id, ep.feedUrl));
    if (show && show['enabled'] === false) continue; // M12 FR-093
    if (await putNew(h.store, 'events', pushSentItem(now, id, ep.id, 'new_episode'))) told.push(id);
  }
  if (told.length === 0) return { sent: 0, dropped: 0 };
  return sendTo(h, f, told, (to) => ({ to, title: ep.showTitle || 'New episode', body: ep.title, data: { episodeId: ep.id, kind: 'new_episode' }, sound: 'default' }));
}

/** The day's pick → token holders with "Popular content" on, at most once a day each (`lastPopularAt` on the switches item). */
export async function sendPopular(h: Hybrid, f: typeof fetch, pick: { id: string; title: string; why?: string }): Promise<{ sent: number; dropped: number }> {
  const now = nowMs(h);
  const holders = new Set((await queryAll(h.store, 'main', {
    IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q', ExpressionAttributeValues: { ':q': 'Q#pushtok' },
  })).items.map((i) => String(i['listenerId'])));
  const told: string[] = [];
  for (const id of holders) {
    if (!(await getPrefs(h, id)).popular) continue;
    try {
      await txa(h.store)
        .update('main', PREFS(id), { update: 'SET t = :t, lastPopularAt = :now', condition: 'attribute_not_exists(lastPopularAt) OR lastPopularAt < :cut', values: { ':t': 'pushPrefs', ':now': iso(now), ':cut': iso(now - DAY_MS) } })
        .put('events', pushSentItem(now, id, pick.id, 'popular'), { condition: 'attribute_not_exists(PK)' })
        .commit();
      told.push(id);
    } catch (e) { if (!(e instanceof TxCancelled)) throw e; }
  }
  if (told.length === 0) return { sent: 0, dropped: 0 };
  return sendTo(h, f, told, (to) => ({ to, title: "Today's pick", body: pick.why ? `${pick.title} — ${pick.why}` : pick.title, data: { episodeId: pick.id, kind: 'popular' }, sound: 'default' }));
}

const LIKE_KINDS = new Set(['like', 'like_post_like', 'status_reaction']);

/** One social notice → at most one push to each of the recipient's devices; never throws (as the Postgres version). */
export async function pushFor(h: Hybrid, n: SocialNotice, now = Date.now()): Promise<number> {
  try {
    const tokens = await tokensOf(h, n.recipientId);
    if (tokens.length === 0) return 0;
    const prefs = await getPrefs(h, n.recipientId);
    const thread = threadOf(n);
    const rel = await pushRelations(h.pg, n.recipientId, n.actorId, thread?.kind ?? '', thread?.key ?? '', n.ref['commentId'] ?? '');
    const actor = await getListener(h, n.actorId);
    const groupKey = thread && n.kind !== 'reply' && n.kind !== 'mention' ? `${n.kind}:${thread.key}` : `${n.kind}:${n.ref['postId'] ?? n.ref['commentId'] ?? n.actorId}`;
    let window: { firstAt: number; count: number } | null = null;
    if (LIKE_KINDS.has(n.kind)) {
      const w = await get(h.store, 'main', K.pushWindow(n.recipientId, groupKey));
      window = w ? { firstAt: Date.parse(String(w['firstAt'])), count: Number(w['count']) } : null;
    }
    const decision = shouldPush(
      { kind: n.kind, actorId: n.actorId, recipientId: n.recipientId, at: now },
      { replies: prefs.replies, likes: prefs.likes, follows: prefs.follows, mentions: prefs.mentions, statuses: prefs.statuses, system: prefs.system } satisfies PushPrefs,
      { blocked: rel?.blocked === true, muted: rel?.muted === true, threadMuted: rel?.thread_muted === true, likeNoticesOff: rel?.likes_off === true },
      window,
    );
    if (!decision.send) return 0;
    if (window !== null || LIKE_KINDS.has(n.kind)) {
      if (decision.grouped) await upd(h.store, 'main', K.pushWindow(n.recipientId, groupKey), { update: 'ADD count :one', values: { ':one': 1 } });
      else await aput(h.store, 'main', encode('pushWindow', K.pushWindow(n.recipientId, groupKey), { groupKey, firstAt: iso(now), count: 1 }, { ttl: ttlAfter(now, 7 * DAY_MS) }));
    }
    const w = words(n.kind, actor?.displayName ?? 'Someone', decision.grouped ? decision.count : 1, n.ref['excerpt'] ?? rel?.excerpt ?? null);
    const href = hrefFor(n);
    const messages = tokens.map((t): PushMessage => ({
      to: t, title: w.title, body: w.body, sound: 'default',
      data: { kind: n.kind, href, ...(n.ref['episodeId'] ? { episodeId: n.ref['episodeId'] } : {}) },
      channelId: 'social', tag: groupKey, threadId: groupKey,
    }));
    return (await sendExpo(h, socialPushFetch(), messages)).sent;
  } catch (e) {
    console.warn(`[push] social push skipped: ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  }
}

/**
 * M22 US6: a new status → followers. The request only queues the work (one outbox item in its own
 * transaction); `push:status` below sends it after the commit. Never throws (as the Postgres version).
 */
export async function pushNewStatus(h: Hybrid, authorId: string, postId: string, isVoice: boolean): Promise<number> {
  try {
    const t = txa(h.store);
    enqueue(t.raw, h.store, { kind: 'push:status', payload: { authorId, postId, isVoice } });
    await t.commit();
  } catch (e) {
    console.warn(`[push] status push skipped: ${e instanceof Error ? e.message : String(e)}`);
  }
  return 0;
}

/** The outbox handler. At most once: the entry's `U#APPLIED` marker is claimed first (a push is never sent twice). */
export async function statusPushHandler(store: Store, entry: OutboxEntry): Promise<void> {
  const h: Hybrid = { store, pg: pgOf(store) };
  const now = nowMs(h);
  if (!(await putNew(store, 'main', encode('unique', K.U.applied(entry.id), { owner: entry.kind }, { ttl: ttlAfter(now, 2 * DAY_MS) })))) return;
  const { authorId, postId, isVoice } = entry.payload as { authorId: string; postId: string; isVoice: boolean };
  try {
    const slot = await upd(store, 'events', K.statusPushLog(authorId, klDay(now)), {
      update: 'SET t = :t, ttl = :ttl ADD count :one', values: { ':t': 'statusPushLog', ':ttl': ttlAfter(now, 3 * DAY_MS), ':one': 1 }, returnValues: 'UPDATED_NEW',
    });
    if (Number(slot?.['count'] ?? 0) > STATUS_PUSHES_PER_DAY) return;
    const author = await getListener(h, authorId);
    const followers: string[] = [];
    for (const id of await statusFollowers(h.pg, authorId)) if ((await getPrefs(h, id)).statuses) followers.push(id);
    const href = `/status/${postId}`;
    await sendTo(h, socialPushFetch(), followers, (to) => ({
      to, title: `${author?.displayName || 'Someone'} posted a status`, body: isVoice ? 'Tap to listen' : 'Tap to read', sound: 'default',
      data: { kind: 'status_new', href }, channelId: 'social', tag: `status_new:${authorId}`, threadId: `status_new:${authorId}`,
    }));
  } catch (e) {
    console.warn(`[push] status push skipped: ${e instanceof Error ? e.message : String(e)}`);
  }
}
registerHandler('push:status', statusPushHandler);

// ---- the weekly digest (AC-100…AC-107) ----

export async function runDigests(h: Hybrid, pushFetch: typeof fetch, now: Date = new Date()): Promise<{ made: number; pushed: number; swept: number }> {
  const real = nowMs(h);
  let swept = 0;
  for (const it of await queueBefore(h, 'digests', iso(real - DIGEST_KEEP_DAYS * DAY_MS))) {
    if (await adel(h.store, 'main', { PK: String(it['PK']), SK: String(it['SK']) }, { returnOld: true })) swept++;
  }
  let made = 0;
  let pushed = 0;
  for (const id of await plusMembers(h.pg, now)) {
    const l = await getListener(h, id);
    if (!l || l.suspendedAt || l.hiddenAt) continue;
    if (!(await getPrefs(h, id)).digest) continue;
    const tz = l.tz && validTz(l.tz) ? l.tz : DEFAULT_TZ;
    const c = localClock(now, tz);
    if (c.weekday !== 1 || c.hour !== 12) continue;
    const midnight = new Date(now.getTime() - ((c.hour * 60 + c.minute) * 60 + c.second) * 1000 - (now.getTime() % 1000));
    const from = new Date(midnight.getTime() - 7 * 86_400_000);
    const week = isoWeek(c.y, c.m, c.d);
    const ids = await digestPick(h.pg, id, from, midnight);
    if (ids.length === 0) continue;
    const sentAt = iso(real);
    // G-M22-13: the (listener, ISO week) key — a second run this week writes nothing and sends nothing.
    if (!(await putNew(h.store, 'main', encode('weeklyDigest', K.weeklyDigest(id, week), { isoWeek: week, episodeIds: ids, sentAt }, {
      gsi: K.G4('digests', sentAt, `${id}#${week}`), ttl: ttlAfter(real, (DIGEST_KEEP_DAYS + 1) * DAY_MS),
    })))) continue;
    made++;
    const n = ids.length;
    try {
      pushed += (await sendTo(h, pushFetch, [id], (to) => ({
        to, title: 'Your weekly catch-up', body: `${n} new ${n === 1 ? 'episode' : 'episodes'} from your shows last week`,
        data: { kind: 'digest', href: `/digest/${week}` }, sound: 'default', channelId: 'social', tag: `digest:${week}`, threadId: 'digest',
      }))).sent;
    } catch (e) { console.error('digest push failed; the digest page still has it', e instanceof Error ? e.message : String(e)); }
  }
  return { made, pushed, swept };
}

export async function listDigests(h: Hybrid, listenerId: string): Promise<{ items: { isoWeek: string; episodes: DigestCard[]; sentAt: string }[] }> {
  const cut = iso(nowMs(h) - DIGEST_KEEP_DAYS * DAY_MS);
  const rows = (await partitionItems(h, K.L(listenerId), K.AC_SK.digest))
    .filter((r) => String(r['sentAt']) >= cut)
    .sort((a, b) => (String(a['sentAt']) < String(b['sentAt']) ? 1 : String(a['sentAt']) > String(b['sentAt']) ? -1 : 0));
  const all = [...new Set(rows.flatMap((r) => (r['episodeIds'] as string[] | undefined) ?? []))];
  const eps = await episodesByIds(h.pg, all);
  const byId = new Map(eps.map((e) => [e.id, {
    id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title, enclosureUrl: e.enclosure_url, imageUrl: e.image_url,
    durationMs: e.duration_ms === null ? null : Number(e.duration_ms), publishedAt: e.published_at ? new Date(e.published_at).toISOString() : null,
  } satisfies DigestCard]));
  return {
    items: rows.map((r) => ({
      isoWeek: String(r['isoWeek']),
      episodes: ((r['episodeIds'] as string[] | undefined) ?? []).map((id) => byId.get(id)).filter((x): x is DigestCard => x !== undefined),
      sentAt: String(r['sentAt']),
    })),
  };
}

// ---- per-show new-episode switches (AC-139, AC-140) ----

export async function listNotifyShowRows(h: Hybrid, listenerId: string): Promise<NotifyShowRow[]> {
  const subs = await liveSubscriptionsWithTitles(h.pg, listenerId);
  const prefs = await batchGetAll(h.store, 'main', subs.map((s) => K.notifyShow(listenerId, s.feed_url)));
  const enabled = new Map(prefs.map((p) => [String(p['feedUrl']), p['enabled'] as boolean]));
  return subs.map((s) => ({ feed_url: s.feed_url, title: s.title, enabled: enabled.get(s.feed_url) ?? null }));
}

export async function setNotifyShow(h: Hybrid, listenerId: string, feedUrl: string, enabled: boolean): Promise<void> {
  await aput(h.store, 'main', encode('notifyShow', K.notifyShow(listenerId, feedUrl), { feedUrl, enabled }));
}

// ---- Lane SG, additive (system notices, SG-29): who a system notice is pushed to ----

/** The tokens of one listener (or of every token holder, `Q#pushtok`) whose "System notices" switch is on and who is not suspended. */
export async function systemPushTokens(h: Hybrid, listenerId: string | null): Promise<string[]> {
  const ids = listenerId ? [listenerId] : [...new Set((await queryAll(h.store, 'main', {
    IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q', ExpressionAttributeValues: { ':q': 'Q#pushtok' },
  })).items.map((i) => String(i['listenerId'])))];
  const out: string[] = [];
  for (const id of ids) {
    if (!(await getPrefs(h, id)).system) continue;
    const l = await getListener(h, id);
    if (!l || l.suspendedAt) continue;
    out.push(...(await tokensOf(h, id)));
  }
  return out;
}
