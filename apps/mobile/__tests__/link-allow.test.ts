// B7: which socialmorning:// links from publisher content may open an in-app screen.
import { linkAllow } from '@/outside/link-allow';

const SHOW = 'socialmorning://show/https%3A%2F%2Ff.example%2Fx.xml';

it.each([
  [SHOW, '/show/https%3A%2F%2Ff.example%2Fx.xml'],
  ['socialmorning://episode/abc123', '/episode/abc123'],
  ['socialmorning://episode/abc?t=90', '/episode/abc?t=90'],
  ['SOCIALMORNING://Episode/abc'.replace('Episode', 'episode'), '/episode/abc'],
  ['  socialmorning://category/1303  ', '/category/1303'],
  ['socialmorning://search', '/search'],
  ['socialmorning://profile/u1', '/profile/u1'],
  ['socialmorning:///episode/abc', '/episode/abc'],
  ['socialmorning://episode/abc#frag', '/episode/abc'],
])('allows %s', (raw, path) => {
  expect(linkAllow(raw)).toEqual({ kind: 'app', path });
});

it.each([
  'socialmorning://gift/x',
  'socialmorning://gift',
  'socialmorning://redeem',
  'socialmorning://redeem/CODE',
  'socialmorning://purchase/plus',
  'socialmorning://settings/account',
  'socialmorning://settings/delete-account',
  'socialmorning://wallet',
  'socialmorning://tips',
  'socialmorning://unknown/page',
  'socialmorning://',
  'socialmorning://show',
  // odd forms a naive implementation lets through
  'socialmorning:////gift/x',
  'socialmorning:///gift/x',
  'socialmorning://%2e%2e/redeem',
  'socialmorning://%2E%2E/redeem',
  'socialmorning://episode/../redeem',
  'socialmorning://episode/%2e%2e/%2e%2e/gift/x',
  'socialmorning://./redeem',
  'socialmorning://episode/abc/../../gift/x',
  'socialmorning://episode\\..\\redeem',
  'socialmorning://%67ift/x',
  'socialmorning://redeem?next=/episode/a',
  'socialmorning://episode/%zz',
])('denies %s', (raw) => {
  expect(linkAllow(raw)).toEqual({ kind: 'denied' });
});

it('does not decide about other schemes', () => {
  expect(linkAllow('https://example.com/gift/x')).toEqual({ kind: 'external' });
  expect(linkAllow('mailto:a@b.c')).toEqual({ kind: 'external' });
  expect(linkAllow('notsocialmorning://gift/x')).toEqual({ kind: 'external' });
});
