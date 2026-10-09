// Updates the iPhone widget and lock-screen live activity.
/**
 * M10b US9 — the iPhone surfaces. The widget (`targets/widget`, SwiftUI) reads the card from
 * the shared App Group through @bacons/apple-targets' `ExtensionStorage`; the lock screen's
 * live activity comes from expo-live-activity (iOS 16.2+). Both packages are iOS-only.
 *
 * M21 US11 (research R9): the widget target is now a bundle; Playlist, Daily pick and Listening
 * this week read their own keys (`iosWidgetDataSink`), flattened here because the App Group
 * holds flat dictionaries of strings and numbers.
 */
import type { OutsideSink } from './bridge';
import { dayKey, weekStartMs, weekTotalMs, type DailyPickCopy, type PlaylistCopy, type WeekCopy, type WidgetDataSink } from './widget-data';

/** Must match `app.json` → `ios.entitlements` and `targets/widget/expo-target.config.js`. */
export const APP_GROUP = 'group.app.socialmorning.mobile';
export const CARD_KEY = 'nowPlaying';
/** M21 US11: the App Group keys and widget kinds (targets/widget/SocialNetWidgets.swift). */
export const PLAYLIST_KEY = 'playlistNext3';
export const DAILY_PICK_KEY = 'dailyPick';
export const WEEK_KEY = 'weekListening';
export const KINDS = { playlist: 'PlaylistWidget', dailyPick: 'DailyPickWidget', week: 'WeekListeningWidget' } as const;

type Flat = Record<string, string | number>;

/** `{ count, title0, show0, … }` — at most 3. */
export function flatPlaylist(copy: PlaylistCopy): Flat {
  const out: Flat = { count: copy.items.length };
  copy.items.slice(0, 3).forEach((e, i) => { out[`title${i}`] = e.title; out[`show${i}`] = e.show; });
  return out;
}

/** `{ has: 0 }`, or `{ has: 1, title, show, why, date }`. */
export function flatDailyPick(copy: DailyPickCopy): Flat {
  const p = copy.pick;
  return p ? { has: 1, title: p.title, show: p.show, why: p.why ?? '', date: p.date ?? '' } : { has: 0 };
}

/** `{ weekStart: 'YYYY-MM-DD' (Monday), minutes }` — the widget shows 0 once a new week starts. */
export function flatWeek(copy: WeekCopy, now: number): Flat {
  return { weekStart: dayKey(weekStartMs(now)), minutes: Math.floor(weekTotalMs(copy, now) / 60_000) };
}

type Storage = { set(key: string, value: Record<string, string | number> | undefined): void };
type Targets = { ExtensionStorage: (new (group: string) => Storage) & { reloadWidget(name?: string): void } };
type Live = {
  startActivity(state: { title: string; subtitle?: string; progressBar: Record<string, never> }, config?: { deepLinkUrl?: string }): string | undefined;
  updateActivity(id: string, state: { title: string; subtitle?: string; progressBar: Record<string, never> }): void;
  stopActivity(id: string, state: { title: string; subtitle?: string; progressBar: Record<string, never> }): void;
};

/** The widget: the card as flat strings, then a timeline reload. */
export function iosWidgetSink(targets: Targets): OutsideSink {
  const storage = new targets.ExtensionStorage(APP_GROUP);
  return {
    show: (card) => {
      storage.set(CARD_KEY, card ? {
        episodeId: card.episodeId, title: card.title, show: card.show, playing: card.playing ? 1 : 0,
        comment: card.comment ? `“${card.comment.body}” — ${card.comment.author}` : '',
      } : undefined);
      targets.ExtensionStorage.reloadWidget();
    },
  };
}

/** M21 US11: the three new widgets — write the flat copy, then reload only that widget's kind. */
export function iosWidgetDataSink(targets: Targets, now: () => number = Date.now): WidgetDataSink {
  const storage = new targets.ExtensionStorage(APP_GROUP);
  return {
    playlist: (copy) => { storage.set(PLAYLIST_KEY, flatPlaylist(copy)); targets.ExtensionStorage.reloadWidget(KINDS.playlist); },
    dailyPick: (copy) => { storage.set(DAILY_PICK_KEY, flatDailyPick(copy)); targets.ExtensionStorage.reloadWidget(KINDS.dailyPick); },
    week: (copy) => { storage.set(WEEK_KEY, flatWeek(copy, now())); targets.ExtensionStorage.reloadWidget(KINDS.week); },
  };
}

/** The lock screen: started on play, updated on change, stopped when nothing is loaded. */
export function liveActivitySink(live: Live): OutsideSink {
  let id: string | undefined;
  return {
    show: (card) => {
      if (!card) { if (id) live.stopActivity(id, { title: 'SocialNet', progressBar: {} }); id = undefined; return; }
      const state = { title: card.title, subtitle: card.comment ? `“${card.comment.body}” — ${card.comment.author}` : card.show, progressBar: {} as Record<string, never> };
      if (id) live.updateActivity(id, state);
      else if (card.playing) id = live.startActivity(state, { deepLinkUrl: '/player' });
    },
  };
}
