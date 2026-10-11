// Announcements, polls and subscriber milestones on DynamoDB.
/**
 * M26 lane ST, ST-T04 (patterns ST-01…ST-09, ST-74…ST-88, ST-155), data-model.md §3 and "Lane ST changes".
 *
 * Announcements `SH#<feedKey>/ANN#<createdAt>#<id>`. "At most 2 pushed per show per UTC month" (guard G-N2) is one
 * counter item `ANNPUSH#<yyyy-mm>` `{ n }` updated in the publishing transaction with `n < 2` — the old advisory lock
 * plus count. The push goes to the show's live subscribers (lane LB's G2 `SHSUBS#`) whose "New episodes" switch is on
 * (lane AC's switches), each at most once (`PUSHSENT#<listener>/<announcementId>#announcement`, G-N1), right after the
 * commit — as before, a failed send is not a failed publish (Principle IV).
 * Host notices (lane SG's `hostNotices`, SG-T05's other half): a listener's "From hosts" list is READ-MERGED from the
 * announcements of the shows they follow now (`releasedAnnouncements`, filtered by `releaseAt <= now` at read time —
 * so a scheduled announcement needs no timer) plus their milestone copies (`L#<id>/MSTONE#…`). A fan-out at release time
 * would change the answer (a new subscriber would not see past announcements, a former one would keep them), so the
 * read stays a merge — data-model.md "Lane ST changes".
 * Polls `SH#<feedKey>/POLL#<id>` hold their options and live counts (`votes` per option, `voters`) and a version `v`;
 * a vote is `POLLVOTE#<pollId>#<listener>` { options } — ONE item per voter is the old primary key (guard G-P1) — and
 * every vote is one transaction: the vote item + the poll's counts with `v = :seen` and "still open" (G-M20-7).
 * Milestones: the sweep reads the shows with a message (G4 `Q#milestone-msgs`), counts from the show META's
 * `subscriberCount`, finds the Nth live subscriber in G2 `SHSUBS#` order and writes `MILESTONE#<n>` with
 * `attribute_not_exists` (once per show per milestone) + the listener's copy, in one transaction.
 */
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../../../errors.ts';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { withRetry, isConditionFailed, isConflict } from '../../../ddb/retry.ts';
import { getPrefs, sendExpo, type PushMessage } from '../../account/push.ts';
import { PUSHES_PER_MONTH, resetsOn, type Announcement } from '../announcements.ts';
import { MAX_DAYS, type Poll } from '../polls.ts';
import { MILESTONES, RECENT_DAYS, milestoneText } from '../milestones.ts';
import { DAY_MS, getMany, isUuid, keyOf, mapLimit, nowIso, nowMs, partition, queue, str, type Db } from './common.ts';

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(String(v)).toISOString());
const imagesOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const toA = (i: Item): Announcement => ({
  id: String(i['id']), body: String(i['body']), createdAt: iso(i['createdAt'])!, editedAt: iso(i['editedAt']), pushedAt: iso(i['pushedAt']),
  images: imagesOf(i['images']), releaseAt: iso(i['releaseAt'])!,
});
const month = (ms: number): string => new Date(ms).toISOString().slice(0, 7);

async function pushedThisMonth(store: Store, feedUrl: string): Promise<number> {
  return Number((await get(store, 'main', K.announcePushes(feedUrl, month(nowMs(store)))))?.['n'] ?? 0);
}

export async function listAnnouncements(store: Store, _db: Db, feedUrl: string, limit = 50) {
  const items = (await partition(store, 'main', K.SH(feedUrl), { prefix: 'ANN#', newestFirst: true })).filter((a) => !a['deletedAt']).slice(0, limit);
  return { items: items.map(toA), pushesLeftThisMonth: Math.max(0, PUSHES_PER_MONTH - (await pushedThisMonth(store, feedUrl))), resetsOn: resetsOn(new Date(nowMs(store))) };
}

/** The show's live subscribers (lane LB's G2 `SHSUBS#<feedKey>`, eventually consistent — a fan-out job's read). */
export async function liveSubscriberIds(store: Store, feedUrl: string): Promise<string[]> {
  const { items } = await queryAll(store, 'main', { IndexName: K.INDEX.G2, KeyConditionExpression: 'G2PK = :p', ExpressionAttributeValues: { ':p': `SHSUBS#${K.feedKey(feedUrl)}` } });
  return items.map((i) => String(i['G2SK']).split('#').pop()!);
}

export async function publish(store: Store, db: Db, f: typeof fetch, feedUrl: string, showTitle: string | null, authorId: string, body: string, extra: { images?: string[]; releaseAt?: string } = {}): Promise<{ announcement: Announcement; pushed: { devices: number } }> {
  const id = randomUUID();
  const createdAt = nowIso(store);
  const base = { id, feedUrl, authorId, body, images: extra.images ?? [], createdAt, editedAt: null, deletedAt: null };
  // M19 US12: a scheduled announcement is saved now and shown from its time; it is not pushed and does not use a push.
  if (extra.releaseAt && Date.parse(extra.releaseAt) > nowMs(store)) {
    const item = encode('announcement', K.announcement(feedUrl, createdAt, id), { ...base, pushedAt: null, releaseAt: new Date(extra.releaseAt).toISOString() });
    await tx(store).put('main', item, { condition: 'attribute_not_exists(PK)' }).commit();
    return { announcement: toA(item), pushed: { devices: 0 } };
  }
  const item = encode('announcement', K.announcement(feedUrl, createdAt, id), { ...base, pushedAt: createdAt, releaseAt: createdAt });
  const m = month(nowMs(store));
  try {
    await tx(store)
      .put('main', item, { condition: 'attribute_not_exists(PK)' })
      .update('main', K.announcePushes(feedUrl, m), {
        update: 'SET #t = :t, #f = :f, #m = :m, #n = if_not_exists(#n, :z) + :one',
        condition: 'attribute_not_exists(#n) OR #n < :max',
        names: { '#t': 't', '#f': 'feedUrl', '#m': 'month', '#n': 'n' }, values: { ':t': 'announcePushes', ':f': feedUrl, ':m': m, ':z': 0, ':one': 1, ':max': PUSHES_PER_MONTH }, label: 'limit',
      })
      .commit();
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('limit')) {
      throw new ApiError('locked', `You have sent ${PUSHES_PER_MONTH} announcements this month.`, { reason: 'monthly_limit', resetsOn: resetsOn(new Date(nowMs(store))) });
    }
    throw e;
  }
  // "Never tell a device twice" (G-N1): one PUSHSENT item per listener and announcement, put before sending.
  const told: string[] = [];
  const now = nowMs(store);
  for (const lid of await liveSubscriberIds(store, feedUrl)) {
    if (!(await getPrefs(db, lid)).newEpisodes) continue;
    try {
      await tx(store).put('events', encode('pushSent', K.ev.pushSent(lid, id, 'announcement'), { listenerId: lid, episodeId: id, kind: 'announcement', sentAt: new Date(now).toISOString() }, { ttl: ttlAfter(now, 31 * DAY_MS) }), { condition: 'attribute_not_exists(PK)' }).commit();
      told.push(lid);
    } catch (e) { if (!isConditionFailed(e)) throw e; }
  }
  let devices = 0;
  if (told.length > 0) {
    const tokens = (await mapLimit(told, 10, (lid) => partition(store, 'main', K.L(lid), { prefix: K.LISTENER_SK.pushTokens }))).flat().map((t) => String(t['token']));
    const messages = tokens.map((to): PushMessage => ({
      to, title: showTitle ?? 'An announcement', body: body.length > 160 ? body.slice(0, 157) + '…' : body,
      data: { kind: 'announcement', feedUrl, announcementId: id }, sound: 'default',
    }));
    if (messages.length > 0) devices = (await sendExpo(db, f, messages).catch(() => ({ sent: 0 }))).sent;
  }
  return { announcement: toA(item), pushed: { devices } };
}

async function announcementById(store: Store, feedUrl: string, id: string): Promise<Item | undefined> {
  return (await partition(store, 'main', K.SH(feedUrl), { prefix: 'ANN#' })).find((a) => a['id'] === id);
}

export async function edit(store: Store, _db: Db, feedUrl: string, id: string, body: string, extra: { images?: string[]; releaseAt?: string } = {}): Promise<Announcement> {
  if (!isUuid(id)) throw new ApiError('not_found', 'No such announcement.');
  const cur = await announcementById(store, feedUrl, id);
  if (!cur || cur['deletedAt']) throw new ApiError('not_found', 'No such announcement.');
  const now = nowMs(store);
  const releaseAt = extra.releaseAt && Date.parse(String(cur['releaseAt'])) > now ? new Date(extra.releaseAt).toISOString() : String(cur['releaseAt']);
  const next = { ...cur, body, editedAt: new Date(now).toISOString(), images: extra.images ?? imagesOf(cur['images']), releaseAt };
  const item = encode('announcement', keyOf(cur), {
    id, feedUrl, authorId: str(cur['authorId']), body: next.body, images: next.images, createdAt: String(cur['createdAt']), editedAt: next.editedAt,
    pushedAt: str(cur['pushedAt']), releaseAt, deletedAt: null,
  });
  try {
    await tx(store).put('main', item, { condition: 'attribute_exists(PK) AND (attribute_not_exists(#d) OR attribute_type(#d, :nul))', names: { '#d': 'deletedAt' }, values: { ':nul': 'NULL' } }).commit();
  } catch (e) {
    if (isConditionFailed(e)) throw new ApiError('not_found', 'No such announcement.');
    throw e;
  }
  return toA(item);
}

export async function remove(store: Store, _db: Db, feedUrl: string, id: string): Promise<void> {
  if (!isUuid(id)) return;
  const cur = await announcementById(store, feedUrl, id);
  if (!cur) return;
  await tx(store).update('main', keyOf(cur), { update: 'SET #d = :at', condition: 'attribute_exists(PK)', names: { '#d': 'deletedAt' }, values: { ':at': nowIso(store) } }).commit()
    .catch((e: unknown) => { if (!isConditionFailed(e)) throw e; });
}

/** Host notices: the released announcements of these shows, newer than `before` (lane SG's read-merge). */
export async function releasedAnnouncements(store: Store, feedUrls: readonly string[], before: string | null, limit: number): Promise<{ id: string; feedUrl: string; body: string; images: string[]; releaseAt: string }[]> {
  const now = nowMs(store);
  const per = await mapLimit([...new Set(feedUrls)], 16, (u) => partition(store, 'main', K.SH(u), { prefix: 'ANN#' }));
  return per.flat()
    .filter((a) => !a['deletedAt'] && Date.parse(String(a['releaseAt'])) <= now && (before === null || String(a['releaseAt']) < before))
    .map((a) => ({ id: String(a['id']), feedUrl: String(a['feedUrl']), body: String(a['body']), images: imagesOf(a['images']), releaseAt: new Date(String(a['releaseAt'])).toISOString() }))
    .sort((a, b) => b.releaseAt.localeCompare(a.releaseAt))
    .slice(0, limit);
}

/** Host notices: the milestone messages this listener was sent (their own partition), newer than `before`. */
export async function milestoneNotices(store: Store, listenerId: string, before: string | null): Promise<{ id: string; feedUrl: string; body: string; images: string[]; releaseAt: string }[]> {
  return (await partition(store, 'main', K.L(listenerId), { prefix: K.ST_SK.milestones }))
    .filter((m) => before === null || String(m['sentAt']) < before)
    .map((m) => ({ id: String(m['id']), feedUrl: String(m['feedUrl']), body: String(m['body']), images: [], releaseAt: new Date(String(m['sentAt'])).toISOString() }));
}

// ---- polls ----

type PollItem = Item & { options?: string[]; votes?: number[] };

function open(p: Item, now: number): boolean {
  return !p['closedAt'] && Date.parse(String(p['endsAt'])) > now;
}

async function hydrate(store: Store, polls: Item[], viewerId?: string): Promise<Poll[]> {
  if (polls.length === 0) return [];
  const now = nowMs(store);
  const mine = viewerId ? await getMany(store, 'main', polls.map((p) => K.pollVote(String(p['feedUrl']), String(p['id']), viewerId))) : [];
  const myBy = new Map(mine.map((v) => [String(v['pollId']), ((v['options'] as number[] | undefined) ?? []).map(Number).sort((a, b) => a - b)]));
  return polls.map((p) => {
    const labels = ((p as PollItem)['options'] ?? []).map(String);
    const votes = ((p as PollItem)['votes'] ?? []).map(Number);
    const options = labels.map((label, idx) => ({ idx, label, votes: votes[idx] ?? 0 }));
    const my = myBy.get(String(p['id'])) ?? [];
    return {
      id: String(p['id']), question: String(p['question']), episodeId: str(p['episodeId']), endsAt: new Date(String(p['endsAt'])).toISOString(),
      closedAt: iso(p['closedAt']), open: open(p, now), total: options.reduce((a, o) => a + o.votes, 0), options,
      multi: p['multi'] === true, voters: Number(p['voters'] ?? 0),
      ...(viewerId ? { myVote: my[0] ?? null, myVotes: my } : {}),
    };
  });
}

const byCreatedDesc = (a: Item, b: Item) => String(b['createdAt']).localeCompare(String(a['createdAt']));

export async function listPolls(store: Store, _db: Db, feedUrl: string): Promise<Poll[]> {
  return hydrate(store, (await partition(store, 'main', K.SH(feedUrl), { prefix: 'POLL#' })).sort(byCreatedDesc).slice(0, 50));
}

/** For the app: open polls, and ones closed in the last 7 days. */
export async function pollsForApp(store: Store, _db: Db, feedUrl: string, viewerId?: string): Promise<Poll[]> {
  const cut = nowMs(store) - 7 * DAY_MS;
  const polls = (await partition(store, 'main', K.SH(feedUrl), { prefix: 'POLL#' }))
    .filter((p) => Date.parse(String(p['closedAt'] ?? p['endsAt'])) > cut).sort(byCreatedDesc).slice(0, 10);
  return hydrate(store, polls, viewerId);
}

export async function createPoll(store: Store, _db: Db, feedUrl: string, by: string, p: { question: string; options: string[]; endsAt: string; episodeId?: string | undefined; multi?: boolean | undefined }): Promise<Poll> {
  const ends = Date.parse(p.endsAt);
  const now = nowMs(store);
  if (!Number.isFinite(ends) || ends <= now || ends > now + MAX_DAYS * DAY_MS) {
    throw new ApiError('validation', `The end must be in the next ${MAX_DAYS} days.`, { fields: ['endsAt'] });
  }
  if (p.episodeId) {
    const e = await get(store, 'main', K.episode(p.episodeId));
    if (!e || e['feedUrl'] !== feedUrl) throw new ApiError('validation', 'That episode is not on this show.', { fields: ['episodeId'] });
  }
  const id = randomUUID();
  const item = encode('poll', K.poll(feedUrl, id), {
    id, feedUrl, episodeId: p.episodeId ?? null, question: p.question, options: p.options, votes: p.options.map(() => 0), voters: 0, multi: p.multi === true,
    endsAt: new Date(ends).toISOString(), createdBy: by, createdAt: new Date(now).toISOString(), v: 0,
  });
  await tx(store).put('main', item, { condition: 'attribute_not_exists(PK)' }).put('main', encode('pollRef', K.pollRef(id), { id, feedUrl })).commit();
  return (await hydrate(store, [item]))[0]!;
}

async function pollOf(store: Store, id: string): Promise<Item | undefined> {
  if (!isUuid(id)) return undefined;
  const ref = await get(store, 'main', K.pollRef(id));
  return ref ? get(store, 'main', K.poll(String(ref['feedUrl']), id)) : undefined;
}

export async function closePoll(store: Store, _db: Db, feedUrl: string, id: string): Promise<void> {
  const p = await pollOf(store, id);
  if (!p || p['feedUrl'] !== feedUrl) throw new ApiError('not_found', 'No such poll.');
  await tx(store).update('main', keyOf(p), { update: 'SET #c = if_not_exists(#c, :at)', names: { '#c': 'closedAt' }, values: { ':at': nowIso(store) } }).commit();
}

/** M24 US14: the creator deletes a poll; its votes go with it (the poll and its ref first, then the votes and the voters' pointers). */
export async function deletePoll(store: Store, _db: Db, feedUrl: string, id: string): Promise<void> {
  const p = await pollOf(store, id);
  if (!p || p['feedUrl'] !== feedUrl) throw new ApiError('not_found', 'No such poll.');
  try {
    await tx(store).delete('main', keyOf(p), { condition: 'attribute_exists(PK)' }).delete('main', K.pollRef(id)).commit();
  } catch (e) {
    if (isConditionFailed(e)) throw new ApiError('not_found', 'No such poll.');
    throw e;
  }
  const { batchWriteAll } = await import('../../../ddb/batch.ts');
  const votes = await partition(store, 'main', K.SH(feedUrl), { prefix: `POLLVOTE#${id}#` });
  await batchWriteAll(store, 'main', votes.flatMap((v) => [{ delete: keyOf(v) }, { delete: K.pollVotePtr(String(v['listenerId']), id) }]));
}

/**
 * A listener's vote; a closed poll answers 409. Single choice: a second vote while open CHANGES the answer (G-M20-7);
 * multiple choice: one number toggles that option, a list sets the whole choice. One transaction: the vote item and
 * the poll's counts, with the poll's version and "still open" as conditions; a race re-reads and decides again.
 */
export async function vote(store: Store, _db: Db, pollId: string, listenerId: string, choice: number | number[], all = false): Promise<Poll> {
  return withRetry(async () => {
    const p = await pollOf(store, pollId);
    if (!p) throw new ApiError('not_found', 'No such poll.');
    const now = nowMs(store);
    if (!open(p, now)) throw new ApiError('conflict', 'This poll has closed.', { reason: 'closed' });
    const idxs = [...new Set(Array.isArray(choice) ? choice : [choice])];
    if (p['multi'] !== true && idxs.length !== 1) throw new ApiError('validation', 'Choose one option.', { fields: ['optionIdxs'] });
    const labels = ((p as PollItem)['options'] ?? []);
    if (idxs.some((i) => !Number.isInteger(i) || i < 0 || i >= labels.length)) throw new ApiError('validation', 'No such option.', { fields: [Array.isArray(choice) ? 'optionIdxs' : 'optionIdx'] });
    const feedUrl = String(p['feedUrl']);
    const vkey = K.pollVote(feedUrl, pollId, listenerId);
    const cur = await get(store, 'main', vkey);
    const had = new Set(((cur?.['options'] as number[] | undefined) ?? []).map(Number));
    let next: Set<number>;
    if (p['multi'] !== true || all) next = new Set(idxs);
    else { next = new Set(had); const i = idxs[0]!; if (next.has(i)) next.delete(i); else next.add(i); }
    const votes = ((p as PollItem)['votes'] ?? labels.map(() => 0)).map(Number);
    for (const i of had) votes[i] = Math.max(0, (votes[i] ?? 0) - 1);
    for (const i of next) votes[i] = (votes[i] ?? 0) + 1;
    const voters = Number(p['voters'] ?? 0) + (next.size > 0 ? 1 : 0) - (had.size > 0 ? 1 : 0);
    const v = Number(p['v'] ?? 0);
    const t = tx(store).update('main', keyOf(p), {
      update: 'SET #votes = :votes, #voters = :voters, #v = :nv',
      condition: '(attribute_not_exists(#v) OR #v = :v) AND (attribute_not_exists(#c) OR attribute_type(#c, :nul)) AND #e > :now',
      names: { '#votes': 'votes', '#voters': 'voters', '#v': 'v', '#c': 'closedAt', '#e': 'endsAt' },
      values: { ':votes': votes, ':voters': voters, ':nv': v + 1, ':v': v, ':nul': 'NULL', ':now': new Date(now).toISOString() }, label: 'poll',
    });
    if (next.size > 0) {
      // The poll's version (bumped by every vote) already serialises the votes on this poll.
      t.put('main', encode('pollVote', vkey, { pollId, listenerId, options: [...next].sort((a, b) => a - b), votedAt: new Date(now).toISOString() }));
      t.put('main', encode('pollVotePtr', K.pollVotePtr(listenerId, pollId), { pollId, feedUrl }));
    } else if (cur) {
      t.delete('main', vkey, { condition: 'attribute_exists(PK)' });
      t.delete('main', K.pollVotePtr(listenerId, pollId));
    }
    await t.commit();
    const after = (await get(store, 'main', keyOf(p))) ?? p;
    return (await hydrate(store, [after], listenerId))[0]!;
  }, { tries: 6, retryOn: (e) => (e instanceof TxCancelled && e.conditionFailed) || isConflict(e) });
}

/** Account deletion: the listener's vote leaves the poll's counts (the old ON DELETE CASCADE on poll_votes), open or closed. */
export async function removeVoteOf(store: Store, pollId: string, listenerId: string): Promise<void> {
  await withRetry(async () => {
    const ptr = await get(store, 'main', K.pollVotePtr(listenerId, pollId));
    const p = await pollOf(store, pollId);
    const vkey = p ? K.pollVote(String(p['feedUrl']), pollId, listenerId) : undefined;
    const cur = vkey ? await get(store, 'main', vkey) : undefined;
    const t = tx(store);
    if (p && cur) {
      const had = ((cur['options'] as number[] | undefined) ?? []).map(Number);
      const votes = ((p as PollItem)['votes'] ?? []).map(Number);
      for (const i of had) votes[i] = Math.max(0, (votes[i] ?? 0) - 1);
      const v = Number(p['v'] ?? 0);
      t.update('main', keyOf(p), {
        update: 'SET #votes = :votes, #voters = :voters, #v = :nv', condition: 'attribute_not_exists(#v) OR #v = :v',
        names: { '#votes': 'votes', '#voters': 'voters', '#v': 'v' }, values: { ':votes': votes, ':voters': Math.max(0, Number(p['voters'] ?? 0) - 1), ':nv': v + 1, ':v': v }, label: 'poll',
      });
      t.delete('main', vkey!);
    }
    if (ptr) t.delete('main', K.pollVotePtr(listenerId, pollId));
    await t.commit();
  }, { tries: 6, retryOn: (e) => (e instanceof TxCancelled && e.conditionFailed) || isConflict(e) });
}

// ---- milestones ----

/** Sends every milestone due now (the hourly sweep). Returns how many notices were written. */
export async function sendMilestones(store: Store, _db: Db): Promise<number> {
  const now = nowMs(store);
  let sent = 0;
  for (const q of await queue(store, 'milestone-msgs')) {
    const o = await get(store, 'main', keyOf(q));
    const message = str(o?.['milestoneMessage'])?.trim();
    if (!o || !message) continue;
    const feedUrl = String(o['feedUrl']);
    const count = Number((await get(store, 'main', K.show(feedUrl)))?.['subscriberCount'] ?? 0);
    if (count < MILESTONES[0]) continue;
    const top = MILESTONES.filter((m) => m <= count);
    const { items } = await queryAll(store, 'main', {
      IndexName: K.INDEX.G2, KeyConditionExpression: 'G2PK = :p', ExpressionAttributeValues: { ':p': `SHSUBS#${K.feedKey(feedUrl)}` },
    }, { max: top[top.length - 1]! });
    for (const m of top) {
      const who = items[m - 1];
      if (!who) break;
      const [createdAt, listenerId] = [String(who['G2SK']).slice(0, 24), String(who['G2SK']).split('#').pop()!];
      if (Date.parse(createdAt) < now - RECENT_DAYS * DAY_MS) continue;
      const id = randomUUID();
      const at = new Date(now).toISOString();
      const body = milestoneText(message, m);
      try {
        await tx(store)
          .put('main', encode('milestone', K.milestoneSent(feedUrl, m), { id, feedUrl, milestone: m, listenerId, body, sentAt: at }), { condition: 'attribute_not_exists(PK)', label: 'sent' })
          .put('main', encode('milestoneCopy', K.milestoneCopy(listenerId, at, id), { id, feedUrl, milestone: m, body, sentAt: at }))
          .commit();
        sent++;
      } catch (e) {
        if (!(e instanceof TxCancelled && e.failed('sent'))) throw e;
      }
    }
  }
  return sent;
}

export { mapLimit };
