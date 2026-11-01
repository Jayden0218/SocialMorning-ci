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
