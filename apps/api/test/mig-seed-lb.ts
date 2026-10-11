// Lane LB's rows for the copy test: episodes and shows, subscriptions with their history, positions, listened ranges, library, rec events, the cache.
/**
 * M26 lane MIG (test/ddb-mig.test.ts). Plain SQL as years of production wrote it, on top of the base fixture and the
 * demo seed. Ids/devices carry `mig-lb` (lane digit 2). Every table of lane LB gets rows, with the edge cases
 * scripts/copy/lb.ts maps:
 * - episodes: a video episode with no show title and no cover; a new feed whose only episode has no date and no length
 *   (show META with `latestPublishedAt` null, no G3); a feed known only through subscriptions (META = the count).
 * - subscriptions: live, starred (with its stamp), a tombstone, a saved order that includes a tombstone, a private
 *   subscriber (dee) — each with the `subscription_events` the app writes on a live flip.
 * - positions: in progress, finished after an explicit seek, an episode with no length, an unregistered episode.
 * - listened_ranges: two devices on one day (the LDAY union), a private listener, an unregistered episode (no activity),
 *   with the `listened` activity row the app writes for a registered episode (ON CONFLICT DO NOTHING, as lanes SG/DV do).
 * - library_items: every kind, a fresh and a 40-day-old tombstone, a search key over 400 bytes (hashed sort key).
 * - rec_events: several channels/kinds over two hours, one 100 days old.
 * - cache: tint, Apple search, an old feed body (past the 7-day sweep), a Discover entry (generation prefix), the
 *   refund-check row, a publisher block marker, and a feed body whose gzip is over 350 KB (chunks).
 * No `episode_heat` (the test rebuilds it); reactions and comments are lane SC's and the demo seed's.
 */
import { createHash } from 'node:crypto';
import { episodeIdOf } from '../src/catalog/feed.ts';
import type { SeedBase } from './mig-seed-base.ts';

export const LB = {
  newFeed: 'https://feeds.example.com/mig-lb.xml',
  onlySubscribed: 'https://feeds.example.com/mig-lb-only.xml',
  oldFeed: 'https://feeds.example.com/mig-lb-old.xml',
  bigFeed: 'https://feeds.example.com/mig-lb-big.xml',
  blockedFeed: 'https://feeds.example.com/mig-lb-blocked.xml',
  unregistered: 'mig-lb-unregistered-episode',
} as const;

const HOUR = 3_600_000;

/** About 1 MB of hex that gzip cannot shrink below 350 KB (a sha256 chain: deterministic, incompressible-ish). */
function bigText(): string {
  const parts: string[] = [];
  let h = 'mig-lb';
  for (let i = 0; i < 16_000; i++) { h = createHash('sha256').update(h).digest('hex'); parts.push(h); }
  return parts.join('');
}

export async function seed(b: SeedBase): Promise<void> {
  const { pg, L } = b;
  const q = (sql: string, params: unknown[] = []) => pg.query(sql, params);
  const ep = (k: string) => b.ep(k).id;
  const dayOf = (d: Date) => d.toISOString().slice(0, 10);

  // ---- episodes ----
  const videoId = episodeIdOf(b.FEEDS.fresh, 'guid-mig-lb-video');
  const newId = episodeIdOf(LB.newFeed, 'guid-mig-lb-new');
  await q(
    `INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, image_url, duration_ms, published_at, genre_id, media_kind, first_seen_at, updated_at)
     VALUES ($1, $2, 'guid-mig-lb-video', 'A video interview', NULL, 'https://cdn.example.com/mig-lb-video.mp4', NULL, 1800000, $3, NULL, 'video', $4, $5),
            ($6, $7, 'guid-mig-lb-new', 'Pilot', 'MIG LB Show', 'https://cdn.example.com/mig-lb-new.mp3', 'https://img.example.com/mig-lb.jpg', NULL, NULL, 1301, 'audio', $8, $8)`,
    [videoId, b.FEEDS.fresh, b.ago(50), b.ago(49), b.ago(10), newId, LB.newFeed, b.ago(30)],
  );

  // ---- subscriptions + their history (a 'sub' at created_at; an 'unsub' at deleted_at for a tombstone) ----
  type S = [string, string, { created: number; deleted?: number; starred?: number; sortPos?: number }];
  const subs: S[] = [
    [L.alex, b.FEEDS.stoic, { created: 400, starred: 100, sortPos: 0 }],
    [L.alex, b.FEEDS.pi, { created: 380, sortPos: 1 }],
    [L.alex, b.FEEDS.bbc, { created: 300, deleted: 50, sortPos: 2 }],
    [L.alex, LB.newFeed, { created: 29 }],
    [L.bea, b.FEEDS.stoic, { created: 300, deleted: 20 }],
    [L.bea, LB.onlySubscribed, { created: 200 }],
    [L.cy, LB.onlySubscribed, { created: 150 }],
    [L.cy, b.FEEDS.daily, { created: 140 }],
    [L.dee, b.FEEDS.pi, { created: 120 }],
  ];
  for (const [who, feed, o] of subs) {
    await q(
      'INSERT INTO subscriptions (listener_id, feed_url, starred, created_at, deleted_at, starred_at, sort_pos) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [who, feed, o.starred !== undefined, b.ago(o.created), o.deleted !== undefined ? b.ago(o.deleted) : null, o.starred !== undefined ? b.ago(o.starred) : null, o.sortPos ?? null],
    );
    await q(`INSERT INTO subscription_events (listener_id, feed_url, kind, at) VALUES ($1, $2, 'sub', $3)`, [who, feed, b.ago(o.created)]);
    if (o.deleted !== undefined) await q(`INSERT INTO subscription_events (listener_id, feed_url, kind, at) VALUES ($1, $2, 'unsub', $3)`, [who, feed, b.ago(o.deleted)]);
  }

  // ---- positions ----
  const pos: [string, string, number, boolean, number, boolean, number][] = [
    [L.alex, ep('rocky'), 600_000, false, 5, false, 3],
    [L.bea, ep('phone'), 1_679_000, true, 9, true, 30],
    [L.cy, ep('daily2'), 120_000, false, 2, false, 4],
    [L.dee, LB.unregistered, 1_000, false, 1, false, 70],
  ];
  for (const [who, e, offset, finished, seq, seek, h] of pos) {
    await q(
      `INSERT INTO positions (listener_id, episode_id, offset_ms, finished, progress_seq, explicit_seek, device_id, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'mig-lb-phone', $7)`,
      [who, e, offset, finished, seq, seek, b.ago(h)],
    );
  }

  // ---- listened ranges (+ the `listened` activity row for a registered episode) ----
  const listen = async (who: string, e: string, hours: number, device: string, ranges: [number, number][], activity: boolean, hidden = false) => {
    const when = b.ago(hours);
    await q(`INSERT INTO listened_ranges (listener_id, episode_id, day, device_id, ranges, updated_at) VALUES ($1, $2, $3::date, $4, ($5::text)::jsonb, $6) ON CONFLICT DO NOTHING`,
      [who, e, dayOf(when), device, JSON.stringify(ranges), when]);
    if (activity) {
      await q(`INSERT INTO activity (actor_id, kind, episode_id, day, hidden, created_at) VALUES ($1, 'listened', $2, $3::date, $4, $5) ON CONFLICT DO NOTHING`,
        [who, e, dayOf(when), hidden, when]);
    }
  };
  // Two phones on one day, overlapping: the day's union is 1 200 000 ms, not the sum.
  await listen(L.alex, ep('rocky'), 3, 'mig-lb-a', [[0, 600_000], [900_000, 1_200_000]], true);
  await listen(L.alex, ep('rocky'), 3, 'mig-lb-b', [[500_000, 1_000_000]], true);
  await listen(L.alex, ep('bamboo'), 50, 'mig-lb-a', [[0, 240_000]], true);
  await listen(L.dee, ep('cycle'), 20, 'mig-lb-a', [[0, 300_000]], true, true);
  await listen(L.cy, LB.unregistered, 6, 'mig-lb-a', [[10_000, 70_000]], false);

  // ---- library ----
  const [comment] = await q('SELECT id::text AS id FROM comments ORDER BY id LIMIT 1') as { id: string }[];
  type Lib = [string, string, string, Record<string, unknown>, number, number | null];
  const lib: Lib[] = [
    [L.alex, 'fav_episode', ep('rocky'), {}, 10, null],
    ...(comment ? [[L.alex, 'fav_comment', comment.id, {}, 9, null] as Lib] : []),
    [L.alex, 'moment', `${ep('rocky')}#120000`, { episodeId: ep('rocky'), offsetMs: 120_000, note: 'Best line' }, 8, null],
    [L.alex, 'search', 'stoicism', {}, 5, null],
    [L.alex, 'search', 'old term', {}, 60, 48],
    [L.alex, 'search', 'ancient', {}, 1_000, 960],
    [L.alex, 'search', '播客'.repeat(150), {}, 4, null],
    [L.bea, 'fav_episode', ep('rules'), {}, 40, 30],
  ];
  for (const [who, kind, key, payload, upd, del] of lib) {
    await q('INSERT INTO library_items (listener_id, kind, item_key, payload, updated_at, deleted_at) VALUES ($1, $2, $3, ($4::text)::jsonb, $5, $6)',
      [who, kind, key, JSON.stringify(payload), b.ago(upd), del === null ? null : b.ago(del)]);
  }

  // ---- rec events ----
  const recs: [string, string, string, number, string, number][] = [
    [L.alex, ep('rocky'), 'sub-new', 0, 'impression', 2],
    [L.alex, ep('rocky'), 'sub-new', 0, 'open', 2],
    [L.alex, ep('tootle'), 'chart', 1, 'finish', 2],
    [L.alex, ep('phone'), 'showcf', 3, 'impression', 26],
    [L.alex, ep('bamboo'), 'pick', 0, 'play', 26],
    [L.bea, ep('rules'), 'social', 2, 'impression', 2_400],
  ];
  for (const [who, e, channel, rank, kind, h] of recs) {
    await q('INSERT INTO rec_events (listener_id, episode_id, channel, rank, kind, at) VALUES ($1, $2, $3, $4, $5, $6)', [who, e, channel, rank, kind, b.ago(h)]);
  }

  // ---- cache ----
  const cache: [string, unknown, number][] = [
    [`tint:https://img.example.com/rocky.jpg`, { hex: '#336699' }, 2],
    ['apple:search:mig lb', { results: [] }, 3],
    [`feed:${LB.oldFeed}`, { title: 'An old body', items: [] }, 216],
    ['discover:mig-lb-test', { rows: [1, 2, 3] }, 1],
    ['billing:voided', { lastCheckedToken: 'mig-lb' }, 6],
    [`feed-block:${LB.blockedFeed}`, {}, 12],
    [`feed:${LB.bigFeed}`, { title: 'A very long feed', items: [bigText()] }, 1],
  ];
  for (const [key, body, h] of cache) {
    await q('INSERT INTO cache (key, body, fetched_at) VALUES ($1, ($2::text)::jsonb, $3) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(body), new Date(b.now - h * HOUR)]);
  }
}
