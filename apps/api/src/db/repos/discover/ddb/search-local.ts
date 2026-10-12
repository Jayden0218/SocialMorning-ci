// Search on DynamoDB, in memory: people over lane AC's listener queue; Studio shows from lane ST's table.
/**
 * M26 lane DV (DV-93, DV-94; data-model.md §14, research R11 decision B). DynamoDB has no text index, so the SQL's
 * `ILIKE '%q%'` runs in code over a list read whole:
 * - People: every listener item of lane AC's G4 `Q#listeners` (one Query, ≈ 1 KB a listener), then the same rules as
 *   the SQL — not suspended, not hidden, not the viewer, no block either way (the viewer's own `BLOCK#`/`BLOCKEDBY#`
 *   items, lane SF) — the same order: names that START with the term first, then lower(name), then id; 20 at most.
 * - Studio shows: lane ST's live hosted shows (`liveHostedShows`, its G4 `Q#hosted`), the same match, newest first, 10 at most.
 * The term arrives LIKE-escaped (routes/discover/search.ts); it is unescaped here and matched literally, case-blind.
 *
 * Scale limit, stated: one search reads every listener item (≈ 1 MB per 1 000 listeners). Safe to ≈ 10 000 listeners
 * (≈ 10 MB, ≈ 10 pages, well under a second, ≈ 1 250 read units a search); past that it needs a name index or
 * OpenSearch (research R11 option A, needs the owner's approval by name).
 */
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import type { Store } from '../../../ddb/store.ts';
import type { CreatedShowRow } from '../search-local.ts';
import { allListeners, partitionItems } from './common.ts';

const unescapeLike = (s: string) => s.replace(/\\(.)/g, '$1');

/** Live Studio shows whose title contains the term, newest first (lane ST's live hosted shows). */
export async function createdShowsMatching(store: Store, _db: Db, escaped: string): Promise<CreatedShowRow[]> {
  const term = unescapeLike(escaped).toLowerCase();
  const { liveHostedShows } = await import('../../studio/ddb/hosted.ts');
  return (await liveHostedShows(store))
    .filter((s) => s.title.toLowerCase().includes(term))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, 10)
    .map((s) => ({ feed_url: s.feedUrl, title: s.title, author: s.author, cover_url: s.coverUrl, category: s.category }));
}

export async function peopleMatching(store: Store, _db: Db, like: string, viewer: string | null): Promise<{ id: string; display_name: string }[]> {
  const term = unescapeLike(like).toLowerCase();
  const blocked = new Set<string>();
  if (viewer) {
    for (const b of await partitionItems(store, K.L(viewer), { prefix: 'BLOCK' })) {
      const sk = String(b['SK']);
      if (sk.startsWith('BLOCK#')) blocked.add(sk.slice('BLOCK#'.length));
      else if (sk.startsWith('BLOCKEDBY#')) blocked.add(sk.slice('BLOCKEDBY#'.length));
    }
  }
  const hits = (await allListeners(store))
    .filter((l) => !l['suspendedAt'] && !l['hiddenAt'] && typeof l['displayName'] === 'string')
    .map((l) => ({ id: String(l['id']), display_name: String(l['displayName']), lower: String(l['displayName']).toLowerCase() }))
    .filter((l) => l.lower.includes(term) && (viewer === null || (l.id !== viewer && !blocked.has(l.id))));
  hits.sort((a, b) => {
    const pa = a.lower.startsWith(term) ? 0 : 1;
    const pb = b.lower.startsWith(term) ? 0 : 1;
    return pa - pb || (a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  return hits.slice(0, 20).map(({ id, display_name }) => ({ id, display_name }));
}
