import { shareClip, shareText } from '../src/graph/share';
import type { Clip } from '../src/social/api';

const clip: Clip = { id: '0f1e2d3c-4b5a-4697-8877-665544332211', author: { id: 'a', displayName: 'Alex' }, episodeId: 'e', startMs: 872_000, endMs: 910_000, caption: 'the good bit', createdAt: 'now', deleted: false };

it('the share text carries the caption, the episode, the range and the https link', () => {
  expect(shareText(clip, 'Casey Wants to Believe', 'https://socialmorning-api.vercel.app')).toBe('the good bit — Casey Wants to Believe (14:32–15:10) https://socialmorning-api.vercel.app/c/0f1e2d3c-4b5a-4697-8877-665544332211');
  expect(shareText({ ...clip, caption: '' }, 'Ep', 'https://x/')).toBe('Ep (14:32–15:10) https://x/c/0f1e2d3c-4b5a-4697-8877-665544332211');
});

it('a dismissed share sheet is not an error', async () => {
  const calls: unknown[] = [];
  await shareClip({ share: async (c) => { calls.push(c); throw new Error('dismissed'); } }, clip, 'Ep', 'https://x');
  expect(calls).toEqual([{ message: 'the good bit — Ep (14:32–15:10) https://x/c/0f1e2d3c-4b5a-4697-8877-665544332211', title: 'Ep' }]);
});
