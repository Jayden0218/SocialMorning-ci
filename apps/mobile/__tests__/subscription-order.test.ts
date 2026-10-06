// Tests my own subscription order: the Default sort, moving a cover, and the unsent mark.
/**
 * M21 US8 (FR-072). The "Default" sort follows my order, then newest subscription first; a tap
 * on one cover then another moves the first into the second's place; an order saved offline is
 * pushed on the next sync and never replaced by the server's older copy.
 */
import { arrangeSubscriptions, moveTo, type SubRow } from '@/me/subscriptions';
import { ORDER_DIRTY_KEY, readOrder, saveOrder, syncOrder } from '@/me/subscription-order';

const rows: SubRow[] = [
  { feedUrl: 'a', title: 'A', subscribedAt: 3, starred: false },
  { feedUrl: 'b', title: 'B', subscribedAt: 1, starred: false },
  { feedUrl: 'c', title: 'C', subscribedAt: 2, starred: false },
  { feedUrl: 'd', title: 'D', subscribedAt: 4, starred: false },
];
const urls = (r: SubRow[]) => r.map((x) => x.feedUrl);

function settings() {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k), set: (k: string, v: string) => { m.set(k, v); } };
}

it('Default: my order first, the rest newest subscription first', () => {
  expect(urls(arrangeSubscriptions(rows, '', 'default', ['c', 'b']).rest)).toEqual(['c', 'b', 'd', 'a']);
  expect(urls(arrangeSubscriptions(rows, '', 'default').rest)).toEqual(['d', 'a', 'c', 'b']);
});

it('moveTo puts the first tapped cover in the second one\'s place', () => {
  expect(moveTo(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
  expect(moveTo(['a', 'b', 'c', 'd'], 'd', 'a')).toEqual(['d', 'a', 'b', 'c']);
  expect(moveTo(['a', 'b'], 'a', 'zz')).toEqual(['a', 'b']);
});

it('an order saved offline is sent on the next sync, not overwritten', async () => {
  const s = settings();
  const sent: string[][] = [];
  const down = { subscriptionOrder: jest.fn(async () => ['x']), setSubscriptionOrder: jest.fn(async () => { throw new Error('offline'); }) };
  await saveOrder(s, down, ['b', 'a'], true);
  expect(s.get(ORDER_DIRTY_KEY)).toBe('1');
  const up = { subscriptionOrder: jest.fn(async () => ['x']), setSubscriptionOrder: jest.fn(async (o: readonly string[]) => { sent.push([...o]); }) };
  expect(await syncOrder(s, up)).toEqual(['b', 'a']);
  expect(sent).toEqual([['b', 'a']]);
  expect(up.subscriptionOrder).not.toHaveBeenCalled();
  expect(await syncOrder(s, up)).toEqual(['x']);
  expect(readOrder({ get: () => 'not json' })).toEqual([]);
});
