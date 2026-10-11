// Claims on DynamoDB: a claim in the claimant's partition; the one proven claim of a feed is a uniqueness item.
/**
 * M26 lane ST, ST-T01 (patterns ST-28…ST-34, ST-40, ST-126), data-model.md §5 and "Lane ST changes".
 *
 * - `L#<listener>/CLAIM#<id>`: the claim (code, status, provenAt). The claimant's own list and "verify by id" are
 *   strong reads of their own partition.
 * - `U#PROVEN#<feedKey>` (type `provenClaim`): THE proven claim of a feed — { listenerId, claimId, provenAt, feedUrl },
 *   G4 `Q#proven` (every claimed show, for the dashboard and the public pages). It is put with
 *   `attribute_not_exists(PK)` in the transaction that proves the claim, so two proofs of one feed at the same moment
 *   end with ONE proven claim (guard G-M26-ST2) — the old partial unique index `creator_claims_one_proven`.
 * - `U#CLAIMCODE#<code>`: the codes stay unique (creator_claims.code).
 * - Proving also writes the owner's Studio role copy (`L#<id>/ROLES#<showKey>`, roles.ts).
 * Revoking (give back, take-down, account deletion) flips the claim and deletes `U#PROVEN` in one transaction.
 * No Postgres bridge: nothing reads `creator_claims` in SQL once this lane has moved (data-model.md "Lane ST changes").
 */
import { randomUUID } from 'node:crypto';
import { FEED_TIMEOUT_MS, readFeedText } from '@socialmorning/feed-parser';
import { USER_AGENT, withDeadline } from '../../../../catalog/feed.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { tx, TxCancelled, type Tx } from '../../../ddb/tx.ts';
import { claimUnique } from '../../../ddb/unique.ts';
import { CLAIM_MAX_BYTES, newCode, type Claim } from '../creator.ts';
import { showKey } from '../studio-roles.ts';
import { getMany, keyOf, nowIso, partition, str, type Db } from './common.ts';

export type Proven = { listenerId: string; claimId: string; provenAt: string; feedUrl: string };

const toClaim = (i: Item): Claim => ({
  id: String(i['id']), feedUrl: String(i['feedUrl']), code: String(i['code']), status: String(i['status']) as Claim['status'],
  ...(i['provenAt'] ? { provenAt: new Date(String(i['provenAt'])).toISOString() } : {}),
});

const asProven = (i: Item | undefined): Proven | undefined => (i ? {
  listenerId: String(i['listenerId']), claimId: String(i['claimId']), provenAt: String(i['provenAt']), feedUrl: String(i['feedUrl']),
} : undefined);

/** The feed's proven claim, or undefined (strong read). */
export async function provenOf(store: Store, feedUrl: string): Promise<Proven | undefined> {
  return asProven(await get(store, 'main', K.U.proven(feedUrl)));
}

/** The proven claims of many feeds (strong BatchGet), keyed by feed URL. */
export async function provenOfMany(store: Store, feedUrls: readonly string[]): Promise<Map<string, Proven>> {
  const items = await getMany(store, 'main', [...new Set(feedUrls)].map((u) => K.U.proven(u)));
  return new Map(items.map((i) => [String(i['feedUrl']), asProven(i)!]));
}

/** Every proven claim (G4 `Q#proven`; eventually consistent — the dashboard and the public pages only). */
export async function allProven(store: Store): Promise<Proven[]> {
  const { queue } = await import('./common.ts');
  return (await queue(store, 'proven')).map((i) => asProven(i)!);
}

/** The items that make a claim proven, added to `t`: the claim's status, `U#PROVEN`, the owner's role copy. */
export function proveInTx(t: Tx, c: { id: string; listenerId: string; feedUrl: string }, at: string, claimExists: boolean): void {
  if (claimExists) {
    t.update('main', K.myClaim(c.listenerId, c.id), {
      update: 'SET #s = :p, #at = :at', condition: 'attribute_exists(PK)', names: { '#s': 'status', '#at': 'provenAt' }, values: { ':p': 'proven', ':at': at }, label: 'claim',
    });
  }
  t.put('main', encode('provenClaim', K.U.proven(c.feedUrl), { owner: c.id, listenerId: c.listenerId, claimId: c.id, feedUrl: c.feedUrl, provenAt: at }, {
    gsi: K.G4('proven', at, K.feedKey(c.feedUrl)),
  }), { condition: 'attribute_not_exists(PK)', label: 'proven' });
  t.put('main', encode('roles', K.roleCopy(c.listenerId, showKey(c.feedUrl)), { feedUrl: c.feedUrl, role: 'owner', since: at, showKey: showKey(c.feedUrl) }));
}

/** A new claim item (pending, or proven at once for a show made in the Studio). */
export function claimItem(c: { id: string; listenerId: string; feedUrl: string; code: string; status: Claim['status']; provenAt: string | null; createdAt: string }): Item {
  return encode('claim', K.myClaim(c.listenerId, c.id), { ...c });
}

async function claimsOf(store: Store, listenerId: string): Promise<Item[]> {
  return (await partition(store, 'main', K.L(listenerId), { prefix: K.ST_SK.claims }))
    .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt'])));
}

export async function createClaim(store: Store, _db: Db, listenerId: string, feedUrl: string): Promise<Claim> {
  const existing = (await claimsOf(store, listenerId)).find((c) => c['feedUrl'] === feedUrl && c['status'] !== 'revoked');
  if (existing) return toClaim(existing);
  const id = randomUUID();
  const code = newCode();
  const item = claimItem({ id, listenerId, feedUrl, code, status: 'pending', provenAt: null, createdAt: nowIso(store) });
  const t = tx(store).put('main', item, { condition: 'attribute_not_exists(PK)' });
  claimUnique(t, K.U.claimCode(code), id);
  await t.commit();
  return toClaim(item);
}

export async function myClaims(store: Store, _db: Db, listenerId: string): Promise<Claim[]> {
  return (await claimsOf(store, listenerId)).filter((c) => c['status'] !== 'revoked').map(toClaim);
}

/** 'proven' only when the code is in the feed's text as the publisher serves it now; one proven claim per feed. */
export async function verifyClaim(store: Store, _db: Db, f: typeof fetch, listenerId: string, id: string): Promise<{ status: Claim['status'] } | 'not_found' | 'taken'> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return 'not_found';
  const c = await get(store, 'main', K.myClaim(listenerId, id));
  if (!c) return 'not_found';
  if (c['status'] === 'proven') return { status: 'proven' };
  const feedUrl = String(c['feedUrl']);
  const text = await withDeadline(FEED_TIMEOUT_MS, `claim ${feedUrl}`, async (signal) => {
    const res = await f(feedUrl, { signal, headers: { accept: 'application/rss+xml, application/xml, text/xml', 'user-agent': USER_AGENT } });
    if (!res.ok) return undefined;
    return readFeedText(res, (label, fatal) => new TextDecoder(label, { fatal }), CLAIM_MAX_BYTES);
  });
  if (text === undefined || !text.includes(String(c['code']))) return { status: 'pending' };
  const other = await provenOf(store, feedUrl);
  if (other && other.claimId !== id) return 'taken';
  const t = tx(store);
  proveInTx(t, { id, listenerId, feedUrl }, nowIso(store), true);
  try {
    await t.commit();
  } catch (e) {
    // Another claim of this feed was proven between our read and our write (guard G-M26-ST2).
    if (e instanceof TxCancelled && e.failed('proven')) return 'taken';
    throw e;
  }
  return { status: 'proven' };
}

export async function isProvenOwner(store: Store, _db: Db, listenerId: string, feedUrl: string): Promise<boolean> {
  return (await provenOf(store, feedUrl))?.listenerId === listenerId;
}

/** M14 (FR-03): the proven owner and the invited hosts of an episode's show (hosts count only while the show is claimed). */
export async function hostsOfEpisode(store: Store, _db: Db, episodeId: string): Promise<string[]> {
  const ep = await get(store, 'main', K.episode(episodeId));
  if (!ep) return [];
  const feedUrl = String(ep['feedUrl']);
  const proven = await provenOf(store, feedUrl);
  if (!proven) return [];
  const hosts = (await partition(store, 'main', K.SH(feedUrl), { prefix: 'HOST#' })).map((h) => String(h['listenerId']));
  return [...new Set([proven.listenerId, ...hosts])].sort();
}

/**
 * Revokes the feed's proven claim (give back, take-down): the claim's status, `U#PROVEN` and the owner's role copy, in
 * one transaction. Returns the owner, or undefined when the feed had no proven claim.
 */
export async function revokeProven(store: Store, feedUrl: string, also?: (t: Tx) => void): Promise<string | undefined> {
  const p = await provenOf(store, feedUrl);
  if (!p) {
    if (also) { const t = tx(store); also(t); await t.commit(); }
    return undefined;
  }
  const t = tx(store)
    .update('main', K.myClaim(p.listenerId, p.claimId), { update: 'SET #s = :r', condition: 'attribute_exists(PK)', names: { '#s': 'status' }, values: { ':r': 'revoked' } })
    .delete('main', K.U.proven(feedUrl), { condition: '#c = :c', names: { '#c': 'claimId' }, values: { ':c': p.claimId } })
    .delete('main', K.roleCopy(p.listenerId, showKey(feedUrl)));
  also?.(t);
  try {
    await t.commit();
  } catch (e) {
    if (e instanceof TxCancelled && e.conditionFailed) return revokeProven(store, feedUrl, also); // changed meanwhile: read again
    throw e;
  }
  return p.listenerId;
}

/** A listener's proven claims (their own partition) — the shows they own. */
export async function provenClaimsOf(store: Store, listenerId: string): Promise<{ feedUrl: string; provenAt: string }[]> {
  return (await claimsOf(store, listenerId)).filter((c) => c['status'] === 'proven')
    .map((c) => ({ feedUrl: String(c['feedUrl']), provenAt: str(c['provenAt']) ?? String(c['createdAt']) }));
}

export { keyOf };
