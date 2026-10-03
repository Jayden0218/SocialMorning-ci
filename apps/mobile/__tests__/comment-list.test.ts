import { relativeTime } from '../src/ui/format';

it('relative time is computed from the server clock, never the phone', () => {
  const server = '2026-09-21T06:30:00Z';
  expect(relativeTime('2026-09-21T06:29:50Z', server)).toBe('just now');
  expect(relativeTime('2026-09-21T06:27:00Z', server)).toBe('3 min ago');
  expect(relativeTime('2026-09-21T04:30:00Z', server)).toBe('2 h ago');
  expect(relativeTime('2026-09-19T06:30:00Z', server)).toBe('2 d ago');
  expect(relativeTime('2026-09-21T06:31:00Z', server)).toBe('just now'); // clock skew never goes negative
});
