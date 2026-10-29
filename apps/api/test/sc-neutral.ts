// Lane SC test helpers: seed and read social-content rows (DynamoDB items).
/**
 * M26 lane SC. Each helper writes/reads the DynamoDB items through the lane's own item code (comments, likes,
 * reactions, clips, chat, statuses and their photos).
 */
import type { TestDb } from './harness.ts';
import { setCommentHostHidden, setCommentRemoved } from '../src/db/repos/social/comments.ts';
import { setCommentImage } from '../src/db/repos/social/comment-writes.ts';

type Rec = Record<string, unknown>;

async function scanType(t: TestDb, type: string): Promise<Rec[]> {
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const out: Rec[] = [];
  let start: Rec | undefined;
  do {
    const page = (await t.store.send(new ScanCommand({
      TableName: t.store.tables.main, FilterExpression: '#t = :t', ExpressionAttributeNames: { '#t': 't' }, ExpressionAttributeValues: { ':t': type }, ConsistentRead: true,
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
  await update(t.store, 'main', keyOf(i), {
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
  const { writeComment } = await import('../src/db/repos/social/ddb/comments.ts');
  const item = await writeComment(t.store, t.db, {
    episodeId: c.episodeId, authorId: c.authorId, body: c.body, ...(c.parentId ? { parentId: c.parentId } : {}), ...(c.offsetMs !== undefined ? { offsetMs: c.offsetMs } : {}),
    ...(c.voice ? { voice: c.voice } : {}), ...(c.country ? { country: c.country } : {}),
  }, { at: new Date(Date.now() - (c.agoMs ?? 0)).toISOString() });
  const id = String(item['id']);
  if (c.image) await setCommentImage(t.db, id, c.image.url, c.image.path, c.image.w, c.image.h, c.image.bytes);
  return id;
}

/**
 * Moves comments back in time (replaces `UPDATE comments SET created_at = …`): by `ms` from their own time, or — with
 * `fromNow` — to `ms` before now. One comment with `id`. The comment's and its author-index item's
 * `createdAt` move (the 5-second floor and the 10-minute picture window read them); the sort keys keep the order.
 */
export async function backdateComments(t: TestDb, ms: number, opts: { id?: string; authorId?: string; fromNow?: boolean } = {}): Promise<void> {
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
  return (await scanType(t, 'comment'))
      .sort((a, b) => String(a['createdAt']).localeCompare(String(b['createdAt'])))
      .map((i) => ({ id: String(i['id']), body: (i['body'] as string | undefined) ?? null, author_id: (i['authorId'] as string | undefined) ?? null, offset_ms: i['offsetMs'] === undefined || i['offsetMs'] === null ? null : Number(i['offsetMs']), deleted_at: (i['deletedAt'] as string | undefined) ?? null }));
}

/** A comment's stored recording / picture path (the sweep's result). */
export async function commentMedia(t: TestDb, id: string): Promise<{ voice_url: string | null; image_path: string | null }> {
  const i = (await scanType(t, 'comment')).find((x) => x['id'] === id);
  return { voice_url: (i?.['voiceUrl'] as string | undefined) ?? null, image_path: (i?.['imagePath'] as string | undefined) ?? null };
}

/** The region stored with a comment (by its body). */
export async function commentCountry(t: TestDb, body: string): Promise<string | null> {
  return ((await scanType(t, 'comment')).find((i) => i['body'] === body)?.['country'] as string | undefined) ?? null;
}

/** The stored heat rows of an episode, by bucket (the HEAT item's 100 numbers, lane LB's helper). */
export async function heatRows(t: TestDb, episodeId: string): Promise<{ bucket: number; distinct_listeners: number }[]> {
  const { heatCurve } = await import('../src/heat/ddb.ts');
  const { drainOutbox } = await import('../src/jobs/outbox.ts');
  await drainOutbox(t.store); // M32 C6: the curve moves in the outbox
  return (await heatCurve(t.store, episodeId)).flatMap((n, bucket) => (n > 0 ? [{ bucket, distinct_listeners: n }] : []));
}

const TYPES = {
  comments: 'comment',
  comment_likes: 'commentLikeBy',
  reactions: 'reaction',
  clips: 'clip',
  chat_messages: 'chatMessage',
  voice_posts: 'voicePost',
  status_replies: 'statusReply',
  status_reactions: 'statusReaction',
  status_items: 'statusItem',
  status_photos: 'statusPhoto',
} as const;

/** How many rows of one of this lane's tables (items of the type). */
export async function countOf(t: TestDb, what: keyof typeof TYPES): Promise<number> {
  return (await scanType(t, TYPES[what])).length;
}

/** The ids of the stored statuses (optionally one listener's). */
export async function voicePostIds(t: TestDb, listenerId?: string): Promise<string[]> {
  return (await scanType(t, 'voicePost')).filter((p) => !listenerId || p['listenerId'] === listenerId).map((p) => String(p['id']));
}

/** Every status expired `agoMs` ago (replaces `UPDATE voice_posts SET expires_at = now() - …`): the item, its queue key, its index entry. */
export async function expireStatuses(t: TestDb, agoMs: number, listenerId?: string): Promise<void> {
  const at = new Date(Date.now() - agoMs).toISOString();
  for (const p of await scanType(t, 'voicePost')) if (!listenerId || p['listenerId'] === listenerId) await setAttrs(t, p, { expiresAt: at, G4SK: `${at}#${String(p['id'])}` });
  for (const p of await scanType(t, 'voicePostPtr')) if (!listenerId || p['PK'] === `L#${listenerId}`) await setAttrs(t, p, { expiresAt: at });
}

/** One status expired `agoMs` ago (replaces `UPDATE voice_posts SET expires_at = now() - … WHERE id = …`). */
export async function expireStatus(t: TestDb, postId: string, agoMs: number): Promise<void> {
  const at = new Date(Date.now() - agoMs).toISOString();
  for (const p of await scanType(t, 'voicePost')) if (p['id'] === postId) await setAttrs(t, p, { expiresAt: at, G4SK: `${at}#${postId}` });
  for (const p of await scanType(t, 'voicePostPtr')) if (p['id'] === postId) await setAttrs(t, p, { expiresAt: at });
}

/** Every uploaded status photo `ms` old (replaces `UPDATE cache SET fetched_at = … WHERE key LIKE 'status-photo:%'`). */
export async function ageStatusPhotos(t: TestDb, ms: number): Promise<void> {
  const at = new Date(Date.now() - ms).toISOString();
  for (const u of await scanType(t, 'statusPhoto')) {
    await setAttrs(t, u, { uploadedAt: at, ...(u['G4PK'] ? { G4SK: `${at}#${String(u['G4SK']).split('#').pop()}` } : {}) });
  }
}

/** `n` reactions from `n` new listeners on a status (US2 scenario 5's 99). */
export async function seedStatusReactions(t: TestDb, postId: string, n: number): Promise<void> {
  const [{ randomUUID }, { encode }, K, { batchWriteAll }, { update, get }] = await Promise.all([
    import('node:crypto'), import('../src/db/ddb/codec.ts'), import('../src/db/ddb/keys.ts'), import('../src/db/ddb/batch.ts'), import('../src/db/ddb/store.ts'),
  ]);
  const post = await get(t.store, 'main', K.voicePost(postId));
  const expiresAt = String(post?.['expiresAt']);
  const at = new Date().toISOString();
  await batchWriteAll(t.store, 'main', Array.from({ length: n }, () => {
    const listenerId = randomUUID();
    return { put: encode('statusReaction', K.statusReaction(postId, listenerId), { postId, listenerId, kind: 1, createdAt: at, expiresAt }) };
  }));
  await update(t.store, 'main', K.voicePost(postId), { update: 'ADD #n :n', names: { '#n': 'reactionCount' }, values: { ':n': n } });
}

/** A listener's row fields the account lane owns (replaces `UPDATE listeners SET …`): the listener item. */
export async function setListenerFields(t: TestDb, id: string, f: { rulesAccepted?: null; listenedMs?: number; hideBadge?: boolean }): Promise<void> {
  const K = await import('../src/db/ddb/keys.ts');
  const item = { PK: K.listener(id).PK, SK: K.listener(id).SK };
  await setAttrs(t, item, {
    ...(f.listenedMs !== undefined ? { listenedMs: f.listenedMs } : {}), ...(f.hideBadge !== undefined ? { hideBadge: f.hideBadge } : {}),
  }, f.rulesAccepted === null ? ['rulesAcceptedAt'] : []);
}

/** Moves one clip `seconds` after now (replaces `UPDATE clips SET created_at = now() + … WHERE client_id = …`). */
export async function setClipTime(t: TestDb, clientId: string, seconds: number): Promise<void> {
  const { moveClipTime } = await import('../src/db/repos/social/ddb/clips.ts');
  const c = (await scanType(t, 'clip')).find((i) => i['clientId'] === clientId);
  if (c) await moveClipTime(t.store, String(c['id']), new Date(Date.now() + seconds * 1000).toISOString());
}

/**
 * An account and everything it owns goes (the chat test's "deleting an account deletes its messages"): the deletion
 * job (lane AC) with this lane's social phase.
 */
export async function deleteListenerNow(t: TestDb, id: string): Promise<void> {
  const { deleteAccount } = await import('../src/db/repos/account/delete-account.ts');
  await deleteAccount(t.db, id);
}
