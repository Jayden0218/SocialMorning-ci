/**
 * M15 US3: the launch screen's decision as start-up makes it — **synchronously**, from the
 * settings store and the files already on disk, with no network call (SC-004, guard G-L4).
 * `src/ui/shell/providers.tsx` calls it once, at mount; the list and images for the NEXT launch
 * come from `syncLaunch`, started after start-up is ready and never awaited.
 */
import { getPref } from '@/settings/prefs';
import type { SettingsStore } from '@/storage/types';
import { chooseLaunch, localDay, markShown, type Promotion } from './choose';
import type { LaunchFiles } from './launch-files';
import { readFiles, readList, readShown, writeShown } from './store';

export type LaunchPick = { promotion: Promotion; uri: string };

export function decideLaunch(d: {
  settings: Pick<SettingsStore, 'get'>;
  files: Pick<LaunchFiles, 'uri'>;
  now: number;
  signedIn: boolean;
  termsDue: boolean;
  random: () => number;
}): LaunchPick | undefined {
  const list = readList(d.settings);
  const recorded = readFiles(d.settings);
  // Recorded AND still on disk: the OS may empty the cache directory between launches.
  const uris = new Map<string, string>();
  for (const p of list) {
    if (!recorded.has(p.id)) continue;
    const uri = d.files.uri(p.id);
    if (uri !== undefined) uris.set(p.id, uri);
  }
  const promotion = chooseLaunch({
    list,
    cachedIds: new Set(uris.keys()),
    now: d.now,
    shown: readShown(d.settings),
    minor: getPref(d.settings, 'hideExplicit'),
    signedIn: d.signedIn,
    termsDue: d.termsDue,
    random: d.random,
  });
  return promotion === undefined ? undefined : { promotion, uri: uris.get(promotion.id)! };
}

/** One more impression today, on this phone only (the daily cap). */
export function recordShown(settings: SettingsStore, id: string, now: number): void {
  writeShown(settings, markShown(readShown(settings), id, localDay(now)));
}
