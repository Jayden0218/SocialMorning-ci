/** T028: the stats block — private → the one line; own → "Your listening is private."; numbers formatted as episode time. */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { hms, StatsBlock } from '../src/ui/StatsBlock';

const w = (listenedMs: number) => ({ listenedMs, finished: 2, topShows: [{ feedUrl: 'https://f/a.xml', showTitle: 'Reply All', listenedMs }] });
const textOf = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());

it('hms formats episode time', () => {
  expect(hms(600_000)).toBe('10 min 00 s');
  expect(hms(3_725_000)).toBe('1 h 02 min');
  expect(hms(0)).toBe('0 min 00 s');
});

it('renders both windows with top shows; null stats say private', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(StatsBlock, { stats: { last7: w(600_000), all: w(3_725_000) }, own: false })); });
  const t = textOf(r);
  expect(t).toContain('Last 7 days');
  expect(t).toContain('All time');
  expect(t.split('Reply All').length - 1).toBe(2);
  expect(t).toContain('10 min 00 s');
  expect(t).toContain('1 h 02 min');
  act(() => { r = create(createElement(StatsBlock, { stats: null, own: false })); });
  expect(textOf(r)).toContain('Listening is private.');
  act(() => { r = create(createElement(StatsBlock, { stats: null, own: true })); });
  expect(textOf(r)).toContain('Your listening is private.');
});
