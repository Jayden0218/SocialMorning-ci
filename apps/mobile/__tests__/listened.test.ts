/** quickstart A11: TICKs → listened rows; a seek closes the interval; pushed once as the whole set; offline rows stay dirty. */
import { createListened } from '../src/graph/listened';
import { ApiError, type ApiClient, type ListenedDay } from '../src/social/api';
import { createMemoryListenedStore } from '../src/storage/memory';

function build(opts: { online?: boolean; signedIn?: boolean; device?: string } = {}) {
  let online = opts.online ?? true;
  const puts: { deviceId: string; days: ListenedDay[] }[] = [];
  const api = {
    putListened: async (deviceId: string, days: ListenedDay[]) => {
      if (!online) throw new ApiError('network', 'no', 0);
      puts.push({ deviceId, days });
      return { accepted: days.length };
    },
  } as unknown as ApiClient;
  const store = createMemoryListenedStore();
  let clock = Date.UTC(2026, 8, 21, 10, 0, 0);
  const listened = createListened({ api, store, deviceId: () => opts.device ?? 'p1', isSignedIn: () => opts.signedIn ?? true, now: () => clock, today: (ms) => new Date(ms).toISOString().slice(0, 10) });
  return { listened, store, puts, setOnline: (v: boolean) => { online = v; }, advance: (ms: number) => { clock += ms; } };
}

it('A11: ticks every second extend one interval; a seek (jump) starts another; push sends the merged set once', async () => {
  const t = build();
  for (let p = 0; p <= 10_000; p += 1000) t.listened.onTick('e', p);
  t.listened.onTick('e', 60_000); // a seek forward: 10 s → 60 s is a gap
  t.listened.onTick('e', 61_000);
  expect(t.store.dirty()).toEqual([]); // nothing closed yet
  expect(await t.listened.push()).toBe(1);
  expect(t.puts).toEqual([{ deviceId: 'p1', days: [{ episodeId: 'e', day: '2026-09-21', ranges: [[0, 10_000], [60_000, 61_000]] }] }]);
  expect(t.store.dirty()).toEqual([]);
  expect(await t.listened.push()).toBe(0); // nothing new: no second PUT
  expect(t.puts).toHaveLength(1);
  t.listened.onTick('e', 61_000); t.listened.onTick('e', 62_000);
  t.listened.close();
  expect(t.store.get('e', '2026-09-21')?.ranges).toEqual([[0, 10_000], [60_000, 62_000]]);
  await t.listened.push();
  expect(t.puts[1]!.days[0]!.ranges).toEqual([[0, 10_000], [60_000, 62_000]]); // the WHOLE day's set again, not a delta
});

it('A11: offline keeps rows dirty and sends them later; signed out or no device id sends nothing', async () => {
  const t = build({ online: false });
  t.listened.onTick('e', 0); t.listened.onTick('e', 5_000);
  expect(await t.listened.push()).toBe(0);
  expect(t.store.dirty()).toHaveLength(1);
  t.setOnline(true);
  expect(await t.listened.push()).toBe(1);
  const out = build({ signedIn: false });
  out.listened.onTick('e', 0); out.listened.onTick('e', 5_000);
  expect(await out.listened.push()).toBe(0);
  expect(out.store.dirty()).toHaveLength(1); // kept for after sign-in
  const noDevice = build({ device: undefined as unknown as string });
  noDevice.listened.onTick('e', 0); noDevice.listened.onTick('e', 5_000);
  expect(await noDevice.listened.push()).toBe(0);
});

it('A11: a day change or another episode closes the interval into the right row; pending() shows it', () => {
  const t = build();
  t.listened.onTick('a', 0); t.listened.onTick('a', 1_000);
  t.listened.onTick('b', 500); t.listened.onTick('b', 1_500);
  t.advance(24 * 3_600_000);
  t.listened.onTick('b', 2_500);
  t.listened.onTick('b', 3_500);
  expect(t.listened.pending()).toEqual([
    { episodeId: 'a', day: '2026-09-21', ranges: [[0, 1_000]] },
    { episodeId: 'b', day: '2026-09-21', ranges: [[500, 1_500]] },
    { episodeId: 'b', day: '2026-09-22', ranges: [[2_500, 3_500]] },
  ]);
  t.listened.close(); // nothing open: harmless
  t.listened.onTick('c', 0); // a single tick has no length
  expect(t.listened.pending()).toHaveLength(3);
});
