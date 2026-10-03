/**
 * M12 guard G-ST3 (FR-081): My subscriptions — starred shows sit in their own section, the
 * search filters both, and each sort orders as named. The break: return every row in `rest`.
 */
import { arrangeSubscriptions, type SubRow } from '@/me/subscriptions';

const rows: SubRow[] = [
  { feedUrl: 'a', title: 'banana talk', subscribedAt: 3, starred: false, latestAt: 10 },
  { feedUrl: 'b', title: 'Apple Hour', subscribedAt: 1, starred: true, latestAt: 30 },
  { feedUrl: 'c', title: 'Cherry', subscribedAt: 2, starred: false },
  { feedUrl: 'd', title: 'date night', subscribedAt: 4, starred: false, latestAt: 20 },
];
const urls = (r: SubRow[]) => r.map((x) => x.feedUrl);

it('starred shows are their own section; the rest sort as named', () => {
  const u = arrangeSubscriptions(rows, '', 'updated');
  expect(urls(u.starred)).toEqual(['b']);
  expect(urls(u.rest)).toEqual(['d', 'a', 'c']);
  expect(urls(arrangeSubscriptions(rows, '', 'az').rest)).toEqual(['a', 'c', 'd']);
  expect(urls(arrangeSubscriptions(rows, '', 'added').rest)).toEqual(['d', 'a', 'c']);
});

it('the search filters both sections', () => {
  const r = arrangeSubscriptions(rows, 'apple', 'az');
  expect(urls(r.starred)).toEqual(['b']);
  expect(r.rest).toEqual([]);
  expect(urls(arrangeSubscriptions(rows, 'NIGHT', 'az').rest)).toEqual(['d']);
});
