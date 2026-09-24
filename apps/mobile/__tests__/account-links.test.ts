/** M6 FR-027: the pages Account must reach, and the appeals address the server owns. */
import { appealsMailto, APPEALS_KEY, legalLinks, refreshAppeals } from '../src/social/links';
import { createMemoryStores } from '../src/storage/memory';
import { ApiError, type ApiClient } from '../src/social/api';

it('the legal links point at the deployed API, not a build-time constant', () => {
  const l = legalLinks();
  expect(l.privacy).toMatch(/^https?:\/\/.+\/privacy$/);
  expect(l.rules).toMatch(/\/rules$/);
  expect(l.get).toMatch(/\/get$/);
});

it('refreshAppeals stores what the server says; offline it keeps the mirror; with neither there is no mailto', async () => {
  const stores = createMemoryStores((x) => x);
  const ok = { meta: async () => ({ appealsEmail: 'help@example.test' }) } as unknown as ApiClient;
  expect(await refreshAppeals(ok, stores)).toBe('help@example.test');
  expect(stores.settings.get(APPEALS_KEY)).toBe('help@example.test');
  const down = { meta: async () => { throw new ApiError('network', 'no', 0); } } as unknown as ApiClient;
  expect(await refreshAppeals(down, stores)).toBe('help@example.test');
  const empty = createMemoryStores((x) => x);
  expect(await refreshAppeals(down, empty)).toBeUndefined();
  const bare = { meta: async () => ({}) } as unknown as ApiClient;
  expect(await refreshAppeals(bare, empty)).toBeUndefined();
});

it('appealsMailto carries a subject, and is undefined when there is no address', () => {
  expect(appealsMailto('help@example.test')).toBe('mailto:help@example.test?subject=SocialMorning%20%E2%80%94%20report%20a%20problem');
  expect(appealsMailto(undefined)).toBeUndefined();
  expect(appealsMailto('')).toBeUndefined();
});
