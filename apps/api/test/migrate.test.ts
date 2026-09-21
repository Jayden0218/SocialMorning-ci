import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { migrate } from '../src/db/migrate.ts';

test('migration 001 applies once and is idempotent', async () => {
  const t = await freshDb();
  const again = await migrate(t.runner);
  assert.deepEqual(again, [], 'second run applies nothing');
  const rows = await t.q<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
  assert.deepEqual(rows.map((r) => Number(r.version)), [1]);
  const tables = await t.q<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1",
  );
  assert.deepEqual(
    tables.map((r) => r.table_name),
    ['comments', 'episode_heat', 'episodes', 'listeners', 'positions', 'reactions', 'schema_migrations', 'sessions'],
  );
  await t.close();
});

test('comments.offset_ms exists in the first migration and is nullable', async () => {
  const t = await freshDb();
  const col = await t.q<{ is_nullable: string; data_type: string }>(
    "SELECT is_nullable, data_type FROM information_schema.columns WHERE table_name='comments' AND column_name='offset_ms'",
  );
  assert.deepEqual(col, [{ is_nullable: 'YES', data_type: 'integer' }]);
  await t.close();
});

test('reply depth trigger rejects a reply to a reply', async () => {
  const t = await freshDb();
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, enclosure_url) VALUES ('e1','f','g','t','u')");
  const [root] = await t.q<{ id: string }>("INSERT INTO comments (episode_id, body) VALUES ('e1','root') RETURNING id");
  const [reply] = await t.q<{ id: string }>("INSERT INTO comments (episode_id, body, parent_id) VALUES ('e1','reply',$1) RETURNING id", [root!.id]);
  await assert.rejects(
    t.q("INSERT INTO comments (episode_id, body, parent_id) VALUES ('e1','deeper',$1)", [reply!.id]),
    /reply_depth/,
  );
  await t.close();
});
