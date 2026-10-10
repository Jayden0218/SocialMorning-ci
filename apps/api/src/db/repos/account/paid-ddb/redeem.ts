// Redeem codes on DynamoDB: the code keyed by its hash; a redeem is one transaction (use + counter + grant).
/**
 * M26 lane PD (PD-T05; patterns PD-30…PD-39). Postgres twins: ../redeem.ts.
 *
 * - `RC#<sha256 hex>/CODE`: the hash IS the key, so the lookup is one strongly consistent GetItem (a GSI cannot be read
 *   consistently or locked — PD-31) and the code is unique by construction; the stored code is still compared with
 *   `timingSafeEqual`. G4 `Q#codes` (newest first) for the admin list.
 * - Redeem = ONE transaction: `L#<id>/RUSE#<hash>` with attribute_not_exists (one use per account — G-M24-A3-1),
 *   `ADD uses 1` on the code with `uses < maxUses AND attribute_not_exists(disabledAt)` (never more uses than allowed,
 *   however many listeners race — guard G-M26-PD3), and the grant: a show entitlement (attribute_not_exists), or a
 *   PLUS code row chained after the latest end plus the PLUS version bump. A refusal cancels all of it, so the code
 *   stays usable for this account (the old rollback). The refusal is told in the old order: already used by you →
 *   switched off / used up → you own the show already.
 * - Batch creation (PD-35): no 201-item transaction — each code is its own conditional Put (a collision draws
 *   another code); the codes of one batch share one creation time, so the list keeps the old (created_at DESC, code) order.
 */
import type { Db } from '../../../db.ts';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { isConditionFailed, isConflict, withRetry } from '../../../ddb/retry.ts';
import { get, put, type Item, type Store } from '../../../ddb/store.ts';
import { TxCancelled } from '../../../ddb/tx.ts';
import { pgOf } from '../../../backend-ddb.ts';
import { txa, upd } from '../ddb/common.ts';
import { codeHashOf, normalizeCode, parseGrant, sameCode, showTitle, newRedeemCode, type CodeInput, type CodeListItem, type Redeemed } from '../redeem.ts';
import { codeRef } from '../purchases.ts';
import { addZone, applyRows, bumpPlus, DAY_MS, entItem, iso, mirror, notEnded, nowMs, readPlus, zoneOf, type EntItem } from './common.ts';
import { plusUntil } from './purchases.ts';

const hashHex = (code: string): string => codeHashOf(code).toString('hex');
const NO_CODE = () => new ApiError('not_found', 'That code does not work. Check it and try again.');

/** Retry the whole redeem when only the PLUS version moved (someone else changed PLUS) or two writers collided. */
class Again extends Error { constructor() { super('redeem raced; read again'); } }

export async function redeemCode(store: Store, db: Db, raw: string, listenerId: string, now = new Date()): Promise<Redeemed> {
  const code = normalizeCode(raw);
  if (!code) throw NO_CODE();
  const key = K.redeemCode(hashHex(code));
  const result = await withRetry(async () => {
    const row = await get(store, 'main', key);
    if (!row || !sameCode(String(row['code']), code)) throw NO_CODE();
    const grant = parseGrant(row['grants']);
    if (!grant) throw NO_CODE();
    if (row['disabledAt']) throw new ApiError('cancelled', 'This code was switched off.');
    if (row['expiresAt'] && Date.parse(String(row['expiresAt'])) <= now.getTime()) throw new ApiError('cancelled', 'This code has expired.');
    const at = nowMs(store);
    const use = K.redeemUse(hashHex(code), listenerId);
    const t = txa(store)
      .put('main', encode('redeemUse', use, { code: row['code'], usedAt: iso(at) }), { condition: 'attribute_not_exists(PK)', label: 'use' })
      .update('main', key, {
        update: 'ADD uses :one SET usedAt = :at', condition: 'attribute_exists(PK) AND attribute_not_exists(disabledAt)' /* RED BREAK G-M26-PD3 */,
        values: { ':one': 1, ':at': iso(at) }, label: 'code',
      });
    let startsAt: string | undefined;
    if (grant.kind === 'plus') {
      // Fix F-S: the code is its own interval row, starting at the latest end over every source (or now).
      const st = await readPlus(store, listenerId);
      const live = st.rows.filter((r) => notEnded(r, at));
      const start = live.some((r) => r.until === null || r.until === undefined) ? at : Math.max(at, ...live.map((r) => Date.parse(r.until!)));
      const row2 = { listenerId, kind: 'plus' as const, ref: codeRef(String(row['code'])), until: iso(start + grant.days * DAY_MS), startsAt: iso(start), sourcePurchaseId: null };
      t.put('main', entItem(row2), { condition: 'attribute_not_exists(PK)', label: 'ent' });
      const tz = await zoneOf(store, listenerId);
      await addZone(store, tz);
      bumpPlus(t, listenerId, st, applyRows(st.rows, [{ ...row2, ...K.entitlement(listenerId, 'plus', row2.ref) } as EntItem]), tz, at);
      startsAt = row2.startsAt;
    } else {
      t.put('main', entItem({ listenerId, kind: 'show', ref: grant.feedUrl, until: null, sourcePurchaseId: null }), { condition: 'attribute_not_exists(PK)', label: 'ent' });
    }
    try {
      await t.commit();
    } catch (e) {
      if (!(e instanceof TxCancelled)) throw e;
      if (e.conflict) throw new Again();
      // The old order of refusals, from what is stored now.
      if (e.failed('use') || (await get(store, 'main', use))) throw new ApiError('already_claimed', 'You already used this code.');
      const nowRow = await get(store, 'main', key);
      if (e.failed('code') || !nowRow || nowRow['disabledAt'] || Number(nowRow['uses']) >= Number(nowRow['maxUses'])) {
        if (nowRow?.['disabledAt']) throw new ApiError('cancelled', 'This code was switched off.');
        throw new ApiError('cancelled', 'This code has been used up.');
      }
      if (grant.kind === 'show' && e.failed('ent')) throw new ApiError('already_owned', 'You already have this series. The code still works for someone else.');
      throw new Again(); // the PLUS version moved: read again
    }
    return { grant, startsAt };
  }, { tries: 10, retryOn: (e) => e instanceof Again || isConflict(e) });
  await mirror(store, db, { listeners: [listenerId] });
  if (result.grant.kind === 'plus') {
    const p = await plusUntil(store, db, listenerId);
    return { kind: 'plus', days: result.grant.days, startsAt: result.startsAt!, until: p.until };
  }
  return { kind: 'show', feedUrl: result.grant.feedUrl, title: await showTitle(pgOf(db), result.grant.feedUrl) };
}

// ---- Admin ----

export async function createCodes(store: Store, _db: Db, p: CodeInput, codes: string[] = []): Promise<string[]> {
  const made: string[] = [];
  const createdAt = iso(nowMs(store)); // one batch, one time (the old transaction's now())
  for (const wanted of codes.length > 0 ? codes : Array.from({ length: p.count }, () => newRedeemCode())) {
    let code = wanted;
    for (let i = 0; i < 5; i++) {
      try {
        await put(store, 'main', encode('redeemCode', K.redeemCode(hashHex(code)), {
          code, codeHash: hashHex(code), grants: p.grant, maxUses: p.maxUses, uses: 0, note: p.note, expiresAt: p.expiresAt ? iso(Date.parse(p.expiresAt)) : null, createdAt,
        }, { gsi: K.G4('codes', createdAt, code) }), { condition: 'attribute_not_exists(PK)' });
        made.push(code);
        break;
      } catch (e) {
        if (!isConditionFailed(e)) throw e;
        code = newRedeemCode();
      }
    }
  }
  if (made.length !== (codes.length > 0 ? codes.length : p.count)) throw new Error('could not make unique redeem codes');
  return made;
}

const cmp = (a: Item, b: Item): number => {
  const ca = String(a['createdAt']); const cb = String(b['createdAt']);
  if (ca !== cb) return ca < cb ? 1 : -1;
  return String(a['code']) < String(b['code']) ? -1 : String(a['code']) > String(b['code']) ? 1 : 0;
};

export async function listCodes(store: Store, db: Db, limit = 300): Promise<CodeListItem[]> {
  // Newest first; one batch (≤ 100 codes, one time) may straddle the limit, so read that much more and order in code.
  const { items } = await queryAll(store, 'main', {
    IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q', ExpressionAttributeValues: { ':q': 'Q#codes' }, ScanIndexForward: false,
  }, { max: limit + 100 });
  const rows = items.sort(cmp).slice(0, limit);
  const titles = new Map<string, string | null>();
  const out: CodeListItem[] = [];
  for (const r of rows) {
    const g = parseGrant(r['grants']);
    if (!g) continue;
    if (g.kind === 'show' && !titles.has(g.feedUrl)) titles.set(g.feedUrl, await showTitle(pgOf(db), g.feedUrl));
    out.push({
      code: String(r['code']), kind: g.kind, days: g.kind === 'plus' ? g.days : null, feedUrl: g.kind === 'show' ? g.feedUrl : null,
      showTitle: g.kind === 'show' ? (titles.get(g.feedUrl) ?? null) : null,
      uses: Number(r['uses'] ?? 0), maxUses: Number(r['maxUses']), note: String(r['note'] ?? ''), createdAt: String(r['createdAt']),
      expiresAt: (r['expiresAt'] as string | null | undefined) ?? null, disabled: Boolean(r['disabledAt']),
    });
  }
  return out;
}

export async function codeState(store: Store, _db: Db, codes: string[]): Promise<Record<string, unknown>[]> {
  if (codes.length === 0) return [];
  const got = await batchGetAll(store, 'main', [...new Set(codes)].map((c) => K.redeemCode(hashHex(c))));
  return got.filter((r) => codes.includes(String(r['code'])))
    .sort((a, b) => (String(a['code']) < String(b['code']) ? -1 : 1))
    .map((r) => ({ code: r['code'], grants: r['grants'], max_uses: r['maxUses'], uses: r['uses'], note: r['note'], disabled_at: r['disabledAt'] ?? null }));
}

export async function disableCode(store: Store, _db: Db, code: string): Promise<boolean> {
  try {
    await upd(store, 'main', K.redeemCode(hashHex(code)), {
      update: 'SET disabledAt = if_not_exists(disabledAt, :now)', condition: 'attribute_exists(PK) AND code = :c', values: { ':now': iso(nowMs(store)), ':c': code },
    });
    return true;
  } catch (e) {
    if (isConditionFailed(e)) return false;
    throw e;
  }
}
