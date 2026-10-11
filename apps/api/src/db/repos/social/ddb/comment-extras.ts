// Pins and "unfriendly" marks on DynamoDB: one pin at each end per episode (a conditional transaction), marks counted on the comment.
/**
 * M26 lane SC (SC-T02). The old partial unique indexes `comments_one_pinned` / `comments_one_pinned_bottom` become
 * `pinnedId` / `pinnedBottomId` on the episode's SOCIAL item, changed only with a condition on the value just read
 * (`attribute_not_exists` or `= :old`) in the same transaction as the comments' `pinnedAt` / `pinnedBottomAt`. Two hosts
 * pinning at once: one transaction fails the condition, reads again and moves the pin — never two pins
 * (guard G-M26-SC4). An "unfriendly" mark is `EP#<episodeId>/CU#<commentId>#<listener>` + the voter's
 * `L#<listener>/UNF#<commentId>` + `unfriendlyCount` on the comment; the voters are never read back.
 */
import type { Db } from '../../../db.ts';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { isConflict, withRetry } from '../../../ddb/retry.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { UNFRIENDLY_FOLD_AT } from '../comments.ts';
import { pinAsHost as pinAsHostDual, pinBottomAsHost as pinBottomAsHostDual } from '../comment-extras.ts';
import * as B from './sc-bridge.ts';
import { bumpSocial, commentItemById, commitRetry, keyOf, nowIso, rawPg } from './sc-common.ts';

type End = 'top' | 'bottom';
const FIELD = { top: 'pinnedId', bottom: 'pinnedBottomId' } as const;
const ATTR = { top: 'pinnedAt', bottom: 'pinnedBottomAt' } as const;
const other = (e: End): End => (e === 'top' ? 'bottom' : 'top');

/** One pin step at one end. Retried from a fresh read when another pin got there first. */
async function pinEnd(store: Store, end: End, commentId: string, episodeId: string, pin: boolean, by: string | undefined): Promise<void> {
  await withRetry(async () => {
    const [social, it] = await Promise.all([get(store, 'main', K.episodeSocial(episodeId)), commentItemById(store, commentId)]);
    const at = nowIso(store);
    const field = FIELD[end];
    const otherField = FIELD[other(end)];
    const names: Record<string, string> = { '#t': 't', '#e': 'episodeId', '#u': 'updatedAt', '#v': 'v', '#f': field };
    const values: Record<string, unknown> = { ':type': 'episodeSocial', ':e': episodeId, ':at': at, ':one': 1 };
    const sets = ['#t = if_not_exists(#t, :type)', '#e = if_not_exists(#e, :e)', '#u = :at'];
    const removes: string[] = [];
    const conds: string[] = [];
    const t = tx(store);
    const old = social?.[field] as string | undefined;
    if (pin) {
      // The old pin at this end comes off (the SQL cleared every pinned row of the episode first).
      const oldItem = old && old !== commentId ? await commentItemById(store, old) : undefined;
      conds.push(old ? '#f = :old' : 'attribute_not_exists(#f)');
      if (old) values[':old'] = old;
      if (it) { sets.push('#f = :id'); values[':id'] = commentId; } else removes.push('#f');
      // A comment is pinned at one end only: pinning here takes it off the other end.
      if (it && social?.[otherField] === commentId) {
        names['#of'] = otherField;
        removes.push('#of');
        conds.push('#of = :id');
      }
      if (oldItem) {
        t.update('main', keyOf(oldItem), {
          update: end === 'top' ? 'REMOVE #a, #by' : 'REMOVE #a', condition: 'attribute_exists(PK)',
          names: end === 'top' ? { '#a': ATTR.top, '#by': 'pinnedBy' } : { '#a': ATTR.bottom },
        });
      }
      if (it) {
        t.update('main', keyOf(it), end === 'top'
          ? { update: 'SET #a = :at, #by = :by REMOVE #o', condition: 'attribute_exists(PK)', names: { '#a': ATTR.top, '#by': 'pinnedBy', '#o': ATTR.bottom }, values: { ':at': at, ':by': by ?? null } }
          : { update: 'SET #a = :at REMOVE #o, #by', condition: 'attribute_exists(PK)', names: { '#a': ATTR.bottom, '#o': ATTR.top, '#by': 'pinnedBy' }, values: { ':at': at } });
      }
    } else {
      if (!it) return;
      t.update('main', keyOf(it), {
        update: end === 'top' ? 'REMOVE #a, #by' : 'REMOVE #a', condition: 'attribute_exists(PK)',
        names: end === 'top' ? { '#a': ATTR.top, '#by': 'pinnedBy' } : { '#a': ATTR.bottom },
      });
      if (old === commentId) { removes.push('#f'); conds.push('#f = :id'); values[':id'] = commentId; } else delete names['#f'];
    }
    t.update('main', K.episodeSocial(episodeId), {
      update: `SET ${sets.join(', ')}${removes.length ? ` REMOVE ${removes.join(', ')}` : ''} ADD #v :one`,
      ...(conds.length ? { condition: conds.join(' AND ') } : {}),
      names, values, label: 'pin',
    });
    await t.commit();
  }, { tries: 6, retryOn: (e) => isConflict(e) || (e instanceof TxCancelled && e.failed('pin')) });
}

/** The Studio has already checked the role; it pins by comment and episode. */
export async function pinAsHost(store: Store, db: Db, commentId: string, episodeId: string, by: string, pin: boolean): Promise<void> {
  await pinEnd(store, 'top', commentId, episodeId, pin, by);
  const raw = rawPg(db);
  if (raw) await pinAsHostDual(raw, commentId, episodeId, by, pin);
}

export async function pinBottomAsHost(store: Store, db: Db, commentId: string, episodeId: string, pin: boolean): Promise<void> {
  await pinEnd(store, 'bottom', commentId, episodeId, pin, undefined);
  const raw = rawPg(db);
  if (raw) await pinBottomAsHostDual(raw, commentId, episodeId, pin);
}

async function markStep(store: Store, it: Item, listenerId: string, on: boolean): Promise<boolean> {
  const episodeId = String(it['episodeId']);
  const commentId = String(it['id']);
  const at = nowIso(store);
  try {
    await commitRetry(store, (t) => {
      if (on) {
        t.put('main', encode('unfriendlyMark', K.unfriendlyMark(episodeId, commentId, listenerId), { commentId, listenerId, createdAt: at }), { condition: 'attribute_not_exists(PK)', label: 'unfriendly' });
        t.put('main', encode('unfriendlyPtr', K.unfriendlyPtr(listenerId, commentId), { commentId, episodeId }));
      } else {
        t.delete('main', K.unfriendlyMark(episodeId, commentId, listenerId), { condition: 'attribute_exists(PK)', label: 'unfriendly' });
        t.delete('main', K.unfriendlyPtr(listenerId, commentId));
      }
      t.update('main', keyOf(it), { update: 'ADD #n :d', condition: 'attribute_exists(PK)', names: { '#n': 'unfriendlyCount' }, values: { ':d': on ? 1 : -1 } });
      bumpSocial(t, episodeId, at);
    });
    return true;
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('unfriendly')) return false;
    throw e;
  }
}

/** Mark or unmark; answers whether the comment is folded now. */
export async function setUnfriendly(store: Store, db: Db, commentId: string, listenerId: string, on: boolean): Promise<{ folded: boolean }> {
  const it = await commentItemById(store, commentId);
  if (!it || it['deletedAt'] || it['removedAt']) throw new ApiError('not_found', 'No such comment.');
  if (it['authorId'] === listenerId) throw new ApiError('own_comment', "You can't mark your own comment.");
  if (await markStep(store, it, listenerId, on)) {
    const raw = rawPg(db);
    if (raw) await (on ? B.insertUnfriendly(raw, commentId, listenerId) : B.deleteUnfriendly(raw, commentId, listenerId));
  }
  const now = await get(store, 'main', keyOf(it));
  return { folded: Number(now?.['unfriendlyCount'] ?? 0) >= UNFRIENDLY_FOLD_AT };
}
