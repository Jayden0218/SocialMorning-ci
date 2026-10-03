import { createReactToggle } from '../src/social/react';
import { createSocialCache } from '../src/social/cache';
import { createMemorySocialCacheStore } from '../src/storage/memory';
import { ApiError, type ApiClient, type Social } from '../src/social/api';

const D = 2_899_000;
const social = (my: number[]): Social => ({ serverTime: 's', episode: { id: 'e', durationMs: D }, comments: [], heat: { available: true, buckets: new Array(100).fill(0) }, myReactionBuckets: my });

function build(over: Partial<ApiClient> = {}) {
  const api = {
    registerEpisode: async () => {},
    react: async (_e: string, offsetMs: number) => ({ reacted: true, bucket: Math.floor((offsetMs * 100) / D) }),
    social: async () => ({ status: 200 as const, body: social([30]) }),
    ...over,
  } as unknown as ApiClient;
  return createReactToggle({ api, cache: createSocialCache(createMemorySocialCacheStore()), now: () => 1, registration: () => ({ feedUrl: 'f', guid: 'g', title: 't', enclosureUrl: 'u' }) });
}

it('isReacted reads the current segment; toggle flips optimistically and settles to the server list', async () => {
  const t = build();
  expect(t.isReacted([30], 872_000, D)).toBe(true);
  expect(t.isReacted([30], 10_000, D)).toBe(false);
  expect(t.isReacted([30], 872_000, undefined)).toBe(false);
  const r = t.toggle('e', [], 872_000, D);
  expect(r.optimistic).toEqual([30]);
  expect(await r.settled).toEqual({ myBuckets: [30] });
  const off = t.toggle('e', [30], 873_000, D);
  expect(off.optimistic).toEqual([]);
});

it('a failed toggle rolls back to the previous list and reports the error', async () => {
  const t = build({ react: async () => { throw new ApiError('network', 'down', 0); } });
  const r = t.toggle('e', [3], 872_000, D);
  expect(r.optimistic).toEqual([3, 30]);
  const settled = await r.settled;
  expect(settled.myBuckets).toEqual([3]);
  expect((settled.error as ApiError).code).toBe('network');
});

it('with no known duration nothing is sent', async () => {
  let called = 0;
  const t = build({ react: async () => { called++; return { reacted: true, bucket: 0 }; } });
  const r = t.toggle('e', [], 1000, undefined);
  await r.settled;
  expect(called).toBe(0);
});
