// Writes the default Academy/Help pages into DynamoDB when a kind has none there.
/**
 * A new environment (a dev or staging table set, a test's tables) starts with no pages. This writes the 14 defaults
 * (`../default-content.ts`), version 1. Idempotent: a kind that already has a page is left alone, so edits made in the
 * admin tool are never overwritten. On the data copy from the old database the real pages arrive instead.
 */
import { put, queryPage, type Store } from '../../../ddb/store.ts';
import * as K from '../../../ddb/keys.ts';
import { CONTENT_KINDS } from '../../config/content.ts';
import { DEFAULT_CONTENT } from '../default-content.ts';
import { pageItem } from './content.ts';

export async function seedDefaultContent(store: Store, at: Date = new Date()): Promise<number> {
  let written = 0;
  for (const kind of CONTENT_KINDS) {
    const have = await queryPage(store, 'main', {
      KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': K.contentPage(kind, 'x').PK }, Limit: 1, ConsistentRead: true,
    });
    if ((have.Items ?? []).length > 0) continue;
    for (const p of DEFAULT_CONTENT.filter((d) => d.kind === kind)) {
      await put(store, 'main', pageItem(p.kind, p.slug, { title: p.title, summary: p.summary, tag: p.tag, body: p.body, position: p.position, published: p.published }, 1, at.toISOString()));
      written++;
    }
  }
  return written;
}
