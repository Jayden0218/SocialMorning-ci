// Lane ST test helpers that seed and read Studio rows on whichever backend the test runs (TEST_BACKEND).
/**
 * M26 lane ST (tasks.md "convert the lane's test files from t.q() to fixtures"). The Studio tests seed rows of many
 * tables — claims, team, hosted shows, announcements, plays, reactions, saves, shares … — and some assert on them.
 * On Postgres (the gate, postgres-api) each helper is the SQL the test used to hold; with `t.store` (ddb-api.yml) it
 * writes the DynamoDB items — lane ST's own, or another lane's through its item shape — and, for a counted thing,
 * runs the Studio's fact refresh the source's hook would have queued (studio/ddb/facts.ts). DynamoDB modules are
 * imported only on that path. CUT deletes the Postgres branches.
 */
import type { TestDb } from './harness.ts';

type Row = Record<string, unknown>;
const K = () => import('../src/db/ddb/keys.ts');
const codec = () => import('../src/db/ddb/codec.ts');
const facts = () => import('../src/db/repos/studio/ddb/facts.ts');
const iso = (v: string | number | Date) => new Date(v).toISOString();

async function putItem(t: TestDb, table: 'main' | 'events', item: Row): Promise<void> {
  const { put } = await import('../src/db/ddb/store.ts');
  await put(t.store!, table, item as never);
}

async function setAttrs(t: TestDb, table: 'main' | 'events', key: { PK: string; SK: string }, set: Row): Promise<void> {
  const { update } = await import('../src/db/ddb/store.ts');
  const names: Record<string, string> = {};
  const values: Row = {};
  const parts = Object.entries(set).map(([k, v], i) => { names[`#a${i}`] = k; values[`:a${i}`] = v; return `#a${i} = :a${i}`; });
  await update(t.store!, table, key, { update: `SET ${parts.join(', ')}`, condition: 'attribute_exists(PK)', names, values: values as never });
}

async function scan(t: TestDb, table: 'main' | 'events', type: string): Promise<Row[]> {
  return (await import('./fixtures.ts')).acScan(t.store!, table, type);
}
const keyOf = (i: Row) => ({ PK: String(i['PK']), SK: String(i['SK']) });

// ---- the team ----

/** A helper (operator) on a show. */
export async function addHelper(t: TestDb, feedUrl: string, listenerId: string, addedBy: string | null = null): Promise<void> {
  if (!t.store) { await t.q('INSERT INTO show_members (feed_url, listener_id, added_by) VALUES ($1, $2, $3)', [feedUrl, listenerId, addedBy]); return; }
  const k = await K(); const { encode } = await codec();
  const { showKey } = await import('../src/db/repos/studio/studio-roles.ts');
  const at = iso(Date.now());
  await putItem(t, 'main', encode('teamMember', k.teamMember(feedUrl, listenerId), { listenerId, feedUrl, addedBy, createdAt: at }, { gsi: k.G4('team-members', at, `${k.feedKey(feedUrl)}#${listenerId}`) }));
  await putItem(t, 'main', encode('roles', k.roleCopy(listenerId, showKey(feedUrl)), { feedUrl, role: 'operator', since: at, showKey: showKey(feedUrl) }));
}

/** An invited co-host on a show. */
export async function addHost(t: TestDb, feedUrl: string, listenerId: string): Promise<void> {
  if (!t.store) { await t.q('INSERT INTO show_hosts (feed_url, listener_id) VALUES ($1, $2)', [feedUrl, listenerId]); return; }
  const k = await K(); const { encode } = await codec();
  const at = iso(Date.now());
  await putItem(t, 'main', encode('showHost', k.showHost(feedUrl, listenerId), { listenerId, feedUrl, addedAt: at }));
  await putItem(t, 'main', encode('hostPtr', k.hostOf(listenerId, feedUrl), { feedUrl, addedAt: at }));
}

/** The feed's proven claim is revoked (the old `UPDATE creator_claims SET status = 'revoked'`). */
export async function revokeClaim(t: TestDb, feedUrl: string): Promise<void> {
  if (!t.store) { await t.q("UPDATE creator_claims SET status = 'revoked' WHERE feed_url = $1", [feedUrl]); return; }
  await (await import('../src/db/repos/studio/ddb/claims.ts')).revokeProven(t.store, feedUrl);
}

/** A proven claim without the role copy or the Studio (for the app's tests: hosts, show info). */
export async function provenClaim(t: TestDb, listenerId: string, feedUrl: string, code = 'code-1'): Promise<void> {
  if (!t.store) { await t.q("INSERT INTO creator_claims (listener_id, feed_url, code, status, proven_at) VALUES ($1, $2, $3, 'proven', now())", [listenerId, feedUrl, code]); return; }
  await (await import('./fixtures.ts')).proveClaimItem(t.store, listenerId, feedUrl);
}

/** Counts of the Studio rows a released show must have lost: helpers, mutes, overrides, open polls. */
export async function releaseLeftovers(t: TestDb, feedUrl: string): Promise<{ m: number; u: number; o: number; p: number }> {
  if (!t.store) {
    const [r] = await t.q<{ m: number; u: number; o: number; p: number }>(
      `SELECT (SELECT count(*)::int FROM show_members WHERE feed_url = $1) AS m, (SELECT count(*)::int FROM show_mutes WHERE feed_url = $1) AS u,
              (SELECT count(*)::int FROM show_overrides WHERE feed_url = $1) AS o, (SELECT count(*)::int FROM polls WHERE feed_url = $1 AND closed_at IS NULL) AS p`, [feedUrl]);
    return r!;
  }
  const k = await K();
  const { partition } = await import('../src/db/repos/studio/ddb/common.ts');
  const sh = k.SH(feedUrl);
  const items = await partition(t.store, 'main', sh);
  const n = (p: string) => items.filter((i) => String(i['SK']).startsWith(p)).length;
  return { m: n('TEAM#'), u: n('SMUTE#'), o: n('OVERRIDE'), p: items.filter((i) => String(i['SK']).startsWith('POLL#') && !i['closedAt']).length };
}

// ---- hosted shows ----

/** A Studio-made show row (the tests that skip the Studio form); returns its id. */
export async function seedHostedShow(t: TestDb, s: { ownerId: string; feedUrl: string; title: string; priceTier?: number | null }): Promise<string> {
  if (!t.store) {
    const [r] = await t.q<{ id: string }>('INSERT INTO hosted_shows (owner_id, feed_url, title, price_tier) VALUES ($1, $2, $3, $4) RETURNING id', [s.ownerId, s.feedUrl, s.title, s.priceTier ?? null]);
    return r!.id;
  }
  const { randomUUID } = await import('node:crypto');
  const k = await K(); const { encode } = await codec();
  const id = randomUUID();
  const at = iso(Date.now());
  await putItem(t, 'main', encode('hostedShow', k.hostedShow(id), {
    id, ownerId: s.ownerId, feedUrl: s.feedUrl, title: s.title, description: '', author: '', language: 'zh', category: 'Society & Culture', explicit: false,
    coverUrl: null, priceTier: s.priceTier ?? null, createdAt: at, updatedAt: at,
  }, { gsi: k.G4('hosted', at, id) }));
  await putItem(t, 'main', encode('hostedFeed', k.hostedFeed(s.feedUrl), { showId: id, feedUrl: s.feedUrl }));
  await putItem(t, 'main', encode('ownedHosted', k.ownedHosted(s.ownerId, id), { showId: id, feedUrl: s.feedUrl, createdAt: at }));
  // The Postgres row too: lane DV's search still reads it (the bridge).
  await t.q('INSERT INTO hosted_shows (id, owner_id, feed_url, title, price_tier) VALUES ($1, $2, $3, $4, $5)', [id, s.ownerId, s.feedUrl, s.title, s.priceTier ?? null]);
  return id;
}

/** A hosted episode row; returns its id. */
export async function seedHostedEpisode(t: TestDb, showId: string, e: {
  title?: string; status?: 'draft' | 'published'; publishedAgoMs?: number; publishedAt?: string; paid?: boolean; durationMs?: number | null; previewStartMs?: number | null; previewEndMs?: number | null;
  audioUrl?: string; audioBytes?: number; createdAt?: boolean;
}): Promise<string> {
  const publishedAt = e.publishedAt ? iso(e.publishedAt) : iso(Date.now() - (e.publishedAgoMs ?? 60_000));
  if (!t.store) {
    const [r] = await t.q<{ id: string }>(
      `INSERT INTO hosted_episodes (show_id, guid, episode_id, title, audio_url, audio_bytes, audio_type, status, published_at, paid, created_at, duration_ms, preview_start_ms, preview_end_ms)
       VALUES ($1, gen_random_uuid()::text, gen_random_uuid()::text, $2, $3, $4, 'audio/mpeg', $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [showId, e.title ?? 'Ep', e.audioUrl ?? 'https://blob.example/a.mp3', e.audioBytes ?? 10, e.status ?? 'published', publishedAt, e.paid ?? false,
        e.createdAt === false ? null : iso(Date.now()), e.durationMs ?? null, e.previewStartMs ?? null, e.previewEndMs ?? null]);
    return r!.id;
  }
  const { randomUUID } = await import('node:crypto');
  const k = await K(); const { encode } = await codec();
  const id = randomUUID();
  const status = e.status ?? 'published';
  const paid = e.paid ?? false;
  const item: Row = {
    id, showId, guid: randomUUID(), episodeId: randomUUID(), title: e.title ?? 'Ep', description: '', audioUrl: e.audioUrl ?? 'https://blob.example/a.mp3', audioBytes: e.audioBytes ?? 10,
    audioType: 'audio/mpeg', durationMs: e.durationMs ?? null, publishedAt, status, coverUrl: null, paid, createdAt: e.createdAt === false ? null : iso(Date.now()),
    createdBy: null, previewStartMs: e.previewStartMs ?? null, previewEndMs: e.previewEndMs ?? null,
  };
  const waiting = status === 'published' && !paid;
  await putItem(t, 'main', encode('hostedEpisode', k.hostedEpisode(showId, id), item, waiting ? { gsi: k.G4('scheduled', publishedAt, `${showId}#${id}`) } : {}));
  await putItem(t, 'main', encode('hostedEpisodeRef', k.hostedEpisodeRef(id), { id, showId }));
  return id;
}

/** Moves a hosted episode's publish time (and its scheduled-queue key) to `ms` ago — "time passes". */
export async function moveHostedEpisode(t: TestDb, title: string, agoMs: number): Promise<void> {
  const at = iso(Date.now() - agoMs);
  if (!t.store) { await t.q('UPDATE hosted_episodes SET published_at = $2 WHERE title = $1', [title, at]); return; }
  for (const e of await scan(t, 'main', 'hostedEpisode')) {
    if (e['title'] !== title) continue;
    await setAttrs(t, 'main', keyOf(e), { publishedAt: at, ...(e['G4PK'] ? { G4SK: `${at}#${String(e['showId'])}#${String(e['id'])}` } : {}) });
  }
}

/** The app episodes registered for a feed (count). */
export async function appEpisodeCount(t: TestDb, feedUrl: string): Promise<number> {
  return (await import('./lb-seed.ts')).episodeCountOf(t, feedUrl);
}

/** The app episodes of a feed: id and enclosure. */
export async function appEpisodesOf(t: TestDb, feedUrl: string): Promise<{ id: string; enclosure_url: string }[]> {
  if (!t.store) return t.q<{ id: string; enclosure_url: string }>('SELECT id, enclosure_url FROM episodes WHERE feed_url = $1', [feedUrl]);
  return (await scan(t, 'main', 'episode')).filter((e) => e['feedUrl'] === feedUrl).map((e) => ({ id: String(e['id']), enclosure_url: String(e['enclosureUrl']) }));
}

/** The owners of the hosted shows with this title. */
export async function hostedOwnerOf(t: TestDb, title: string): Promise<string | undefined> {
  if (!t.store) return (await t.q<{ owner_id: string }>('SELECT owner_id FROM hosted_shows WHERE title = $1', [title]))[0]?.owner_id;
  return (await scan(t, 'main', 'hostedShow')).find((s) => s['title'] === title)?.['ownerId'] as string | undefined;
}

/** Whether a hosted episode is in the app's episode table (it went live). */
export async function hostedEpisodeLive(t: TestDb, hostedId: string): Promise<boolean> {
  if (!t.store) return (await t.q('SELECT 1 FROM episodes e JOIN hosted_episodes h ON h.episode_id = e.id WHERE h.id = $1', [hostedId])).length > 0;
  const e = (await scan(t, 'main', 'hostedEpisode')).find((x) => x['id'] === hostedId);
  if (!e) return false;
  const { get } = await import('../src/db/ddb/store.ts');
  return Boolean(await get(t.store, 'main', (await K()).episode(String(e['episodeId']))));
}

/** A hosted episode becomes published and due now (the old `UPDATE hosted_episodes SET status = 'published', published_at = now() - 1 min`). */
export async function publishHostedNow(t: TestDb, hostedId: string): Promise<void> {
  const at = iso(Date.now() - 60_000);
  if (!t.store) { await t.q("UPDATE hosted_episodes SET status = 'published', published_at = $2 WHERE id = $1", [hostedId, at]); return; }
  const e = (await scan(t, 'main', 'hostedEpisode')).find((x) => x['id'] === hostedId)!;
  await setAttrs(t, 'main', keyOf(e), { status: 'published', publishedAt: at, ...(e['paid'] !== true ? { G4PK: 'Q#scheduled', G4SK: `${at}#${String(e['showId'])}#${hostedId}` } : {}) });
}

// ---- overrides, announcements, polls, invites, feed sync ----

export async function seedOverrides(t: TestDb, feedUrl: string, o: { title?: string | null; tipsEnabled?: boolean; milestoneMessage?: string | null; updatedBy?: string | null }): Promise<void> {
  if (!t.store) {
    await t.q('INSERT INTO show_overrides (feed_url, title, tips_enabled, milestone_message, updated_by) VALUES ($1, $2, $3, $4, $5)',
      [feedUrl, o.title ?? null, o.tipsEnabled ?? false, o.milestoneMessage ?? null, o.updatedBy ?? null]);
    return;
  }
  const k = await K(); const { encode } = await codec();
  const at = iso(Date.now());
  await putItem(t, 'main', encode('showOverride', k.showSingleton(feedUrl, 'OVERRIDE'), {
    feedUrl, title: o.title ?? null, description: null, coverUrl: null, themeColour: null, milestoneMessage: o.milestoneMessage ?? null, hosts: null, links: null, contacts: null,
    tipsEnabled: o.tipsEnabled ?? false, updatedAt: at, updatedBy: o.updatedBy ?? null,
  }, o.milestoneMessage ? { gsi: k.G4('milestone-msgs', at, k.feedKey(feedUrl)) } : {}));
}

/** An announcement row as the old INSERT made it. */
export async function seedAnnouncement(t: TestDb, feedUrl: string, a: { body: string; images?: string[]; createdAgoMs?: number; pushedAgoMs?: number | null; releaseInMs?: number }): Promise<void> {
  const createdAt = iso(Date.now() - (a.createdAgoMs ?? 0));
  const pushedAt = a.pushedAgoMs === undefined || a.pushedAgoMs === null ? null : iso(Date.now() - a.pushedAgoMs);
  const releaseAt = iso(Date.now() + (a.releaseInMs ?? -(a.createdAgoMs ?? 0)));
  if (!t.store) {
    await t.q("INSERT INTO announcements (feed_url, body, images, created_at, pushed_at, release_at) VALUES ($1, $2, ($3::text)::jsonb, $4, $5, $6)",
      [feedUrl, a.body, JSON.stringify(a.images ?? []), createdAt, pushedAt, releaseAt]);
    return;
  }
  const { randomUUID } = await import('node:crypto');
  const k = await K(); const { encode } = await codec();
  const id = randomUUID();
  await putItem(t, 'main', encode('announcement', k.announcement(feedUrl, createdAt, id), { id, feedUrl, authorId: null, body: a.body, images: a.images ?? [], createdAt, editedAt: null, pushedAt, releaseAt, deletedAt: null }));
  if (pushedAt) {
    const { update } = await import('../src/db/ddb/store.ts');
    const month = pushedAt.slice(0, 7);
    await update(t.store, 'main', k.announcePushes(feedUrl, month), { update: 'SET #t = :t, #f = :f, #m = :m ADD #n :one', names: { '#t': 't', '#f': 'feedUrl', '#m': 'month', '#n': 'n' }, values: { ':t': 'announcePushes', ':f': feedUrl, ':m': month, ':one': 1 } });
  }
}

/** Every open invite expired a second ago. */
export async function expireInvites(t: TestDb): Promise<void> {
  const at = iso(Date.now() - 1000);
  if (!t.store) { await t.q('UPDATE show_invites SET expires_at = $1 WHERE used_at IS NULL', [at]); return; }
  for (const i of await scan(t, 'main', 'invite')) if (!i['usedAt']) await setAttrs(t, 'main', keyOf(i), { expiresAt: at });
}

/** The last "Sync now" was `ms` ago. */
export async function ageManualSync(t: TestDb, ms: number): Promise<void> {
  const at = iso(Date.now() - ms);
  if (!t.store) { await t.q('UPDATE feed_sync SET manual_at = $1', [at]); return; }
  for (const f of await scan(t, 'main', 'feedSync')) await setAttrs(t, 'main', keyOf(f), { manualAt: at });
}

/** How many vote rows a poll has. */
export async function pollVoteCount(t: TestDb, pollId: string): Promise<number> {
  if (!t.store) return Number((await t.q<{ n: number }>('SELECT count(*)::int AS n FROM poll_votes WHERE poll_id = $1', [pollId]))[0]!.n);
  return (await scan(t, 'main', 'pollVote')).filter((v) => v['pollId'] === pollId).reduce((n, v) => n + ((v['options'] as unknown[] | undefined)?.length ?? 0), 0);
}

// ---- held comments ----

/** Every held comment (and its author's index entry) `ms` older. */
export async function ageHeld(t: TestDb, ms: number): Promise<void> {
  if (!t.store) { await t.q(`UPDATE held_comments SET created_at = created_at - ($1 || ' milliseconds')::interval`, [String(ms)]); return; }
  for (const type of ['heldComment', 'heldPtr', 'heldRef']) {
    for (const h of await scan(t, 'main', type)) await setAttrs(t, 'main', keyOf(h), { createdAt: iso(Date.parse(String(h['createdAt'])) - ms) });
  }
}

export async function heldCount(t: TestDb): Promise<number> {
  if (!t.store) return Number((await t.q<{ n: number }>('SELECT count(*)::int AS n FROM held_comments'))[0]!.n);
  return (await scan(t, 'main', 'heldComment')).length;
}

// ---- the things the Studio counts (each also runs the fact refresh its source's hook queues) ----

/** A `listened` activity row (a play), on the listener's day `day`, at `at`. */
export async function seedListened(t: TestDb, a: { actorId: string; episodeId: string; day: string; at: string; hidden?: boolean }): Promise<void> {
  const [row] = await t.q<{ id: string | number }>("INSERT INTO activity (actor_id, kind, episode_id, day, hidden, created_at) VALUES ($1, 'listened', $2, $3, $4, $5) RETURNING id",
    [a.actorId, a.episodeId, a.day, a.hidden ?? false, a.at]);
  if (!t.store) return;
  const k = await K(); const { encode } = await codec();
  const id = Number(row!.id);
  const createdAt = iso(a.at);
  const key = k.ev.activity(a.actorId, createdAt, id);
  await putItem(t, 'events', encode('activity', key, { id, actorId: a.actorId, kind: 'listened', episodeId: a.episodeId, momentMs: null, refId: null, day: a.day, hidden: a.hidden ?? false, createdAt }));
  await putItem(t, 'events', encode('unique', k.ev.activityDedupe(a.actorId, 'listened', a.episodeId, a.day), { owner: `${key.PK}|${key.SK}`, hidden: a.hidden ?? false }));
  await (await facts()).refreshFact(t.store, { kind: 'play', listenerId: a.actorId, episodeId: a.episodeId, day: a.day });
}

/** A listened-ranges row of one listener, episode and day (device 'phone' unless given). */
export async function seedRanges(t: TestDb, listenerId: string, episodeId: string, day: string, ranges: number[][], device = 'phone'): Promise<void> {
  if (!t.store) {
    await t.q('INSERT INTO listened_ranges (listener_id, episode_id, day, device_id, ranges) VALUES ($1, $2, $3, $4, $5::jsonb)', [listenerId, episodeId, day, device, JSON.stringify(ranges)]);
    return;
  }
  const k = await K(); const { encode } = await codec();
  await putItem(t, 'main', encode('listenedRange', k.listenedRange(listenerId, episodeId, day, device), { listenerId, episodeId, day, deviceId: device, ranges, updatedAt: iso(Date.now()) }));
  await (await facts()).refreshFact(t.store, { kind: 'pair', listenerId, episodeId });
}

/** A finished position. */
export async function seedFinished(t: TestDb, listenerId: string, episodeId: string, offsetMs: number): Promise<void> {
  if (!t.store) {
    await t.q("INSERT INTO positions (listener_id, episode_id, offset_ms, finished, progress_seq, device_id) VALUES ($1, $2, $3, true, 1, 'phone')", [listenerId, episodeId, offsetMs]);
    return;
  }
  const k = await K(); const { encode } = await codec();
  await putItem(t, 'main', encode('position', k.position(listenerId, episodeId), {
    listenerId, episodeId, offsetMs, finished: true, progressSeq: 1, explicitSeek: false, deviceId: 'phone', receivedAt: iso(Date.now()), v: 1,
  }));
  await (await facts()).refreshFact(t.store, { kind: 'pair', listenerId, episodeId });
}

/** A subscription row, live or deleted. */
export async function seedSubscription(t: TestDb, s: { listenerId: string; feedUrl: string; createdAt?: string; deletedAt?: string | null }): Promise<void> {
  if (!t.store) {
    await t.q('INSERT INTO subscriptions (listener_id, feed_url, created_at, deleted_at) VALUES ($1, $2, $3, $4)', [s.listenerId, s.feedUrl, s.createdAt ?? iso(Date.now()), s.deletedAt ?? null]);
    return;
  }
  await (await import('./fixtures.ts')).subscriptionItem(t.store, { listenerId: s.listenerId, feedUrl: s.feedUrl, createdAt: iso(s.createdAt ?? Date.now()), deletedAt: s.deletedAt ? iso(s.deletedAt) : null });
}

/** A subscribe / unsubscribe event at `at`. */
export async function seedSubEvent(t: TestDb, e: { listenerId: string; feedUrl: string; kind: 'sub' | 'unsub'; at: string }): Promise<void> {
  if (!t.store) { await t.q('INSERT INTO subscription_events (listener_id, feed_url, kind, at) VALUES ($1, $2, $3, $4)', [e.listenerId, e.feedUrl, e.kind, e.at]); return; }
  const k = await K(); const { encode } = await codec(); const { nextSeq } = await import('../src/db/ddb/seq.ts');
  const id = await nextSeq(t.store, 'subscription_events');
  const at = iso(e.at);
  await putItem(t, 'events', encode('subscriptionEvent', k.ev.subscriptionEvent(e.feedUrl, at, id), { id, listenerId: e.listenerId, feedUrl: e.feedUrl, kind: e.kind, at }));
}

/** The kinds of a feed's subscribe events, in id order. */
export async function subEventKinds(t: TestDb, feedUrl: string): Promise<string[]> {
  if (!t.store) return (await t.q<{ kind: string }>('SELECT kind FROM subscription_events WHERE feed_url = $1 ORDER BY id', [feedUrl])).map((r) => r.kind);
  return (await scan(t, 'events', 'subscriptionEvent')).filter((e) => e['feedUrl'] === feedUrl).sort((a, b) => Number(a['id']) - Number(b['id'])).map((e) => String(e['kind']));
}

/** A reaction in bucket `bucket` at `at`. */
export async function seedReaction(t: TestDb, listenerId: string, episodeId: string, bucket: number, at: string): Promise<void> {
  if (!t.store) { await t.q('INSERT INTO reactions (listener_id, episode_id, bucket, offset_ms, created_at) VALUES ($1, $2, $3, 0, $4)', [listenerId, episodeId, bucket, at]); return; }
  const k = await K(); const { encode } = await codec();
  await putItem(t, 'main', encode('reaction', k.reaction(listenerId, episodeId, bucket), { listenerId, episodeId, bucket, offsetMs: 0, createdAt: iso(at) }));
  await (await facts()).refreshFact(t.store, { kind: 'like', listenerId, episodeId });
}

/** A clip (deleted or not). */
export async function seedClip(t: TestDb, authorId: string, clientId: string, episodeId: string, deleted = false): Promise<void> {
  if (!t.store) {
    await t.q(`INSERT INTO clips (author_id, client_id, episode_id, start_ms, end_ms${deleted ? ', deleted_at' : ''}) VALUES ($1, $2, $3, 0, 30000${deleted ? ', now()' : ''})`, [authorId, clientId, episodeId]);
    return;
  }
  const { randomUUID } = await import('node:crypto');
  const k = await K(); const { encode } = await codec();
  const id = randomUUID(); const at = iso(Date.now());
  await putItem(t, 'main', encode('clip', k.clip(episodeId, at, id), { id, authorId, clientId, episodeId, startMs: 0, endMs: 30000, caption: '', createdAt: at, deletedAt: deleted ? at : null }));
}

/** A `fav_episode` library item, live or removed, updated at `at`. */
export async function seedSave(t: TestDb, listenerId: string, episodeId: string, at: string, removed = false): Promise<void> {
  if (!t.store) {
    await t.q(`INSERT INTO library_items (listener_id, kind, item_key, updated_at${removed ? ', deleted_at' : ''}) VALUES ($1, 'fav_episode', $2, $3${removed ? ', now()' : ''})`, [listenerId, episodeId, at]);
    return;
  }
  const k = await K(); const { encode } = await codec();
  await putItem(t, 'main', encode('libraryItem', k.libraryItem(listenerId, 'fav_episode', episodeId), { listenerId, kind: 'fav_episode', itemKey: episodeId, payload: {}, updatedAt: iso(at), deletedAt: removed ? iso(Date.now()) : null, v: 1 }));
  await (await facts()).refreshFact(t.store, { kind: 'save', listenerId, episodeId });
}

/** A share event at `at`. */
export async function seedShare(t: TestDb, s: { listenerId: string | null; targetKind: string; targetId: string; feedUrl: string; at: string }): Promise<void> {
  if (!t.store) {
    await t.q('INSERT INTO share_events (listener_id, target_kind, target_id, feed_url, at) VALUES ($1, $2, $3, $4, $5)', [s.listenerId, s.targetKind, s.targetId, s.feedUrl, s.at]);
    return;
  }
  const k = await K(); const { encode } = await codec(); const { nextSeq } = await import('../src/db/ddb/seq.ts'); const { tx } = await import('../src/db/ddb/tx.ts');
  const F = await facts();
  const id = await nextSeq(t.store, 'share_events');
  const at = iso(s.at); const fk = k.feedKey(s.feedUrl); const sk = `S#${k.ts(at)}#${k.pad(id)}`;
  const t2 = tx(t.store).put('events', encode('shareEvent', k.stFact(fk, sk), { id, listenerId: s.listenerId, targetKind: s.targetKind, targetId: s.targetId, feedUrl: s.feedUrl, at }, { gsi: k.E1(k.day(at), 'st', `${fk}#${sk}`) }));
  F.rollAdd(t2, fk, 'shares', k.ts(at).slice(0, 13), 1);
  await t2.commit();
}

export async function shareCount(t: TestDb, feedUrl: string): Promise<number> {
  if (!t.store) return Number((await t.q<{ n: number }>('SELECT count(*)::int AS n FROM share_events WHERE feed_url = $1', [feedUrl]))[0]!.n);
  return (await (await facts()).factsOf(t.store, feedUrl)).shares.length;
}

/** The stored heat of an episode set to these buckets (the old INSERT INTO episode_heat). */
export async function seedHeat(t: TestDb, episodeId: string, buckets: Record<number, number>): Promise<void> {
  if (!t.store) {
    for (const [b, n] of Object.entries(buckets)) await t.q('INSERT INTO episode_heat (episode_id, bucket, distinct_listeners) VALUES ($1, $2, $3)', [episodeId, Number(b), n]);
    return;
  }
  const k = await K(); const { encode } = await codec();
  const b = Array.from({ length: 100 }, (_, i) => buckets[i] ?? 0);
  await putItem(t, 'main', encode('heat', k.heat(episodeId), { episodeId, b, v: 1, updatedAt: iso(Date.now()) }));
}

/** An earning as lane PD writes it (a sale, gift or tip of a show); the Postgres rows as the old test made them. */
export async function seedEarning(t: TestDb, e: { buyerId: string; feedUrl: string; kind: 'sale' | 'gift' | 'tip'; micros: number | null; status: 'active' | 'refunded'; at: string; product: string }): Promise<void> {
  if (!t.store) {
    const [p] = await t.q<{ id: string }>(
      `INSERT INTO purchases (listener_id, store, product_id, store_txn_id, status, amount_micros, currency, ref, created_at)
       VALUES ($1, 'google', $2, gen_random_uuid()::text, $3, $4, $5, $6, $7) RETURNING id`,
      [e.buyerId, e.product, e.status, e.micros, e.micros === null ? null : 'USD', e.kind === 'sale' ? e.feedUrl : null, e.at]);
    if (e.kind === 'gift') await t.q("INSERT INTO gifts (code, buyer_id, feed_url, purchase_id) VALUES (substr(md5(random()::text), 1, 16), $1, $2, $3)", [e.buyerId, e.feedUrl, p!.id]);
    if (e.kind === 'tip') await t.q('INSERT INTO tips (from_listener, to_feed_url, purchase_id) VALUES ($1, $2, $3)', [e.buyerId, e.feedUrl, p!.id]);
    return;
  }
  const { randomUUID } = await import('node:crypto');
  const k = await K(); const { encode } = await codec();
  const pid = randomUUID(); const at = iso(e.at);
  await putItem(t, 'main', encode('earning', k.earning(e.feedUrl, at, pid), { kind: e.kind, purchaseId: pid, feedUrl: e.feedUrl, amountMicros: e.micros, currency: e.micros === null ? null : 'USD', refunded: e.status === 'refunded', createdAt: at }));
}

/**
 * SC-006's big show on DynamoDB, written with BatchWrite in the items' own shapes (the Postgres seed is set-based SQL):
 * 500 episodes, 2 000 listeners subscribed, one play and one like each, 10 000 comments. The plays and likes are written
 * as the Studio facts their hooks would make (with their rollups), since nothing else here reads activity or reactions.
 */
export async function bulkBigShow(t: TestDb, feedUrl: string): Promise<void> {
  const store = t.store!;
  const [{ randomUUID }, k, { encode }, { batchWriteAll }, { update }] = await Promise.all([
    import('node:crypto'), K(), codec(), import('../src/db/ddb/batch.ts'), import('../src/db/ddb/store.ts'),
  ]);
  const now = Date.now();
  const fk = k.feedKey(feedUrl);
  const eps = Array.from({ length: 500 }, (_, j) => j + 1);
  await batchWriteAll(store, 'main', eps.map((i) => {
    const publishedAt = iso(now - i * 86_400_000);
    return { put: encode('episode', k.episode(`E${i}`), { id: `E${i}`, feedUrl, feedKey: fk, guid: `g${i}`, title: `Episode ${i}`, showTitle: 'Big', enclosureUrl: `https://cdn/${i}.mp3`, durationMs: 3_600_000, publishedAt, firstSeenAt: iso(now), updatedAt: iso(now), v: 1 }, { gsi: k.G2eps(feedUrl, publishedAt, `E${i}`) }) };
  }));
  const ls = Array.from({ length: 2000 }, (_, j) => ({ n: j + 1, id: randomUUID() }));
  const at = iso(now);
  const main: { put: Row }[] = [];
  const events: { put: Row }[] = [];
  const rolls = new Map<string, number>();
  for (const l of ls) {
    main.push({ put: encode('listener', k.listener(l.id), { id: l.id, email: `l${l.n}@example.com`, displayName: `L${l.n}`, createdAt: at, rulesAcceptedAt: at, listenedMs: 0 }) });
    main.push({ put: encode('subscription', k.subscription(l.id, feedUrl), { listenerId: l.id, feedUrl, createdAt: at, deletedAt: null, starred: false, v: 1 }, { gsi: k.G2subs(feedUrl, at, l.id) }) });
    const ep = `E${1 + (l.n % 500)}`;
    const d = iso(now - (l.n % 60) * 86_400_000).slice(0, 10);
    events.push({ put: encode('stPlay', k.stFact(fk, `P#${d}#${ep}#${l.id}`), { episodeId: ep, listenerId: l.id, day: d, at, activityId: l.n, v: 1 }) });
    events.push({ put: encode('stLike', k.stFact(fk, `L#${ep}#${l.id}`), { episodeId: ep, listenerId: l.id, at, v: 1 }) });
    rolls.set(`plays|${d}`, (rolls.get(`plays|${d}`) ?? 0) + 1);
    rolls.set(`likes|${at.slice(0, 13)}`, (rolls.get(`likes|${at.slice(0, 13)}`) ?? 0) + 1);
  }
  for (let i = 1; i <= 10_000; i++) {
    const id = randomUUID();
    const ep = `E${1 + (i % 500)}`;
    const createdAt = iso(now - (i % 90) * 86_400_000);
    main.push({ put: encode('comment', k.comment(ep, createdAt, id), { id, episodeId: ep, authorId: ls[i % 2000]!.id, body: `comment ${i}`, offsetMs: (i * 997) % 3_600_000, createdAt, parentId: null, likeCount: 0, replyCount: 0, unfriendlyCount: 0 }) });
  }
  await batchWriteAll(store, 'main', main);
  await batchWriteAll(store, 'events', events);
  for (const [key, n] of rolls) {
    const [metric, b] = key.split('|') as [string, string];
    await update(store, 'events', k.stRollup(fk, metric, b), { update: 'SET #t = :t ADD #n :n', names: { '#t': 't', '#n': 'n' }, values: { ':t': 'rollup', ':n': n } });
  }
  await update(store, 'main', k.show(feedUrl), { update: 'SET #t = :t, #f = :f, #c = :c', names: { '#t': 't', '#f': 'feedUrl', '#c': 'subscriberCount' }, values: { ':t': 'show', ':f': feedUrl, ':c': 2000 } });
}

/** A comment soft-deleted (the old `deleted_at = now()` column), on both stores. */
export async function markCommentDeleted(t: TestDb, id: string): Promise<void> {
  await t.q('UPDATE comments SET deleted_at = now() WHERE id = $1', [id]);
  if (!t.store) return;
  const { commentItemById } = await import('../src/db/repos/social/ddb/sc-common.ts');
  const c = await commentItemById(t.store, id);
  if (c) await setAttrs(t, 'main', keyOf(c), { deletedAt: iso(Date.now()) });
}

/** A (feed, guid) hidden by its host, or shown again (the old INSERT / DELETE on hidden_episodes) — for tests that build their own app. */
export async function hideEpisodeRow(t: Pick<TestDb, 'q' | 'db'> & { store?: TestDb['store'] }, feedUrl: string, guid: string, hidden: boolean): Promise<void> {
  if (!t.store) {
    if (hidden) await t.q('INSERT INTO hidden_episodes (feed_url, guid) VALUES ($1,$2)', [feedUrl, guid]);
    else await t.q('DELETE FROM hidden_episodes WHERE feed_url = $1 AND guid = $2', [feedUrl, guid]);
    return;
  }
  await (await import('../src/db/repos/studio/ddb/page.ts')).hideByGuid(t.store, t.db, feedUrl, guid, hidden, null);
}

/** `n` bare listeners `l<i>@x` (the old set-based INSERT), as { id, email }, in email order. */
export async function seedCrowd(t: TestDb, n: number): Promise<{ id: string; email: string }[]> {
  await t.q(`INSERT INTO listeners (email, password_hash, display_name) SELECT 'l' || i || '@x', 'h', 'L' || i FROM generate_series(1, ${Number(n)}) i`);
  const rows = await t.q<{ id: string; email: string }>("SELECT id, email FROM listeners WHERE email LIKE 'l%@x' ORDER BY email");
  if (t.store) {
    const { listenerItem } = await import('./fixtures.ts');
    for (const r of rows) await listenerItem(t.store, { id: r.id, email: r.email, displayName: `L${r.email.slice(1, -2)}` });
  }
  return rows;
}

/** How many Studio (`studio-web`) sessions exist. */
export async function studioSessionCount(t: TestDb): Promise<number> {
  if (!t.store) return (await t.q("SELECT 1 FROM sessions WHERE device_label = 'studio-web'")).length;
  return (await (await import('./fixtures.ts')).acSessions(t.store)).filter((s) => s['deviceLabel'] === 'studio-web').length;
}

/** The kinds of the notices a listener has. */
export async function noticeKinds(t: TestDb, recipientId: string): Promise<string[]> {
  if (!t.store) return (await t.q<{ kind: string }>('SELECT kind FROM notifications WHERE recipient_id = $1', [recipientId])).map((r) => r.kind);
  return (await scan(t, 'main', 'notification')).filter((n) => n['recipientId'] === recipientId).map((n) => String(n['kind']));
}

/** The `commented` activity rows of a comment. */
export async function commentedActivityCount(t: TestDb, commentId: string): Promise<number> {
  if (!t.store) return Number((await t.q<{ n: number }>("SELECT count(*)::int AS n FROM activity WHERE kind = 'commented' AND ref_id = $1", [commentId]))[0]!.n);
  return (await scan(t, 'events', 'activity')).filter((a) => a['kind'] === 'commented' && a['refId'] === commentId).length;
}

/** A listener's optional profile fields the Studio counts (age range, gender, country) — lane AC's item and the Postgres row. */
export async function setDemographics(t: TestDb, id: string, f: { ageRange?: string | null; gender?: string | null; country?: string | null }): Promise<void> {
  if (f.ageRange !== undefined) await t.q('UPDATE listeners SET age_range = $2 WHERE id = $1', [id, f.ageRange]);
  if (f.gender !== undefined) await t.q('UPDATE listeners SET gender = $2 WHERE id = $1', [id, f.gender]);
  if (f.country !== undefined) await t.q('UPDATE listeners SET country = $2 WHERE id = $1', [id, f.country]);
  if (!t.store) return;
  const k = await K();
  const set: Row = {};
  if (f.ageRange !== undefined) set['ageRange'] = f.ageRange;
  if (f.gender !== undefined) set['gender'] = f.gender;
  if (f.country !== undefined) set['country'] = f.country;
  if (Object.keys(set).length) await setAttrs(t, 'main', k.listener(id), set);
}

/** A listener's avatar address (lane AC's item and the Postgres row). */
export async function setAvatarUrl(t: TestDb, id: string, url: string): Promise<void> {
  await t.q('UPDATE listeners SET avatar_url = $2 WHERE id = $1', [id, url]);
  if (t.store) await setAttrs(t, 'main', (await K()).listener(id), { avatarUrl: url });
}
