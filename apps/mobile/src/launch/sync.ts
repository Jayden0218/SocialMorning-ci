/**
 * M15 US3 (research R5, step 1): bring the launch list and its images up to date **for the
 * next launch**. Called once start-up is ready, fire-and-forget — start-up never awaits it
 * (SC-004; guard G-L4 in `__tests__/launch-startup.test.tsx`).
 *
 * Offline or a server error: the old list stays, so a promotion already cached can still
 * show. Its end date is checked at launch (`chooseLaunch`), so a stale list cannot show an
 * ended promotion.
 */
import type { SettingsStore } from '@/storage/types';
import type { LaunchApi } from './api';
import type { Promotion } from './choose';
import type { LaunchFiles } from './launch-files';
import { readFiles, writeFiles, writeList } from './store';

export type LaunchSyncDeps = { api: Pick<LaunchApi, 'list'>; files: LaunchFiles; settings: SettingsStore };

/** Never rejects. Resolves once the list is saved, missing images fetched and stale ones deleted. */
export async function syncLaunch(deps: LaunchSyncDeps): Promise<void> {
  let list: Promotion[];
  try { list = await deps.api.list(); } catch { return; }
  writeList(deps.settings, list);
  const live = new Set(list.map((p) => p.id));
  const onDisk = new Set(deps.files.ids());
  // What is recorded but gone from the disk (the OS emptied the cache) is not cached.
  const have = new Set([...readFiles(deps.settings)].filter((id) => onDisk.has(id) && live.has(id)));
  // Stale images: on disk but no longer served.
  for (const id of onDisk) if (!live.has(id)) deps.files.remove(id);
  writeFiles(deps.settings, have);
  for (const p of list) {
    if (have.has(p.id) && onDisk.has(p.id)) continue;
    try {
      await deps.files.download(p.id, p.imageUrl);
      have.add(p.id);
      writeFiles(deps.settings, have);
    } catch { /* try again on the next launch */ }
  }
}
