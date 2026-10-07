// Redeem codes: the owner gives PLUS days or a paid show for free; each account uses a code once.
/**
 * M24 US15 (spec 025, lane A3). A redeem code is a free grant made by the owner in Admin — never a
 * sale, so no money moves (constitution 2.1.0: paid extras are sold only through the stores).
 *
 *  - The code is 12 symbols from an alphabet with no 0/O, 1/I/L (31 symbols, about 59 bits).
 *    The phone may send it with spaces, dashes or in lower case; `normalizeCode` removes them.
 *  - Lookup is by `code_hash` (sha256 of the code), and the stored code is then compared with
 *    `timingSafeEqual`, so no step compares the typed code character by character.
 *  - Guard G-A3-1: the `redeem_uses (code, listener_id)` primary key is what makes "one use per
 *    account" true; the INSERT … ON CONFLICT DO NOTHING finds a second use and refuses it. The
 *    whole redeem is one transaction: a refusal after that INSERT (used up, already own the
 *    show) rolls it back, so the code stays usable for this account.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REDEEM_CODE_LENGTH = 12;
export const MAX_PLUS_DAYS = 3650;

export type Grant = { kind: 'plus'; days: number } | { kind: 'show'; feedUrl: string };

export function newRedeemCode(): string {
  let out = '';
  for (let i = 0; i < REDEEM_CODE_LENGTH; i++) out += ALPHABET.charAt(randomInt(0, ALPHABET.length));
  return out;
}

/** "abcd-efgh ijkl" → "ABCDEFGHIJKL"; undefined when it cannot be a code. */
export function normalizeCode(raw: string): string | undefined {
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{6,32}$/.test(code) ? code : undefined;
}

export const codeHashOf = (code: string): Buffer => createHash('sha256').update(code, 'utf8').digest();

/** Constant-time compare of two codes (lengths are not secret: the hash already matched). */
export function sameCode(stored: string, typed: string): boolean {
  const a = Buffer.from(stored.toUpperCase(), 'utf8');
  const b = Buffer.from(typed, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The grant as stored (jsonb); a row that is not a valid grant is treated as no code. */
export function parseGrant(v: unknown): Grant | undefined {
  const o = typeof v === 'string' ? safeJson(v) : v;
  if (!o || typeof o !== 'object') return undefined;
  const g = o as Record<string, unknown>;
  if (g['kind'] === 'plus' && Number.isInteger(g['days']) && (g['days'] as number) >= 1 && (g['days'] as number) <= MAX_PLUS_DAYS) return { kind: 'plus', days: g['days'] as number };
  if (g['kind'] === 'show' && typeof g['feedUrl'] === 'string' && g['feedUrl'].length > 0) return { kind: 'show', feedUrl: g['feedUrl'] };
  return undefined;
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return undefined; }
}

export async function showTitle(db: Db, feedUrl: string): Promise<string | null> {
  const [r] = await db.query<{ title: string | null }>(
    `SELECT coalesce(o.title, h.title) AS title FROM (SELECT $1::text AS feed_url) x
       LEFT JOIN hosted_shows h ON h.feed_url = x.feed_url
       LEFT JOIN show_overrides o ON o.feed_url = x.feed_url`, [feedUrl]);
  return r?.title ?? null;
}

export type Redeemed = { kind: 'plus'; days: number; until: string | null } | { kind: 'show'; feedUrl: string; title: string | null };

type CodeRow = { code: string; grants: unknown; max_uses: number; uses: number; expires_at: Date | string | null; disabled_at: Date | string | null };

const NO_CODE = () => new ApiError('not_found', 'That code does not work. Check it and try again.');

/** POST /v1/me/redeem — one transaction; see the file comment for the order of the checks. */
export async function redeemCode(db: Db, raw: string, listenerId: string, now = new Date()): Promise<Redeemed> {
  const code = normalizeCode(raw);
  if (!code) throw NO_CODE();
  return db.transaction(async (tx) => {
    const [row] = await tx.query<CodeRow>(
      'SELECT code, grants, max_uses, uses, expires_at, disabled_at FROM redeem_codes WHERE code_hash = $1 FOR UPDATE', [codeHashOf(code)]);
    if (!row || !sameCode(row.code, code)) throw NO_CODE();
    const grant = parseGrant(row.grants);
    if (!grant) throw NO_CODE();
    if (row.disabled_at !== null) throw new ApiError('cancelled', 'This code was switched off.');
    if (row.expires_at !== null && new Date(row.expires_at).getTime() <= now.getTime()) throw new ApiError('cancelled', 'This code has expired.');
    // G-A3-1: one use per code per account.
    const [mine] = await tx.query<{ code: string }>(
      'INSERT INTO redeem_uses (code, listener_id) VALUES ($1, $2) ON CONFLICT (code, listener_id) DO NOTHING RETURNING code', [row.code, listenerId]);
    if (!mine) throw new ApiError('already_claimed', 'You already used this code.');
    const [took] = await tx.query<{ uses: number }>(
      'UPDATE redeem_codes SET uses = uses + 1, used_by = $2, used_at = now() WHERE code = $1 AND uses < max_uses AND disabled_at IS NULL RETURNING uses', [row.code, listenerId]);
    if (!took) throw new ApiError('cancelled', 'This code has been used up.');
    if (grant.kind === 'plus') {
      // Adds the days to PLUS: from now, or from the end of PLUS already running. NULL (for ever) stays.
      const [e] = await tx.query<{ until: Date | string | null }>(
        `INSERT INTO entitlements (listener_id, kind, ref, until) VALUES ($1, 'plus', '', now() + make_interval(days => $2::int))
         ON CONFLICT (listener_id, kind, ref) DO UPDATE SET until = CASE WHEN entitlements.until IS NULL THEN NULL
           ELSE GREATEST(entitlements.until, now()) + make_interval(days => $2::int) END
         RETURNING until`, [listenerId, grant.days]);
      return { kind: 'plus', days: grant.days, until: e?.until ? new Date(e.until).toISOString() : null };
    }
    const [owns] = await tx.query("SELECT 1 FROM entitlements WHERE listener_id = $1 AND kind = 'show' AND ref = $2", [listenerId, grant.feedUrl]);
    if (owns) throw new ApiError('already_owned', 'You already have this series. The code still works for someone else.');
    await tx.query(
      `INSERT INTO entitlements (listener_id, kind, ref, until, source_purchase_id) VALUES ($1, 'show', $2, NULL, NULL)
       ON CONFLICT (listener_id, kind, ref) DO NOTHING`, [listenerId, grant.feedUrl]);
    return { kind: 'show', feedUrl: grant.feedUrl, title: await showTitle(tx, grant.feedUrl) };
  });
}

// ---- Admin ----

export type CodeInput = { grant: Grant; count: number; maxUses: number; note: string; expiresAt: string | null; createdBy: string };

/** Makes `count` new codes with the same grant; returns them in the order made. */
export async function createCodes(db: Db, p: CodeInput, codes: string[] = []): Promise<string[]> {
  const made: string[] = [];
  for (const wanted of codes.length > 0 ? codes : Array.from({ length: p.count }, () => newRedeemCode())) {
    let code = wanted;
    for (let i = 0; i < 5; i++) {
      const [row] = await db.query<{ code: string }>(
        `INSERT INTO redeem_codes (code, code_hash, grants, created_by, max_uses, note, expires_at)
         VALUES ($1, $2, ($3::text)::jsonb, $4, $5, $6, $7) ON CONFLICT DO NOTHING RETURNING code`,
        [code, codeHashOf(code), JSON.stringify(p.grant), p.createdBy, p.maxUses, p.note, p.expiresAt]);
      if (row) { made.push(row.code); break; }
      code = newRedeemCode();
    }
  }
  if (made.length !== (codes.length > 0 ? codes.length : p.count)) throw new Error('could not make unique redeem codes');
  return made;
}

export type CodeListItem = {
  code: string; kind: 'plus' | 'show'; days: number | null; feedUrl: string | null; showTitle: string | null;
  uses: number; maxUses: number; note: string; createdAt: string; expiresAt: string | null; disabled: boolean;
};

const iso = (v: Date | string | null): string | null => (v === null ? null : new Date(v).toISOString());

export async function listCodes(db: Db, limit = 300): Promise<CodeListItem[]> {
  const rows = await db.query<CodeRow & { note: string; created_at: Date | string }>(
    'SELECT code, grants, max_uses, uses, expires_at, disabled_at, note, created_at FROM redeem_codes ORDER BY created_at DESC, code LIMIT $1', [limit]);
  const titles = new Map<string, string | null>();
  const out: CodeListItem[] = [];
  for (const r of rows) {
    const g = parseGrant(r.grants);
    if (!g) continue;
    if (g.kind === 'show' && !titles.has(g.feedUrl)) titles.set(g.feedUrl, await showTitle(db, g.feedUrl));
    out.push({
      code: r.code, kind: g.kind, days: g.kind === 'plus' ? g.days : null, feedUrl: g.kind === 'show' ? g.feedUrl : null,
      showTitle: g.kind === 'show' ? (titles.get(g.feedUrl) ?? null) : null,
      uses: r.uses, maxUses: r.max_uses, note: r.note, createdAt: iso(r.created_at)!, expiresAt: iso(r.expires_at), disabled: r.disabled_at !== null,
    });
  }
  return out;
}

/** The paid shows a code can give (a hosted show with a price, not deleted). */
export async function paidShows(db: Db): Promise<{ feedUrl: string; title: string }[]> {
  const rows = await db.query<{ feed_url: string; title: string }>(
    'SELECT h.feed_url, coalesce(o.title, h.title) AS title FROM hosted_shows h LEFT JOIN show_overrides o ON o.feed_url = h.feed_url WHERE h.deleted_at IS NULL AND h.price_tier IS NOT NULL ORDER BY 2 LIMIT 200');
  return rows.map((r) => ({ feedUrl: r.feed_url, title: r.title }));
}

export async function codeState(db: Db, codes: string[]): Promise<Record<string, unknown>[]> {
  if (codes.length === 0) return [];
  return db.query<Record<string, unknown>>('SELECT code, grants, max_uses, uses, note, disabled_at FROM redeem_codes WHERE code IN (SELECT jsonb_array_elements_text(($1::text)::jsonb)) ORDER BY code', [JSON.stringify(codes)]);
}

/** Switches a code off; uses already made keep what they gave. False when there is no such code. */
export async function disableCode(db: Db, code: string): Promise<boolean> {
  const rows = await db.query<{ code: string }>('UPDATE redeem_codes SET disabled_at = coalesce(disabled_at, now()) WHERE code = $1 RETURNING code', [code]);
  return rows.length > 0;
}
