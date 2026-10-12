// Copies the seeded Academy/Help rows (migration 029) from Postgres into DynamoDB when the pages are empty there.
/**
 * M26 lane SF. Migration 029 inserts the default Academy (5) and Help (9) pages into Postgres. On AWS the
 * one-time copy (lane MIG, MIG-01) carries them; a fresh test table set (TEST_BACKEND=ddb, test/harness.ts
 * `hybridDb`) starts empty, so this is the copy of the seeded rows for it. Idempotent: it writes nothing
 * when either kind already has a page on DynamoDB.
 */
import type { Db } from '../../../db.ts';
import { put, queryPage, type Store } from '../../../ddb/store.ts';
import * as K from '../../../ddb/keys.ts';
import { CONTENT_KINDS, type ContentKind } from '../../config/content.ts';
import { pageItem } from './content.ts';

type Row = { kind: ContentKind; slug: string; title: string; summary: string | null; tag: string | null; body: string; position: number; published: boolean; version: number; updated_at: Date | string };

export async function copyContentSeed(store: Store, pg: Db): Promise<number> {
  for (const kind of CONTENT_KINDS) {
    const out = await queryPage(store, 'main', {
      KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': K.contentPage(kind, 'x').PK }, Limit: 1, ConsistentRead: true,
    });
    if ((out.Items ?? []).length > 0) return 0;
  }
  const rows = await pg.query<Row>('SELECT kind, slug, title, summary, tag, body, position, published, version, updated_at FROM content_pages');
  for (const r of rows) {
    await put(store, 'main', pageItem(r.kind, r.slug, {
      title: r.title, summary: r.summary, tag: r.tag, body: r.body, position: Number(r.position), published: Boolean(r.published),
    }, Number(r.version), new Date(r.updated_at).toISOString()));
  }
  return rows.length;
}
