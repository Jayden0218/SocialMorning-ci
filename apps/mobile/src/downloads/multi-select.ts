// Choosing several downloads and deleting them together (the Downloads page's Select mode).
/**
 * M24 US17 (spec 025, lane A3): 小宇宙 lets you pick several downloads and delete them at once
 * ("删除%1$s项"). The page keeps a set of episode ids; these helpers change it, and
 * `removeChosen` deletes one after another through the manager's own `remove` (the file and the
 * row; positions, queue and inbox stay — FR-006), going on past one that fails.
 */
import { plural } from '@socialmorning/social-core';

export const NONE: ReadonlySet<string> = new Set();

export function toggleChosen(chosen: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(chosen);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

/** All rows chosen, or none when all already are (the "Select all" / "Clear" button). */
export function toggleAll(chosen: ReadonlySet<string>, ids: readonly string[]): ReadonlySet<string> {
  return ids.length > 0 && ids.every((id) => chosen.has(id)) ? NONE : new Set(ids);
}

/** A row that left the list (finished elsewhere, removed) is no longer chosen. */
export function keepListed(chosen: ReadonlySet<string>, ids: readonly string[]): ReadonlySet<string> {
  const listed = new Set(ids);
  const next = [...chosen].filter((id) => listed.has(id));
  return next.length === chosen.size ? chosen : new Set(next);
}

export async function removeChosen(ids: Iterable<string>, remove: (id: string) => Promise<void>): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  for (const id of ids) {
    try { await remove(id); removed++; } catch { failed++; }
  }
  return { removed, failed };
}

export const deleteLabel = (n: number): string => (n === 0 ? 'Delete' : `Delete ${plural(n, 'episode')}`);

export function removedLine(r: { removed: number; failed: number }): string {
  const done = `${plural(r.removed, 'download')} deleted.`;
  return r.failed > 0 ? `${done} ${plural(r.failed, 'download')} could not be deleted.` : done;
}
