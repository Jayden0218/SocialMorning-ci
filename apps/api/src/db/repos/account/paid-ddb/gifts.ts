// Gifts on DynamoDB: the gift item keyed by its code, claimed once in one transaction, withdrawn by a refund.
/**
 * M26 lane PD (PD-T04; patterns PD-22…PD-29). Postgres twins: ../gifts.ts.
 *
 * Claim = ONE transaction: the gift gets its claimer only while it has none and is not cancelled (the old
 * `UPDATE … WHERE claimed_by IS NULL AND cancelled_at IS NULL`, guard G-M22-9), the claimer's show entitlement
 * (attribute_not_exists: someone who owns the show is told and the link stays), the purchase records the key it
 * granted (so a refund removes it — `source_purchase_id`), and the claimer's pointer. The gift page reads the show
 * card from lane ST (override, hosted show — Postgres until it moves) and lane LB (newest episode title and cover).
 */
import type { Db } from '../../../db.ts';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { withRetry, isConflict } from '../../../ddb/retry.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { TxCancelled } from '../../../ddb/tx.ts';
import { showNewest } from '../../library/ddb/episodes.ts';
import { getListener, txa } from '../ddb/common.ts';
import { giftUrl } from '../gifts.ts';
import { entItem, iso, mirror, nowMs } from './common.ts';
import { showCardParts } from './foreign.ts';

const CODE = /^[A-Za-z0-9]{16}$/;

/** A claim lost to a concurrent change of the gift or the entitlement: read again and answer from what is stored. */
class GiftRace extends Error { constructor() { super('gift claim raced; re-read'); } }

async function showOf(store: Store, db: Db, feedUrl: string): Promise<{ feedUrl: string; title: string; artworkUrl: string | null }> {
  const st = await showCardParts(db, feedUrl);
  const ep = await showNewest(store, feedUrl);
  return { feedUrl, title: st.overrideTitle ?? st.hostedTitle ?? ep.title ?? 'A paid series', artworkUrl: st.hostedCover ?? ep.image ?? null };
}

export async function giftByCode(store: Store, db: Db, code: string): Promise<{ show: { feedUrl: string; title: string; artworkUrl: string | null }; claimed: boolean; cancelled: boolean; buyerName: string | null }> {
  if (!CODE.test(code)) throw new ApiError('not_found', 'No such gift.');
  const g = await get(store, 'main', K.gift(code));
  if (!g) throw new ApiError('not_found', 'No such gift.');
  const buyer = await getListener({ store, pg: db }, String(g['buyerId']));
  return {
    show: await showOf(store, db, String(g['feedUrl'])), claimed: Boolean(g['claimedBy']), cancelled: Boolean(g['cancelledAt']),
    buyerName: buyer && !buyer.hiddenAt ? buyer.displayName : null,
  };
}

export async function claimGift(store: Store, db: Db, code: string, listenerId: string): Promise<{ feedUrl: string }> {
  if (!CODE.test(code)) throw new ApiError('not_found', 'No such gift.');
  const feedUrl = await withRetry(async () => {
    const g = await get(store, 'main', K.gift(code));
    if (!g) throw new ApiError('not_found', 'No such gift.');
    if (g['cancelledAt']) throw new ApiError('cancelled', 'This gift was refunded, so it can no longer be claimed.');
    if (g['claimedBy']) throw new ApiError('already_claimed', 'Already claimed.');
    const feed = String(g['feedUrl']);
    const ek = K.entitlement(listenerId, 'show', feed);
    // FR-043: the link stays unclaimed for someone else.
    if (await get(store, 'main', ek)) throw new ApiError('already_owned', 'You already have this series. The link still works for someone else.');
    const at = iso(nowMs(store));
    const t = txa(store)
      .update('main', K.gift(code), {
        update: 'SET claimedBy = :me, claimedAt = :at', condition: 'attribute_exists(PK) AND attribute_not_exists(claimedBy) AND attribute_not_exists(cancelledAt)',
        values: { ':me': listenerId, ':at': at }, label: 'gift',
      })
      .put('main', entItem({ listenerId, kind: 'show', ref: feed, until: null, sourcePurchaseId: String(g['purchaseId']) }), { condition: 'attribute_not_exists(PK)', label: 'ent' })
      .update('main', { PK: String(g['purchasePK']), SK: 'P' }, {
        update: 'SET granted = list_append(if_not_exists(granted, :empty), :k)', condition: 'attribute_exists(PK)', values: { ':empty': [], ':k': [ek] }, label: 'purchase',
      })
      .put('main', encode('giftPtr', K.giftClaimed(listenerId, code), { code, createdAt: at }));
    try {
      await t.commit();
    } catch (e) {
      if (!(e instanceof TxCancelled) || e.conflict) throw e;
      // In the old order: the gift's state first, then "you own it already" (the next attempt re-reads and answers).
      if (e.failed('gift') || e.failed('ent')) throw new GiftRace();
      throw e;
    }
    return feed;
  }, { tries: 4, retryOn: (e) => isConflict(e) || e instanceof GiftRace });
  await mirror(store, db, { gifts: [code], listeners: [listenerId] });
  return { feedUrl };
}

export async function myGifts(store: Store, db: Db, buyerId: string, publicBase: string): Promise<{ items: { code: string; url: string; feedUrl: string; title: string; claimed: boolean; cancelled: boolean; createdAt: string }[] }> {
  const ptrs = (await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)', ExpressionAttributeValues: { ':pk': K.L(buyerId), ':sk': K.PD_SK.giftsBought },
    ScanIndexForward: false, ConsistentRead: true,
  }, { max: 100 })).items;
  const got = await batchGetAll(store, 'main', ptrs.map((p) => K.gift(String(p['code']))));
  const byCode = new Map(got.map((g) => [String(g['code']), g]));
  const gifts = ptrs.map((p) => byCode.get(String(p['code']))).filter((g): g is Item => g !== undefined);
  const items = await Promise.all(gifts.map(async (g) => {
    const show = await showOf(store, db, String(g['feedUrl']));
    const code = String(g['code']);
    return { code, url: giftUrl(publicBase, code), feedUrl: String(g['feedUrl']), title: show.title, claimed: Boolean(g['claimedBy']), cancelled: Boolean(g['cancelledAt']), createdAt: String(g['createdAt']) };
  }));
  return { items };
}
