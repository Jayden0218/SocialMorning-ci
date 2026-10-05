// Session tokens: create, hash, look up the signed-in listener, require sign-in.
import { createHash, randomBytes } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import type { Db } from '../db/db.ts';
import { ApiError } from '../errors.ts';

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
 */
export async function listenerForToken(db: Db, token: string, pepper: string): Promise<Listener | undefined> {
  const rows = await db.query<Listener>(
    `WITH s AS (
       UPDATE sessions s SET last_seen_at = now()
       FROM listeners l WHERE s.token_hash = $1 AND l.id = s.listener_id
       RETURNING l.id, l.email, l.display_name, l.created_at, l.suspended_at, s.device_label
     ), d AS (
       INSERT INTO daily_active (day, listener_id)
       SELECT ((now() AT TIME ZONE 'UTC') + interval '8 hours')::date, id FROM s
        WHERE device_label IS DISTINCT FROM 'studio-web'
       ON CONFLICT DO NOTHING
     )
     SELECT id, email, display_name, created_at, suspended_at FROM s`,
    [tokenHash(token, pepper)],
  );
  return rows[0];
}

export type AuthEnv = { Variables: { db: Db; pepper: string; listener?: Listener; token?: string; catalog: Catalog; safety: Safety; mailer?: import('../mail/mailer.ts').Mailer;
  /** M13: created shows' audio store, and the public address their feeds live under. */
  storage: import('../storage/episodes-blob.ts').EpisodeStorage; publicBase: string; hostedCeilingBytes: number;
  /** M12 FR-104: the voice-post store (`socialmorning-voice`); `ready` false when its token is unset. */
  voice: import('../storage/voice-blob.ts').VoiceStorage;
  /** M19 US1: profile photos — the launch-image store (constitution v2.6.0), same put/remove shape as voice. */
  avatars: import('../storage/voice-blob.ts').VoiceStorage;
  /** M12 FR-034: the fetch the share card uses for artwork (tests inject a fake). */
  imageFetch: typeof fetch } };

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
      if (listener.suspended_at) throw suspendedError(c.get('safety')?.appealsEmail);
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

export function suspendedError(appeals: string | undefined): ApiError {
  const where = appeals ? `Write to ${appeals}.` : 'Write to the owner.';
  return new ApiError('suspended', `This account is suspended. ${where}`, { ...(appeals ? { appeals } : {}) });
}

export function publicListener(l: Listener) {
  return { id: l.id, email: l.email, displayName: l.display_name, createdAt: l.created_at };
}
