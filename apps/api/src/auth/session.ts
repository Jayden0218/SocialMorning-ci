// Session tokens: create, hash, look up the signed-in listener, require sign-in.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import type { Db } from '../db/db.ts';
import { ApiError } from '../errors.ts';
import { appealTokenFor } from './appeal-token.ts';

export type Listener = { id: string; email: string; display_name: string; created_at: Date | string; suspended_at?: Date | string | null };

/** Opaque token: 32 random bytes. Only `sha256(token || pepper)` is stored (research R3). */
export function issueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokenHash(token: string, pepper: string): Buffer {
  return createHash('sha256').update(token).update(pepper).digest();
}

/**
 * M25 SB: `country` is the two letters of the network the sign-in came from (`countryOf`), shown in
 * Settings › Devices; `secondFactor` marks a session that already proved the inbox (an email-code
 * sign-in), so Admin does not ask for a second code on it.
 */
export async function createSession(db: Db, listenerId: string, pepper: string, deviceLabel?: string, extra: { country?: string | undefined; secondFactor?: boolean } = {}): Promise<string> {
  const token = issueToken();
  await db.query(`INSERT INTO sessions (token_hash, listener_id, device_label, country, second_factor_at) VALUES ($1, $2, $3, $4, ${extra.secondFactor ? 'now()' : 'NULL'})`, [
    tokenHash(token, pepper), listenerId, deviceLabel ?? null, extra.country ?? null,
  ]);
  return token;
}

/** M25 SB: a session lives at most this long from its first sign-in, however busy (rotation keeps `created_at`). */
export const SESSION_MAX_DAYS = 180;
/** M25 SB: a token is swapped for a new one at most this often … */
export const ROTATE_EVERY_HOURS = 24;
/** … and the swapped-out token still works this long, so requests already on their way do not fail. */
export const ROTATE_GRACE_SECONDS = 120;
/** The phone asks for rotation with this request header (an older build never sends it, so it is never rotated) … */
export const ROTATE_ASK_HEADER = 'x-session-rotate';
/** … and gets the new token in this response header. */
export const ROTATED_HEADER = 'x-session-token';

/** The SQL that keeps a session row valid beyond the token match: lifetime and the rotation grace. `s` is the sessions alias. */
const LIVE_SESSION = `s.created_at > now() - make_interval(days => ${SESSION_MAX_DAYS})
          AND (s.replaced_at IS NULL OR s.replaced_at > now() - make_interval(secs => ${ROTATE_GRACE_SECONDS}))`;
export const liveSessionSql = LIVE_SESSION;

/**
 * M25 SB (secret rotation, docs/runbooks/secret-rotation.md): while `PEPPER_NEXT` is set, a token
 * whose row was hashed with the other pepper is re-keyed to the current one the first time it is
 * seen. Every later statement (sign-out, rotation, device list) then finds it by the current hash.
 * A no-op (no query) when there is no second pepper.
 */
export async function rekey(db: Db, token: string, pepper: string, next: string | undefined): Promise<void> {
  if (!next || next === pepper) return;
  const cur = tokenHash(token, pepper);
  const [have] = await db.query<{ ok: number }>('SELECT 1 AS ok FROM sessions WHERE token_hash = $1', [cur]);
  if (have) return;
  await db.query('UPDATE sessions SET token_hash = $1 WHERE token_hash = $2', [cur, tokenHash(token, next)]);
}

/**
 * M25 SB: swaps a live token for a new one when its last swap is a day old. The old row is kept
 * for ROTATE_GRACE_SECONDS (parallel requests still carry it) and points at the new one. The
 * guarded UPDATE is the lock: of two requests racing here, one rotates and the other gets
 * `undefined` (and its token keeps working through the grace window).
 */
export async function rotateSession(db: Db, token: string, pepper: string): Promise<string | undefined> {
  const old = tokenHash(token, pepper);
  const fresh = issueToken();
  const freshHash = tokenHash(fresh, pepper);
  return db.transaction(async (tx) => {
    const [row] = await tx.query<{ listener_id: string; device_label: string | null; created_at: Date | string; country: string | null; second_factor_at: Date | string | null }>(
      `UPDATE sessions SET replaced_at = now()
        WHERE token_hash = $1 AND replaced_at IS NULL AND acting_admin_id IS NULL
          AND rotated_at < now() - make_interval(hours => ${ROTATE_EVERY_HOURS})
        RETURNING listener_id, device_label, created_at, country, second_factor_at`,
      [old]);
    if (!row) return undefined;
    await tx.query(
      `INSERT INTO sessions (token_hash, listener_id, device_label, created_at, last_seen_at, country, second_factor_at, rotated_at)
       VALUES ($1, $2, $3, $4, now(), $5, $6, now())`,
      [freshHash, row.listener_id, row.device_label, new Date(row.created_at), row.country, row.second_factor_at === null ? null : new Date(row.second_factor_at)]);
    await tx.query('UPDATE sessions SET replaced_by = $2 WHERE token_hash = $1', [old, freshHash]);
    return fresh;
  });
}

/** A response a shared cache may keep must never carry a new token. */
export function cacheablePublicly(res: Response): boolean {
  const cc = (res.headers.get('cache-control') ?? '').toLowerCase();
  return /\bpublic\b|s-maxage/.test(cc) && !/\bprivate\b|no-store/.test(cc);
}

/**
 * M18 (FR-014, research R1–R3): the same statement records that this person used the app today —
 * one `daily_active` row per (UTC+8 day, account), a second visit a no-op. A Studio session
 * (`studio-web`) never counts as app use. No extra round trip: this already ran on every request.
 *
 * M23 (G-M23-3): a session idle for 90 days is refused, and so is an admin's act-as session
 * (`acting_admin_id` set) — act-as belongs to the Studio only. `last_seen_at` moves only when it
 * is 5 minutes old, so a busy listener no longer writes the sessions row on every request.
 */
export async function listenerForToken(db: Db, token: string, pepper: string, pepperNext?: string): Promise<Listener | undefined> {
  await rekey(db, token, pepper, pepperNext);
  const rows = await db.query<Listener>(
    `WITH s AS (
       SELECT l.id, l.email, l.display_name, l.created_at, l.suspended_at, s.device_label
         FROM sessions s JOIN listeners l ON l.id = s.listener_id
        WHERE s.token_hash = $1 AND s.acting_admin_id IS NULL
          AND s.last_seen_at > now() - make_interval(days => $2::int)
          AND ${LIVE_SESSION}
     ), u AS (
       UPDATE sessions SET last_seen_at = now()
        WHERE token_hash = $1 AND EXISTS (SELECT 1 FROM s)
          AND last_seen_at < now() - make_interval(mins => $3::int)
     ), d AS (
       INSERT INTO daily_active (day, listener_id)
       SELECT ((now() AT TIME ZONE 'UTC') + interval '8 hours')::date, id FROM s
        WHERE device_label IS DISTINCT FROM 'studio-web'
       ON CONFLICT DO NOTHING
     )
     SELECT id, email, display_name, created_at, suspended_at FROM s`,
    [tokenHash(token, pepper), SESSION_IDLE_DAYS, LAST_SEEN_EVERY_MINUTES],
  );
  return rows[0];
}

/** M23 US2 (FR-004): a phone session unused this long no longer signs anyone in (Studio keeps its 12 h). */
export const SESSION_IDLE_DAYS = 90;
/** M23 US6 (FR-011): `last_seen_at` is written at most this often per session, not on every call. */
export const LAST_SEEN_EVERY_MINUTES = 5;

/** M23 US2 (FR-004): compares two secrets in constant time (both hashed first, so lengths match). */
export function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export type AuthEnv = { Variables: { db: Db; pepper: string;
  /** M25 SB: the second accepted pepper while a rotation is under way (env PEPPER_NEXT); tokens, codes and signed links made with it still verify. */
  pepperNext?: string;
  /** M25 SB: test purchases (Google licence testers) are granted (and marked) only when this is true. */
  allowTestPurchases: boolean; listener?: Listener; token?: string; catalog: Catalog; safety: Safety; mailer?: import('../mail/mailer.ts').Mailer;
  /** M13: created shows' audio store, and the public address their feeds live under. */
  storage: import('../storage/episodes-blob.ts').EpisodeStorage; publicBase: string; hostedCeilingBytes: number;
  /** M12 FR-104: the voice-post store (`socialmorning-voice`); `ready` false when its token is unset. */
  voice: import('../storage/voice-blob.ts').VoiceStorage;
  /** M19 US1: profile photos — the launch-image store (constitution v2.6.0), same put/remove shape as voice. */
  avatars: import('../storage/voice-blob.ts').VoiceStorage;
  /** M20 US9: comment images — Blob `socialmorning-images` (constitution v3.2.1); `ready` false until its token is set. */
  images: import('../storage/image-store.ts').ImageStorage; imageCeilingBytes: number;
  /** M20 US6: Google Play (purchases); `ready` false until GOOGLE_PLAY_SA_JSON + GOOGLE_PLAY_PACKAGE are set. */
  play: import('../billing/google-play.ts').GooglePlay;
  /** M12 FR-034: the fetch the share card uses for artwork (tests inject a fake). */
  imageFetch: typeof fetch;
  /** M25 S1: the fetch the paid-preview proxy reads the stored audio with (tests inject a fake; SSRF-guarded). */
  audioFetch: typeof fetch } };

/** M6: the moderator's id, the appeals address, the published build's hash — any may be unset. */
export type Safety = { ownerListenerId?: string; appealsEmail?: string; releaseSha256?: string };

/** M5: what the discovery routes need beyond the db — the catalogue fetch (real or fake) and the owner's picks. */
export type Catalog = {
  fetch: typeof fetch; picks: import('@socialmorning/social-core').PickIn[]; today: () => string;
  /** M10b US3: Expo push. */
  pushFetch: typeof fetch;
  /** M10: the owner's curated collections (collections.json), validated once at start. */
  collections: import('../catalog/collections.ts').CollectionIn[];
  /** M12 FR-101: curated issues, from the picks file's `issues` key. */
  issues: import('@socialmorning/social-core').IssueIn[];
};

function bearer(c: Context): string | undefined {
  const h = c.req.header('authorization');
  if (!h) return undefined;
  const [scheme, token] = h.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/** Sets `listener` when a valid token is present; never fails (for the public poll, FR-022). */
export const optionalAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const token = bearer(c);
  if (token) {
    const listener = await listenerForToken(c.get('db'), token, c.get('pepper'), c.get('pepperNext'));
    if (listener) {
      // M6 (FR-015, G6): a suspended account is refused everywhere, with the appeals address.
      if (listener.suspended_at) throw suspendedError(c.get('safety')?.appealsEmail, appealTokenFor(listener.id, c.get('pepper')));
      c.set('listener', listener);
      c.set('token', token);
    }
  }
  await next();
};

export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  await optionalAuth(c, async () => {});
  if (!c.get('listener')) throw new ApiError('unauthenticated', 'Sign in to do that.');
  await next();
};

/** M24 US6: `appealToken` (when known) lets the phone send an appeal after it forgot the session. */
export function suspendedError(appeals: string | undefined, appealToken?: string): ApiError {
  const where = appeals ? `Write to ${appeals}.` : 'Write to the owner.';
  return new ApiError('suspended', `This account is suspended. ${where}`, { ...(appeals ? { appeals } : {}), ...(appealToken ? { appealToken } : {}) });
}

export function publicListener(l: Listener) {
  return { id: l.id, email: l.email, displayName: l.display_name, createdAt: l.created_at };
}
