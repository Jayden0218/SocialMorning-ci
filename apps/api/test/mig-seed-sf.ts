// Lane SF's rows for the copy test: reports open/closed/anonymous/old, actions of every kind, blocks, hides, appeals, admin, config, translation.
/**
 * M26 lane MIG (test/ddb-mig.test.ts). Plain SQL on the Postgres made by every migration, after the base, the demo
 * seed and lanes AC…PD. Ids: `00000006-0000-4000-8000-0000000000XX` (lane digit 6). Kept consistent the way the app
 * keeps it: a `remove` has its comment's `removed_at` and the author's notice; a suspension has the listener's
 * `suspended_at` (base: hal); a hide has its `hidden_feeds` row, an unhide none; blocked pairs have no follows; the
 * maintenance switch is stored but already over (the API must answer during diff-listeners).
 */
import type { SeedBase } from './mig-seed-base.ts';

const id = (n: number) => `00000006-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const j = (v: unknown) => JSON.stringify(v);

export async function seed(b: SeedBase): Promise<void> {
  const { pg, L, ago, FEEDS } = b;
  const q = (sql: string, params: unknown[] = []) => pg.query(sql, params);
  const rocky = b.ep('rocky');

  // ---- two comments of our own: one removed by moderation, one reply hidden by a host and shown again
  const c1 = id(0x01);
  const c2 = id(0x02);
  await q(`INSERT INTO comments (id, episode_id, author_id, body, offset_ms, created_at, removed_at) VALUES ($1, $2, $3, $4, 60000, $5, $6)`,
    [c1, rocky.id, L.eli, 'Cheap followers at spam.example — click now', ago(22), ago(20)]);
  await q(`INSERT INTO comments (id, episode_id, author_id, parent_id, body, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [c2, rocky.id, L.fay, c1, 'Please do not post links like this.', ago(21)]);
  await q(`INSERT INTO system_notices (id, listener_id, title, body, link_label, link_route, push, created_at) VALUES ($1, $2, $3, $4, 'Appeal', '/appeal', false, $5)`,
    [id(0x03), L.eli, 'Your comment was removed', 'A comment you posted broke the community rules, so it was removed. If you think this is a mistake, you can appeal once.', ago(20)]);

  // ---- moderation actions (alex is the admin; bea hosts the show for the host hide)
  const A = { remove: id(0x10), dismiss: id(0x11), suspend: id(0x12), hide: id(0x13), hideOld: id(0x14), unhide: id(0x15), hostHide: id(0x16), hostUnhide: id(0x17), oldRemove: id(0x18) };
  const acts: [string, string, string, string, string, Date][] = [
    [A.remove, L.alex, 'remove', 'comment', c1, ago(20)],
    [A.dismiss, L.alex, 'dismiss', 'profile', L.gus, ago(40)],
    [A.suspend, L.alex, 'suspend', 'profile', L.hal, ago(30)],
    [A.hide, L.alex, 'hide_show', 'show', FEEDS.fresh, ago(50)],
    [A.hideOld, L.alex, 'hide_show', 'show', FEEDS.upfirst, ago(70)],
    [A.unhide, L.alex, 'unhide_show', 'show', FEEDS.upfirst, ago(60)],
    [A.hostHide, L.bea, 'host_hide', 'comment', c2, ago(10)],
    [A.hostUnhide, L.bea, 'host_unhide', 'comment', c2, ago(9)],
    // older than the 90-day report copy: its reports were purged, so it has no snapshot
    [A.oldRemove, L.alex, 'remove', 'clip', id(0x19), ago(2400)],
  ];
  for (const a of acts) await q('INSERT INTO moderation_actions (id, actor_id, action, target_kind, target_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)', a);
  await q('INSERT INTO hidden_feeds (feed_url, action_id, hidden_at, reason) VALUES ($1, $2, $3, $4)', [FEEDS.fresh, A.hide, ago(50), 'Copied content from another show']);
  // A publisher's itunes:block marker (lane LB's cache table) — its hidden-feeds copy is lane SF's.
  await q(`INSERT INTO cache (key, body, fetched_at) VALUES ($1, '{}'::jsonb, $2) ON CONFLICT (key) DO NOTHING`, [`feed-block:${FEEDS.daily}`, ago(6)]);

  // ---- reports
  const commentCopy = { kind: 'comment', id: c1, body: 'Cheap followers at spam.example — click now', offsetMs: 60000, authorId: L.eli, authorName: 'Eli Commuter', episodeId: rocky.id, episodeTitle: rocky.title };
  type R = { n: number; kind: string; target: string; by: string | null; reason: string; note?: string; snap: unknown; detail?: unknown; at: Date; closedAt?: Date; closedBy?: string; why?: string };
  const reports: R[] = [
    { n: 0x20, kind: 'comment', target: c1, by: L.bea, reason: 'spam', snap: commentCopy, at: ago(21), closedAt: ago(20), closedBy: A.remove, why: 'remove' },
    { n: 0x21, kind: 'comment', target: c1, by: L.cy, reason: 'spam', note: 'Same link again.', snap: commentCopy, at: ago(20.5), closedAt: ago(20), closedBy: A.remove, why: 'remove' },
    { n: 0x22, kind: 'profile', target: L.gus, by: L.dee, reason: 'harassment', snap: { kind: 'profile', id: L.gus, displayName: 'Gus Walks' }, at: ago(41), closedAt: ago(40), closedBy: A.dismiss, why: 'dismiss' },
    // the reporter deleted their account: reporter_id NULL (ON DELETE SET NULL)
    { n: 0x23, kind: 'profile', target: L.hal, by: null, reason: 'hate', snap: { kind: 'profile', id: L.hal, displayName: 'Hal Suspended' }, at: ago(31), closedAt: ago(30), closedBy: A.suspend, why: 'suspend' },
    { n: 0x24, kind: 'show', target: FEEDS.pi, by: L.fay, reason: 'spam', note: 'Looks like ads only.', snap: { kind: 'show', id: FEEDS.pi, feedUrl: FEEDS.pi, showTitle: 'Show pi' }, at: ago(3) },
    { n: 0x25, kind: 'show', target: FEEDS.fresh, by: L.gus, reason: 'illegal', snap: { kind: 'show', id: FEEDS.fresh, feedUrl: FEEDS.fresh, showTitle: 'Show fresh' }, at: ago(52), closedAt: ago(50), closedBy: A.hide, why: 'hide_show' },
    {
      n: 0x26, kind: 'transcript', target: `${rocky.id}#120000`, by: L.gus, reason: 'other',
      snap: { kind: 'transcript', id: `${rocky.id}#120000`, episodeId: rocky.id, episodeTitle: rocky.title, showTitle: 'Show pi', feedUrl: FEEDS.pi, offsetMs: 120000, original: 'the rocky statue', suggested: 'the Rocky statue' },
      detail: { episodeId: rocky.id, offsetMs: 120000, original: 'the rocky statue', suggested: 'the Rocky statue' }, at: ago(2),
    },
    // reported after the episode had left its feed: closed at once, by no action
    { n: 0x27, kind: 'episode', target: 'mig-gone-episode', by: L.eli, reason: 'other', snap: { kind: 'episode', id: 'mig-gone-episode' }, at: ago(5), closedAt: ago(5), why: 'already_gone' },
    // closed > 90 days ago and not purged yet (the purge runs on /mod load): kept, with its TTL already past
    { n: 0x28, kind: 'profile', target: L.ivy, by: L.cy, reason: 'spam', snap: { kind: 'profile', id: L.ivy, displayName: 'Ivy Hidden' }, at: ago(2500), closedAt: ago(2450), why: 'author_deleted' },
    { n: 0x29, kind: 'profile', target: L.dee, by: L.jo, reason: 'other', snap: { kind: 'profile', id: L.dee, displayName: 'Dee Private' }, at: ago(1) },
  ];
  // An open report on a demo clip, when the demo seed made one.
  const [clip] = await pg.query<{ id: string; author_id: string; episode_id: string; caption: string; start_ms: number; end_ms: number; display_name: string; title: string }>(
    `SELECT c.id::text AS id, c.author_id::text AS author_id, c.episode_id, c.caption, c.start_ms, c.end_ms, l.display_name, e.title
       FROM clips c JOIN listeners l ON l.id = c.author_id JOIN episodes e ON e.id = c.episode_id
      WHERE c.deleted_at IS NULL AND c.author_id <> $1 ORDER BY c.id LIMIT 1`, [L.alex]);
  if (clip) {
    reports.push({
      n: 0x2a, kind: 'clip', target: clip.id, by: L.alex, reason: 'violence', at: ago(4),
      snap: { kind: 'clip', id: clip.id, caption: clip.caption, startMs: Number(clip.start_ms), endMs: Number(clip.end_ms), authorId: clip.author_id, authorName: clip.display_name, episodeId: clip.episode_id, episodeTitle: clip.title },
    });
  }
  for (const r of reports) {
    await q(
      `INSERT INTO reports (id, target_kind, target_id, reporter_id, reason, note, snapshot, detail, created_at, closed_at, closed_by, close_reason)
       VALUES ($1, $2, $3, $4, $5, $6, ($7::text)::jsonb, ($8::text)::jsonb, $9, $10, $11, $12)`,
      [id(r.n), r.kind, r.target, r.by, r.reason, r.note ?? null, j(r.snap), r.detail === undefined ? null : j(r.detail), r.at, r.closedAt ?? null, r.closedBy ?? null, r.why ?? null]);
  }

  // ---- blocks (a block ends the follows both ways)
  const blocks: [string, string, Date][] = [[L.dee, L.gus, ago(10)], [L.bea, L.hal, ago(500)], [L.eli, L.ivy, ago(1)]];
  for (const [a, c, at] of blocks) {
    await q('DELETE FROM follows WHERE (follower_id = $1 AND followed_id = $2) OR (follower_id = $2 AND followed_id = $1)', [a, c]);
    await q('INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [a, c, at]);
  }

  // ---- appeals: hal's suspension (open), eli's removed comment (rejected)
  await q(`INSERT INTO appeals (id, listener_id, action_id, text, state, created_at) VALUES ($1, $2, $3, $4, 'open', $5)`,
    [id(0x30), L.hal, A.suspend, 'I did not write anything hateful, please look again.', ago(25)]);
  await q(`INSERT INTO appeals (id, listener_id, action_id, text, state, created_at, decided_at, decided_by) VALUES ($1, $2, $3, $4, 'rejected', $5, $6, $7)`,
    [id(0x31), L.eli, A.remove, 'It was a joke link.', ago(15), ago(10), L.alex]);

  // ---- admins and the admin record
  await q('INSERT INTO admins (listener_id, granted_at, granted_by) VALUES ($1, $2, NULL) ON CONFLICT DO NOTHING', [L.alex, ago(1900)]);
  await q('INSERT INTO admins (listener_id, granted_at, granted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [L.bea, ago(100), L.alex]);
  const audit: [Date, string, string | null, string, string, string, unknown, unknown, string | null][] = [
    [ago(30), L.alex, null, 'reports', 'suspend', L.hal, { suspended: false }, { suspended: true }, 'Mac · Safari'],
    [ago(100), L.alex, null, 'users', 'grant-admin', L.bea, null, { admin: true }, null],
    [ago(26), L.alex, L.bea, 'safety', 'maintenance', 'maintenance', null, { until: ago(24).toISOString(), message: 'Upgrading the database.' }, 'iPhone'],
    [ago(1200), L.alex, null, 'config', 'save', 'searchHints', { value: [] }, { value: ['stoic', 'history'] }, null],
  ];
  for (const [at, admin, actingAs, area, action, target, before, after, device] of audit) {
    await q(`INSERT INTO admin_audit (at, admin_id, acting_as, area, action, target, before, after, device) VALUES ($1, $2, $3, $4, $5, $6, ($7::text)::jsonb, ($8::text)::jsonb, $9)`,
      [at, admin, actingAs, area, action, target, before === null ? null : j(before), after === null ? null : j(after), device]);
  }

  // ---- blocked words (one adder later deleted their account: added_by NULL)
  await q('INSERT INTO blocked_words (word, added_by, added_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', ['spamword', L.alex, ago(100)]);
  await q('INSERT INTO blocked_words (word, added_by, added_at) VALUES ($1, NULL, $2) ON CONFLICT DO NOTHING', ['scamlink', ago(200)]);

  // ---- app settings: the maintenance switch (over already) and a key no code reads (not copied)
  await q(`INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('maintenance', ($1::text)::jsonb, $2, $3) ON CONFLICT (key) DO NOTHING`,
    [j({ until: ago(24).toISOString(), message: 'Upgrading the database.' }), ago(26), L.alex]);
  await q(`INSERT INTO app_settings (key, value, updated_at) VALUES ('legacy-flag', ($1::text)::jsonb, $2) ON CONFLICT (key) DO NOTHING`, [j({ on: true }), ago(900)]);

  // ---- app config and content pages (029 seeded 14 pages; one edited, one draft added)
  await q(`INSERT INTO app_config (key, value, version, updated_at) VALUES ('searchHints', ($1::text)::jsonb, 2, $2) ON CONFLICT (key) DO NOTHING`, [j(['stoic', 'history']), ago(1200)]);
  await q(`INSERT INTO app_config (key, value, version, updated_at) VALUES ('listSizes', ($1::text)::jsonb, 1, $2) ON CONFLICT (key) DO NOTHING`, [j({ discoverCategories: 6, searchCategories: 4, searchHints: 3 }), ago(300)]);
  await q(`UPDATE content_pages SET body = $1, version = version + 1, updated_at = $2 WHERE kind = 'faq' AND slug = 'how-do-stickers-work'`,
    ['Stickers are earned for listening milestones. See Me › Stickers for the full list.', ago(40)]);
  await q(`INSERT INTO content_pages (kind, slug, title, summary, tag, body, position, published, version, updated_at)
           VALUES ('academy', 'mig-draft-guide', 'A draft guide', 'Not ready yet', 'grow', 'Steps:\n1. Record\n2. Publish', 99, false, 3, $1) ON CONFLICT DO NOTHING`, [ago(12)]);

  // ---- translation: the allow-list, jobs in every state (one with segments over 100 000 characters), results, the Groq ledger
  await q('INSERT INTO translation_shows (feed_url, added_by, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [FEEDS.pi, L.alex, ago(100)]);
  await q('INSERT INTO translation_shows (feed_url, added_by, created_at) VALUES ($1, NULL, $2) ON CONFLICT DO NOTHING', [FEEDS.stoic, ago(50)]);
  const bigSegs = Array.from({ length: 1500 }, (_, i) => ({ start: i * 4, end: i * 4 + 4, text: `Line ${i}: the statue stood on the steps — 雕像站在台阶上 — and the crowd ran up again, as they always do.`, ...(i < 300 ? { t: `第${i}行：雕像站在台阶上。` } : {}) }));
  const smallSegs = [{ start: 0, end: 5, text: 'Welcome to the show.' }, { start: 5, end: 9, text: 'Today: Western Electric.' }];
  type Job = [string, string, string, string | null, unknown, number, number, number, number, string | null, Date | null, Date, Date];
  const jobs: Job[] = [
    [rocky.id, 'zh-Hans', 'translating', 'en', bigSegs, 1, 1800, 42000, 0, null, null, ago(8), ago(1)],
    [b.ep('phone').id, 'en', 'queued', null, null, 0, 0, 0, 0, null, null, ago(3), ago(3)],
    [b.ep('wisdom').id, 'zh-Hans', 'transcribing', 'en', null, 0, 0, 0, 1, 'Groq said 503', new Date(b.now + 3_600_000), ago(6), ago(0.5)],
    [b.ep('bamboo').id, 'zh-Hans', 'done', 'en', null, 3, 2460, 91000, 0, null, null, ago(30), ago(28)],
    [b.ep('rules').id, 'en', 'failed', 'en', smallSegs, 0, 1320, 0, 3, 'Speech-to-text found no words.', null, ago(200), ago(199)],
  ];
  for (const r of jobs) {
    await q(
      `INSERT INTO translation_jobs (episode_id, target_lang, state, source_lang, segments, next_chunk, audio_s, tokens, errors, error, not_before, requested_at, updated_at)
       VALUES ($1, $2, $3, $4, ($5::text)::jsonb, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT DO NOTHING`,
      [r[0], r[1], r[2], r[3], r[4] === null ? null : j(r[4]), r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12]]);
  }
  const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ s: i * 3000, e: i * 3000 + 3000, o: `Bamboo line ${i}.`, t: `竹子第${i}行。` }));
  await q(`INSERT INTO transcripts_translated (episode_id, target_lang, lines, made_at) VALUES ($1, 'zh-Hans', ($2::text)::jsonb, $3) ON CONFLICT DO NOTHING`, [b.ep('bamboo').id, j(lines(40)), ago(28)]);
  await q(`INSERT INTO transcripts_translated (episode_id, target_lang, lines, made_at) VALUES ($1, 'en', ($2::text)::jsonb, $3) ON CONFLICT DO NOTHING`, [b.ep('tootle').id, j(lines(3)), ago(400)]);
  const utcDay = (d: Date) => d.toISOString().slice(0, 10);
  await q('INSERT INTO groq_usage (day, model, requests, audio_s, tokens) VALUES ($1::date, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [utcDay(new Date(b.now)), 'whisper-large-v3', 4, 1800, 0]);
  await q('INSERT INTO groq_usage (day, model, requests, audio_s, tokens) VALUES ($1::date, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [utcDay(new Date(b.now)), 'openai/gpt-oss-120b', 12, 0, 42000]);
  await q('INSERT INTO groq_usage (day, model, requests, audio_s, tokens) VALUES ($1::date, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [utcDay(ago(48)), 'openai/gpt-oss-120b', 30, 0, 91000]);
}
