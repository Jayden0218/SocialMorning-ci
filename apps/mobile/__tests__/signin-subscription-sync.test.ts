// Tests that signing in pulls the account's subscriptions onto the phone.
/**
 * 035 T040 (device check B4). A listener whose account holds a subscription signed in on a fresh install and saw "No
 * subscriptions yet": the subscription sync ran at app start (signed out: it does nothing) and after a local subscribe, but
 * `SocialProvider`'s `onSignedIn` reconciled only positions and the library (src/social/context.tsx). Cause written in
 * gate-log.md. Two checks:
 *  1. the sync itself, with a fake API: server 1 show, phone 0 → after `reconcile` the phone has 1, and the PUT carried the
 *     phone's (empty) set while the server's answer filled the table (the server merges: T010);
 *  2. the wiring (a source check, as G-W1 in wired.test.ts: rendering SocialProvider needs the whole native surface):
 *     `onSignedIn` calls the subscription sync's `reconcile`.
 * The break that turns 2 red: delete the `subscriptionSync.reconcile()` call from `onSignedIn`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMemorySubscriptionStore } from '@/storage/memory';
import { createSubscriptionSync } from '@/sync/subscriptions';
import type { SubscriptionOut } from '@/social/api';

const SHOW = 'https://feeds.example.com/journey-morning.xml';

it('a fresh phone signed in to an account with one show ends with that show, and the PUT did not erase it', async () => {
  const server: SubscriptionOut[] = [{ feedUrl: SHOW, createdAt: '2026-11-01T09:00:00.000Z', starred: false }];
  const puts: SubscriptionOut[][] = [];
  let signedIn = false;
  const store = createMemorySubscriptionStore();
  const sync = createSubscriptionSync({
    api: {
      putSubscriptions: async (items: SubscriptionOut[]) => { puts.push(items); return { items: server, serverTime: 'now' }; },
    } as never,
    subscriptions: store,
    isSignedIn: () => signedIn,
  });
  await sync.reconcile(); // app start, signed out: nothing happens
  expect(puts).toHaveLength(0);
  expect(store.all()).toHaveLength(0);
  signedIn = true;
  await sync.reconcile(); // what onSignedIn must trigger
  expect(puts).toHaveLength(1);
  expect(store.all().map((r) => r.feedUrl)).toEqual([SHOW]);
});

it('onSignedIn in the social provider reconciles the subscriptions', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'social', 'context.tsx'), 'utf8');
  const at = src.indexOf('onSignedIn:');
  expect(at).toBeGreaterThan(0);
  const block = src.slice(at, src.indexOf('} }), [api, stores', at));
  expect(block).toMatch(/subscriptionSync\.reconcile\(\)/);
});

// 035 (device run 41359074906, r06): the show page read `subscriptions.has` once, at mount. After sign-in the sync fills the table a moment later, and the
// page kept saying "Subscribe". The sync now announces each completed reconcile (`onChange`), and the show page listens and re-reads. Breaks: drop the
// notify from `run`; drop the listener from app/show/[feedUrl].tsx.
it('the sync announces a completed reconcile to its listeners, and stops when they unsubscribe', async () => {
  const server: SubscriptionOut[] = [{ feedUrl: SHOW, createdAt: '2026-11-01T09:00:00.000Z', starred: false }];
  const store = createMemorySubscriptionStore();
  const sync = createSubscriptionSync({ api: { putSubscriptions: async () => ({ items: server, serverTime: 'now' }) } as never, subscriptions: store, isSignedIn: () => true });
  const seen: number[] = [];
  const off = sync.onChange(() => seen.push(store.all().length));
  await sync.reconcile();
  expect(seen).toEqual([1]); // told after the table was replaced
  off();
  await sync.reconcile();
  expect(seen).toEqual([1]);
});

it('the show page re-reads its subscribed state when the sync changes the table', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'show', '[feedUrl].tsx'), 'utf8');
  expect(src).toMatch(/subscriptionSync\.onChange\?\.\(/);
});

// 035 (device run 41385187706, r22): on the CI server the sign-in PUT took the client's whole 10 s and failed; nothing tried again, so the account's show never arrived.
// A failed reconcile retries in the background (bounded), so a slow server delays the table instead of leaving it empty. Break: drop `retry` handling in `reconcile`.
it('a failed reconcile is retried later, and the table fills when the retry lands', async () => {
  const server: SubscriptionOut[] = [{ feedUrl: SHOW, createdAt: '2026-11-01T09:00:00.000Z', starred: false }];
  let calls = 0;
  const timers: (() => void)[] = [];
  const store = createMemorySubscriptionStore();
  const sync = createSubscriptionSync({
    api: { putSubscriptions: async () => { calls++; if (calls === 1) throw new Error('timeout'); return { items: server, serverTime: 'now' }; } } as never,
    subscriptions: store,
    isSignedIn: () => true,
    retry: { afterMs: 5_000, times: 2, setTimeout: (fn: () => void) => { timers.push(fn); return 0; } },
  } as never);
  let told = 0;
  sync.onChange(() => told++);
  await sync.reconcile().catch(() => undefined); // the first try fails: the caller still sees the failure
  expect(store.all()).toHaveLength(0);
  expect(timers).toHaveLength(1);
  timers.shift()!();
  await new Promise((r) => setTimeout(r, 0));
  expect(store.all().map((r) => r.feedUrl)).toEqual([SHOW]);
  expect(told).toBe(1);
});

it('retries are bounded: after `times` failed retries it stops', async () => {
  const timers: (() => void)[] = [];
  const sync = createSubscriptionSync({
    api: { putSubscriptions: async () => { throw new Error('down'); } } as never,
    subscriptions: createMemorySubscriptionStore(),
    isSignedIn: () => true,
    retry: { afterMs: 1, times: 2, setTimeout: (fn: () => void) => { timers.push(fn); return 0; } },
  } as never);
  await sync.reconcile().catch(() => undefined);
  for (let i = 0; i < 5 && timers.length > 0; i++) { timers.shift()!(); await new Promise((r) => setTimeout(r, 0)); }
  expect(timers).toHaveLength(0);
});

// Verifier (035): every failed reconcile started its own retry chain, so overlapping failures stacked several. One chain at a time.
it('overlapping failures schedule one retry, not one each', async () => {
  const timers: (() => void)[] = [];
  const sync = createSubscriptionSync({
    api: { putSubscriptions: async () => { throw new Error('down'); } } as never,
    subscriptions: createMemorySubscriptionStore(),
    isSignedIn: () => true,
    retry: { afterMs: 1, times: 3, setTimeout: (fn: () => void) => { timers.push(fn); return 0; } },
  } as never);
  await Promise.all([sync.reconcile().catch(() => undefined), sync.reconcile().catch(() => undefined), sync.reconcile().catch(() => undefined)]);
  expect(timers).toHaveLength(1);
});
