// Emailed sign-in codes and fixed-window rate counters on DynamoDB, with conditional counters instead of row locks.
/**
 * M26 lane AC (AC-T03; patterns AC-34…AC-40). `ECODE#<email>/C` holds the hashed code; an attempt is
 * reserved by a conditional ADD (attempts < 5 AND not expired), so 50 parallel guesses compare at most 5
 * (guard G-M23-2 keeps its meaning). Rate counters are `RATE#<key>/<windowStart>` in sm-events with an
 * ADD that returns the new count; TTL removes old windows (research R5: the count of a window is read
 * by its key, never by "old rows still there"), so the sweep has nothing left to delete.
 */
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { del, get, put, update } from '../../../ddb/store.ts';
import type { EmailCodeRow } from '../sign-in-codes.ts';
import { DAY_MS, unlessCondition, upd, aput, adel, type Hybrid } from './common.ts';

export async function codeSentAtRows(h: Hybrid, email: string): Promise<EmailCodeRow[]> {
  const it = await get(h.store, 'main', K.emailCode(email));
  if (!it) return [];
  return [{ code_hash: it['codeHash'] as Uint8Array, sent_at: String(it['sentAt']), expires_at: String(it['expiresAt']), attempts: Number(it['attempts'] ?? 0) }];
}

export async function upsertEmailCode(h: Hybrid, email: string, codeHash: Buffer, sentAt: Date, expiresAt: Date): Promise<void> {
  await aput(h.store, 'main', encode('emailCode', K.emailCode(email), {
    email, codeHash: new Uint8Array(codeHash), sentAt: sentAt.toISOString(), expiresAt: expiresAt.toISOString(), attempts: 0,
  }, { ttl: ttlAfter(expiresAt.getTime(), DAY_MS) }));
}

export async function reserveCodeAttempt(h: Hybrid, email: string, maxAttempts: number, now: Date): Promise<EmailCodeRow[]> {
  const out = await unlessCondition(upd(h.store, 'main', K.emailCode(email), {
    update: 'ADD attempts :one',
    condition: 'attribute_exists(PK) AND attempts < :max AND expiresAt > :now',
    values: { ':one': 1, ':max': maxAttempts, ':now': now.toISOString() },
    returnValues: 'ALL_NEW',
  }));
  if (!out) return [];
  return [{ code_hash: out['codeHash'] as Uint8Array, sent_at: String(out['sentAt']), expires_at: String(out['expiresAt']), attempts: Number(out['attempts']) }];
}

export async function returnCodeAttempt(h: Hybrid, email: string): Promise<void> {
  await unlessCondition(upd(h.store, 'main', K.emailCode(email), {
    update: 'ADD attempts :minus', condition: 'attribute_exists(PK) AND attempts > :z', values: { ':minus': -1, ':z': 0 },
  }));
}

export async function deleteEmailCode(h: Hybrid, email: string): Promise<void> {
  await adel(h.store, 'main', K.emailCode(email));
}

/** One ADD on the window's item; DynamoDB returns the count after it, so parallel hits are all counted. */
export async function bumpRateCounter(h: Hybrid, key: string, windowStart: Date): Promise<{ count: number }[]> {
  const out = await upd(h.store, 'events', K.ev.rate(key, windowStart.toISOString()), {
    update: 'ADD #c :one SET #t = :t, windowStart = :w, #ttl = :ttl',
    names: { '#c': 'count', '#t': 't', '#ttl': 'ttl' },
    // The longest window is a day; the old sweep kept two days. TTL is that backstop.
    values: { ':one': 1, ':t': 'rate', ':w': windowStart.toISOString(), ':ttl': ttlAfter(windowStart.getTime(), 3 * DAY_MS) },
    returnValues: 'UPDATED_NEW',
  });
  return [{ count: Number(out?.['count'] ?? 1) }];
}

/** TTL removes old windows (above); nothing is left for the sweep to delete. */
export async function deleteRateCountersBefore(_h: Hybrid, _before: Date): Promise<{ key: string }[]> {
  return [];
}
