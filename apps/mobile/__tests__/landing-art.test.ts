/** The sign-in landing page's covers (owner, 2026-09-27): real covers, own shows first, no repeats. */
import { landingArt } from '@/ui/auth/art';
import type { Discover } from '@/social/api';

const ep = (imageUrl?: string) => ({ kind: 'pick' as const, key: imageUrl ?? 'x', episode: { id: 'e', feedUrl: 'f', guid: 'g', title: 't', showTitle: 's', enclosureUrl: 'u', ...(imageUrl ? { imageUrl } : {}) } });
const discover = (urls: (string | undefined)[]): Discover => ({ picks: urls.map(ep), talkedAbout: [], trending: [], stale: false, serverTime: '' });

it('puts the listener\'s own shows first, then Discover, and drops repeats and gaps', () => {
  expect(landingArt({ subscribed: ['a', undefined, 'b'], discover: discover(['b', 'c', undefined]) })).toEqual(['a', 'b', 'c']);
});

it('stops at the limit', () => {
  expect(landingArt({ subscribed: ['1', '2', '3', '4', '5', '6', '7', '8'] })).toHaveLength(7);
});

it('invents nothing: with no shows and no Discover cache the wall is empty', () => {
  expect(landingArt({ subscribed: [] })).toEqual([]);
});
