/**
 * FR-004: with no account, everything from M1 behaves as before, and the social
 * layer reads but refuses to write — without ever calling the server for a write.
 */
import { createComposer } from '../src/social/composer';
import { createDrafts } from '../src/social/drafts';
import { createSocialCache } from '../src/social/cache';
import { createAuth, type TokenStore } from '../src/social/auth-store';
import { createReactToggle } from '../src/social/react';
import type { ApiClient } from '../src/social/api';
import { createMemoryStores } from '../src/storage/memory';
import { hash } from '../src/feeds/hash';

it('signed out: M1 stores work, composer returns needsSignIn, deleteAccount keeps positions', async () => {
  const stores = createMemoryStores(hash);
  const calls: string[] = [];
  const api = new Proxy({}, { get: (_t, name) => async () => { calls.push(String(name)); return { token: 'T', listener: { id: 'L', email: 'a@x', displayName: 'A', createdAt: 'now' } }; } }) as ApiClient;
  const token: TokenStore & { value?: string } = { get: async () => token.value, set: async (v) => { token.value = v; }, clear: async () => { token.value = undefined; } };

  // M1 flows, no account: subscribe, save a position, unsubscribe — position stays.
  stores.subscriptions.add('https://f/x.xml', 1);
  stores.positions.save({ episodeId: 'e', offsetMs: 872_000, finished: false }, 2);
  stores.subscriptions.remove('https://f/x.xml');
  expect(stores.positions.get('e')?.offsetMs).toBe(872_000);

  const composer = createComposer({ api, drafts: createDrafts(stores.drafts, () => 1), cache: createSocialCache(stores.socialCache), isSignedIn: () => stores.auth.get() !== undefined, now: () => 1, registration: () => undefined });
  const s = composer.edit(composer.open({ episodeId: 'e', offsetMs: 1000 }), 'hello');
  expect(await composer.submit(s)).toEqual({ kind: 'needsSignIn' });
  expect(calls).toEqual([]);

  const toggle = createReactToggle({ api, cache: createSocialCache(stores.socialCache), now: () => 1, registration: () => undefined });
  expect(toggle.isReacted(undefined, 1000, 100_000)).toBe(false);

  // Sign in, then delete: auth + drafts gone, positions kept on the phone.
  const auth = createAuth({ api, stores, token, now: () => 3 });
  await auth.signIn('a@x', 'pw');
  expect(stores.auth.get()?.listenerId).toBe('L');
  await auth.deleteAccount('pw');
  expect(calls).toContain('deleteMe');
  expect(stores.auth.get()).toBeUndefined();
  expect(token.value).toBeUndefined();
  expect(stores.drafts.get('e')).toBeUndefined();
  expect(stores.positions.get('e')?.offsetMs).toBe(872_000);
});
