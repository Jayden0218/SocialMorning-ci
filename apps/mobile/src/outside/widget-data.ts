// Works out and saves what the Playlist, Daily pick and Listening-this-week widgets show.
/**
 * M21 US11 (FR-104, research R9). Three more home-screen widgets on both phones. The app keeps a
 * small saved copy of each in the settings table — `widget.playlist`, `widget.dailyPick`,
 * `widget.week` (data-model.md) — written whenever the data changes, so:
 *   - Android's headless widget handler draws them with the app killed (it reads the copies);
 *   - the iPhone widgets get the same data through the App Group (`src/outside/ios.ts`).
 *
 * The first half of this file is pure (tested in __tests__/m21-widgets.test.ts); `createWidgetData`
 * feeds it from the player, the queue and Discover's saved copy.
 *
 * "Listening this week" is counted on this phone: wall-clock time while the player is playing,
 * per local day, Monday to Sunday. Older days are dropped after a week.
 */
import type { PlayerRuntime } from '@/playback/store';
import type { Discover } from '@/social/api';
import type { FeedCacheStore, SettingsStore } from '@/storage/types';
import { DISCOVER_KEY } from '@/discover/cache';

export const WIDGET_KEYS = { playlist: 'widget.playlist', dailyPick: 'widget.dailyPick', week: 'widget.week' } as const;

export type WidgetEpisode = { episodeId: string; title: string; show: string };
export type PlaylistCopy = { items: WidgetEpisode[] };
export type DailyPickCopy = { pick: (WidgetEpisode & { date?: string; why?: string }) | null };
/** Milliseconds listened per local day, `YYYY-MM-DD` → ms. */
export type WeekCopy = { days: Record<string, number> };

/** How much one gap between two player updates may add (a TICK comes every 500 ms). */
export const MAX_STEP_MS = 5_000;
/** The week copy is saved at most this often while playing (and always when playing stops). */
export const WEEK_SAVE_EVERY_MS = 60_000;

const pad = (n: number): string => String(n).padStart(2, '0');

/** The phone's local day of `ms`, as `YYYY-MM-DD`. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight at the start of this week's Monday. */
export function weekStartMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

/** The next 3 in the queue, without the episode playing now; unknown episodes are skipped. */
export function playlistNext3(queue: readonly string[], current: string | undefined, lookup: (id: string) => { title: string; show: string } | undefined): PlaylistCopy {
  const items: WidgetEpisode[] = [];
  for (const id of queue) {
    if (items.length === 3) break;
    if (id === current) continue;
    const meta = lookup(id);
    if (meta) items.push({ episodeId: id, title: meta.title, show: meta.show });
  }
  return { items };
}

/** Today's first editor's pick from Discover's saved copy, or none. */
export function dailyPickOf(discover: Pick<Discover, 'picks' | 'date'> | undefined): DailyPickCopy {
  const first = discover?.picks[0];
  if (discover === undefined || first === undefined) return { pick: null };
  const e = first.episode;
  return {
    pick: {
      episodeId: e.id, title: e.title, show: e.showTitle,
      ...(discover.date !== undefined ? { date: discover.date } : {}),
      ...(first.why !== undefined ? { why: first.why } : {}),
    },
  };
}

/** Adds `ms` to the day of `now`, and drops days from before last week's Monday. */
export function addListening(week: WeekCopy, now: number, ms: number): WeekCopy {
  const keep = dayKey(weekStartMs(now) - 7 * 86_400_000);
  const days: Record<string, number> = {};
  for (const [k, v] of Object.entries(week.days)) if (k >= keep) days[k] = v;
  if (ms > 0) {
    const today = dayKey(now);
    days[today] = (days[today] ?? 0) + ms;
  }
  return { days };
}

/** Milliseconds listened since this week's Monday, up to now. */
export function weekTotalMs(week: WeekCopy, now: number): number {
  const from = dayKey(weekStartMs(now));
  const to = dayKey(now);
  let total = 0;
  for (const [k, v] of Object.entries(week.days)) if (k >= from && k <= to) total += v;
  return total;
}

/** "0 min", "45 min", "3 h", "3 h 20 min". */
export function listeningLabel(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Reads a saved copy; anything missing or broken is `fallback`. */
export function readCopy<T>(settings: Pick<SettingsStore, 'get'>, key: string, fallback: T): T {
  const raw = settings.get(key);
  if (raw === undefined) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** Discover's saved page (`feed_cache` row `discover`), or none. */
export function savedDiscover(cache: Pick<FeedCacheStore, 'get'>): Pick<Discover, 'picks' | 'date'> | undefined {
  const row = cache.get(DISCOVER_KEY);
  if (!row) return undefined;
  try { return JSON.parse(row.body) as Discover; } catch { return undefined; }
}

/** One phone's widget surfaces; each is told only when its copy changed. */
export type WidgetDataSink = {
  playlist(copy: PlaylistCopy): void;
  dailyPick(copy: DailyPickCopy): void;
  week(copy: WeekCopy): void;
};

export type WidgetData = {
  /** Recomputes the playlist and the daily pick, saves the week; sinks hear only what changed. */
  refresh(): void;
  dispose(): void;
};

export function createWidgetData(deps: {
  settings: SettingsStore;
  runtime: Pick<PlayerRuntime, 'getState' | 'subscribe'>;
  queue: () => readonly string[];
  lookup: (episodeId: string) => { title: string; show: string } | undefined;
  discover: () => Pick<Discover, 'picks' | 'date'> | undefined;
  sinks: readonly WidgetDataSink[];
  now: () => number;
}): WidgetData {
  const written = new Map<string, string>();
  for (const key of Object.values(WIDGET_KEYS)) {
    const raw = deps.settings.get(key);
    if (raw !== undefined) written.set(key, raw);
  }
  let week = readCopy<WeekCopy>(deps.settings, WIDGET_KEYS.week, { days: {} });
  let lastAt: number | undefined;
  let savedAt = deps.now();
  let episode: string | undefined;

  const tell = (fn: (s: WidgetDataSink) => void): void => {
    for (const s of deps.sinks) { try { fn(s); } catch { /* one widget failing never stops the others */ } }
  };

  /** Saves `copy` under `key` when it differs from what is saved; true when it did. */
  const save = (key: string, copy: unknown): boolean => {
    const json = JSON.stringify(copy);
    if (written.get(key) === json) return false;
    written.set(key, json);
    deps.settings.set(key, json);
    return true;
  };

  const current = (): string | undefined => {
    const st = deps.runtime.getState();
    return st.kind === 'idle' ? undefined : st.episodeId;
  };

  const writePlaylist = (): void => {
    const copy = playlistNext3(deps.queue(), current(), deps.lookup);
    if (save(WIDGET_KEYS.playlist, copy)) tell((s) => s.playlist(copy));
  };

  const writeWeek = (): void => {
    week = addListening(week, deps.now(), 0);
    savedAt = deps.now();
    const copy = week;
    if (save(WIDGET_KEYS.week, copy)) tell((s) => s.week(copy));
  };

  const refresh = (): void => {
    writePlaylist();
    const pick = dailyPickOf(deps.discover());
    if (save(WIDGET_KEYS.dailyPick, pick)) tell((s) => s.dailyPick(pick));
    writeWeek();
  };

  const onPlayer = (): void => {
    const st = deps.runtime.getState();
    const now = deps.now();
    const playing = st.kind === 'playing' || st.kind === 'buffering';
    if (playing) {
      if (lastAt !== undefined) week = addListening(week, now, Math.min(Math.max(now - lastAt, 0), MAX_STEP_MS));
      lastAt = now;
      if (now - savedAt >= WEEK_SAVE_EVERY_MS) writeWeek();
    } else if (lastAt !== undefined) {
      lastAt = undefined;
      writeWeek();
    }
    // A new episode (the queue moved on): the playlist's next 3 change.
    const id = current();
    if (id !== episode) {
      episode = id;
      writePlaylist();
    }
  };

  const unsubscribe = deps.runtime.subscribe(onPlayer);
  refresh();
  return { refresh, dispose: unsubscribe };
}
