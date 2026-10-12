// Lane SG's rows for the copy test: follows, activity (with its listened ranges), mutes, notices, muted threads, system notices, playlists, live listeners.
/**
 * M26 lane MIG (test/ddb-mig.test.ts). Plain SQL on the old schema, on top of the base fixture and the demo seed.
 * Edge cases the copy maps (scripts/copy/sg.ts):
 * - a hidden `listened` row (private listening: no feed pointer, no friends-listening item), a listened range with no
 *   activity (a short listen: friends listening only), two days of one episode (the latest wins), a listen 10 days old
 *   (feed yes, friends listening no), and a listened row 90 days old by an account nobody here follows (past the
 *   60-day inbox TTL: no pointer — so the Following feed still answers the same on both stores);
 * - `commented` / `clipped` rows with a ref (the `U#ACTREF` item) when a comment / clip without activity exists;
 * - notices of dedupe and non-dedupe kinds, an empty ref; a broadcast and a personal system notice, NULL link and
 *   NULL creator; a public playlist with items, a private empty one, a deleted tombstone; live listeners seen 20 s and
 *   40 s ago and one 20 minutes ago (dropped: the next heartbeat deletes it).
 * Ids: `00000004-0000-4000-8000-0000000000XX` (lane digit 4).
 */
import type { SeedBase } from './mig-seed-base.ts';

const id = (n: number) => `00000004-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const hash = (c: string) => c.repeat(64);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

export async function seed(b: SeedBase): Promise<void> {
  const { pg, L, ago } = b;
  const q = (sql: string, params: unknown[] = []) => pg.query(sql, params);

  // ---- follows (no one here follows gus: his old row stays out of every feed) ----
  const follows: [keyof typeof L, keyof typeof L, number][] = [
    ['alex', 'bea', 400], ['bea', 'alex', 390], ['cy', 'bea', 300], ['dee', 'bea', 250], ['eli', 'cy', 200],
    ['fay', 'alex', 150], ['bea', 'cy', 100], ['alex', 'dee', 50], ['fay', 'eli', 3],
  ];
  for (const [a, c, h] of follows) {
    await q('INSERT INTO follows (follower_id, followed_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [L[a], L[c], ago(h)]);
  }

  // ---- listens: a listened range and (over the threshold) its once-a-day activity row ----
  const listen = async (who: keyof typeof L, ep: string, hours: number, activity: boolean, hidden = false) => {
    const when = ago(hours);
    const day = dayOf(when);
    await q(`INSERT INTO listened_ranges (listener_id, episode_id, day, device_id, ranges, updated_at) VALUES ($1, $2, $3, 'mig-sg', ($4::text)::jsonb, $5)
             ON CONFLICT DO NOTHING`, [L[who], b.ep(ep).id, day, JSON.stringify([[0, 600_000]]), when]);
    if (activity) {
      await q(`INSERT INTO activity (actor_id, kind, episode_id, day, hidden, created_at) VALUES ($1, 'listened', $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [L[who], b.ep(ep).id, day, hidden, when]);
    }
  };
  await listen('bea', 'rocky', 50, true); // an earlier day of the same episode
  await listen('bea', 'rocky', 2, true); // the latest: friends listening shows this one
  await listen('bea', 'phone', 30, true);
  await listen('cy', 'smells', 5, false); // a short listen: friends listening, no feed row
  await listen('cy', 'cycle', 240, true); // 10 days: in the feed, not in friends listening
  await listen('dee', 'apps', 3, true, true); // private listening: written hidden
  await listen('gus', 'rules', 2160, true); // 90 days, followed by nobody here

  // ---- a commented and a clipped row for a comment / clip that has none yet (the demo seed made the rest) ----
  const [c] = await pg.query<{ id: string; episode_id: string; author_id: string; offset_ms: number | null; created_at: Date }>(
    `SELECT c.id::text AS id, c.episode_id, c.author_id::text AS author_id, c.offset_ms, c.created_at FROM comments c
      WHERE c.author_id IS NOT NULL AND c.parent_id IS NULL AND c.deleted_at IS NULL AND c.removed_at IS NULL
        AND c.episode_id IN (SELECT id FROM episodes)
        AND NOT EXISTS (SELECT 1 FROM activity a WHERE a.kind = 'commented' AND a.ref_id = c.id)
      ORDER BY c.id LIMIT 1`);
  if (c) {
    await q(`INSERT INTO activity (actor_id, kind, episode_id, moment_ms, ref_id, hidden, created_at) VALUES ($1, 'commented', $2, $3, $4, false, $5)`,
      [c.author_id, c.episode_id, c.offset_ms, c.id, c.created_at]);
  }
  const [k] = await pg.query<{ id: string; episode_id: string; author_id: string; start_ms: number; created_at: Date }>(
    `SELECT k.id::text AS id, k.episode_id, k.author_id::text AS author_id, k.start_ms, k.created_at FROM clips k
      WHERE k.author_id IS NOT NULL AND k.deleted_at IS NULL AND k.episode_id IN (SELECT id FROM episodes)
        AND NOT EXISTS (SELECT 1 FROM activity a WHERE a.kind = 'clipped' AND a.ref_id = k.id)
      ORDER BY k.id LIMIT 1`);
  if (k) {
    await q(`INSERT INTO activity (actor_id, kind, episode_id, moment_ms, ref_id, hidden, created_at) VALUES ($1, 'clipped', $2, $3, $4, false, $5)`,
      [k.author_id, k.episode_id, k.start_ms, k.id, k.created_at]);
  }

  // ---- mutes and muted threads ----
  await q('INSERT INTO listener_mutes (muter_id, muted_id, created_at) VALUES ($1, $2, $3), ($4, $5, $6)', [L.fay, L.eli, ago(20), L.alex, L.hal, ago(500)]);
  await q('INSERT INTO muted_threads (listener_id, thread_kind, thread_key, created_at) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)', [
    L.fay, 'comment', id(0x90), ago(12),
    L.bea, 'like_post', `${L.bea}:${b.ep('rocky').id}`, ago(6),
  ]);

  // ---- notifications (fay is muting eli: the follow notice is stored but not listed) ----
  const rocky = b.ep('rocky').id;
  const notes: [number, keyof typeof L, keyof typeof L, string, Record<string, string>, number][] = [
    [0x10, 'bea', 'alex', 'follow', {}, 400],
    [0x11, 'alex', 'bea', 'follow', {}, 390],
    [0x12, 'bea', 'cy', 'like', { commentId: id(0x91), episodeId: rocky }, 40],
    [0x13, 'bea', 'cy', 'reply', { commentId: id(0x92), parentId: id(0x91), episodeId: rocky }, 30],
    [0x14, 'alex', 'eli', 'mention', { commentId: id(0x93), episodeId: rocky }, 8],
    [0x15, 'cy', 'bea', 'status_reaction', { postId: id(0x94) }, 4],
    [0x16, 'fay', 'eli', 'follow', {}, 3],
  ];
  for (const [n, to, from, kind, ref, h] of notes) {
    await q('INSERT INTO notifications (id, recipient_id, actor_id, kind, ref, created_at) VALUES ($1, $2, $3, $4, ($5::text)::jsonb, $6)',
      [id(n), L[to], L[from], kind, JSON.stringify(ref), ago(h)]);
  }

  // ---- system notices ----
  await q(`INSERT INTO system_notices (id, listener_id, title, body, link_label, link_route, push, created_at, created_by) VALUES
      ($1, NULL, 'New in SocialMorning', 'Playlists are here.', 'Open', '/playlists', true, $2, $3),
      ($4, $5, 'About your report', 'We looked at it and took the comment down.', NULL, NULL, false, $6, NULL),
      ($7, NULL, 'Maintenance tonight', 'A short pause at 02:00 UTC.', NULL, NULL, false, $8, $3)`,
  [id(0x20), ago(72), L.alex, id(0x21), L.bea, ago(10), id(0x22), ago(30)]);

  // ---- playlists: public with items, private empty, deleted (its items went with the delete) ----
  await q(`INSERT INTO playlists (id, owner_id, title, is_public, created_at, updated_at, deleted_at) VALUES
      ($1, $2, 'Morning walk', true, $3, $4, NULL),
      ($5, $6, 'Later', false, $7, $7, NULL),
      ($8, $9, 'Old list', false, $10, $11, $11)`,
  [id(0x30), L.alex, ago(100), ago(5), id(0x31), L.bea, ago(60), id(0x32), L.cy, ago(300), ago(200)]);
  const items: [string, number, number][] = [['phone', 0, 90], ['rocky', 1, 80], ['rules', 2, 5]];
  for (const [ep, position, h] of items) {
    await q('INSERT INTO playlist_items (playlist_id, episode_id, position, added_at) VALUES ($1, $2, $3, $4)', [id(0x30), b.ep(ep).id, position, ago(h)]);
  }

  // ---- live listeners (hours → seconds: 20 s, 40 s, 20 min) ----
  const secs = (n: number) => new Date(b.now - n * 1000);
  await q('INSERT INTO live_listeners (episode_id, listener_hash, seen_at) VALUES ($1, $2, $3), ($1, $4, $5), ($6, $7, $8)', [
    rocky, hash('a'), secs(20), hash('b'), secs(40), b.ep('cycle').id, hash('c'), secs(1200),
  ]);
}
