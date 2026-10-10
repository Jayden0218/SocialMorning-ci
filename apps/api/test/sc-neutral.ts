// Lane SC test helpers that seed and read social-content rows on whichever backend the test runs (TEST_BACKEND).
/**
 * M26 lane SC (tasks.md "convert the lane's test files from t.q() to fixtures"). The lane's test files run on BOTH
 * backends while the domains move one by one: on Postgres (the gate, postgres-api) each helper is the SQL the test
 * used to hold; under TEST_BACKEND=ddb it writes/reads the DynamoDB items through the lane's own item code — and, for
 * rows another lane's SQL still reads (comments, statuses, clips …), the Postgres row too, as the bridge does
 * (src/db/backend.ts). Rows of lanes still on Postgres (activity, follows, reports, creator claims, moderation) are
 * still seeded and read with `t.q` in the tests. DynamoDB modules are imported only on the DynamoDB path.
 */
import type { TestDb } from './harness.ts';
import { TEST_BACKEND } from './harness.ts';
import { setCommentHostHidden, setCommentRemoved } from '../src/db/repos/social/comments.ts';
import { setCommentImage } from '../src/db/repos/social/comment-writes.ts';

const DDB = TEST_BACKEND === 'ddb';
type Rec = Record<string, unknown>;

async function scanType(t: TestDb, type: string): Promise<Rec[]> {
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const out: Rec[] = [];
  let start: Rec | undefined;
  do {
    const page = (await t.store!.send(new ScanCommand({
      TableName: t.store!.tables.main, FilterExpression: '#t = :t', ExpressionAttributeNames: { '#t': 't' }, ExpressionAttributeValues: { ':t': type }, ConsistentRead: true,
      ...(start ? { ExclusiveStartKey: start } : {}),
    }))) as { Items?: Rec[]; LastEvaluatedKey?: Rec };
    out.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start);
  return out;
}

const keyOf = (i: Rec) => ({ PK: String(i['PK']), SK: String(i['SK']) });

async function setAttrs(t: TestDb, i: Rec, set: Rec, remove: string[] = []): Promise<void> {
  const { update } = await import('../src/db/ddb/store.ts');
  const names: Record<string, string> = {};
  const values: Rec = {};
  const parts = Object.entries(set).map(([k, v], n) => { names[`#s${n}`] = k; values[`:s${n}`] = v; return `#s${n} = :s${n}`; });
  const rems = remove.map((k, n) => { names[`#r${n}`] = k; return `#r${n}`; });
  await update(t.store!, 'main', keyOf(i), {
    update: `${parts.length ? `SET ${parts.join(', ')}` : ''}${rems.length ? ` REMOVE ${rems.join(', ')}` : ''}`.trim(),
    names, ...(Object.keys(values).length ? { values: values as never } : {}),
  });
}

/**
 * A comment written straight in (the route allows one every few seconds), `agoMs` in the past, optionally with a
 * recording, a region and a picture. Returns its id.
 */
export async function seedComment(t: TestDb, c: {
  episodeId: string; authorId: string; body: string; parentId?: string; offsetMs?: number; agoMs?: number;
  voice?: { url: string; path: string; ms: number; transcript?: string }; country?: string; image?: { url: string; path: string; w: number; h: number; bytes: number };
}): Promise<string> {
  let id: string;
  if (DDB) {
    const { writeComment } = await import('../src/db/repos/social/ddb/comments.ts');
    const item = await writeComment(t.store!, t.db, {
      episodeId: c.episodeId, authorId: c.authorId, body: c.body, ...(c.parentId ? { parentId: c.parentId } : {}), ...(c.offsetMs !== undefined ? { offsetMs: c.offsetMs } : {}),
      ...(c.voice ? { voice: c.voice } : {}), ...(c.country ? { country: c.country } : {}),
    }, { at: new Date(Date.now() - (c.agoMs ?? 0)).toISOString() });
    id = String(item['id']);
  } else {
    const [r] = await t.q<{ id: string }>(
      `INSERT INTO comments (episode_id, author_id, body, parent_id, offset_ms, created_at, voice_url, voice_path, voice_ms, transcript, country)
       VALUES ($1, $2, $3, $4, $5, now() - ($6 || ' milliseconds')::interval, $7, $8, $9, $10, $11) RETURNING id`,
      [c.episodeId, c.authorId, c.body, c.parentId ?? null, c.offsetMs ?? null, String(c.agoMs ?? 0),
        c.voice?.url ?? null, c.voice?.path ?? null, c.voice?.ms ?? null, c.voice?.transcript ?? null, c.country ?? null],
    );
    id = r!.id;
  }
  if (c.image) await setCommentImage(t.db, id, c.image.url, c.image.path, c.image.w, c.image.h, c.image.bytes);
  return id;
}

/**
 * Moves comments back in time (replaces `UPDATE comments SET created_at = …`): by `ms` from their own time, or — with
 * `fromNow` — to `ms` before now. One comment with `id`. On DynamoDB the comment's and its author-index item's
 * `createdAt` move (the 5-second floor and the 10-minute picture window read them); the sort keys keep the order.
 */
export async function backdateComments(t: TestDb, ms: number, opts: { id?: string; authorId?: string; fromNow?: boolean } = {}): Promise<void> {
  const where = opts.id ? ' WHERE id = $2' : opts.authorId ? ' WHERE author_id = $2' : '';
  const params = opts.id ? [String(ms), opts.id] : opts.authorId ? [String(ms), opts.authorId] : [String(ms)];
  await t.q(opts.fromNow
    ? `UPDATE comments SET created_at = now() - ($1 || ' milliseconds')::interval${where}`
    : `UPDATE comments SET created_at = created_at - ($1 || ' milliseconds')::interval${where}`, params);
  if (!DDB) return;
  const at = (cur: unknown) => new Date(opts.fromNow ? Date.now() - ms : Date.parse(String(cur)) - ms).toISOString();
  for (const type of ['comment', 'authorComment']) {
    for (const i of await scanType(t, type)) {
      if (opts.id && i['id'] !== opts.id) continue;
      if (opts.authorId && (type === 'comment' ? i['authorId'] !== opts.authorId : i['PK'] !== `L#${opts.authorId}`)) continue;
      await setAttrs(t, i, { createdAt: at(i['createdAt']) });
    }
  }
}

/** Moderation's removal / the host's hide (lanes SF and ST write them through these repo functions once they move). */
export async function setCommentFlags(t: TestDb, id: string, f: { removed?: boolean; hostHiddenBy?: string | null }): Promise<void> {
  if (f.removed !== undefined) await setCommentRemoved(t.db, id, f.removed);
  if (f.hostHiddenBy !== undefined) await setCommentHostHidden(t.db, id, f.hostHiddenBy);
}

/** Every comment as `SELECT id, body, author_id, offset_ms, deleted_at FROM comments ORDER BY created_at`. */
export async function commentRows(t: TestDb): Promise<{ id: string; body: string | null; author_id: string | null; offset_ms: number | null; deleted_at: string | null }[]> {
  if (DDB) {
    return (await scanType(t, 'comment'))
      .sort((a, b) => String(a['createdAt']).localeCompare(String(b['createdAt'])))
      .map((i) => ({ id: String(i['id']), body: (i['body'] as string | undefined) ?? null, author_id: (i['authorId'] as string | undefined) ?? null, offset_ms: i['offsetMs'] === undefined || i['offsetMs'] === null ? null : Number(i['offsetMs']), deleted_at: (i['deletedAt'] as string | undefined) ?? null }));
  }
  return t.q('SELECT id, body, author_id, offset_ms, deleted_at FROM comments ORDER BY created_at');
}

/** A comment's stored recording / picture path (the sweep's result). */
export async function commentMedia(t: TestDb, id: string): Promise<{ voice_url: string | null; image_path: string | null }> {
  if (DDB) {
    const i = (await scanType(t, 'comment')).find((x) => x['id'] === id);
    return { voice_url: (i?.['voiceUrl'] as string | undefined) ?? null, image_path: (i?.['imagePath'] as string | undefined) ?? null };
  }
  const [r] = await t.q<{ voice_url: string | null; image_path: string | null }>('SELECT voice_url, image_path FROM comments WHERE id = $1', [id]);
  return r ?? { voice_url: null, image_path: null };
}

/** The region stored with a comment (by its body). */
export async function commentCountry(t: TestDb, body: string): Promise<string | null> {
  if (DDB) return ((await scanType(t, 'comment')).find((i) => i['body'] === body)?.['country'] as string | undefined) ?? null;
  const [r] = await t.q<{ country: string | null }>('SELECT country FROM comments WHERE body = $1', [body]);
  return r?.country ?? null;
}

/** The stored heat rows of an episode, by bucket (DynamoDB: the HEAT item's 100 numbers, lane LB's helper). */
export async function heatRows(t: TestDb, episodeId: string): Promise<{ bucket: number; distinct_listeners: number }[]> {
  if (DDB) {
    const { heatCurve } = await import('../src/heat/ddb.ts');
    return (await heatCurve(t.store!, episodeId)).flatMap((n, bucket) => (n > 0 ? [{ bucket, distinct_listeners: n }] : []));
  }
  return t.q('SELECT bucket, distinct_listeners FROM episode_heat WHERE episode_id = $1 ORDER BY bucket', [episodeId]);
}

const TYPES = {
  comments: ['comment', 'SELECT count(*)::int AS n FROM comments'],
  comment_likes: ['commentLikeBy', 'SELECT count(*)::int AS n FROM comment_likes'],
  reactions: ['reaction', 'SELECT count(*)::int AS n FROM reactions'],
  clips: ['clip', 'SELECT count(*)::int AS n FROM clips'],
  chat_messages: ['chatMessage', 'SELECT count(*)::int AS n FROM chat_messages'],
  voice_posts: ['voicePost', 'SELECT count(*)::int AS n FROM voice_posts'],
  status_replies: ['statusReply', 'SELECT count(*)::int AS n FROM status_replies'],
  status_reactions: ['statusReaction', 'SELECT count(*)::int AS n FROM status_reactions'],
  status_items: ['statusItem', 'SELECT count(*)::int AS n FROM status_items'],
  status_photos: ['statusPhoto', "SELECT count(*)::int AS n FROM cache WHERE key LIKE 'status-photo:%'"],
} as const;

/** How many rows of one of this lane's tables (DynamoDB: items of the type). */
export async function countOf(t: TestDb, what: keyof typeof TYPES): Promise<number> {
  const [type, sql] = TYPES[what];
  if (DDB) return (await scanType(t, type)).length;
  return Number((await t.q<{ n: number }>(sql))[0]!.n);
}

/** The ids of the stored statuses (optionally one listener's). */
export async function voicePostIds(t: TestDb, listenerId?: string): Promise<string[]> {
  if (DDB) return (await scanType(t, 'voicePost')).filter((p) => !listenerId || p['listenerId'] === listenerId).map((p) => String(p['id']));
  return (listenerId ? await t.q<{ id: string }>('SELECT id FROM voice_posts WHERE listener_id = $1', [listenerId]) : await t.q<{ id: string }>('SELECT id FROM voice_posts')).map((r) => r.id);
}

/** Every status expired `agoMs` ago (replaces `UPDATE voice_posts SET expires_at = now() - …`): the item, its queue key, its index entry. */
export async function expireStatuses(t: TestDb, agoMs: number, listenerId?: string): Promise<void> {
  if (listenerId) await t.q("UPDATE voice_posts SET expires_at = now() - ($1 || ' milliseconds')::interval WHERE listener_id = $2", [String(agoMs), listenerId]);
  else await t.q("UPDATE voice_posts SET expires_at = now() - ($1 || ' milliseconds')::interval", [String(agoMs)]);
  if (!DDB) return;
  const at = new Date(Date.now() - agoMs).toISOString();
  for (const p of await scanType(t, 'voicePost')) if (!listenerId || p['listenerId'] === listenerId) await setAttrs(t, p, { expiresAt: at, G4SK: `${at}#${String(p['id'])}` });
  for (const p of await scanType(t, 'voicePostPtr')) if (!listenerId || p['PK'] === `L#${listenerId}`) await setAttrs(t, p, { expiresAt: at });
}

/** One status expired `agoMs` ago (replaces `UPDATE voice_posts SET expires_at = now() - … WHERE id = …`). */
export async function expireStatus(t: TestDb, postId: string, agoMs: number): Promise<void> {
  await t.q("UPDATE voice_posts SET expires_at = now() - ($1 || ' milliseconds')::interval WHERE id = $2", [String(agoMs), postId]);
  if (!DDB) return;
  const at = new Date(Date.now() - agoMs).toISOString();
  for (const p of await scanType(t, 'voicePost')) if (p['id'] === postId) await setAttrs(t, p, { expiresAt: at, G4SK: `${at}#${postId}` });
  for (const p of await scanType(t, 'voicePostPtr')) if (p['id'] === postId) await setAttrs(t, p, { expiresAt: at });
}

/** Every uploaded status photo `ms` old (replaces `UPDATE cache SET fetched_at = … WHERE key LIKE 'status-photo:%'`). */
export async function ageStatusPhotos(t: TestDb, ms: number): Promise<void> {
  await t.q("UPDATE cache SET fetched_at = now() - ($1 || ' milliseconds')::interval WHERE key LIKE 'status-photo:%'", [String(ms)]);
  if (!DDB) return;
  const at = new Date(Date.now() - ms).toISOString();
  for (const u of await scanType(t, 'statusPhoto')) {
    await setAttrs(t, u, { uploadedAt: at, ...(u['G4PK'] ? { G4SK: `${at}#${String(u['G4SK']).split('#').pop()}` } : {}) });
  }
}

/** `n` reactions from `n` new listeners on a status (US2 scenario 5's 99). */
export async function seedStatusReactions(t: TestDb, postId: string, n: number): Promise<void> {
  await t.q(`WITH l AS (INSERT INTO listeners (email, password_hash, display_name) SELECT 'f' || g || '@x', 'h', 'F' || g FROM generate_series(1, ${Number(n)}) g RETURNING id)
             INSERT INTO status_reactions (post_id, listener_id, kind) SELECT $1::uuid, id, 1 FROM l`, [postId]);
  if (!DDB) return;
  const [{ randomUUID }, { encode }, K, { batchWriteAll }, { update, get }] = await Promise.all([
    import('node:crypto'), import('../src/db/ddb/codec.ts'), import('../src/db/ddb/keys.ts'), import('../src/db/ddb/batch.ts'), import('../src/db/ddb/store.ts'),
  ]);
  const post = await get(t.store!, 'main', K.voicePost(postId));
  const expiresAt = String(post?.['expiresAt']);
  const at = new Date().toISOString();
  await batchWriteAll(t.store!, 'main', Array.from({ length: n }, () => {
    const listenerId = randomUUID();
    return { put: encode('statusReaction', K.statusReaction(postId, listenerId), { postId, listenerId, kind: 1, createdAt: at, expiresAt }) };
  }));
  await update(t.store!, 'main', K.voicePost(postId), { update: 'ADD #n :n', names: { '#n': 'reactionCount' }, values: { ':n': n } });
}

/** A listener's row fields the account lane owns (replaces `UPDATE listeners SET …`): the Postgres row and the DynamoDB item. */
export async function setListenerFields(t: TestDb, id: string, f: { rulesAccepted?: null; listenedMs?: number; hideBadge?: boolean }): Promise<void> {
  if (f.rulesAccepted === null) await t.q('UPDATE listeners SET rules_accepted_at = NULL WHERE id = $1', [id]);
  if (f.listenedMs !== undefined) await t.q('UPDATE listeners SET listened_ms = $2 WHERE id = $1', [id, f.listenedMs]);
  if (f.hideBadge !== undefined) await t.q('UPDATE listeners SET hide_badge = $2 WHERE id = $1', [id, f.hideBadge]);
  if (!DDB) return;
  const K = await import('../src/db/ddb/keys.ts');
  const item = { PK: K.listener(id).PK, SK: K.listener(id).SK };
  await setAttrs(t, item, {
    ...(f.listenedMs !== undefined ? { listenedMs: f.listenedMs } : {}), ...(f.hideBadge !== undefined ? { hideBadge: f.hideBadge } : {}),
  }, f.rulesAccepted === null ? ['rulesAcceptedAt'] : []);
}

/** Moves one clip `seconds` after now (replaces `UPDATE clips SET created_at = now() + … WHERE client_id = …`). */
export async function setClipTime(t: TestDb, clientId: string, seconds: number): Promise<void> {
  await t.q(`UPDATE clips SET created_at = now() + ($1 || ' seconds')::interval WHERE client_id = $2`, [String(seconds), clientId]);
  if (!DDB) return;
  const { moveClipTime } = await import('../src/db/repos/social/ddb/clips.ts');
  const c = (await scanType(t, 'clip')).find((i) => i['clientId'] === clientId);
  if (c) await moveClipTime(t.store!, String(c['id']), new Date(Date.now() + seconds * 1000).toISOString());
}

/**
 * An account and everything it owns goes (the chat test's "deleting an account deletes its messages"): on Postgres the
 * row and its foreign-key cascades, as the test always did; on DynamoDB the deletion job (lane AC) with this lane's
 * social phase.
 */
export async function deleteListenerNow(t: TestDb, id: string): Promise<void> {
  if (DDB) {
    const { deleteAccount } = await import('../src/db/repos/account/delete-account.ts');
    await deleteAccount(t.db, id);
    return;
  }
  await t.q('DELETE FROM listeners WHERE id = $1', [id]);
}
