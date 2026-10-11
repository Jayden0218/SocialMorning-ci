// Lane SC's rows for the copy test: comments (replies, a placeholder, pins, removed media, a parked moment), likes, marks, reactions, clips, chats, likes with notes, statuses.
/**
 * M26 lane MIG (test/ddb-mig.test.ts). Plain SQL as years of production wrote it, on top of the base fixture and the
 * demo seed. Ids are `00000003-…` (lane digit 3). Every table of lane SC gets at least two rows, with the edge cases
 * scripts/copy/sc.ts maps: a reply (sorted under its root), a placeholder that keeps its reply, a removed comment that
 * still holds a recording / a picture (`Q#removed-media`), a host-hidden one, both pins, a comment whose episode
 * length is unknown (no `bucket`), a deleted and a removed clip, read / unread / removed chat messages and an
 * episode-only card, an expired status and a status that hit its reaction milestone, an attached and an orphan photo
 * upload (`status-photo:` cache rows). No `episode_heat` here (the test rebuilds it); no activity rows (lane SG's).
 */
import type { SeedBase } from './mig-seed-base.ts';

const id = (n: number) => `00000003-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const SC = {
  // comments
  c1: id(0x01), c2: id(0x02), c3: id(0x03), c4: id(0x04), c5: id(0x05), c6: id(0x06), c7: id(0x07), c8: id(0x08), c9: id(0x09),
  // clips
  k1: id(0x11), k2: id(0x12), k3: id(0x13),
  // like-post comments
  lc1: id(0x21), lc2: id(0x22),
  // statuses and replies
  p1: id(0x31), p2: id(0x32), p3: id(0x33),
  r1: id(0x41), r2: id(0x42), r3: id(0x43),
} as const;

const HOUR = 3_600_000;

export async function seed(b: SeedBase): Promise<void> {
  const { pg, L } = b;
  const q = (sql: string, params: unknown[] = []) => pg.query(sql, params);
  const ep = (k: string) => b.ep(k).id;
  const later = (hours: number) => new Date(b.now + hours * HOUR);

  // ---- comments: [id, episode, author, parent, body, offset, created (h ago), extra columns]
  type C = [string, string, string | null, string | null, string | null, number | null, number, Record<string, unknown>];
  const comments: C[] = [
    // a pinned top-level comment with a moment (rocky is 32 min long: bucket 3)
    [SC.c1, ep('rocky'), L.bea, null, 'The statue scene is the best bit.', 60_000, 10, { pinned_at: b.ago(9), pinned_by: L.alex, country: 'GB' }],
    [SC.c2, ep('rocky'), L.cy, SC.c1, 'Agreed!', null, 9, {}],
    // a voice reply, removed by moderation while it still holds its recording → Q#removed-media
    [SC.c3, ep('rocky'), L.eli, SC.c1, null, null, 8, {
      voice_url: 'https://voice.example.com/c/c3.m4a', voice_path: 'comments/c3.m4a', voice_ms: 5_000, transcript: 'A short voice reply', removed_at: b.ago(2),
    }],
    // a placeholder (author deleted it; it had a reply): no author, words or moment
    [SC.c4, ep('rocky'), null, null, null, null, 20, { deleted_at: b.ago(5) }],
    [SC.c5, ep('rocky'), L.fay, SC.c4, 'Replying to something now gone', null, 19, {}],
    // a moment on an episode whose length is not known yet: parked, no bucket
    [SC.c6, ep('daily2'), L.gus, null, 'Wait for this part', 30_000, 3, {}],
    // a host-hidden comment with a picture
    [SC.c7, ep('phone'), L.eli, null, 'Look at this phone', 120_000, 7, {
      host_hidden_at: b.ago(6), host_hidden_by: L.alex,
      image_url: 'https://img.example.com/comments/c7.jpg', image_path: 'comments/c7.jpg', image_w: 800, image_h: 600, image_bytes: 4_096,
    }],
    // pinned at the bottom, like notices off
    [SC.c8, ep('phone'), L.dee, null, 'Bottom pin', null, 6, { pinned_bottom_at: b.ago(5), like_notices_off: true, country: 'MY' }],
    // a voice comment with no words and a picture, removed → Q#removed-media
    [SC.c9, ep('bamboo'), L.fay, null, null, 120_000, 4, {
      voice_url: 'https://voice.example.com/c/c9.m4a', voice_path: 'comments/c9.m4a', voice_ms: 9_000,
      image_url: 'https://img.example.com/comments/c9.jpg', image_path: 'comments/c9.jpg', image_w: 400, image_h: 400, image_bytes: 2_048, removed_at: b.ago(1),
    }],
  ];
  for (const [cid, episodeId, author, parent, body, offset, hours, extra] of comments) {
    const cols: Record<string, unknown> = { id: cid, episode_id: episodeId, author_id: author, parent_id: parent, body, offset_ms: offset, created_at: b.ago(hours), ...extra };
    const names = Object.keys(cols);
    await q(`INSERT INTO comments (${names.join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})`, names.map((k) => cols[k]));
  }

  // ---- comment likes (never the author's own) and "unfriendly" marks
  for (const [cid, who, hours] of [[SC.c1, L.cy, 8], [SC.c1, L.eli, 7], [SC.c2, L.bea, 6], [SC.c8, L.bea, 4]] as const) {
    await q('INSERT INTO comment_likes (comment_id, listener_id, created_at) VALUES ($1, $2, $3)', [cid, who, b.ago(hours)]);
  }
  for (const [cid, who, hours] of [[SC.c7, L.gus, 6], [SC.c7, L.hal, 5]] as const) {
    await q('INSERT INTO comment_unfriendly (comment_id, listener_id, created_at) VALUES ($1, $2, $3)', [cid, who, b.ago(hours)]);
  }

  // ---- reactions (bucket = floor(offset × 100 / length))
  const reactions: [string, string, number, number, number][] = [
    [L.bea, 'rocky', 3, 60_000, 10],
    [L.cy, 'rocky', 10, 200_000, 9],
    [L.fay, 'daily1', 50, 750_000, 4],
    [L.gus, 'joy', 50, 1_410_000, 30],
  ];
  for (const [who, k, bucket, offset, hours] of reactions) {
    await q('INSERT INTO reactions (listener_id, episode_id, bucket, offset_ms, created_at) VALUES ($1, $2, $3, $4, $5)', [who, ep(k), bucket, offset, b.ago(hours)]);
  }

  // ---- clips: live, deleted by its author, removed by moderation
  await q(`INSERT INTO clips (id, author_id, client_id, episode_id, start_ms, end_ms, caption, created_at, deleted_at, removed_at) VALUES
    ($1, $4, 'mig-sc-1', $7, 60000, 90000, 'The statue bit', $10, NULL, NULL),
    ($2, $5, 'mig-sc-2', $8, 10000, 40000, 'Dial tone', $11, $13, NULL),
    ($3, $6, 'mig-sc-3', $9, 0, 15000, '', $12, NULL, $14)`,
  [SC.k1, SC.k2, SC.k3, L.bea, L.cy, L.eli, ep('rocky'), ep('phone'), ep('bamboo'), b.ago(7), b.ago(6), b.ago(5), b.ago(1), b.ago(2)]);

  // ---- chat: read, unread, an episode card with no words, a removed message; a second pair
  const chats: [string, string, string, string | null, number, number | null, number | null][] = [
    [L.bea, L.cy, 'Hi Cy', null, 6, 5, null],
    [L.cy, L.bea, 'Hello!', null, 5, null, null],
    [L.bea, L.cy, '', ep('rocky'), 4, null, null],
    [L.cy, L.bea, 'Something moderation took down', null, 3, null, 2],
    [L.alex, L.jo, 'Welcome aboard', ep('rules'), 50, 49, null],
    [L.jo, L.alex, 'Thanks', null, 48, 47, null],
  ];
  for (const [from, to, body, card, hours, readHours, removedHours] of chats) {
    await q('INSERT INTO chat_messages (sender_id, recipient_id, body, episode_id, created_at, read_at, removed_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [from, to, body, card, b.ago(hours), readHours === null ? null : b.ago(readHours), removedHours === null ? null : b.ago(removedHours)]);
  }

  // ---- episode likes (with and without a note; dee's likes are not public), the like post's comments and reactions
  for (const [who, k, note, hours] of [[L.bea, 'rocky', 'Loved the statue story', 9], [L.cy, 'phone', null, 8], [L.dee, 'rules', null, 7]] as const) {
    await q('INSERT INTO episode_likes (listener_id, episode_id, note, created_at) VALUES ($1, $2, $3, $4)', [who, ep(k), note, b.ago(hours)]);
  }
  await q(`INSERT INTO like_comments (id, owner_id, episode_id, author_id, body, created_at, deleted_at) VALUES
    ($1, $3, $4, $5, 'Same here', $7, NULL),
    ($2, $3, $4, $6, 'Nice one', $8, $9)`,
  [SC.lc1, SC.lc2, L.bea, ep('rocky'), L.cy, L.eli, b.ago(8), b.ago(7), b.ago(6)]);
  for (const [who, emoji, hours] of [[L.cy, '👍', 8], [L.fay, '🔥', 7]] as const) {
    await q('INSERT INTO like_reactions (owner_id, episode_id, listener_id, emoji, created_at) VALUES ($1, $2, $3, $4, $5)', [L.bea, ep('rocky'), who, emoji, b.ago(hours)]);
  }

  // ---- statuses: a live voice status with items and replies, a live text status past its milestone, an expired text status
  await q(`INSERT INTO voice_posts (id, listener_id, blob_url, blob_path, duration_ms, bytes, transcript, body, created_at, expires_at, milestone_sent_at) VALUES
    ($1, $4, 'https://voice.example.com/s/p1.m4a', 'statuses/p1.m4a', 12000, 48000, 'Morning walk thoughts', NULL, $7, $8, NULL),
    ($2, $5, NULL, NULL, NULL, NULL, NULL, 'Listening to Stoics today', $9, $10, $11),
    ($3, $6, NULL, NULL, NULL, NULL, NULL, 'Yesterday was long', $12, $13, NULL)`,
  [SC.p1, SC.p2, SC.p3, L.bea, L.cy, L.eli, b.ago(2), later(22), b.ago(5), later(19), b.ago(1), b.ago(30), b.ago(6)]);
  await q(`INSERT INTO status_replies (id, post_id, author_id, body, audio_key, audio_url, audio_ms, created_at) VALUES
    ($1, $4, $6, 'Sounds lovely', NULL, NULL, NULL, $9),
    ($2, $4, $7, NULL, 'replies/r2.m4a', 'https://voice.example.com/r/r2.m4a', 4000, $10),
    ($3, $5, $8, 'Hope today is better', NULL, NULL, NULL, $11)`,
  [SC.r1, SC.r2, SC.r3, SC.p1, SC.p3, L.cy, L.fay, L.bea, b.ago(1.5), b.ago(1), b.ago(20)]);
  for (const [post, who, kind, hours] of [[SC.p1, L.cy, 2, 1.5], [SC.p1, L.fay, 1, 1], [SC.p2, L.bea, 3, 4]] as const) {
    await q('INSERT INTO status_reactions (post_id, listener_id, kind, created_at) VALUES ($1, $2, $3, $4)', [post, who, kind, b.ago(hours)]);
  }
  const photo = 'statuses/bea/p1-photo.jpg';
  await q(`INSERT INTO status_items (post_id, pos, kind, episode_id, image_key, image_url) VALUES
    ($1, 1, 'episode', $3, NULL, NULL),
    ($1, 2, 'photo', NULL, $4, $5),
    ($2, 1, 'episode', $6, NULL, NULL)`,
  [SC.p1, SC.p2, ep('rocky'), photo, `https://img.example.com/${photo}`, ep('up2')]);
  // The photo uploads (status-items.ts `recordUpload`): one on p1, one never posted (the orphan sweep's).
  const orphan = 'statuses/cy/orphan.jpg';
  await q(`INSERT INTO cache (key, body, fetched_at) VALUES ($1, $2::text::jsonb, $3), ($4, $5::text::jsonb, $6)`, [
    `status-photo:${photo}`, JSON.stringify({ url: `https://img.example.com/${photo}`, bytes: 51_200, listenerId: L.bea, postId: SC.p1 }), b.ago(2.2),
    `status-photo:${orphan}`, JSON.stringify({ url: `https://img.example.com/${orphan}`, bytes: 20_480, listenerId: L.cy }), b.ago(3),
  ]);

  // ---- "stop suggesting this person's statuses"
  for (const [who, muted, hours] of [[L.alex, L.eli, 12], [L.bea, L.gus, 11]] as const) {
    await q('INSERT INTO status_suggestion_mutes (listener_id, muted_id, created_at) VALUES ($1, $2, $3)', [who, muted, b.ago(hours)]);
  }
}
