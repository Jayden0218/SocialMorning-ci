// The whole episode catalogue for the lists that rank every episode (new shows, plaza, treasure hunt, video): one index Scan.
/**
 * M26 lane DV (data-model.md "Lane DV changes", DV-07/20/22/23). Four Discover lists rank EVERY episode the server
 * knows (the SQL read the whole `episodes` table each time). DynamoDB has no "all episodes" key, so:
 *
 * - The episode ids come from a Scan of the G2 index restricted to `SHEPS#…` (every episode META carries G2 — lane
 *   LB, keys.ts `G2eps`). The index holds only the projected attributes (keys, `t`, `title`, `durationMs` …), so
 *   this reads far less than the table. This folder is the only place a Scan may appear (test/ddb-lint.test.ts).
 * - The META items are then read by BatchGet — but only when the Scan's fingerprint (every key, publish date, title
 *   and length) changed, or the in-process copy is older than CATALOGUE_TTL. A new, removed, re-dated or renamed
 *   episode is therefore seen at once; a change the index does not carry (`mediaKind`, show title, cover) within
 *   CATALOGUE_TTL. The SQL saw both at once — the one behaviour change, recorded in data-model.md.
 * - Scale limit, stated: every call reads the G2 index once (≈ 150 bytes per episode, live subscription and tip:
 *   ≈ 2 MB ≈ 250 read units at 15 000 index entries). Past ≈ 50 000 episodes this should become a nightly
 *   catalogue document instead (the charts already cache 5 minutes).
 */
import { createHash } from 'node:crypto';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as K from '../db/ddb/keys.ts';
import { batchGetAll } from '../db/ddb/batch.ts';
import type { Item, Store } from '../db/ddb/store.ts';

export const CATALOGUE_TTL = 5 * 60_000;

export type IndexedEpisode = { id: string; feedKey: string; publishedAt: string | null };

/** One page-walk of the G2 index: every episode's id, show key and publish date. */
export async function scanEpisodeIndex(store: Store): Promise<{ episodes: IndexedEpisode[]; fingerprint: string }> {
  const out: IndexedEpisode[] = [];
  const lines: string[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = (await store.send(new ScanCommand({
      TableName: store.tables.main, IndexName: K.INDEX.G2,
      FilterExpression: 'begins_with(G2PK, :eps)', ExpressionAttributeValues: { ':eps': 'SHEPS#' },
      ...(start ? { ExclusiveStartKey: start } : {}),
    }))) as { Items?: Item[]; LastEvaluatedKey?: Record<string, unknown> };
    for (const i of page.Items ?? []) {
      const sk = String(i['G2SK']);
      const at = sk.slice(0, sk.indexOf('#'));
      const e = { id: String(i['PK']).slice('EP#'.length), feedKey: String(i['G2PK']).slice('SHEPS#'.length), publishedAt: at === K.NULL_LAST ? null : at };
      out.push(e);
      lines.push(`${String(i['PK'])}|${sk}|${String(i['title'] ?? '')}|${String(i['durationMs'] ?? '')}`);
    }
    start = page.LastEvaluatedKey;
  } while (start);
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { episodes: out, fingerprint: createHash('sha256').update(lines.sort().join('\n')).digest('hex') };
}

type Copy = { fingerprint: string; at: number; items: Item[] };
const copies = new Map<string, Copy>();

/** Every episode META item (in id order), from the in-process copy when the index is unchanged and the copy fresh. */
export async function catalogueItems(store: Store): Promise<Item[]> {
  const { episodes, fingerprint } = await scanEpisodeIndex(store);
  const now = store.clock.now();
  const have = copies.get(store.tables.main);
  if (have && have.fingerprint === fingerprint && now - have.at < CATALOGUE_TTL) return have.items;
  const items = await batchGetAll(store, 'main', episodes.map((e) => K.episode(e.id)), { consistent: false });
  items.sort((a, b) => (String(a['id']) < String(b['id']) ? -1 : String(a['id']) > String(b['id']) ? 1 : 0));
  copies.set(store.tables.main, { fingerprint, at: now, items });
  if (copies.size > 64) copies.delete(copies.keys().next().value!);
  return items;
}
