// Launch-screen promotions on DynamoDB: one small partition; an event is one conditional ADD on the promotion itself.
/**
 * M26 lane DV (DV-62…DV-68). `PROMO / <id>` (type `promotion`, STRICT, no person attribute — G-L2 as an allowlist,
 * codec.ts). A view or tap is `ADD impressions|taps 1` conditioned on the promotion being live, so nothing about who
 * is stored anywhere (FR-017). The image total (G-L3) is summed over the partition (a handful of items).
 */
import { randomUUID } from 'node:crypto';
import type { Db } from '../../../db.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, update, type Item, type Store } from '../../../ddb/store.ts';
import { tx } from '../../../ddb/tx.ts';
import { commitOrDefer } from '../../safety/ddb/admin-scope.ts';
import { stateOf, type Promotion, type PromotionInput } from '../promotions.ts';
import { isUuid, nowIso, partitionItems } from './common.ts';

const toPromotion = (r: Item): Promotion => ({
  id: String(r['id']), imageUrl: String(r['imageUrl']), imagePath: String(r['imagePath']), imageBytes: Number(r['imageBytes']),
  targetKind: r['targetKind'] as 'route' | 'url', target: String(r['target']), label: String(r['label']),
  startsAt: String(r['startsAt']), endsAt: String(r['endsAt']), weight: Number(r['weight']), dailyCap: Number(r['dailyCap']),
  impressions: Number(r['impressions'] ?? 0), taps: Number(r['taps'] ?? 0),
  state: stateOf({ retired_at: r['retiredAt'] ?? null, starts_at: String(r['startsAt']), ends_at: String(r['endsAt']) }), createdAt: String(r['createdAt']),
});

const all = (store: Store) => partitionItems(store, 'PROMO');
const byCreated = (a: Item, b: Item) => (String(a['createdAt']) < String(b['createdAt']) ? -1 : String(a['createdAt']) > String(b['createdAt']) ? 1 : 0);
const isLive = (r: Item, now: string) => !r['retiredAt'] && String(r['startsAt']) <= now && String(r['endsAt']) > now;
const isoOf = (v: string) => new Date(v).toISOString();

export async function listPromotions(store: Store, _db: Db): Promise<Promotion[]> {
  return (await all(store)).sort(byCreated).reverse().map(toPromotion);
}

export async function getPromotion(store: Store, _db: Db, id: string): Promise<Promotion | undefined> {
  if (!isUuid(id)) return undefined;
  const r = await get(store, 'main', K.promotion(id));
  return r ? toPromotion(r) : undefined;
}

export async function livePromotions(store: Store, _db: Db): Promise<Promotion[]> {
  const now = nowIso(store);
  return (await all(store)).filter((r) => isLive(r, now)).sort(byCreated).map(toPromotion);
}

export async function launchBytes(store: Store, _db: Db, exceptId?: string): Promise<number> {
  const now = nowIso(store);
  return (await all(store)).filter((r) => !r['retiredAt'] && String(r['endsAt']) > now && r['id'] !== exceptId).reduce((s, r) => s + Number(r['imageBytes'] ?? 0), 0);
}

export async function createPromotion(store: Store, _db: Db, p: PromotionInput): Promise<Promotion> {
  const id = randomUUID();
  const item = encode('promotion', K.promotion(id), {
    id, imageUrl: p.imageUrl, imagePath: p.imagePath, imageBytes: p.imageBytes, targetKind: p.targetKind, target: p.target, label: p.label,
    startsAt: isoOf(p.startsAt), endsAt: isoOf(p.endsAt), weight: p.weight, dailyCap: p.dailyCap, impressions: 0, taps: 0, retiredAt: null, createdAt: nowIso(store),
  });
  await commitOrDefer(store, tx(store).put('main', item, { condition: 'attribute_not_exists(PK)' }));
  return toPromotion(item);
}

export async function updatePromotion(store: Store, _db: Db, id: string, p: Partial<PromotionInput> & { retired?: boolean }): Promise<Promotion | undefined> {
  if (!isUuid(id)) return undefined;
  const cur = await get(store, 'main', K.promotion(id));
  if (!cur) return undefined;
  const next: Item = { ...cur };
  for (const k of ['imageUrl', 'imagePath', 'imageBytes', 'targetKind', 'target', 'label', 'weight', 'dailyCap'] as const) if (p[k] !== undefined && p[k] !== null) next[k] = p[k];
  if (p.startsAt) next['startsAt'] = isoOf(p.startsAt);
  if (p.endsAt) next['endsAt'] = isoOf(p.endsAt);
  if (p.retired === true) next['retiredAt'] = cur['retiredAt'] ?? nowIso(store);
  if (p.retired === false) next['retiredAt'] = null;
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets = ['imageUrl', 'imagePath', 'imageBytes', 'targetKind', 'target', 'label', 'weight', 'dailyCap', 'startsAt', 'endsAt', 'retiredAt'].map((k, i) => {
    names[`#a${i}`] = k; values[`:a${i}`] = next[k] ?? null; return `#a${i} = :a${i}`;
  });
  // The counters are not written here: a view counted meanwhile is kept (the SQL's UPDATE left them alone too).
  await commitOrDefer(store, tx(store).update('main', K.promotion(id), { update: `SET ${sets.join(', ')}`, condition: 'attribute_exists(PK)', names, values: values as never }));
  return toPromotion(next);
}

/** +1 to a total — nothing about who (FR-017). Only a live promotion counts. */
export async function countEvent(store: Store, _db: Db, id: string, kind: 'impression' | 'tap'): Promise<boolean> {
  if (!isUuid(id)) return false;
  const now = nowIso(store);
  try {
    await update(store, 'main', K.promotion(id), {
      update: 'ADD #c :one',
      condition: 'attribute_exists(PK) AND (attribute_not_exists(#r) OR #r = :null) AND #s <= :now AND #e > :now',
      names: { '#c': kind === 'tap' ? 'taps' : 'impressions', '#r': 'retiredAt', '#s': 'startsAt', '#e': 'endsAt' },
      values: { ':one': 1, ':null': null, ':now': now },
    });
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw e;
  }
}
