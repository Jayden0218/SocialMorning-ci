/**
 * M8 US6 (quickstart A23) — the outbox.
 *
 * The rule under test is M2's, applied to a recommendation row: **a tap never waits on
 * the network.** Opening something from For You has to feel exactly like opening anything
 * else, whatever the connection is doing.
 *
 * The second rule is subtler. An impression is counted once per list, not once per
 * scroll — `fatigue` counts impressions, and counting finger movements would drop items
 * the listener never had a chance to see.
 */
import { createRecOutbox } from '../src/recs/outbox';
import { createMemoryRecOutboxStore } from '../src/storage/memory';

const items = [
  { episodeId: 'e0', channel: 'pick' as const },
  { episodeId: 'e1', channel: 'showcf' as const },
  { episodeId: 'e2', channel: 'social' as const },
];

it('A23: three taps with the network down queue three rows and no tap blocks', async () => {
  const store = createMemoryRecOutboxStore();
  const postRecEvents = jest.fn(async () => { throw new Error('offline'); });
  const outbox = createRecOutbox({ api: { postRecEvents } as never, store, settings: { get: () => undefined, set: () => undefined }, isSignedIn: () => true });

  const before = Date.now();
  outbox.opened({ episodeId: 'e0', channel: 'pick', rank: 0 }, 1);
  outbox.opened({ episodeId: 'e1', channel: 'showcf', rank: 1 }, 2);
  outbox.opened({ episodeId: 'e2', channel: 'social', rank: 2 }, 3);
  expect(Date.now() - before).toBeLessThan(50); // nothing awaited anything

  expect(store.count()).toBe(3);
  await expect(outbox.flush()).resolves.toBe(0);
  expect(store.count()).toBe(3); // the rows stay for the next attempt
});

it('A23: the rows flush when the connection comes back, and are then gone', async () => {
  const store = createMemoryRecOutboxStore();
  const sent: unknown[] = [];
  const postRecEvents = jest.fn(async (events: unknown[]) => { sent.push(...events); });
  const outbox = createRecOutbox({ api: { postRecEvents } as never, store, settings: { get: () => undefined, set: () => undefined }, isSignedIn: () => true });

  outbox.impressions(items, 1000);
  outbox.opened({ episodeId: 'e1', channel: 'showcf', rank: 1 }, 1001);

  expect(await outbox.flush()).toBe(4);
  expect(store.count()).toBe(0);
  expect(sent).toHaveLength(4);
  expect(sent[0]).toMatchObject({ episodeId: 'e0', channel: 'pick', rank: 0, kind: 'impression', at: new Date(1000).toISOString() });
  expect(sent[3]).toMatchObject({ episodeId: 'e1', kind: 'open', rank: 1 });
});

it('an impression is counted once per list, not once per scroll', () => {
  const store = createMemoryRecOutboxStore();
  const outbox = createRecOutbox({ api: { postRecEvents: jest.fn() } as never, store, settings: { get: () => undefined, set: () => undefined }, isSignedIn: () => true });

  outbox.impressions(items, 1000);
  outbox.impressions(items, 1001);
  outbox.impressions(items, 1002);
  expect(store.count()).toBe(3);

  // The same episode at a different position IS a new impression — it is a different row
  // of a different list.
  outbox.impressions([items[1]!, items[0]!], 1003);
  expect(store.count()).toBe(5);
});

it('signed out, nothing is sent — and sign-out clears what was queued', async () => {
  const store = createMemoryRecOutboxStore();
  const postRecEvents = jest.fn();
  const outbox = createRecOutbox({ api: { postRecEvents } as never, store, settings: { get: () => undefined, set: () => undefined }, isSignedIn: () => false });

  outbox.impressions(items, 1000);
  expect(await outbox.flush()).toBe(0);
  expect(postRecEvents).not.toHaveBeenCalled();

  outbox.clear();
  expect(store.count()).toBe(0);
});

it('an empty flush costs nothing', async () => {
  const store = createMemoryRecOutboxStore();
  const postRecEvents = jest.fn();
  const outbox = createRecOutbox({ api: { postRecEvents } as never, store, settings: { get: () => undefined, set: () => undefined }, isSignedIn: () => true });
  expect(await outbox.flush()).toBe(0);
  expect(postRecEvents).not.toHaveBeenCalled();
});

/**
 * FR-028's other half, found by L7 on 2026-09-26: `played` existed and nothing called it,
 * so the per-channel table showed opens for ever and plays never.
 *
 * The join is awkward on purpose — the player knows the episode, the list knows the
 * channel — so the map of what was last shown is persisted rather than held in memory:
 * the play can happen on another screen, or after a relaunch.
 */
describe('attributing a play to the channel that surfaced it', () => {
  const memorySettings = () => {
    const m = new Map<string, string>();
    return { get: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v) };
  };

  it('a play and a finish are recorded against the right channel and rank', async () => {
    const store = createMemoryRecOutboxStore();
    const settings = memorySettings();
    const sent: Record<string, unknown>[] = [];
    const outbox = createRecOutbox({
      api: { postRecEvents: jest.fn(async (e: Record<string, unknown>[]) => { sent.push(...e); }) } as never,
      store, settings, isSignedIn: () => true,
    });

    outbox.impressions(items, 1000);
    await outbox.flush();

    outbox.playedIfShown('e2', 2000);
    outbox.finishedIfShown('e2', 3000);
    await outbox.flush();

    const play = sent.find((e) => e['kind'] === 'play');
    const finish = sent.find((e) => e['kind'] === 'finish');
    expect(play).toMatchObject({ episodeId: 'e2', channel: 'social', rank: 2 });
    expect(finish).toMatchObject({ episodeId: 'e2', channel: 'social', rank: 2 });
  });

  it('an episode For You never showed is not attributed to it', async () => {
    const store = createMemoryRecOutboxStore();
    const settings = memorySettings();
    const outbox = createRecOutbox({ api: { postRecEvents: jest.fn() } as never, store, settings, isSignedIn: () => true });

    outbox.impressions(items, 1000);
    outbox.playedIfShown('something-else', 2000);
    expect(store.take(50).filter((r) => r.kind === 'play')).toHaveLength(0);
  });

  it('a finish is counted once per surfacing, so a replay does not count again', () => {
    const store = createMemoryRecOutboxStore();
    const settings = memorySettings();
    const outbox = createRecOutbox({ api: { postRecEvents: jest.fn() } as never, store, settings, isSignedIn: () => true });

    outbox.impressions(items, 1000);
    outbox.finishedIfShown('e0', 2000);
    outbox.finishedIfShown('e0', 3000);
    expect(store.take(50).filter((r) => r.kind === 'finish')).toHaveLength(1);
  });
});
