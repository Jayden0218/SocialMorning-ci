// Page cursors: a DynamoDB resume key ↔ an opaque, signed string the API hands out (a forged one is refused).
/**
 * M26 F0-06, data-model.md §11.
 *
 * Two kinds:
 * 1. `encodeCursor` / `decodeCursor` — a `LastEvaluatedKey` (only string/number key attributes) as
 *    base64url JSON + an HMAC-SHA256 tag (first 16 bytes). A client cannot hand us a key into another
 *    listener's partition: the signature fails and the page starts again (`null`), never an error page.
 * 2. `startKeyFromSk` — for the lists whose API cursor already has a public format (`<createdAt>|<id>`
 *    keyset cursors, chat's numeric message id — data-model.md §11): the repo rebuilds the
 *    `ExclusiveStartKey` from the values the cursor carries, so the phone's cursor format does not change.
 *
 * `ExclusiveStartKey` must hold the table's key and, for a GSI query, the index key too
 * (https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.Pagination.html — the
 * LastEvaluatedKey of a page is used unchanged as the next ExclusiveStartKey).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type StartKey = Record<string, string | number>;

const b64url = (b: Buffer): string => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string): Buffer => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const tag = (secret: string, body: string): Buffer => createHmac('sha256', secret).update(body).digest().subarray(0, 16);

export function encodeCursor(key: Record<string, unknown>, secret: string): string {
  const clean: StartKey = {};
  for (const [k, v] of Object.entries(key)) {
    if (typeof v !== 'string' && typeof v !== 'number') throw new Error(`cursor: key attribute ${k} must be a string or number`);
    clean[k] = v;
  }
  const body = b64url(Buffer.from(JSON.stringify(clean), 'utf8'));
  return `${body}.${b64url(tag(secret, body))}`;
}

/** The key, or `null` for anything not made by `encodeCursor` with this secret (or tampered with). */
export function decodeCursor(cursor: string | null | undefined, secret: string): StartKey | null {
  if (!cursor || cursor.length > 4096) return null;
  const dot = cursor.indexOf('.');
  if (dot <= 0 || dot !== cursor.lastIndexOf('.')) return null;
  const body = cursor.slice(0, dot);
  const sig = fromB64url(cursor.slice(dot + 1));
  const want = tag(secret, body);
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  try {
    const v: unknown = JSON.parse(fromB64url(body).toString('utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    for (const x of Object.values(v)) if (typeof x !== 'string' && typeof x !== 'number') return null;
    return v as StartKey;
  } catch {
    return null;
  }
}

/**
 * A resume key from values a public cursor carries. `pk`/`sk` are the table key; `index` adds the GSI key
 * attributes (e.g. `{ G1PK: 'AUTH#…', G1SK: 'comment#…' }`) for a GSI query.
 */
export function startKeyFromSk(pk: string, sk: string, index?: Record<string, string>): StartKey {
  return { PK: pk, SK: sk, ...(index ?? {}) };
}
