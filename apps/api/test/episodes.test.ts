import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { upsertEpisode, getEpisode } from '../src/db/repos/episodes.ts';

const base = { id: 'ep1', feedUrl: 'https://f/x.xml', guid: 'g1', title: 'One', enclosureUrl: 'https://cdn/1.mp3' };

test('second upsert fills a NULL duration and does not overwrite a known one', async () => {
  const t = await freshDb();
  const db = t.db;
  const first = await upsertEpisode(db, base);
  assert.equal(first.duration_ms, null);
  const second = await upsertEpisode(db, { ...base, title: 'One (renamed)', durationMs: 2_899_000 });
  assert.equal(second.duration_ms, 2_899_000);
  assert.equal(second.title, 'One (renamed)');
  const third = await upsertEpisode(db, { ...base, durationMs: 1 });
  assert.equal(third.duration_ms, 2_899_000, 'a known duration is kept');
  assert.equal((await getEpisode(db, 'ep1'))?.duration_ms, 2_899_000);
  await t.close();
});
