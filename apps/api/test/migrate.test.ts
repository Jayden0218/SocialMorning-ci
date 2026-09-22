import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { migrate } from '../src/db/migrate.ts';

test('migrations 001–004 apply once and are idempotent', async () => {
  const t = await freshDb();
  const again = await migrate(t.runner);
  assert.deepEqual(again, [], 'second run applies nothing');
  const rows = await t.q<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
  assert.deepEqual(rows.map((r) => Number(r.version)), [1, 2, 3, 4]);
  const tables = await t.q<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1",
  );
  assert.deepEqual(
    tables.map((r) => r.table_name),
    ['activity', 'blocks', 'cache', 'clips', 'comments', 'episode_heat', 'episodes', 'follows', 'hidden_feeds', 'listened_ranges', 'listeners', 'moderation_actions', 'positions', 'reactions', 'reports', 'schema_migrations', 'sessions'],
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

test('002: the constraints that are guards exist — clip length, self-follow, one listened item per day', async () => {
  const t = await freshDb();
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, enclosure_url) VALUES ('e1','f','g','t','u')");
  const [a] = await t.q<{ id: string }>("INSERT INTO listeners (email, password_hash, display_name) VALUES ('a@x','h','A') RETURNING id");
  await assert.rejects(t.q("INSERT INTO clips (author_id, client_id, episode_id, start_ms, end_ms) VALUES ($1,'c','e1',0,500)", [a!.id]), /check/i);
  await assert.rejects(t.q("INSERT INTO clips (author_id, client_id, episode_id, start_ms, end_ms) VALUES ($1,'c','e1',0,600001)", [a!.id]), /check/i);
  await t.q("INSERT INTO clips (author_id, client_id, episode_id, start_ms, end_ms) VALUES ($1,'c','e1',0,600000)", [a!.id]);
  await assert.rejects(t.q("INSERT INTO follows (follower_id, followed_id) VALUES ($1,$1)", [a!.id]), /check/i);
  await t.q("INSERT INTO activity (actor_id, kind, episode_id, day) VALUES ($1,'listened','e1','2026-09-21')", [a!.id]);
  await assert.rejects(t.q("INSERT INTO activity (actor_id, kind, episode_id, day) VALUES ($1,'listened','e1','2026-09-21')", [a!.id]), /unique|duplicate/i);
  // Many clips on one episode: day is NULL for clipped rows, and NULLs are distinct.
  await t.q("INSERT INTO activity (actor_id, kind, episode_id) VALUES ($1,'clipped','e1')", [a!.id]);
  await t.q("INSERT INTO activity (actor_id, kind, episode_id) VALUES ($1,'clipped','e1')", [a!.id]);
  const [priv] = await t.q<{ private_listening: boolean }>('SELECT private_listening FROM listeners WHERE id=$1', [a!.id]);
  assert.equal(priv!.private_listening, false);
  await t.close();
});
