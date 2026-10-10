// Appeals on DynamoDB: one per moderation action (the key), found through the action's subject, decided in the admin's record.
/**
 * M26 lane SF (SF-01…SF-06; SF hard case 5). `APPEAL#<actionId>` / `A` — the key is the one-appeal-per-action rule.
 * The appeal copies its action's kind and target (one GetItem for the admin), carries G4 `Q#appeals-open` /
 * `<createdAt>#<id>` while open and `Q#appeals-decided` / `<decidedAt>#<id>` after, and G5 `REF#appeal#<id>`.
 * "What may I appeal?" = the actions whose G5 subject is me (`REF#subject#<me>`, written by act() from the report's
 * copy), read back and filtered by the same rules as the SQL. A decision is one conditional update that joins the
 * admin's audit transaction (admin-scope.ts); the notice is lane SG's (Postgres until it moves).
 */
import { randomUUID } from 'node:crypto';
import type { Action, TargetKind } from '@socialmorning/social-core';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { insertNotice } from '../../social/system-notices.ts';
import { APPEAL_DAYS, describe, type AdminAppeal, type Appealable } from '../appeals.ts';
import { commitOrDefer } from './admin-scope.ts';
import { byRef, DAY_MS, getMany, isUuid, listenersById, nowIso, nowMs, obj, queue, type Db, type Item, type Store } from './common.ts';

type State = 'open' | 'accepted' | 'rejected';

export async function appealableFor(store: Store, _db: Db, listenerId: string): Promise<Appealable[]> {
  if (!isUuid(listenerId)) return [];
  const from = new Date(nowMs(store) - APPEAL_DAYS * DAY_MS).toISOString();
  const actions = (await byRef(store, 'subject', listenerId, { from, newestFirst: true })).filter((a) => String(a['createdAt']) > from);
  const me = await get(store, 'main', K.listener(listenerId));
  const suspended = Boolean(me?.['suspendedAt']);
  const mine = actions.filter((a) => {
    if (a['action'] === 'remove') return a['reportAuthorId'] === listenerId;
    if (a['action'] === 'suspend') return suspended && ((a['targetKind'] === 'profile' && a['targetId'] === listenerId) || a['reportAuthorId'] === listenerId);
    return false;
  }).sort((x, y) => (String(x['createdAt']) < String(y['createdAt']) ? 1 : -1)).slice(0, 50);
  const appeals = new Map((await getMany(store, 'main', mine.map((a) => K.appeal(String(a['id']))))).map((p) => [String(p['actionId']), p]));
  return mine.map((a) => {
    const p = appeals.get(String(a['id']));
    return {
      actionId: String(a['id']), action: a['action'] as Action, targetKind: a['targetKind'] as TargetKind, targetId: String(a['targetId']),
      at: new Date(String(a['createdAt'])).toISOString(), what: describe(a['targetKind'] as TargetKind, a['action'] as Action, a['snapshot'] ?? null),
      appeal: p ? { id: String(p['id']), state: p['state'] as State, createdAt: new Date(String(p['createdAt'])).toISOString() } : null,
    };
  });
}

export async function sendAppeal(store: Store, db: Db, listenerId: string, actionId: string, text: string): Promise<{ id: string } | 'not_appealable' | 'already'> {
  const item = (await appealableFor(store, db, listenerId)).find((a) => a.actionId === actionId);
  if (!item) return 'not_appealable';
  if (item.appeal) return 'already';
  const id = randomUUID();
  const at = nowIso(store);
  try {
    await tx(store).put('main', encode('appeal', K.appeal(actionId), {
      id, listenerId, actionId, text, state: 'open', createdAt: at, decidedAt: null, decidedBy: null,
      action: item.action, targetKind: item.targetKind, targetId: item.targetId, actionAt: item.at,
    }, { gsi: { ...K.G4('appeals-open', at, id), ...K.G5('appeal', id, at) } }), { condition: 'attribute_not_exists(PK)', label: 'appeal' }).commit();
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('appeal')) return 'already';
    throw e;
  }
  return { id };
}

export async function adminAppeals(store: Store, _db: Db, state: 'open' | 'decided'): Promise<AdminAppeal[]> {
  const items = state === 'open'
    ? await queue(store, 'appeals-open', { max: 200 })
    : await queue(store, 'appeals-decided', { newestFirst: true, max: 200 });
  const people = await listenersById(store, items.map((i) => String(i['listenerId'])));
  const actions = new Map((await getMany(store, 'main', items.map((i) => K.moderationAction(String(i['actionId']))))).map((a) => [String(a['id']), a]));
  return items.flatMap((i: Item) => {
    const l = people.get(String(i['listenerId']));
    const a = actions.get(String(i['actionId']));
    if (!l || !a) return []; // the SQL's inner JOINs
    const snapshot = obj(a['snapshot']);
    return [{
      id: String(i['id']), state: i['state'] as State, text: String(i['text']), createdAt: new Date(String(i['createdAt'])).toISOString(),
      decidedAt: i['decidedAt'] ? new Date(String(i['decidedAt'])).toISOString() : null,
      listener: { id: String(l['id']), displayName: String(l['displayName']), email: String(l['email']), suspended: Boolean(l['suspendedAt']) },
      action: { id: String(a['id']), action: a['action'] as Action, targetKind: a['targetKind'] as TargetKind, targetId: String(a['targetId']), at: new Date(String(a['createdAt'])).toISOString() },
      what: describe(a['targetKind'] as TargetKind, a['action'] as Action, snapshot), snapshot,
    }];
  });
}

const appealItem = async (store: Store, id: string): Promise<Item | undefined> => (isUuid(id) ? (await byRef(store, 'appeal', id, { max: 1 }))[0] : undefined);

export async function appealById(store: Store, _db: Db, id: string): Promise<{ id: string; state: string; listener_id: string; action_id: string; action: Action; target_kind: TargetKind; target_id: string } | undefined> {
  const p = await appealItem(store, id);
  if (!p) return undefined;
  return { id: String(p['id']), state: String(p['state']), listener_id: String(p['listenerId']), action_id: String(p['actionId']), action: p['action'] as Action, target_kind: p['targetKind'] as TargetKind, target_id: String(p['targetId']) };
}

/** The items it restores are lane SC's (their setters) and lane DV's shared list (Postgres): moderation.ts applyTakedown. */
export async function restoreRemoved(store: Store, db: Db, kind: TargetKind, id: string): Promise<void> {
  const { applyTakedown } = await import('./moderation.ts');
  await applyTakedown(store, db, kind, id, false);
}

/** Marks the decision (joining the admin's record when inside adminWrite) and tells the listener. */
export async function decide(store: Store, db: Db, appealId: string, listenerId: string, accepted: boolean, by: string): Promise<void> {
  const p = await appealItem(store, appealId);
  if (p && p['state'] === 'open') {
    const at = nowIso(store);
    const t = tx(store).update('main', K.appeal(String(p['actionId'])), {
      update: 'SET #s = :s, #da = :at, #db = :by, G4PK = :q, G4SK = :qs',
      condition: '#s = :open',
      names: { '#s': 'state', '#da': 'decidedAt', '#db': 'decidedBy' },
      values: { ':s': accepted ? 'accepted' : 'rejected', ':at': at, ':by': by, ':q': 'Q#appeals-decided', ':qs': `${at}#${appealId}`, ':open': 'open' },
      label: 'appeal',
    });
    const { ApiError } = await import('../../../../errors.ts');
    await commitOrDefer(store, t, { appeal: () => new ApiError('conflict', 'This appeal was already decided.') });
  }
  await insertNotice(db, accepted
    ? { listenerId, title: 'Your appeal was accepted', body: 'We looked again and undid what we did. Thank you for telling us.' }
    : { listenerId, title: 'Your appeal was not accepted', body: 'We looked again and the decision stands. You can read the community rules in Settings.' });
}
