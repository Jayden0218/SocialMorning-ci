// Tests that migrations apply once and their key database rules exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { migrate } from '../src/db/migrate.ts';

test('migrations 001–011 apply once and are idempotent', async () => {
  const t = await freshDb();
  const again = await migrate(t.runner);
  assert.deepEqual(again, [], 'second run applies nothing');
  const rows = await t.q<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
  assert.deepEqual(rows.map((r) => Number(r.version)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28]);
  const tables = await t.q<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1",
  );
  assert.deepEqual(
    tables.map((r) => r.table_name),
    ['account_deletions', 'activity', 'admin_audit', 'admins', 'announcements', 'app_settings', 'appeals', 'blocked_words', 'blocks', 'cache', 'category_features', 'chat_messages', 'clips', 'collection_items', 'collections', 'comment_likes', 'comment_policy', 'comment_unfriendly', 'comments', 'creator_claims', 'curated_issue_items', 'curated_issues', 'daily_active', 'discover_settings', 'email_changes', 'email_codes', 'entitlements', 'episode_heat', 'episode_likes', 'episodes', 'error_reports', 'feed_sync', 'feedback', 'feedback_images', 'follows', 'foryou_rules', 'foryou_weights', 'gifts', 'groq_usage', 'held_comments', 'hidden_episodes', 'hidden_feeds', 'host_picks', 'hosted_episodes', 'hosted_shows', 'library_items', 'like_comments', 'like_reactions', 'list_overrides', 'list_settings', 'listened_ranges', 'listener_identities', 'listener_interests', 'listener_mutes', 'listeners', 'live_listeners', 'milestones_sent', 'moderation_actions', 'muted_threads', 'notifications', 'notify_show_prefs', 'pick_days', 'pick_items', 'playlist_items', 'playlists', 'poll_options', 'poll_votes', 'polls', 'positions', 'promotions', 'purchases', 'push_like_windows', 'push_prefs', 'push_sent', 'push_tokens', 'queues', 'rate_counters', 'reactions', 'rec_dismissals', 'rec_events', 'rec_feedback', 'redeem_codes', 'redeem_uses', 'reports', 'schema_migrations', 'search_requests', 'sessions', 'share_events', 'shared_lists', 'show_curators', 'show_hosts', 'show_invites', 'show_members', 'show_mutes', 'show_overrides', 'show_similarity', 'show_similarity_next', 'status_items', 'status_push_log', 'status_reactions', 'status_replies', 'status_suggestion_mutes', 'sticker_placements', 'subscription_events', 'subscriptions', 'system_notices', 'tips', 'transcripts_translated', 'translation_jobs', 'translation_shows', 'trending_hides', 'trending_pins', 'voice_posts', 'weekly_digests'],
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
