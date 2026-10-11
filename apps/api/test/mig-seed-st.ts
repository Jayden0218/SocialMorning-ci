// The copy test's Studio rows on Postgres: claims, the team, a Studio-made show with every kind of episode, the show page's settings, held comments, announcements, polls, milestones and shares.
/**
 * M26 lane MIG, lane ST (test/ddb-mig.test.ts). Plain SQL, as the old Studio wrote it. Every table of lane ST gets at
 * least two rows, with the edge cases scripts/copy/st.ts handles: a pending, a proven and a revoked claim; a helper
 * added by someone since deleted (added_by NULL); used / revoked / open invites; a Studio-made show and a deleted one;
 * hosted episodes that are live (already promoted into `episodes`), scheduled, draft + paid with a preview, deleted, and
 * from before paid episodes (created_at NULL); an override with a milestone message and one without; a show-wide and an
 * episode comment policy; held comments with and without a picture; a host-hidden comment (+ its moderation record);
 * pushed, scheduled, edited and deleted announcements across two months; a single-choice open poll and a closed
 * multi-choice poll; milestones; shares with and without a sharer. The Studio facts come from the demo seed's
 * listens, reactions, library items, ranges and positions.
 */
import { createHash } from 'node:crypto';
import { fnv1a64 } from '@socialmorning/social-core';
import type { SeedBase } from './mig-seed-base.ts';

/** Lane ST's fixed ids (lane digit 7). */
const id = (n: number): string => `00000007-0000-4000-8000-0000000000${n.toString(16).padStart(2, '0')}`;
const inviteHash = (token: string): Buffer => createHash('sha256').update('invite|').update(token).digest();

export async function seed(b: SeedBase): Promise<void> {
  const { pg, L, FEEDS } = b;
  const q = (sql: string, params: unknown[] = []) => pg.query(sql, params);
  const pi = FEEDS.pi; const stoic = FEEDS.stoic;
  const hostedId = id(0x11); const goneId = id(0x12);
  const hostedFeed = `https://api.mig.example.test/feeds/${hostedId}.xml`;
  const goneFeed = `https://api.mig.example.test/feeds/${goneId}.xml`;

  // ---- claims: alex owns pi; bea is waiting on stoic; cy gave bbc back; eli made a show in the Studio; fay's was deleted ----
  const claim = (n: number, who: string, feed: string, code: string, status: string, createdH: number, provenH: number | null) =>
    q('INSERT INTO creator_claims (id, listener_id, feed_url, code, status, created_at, proven_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id(n), who, feed, code, status, b.ago(createdH), provenH === null ? null : b.ago(provenH)]);
  await claim(0x01, L.alex, pi, 'socialnet-verify-mig7aaaaaaa', 'proven', 900, 899);
  await claim(0x02, L.bea, stoic, 'socialnet-verify-mig7bbbbbbb', 'pending', 50, null);
  await claim(0x03, L.cy, FEEDS.bbc, 'socialnet-verify-mig7ccccccc', 'revoked', 700, 690);
  await claim(0x04, L.eli, hostedFeed, `hosted:${hostedId}`, 'proven', 400, 400);
  await claim(0x05, L.fay, goneFeed, `hosted:${goneId}`, 'revoked', 300, 300);

  // ---- the team of pi: two helpers (one added by an account since deleted), a co-host; a co-host on the Studio show ----
  await q('INSERT INTO show_members (feed_url, listener_id, added_by, created_at) VALUES ($1, $2, $3, $4)', [pi, L.bea, L.alex, b.ago(800)]);
  await q('INSERT INTO show_members (feed_url, listener_id, added_by, created_at) VALUES ($1, $2, NULL, $3)', [pi, L.gus, b.ago(600)]);
  await q('INSERT INTO show_hosts (feed_url, listener_id, added_at) VALUES ($1, $2, $3)', [pi, L.cy, b.ago(100)]);
  await q('INSERT INTO show_hosts (feed_url, listener_id, added_at) VALUES ($1, $2, $3)', [hostedFeed, L.fay, b.ago(90)]);

  // ---- mutes: a ban with a reason; a mute by someone since deleted ----
  await q('INSERT INTO show_mutes (feed_url, listener_id, muted_by, reason, created_at) VALUES ($1, $2, $3, $4, $5)', [pi, L.hal, L.alex, 'Spam links', b.ago(40)]);
  await q('INSERT INTO show_mutes (feed_url, listener_id, muted_by, reason, created_at) VALUES ($1, $2, NULL, NULL, $3)', [pi, L.dee, b.ago(30)]);

  // ---- invites: the used one made cy a host; one revoked; one open ----
  const invite = (n: number, token: string, createdH: number, expiresH: number, used: [string, number] | null, revokedH: number | null) =>
    q(`INSERT INTO show_invites (id, feed_url, token_hash, created_by, created_at, expires_at, used_at, used_by, revoked_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id(n), pi, inviteHash(token), L.alex, b.ago(createdH), b.ago(expiresH), used ? b.ago(used[1]) : null, used ? used[0] : null, revokedH === null ? null : b.ago(revokedH)]);
  await invite(0x31, 'mig7-token-used', 120, 120 - 7 * 24, [L.cy, 100], null);
  await invite(0x32, 'mig7-token-revoked', 60, 60 - 7 * 24, null, 50);
  await invite(0x33, 'mig7-token-open', 5, 5 - 7 * 24, null, null);

  // ---- curators of two external shows ----
  await q('INSERT INTO show_curators (feed_url, listener_id, created_at, created_by) VALUES ($1, $2, $3, $4)', [FEEDS.daily, L.bea, b.ago(200), L.alex]);
  await q('INSERT INTO show_curators (feed_url, listener_id, created_at, created_by) VALUES ($1, $2, $3, NULL)', [FEEDS.upfirst, L.cy, b.ago(150)]);

  // ---- Studio-made shows: eli's live one (sells paid episodes), fay's deleted one ----
  await q(`INSERT INTO hosted_shows (id, owner_id, feed_url, title, description, author, language, category, explicit, cover_url, price_tier, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, 'Eli on the Train', 'Notes from the commute.', 'Eli', 'en', 'Society & Culture', false, 'https://img.example.com/eli.png', 2, $4, $5, NULL)`,
    [hostedId, L.eli, hostedFeed, b.ago(400), b.ago(20)]);
  await q(`INSERT INTO hosted_shows (id, owner_id, feed_url, title, created_at, updated_at, deleted_at) VALUES ($1, $2, $3, 'Fay Tried', $4, $5, $6)`,
    [goneId, L.fay, goneFeed, b.ago(300), b.ago(250), b.ago(250)]);

  const hep = async (n: number, e: { title: string; status: string; publishedH: number; paid?: boolean; createdH: number | null; deletedH?: number; previewMs?: [number, number]; durationMs?: number | null; promoted?: boolean }) => {
    const guid = `mig7-guid-${n}`;
    const episodeId = fnv1a64(hostedFeed + '\u0001' + guid);
    await q(`INSERT INTO hosted_episodes (id, show_id, guid, episode_id, title, description, audio_url, audio_bytes, audio_type, duration_ms, published_at, created_by, deleted_at,
                                          status, cover_url, paid, created_at, preview_start_ms, preview_end_ms)
             VALUES ($1, $2, $3, $4, $5, '', $6, $7, 'audio/mpeg', $8, $9, $10, $11, $12, NULL, $13, $14, $15, $16)`,
      [id(n), hostedId, guid, episodeId, e.title, `https://blob.example.com/${guid}.mp3`, 1_000_000 + n, e.durationMs === undefined ? 600_000 : e.durationMs, b.ago(e.publishedH), L.eli,
        e.deletedH === undefined ? null : b.ago(e.deletedH), e.status, e.paid ?? false, e.createdH === null ? null : b.ago(e.createdH), e.previewMs?.[0] ?? null, e.previewMs?.[1] ?? null]);
    if (e.promoted) {
      // The old promote-on-read put the live episode into the app's table.
      await q(`INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, image_url, duration_ms, published_at, media_kind, first_seen_at, updated_at)
               VALUES ($1, $2, $3, $4, 'Eli on the Train', $5, 'https://img.example.com/eli.png', $6, $7, 'audio', $8, $8)`,
        [episodeId, hostedFeed, guid, e.title, `https://blob.example.com/${guid}.mp3`, e.durationMs === undefined ? 600_000 : e.durationMs, b.ago(e.publishedH), b.ago(e.publishedH - 1)]);
    }
  };
  await hep(0x21, { title: 'Platform Four', status: 'published', publishedH: 48, createdH: 49, promoted: true });
  await hep(0x22, { title: 'Next Week', status: 'published', publishedH: -72, createdH: 10 });
  await hep(0x23, { title: 'Members Only', status: 'draft', publishedH: 5, paid: true, createdH: 6, previewMs: [0, 60_000] });
  await hep(0x24, { title: 'Pulled', status: 'published', publishedH: 200, createdH: 201, deletedH: 150, durationMs: null });
  await hep(0x25, { title: 'Old Draft', status: 'draft', publishedH: 380, createdH: null });

  // ---- the show page: overrides, comment control, picks, sync state, hidden episodes ----
  await q(`INSERT INTO show_overrides (feed_url, title, description, cover_url, theme_colour, milestone_message, hosts, links, contacts, tips_enabled, updated_at, updated_by)
           VALUES ($1, '99% Invisible (Studio)', 'Design is everywhere.', 'https://img.example.com/pi-studio.png', '#1A2B3C', 'You are listener number {n}. Thank you!',
                   ($2::text)::jsonb, ($3::text)::jsonb, ($4::text)::jsonb, true, $5, $6)`,
    [pi, JSON.stringify(['Roman Mars']), JSON.stringify([{ label: 'Website', url: 'https://99pi.example.org' }]), JSON.stringify([{ type: 'email', value: 'hi@99pi.example.org' }]), b.ago(70), L.alex]);
  await q('INSERT INTO show_overrides (feed_url, title, updated_at, updated_by) VALUES ($1, $2, $3, NULL)', [stoic, 'The Daily Stoic', b.ago(65)]);

  await q("INSERT INTO comment_policy (feed_url, episode_id, mode, updated_by, updated_at) VALUES ($1, '', 'review', $2, $3)", [pi, L.alex, b.ago(60)]);
  await q("INSERT INTO comment_policy (feed_url, episode_id, mode, updated_by, updated_at) VALUES ($1, $2, 'closed', NULL, $3)", [pi, b.ep('phone').id, b.ago(55)]);
  await q("INSERT INTO comment_policy (feed_url, episode_id, mode, updated_by, updated_at) VALUES ($1, '', 'open', $2, $3)", [stoic, L.bea, b.ago(54)]);

  await q('INSERT INTO host_picks (feed_url, episode_id, position, picked_by, created_at) VALUES ($1, $2, 1, $3, $4), ($1, $5, 2, $3, $4)',
    [pi, b.ep('bamboo').id, L.alex, b.ago(45), b.ep('rocky').id]);
  await q('INSERT INTO host_picks (feed_url, episode_id, position, picked_by, created_at) VALUES ($1, $2, 1, NULL, $3)', [stoic, b.ep('rules').id, b.ago(44)]);

  await q('INSERT INTO feed_sync (feed_url, fetched_at, ok, error, manual_at) VALUES ($1, $2, true, NULL, $3)', [pi, b.ago(1), b.ago(1)]);
  await q("INSERT INTO feed_sync (feed_url, fetched_at, ok, error, manual_at) VALUES ($1, $2, false, 'HTTP 500 from the publisher', NULL)", [stoic, b.ago(2)]);

  await q('INSERT INTO hidden_episodes (feed_url, guid, hidden_by, reason, hidden_at) VALUES ($1, $2, $3, NULL, $4)', [pi, b.ep('tootle').guid, L.alex, b.ago(35)]);
  await q("INSERT INTO hidden_episodes (feed_url, guid, hidden_by, reason, hidden_at) VALUES ($1, 'mig7-not-registered-yet', NULL, 'Rights claim', $2)", [stoic, b.ago(34)]);

  // ---- comments: two held for review on pi (one with a picture, one a reply), one host-hidden ----
  const [parent] = await pg.query<{ id: string }>(
    'SELECT id::text AS id FROM comments WHERE episode_id = $1 AND parent_id IS NULL ORDER BY id LIMIT 1', [b.ep('rocky').id]);
  await q(`INSERT INTO held_comments (id, episode_id, author_id, parent_id, body, offset_ms, country, created_at, image_url, image_path, image_w, image_h, image_bytes)
           VALUES ($1, $2, $3, NULL, 'Is this the statue from the film?', 61000, 'DE', $4, 'https://img.example.com/held.jpg', 'comment-images/held.jpg', 640, 480, 52000)`,
    [id(0x41), b.ep('rocky').id, L.fay, b.ago(12)]);
  await q(`INSERT INTO held_comments (id, episode_id, author_id, parent_id, body, offset_ms, country, created_at) VALUES ($1, $2, $3, $4, 'Agreed!', NULL, NULL, $5)`,
    [id(0x42), b.ep('rocky').id, L.eli, parent?.id ?? null, b.ago(11)]);

  // A top-level comment the owner hid (the app took its feed item away; /mod's list reads it from the comment).
  await q(`INSERT INTO comments (id, episode_id, author_id, parent_id, body, offset_ms, created_at, host_hidden_at, host_hidden_by)
           VALUES ($1, $2, $3, NULL, 'Buy cheap followers here', NULL, $4, $5, $6)`, [id(0x81), b.ep('bamboo').id, L.bea, b.ago(26), b.ago(25), L.alex]);
  await q(`INSERT INTO moderation_actions (id, actor_id, action, target_kind, target_id, created_at) VALUES ($1, $2, 'host_hide', 'comment', $3, $4)`,
    [id(0x82), L.alex, id(0x81), b.ago(25)]);

  // ---- announcements: pushed this month, pushed last month (40 days ago), scheduled, edited with pictures, deleted ----
  const ann = (n: number, feed: string, body: string, createdH: number, pushed: boolean, releaseH: number, extra: { editedH?: number; deletedH?: number; images?: string[]; author?: string | null } = {}) =>
    q(`INSERT INTO announcements (id, feed_url, author_id, body, images, created_at, edited_at, pushed_at, release_at, deleted_at)
       VALUES ($1, $2, $3, $4, ($5::text)::jsonb, $6, $7, $8, $9, $10)`,
      [id(n), feed, extra.author === undefined ? L.alex : extra.author, body, JSON.stringify(extra.images ?? []), b.ago(createdH), extra.editedH === undefined ? null : b.ago(extra.editedH),
        pushed ? b.ago(createdH) : null, b.ago(releaseH), extra.deletedH === undefined ? null : b.ago(extra.deletedH)]);
  await ann(0x61, pi, 'New season starts Monday.', 30, true, 30);
  await ann(0x62, pi, 'Live show in London next month.', 3, false, -48);
  await ann(0x63, pi, 'Behind the scenes.', 20, false, 20, { editedH: 19, images: ['https://img.example.com/bts1.jpg', 'https://img.example.com/bts2.jpg'] });
  await ann(0x64, pi, 'Wrong link, sorry.', 8, true, 8, { deletedH: 7 });
  await ann(0x65, stoic, 'Thank you for 1000 listeners.', 24 * 40, true, 24 * 40, { author: null });

  // ---- polls: an open single-choice poll; a closed multi-choice poll on an episode ----
  await q('INSERT INTO polls (id, feed_url, episode_id, question, ends_at, closed_at, created_by, created_at, multi) VALUES ($1, $2, NULL, $3, $4, NULL, $5, $6, false)',
    [id(0x71), pi, 'Which episode next?', b.ago(-72), L.alex, b.ago(24)]);
  await q('INSERT INTO polls (id, feed_url, episode_id, question, ends_at, closed_at, created_by, created_at, multi) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, true)',
    [id(0x72), pi, b.ep('rocky').id, 'What did you like?', b.ago(-24), b.ago(6), b.ago(30)]);
  for (const [poll, labels] of [[id(0x71), ['Flags', 'Fonts', 'Bridges']], [id(0x72), ['The story', 'The music']]] as const) {
    for (const [idx, label] of labels.entries()) await q('INSERT INTO poll_options (poll_id, idx, label) VALUES ($1, $2, $3)', [poll, idx, label]);
  }
  const vote = (poll: string, who: string, idx: number, h: number) => q('INSERT INTO poll_votes (poll_id, listener_id, option_idx, created_at) VALUES ($1, $2, $3, $4)', [poll, who, idx, b.ago(h)]);
  await vote(id(0x71), L.bea, 0, 20);
  await vote(id(0x71), L.cy, 1, 19);
  await vote(id(0x71), L.dee, 0, 18);
  await vote(id(0x72), L.eli, 0, 28);
  await vote(id(0x72), L.eli, 1, 27);
  await vote(id(0x72), L.fay, 1, 26);

  // ---- milestones sent ----
  await q('INSERT INTO milestones_sent (id, feed_url, milestone, listener_id, body, sent_at) VALUES ($1, $2, 100, $3, $4, $5)',
    [id(0x51), pi, L.bea, 'You are listener number 100. Thank you!', b.ago(300)]);
  await q('INSERT INTO milestones_sent (id, feed_url, milestone, listener_id, body, sent_at) VALUES ($1, $2, 1000, $3, $4, $5)',
    [id(0x52), stoic, L.cy, 'Welcome, listener 1,000!', b.ago(100)]);

  // ---- shares: an episode, a clip shared signed out, an old show share ----
  await q("INSERT INTO share_events (listener_id, target_kind, target_id, feed_url, at) VALUES ($1, 'episode', $2, $3, $4)", [L.bea, b.ep('rocky').id, pi, b.ago(3)]);
  await q("INSERT INTO share_events (listener_id, target_kind, target_id, feed_url, at) VALUES (NULL, 'clip', $1, $2, $3)", [id(0x90), pi, b.ago(2)]);
  await q("INSERT INTO share_events (listener_id, target_kind, target_id, feed_url, at) VALUES ($1, 'show', $2, $2, $3)", [L.cy, stoic, b.ago(500)]);
}
