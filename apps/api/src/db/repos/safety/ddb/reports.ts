// Reports on DynamoDB: the key is the one-report-per-reporter rule, the open queue, closed reports kept 90 days.
/**
 * M26 lane SF (SF-26…SF-44; data-model.md §3 `RPT#`, SF hard case 3).
 * - `RPT#<kind>#<targetId>` / `BY#<reporterId>` — the PK/SK pair IS the UNIQUE (target_kind, target_id, reporter_id)
 *   (guard G-M26-SF1): the report is put with `attribute_not_exists(PK)`, so a second report by the same reporter
 *   cancels and reads back as `duplicate`. "Close every open report on a target" is one Query of the partition.
 * - G4: `Q#reports-open` / `<createdAt>#<id>` while open; `Q#reports-closed` / `<closedAt>#<id>` once closed, with
 *   TTL closedAt + 90 days as the backstop (the hourly purge deletes on time — FR-016, constitution 006).
 * - G5 `REF#report#<id>` (by id — the Studio's transcript reports), G1 `AUTH#<the reported person>` / `report#…`
 *   (Admin › user › reports against), G2 `SHTR#<feedKey>` on transcript reports (the Studio list per feed).
 * - `L#<reporter>/RPTBY#<createdAt>#<id>`: the reporter's own copy, in the same transaction — "hidden for the
 *   reporter at once", the 20-an-hour limit and the safety stamp read it strongly (own writes).
 * - `R#dash#reports` (dash.ts) moves in the same transaction.
 * Bridge: `reports` is read by lanes still on Postgres (comments' "reported by me", admin lists, account deletion),
 * so each write also writes its Postgres row with the same id.
 */
import { randomUUID } from 'node:crypto';
import { closeReason, hiddenKey, type TargetKind } from '@socialmorning/social-core';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, update } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { batchWriteAll } from '../../../ddb/batch.ts';
import { getEpisode } from '../../library/episodes.ts';
import type { CreateResult, QueueRow, Snapshot, TranscriptDetail, TranscriptReport } from '../reports.ts';
import { dashAdd } from './dash.ts';
import { chatBefore, chatRow, clipRow, commentRow, sharedListRow, statusRow } from './foreign.ts';
import { bridgeOf, byRef, DAY_MS, getMany, HOUR_MS, isUuid, keyOf, listenersById, nowIso, nowMs, partition, pgOf, queue, type Db, type Item, type Store } from './common.ts';

export const KEEP_CLOSED_DAYS = 90;
const RPT = (kind: string, targetId: string) => `RPT#${kind}#${targetId}`;

const nameOf = async (store: Store, id: string | null | undefined): Promise<string | null> => {
  if (!id || !isUuid(id)) return null;
  const l = await get(store, 'main', K.listener(id));
  return l ? String(l['displayName']) : null;
};

export async function snapshotTarget(store: Store, db: Db, kind: TargetKind, id: string, detail?: TranscriptDetail): Promise<{ snapshot: Snapshot; authorId: string | null; gone: boolean }> {
  const pg = pgOf(db);
  const gone = { snapshot: { kind, id }, authorId: null, gone: true };
  switch (kind) {
    case 'episode':
    case 'transcript': {
      const episodeId = kind === 'episode' ? id : (detail?.episodeId ?? id.split('#')[0]!);
      const e = await getEpisode(db, episodeId);
      if (!e) return gone;
      const base = { kind, id, episodeId, episodeTitle: e.title, showTitle: e.show_title, feedUrl: e.feed_url };
      return { snapshot: detail ? { ...base, offsetMs: detail.offsetMs, original: detail.original, suggested: detail.suggested } : base, authorId: null, gone: false };
    }
    case 'comment': {
      const r = await commentRow(pg, id);
      if (!r || r.deleted_at !== null || r.removed_at !== null) return gone;
      const e = await getEpisode(db, r.episode_id);
      if (!e) return gone; // the SQL's inner JOIN on episodes
      return { snapshot: { kind, id, body: r.body, offsetMs: r.offset_ms, authorId: r.author_id, authorName: await nameOf(store, r.author_id), episodeId: r.episode_id, episodeTitle: e.title, ...(r.voice_url ? { voiceUrl: r.voice_url } : {}), ...(r.transcript ? { voiceText: r.transcript } : {}), ...(r.image_url ? { imageUrl: r.image_url } : {}) }, authorId: r.author_id, gone: false };
    }
    case 'clip': {
      const r = await clipRow(pg, id);
      if (!r || r.deleted_at !== null || r.removed_at !== null) return gone;
      const [e, authorName] = await Promise.all([getEpisode(db, r.episode_id), nameOf(store, r.author_id)]);
      if (!e || authorName === null) return gone;
      return { snapshot: { kind, id, caption: r.caption, startMs: r.start_ms, endMs: r.end_ms, authorId: r.author_id, authorName, episodeId: r.episode_id, episodeTitle: e.title }, authorId: r.author_id, gone: false };
    }
    case 'profile': {
      const name = await nameOf(store, id);
      if (name === null) return gone;
      return { snapshot: { kind, id, displayName: name }, authorId: id, gone: false };
    }
    case 'show': {
      const show = await get(store, 'main', K.show(id));
      return { snapshot: { kind, id, feedUrl: id, showTitle: (show?.['newestTitle'] as string | undefined) ?? null }, authorId: null, gone: false };
    }
    case 'status': {
      if (!isUuid(id)) return gone;
      const r = await statusRow(pg, id);
      const authorName = r ? await nameOf(store, r.listener_id) : null;
      if (!r || !r.live || authorName === null) return gone;
      return { snapshot: { kind, id, authorId: r.listener_id, authorName, ...(r.body ? { body: r.body } : {}), ...(r.blob_url ? { voiceUrl: r.blob_url } : {}), ...(r.transcript ? { voiceText: r.transcript } : {}) }, authorId: r.listener_id, gone: false };
    }
    case 'chat_message': {
      if (!/^\d{1,18}$/.test(id)) return gone;
      const r = await chatRow(pg, id);
      if (!r || r.removed_at !== null) return gone;
      const [senderName, recipientName] = await Promise.all([nameOf(store, r.sender_id), nameOf(store, r.recipient_id)]);
      if (senderName === null || recipientName === null) return gone;
      const before = await chatBefore(pg, r.sender_id, r.recipient_id, id);
      const name = (who: string) => (who === r.sender_id ? senderName : recipientName);
      return {
        snapshot: {
          kind, id, body: r.body, authorId: r.sender_id, authorName: senderName, recipientId: r.recipient_id, recipientName,
          context: before.reverse().map((m) => ({ from: name(m.sender_id), body: m.body, at: new Date(m.created_at).toISOString() })),
        },
        authorId: r.sender_id, gone: false,
      };
    }
    case 'list': {
      if (!/^[A-Za-z0-9]{10}$/.test(id)) return gone;
      const r = await sharedListRow(pg, id);
      const authorName = r ? await nameOf(store, r.owner_id) : null;
      if (!r || r.removed_at !== null || authorName === null) return gone;
      return { snapshot: { kind, id, title: r.title, showCount: Number(r.n), authorId: r.owner_id, authorName }, authorId: r.owner_id, gone: false };
    }
  }
}

/** The person a report is about (Admin › user › reports against): the profile itself, else the copy's author. */
const reportedPerson = (kind: string, targetId: string, snapshot: Snapshot): string | null => {
  if (kind === 'profile' && isUuid(targetId)) return targetId;
  const a = snapshot['authorId'];
  return typeof a === 'string' && isUuid(a) ? a : null;
};

function reportGsi(r: { id: string; kind: string; targetId: string; createdAt: string; closedAt: string | null; snapshot: Snapshot; feedUrl: string | null }): Record<string, string> {
  const who = reportedPerson(r.kind, r.targetId, r.snapshot);
  return {
    ...(r.closedAt === null ? K.G4('reports-open', r.createdAt, r.id) : K.G4('reports-closed', r.closedAt, r.id)),
    ...K.G5('report', r.id, r.createdAt),
    ...(who ? K.G1(who, 'report', r.createdAt, r.id) : {}),
    ...(r.kind === 'transcript' && r.feedUrl ? { G2PK: `SHTR#${K.feedKey(r.feedUrl)}`, G2SK: `${r.createdAt}#${r.id}` } : {}),
  };
}

export async function createReport(
  store: Store, db: Db, r: { kind: TargetKind; targetId: string; reporterId: string; reason: string; note?: string; detail?: TranscriptDetail },
): Promise<CreateResult> {
  const { snapshot, gone } = await snapshotTarget(store, db, r.kind, r.targetId, r.detail);
  const close = closeReason(gone, false);
  const flag = close === 'already_gone' ? { closed: 'already_gone' as const } : {};
  const key = K.report(r.kind, r.targetId, r.reporterId);
  const was = await get(store, 'main', key);
  if (was) return { id: String(was['id']), duplicate: true, ...flag };
  const id = randomUUID();
  const at = nowIso(store);
  const closedAt = close === 'open' ? null : at;
  const feedUrl = r.kind === 'transcript' && typeof snapshot['feedUrl'] === 'string' ? (snapshot['feedUrl'] as string) : null;
  const t = tx(store)
    .put('main', encode('report', key, {
      id, targetKind: r.kind, targetId: r.targetId, reporterId: r.reporterId, reason: r.reason, note: r.note ?? null, snapshot, detail: r.detail ?? null,
      createdAt: at, closedAt, closedBy: null, closeReason: close === 'open' ? null : close, feedUrl,
    }, { gsi: reportGsi({ id, kind: r.kind, targetId: r.targetId, createdAt: at, closedAt, snapshot, feedUrl }), ...(closedAt ? { ttl: ttlAfter(Date.parse(closedAt), KEEP_CLOSED_DAYS * DAY_MS) } : {}) }),
    { condition: 'attribute_not_exists(PK)', label: 'report' })
    .put('main', encode('reporterMark', K.reporterMark(r.reporterId, at, id), { reportId: id, targetKind: r.kind, targetId: r.targetId, createdAt: at }));
  dashAdd(t, 'reports', at);
  try {
    await t.commit();
  } catch (e) {
    if (!(e instanceof TxCancelled && e.failed('report'))) throw e;
    const now = await get(store, 'main', key);
    return { id: String(now?.['id']), duplicate: true, ...flag };
  }
  const raw = bridgeOf(db);
  if (raw) {
    await raw.query(
      `INSERT INTO reports (id, target_kind, target_id, reporter_id, reason, note, snapshot, closed_at, close_reason, detail, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, ($7::text)::jsonb, $8, $9, ($10::text)::jsonb, $11) ON CONFLICT DO NOTHING`,
      [id, r.kind, r.targetId, r.reporterId, r.reason, r.note ?? null, JSON.stringify(snapshot), closedAt, close === 'open' ? null : close, r.detail ? JSON.stringify(r.detail) : null, at]);
  }
  return { id, duplicate: false, ...flag };
}

/** The reporter's own copies: a strong Query of their partition (RPTBY# sorts by time). */
const marksOf = (store: Store, reporterId: string, fromIso?: string) =>
  partition(store, 'main', K.L(reporterId), fromIso ? { from: `${K.SF_SK.reporterMarks}${fromIso}`, to: `${K.SF_SK.reporterMarks}~` } : { prefix: K.SF_SK.reporterMarks });

export async function reportsInLastHour(store: Store, _db: Db, reporterId: string): Promise<number> {
  const from = new Date(nowMs(store) - HOUR_MS).toISOString();
  return (await marksOf(store, reporterId, from)).filter((m) => String(m['createdAt']) > from).length;
}

export async function hiddenFor(store: Store, _db: Db, viewerId: string): Promise<{ keys: Set<string>; reported: { kind: TargetKind; id: string }[] }> {
  const rows = (await marksOf(store, viewerId)).filter((m) => m['targetKind'] !== 'transcript')
    .map((m) => ({ kind: m['targetKind'] as TargetKind, id: String(m['targetId']) }));
  return { keys: new Set(rows.map((r) => hiddenKey(r.kind, r.id))), reported: rows };
}

async function queueRows(store: Store, items: Item[]): Promise<QueueRow[]> {
  const names = await listenersById(store, items.map((i) => String(i['reporterId'] ?? '')));
  return items.map((i) => {
    const reporter = (i['reporterId'] as string | null | undefined) ?? null;
    return {
      id: String(i['id']), target_kind: i['targetKind'] as TargetKind, target_id: String(i['targetId']), reporter_id: reporter,
      display_name: reporter ? ((names.get(reporter)?.['displayName'] as string | undefined) ?? null) : null,
      reason: String(i['reason']), note: (i['note'] as string | null | undefined) ?? null, snapshot: i['snapshot'] ?? {},
      created_at: String(i['createdAt']), closed_at: (i['closedAt'] as string | null | undefined) ?? null, close_reason: (i['closeReason'] as string | null | undefined) ?? null,
    };
  });
}

export async function openReports(store: Store, _db: Db): Promise<QueueRow[]> {
  return queueRows(store, await queue(store, 'reports-open', { newestFirst: true }));
}

export async function closedReports(store: Store, _db: Db, days: number): Promise<QueueRow[]> {
  const from = new Date(nowMs(store) - days * DAY_MS).toISOString();
  const items = (await queue(store, 'reports-closed', { from, newestFirst: true })).filter((i) => String(i['closedAt']) > from);
  return queueRows(store, items);
}

/** Every open report on the target closes with this action (or reason). Returns how many. */
export async function closeReportsFor(store: Store, db: Db, kind: TargetKind, targetId: string, actionId: string | null, reason: string): Promise<number> {
  const at = nowIso(store);
  let n = 0;
  for (const r of await partition(store, 'main', RPT(kind, targetId))) {
    if (r['closedAt']) continue;
    const id = String(r['id']);
    try {
      await update(store, 'main', keyOf(r), {
        update: 'SET #ca = :at, #cb = :by, #cr = :why, #ttl = :ttl, G4PK = :q, G4SK = :qs',
        condition: 'attribute_exists(PK) AND (attribute_not_exists(#ca) OR attribute_type(#ca, :nul))',
        names: { '#ca': 'closedAt', '#cb': 'closedBy', '#cr': 'closeReason', '#ttl': 'ttl' },
        values: { ':at': at, ':by': actionId, ':why': reason, ':ttl': ttlAfter(Date.parse(at), KEEP_CLOSED_DAYS * DAY_MS), ':q': 'Q#reports-closed', ':qs': `${at}#${id}`, ':nul': 'NULL' },
      });
      n++;
    } catch (e) {
      if ((e as { name?: string }).name !== 'ConditionalCheckFailedException') throw e; // closed meanwhile
    }
  }
  const raw = bridgeOf(db);
  if (raw) await raw.query('UPDATE reports SET closed_at = $5, closed_by = $3, close_reason = $4 WHERE target_kind = $1 AND target_id = $2 AND closed_at IS NULL', [kind, targetId, actionId, reason, at]);
  return n;
}

/** FR-016: closed reports (and their copies) are kept for `days` days, then deleted — with the reporter's own copy. */
export async function purgeClosedOlderThan(store: Store, db: Db, days: number): Promise<number> {
  const cutoff = new Date(nowMs(store) - days * DAY_MS).toISOString();
  const items = (await queue(store, 'reports-closed', { to: cutoff })).filter((i) => String(i['closedAt']) < cutoff);
  const deletes = items.flatMap((i) => {
    const marks = i['reporterId'] ? [{ delete: K.reporterMark(String(i['reporterId']), String(i['createdAt']), String(i['id'])) }] : [];
    return [{ delete: keyOf(i) }, ...marks];
  });
  if (deletes.length) await batchWriteAll(store, 'main', deletes);
  const raw = bridgeOf(db);
  if (raw) await raw.query("DELETE FROM reports WHERE closed_at IS NOT NULL AND closed_at < $1", [cutoff]);
  return items.length;
}

const reportById = async (store: Store, id: string): Promise<Item | undefined> => (isUuid(id) ? (await byRef(store, 'report', id, { max: 1 }))[0] : undefined);

export async function transcriptReportsForFeed(store: Store, db: Db, feedUrl: string): Promise<TranscriptReport[]> {
  const { queryAll } = await import('../../../ddb/paginate.ts');
  const { items: keys } = await queryAll(store, 'main', { IndexName: K.INDEX.G2, KeyConditionExpression: 'G2PK = :p', ExpressionAttributeValues: { ':p': `SHTR#${K.feedKey(feedUrl)}` } });
  const items = (await getMany(store, 'main', keys.map(keyOf))).filter((i) => i['targetKind'] === 'transcript');
  const out: (TranscriptReport & { open: boolean })[] = [];
  for (const i of items) {
    const d = i['detail'] as TranscriptDetail | null;
    if (!d) continue;
    const e = await getEpisode(db, d.episodeId);
    if (!e || e.feed_url !== feedUrl) continue; // the SQL's JOIN on episodes of this feed
    const closed = Boolean(i['closedAt']);
    out.push({
      id: String(i['id']), episodeId: d.episodeId, episodeTitle: e.title, offsetMs: Number(d.offsetMs), original: d.original, suggested: d.suggested,
      createdAt: new Date(String(i['createdAt'])).toISOString(), status: closed ? 'done' : 'open', open: !closed,
    });
  }
  out.sort((a, b) => (a.open !== b.open ? (a.open ? -1 : 1) : a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return out.slice(0, 500).map(({ open: _open, ...r }) => r);
}

export async function transcriptReportFeed(store: Store, db: Db, id: string): Promise<string | null> {
  const r = await reportById(store, id);
  if (!r || r['targetKind'] !== 'transcript') return null;
  const d = r['detail'] as TranscriptDetail | null;
  const e = d ? await getEpisode(db, d.episodeId) : undefined;
  return e?.feed_url ?? null;
}

export async function markTranscriptReportDone(store: Store, db: Db, id: string): Promise<void> {
  const r = await reportById(store, id);
  if (!r || r['targetKind'] !== 'transcript' || r['closedAt']) return;
  const at = nowIso(store);
  try {
    await update(store, 'main', keyOf(r), {
      update: 'SET #ca = :at, #cr = :why, #ttl = :ttl, G4PK = :q, G4SK = :qs',
      condition: 'attribute_exists(PK) AND (attribute_not_exists(#ca) OR attribute_type(#ca, :nul))',
      names: { '#ca': 'closedAt', '#cr': 'closeReason', '#ttl': 'ttl' },
      values: { ':at': at, ':why': 'done', ':ttl': ttlAfter(Date.parse(at), KEEP_CLOSED_DAYS * DAY_MS), ':q': 'Q#reports-closed', ':qs': `${at}#${String(r['id'])}`, ':nul': 'NULL' },
    });
  } catch (e) {
    if ((e as { name?: string }).name !== 'ConditionalCheckFailedException') throw e;
  }
  const raw = bridgeOf(db);
  if (raw) await raw.query("UPDATE reports SET closed_at = $2, close_reason = 'done' WHERE id = $1 AND target_kind = 'transcript' AND closed_at IS NULL", [id, at]);
}

// ---- lane SF helpers used by moderation.ts, appeals.ts and admin-users.ts ----

/** Every report on a target (strong), oldest first. */
export async function reportsOnTarget(store: Store, kind: string, targetId: string): Promise<Item[]> {
  return (await partition(store, 'main', RPT(kind, targetId))).sort((a, b) => (String(a['createdAt']) < String(b['createdAt']) ? -1 : 1));
}

/** Closes one report item (no Postgres bridge — the caller's Postgres side is already done). */
export async function closeReportItem(store: Store, r: Item, actionId: string | null, reason: string): Promise<boolean> {
  const at = nowIso(store);
  try {
    await update(store, 'main', keyOf(r), {
      update: 'SET #ca = :at, #cb = :by, #cr = :why, #ttl = :ttl, G4PK = :q, G4SK = :qs',
      condition: 'attribute_exists(PK) AND (attribute_not_exists(#ca) OR attribute_type(#ca, :nul))',
      names: { '#ca': 'closedAt', '#cb': 'closedBy', '#cr': 'closeReason', '#ttl': 'ttl' },
      values: { ':at': at, ':by': actionId, ':why': reason, ':ttl': ttlAfter(Date.parse(at), KEEP_CLOSED_DAYS * DAY_MS), ':q': 'Q#reports-closed', ':qs': `${at}#${String(r['id'])}`, ':nul': 'NULL' },
    });
    return true;
  } catch (e) {
    if ((e as { name?: string }).name !== 'ConditionalCheckFailedException') throw e;
    return false;
  }
}

/** Reports about one person (G1), newest first, ≤ `max` (default 50). */
export async function reportsAbout(store: Store, listenerId: string, max = 50): Promise<Item[]> {
  const { queryAll } = await import('../../../ddb/paginate.ts');
  const { items } = await queryAll(store, 'main', {
    IndexName: K.INDEX.G1, KeyConditionExpression: 'G1PK = :a AND begins_with(G1SK, :k)', ExpressionAttributeValues: { ':a': `AUTH#${listenerId}`, ':k': 'report#' }, ScanIndexForward: false,
  }, { max });
  return getMany(store, 'main', items.map(keyOf));
}
