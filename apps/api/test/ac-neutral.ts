// Account-lane test helpers: seed, age and read account rows (DynamoDB items) so a test does not repeat the item shapes.
/**
 * M26 lane AC. The account tests seed and assert account rows (listeners, sessions, codes, rate counters,
 * feedback, error log, push tokens, digests, deletions). Each helper reads/writes the items through
 * test/fixtures.ts and src/db/ddb, loaded dynamically.
 */
import { tokenHash, issueToken } from '../src/auth/session.ts';
import { TEST_PEPPER, type TestDb } from './harness.ts';

type Row = Record<string, unknown>;
const fx = () => import('./fixtures.ts');

/** The listener as the old `SELECT * FROM listeners` row (snake_case), or undefined. */
export async function listenerRow(t: TestDb, id: string): Promise<Row | undefined> {
  return (await fx()).acListenerRow(t.store, id);
}

/** The listener with this email, as a row, or undefined. */
export async function listenerByEmailRow(t: TestDb, email: string): Promise<Row | undefined> {
  return (await fx()).acListenerByEmail(t.store, email);
}

/** How many accounts exist. */
export async function listenerCount(t: TestDb): Promise<number> {
  return (await fx()).acCount(t.store, 'main', 'listener');
}

/** Sets (ISO) or clears the sign-in lock of one listener, or of every listener when `id` is omitted. */
export async function setLockedUntil(t: TestDb, iso: string | null, id?: string): Promise<void> {
  await (await fx()).acSetLocked(t.store, iso, id);
}

/** Moves a field of every emailed sign-in code (`expires_at` / `sent_at`) to `iso`. */
export async function setEmailCodeTime(t: TestDb, field: 'expires_at' | 'sent_at', iso: string): Promise<void> {
  await (await fx()).acSetCodeTime(t.store, field === 'expires_at' ? 'expiresAt' : 'sentAt', iso);
}

export async function emailCodeExists(t: TestDb, email: string): Promise<boolean> {
  return (await fx()).acHasItem(t.store, (await import('../src/db/ddb/keys.ts')).emailCode(email));
}

/** Makes every pending deletion due (the 15-day wait is over). */
export async function makeDeletionsDue(t: TestDb): Promise<void> {
  await (await fx()).acDeletionsDue(t.store, new Date(Date.now() - 1000).toISOString());
}

/** How many deletion requests are stored. */
export async function deletionCount(t: TestDb): Promise<number> {
  return (await fx()).acCount(t.store, 'main', 'deletion');
}

/** Every session row of a listener (all of them when omitted). */
export async function sessionCount(t: TestDb, listenerId?: string): Promise<number> {
  return (await (await fx()).acSessions(t.store, listenerId)).length;
}

type SessionField = 'rotated_at' | 'replaced_at' | 'created_at' | 'last_seen_at';
const camel: Record<SessionField, string> = { rotated_at: 'rotatedAt', replaced_at: 'replacedAt', created_at: 'createdAt', last_seen_at: 'lastSeenAt' };

/** Sets a time of every session (only the replaced ones with `replacedOnly`) to `ageMs` ago. */
export async function ageSessions(t: TestDb, field: SessionField, ageMs: number, opts: { replacedOnly?: boolean } = {}): Promise<void> {
  const iso = new Date(Date.now() - ageMs).toISOString();
  await (await fx()).acSetSessionTime(t.store, camel[field], iso, opts.replacedOnly ?? false);
}

/** A raw session (as an old sign-in left it): `lastSeenMsAgo`, act-as by `actingAdmin`. Returns the token. */
export async function rawSession(t: TestDb, listenerId: string, o: { lastSeenMsAgo?: number; actingAdmin?: string } = {}): Promise<string> {
  const token = issueToken();
  const hash = tokenHash(token, TEST_PEPPER);
  const seen = new Date(Date.now() - (o.lastSeenMsAgo ?? 0)).toISOString();
  await (await fx()).acSessionItem(t.store, { hash, listenerId, lastSeenAt: seen, ...(o.actingAdmin ? { actingAdminId: o.actingAdmin } : {}) }); return token;
}

/** The session's last-seen time in ms. */
export async function sessionLastSeen(t: TestDb, token: string): Promise<number> {
  const hash = tokenHash(token, TEST_PEPPER);
  const s = await (await fx()).acSession(t.store, hash); return Date.parse(String(s?.['lastSeenAt']));
}

/** test/studio-harness.ts: a Studio session of this listener has (or has not) passed the second factor. */
export async function studioFactor(t: TestDb, listenerId: string, passed: boolean): Promise<void> {
  await (await fx()).acStudioFactor(t.store, listenerId, passed ? new Date().toISOString() : null);
}

/** Sets a rate-limit window's count (every window of the key when `windowStart` is omitted). */
export async function setRateCount(t: TestDb, key: string, n: number, windowStart?: Date): Promise<void> {
  await (await fx()).acSetRate(t.store, key, n, windowStart?.toISOString());
}

/** Every stored feedback picture. */
export async function feedbackImageCount(t: TestDb): Promise<number> {
  return (await fx()).acCount(t.store, 'main', 'feedbackImage');
}

/** Feedback bodies starting with `prefix`. */
export async function feedbackBodies(t: TestDb, prefix: string): Promise<string[]> {
  return (await fx()).acFeedbackBodies(t.store, prefix);
}

/** Every feedback picture is `days` old. */
export async function ageFeedbackImages(t: TestDb, days: number): Promise<void> {
  const iso = new Date(Date.now() - days * 86_400_000).toISOString();
  await (await fx()).acAgeFeedbackImages(t.store, iso);
}

/** The error-log rows of a scope (scope, message, platform, listener_id). */
export async function errorRows(t: TestDb, scope: string): Promise<{ scope: string; message: string; platform: string; listener_id: string | null }[]> {
  return (await fx()).acErrorRows(t.store, scope);
}

/** Every stored push token, sorted. */
export async function pushTokenList(t: TestDb): Promise<string[]> {
  return (await fx()).acPushTokens(t.store);
}

/** A digest already sent (`sentAt` in the past). */
export async function oldDigest(t: TestDb, listenerId: string, isoWeek: string, episodeIds: string[], sentAt: string): Promise<void> {
  await (await fx()).acDigestItem(t.store, { listenerId, isoWeek, episodeIds, sentAt });
}

export async function digestCount(t: TestDb): Promise<number> {
  return (await fx()).acCount(t.store, 'main', 'weeklyDigest');
}

/** Whether the listener has a stored queue. */
export async function queueStored(t: TestDb, listenerId: string): Promise<boolean> {
  return (await fx()).acHasItem(t.store, (await import('../src/db/ddb/keys.ts')).listenerSingleton(listenerId, 'QUEUE'));
}

/** Moves the pending email change's send time. */
export async function setEmailChangeSentAt(t: TestDb, iso: string): Promise<void> {
  await (await fx()).acSetEmailChangeSent(t.store, iso);
}
