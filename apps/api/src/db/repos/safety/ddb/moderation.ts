// Moderation on DynamoDB: one transaction for the action, its effect and the author's notice; then the target's reports close.
/**
 * M26 lane SF (SF-17…SF-25; SF hard case 4). `act()`:
 *   Postgres transaction {                     (the effects in lanes still on Postgres + the notice + the bridge rows)
 *     remove → the item's removal (SC/DV, foreign.ts) and the author's system notice (SG `insertNotice`);
 *     DynamoDB TransactWriteItems {           (≤ 6 items)
 *       MA#<id>/A (G4 `Q#actions`, G5 `REF#subject#<person>`), the effect on DynamoDB items (hidden feed put/delete,
 *       the listener's suspension — lane AC's admin-ops.ts), the hour's `R#dash#actions`, the outbox entry
 *       `reports:close` }
 *   }   — the DynamoDB transaction commits LAST inside the Postgres one: if it fails, the Postgres effects and
 *       the notice roll back; if it commits, they commit. Action, effect and notice together or none (G-M26-SF2).
 * Then the target's open reports close: right away in the request (as before — the routes read the queue next),
 * and the outbox entry (`reports:close`, idempotent) finishes the job if the request dies half-way: a target's
 * reports are unbounded, so they cannot sit in the one transaction.
 * The action item keeps `subjectListenerId` (who it is about) and the copy of the first report it closes
 * (`snapshot`, `reportAuthorId`) at the top level — the appeal rules read them (SF hard case 5).
 */
import { randomUUID } from 'node:crypto';
import type { Action, TargetKind } from '@socialmorning/social-core';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Item } from '../../../ddb/store.ts';
import { tx, type Tx } from '../../../ddb/tx.ts';
import { batchWriteAll } from '../../../ddb/batch.ts';
import { enqueue, registerHandler } from '../../../../jobs/outbox.ts';
import { withStore } from '../../../backend-ddb.ts';
import { afterSuspension, suspensionUpdate } from '../../account/ddb/admin-ops.ts';
import type { ActionRow } from '../moderation.ts';
import { closeReportsFor, reportsOnTarget } from './reports.ts';
import { dashAdd } from './dash.ts';
import { liveAuthor, removeEffect } from './foreign.ts';
import { setCommentRemoved } from '../../social/comments.ts';
import { removeActivityByRef } from '../../social/graph-ddb/activity.ts';
import { bridgeOf, isUuid, listenersById, nowIso, obj, partition, pgOf, queue, type Db, type Store } from './common.ts';

const THING: Partial<Record<TargetKind, string>> = { comment: 'comment', clip: 'clip', status: 'status', chat_message: 'message', list: 'shared list' };

/** The first report's copy (by time) and its author: what the action is about. */
async function firstCopy(store: Store, kind: string, id: string, openOnly: boolean): Promise<{ snapshot: Record<string, unknown> | null; authorId: string | null }> {
  const all = await reportsOnTarget(store, kind, id);
  const r = (openOnly ? all.filter((x) => !x['closedAt']) : all)[0];
  if (!r) return { snapshot: null, authorId: null };
  const s = obj(r['snapshot']);
  const a = s['authorId'];
  return { snapshot: s, authorId: typeof a === 'string' && isUuid(a) ? a : null };
}

/**
 * Takes an item down (or puts it back — an accepted appeal) where it lives: lane SC's comment, clip, chat message and
 * status items (their setters, each with its Postgres bridge), lane DV's shared list in Postgres. Idempotent.
 */
export async function applyTakedown(store: Store, db: Db, kind: TargetKind, id: string, removed: boolean): Promise<void> {
  if (kind === 'comment') { if (isUuid(id)) await setCommentRemoved(db, id, removed); return; }
  const sc = await import('../../social/ddb/sf-takedown.ts');
  if (kind === 'clip') await sc.setClipRemovedItem(store, db, id, removed);
  else if (kind === 'chat_message') await sc.setChatRemovedItem(store, db, id, removed);
  else if (kind === 'status') await sc.setStatusEnded(store, db, id, removed);
  else if (kind === 'list' && !removed) await pgOf(db).query('UPDATE shared_lists SET removed_at = NULL WHERE id = $1', [id]);
}

/** Who wrote the item: from its row while it exists, else from the copy a report kept (M24: a status may be swept). */
export async function authorOf(store: Store, db: Db, kind: TargetKind, id: string): Promise<string | null> {
  const live = await liveAuthor(pgOf(db), kind, id);
  if (live) return live;
  for (const r of await reportsOnTarget(store, kind, id)) {
    const a = obj(r['snapshot'])['authorId'];
    if (typeof a === 'string') return isUuid(a) ? a : null;
  }
  return null;
}

export async function act(store: Store, db: Db, actorId: string, item: { kind: TargetKind; id: string }, action: Action): Promise<ActionRow> {
  const id = randomUUID();
  const at = nowIso(store);
  const copy = await firstCopy(store, item.kind, item.id, true);
  const subject = item.kind === 'profile' && isUuid(item.id) ? item.id : copy.authorId;
  const a: ActionRow = { id, actor_id: actorId, action, target_kind: item.kind, target_id: item.id, created_at: at };
  const t: Tx = tx(store).put('main', encode('moderationAction', K.moderationAction(id), {
    id, actorId, action, targetKind: item.kind, targetId: item.id, subjectListenerId: subject, reportAuthorId: copy.authorId, snapshot: copy.snapshot, createdAt: at,
  }, { gsi: { ...K.G4('actions', at, id), ...(subject ? K.G5('subject', subject, at) : {}) } }), { condition: 'attribute_not_exists(PK)', label: 'action' });
  dashAdd(t, 'actions', at);
  enqueue(t, store, { kind: 'reports:close', payload: { kind: item.kind, id: item.id, actionId: id, reason: action } });

  let suspended: { who: string; at: string | null } | null = null;
  if (action === 'hide_show') {
    if (!(await get(store, 'main', K.hiddenFeed(item.id)))) {
      t.put('main', encode('hiddenFeed', K.hiddenFeed(item.id), { feedUrl: item.id, actionId: id, reason: null, createdAt: at }), { condition: 'attribute_not_exists(PK)', label: 'hidden' });
    }
  } else if (action === 'unhide_show') {
    t.delete('main', K.hiddenFeed(item.id));
  } else if (action === 'suspend') {
    const who = item.kind === 'profile' ? item.id : await authorOf(store, db, item.kind, item.id);
    if (who && isUuid(who) && await suspensionUpdate(store, db, t, who, at)) suspended = { who, at };
  } else if (action === 'unsuspend') {
    if (isUuid(item.id) && await suspensionUpdate(store, db, t, item.id, null)) suspended = { who: item.id, at: null };
  }

  await db.transaction(async (txdb) => {
    const pg = pgOf(txdb);
    const raw = bridgeOf(txdb);
    if (raw) {
      await raw.query('INSERT INTO moderation_actions (id, actor_id, action, target_kind, target_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [id, actorId, action, item.kind, item.id, at]);
      if (action === 'hide_show') await raw.query('INSERT INTO hidden_feeds (feed_url, action_id) VALUES ($1, $2) ON CONFLICT (feed_url) DO NOTHING', [item.id, id]);
      if (action === 'unhide_show') await raw.query('DELETE FROM hidden_feeds WHERE feed_url = $1', [item.id]);
    }
    if (action === 'remove') {
      if (item.kind === 'list') await removeEffect(pg, item.kind, item.id); // lane DV's shared list, still Postgres: in this transaction
      // M24 US6: the author is told, with the one way to appeal — lane SG's notice item, IN this transaction.
      const who = await authorOf(store, txdb, item.kind, item.id);
      const thing = THING[item.kind];
      if (who && thing) {
        const nid = randomUUID();
        t.put('main', encode('systemNotice', K.systemNotice(who, at, nid), {
          id: nid, listenerId: who, title: `Your ${thing} was removed`,
          body: `A ${thing} you posted broke the community rules, so it was removed. If you think this is a mistake, you can appeal once.`,
          linkLabel: 'Appeal', linkRoute: '/appeal', push: false, createdBy: null, createdAt: at,
        }), { condition: 'attribute_not_exists(PK)', label: 'notice' });
      }
    }
  });
  await t.commit(); // RED CHECK (G-M26-SF2)
  if (suspended) await afterSuspension(store, db, suspended.who, suspended.at, bridgeOf(db));
  // Lane SG (moved): the removed comment's or clip's activity entry goes (with its Postgres bridge row) — idempotent.
  // Lane SC's items (moved): the take-down setters run right after the commit — idempotent, and the outbox entry re-applies them.
  if (action === 'remove') await applyTakedown(store, db, item.kind, item.id, true);
  if (action === 'remove' && (item.kind === 'comment' || item.kind === 'clip')) await removeActivityByRef(store, db, item.kind === 'comment' ? 'commented' : 'clipped', item.id);
  await closeReportsFor(store, db, item.kind, item.id, id, action);
  return a;
}

/** The outbox job: closes whatever is still open on the target (idempotent — already-closed reports are skipped). */
registerHandler('reports:close', async (store, entry) => {
  const p = entry.payload as { kind: TargetKind; id: string; actionId: string; reason: string };
  const { pgFor } = await import('../../account/ddb/common.ts').then((m) => ({ pgFor: m.pgOf }));
  let db: Db | undefined;
  try { db = withStore(pgFor(store), store); } catch { db = undefined; }
  if (db && p.reason === 'remove') await applyTakedown(store, db, p.kind, p.id, true);
  if (db) await closeReportsFor(store, db, p.kind, p.id, p.actionId, p.reason);
  else {
    // No Postgres beside this Store (after CUT): close the items only.
    const { update } = await import('../../../ddb/store.ts');
    for (const r of await reportsOnTarget(store, p.kind, p.id)) {
      if (r['closedAt']) continue;
      const rid = String(r['id']);
      await update(store, 'main', { PK: String(r['PK']), SK: String(r['SK']) }, {
        update: 'SET #ca = :at, #cb = :by, #cr = :why, G4PK = :q, G4SK = :qs',
        condition: 'attribute_not_exists(#ca) OR attribute_type(#ca, :nul)',
        names: { '#ca': 'closedAt', '#cb': 'closedBy', '#cr': 'closeReason' },
        values: { ':at': nowIso(store), ':by': p.actionId, ':why': p.reason, ':q': 'Q#reports-closed', ':qs': `${nowIso(store)}#${rid}`, ':nul': 'NULL' },
      }).catch(() => undefined);
    }
  }
});

/** Every hidden show: the admin's hides and the publishers' `itunes:block` marks — one partition, one Query. */
export async function hiddenFeedUrls(store: Store, _db: Db): Promise<Set<string>> {
  return new Set((await partition(store, 'main', 'CFG#hidden-feeds')).map((i) => String(i['feedUrl'])));
}

/** The admin's hides (not the publishers' marks) among these feeds — lane LB's public subscription list. */
export async function adminHiddenAmong(store: Store, feedUrls: readonly string[]): Promise<Set<string>> {
  const { batchGetAll } = await import('../../../ddb/batch.ts');
  return new Set((await batchGetAll(store, 'main', [...new Set(feedUrls)].map((u) => K.hiddenFeed(u)))).map((i) => String(i['feedUrl'])));
}

/** Every admin hide (not the publishers' marks) — the old `hidden_feeds` table. */
export async function adminHiddenAll(store: Store): Promise<Set<string>> {
  return new Set((await partition(store, 'main', 'CFG#hidden-feeds')).filter((i) => !String(i['SK']).startsWith(K.SF_SK.publisherBlocks)).map((i) => String(i['feedUrl'])));
}

/** M23 US11: the publisher's `itunes:block` mark (catalog/feed.ts setPublisherBlock), in the hidden-feeds partition. */
export async function setPublisherMark(store: Store, _db: Db, feedUrl: string, blocked: boolean): Promise<void> {
  if (blocked) {
    const { put } = await import('../../../ddb/store.ts');
    await put(store, 'main', encode('publisherBlock', K.publisherBlock(feedUrl), { feedUrl, createdAt: nowIso(store) }));
  } else {
    await batchWriteAll(store, 'main', [{ delete: K.publisherBlock(feedUrl) }]);
  }
}

export async function recentActions(store: Store, _db: Db, limit = 100): Promise<(ActionRow & { actor_name: string })[]> {
  const items = await queue(store, 'actions', { newestFirst: true, max: limit });
  const names = await listenersById(store, items.map((i) => String(i['actorId'])));
  return items.flatMap((i: Item) => {
    const actor = names.get(String(i['actorId']));
    if (!actor) return []; // the SQL's inner JOIN
    return [{
      id: String(i['id']), actor_id: String(i['actorId']), actor_name: String(actor['displayName']), action: i['action'] as Action,
      target_kind: i['targetKind'] as TargetKind, target_id: String(i['targetId']), created_at: String(i['createdAt']),
    }];
  });
}
