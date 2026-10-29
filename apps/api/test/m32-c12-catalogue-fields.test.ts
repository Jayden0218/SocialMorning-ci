// Tests M32 T048 (review finding C12): the in-memory catalogue copy holds only the fields its callers read.
/** Guard — the break that turns it red: return the whole META items from `catalogueItems` again (drop the pick). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { seedEpisode, daysAgo } from './dv-neutral.ts';
import { catalogueItems } from '../src/jobs/charts.ts';
import { epRowOf } from '../src/db/repos/discover/ddb/common.ts';
import { update } from '../src/db/ddb/store.ts';
import * as K from '../src/db/ddb/keys.ts';

test('C12: catalogueItems keeps only the fields epRowOf reads; the rows built from them are unchanged', async () => {
  const t = await freshDb({});
  try {
    await seedEpisode(t, { id: 'e1', feedUrl: 'https://f.example/1.xml', guid: 'g1', title: 'One', showTitle: 'S', imageUrl: 'https://i/1.jpg', durationMs: 5000, genreId: 3, publishedAt: daysAgo(1) });
    await update(t.store, 'main', K.episode('e1'), { update: 'SET #n = :n, #d = :d', names: { '#n': 'showNotes', '#d': 'descriptionHtml' }, values: { ':n': 'x'.repeat(5000), ':d': '<p>big</p>' } });
    const [item] = await catalogueItems(t.store);
    assert.ok(item);
    assert.deepEqual(Object.keys(item).filter((k) => !['id', 'feedUrl', 'guid', 'title', 'showTitle', 'imageUrl', 'durationMs', 'enclosureUrl', 'publishedAt', 'genreId', 'mediaKind', 'firstSeenAt', 'updatedAt'].includes(k)), [], 'no field the callers do not read');
    const row = epRowOf(item);
    assert.equal(row.id, 'e1'); assert.equal(row.title, 'One'); assert.equal(row.show_title, 'S'); assert.equal(row.duration_ms, 5000);
    assert.equal(row.genre_id, 3); assert.equal(row.image_url, 'https://i/1.jpg'); assert.ok(row.published_at); assert.ok(row.first_seen_at);
  } finally { await t.close(); }
});
