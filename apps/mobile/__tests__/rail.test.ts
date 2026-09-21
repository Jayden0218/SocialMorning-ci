import { railMarkers } from '../src/ui/Rail';
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
