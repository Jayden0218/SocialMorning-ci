// M22 US1: a tapped push opens its in-app path; older pushes open their episode; anything else nothing.
import { routeForPush } from '@/notify/route';

test('href wins and must be one of our paths', () => {
  expect(routeForPush({ href: '/comments/thread/abc', episodeId: 'e1' })).toBe('/comments/thread/abc');
  expect(routeForPush({ href: '/profile/u1' })).toBe('/profile/u1');
  expect(routeForPush({ href: '/like/o1/e1' })).toBe('/like/o1/e1');
  expect(routeForPush({ href: 'https://evil.example/x' })).toBeNull();
  expect(routeForPush({ href: '/settings/account' })).toBeNull();
});

test('older pushes carry only an episode id', () => {
  expect(routeForPush({ episodeId: 'e 1' })).toBe('/episode/e%201');
  expect(routeForPush({ episodeId: '' })).toBeNull();
  expect(routeForPush(null)).toBeNull();
  expect(routeForPush('x')).toBeNull();
});
