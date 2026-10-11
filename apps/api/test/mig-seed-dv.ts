// Lane DV's rows for the copy test: lists and their settings, picks, curation, settings, promotions, dismissals, search words, similarity, listens.
/**
 * M26 lane MIG (test/ddb-mig.test.ts), lane digit 8. Plain SQL on the migrated Postgres, after the base, the demo
 * seed and lanes AC…ST. Every table lane DV owns gets ≥ 2 rows (the singletons `discover_settings` and
 * `foryou_weights` can hold only one), with the edge cases scripts/copy/dv.ts handles: a chip-only list with a NULL
 * default tab, an expired timed pin, a comment pin, a retired issue / collection, NULL guids / whys / subtitles /
 * warnings / created_by, a retired promotion with counters, a signed-out and an old (dropped) search request, a
 * removed shared list, a half-built `show_similarity_next`, the legacy M15 tables, and `listened` activity rows
 * (hidden, and 40 days old) with their listened ranges.
 */
import type { SeedBase } from './mig-seed-base.ts';

const id8 = (n: number) => `00000008-0000-4000-8000-${String(n).padStart(12, '0')}`;

export async function seed(b: SeedBase): Promise<void> {
  const q = (sql: string, params: unknown[] = []) => b.pg.query(sql, params);
  const { L, FEEDS } = b;
  const dayAgo = (hours: number) => b.ago(hours).toISOString().slice(0, 10);

  // ---- similarity: the current table (4 rows) and a half-built buffer ----
  for (const [a, c, sim, h] of [
    [FEEDS.pi, FEEDS.stoic, 0.5, 3], [FEEDS.stoic, FEEDS.pi, 0.5, 3], [FEEDS.pi, FEEDS.bbc, 0.25, 3], [FEEDS.bbc, FEEDS.pi, 0.25, 2],
  ] as const) {
    await q('INSERT INTO show_similarity (show_a, show_b, sim, computed_at) VALUES ($1, $2, $3, $4)', [a, c, sim, b.ago(h)]);
  }
  for (const [a, c] of [[FEEDS.pi, FEEDS.daily], [FEEDS.daily, FEEDS.pi]] as const) {
    await q('INSERT INTO show_similarity_next (show_a, show_b, sim, computed_at) VALUES ($1, $2, 0.125, $3)', [a, c, b.ago(1)]);
  }

  // ---- picks: today (2 items, one with no guid and a warning) and an older day ----
  await q('INSERT INTO pick_days (day, version, updated_at, updated_by) VALUES ($1::date, 2, $2, $3)', [dayAgo(0), b.ago(1), L.alex]);
  await q('INSERT INTO pick_days (day, version, updated_at, updated_by) VALUES ($1::date, 1, $2, NULL)', [dayAgo(72), b.ago(80)]);
  await q('INSERT INTO pick_items (day, position, feed_url, guid, why, warning) VALUES ($1::date, 1, $2, $3, $4, NULL)', [dayAgo(0), FEEDS.pi, b.ep('rocky').guid, 'A statue with a story.']);
  await q('INSERT INTO pick_items (day, position, feed_url, guid, why, warning) VALUES ($1::date, 2, $2, NULL, $3, $4)', [dayAgo(0), FEEDS.stoic, 'The newest from this show.', 'Long episode']);
  await q('INSERT INTO pick_items (day, position, feed_url, guid, why, warning) VALUES ($1::date, 1, $2, $3, $4, NULL)', [dayAgo(72), FEEDS.bbc, b.ep('cycle').guid, 'Six minutes of English.']);

  // ---- curated issues: one live, one retired ----
  await q('INSERT INTO curated_issues (id, day, title, intro, retired_at, version, updated_at) VALUES ($1, $2::date, $3, $4, NULL, 3, $5)',
    ['mig-dv-weekly', dayAgo(24), 'This week', 'Three episodes worth your commute.', b.ago(20)]);
  await q('INSERT INTO curated_issues (id, day, title, intro, retired_at, version, updated_at) VALUES ($1, $2::date, $3, $4, $5, 2, $5)',
    ['mig-dv-old', dayAgo(400), 'Old issue', 'Retired, but kept.', b.ago(300)]);
  await q('INSERT INTO curated_issue_items (issue_id, position, feed_url, guid, note) VALUES ($1, 1, $2, $3, $4), ($1, 2, $5, NULL, $6)',
    ['mig-dv-weekly', FEEDS.pi, b.ep('bamboo').guid, 'Start with this one.', FEEDS.upfirst, 'Their newest, whatever it is.']);
  await q('INSERT INTO curated_issue_items (issue_id, position, feed_url, guid, note) VALUES ($1, 1, $2, $3, $4)',
    ['mig-dv-old', FEEDS.stoic, b.ep('rules').guid, 'Fifty rules.']);

  // ---- collections: one live with a subtitle, one retired without ----
  await q('INSERT INTO collections (id, title, subtitle, position, retired_at, version, updated_at) VALUES ($1, $2, $3, 1, NULL, 1, $4)',
    ['mig-dv-learn', 'Learn something', 'Short and clear', b.ago(50)]);
  await q('INSERT INTO collections (id, title, subtitle, position, retired_at, version, updated_at) VALUES ($1, $2, NULL, 2, $3, 2, $3)',
    ['mig-dv-gone', 'Gone now', b.ago(90)]);
  await q('INSERT INTO collection_items (collection_id, position, feed_url, guid, why) VALUES ($1, 1, $2, $3, $4), ($1, 2, $5, NULL, NULL)',
    ['mig-dv-learn', FEEDS.bbc, b.ep('apps').guid, 'Six minutes a day.', FEEDS.fresh]);
  await q('INSERT INTO collection_items (collection_id, position, feed_url, guid, why) VALUES ($1, 1, $2, NULL, $3)', ['mig-dv-gone', FEEDS.daily, 'News.']);

  // ---- Discover settings (singleton) and the legacy M15 tables (no code reads them) ----
  await q(`INSERT INTO discover_settings (id, section_order, hidden_sections, version) VALUES (1, $1::text[], $2::text[], 4)`,
    [['picks', 'chart', 'collections', 'forYou'], ['hunt']]);
  await q('INSERT INTO trending_pins (position, feed_url, guid) VALUES (1, $1, $2), (2, $3, NULL)', [FEEDS.pi, b.ep('rocky').guid, FEEDS.stoic]);
  await q('INSERT INTO trending_hides (feed_url, guid) VALUES ($1, $2), ($3, $4)', [FEEDS.bbc, b.ep('emails').guid, FEEDS.daily, b.ep('daily2').guid]);
  await q('INSERT INTO category_features (genre_id, position, feed_url) VALUES (1301, 1, $1), (1304, 1, $2)', [FEEDS.pi, FEEDS.stoic]);

  // ---- promotions: one live, one retired with counters ----
  await q(`INSERT INTO promotions (id, image_url, image_path, image_bytes, target_kind, target, label, starts_at, ends_at, weight, daily_cap, impressions, taps, retired_at, created_at)
           VALUES ($1, 'https://img.example.com/promo1.png', 'promos/promo1.png', 120000, 'route', '/discover', 'Promotion', $2, $3, 3, 2, 41, 5, NULL, $4)`,
    [id8(1), b.ago(48), b.ago(-240), b.ago(50)]);
  await q(`INSERT INTO promotions (id, image_url, image_path, image_bytes, target_kind, target, label, starts_at, ends_at, weight, daily_cap, impressions, taps, retired_at, created_at)
           VALUES ($1, 'https://img.example.com/promo2.png', 'promos/promo2.png', 64000, 'url', 'https://example.com/old', 'Old one', $2, $3, 1, 1, 9000, 312, $4, $5)`,
    [id8(2), b.ago(900), b.ago(700), b.ago(800), b.ago(901)]);

  // ---- "not interested" (episode and show) ----
  await q('INSERT INTO rec_dismissals (listener_id, kind, item_key, created_at) VALUES ($1, $2, $3, $4)', [L.bea, 'episode', b.ep('joy').id, b.ago(30)]);
  await q('INSERT INTO rec_dismissals (listener_id, kind, item_key, created_at) VALUES ($1, $2, $3, $4)', [L.bea, 'show', FEEDS.fresh, b.ago(20)]);
  await q('INSERT INTO rec_dismissals (listener_id, kind, item_key, created_at) VALUES ($1, $2, $3, $4)', [L.cy, 'show', FEEDS.daily, b.ago(500)]);

  // ---- search words: a listener today, signed-out today, a listener 30 days ago, and one past 91 days (dropped) ----
  await q('INSERT INTO search_requests (id, listener_id, q, created_at) VALUES ($1, $2, $3, $4)', [id8(11), L.eli, 'Radiolab', b.ago(3)]);
  await q('INSERT INTO search_requests (id, listener_id, q, created_at) VALUES ($1, NULL, $2, $3)', [id8(12), 'Café Talks', b.ago(5)]);
  await q('INSERT INTO search_requests (id, listener_id, q, created_at) VALUES ($1, $2, $3, $4)', [id8(13), L.fay, 'radiolab', b.ago(24 * 30)]);
  await q('INSERT INTO search_requests (id, listener_id, q, created_at) VALUES ($1, $2, $3, $4)', [id8(14), L.gus, 'ancient words', b.ago(24 * 100)]);

  // ---- shared lists (still Postgres; skipped by the copy): one live, one removed ----
  await q('INSERT INTO shared_lists (id, owner_id, title, feed_urls, created_at, removed_at) VALUES ($1, $2, $3, $4::text[], $5, NULL)',
    ['migdv00001', L.bea, 'Bea’s favourites', [FEEDS.pi, FEEDS.stoic, FEEDS.bbc], b.ago(100)]);
  await q('INSERT INTO shared_lists (id, owner_id, title, feed_urls, created_at, removed_at) VALUES ($1, $2, $3, $4::text[], $5, $6)',
    ['migdv00002', L.cy, 'Removed list', [FEEDS.daily, FEEDS.upfirst], b.ago(200), b.ago(150)]);

  // ---- lists: trending (pin + hide), a category with a chip, a chip-only category (NULL tab), a comment pin, an expired timed pin ----
  const ins = (listId: string, kind: string, o: { feed?: string; guid?: string | null; comment?: string; pos?: number | null; from?: Date | null; to?: Date | null; note?: string | null; by?: string | null; at: Date }) =>
    q(`INSERT INTO list_overrides (list_id, kind, feed_url, guid, comment_id, position, starts_at, ends_at, note, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [listId, kind, o.feed ?? null, o.guid ?? null, o.comment ?? null, o.pos ?? null, o.from ?? null, o.to ?? null, o.note ?? null, o.by ?? null, o.at]);
  await ins('trending', 'pin', { feed: FEEDS.pi, guid: b.ep('tootle').guid, pos: 1, by: L.alex, at: b.ago(10) });
  await ins('trending', 'hide', { feed: FEEDS.bbc, guid: b.ep('smells').guid, note: 'Duplicate upload', by: L.alex, at: b.ago(9) });
  await ins('category:1301', 'pin', { feed: FEEDS.pi, pos: 1, at: b.ago(200) });
  await ins('hunt', 'pin', { feed: FEEDS.stoic, guid: b.ep('wisdom').guid, pos: 1, from: b.ago(240), to: b.ago(120), note: 'Last week only', by: L.alex, at: b.ago(241) });
  const [c] = await b.pg.query<{ id: string }>('SELECT id::text AS id FROM comments ORDER BY created_at, id LIMIT 1');
  if (c) await ins('said', 'pin', { comment: c.id, pos: 1, by: L.alex, at: b.ago(8) });
  await q(`INSERT INTO list_settings (list_id, default_tab, updated_at) VALUES ('category:1301', 'newest', $1), ('category:1304', NULL, $2)`, [b.ago(150), b.ago(140)]);

  // ---- For You rules and weights ----
  await q('INSERT INTO foryou_rules (feed_url, rule, note, created_by, created_at) VALUES ($1, $2, $3, $4, $5)', [FEEDS.bbc, 'boost', 'Short and good', L.alex, b.ago(60)]);
  await q('INSERT INTO foryou_rules (feed_url, rule, note, created_by, created_at) VALUES ($1, $2, NULL, NULL, $3)', [FEEDS.fresh, 'never', b.ago(70)]);
  await q(`INSERT INTO foryou_weights (id, weights, version, updated_at) VALUES (1, $1::jsonb, 2, $2)`,
    [JSON.stringify({ affinity: 1.5, social: 0.8, freshness: 1, quality: 1.2, fatigue: 0.5 }), b.ago(30)]);

  // ---- `listened` activity rows (the listen index): a hidden one (dee listens privately) and a 40-day-old one, with their ranges ----
  for (const [who, key, hours, hidden] of [['dee', 'phone', 6, true], ['cy', 'fresh1', 24 * 40, false]] as const) {
    const e = b.ep(key);
    const at = b.ago(hours);
    const day = at.toISOString().slice(0, 10);
    await q(`INSERT INTO listened_ranges (listener_id, episode_id, day, device_id, ranges, updated_at) VALUES ($1, $2, $3::date, 'mig-dv', $4::jsonb, $5) ON CONFLICT DO NOTHING`,
      [L[who], e.id, day, JSON.stringify([[0, Math.min(e.durationMs ?? 600_000, 600_000)]]), at]);
    await q(`INSERT INTO activity (actor_id, kind, episode_id, day, hidden, created_at) VALUES ($1, 'listened', $2, $3::date, $4, $5) ON CONFLICT DO NOTHING`,
      [L[who], e.id, day, hidden, at]);
  }
}
