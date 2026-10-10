// Account-lane test helpers that work on both backends: Postgres SQL today, DynamoDB items when the test runs hybrid (TEST_BACKEND=ddb).
/**
 * M26 lane AC. The account tests seed and assert account rows (listeners, sessions, codes, rate counters,
 * feedback, error log, push tokens, digests, deletions). Those rows live in Postgres on the gate and in
 * DynamoDB under ddb-api.yml, so each helper here does the same thing on whichever backend `t` runs:
 * with `t.store` it reads/writes items (through test/fixtures.ts and src/db/ddb — loaded dynamically, so
 * the Postgres coverage run never loads them), otherwise the SQL the test used to inline.
 * CUT deletes the Postgres branches. Rows of OTHER lanes (comments, episodes, entitlements …) are still
 * seeded with `t.q` in the tests: those lanes are still on Postgres in both runs.
 */
import { tokenHash, issueToken } from '../src/auth/session.ts';
import { TEST_PEPPER, type TestDb } from './harness.ts';

type Row = Record<string, unknown>;
const fx = () => import('./fixtures.ts');

/** The listener as the old `SELECT * FROM listeners` row (snake_case), or undefined. */
export async function listenerRow(t: TestDb, id: string): Promise<Row | undefined> {
  if (t.store) return (await fx()).acListenerRow(t.store, id);
  return (await t.q('SELECT * FROM listeners WHERE id = $1', [id]))[0];
}

/** The listener with this email, as a row, or undefined. */
export async function listenerByEmailRow(t: TestDb, email: string): Promise<Row | undefined> {
  if (t.store) return (await fx()).acListenerByEmail(t.store, email);
  return (await t.q('SELECT * FROM listeners WHERE email = $1', [email]))[0];
}

/** How many accounts exist. */
export async function listenerCount(t: TestDb): Promise<number> {
  if (t.store) return (await fx()).acCount(t.store, 'main', 'listener');
  return Number((await t.q<{ n: number }>('SELECT count(*)::int AS n FROM listeners'))[0]!.n);
}

/** Sets (ISO) or clears the sign-in lock of one listener, or of every listener when `id` is omitted. */
export async function setLockedUntil(t: TestDb, iso: string | null, id?: string): Promise<void> {
  if (t.store) { await (await fx()).acSetLocked(t.store, iso, id); return; }
  if (id) await t.q('UPDATE listeners SET locked_until = $2 WHERE id = $1', [id, iso]);
  else await t.q('UPDATE listeners SET locked_until = $1', [iso]);
}

/** Moves a field of every emailed sign-in code (`expires_at` / `sent_at`) to `iso`. */
export async function setEmailCodeTime(t: TestDb, field: 'expires_at' | 'sent_at', iso: string): Promise<void> {
  if (t.store) { await (await fx()).acSetCodeTime(t.store, field === 'expires_at' ? 'expiresAt' : 'sentAt', iso); return; }
  await t.q(`UPDATE email_codes SET ${field} = $1`, [iso]);
}

export async function emailCodeExists(t: TestDb, email: string): Promise<boolean> {
  if (t.store) return (await fx()).acHasItem(t.store, (await import('../src/db/ddb/keys.ts')).emailCode(email));
  return (await t.q('SELECT 1 FROM email_codes WHERE email = $1', [email])).length > 0;
}

/** Makes every pending deletion due (the 15-day wait is over). */
export async function makeDeletionsDue(t: TestDb): Promise<void> {
  if (t.store) { await (await fx()).acDeletionsDue(t.store, new Date(Date.now() - 1000).toISOString()); return; }
  await t.q("UPDATE account_deletions SET due_at = now() - interval '1 second'");
}

/** How many deletion requests are stored. */
export async function deletionCount(t: TestDb): Promise<number> {
  if (t.store) return (await fx()).acCount(t.store, 'main', 'deletion');
  return (await t.q('SELECT 1 FROM account_deletions')).length;
}

/** Every session row of a listener (all of them when omitted). */
export async function sessionCount(t: TestDb, listenerId?: string): Promise<number> {
  if (t.store) return (await (await fx()).acSessions(t.store, listenerId)).length;
  return listenerId
    ? (await t.q('SELECT 1 FROM sessions WHERE listener_id = $1', [listenerId])).length
    : Number((await t.q<{ n: number }>('SELECT count(*)::int AS n FROM sessions'))[0]!.n);
}

type SessionField = 'rotated_at' | 'replaced_at' | 'created_at' | 'last_seen_at';
const camel: Record<SessionField, string> = { rotated_at: 'rotatedAt', replaced_at: 'replacedAt', created_at: 'createdAt', last_seen_at: 'lastSeenAt' };

/** Sets a time of every session (only the replaced ones with `replacedOnly`) to `ageMs` ago. */
export async function ageSessions(t: TestDb, field: SessionField, ageMs: number, opts: { replacedOnly?: boolean } = {}): Promise<void> {
  const iso = new Date(Date.now() - ageMs).toISOString();
  if (t.store) { await (await fx()).acSetSessionTime(t.store, camel[field], iso, opts.replacedOnly ?? false); return; }
  await t.q(`UPDATE sessions SET ${field} = $1${opts.replacedOnly ? ' WHERE replaced_at IS NOT NULL' : ''}`, [iso]);
}

/** A raw session (as an old sign-in left it): `lastSeenMsAgo`, act-as by `actingAdmin`. Returns the token. */
export async function rawSession(t: TestDb, listenerId: string, o: { lastSeenMsAgo?: number; actingAdmin?: string } = {}): Promise<string> {
  const token = issueToken();
  const hash = tokenHash(token, TEST_PEPPER);
  const seen = new Date(Date.now() - (o.lastSeenMsAgo ?? 0)).toISOString();
  if (t.store) { await (await fx()).acSessionItem(t.store, { hash, listenerId, lastSeenAt: seen, ...(o.actingAdmin ? { actingAdminId: o.actingAdmin } : {}) }); return token; }
  await t.q('INSERT INTO sessions (token_hash, listener_id, last_seen_at, acting_admin_id) VALUES ($1, $2, $3, $4)', [hash, listenerId, seen, o.actingAdmin ?? null]);
  return token;
}

/** The session's last-seen time in ms. */
export async function sessionLastSeen(t: TestDb, token: string): Promise<number> {
  const hash = tokenHash(token, TEST_PEPPER);
  if (t.store) { const s = await (await fx()).acSession(t.store, hash); return Date.parse(String(s?.['lastSeenAt'])); }
  return new Date((await t.q<{ s: Date }>('SELECT last_seen_at AS s FROM sessions WHERE token_hash = $1', [hash]))[0]!.s).getTime();
}

/** test/studio-harness.ts: a Studio session of this listener has (or has not) passed the second factor. */
export async function studioFactor(t: TestDb, listenerId: string, passed: boolean): Promise<void> {
  if (t.store) { await (await fx()).acStudioFactor(t.store, listenerId, passed ? new Date().toISOString() : null); return; }
  await t.q(`UPDATE sessions SET second_factor_at = ${passed ? 'now()' : 'NULL'} WHERE listener_id = $1 AND device_label = 'studio-web'`, [listenerId]);
}

/** Sets a rate-limit window's count (every window of the key when `windowStart` is omitted). */
export async function setRateCount(t: TestDb, key: string, n: number, windowStart?: Date): Promise<void> {
  if (t.store) { await (await fx()).acSetRate(t.store, key, n, windowStart?.toISOString()); return; }
  if (windowStart) await t.q('INSERT INTO rate_counters (key, window_start, count) VALUES ($1, $2, $3) ON CONFLICT (key, window_start) DO UPDATE SET count = EXCLUDED.count', [key, windowStart, n]);
  else await t.q('UPDATE rate_counters SET count = $2 WHERE key = $1', [key, n]);
}

/** Every stored feedback picture. */
export async function feedbackImageCount(t: TestDb): Promise<number> {
  if (t.store) return (await fx()).acCount(t.store, 'main', 'feedbackImage');
  return (await t.q('SELECT 1 FROM feedback_images')).length;
}

/** Feedback bodies starting with `prefix`. */
export async function feedbackBodies(t: TestDb, prefix: string): Promise<string[]> {
  if (t.store) return (await fx()).acFeedbackBodies(t.store, prefix);
  return (await t.q<{ body: string }>('SELECT body FROM feedback WHERE body LIKE $1', [`${prefix}%`])).map((r) => r.body);
}

/** Every feedback picture is `days` old. */
export async function ageFeedbackImages(t: TestDb, days: number): Promise<void> {
  const iso = new Date(Date.now() - days * 86_400_000).toISOString();
  if (t.store) { await (await fx()).acAgeFeedbackImages(t.store, iso); return; }
  await t.q('UPDATE feedback_images SET created_at = $1', [iso]);
}

/** The error-log rows of a scope (scope, message, platform, listener_id). */
export async function errorRows(t: TestDb, scope: string): Promise<{ scope: string; message: string; platform: string; listener_id: string | null }[]> {
  if (t.store) return (await fx()).acErrorRows(t.store, scope);
  return t.q<{ scope: string; message: string; platform: string; listener_id: string | null }>('SELECT scope, message, platform, listener_id FROM error_reports WHERE scope = $1', [scope]);
}

/** Every stored push token, sorted. */
export async function pushTokenList(t: TestDb): Promise<string[]> {
  if (t.store) return (await fx()).acPushTokens(t.store);
  return (await t.q<{ token: string }>('SELECT token FROM push_tokens ORDER BY token')).map((r) => r.token);
}

/** A digest already sent (`sentAt` in the past). */
export async function oldDigest(t: TestDb, listenerId: string, isoWeek: string, episodeIds: string[], sentAt: string): Promise<void> {
  if (t.store) { await (await fx()).acDigestItem(t.store, { listenerId, isoWeek, episodeIds, sentAt }); return; }
  await t.q('INSERT INTO weekly_digests (listener_id, iso_week, episode_ids, sent_at) VALUES ($1, $2, $3::text[], $4)', [listenerId, isoWeek, episodeIds, sentAt]);
}

export async function digestCount(t: TestDb): Promise<number> {
  if (t.store) return (await fx()).acCount(t.store, 'main', 'weeklyDigest');
  return (await t.q('SELECT 1 FROM weekly_digests')).length;
}

/** Whether the listener has a stored queue. */
export async function queueStored(t: TestDb, listenerId: string): Promise<boolean> {
  if (t.store) return (await fx()).acHasItem(t.store, (await import('../src/db/ddb/keys.ts')).listenerSingleton(listenerId, 'QUEUE'));
  return Number((await t.q<{ n: number }>('SELECT count(*)::int AS n FROM queues WHERE listener_id = $1', [listenerId]))[0]!.n) > 0;
}

/** Moves the pending email change's send time. */
export async function setEmailChangeSentAt(t: TestDb, iso: string): Promise<void> {
  if (t.store) { await (await fx()).acSetEmailChangeSent(t.store, iso); return; }
  await t.q('UPDATE email_changes SET sent_at = $1', [iso]);
}
