// Tests the three new widgets' data: the next 3, the daily pick, the week's listening, and the saved copies.
/**
 * M21 US11 (FR-104, research R9). What the Playlist, Daily pick and Listening-this-week widgets
 * show is worked out in src/outside/widget-data.ts and saved under `widget.*` so a killed app
 * still shows it (Android reads the copies in its headless handler; the iPhone gets them through
 * the App Group, flattened by src/outside/ios.ts). Checked here:
 *   - the next 3 skip the playing episode and unknown ids; the pick is Discover's first;
 *   - the week counts from Monday, by local day, capped per step, and a new week starts at 0;
 *   - the writer saves a copy only when it changed, and tells the sinks only then;
 *   - the Android handler draws each new widget from the saved copies by its name.
 *
 * The break that turns it red: in src/outside/widget-data.ts make `playlistNext3` keep the
 * episode playing now (the first test fails), or have `weekTotalMs` count last week's days.
 *
 * Whether the widgets show these on a home screen with the app killed is NOT VERIFIED (B18).
 */
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import {
  MAX_STEP_MS, WEEK_SAVE_EVERY_MS, WIDGET_KEYS, addListening, createWidgetData, dailyPickOf, dayKey, listeningLabel,
  playlistNext3, readCopy, savedDiscover, weekStartMs, weekTotalMs, type WidgetDataSink,
} from '@/outside/widget-data';
import { flatDailyPick, flatPlaylist, flatWeek, iosWidgetDataSink } from '@/outside/ios';
import { WIDGET_NAMES, savedWidget, widgetTaskHandler } from '@/outside/android-widget';
import type { PlayerState } from '@/playback/types';
import type { Discover, DiscoverItem } from '@/social/api';

const at = (d: number, h = 12, m = 0): number => new Date(2026, 9, d, h, m).getTime(); // October 2026, local time
const MON = 5;
const WED = 7;
const SUN = 11;
const NEXT_MON = 12;

const meta: Record<string, { title: string; show: string }> = {
  a: { title: 'A', show: 'Show A' }, b: { title: 'B', show: 'Show B' }, c: { title: 'C', show: 'Show C' }, d: { title: 'D', show: 'Show D' },
};
const lookup = (id: string) => meta[id];

const item = (id: string, why?: string): DiscoverItem => ({
  kind: 'pick', key: id, ...(why !== undefined ? { why } : {}),
  episode: { id, feedUrl: 'https://f', guid: id, title: `Pick ${id}`, showTitle: 'Picked show', enclosureUrl: `https://cdn/${id}.mp3` },
});

describe('pure shaping', () => {
  it('the next 3 skip the episode playing now and episodes this phone does not know', () => {
    expect(playlistNext3(['a', 'x', 'b', 'c', 'd'], 'b', lookup).items.map((e) => e.episodeId)).toEqual(['a', 'c', 'd']);
    expect(playlistNext3([], undefined, lookup)).toEqual({ items: [] });
    expect(playlistNext3(['a'], undefined, lookup).items[0]).toEqual({ episodeId: 'a', title: 'A', show: 'Show A' });
  });

  it('the daily pick is Discover\'s first pick, with its date and why when present', () => {
    expect(dailyPickOf(undefined)).toEqual({ pick: null });
    expect(dailyPickOf({ picks: [] })).toEqual({ pick: null });
    expect(dailyPickOf({ picks: [item('p1', 'Because'), item('p2')], date: '2026-10-07' })).toEqual({
      pick: { episodeId: 'p1', title: 'Pick p1', show: 'Picked show', date: '2026-10-07', why: 'Because' },
    });
    expect(dailyPickOf({ picks: [item('p2')] })).toEqual({ pick: { episodeId: 'p2', title: 'Pick p2', show: 'Picked show' } });
  });

  it('the week starts on Monday at local midnight', () => {
    expect(dayKey(weekStartMs(at(WED)))).toBe('2026-10-05');
    expect(dayKey(weekStartMs(at(SUN, 23, 59)))).toBe('2026-10-05');
    expect(dayKey(weekStartMs(at(MON, 0, 0)))).toBe('2026-10-05');
    expect(dayKey(weekStartMs(at(NEXT_MON)))).toBe('2026-10-12');
  });

  it('listening adds up by day, counts from Monday, and a new week starts at 0', () => {
    let week = addListening({ days: {} }, at(SUN - 7), 600_000); // last week's Sunday
    week = addListening(week, at(MON), 1_200_000);
    week = addListening(week, at(WED), 1_800_000);
    week = addListening(week, at(WED, 18), 60_000);
    expect(week.days['2026-10-07']).toBe(1_860_000);
    expect(weekTotalMs(week, at(WED, 20))).toBe(3_060_000);
    expect(weekTotalMs(week, at(NEXT_MON))).toBe(0);
    // Days older than last week's Monday are dropped; 0 ms adds no day.
    const later = addListening(week, at(NEXT_MON + 7), 0);
    expect(Object.keys(later.days)).toEqual([]);
    expect(Object.keys(addListening({ days: {} }, at(WED), 0).days)).toEqual([]);
  });

  it('labels read as minutes and hours', () => {
    expect(listeningLabel(0)).toBe('0 min');
    expect(listeningLabel(45 * 60_000 + 59_000)).toBe('45 min');
    expect(listeningLabel(3 * 3_600_000)).toBe('3 h');
    expect(listeningLabel(3 * 3_600_000 + 20 * 60_000)).toBe('3 h 20 min');
  });

  it('a missing or broken saved copy reads as the fallback', () => {
    const { settings, feedCache } = createMemoryStores(hash);
    expect(readCopy(settings, WIDGET_KEYS.week, { days: {} })).toEqual({ days: {} });
    settings.set(WIDGET_KEYS.week, '{not json');
    expect(readCopy(settings, WIDGET_KEYS.week, { days: {} })).toEqual({ days: {} });
    expect(savedDiscover(feedCache)).toBeUndefined();
    feedCache.set({ key: 'discover', fetchedAt: 1, body: '{broken' });
    expect(savedDiscover(feedCache)).toBeUndefined();
    feedCache.set({ key: 'discover', fetchedAt: 1, body: JSON.stringify({ picks: [item('p1')], date: '2026-10-07' }) });
    expect(savedDiscover(feedCache)?.picks[0]?.episode.id).toBe('p1');
  });

  it('the iPhone gets flat copies: at most 3, a has-flag, and this week\'s Monday with the minutes', () => {
    expect(flatPlaylist({ items: [{ episodeId: 'a', title: 'A', show: 'SA' }] })).toEqual({ count: 1, title0: 'A', show0: 'SA' });
    expect(flatDailyPick({ pick: null })).toEqual({ has: 0 });
    expect(flatDailyPick({ pick: { episodeId: 'p', title: 'P', show: 'S' } })).toEqual({ has: 1, title: 'P', show: 'S', why: '', date: '' });
    expect(flatDailyPick({ pick: { episodeId: 'p', title: 'P', show: 'S', why: 'W', date: 'D' } })).toEqual({ has: 1, title: 'P', show: 'S', why: 'W', date: 'D' });
    expect(flatWeek({ days: { '2026-10-07': 125 * 60_000 } }, at(WED))).toEqual({ weekStart: '2026-10-05', minutes: 125 });
  });

  it('the iPhone sink writes each key and reloads only that widget\'s kind', () => {
    const sets: [string, unknown][] = [];
    const reloads: (string | undefined)[] = [];
    class Storage { set(key: string, value: unknown) { sets.push([key, value]); } }
    const targets = { ExtensionStorage: Object.assign(Storage, { reloadWidget: (name?: string) => void reloads.push(name) }) };
    const sink = iosWidgetDataSink(targets as never, () => at(WED));
    sink.playlist({ items: [] });
    sink.dailyPick({ pick: null });
    sink.week({ days: {} });
    expect(sets.map(([k]) => k)).toEqual(['playlistNext3', 'dailyPick', 'weekListening']);
    expect(reloads).toEqual(['PlaylistWidget', 'DailyPickWidget', 'WeekListeningWidget']);
  });
});

describe('the writer', () => {
  function rig(start: PlayerState = { kind: 'idle' }) {
    const stores = createMemoryStores(hash);
    let state: PlayerState = start;
    let listener: () => void = () => undefined;
    let now = at(WED, 9);
    let queue = ['a', 'b', 'c', 'd'];
    let discover: Pick<Discover, 'picks' | 'date'> | undefined = { picks: [item('p1')] };
    const told: string[] = [];
    const sink: WidgetDataSink = {
      playlist: (c) => void told.push(`playlist:${c.items.map((e) => e.episodeId).join('')}`),
      dailyPick: (c) => void told.push(`pick:${c.pick?.episodeId ?? '-'}`),
      week: (c) => void told.push(`week:${Math.round(weekTotalMs(c, now) / 1000)}`),
    };
    const broken: WidgetDataSink = { playlist: () => { throw new Error('x'); }, dailyPick: () => { throw new Error('x'); }, week: () => { throw new Error('x'); } };
    const unsubscribe = jest.fn();
    const data = createWidgetData({
      settings: stores.settings,
      runtime: { getState: () => state, subscribe: (l) => { listener = l; return unsubscribe; } },
      queue: () => queue,
      lookup,
      discover: () => discover,
      sinks: [broken, sink],
      now: () => now,
    });
    return {
      stores, data, told, unsubscribe,
      set: (s: PlayerState) => { state = s; listener(); },
      tick: (ms: number) => { now += ms; listener(); },
      advance: (ms: number) => { now += ms; },
      setQueue: (q: string[]) => { queue = q; },
      setDiscover: (d: typeof discover) => { discover = d; },
    };
  }
  const playing = (id: string): PlayerState => ({ kind: 'playing', episodeId: id, positionMs: 0, lastSavedMs: 0 });

  it('saves all three at start, and tells the sinks (one failing sink never stops the other)', () => {
    const r = rig();
    expect(r.told).toEqual(['playlist:abc', 'pick:p1', 'week:0']);
    expect(JSON.parse(r.stores.settings.get(WIDGET_KEYS.playlist)!)).toEqual(playlistNext3(['a', 'b', 'c', 'd'], undefined, lookup));
    expect(JSON.parse(r.stores.settings.get(WIDGET_KEYS.dailyPick)!).pick.episodeId).toBe('p1');
  });

  it('nothing changed → nothing written or told; a new pick or queue is told on refresh', () => {
    const r = rig();
    r.told.length = 0;
    r.data.refresh();
    expect(r.told).toEqual([]);
    r.setQueue(['d']);
    r.setDiscover(undefined);
    r.data.refresh();
    expect(r.told).toEqual(['playlist:d', 'pick:-']);
  });

  it('a new episode updates the next 3; the week counts while playing and is saved when it stops', () => {
    const r = rig();
    r.told.length = 0;
    r.set(playing('a'));
    expect(r.told).toEqual(['playlist:bcd']);
    r.tick(500);
    r.tick(500);
    r.tick(60_000); // a long gap (the phone slept) adds at most MAX_STEP_MS
    r.set({ kind: 'paused', episodeId: 'a', positionMs: 0, by: 'user' });
    expect(r.told.slice(1)).toEqual([`week:${(1_000 + MAX_STEP_MS) / 1000}`]);
    // Paused again: nothing more to save.
    r.set({ kind: 'paused', episodeId: 'a', positionMs: 1, by: 'user' });
    expect(r.told.length).toBe(2);
  });

  it('while playing, the week is saved at most every minute', () => {
    const r = rig(playing('a'));
    r.told.length = 0;
    r.set(playing('a'));
    for (let i = 0; i < (WEEK_SAVE_EVERY_MS / 5_000) + 1; i++) r.tick(5_000);
    expect(r.told.filter((t) => t.startsWith('week:'))).toHaveLength(1);
    r.advance(-10_000); // a clock that went back adds nothing
    r.tick(0);
  });

  it('starts from the saved copies (no second write of the same thing) and dispose unsubscribes', () => {
    const r = rig();
    const heard: string[] = [];
    const again = createWidgetData({
      settings: r.stores.settings,
      runtime: { getState: () => ({ kind: 'idle' }), subscribe: () => () => undefined },
      queue: () => ['a', 'b', 'c', 'd'],
      lookup,
      discover: () => ({ picks: [item('p1')] }),
      sinks: [{ playlist: () => void heard.push('playlist'), dailyPick: () => void heard.push('pick'), week: () => void heard.push('week') }],
      now: () => at(WED, 9),
    });
    expect(heard).toEqual([]);
    again.dispose();
    r.data.dispose();
    expect(r.unsubscribe).toHaveBeenCalled();
  });
});

describe('the Android handler', () => {
  const info = (widgetName: string) => ({ widgetName, widgetId: 2, height: 110, width: 250, screenInfo: { screenHeightDp: 800, screenWidthDp: 400, density: 2, densityDpi: 320 } });

  it('draws each new widget from the saved copies, by name', () => {
    const { settings } = createMemoryStores(hash);
    settings.set(WIDGET_KEYS.playlist, JSON.stringify({ items: [{ episodeId: 'a', title: 'A', show: 'SA' }] }));
    settings.set(WIDGET_KEYS.dailyPick, JSON.stringify({ pick: { episodeId: 'p', title: 'P', show: 'S', why: 'W' } }));
    settings.set(WIDGET_KEYS.week, JSON.stringify({ days: { '2026-10-07': 90 * 60_000 } }));
    const playlist = savedWidget(WIDGET_NAMES.playlist, settings, at(WED));
    const pick = savedWidget(WIDGET_NAMES.dailyPick, settings, at(WED));
    const week = savedWidget(WIDGET_NAMES.week, settings, at(WED));
    expect(playlist?.props.copy.items[0].title).toBe('A');
    expect(pick?.props.copy.pick.title).toBe('P');
    expect(week?.props.copy.days['2026-10-07']).toBe(5_400_000);
    expect(savedWidget('NowPlaying', settings, at(WED))).toBeUndefined();
    // No settings at all (the database could not be opened): empty widgets, not a crash.
    expect(savedWidget(WIDGET_NAMES.playlist, undefined, at(WED))?.props.copy).toEqual({ items: [] });
    expect(savedWidget(WIDGET_NAMES.dailyPick, undefined, at(WED))?.props.copy).toEqual({ pick: null });
    expect(savedWidget(WIDGET_NAMES.week, undefined, at(WED))?.props.copy).toEqual({ days: {} });
  });

  it('the handler renders a new widget, and leaves an unknown name alone', async () => {
    const { platformWidgetDataSinks } = require('@/outside/sinks') as typeof import('@/outside/sinks');
    const { settings } = createMemoryStores(hash);
    platformWidgetDataSinks(settings); // the test runner is iOS: no sink, and no crash
    const android = require('@/outside/android-widget') as typeof import('@/outside/android-widget');
    android.setWidgetSettings(settings);
    const drawn: unknown[] = [];
    await widgetTaskHandler({ widgetInfo: info(WIDGET_NAMES.week), widgetAction: 'WIDGET_UPDATE', renderWidget: (w) => void drawn.push(w) } as never);
    await widgetTaskHandler({ widgetInfo: info('Unknown'), widgetAction: 'WIDGET_UPDATE', renderWidget: (w) => void drawn.push(w) } as never);
    expect(drawn).toHaveLength(1);
    android.setWidgetSettings(undefined);
  });
});
