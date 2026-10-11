// The shows of a shared list on DynamoDB: lane ST's overrides first, else lane LB's show META, hidden shows left out.
/**
 * M26 lane DV (DV-96, lane ST's request: `show_overrides` is no longer in Postgres). In list order: the title and cover
 * the host set (lane ST's `overridesOf`), else the newest dated episode's (lane LB's show META `newestTitle` /
 * `newestImage` — the SQL's `ORDER BY published_at DESC NULLS LAST`); a show moderation hid is left out.
 * The `shared_lists` table itself is still Postgres (lane SF's moderation and lane AC's export read it there) — listed
 * for CUT.
 */
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import type { Store } from '../../../ddb/store.ts';
import { hiddenFeedUrls } from '../../safety/moderation.ts';
import type { SharedListShowRow } from '../../social/shared-lists.ts';

export async function sharedListShowRows(store: Store, db: Db, urls: string[]): Promise<SharedListShowRow[]> {
  if (urls.length === 0) return [];
  const { overridesOf } = await import('../../studio/ddb/page.ts');
  const uniq = [...new Set(urls)];
  const [hidden, over, metas] = await Promise.all([
    hiddenFeedUrls(db), overridesOf(store, uniq), batchGetAll(store, 'main', uniq.map((u) => K.show(u)), { consistent: false }),
  ]);
  const meta = new Map(metas.map((m) => [String(m['feedUrl']), m]));
  const s = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
  return urls.filter((u) => !hidden.has(u)).map((u) => {
    const o = over.get(u) as { title?: string | null; coverUrl?: string | null } | undefined;
    const m = meta.get(u);
    return { feed_url: u, title: s(o?.title) ?? s(m?.['newestTitle']), image_url: s(o?.coverUrl) ?? s(m?.['newestImage']) };
  });
}
