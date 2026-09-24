import { markerLabel, railMarkers } from '../src/ui/Rail';
import type { Comment } from '../src/social/api';

const c = (id: string, offsetMs: number | null, extra: Partial<Comment> = {}): Comment =>
  ({ id, authorId: 'a', displayName: 'A', body: id, offsetMs, parentId: null, createdAt: 'now', deleted: false, ...extra });

it('one marker per whole second; same-second comments share it; moment-less, deleted and reply moments handled', () => {
  const markers = railMarkers([
    c('x', 872_100),
    c('y', 872_900),
    c('z', 10_000, { replies: [c('r', 20_000, { parentId: 'z' })] }),
    c('plain', null),
    c('gone', 5_000, { deleted: true }),
  ]);
  expect(markers.map((m) => [m.second, m.comments.map((k) => k.id)])).toEqual([
    [10, ['z']],
    [20, ['r']],
    [872, ['x', 'y']],
  ]);
  expect(markers[2]!.offsetMs).toBe(872_000);
});

it('FR-023: a marker announces the moment as m:ss and who wrote it (found on the phone: it said "1800 seconds")', () => {
  const c = (id: string, offsetMs: number, displayName: string | null) =>
    ({ id, authorId: 'a', displayName, body: 'x', offsetMs, parentId: null, createdAt: '', deleted: false });
  expect(markerLabel({ second: 872, offsetMs: 872_000, comments: [c('1', 872_000, 'Bea')] })).toBe('Comment at 14:32 by Bea');
  expect(markerLabel({ second: 872, offsetMs: 872_000, comments: [c('1', 872_000, 'Bea'), c('2', 872_400, 'Al')] })).toBe('2 comments at 14:32 by Bea and 1 other');
  expect(markerLabel({ second: 872, offsetMs: 872_000, comments: [c('1', 872_000, 'Bea'), c('2', 872_400, 'Al'), c('3', 872_900, 'Cee')] })).toBe('3 comments at 14:32 by Bea and 2 others');
  expect(markerLabel({ second: 5, offsetMs: 5_000, comments: [c('1', 5_000, null)] })).toBe('Comment at 0:05');
});
