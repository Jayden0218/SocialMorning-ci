// "Up to N" lists over DynamoDB's 1 MB pages: keep querying until N items are found or the partition ends.
/**
 * M26 F0-06, FR-009, guard G-M26-2.
 *
 * "A single Query only returns a result set that fits within the 1 MB size limit" and "when you use a
 * FilterExpression, Query applies the 1 MB/Limit page cap to the items it reads before applying the filter, so
 * a page can return zero matching items and still include a LastEvaluatedKey. Keep issuing requests with the
 * returned LastEvaluatedKey until the response no longer contains one."
 * — https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.Pagination.html
 *
 * So no repo may treat one Query response as "the list". `queryAll` loops; when it stops at `max` in the
 * middle of a page, the resume key is built from the LAST RETURNED item (table key + index key), not the
 * page's LastEvaluatedKey — otherwise the items after it on that page would be skipped by the next page.
 * `keep` filters in code (block/mute/hidden — data-model.md §11) and the loop goes on until `max` kept items.
 */
import type { QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { INDEX_KEYS } from './keys.ts';
import { queryPage, type Item, type Store, type TableRole } from './store.ts';

export type QueryAllOptions = {
  /** Stop after this many (kept) items. Default: all. */
  max?: number;
  /** Code-side filter applied after any FilterExpression. */
  keep?: (item: Item) => boolean;
  /** Safety stop on requests per call (default 1000 pages ≈ 1 GB read). */
  maxPages?: number;
};

export type QueryAllResult = { items: Item[]; lastKey: Record<string, unknown> | undefined; pages: number };

/** The resume key of an item: the table key plus, for a GSI query, the index key attributes. */
export function resumeKeyOf(item: Item, indexName?: string): Record<string, unknown> {
  const key: Record<string, unknown> = { PK: item['PK'], SK: item['SK'] };
  if (indexName) {
    const attrs = INDEX_KEYS[indexName];
    if (!attrs) throw new Error(`paginate: unknown index ${indexName}`);
    for (const a of attrs) key[a] = item[a];
  }
  return key;
}

export async function queryAll(store: Store, table: TableRole, input: Omit<QueryCommandInput, 'TableName'>, opts: QueryAllOptions = {}): Promise<QueryAllResult> {
  const max = opts.max ?? Number.POSITIVE_INFINITY;
  const maxPages = opts.maxPages ?? 1000;
  const items: Item[] = [];
  let start = input.ExclusiveStartKey;
  let pages = 0;
  while (items.length < max) {
    if (pages >= maxPages) throw new Error(`paginate: more than ${maxPages} pages — use a job, not a request`);
    const out = await queryPage(store, table, { ...input, ...(start ? { ExclusiveStartKey: start } : {}) });
    pages++;
    const page = (out.Items ?? []) as Item[];
    for (let i = 0; i < page.length; i++) {
      const it = page[i]!;
      if (opts.keep && !opts.keep(it)) continue;
      items.push(it);
      if (items.length >= max) {
        // Stopped inside the page: resume after THIS item (unless it was the page's last and the page was the end).
        const atEnd = i === page.length - 1 && !out.LastEvaluatedKey;
        return { items, lastKey: atEnd ? undefined : resumeKeyOf(it, input.IndexName), pages };
      }
    }
    if (!out.LastEvaluatedKey) return { items, lastKey: undefined, pages };
    start = out.LastEvaluatedKey;
  }
  return { items, lastKey: start, pages };
}

/** Counts matching items over every page (Select COUNT still pages at 1 MB). */
export async function countAll(store: Store, table: TableRole, input: Omit<QueryCommandInput, 'TableName' | 'Select'>): Promise<number> {
  let n = 0;
  let start = input.ExclusiveStartKey;
  for (;;) {
    const out = await queryPage(store, table, { ...input, Select: 'COUNT', ...(start ? { ExclusiveStartKey: start } : {}) });
    n += out.Count ?? 0;
    if (!out.LastEvaluatedKey) return n;
    start = out.LastEvaluatedKey;
  }
}
