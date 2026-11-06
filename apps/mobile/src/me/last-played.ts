// The last episode played, kept on the device so Me can offer "Continue listening" when nothing is loaded.
/**
 * Spec 039 Q3 (owner, 2026-11-06). One JSON value in the settings store (`me.lastPlayed`, the same device storage the queue and the
 * player's session use): the episode's id, title, show, cover and URL, how far the listener got and how long it is. It is written from
 * the player's own position save (`onPositionSaved`), so it moves exactly as often as the saved position does (every tick save, stop, seek,
 * background) and once more when the episode ends (`finished`). Reads fail soft (rule IV): a damaged value is no value.
 */
import type { PositionRow, SettingsStore } from '@/storage/types';

export const LAST_PLAYED_KEY = 'me.lastPlayed';

export type LastPlayed = {
  id: string;
  title: string;
  showTitle: string;
  url: string;
  artworkUrl?: string;
  feedUrl?: string;
  positionMs: number;
  durationMs?: number;
  finished: boolean;
};

/** What the writer needs to describe the episode (a subset of the player's `PlayableEpisode`). */
export type LastPlayedEpisode = { id: string; title: string; showTitle: string; url: string; artworkUrl?: string; feedUrl?: string };

export function readLastPlayed(settings: SettingsStore): LastPlayed | undefined {
  try {
    const raw = settings.get(LAST_PLAYED_KEY);
    if (!raw) return undefined;
    const v = JSON.parse(raw) as Partial<LastPlayed>;
    if (typeof v.id !== 'string' || typeof v.title !== 'string' || typeof v.url !== 'string' || typeof v.positionMs !== 'number') return undefined;
    return {
      id: v.id,
      title: v.title,
      showTitle: typeof v.showTitle === 'string' ? v.showTitle : '',
      url: v.url,
      ...(typeof v.artworkUrl === 'string' && { artworkUrl: v.artworkUrl }),
      ...(typeof v.feedUrl === 'string' && { feedUrl: v.feedUrl }),
      positionMs: v.positionMs,
      ...(typeof v.durationMs === 'number' && { durationMs: v.durationMs }),
      finished: v.finished === true,
    };
  } catch {
    return undefined;
  }
}

export function rememberLastPlayed(stores: { settings: SettingsStore }, row: PositionRow, episode: LastPlayedEpisode): void {
  try {
    const value: LastPlayed = {
      id: episode.id,
      title: episode.title,
      showTitle: episode.showTitle,
      url: episode.url,
      ...(episode.artworkUrl !== undefined && { artworkUrl: episode.artworkUrl }),
      ...(episode.feedUrl !== undefined && { feedUrl: episode.feedUrl }),
      positionMs: row.offsetMs,
      ...(row.durationMsAtSave !== undefined && { durationMs: row.durationMsAtSave }),
      finished: row.finished,
    };
    stores.settings.set(LAST_PLAYED_KEY, JSON.stringify(value));
  } catch {
    // A full disk must not stop the player's save.
  }
}
