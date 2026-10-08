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

export async function createSession(db: Db, listenerId: string, pepper: string, deviceLabel?: string): Promise<string> {
  const token = issueToken();
  await db.query('INSERT INTO sessions (token_hash, listener_id, device_label) VALUES ($1, $2, $3)', [
    tokenHash(token, pepper), listenerId, deviceLabel ?? null,
  ]);
  return token;
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
export async function listenerForToken(db: Db, token: string, pepper: string): Promise<Listener | undefined> {
  const rows = await db.query<Listener>(
    `WITH s AS (
       SELECT l.id, l.email, l.display_name, l.created_at, l.suspended_at, s.device_label
         FROM sessions s JOIN listeners l ON l.id = s.listener_id
        WHERE s.token_hash = $1 AND s.acting_admin_id IS NULL
          AND s.last_seen_at > now() - make_interval(days => $2::int)
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

export type AuthEnv = { Variables: { db: Db; pepper: string; listener?: Listener; token?: string; catalog: Catalog; safety: Safety; mailer?: import('../mail/mailer.ts').Mailer;
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
    const listener = await listenerForToken(c.get('db'), token, c.get('pepper'));
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
