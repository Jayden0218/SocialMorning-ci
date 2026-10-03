/**
 * Owner, 2026-10-01 (the 小宇宙 comments page): under each name, "time · place"; under a
 * parent, the first 2 replies and "Show N more".
 */
import { moreRepliesLabel, placeOf, REPLY_PREVIEW, timeAndPlace } from '@/ui/CommentRow';
import type { Comment } from '@/social/api';

const base: Comment = { id: 'c1', authorId: 'a', displayName: 'Ana', body: 'hi', offsetMs: null, parentId: null, createdAt: '2026-10-01T00:00:00Z', deleted: false };

it('the place is the country the server sends, as a name; nothing when it sends none', () => {
  expect(placeOf(base)).toBeUndefined();
  expect(placeOf({ ...base, country: null } as Comment)).toBeUndefined();
  expect(placeOf({ ...base, country: 'not a code' } as Comment)).toBeUndefined();
  const my = placeOf({ ...base, country: 'my' } as Comment);
  expect(my === 'Malaysia' || my === 'MY').toBe(true);
});

it('"time · place", or the time alone', () => {
  expect(timeAndPlace('2026-10-01T00:00:00Z', '2026-10-01T00:05:00Z', 'Malaysia')).toBe('5 min ago · Malaysia');
  expect(timeAndPlace('2026-10-01T00:00:00Z', '2026-10-01T00:05:00Z', undefined)).toBe('5 min ago');
});

it('two replies show; the rest fold behind "Show N more"', () => {
  expect(REPLY_PREVIEW).toBe(2);
  expect(moreRepliesLabel(0, false)).toBeUndefined();
  expect(moreRepliesLabel(2, false)).toBeUndefined();
  expect(moreRepliesLabel(3, false)).toBe('Show 1 more');
  expect(moreRepliesLabel(7, false)).toBe('Show 5 more');
  expect(moreRepliesLabel(7, true)).toBe('Show fewer replies');
});
