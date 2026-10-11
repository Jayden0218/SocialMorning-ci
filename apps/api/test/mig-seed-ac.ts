// Lane AC's rows for the copy test: sessions (a rotation chain, act-as, Studio second factor), codes, push, feedback, errors, deletions …
/**
 * M26 lane MIG (test/ddb-mig.test.ts). Plain SQL on the Postgres every migration made, on top of the base fixture
 * (mig-seed-base.ts) and the demo seed. Every table lane AC owns gets at least two rows, with the edge cases
 * scripts/copy/ac.ts handles: a rotated session (replaced_by chain), an act-as session, a Studio session mid second
 * factor, an expired session and code, anonymous feedback, a sender with pictures today (the FBIMG log), an old
 * picture, an error with no sender and no stack, a pending and a cancelled deletion, a "popular" push to a listener
 * with no switches row, an email change from before M25 (no old-address code), an expired sign-in lock, a made
 * account. Fixed ids use lane digit 1.
 */
import { createHash } from 'node:crypto';
import type { SeedBase } from './mig-seed-base.ts';

const id = (n: number) => `00000001-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const hash = (label: string) => createHash('sha256').update(`mig-ac:${label}`).digest();
/** A small "image" (bytes only; the copy never looks inside). */
const img = (n: number, len: number) => Buffer.from(Array.from({ length: len }, (_, i) => (i * 31 + n) % 256));

export async function seed(b: SeedBase): Promise<void> {
  const { pg, L, ago } = b;
  const q = (sql: string, params: unknown[] = []) => pg.query(sql, params);
  const klDay = (hoursAgo: number) => new Date(b.now - hoursAgo * 3_600_000 + 8 * 3_600_000).toISOString().slice(0, 10);
  const today = klDay(0);
  const yesterday = klDay(24);

  // ---- listeners: the account-lane columns the base leaves at their defaults
  await q('UPDATE listeners SET failed_attempts = 2, locked_until = $2 WHERE id = $1', [L.eli, ago(1)]); // an expired lock
  await q('UPDATE listeners SET made_by = $2 WHERE id = $1', [L.gus, L.alex]); // made in Admin
  await q('UPDATE listeners SET hidden_at = $2 WHERE id = $1', [L.jo, ago(24)]); // hidden while the deletion waits

  // ---- sessions
  const sess = (label: string) => hash(`session:${label}`);
  const S = { beaPhone: sess('bea-phone'), beaOld: sess('bea-old'), beaNew: sess('bea-new'), actAs: sess('act-as'), studio: sess('studio'), eliOld: sess('eli-old'), hal: sess('hal') };
  const insertSession = (c: Record<string, unknown>) => {
    const names = Object.keys(c);
    return q(`INSERT INTO sessions (${names.join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})`, names.map((k) => c[k]));
  };
  await insertSession({ token_hash: S.beaPhone, id: id(0x101), listener_id: L.bea, device_label: 'iPhone 15', country: 'GB', created_at: ago(100), last_seen_at: ago(1), rotated_at: ago(30) });
  // Rotation: the new session first (the old one's replaced_by references it), both with the chain's first created_at.
  await insertSession({ token_hash: S.beaNew, id: id(0x102), listener_id: L.bea, device_label: 'Pixel 8', country: 'GB', created_at: ago(300), last_seen_at: ago(0.2), rotated_at: ago(0.2) });
  await insertSession({ token_hash: S.beaOld, id: id(0x103), listener_id: L.bea, device_label: 'Pixel 8', country: 'GB', created_at: ago(300), last_seen_at: ago(0.2), rotated_at: ago(30), replaced_at: ago(0.2), replaced_by: S.beaNew });
  await insertSession({ token_hash: S.actAs, id: id(0x104), listener_id: L.cy, device_label: 'admin-act-as', created_at: ago(0.5), last_seen_at: ago(0.4), rotated_at: ago(0.5), acting_admin_id: L.alex });
  await insertSession({
    token_hash: S.studio, id: id(0x105), listener_id: L.alex, device_label: 'studio-web', country: 'MY', created_at: ago(5), last_seen_at: ago(0.1), rotated_at: ago(5),
    second_factor_at: ago(4), second_factor_code: hash('second-factor-code'), second_factor_sent_at: ago(0.05), second_factor_tries: 1,
  });
  await insertSession({ token_hash: S.eliOld, id: id(0x106), listener_id: L.eli, device_label: null, created_at: ago(24 * 200), last_seen_at: ago(24 * 95), rotated_at: ago(24 * 200) }); // past the 180-day cap
  await insertSession({ token_hash: S.hal, id: id(0x107), listener_id: L.hal, device_label: 'iPad', created_at: ago(60), last_seen_at: ago(31), rotated_at: ago(40) }); // a suspended listener's

  // ---- emailed sign-in codes: one live (no account yet), one expired with every try used
  await q('INSERT INTO email_codes (email, code_hash, sent_at, expires_at, attempts) VALUES ($1, $2, $3, $4, $5)', ['newcomer@mig.example.test', hash('code:newcomer'), ago(0.05), ago(-0.2), 1]);
  await q('INSERT INTO email_codes (email, code_hash, sent_at, expires_at, attempts) VALUES ($1, $2, $3, $4, $5)', ['cy@mig.example.test', hash('code:cy'), ago(50), ago(49.8), 5]);

  // ---- email changes: a pending one, and one from before M25 (no old-address code)
  await q('INSERT INTO email_changes (listener_id, new_email, code_hash, old_code_hash, sent_at, expires_at, tries) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [L.bea, 'bea.new@mig.example.test', hash('change:bea'), hash('change:bea:old'), ago(0.1), ago(-0.15), 1]);
  await q('INSERT INTO email_changes (listener_id, new_email, code_hash, old_code_hash, sent_at, expires_at, tries) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [L.cy, 'cy.new@mig.example.test', hash('change:cy'), null, ago(50), ago(49.75), 0]);

  // ---- push tokens, switches, the "never twice" log, like windows, per-show switches, status pushes, digests
  await q('INSERT INTO push_tokens (token, listener_id, platform, created_at, last_ok_at) VALUES ($1, $2, $3, $4, $5)', ['ExponentPushToken[mig-bea-1]', L.bea, 'ios', ago(500), ago(2)]);
  await q('INSERT INTO push_tokens (token, listener_id, platform, created_at, last_ok_at) VALUES ($1, $2, $3, $4, $5)', ['ExponentPushToken[mig-bea-2]', L.bea, 'android', ago(10), null]);
  await q('INSERT INTO push_tokens (token, listener_id, platform, created_at, last_ok_at) VALUES ($1, $2, $3, $4, $5)', ['ExponentPushToken[mig-cy-1]', L.cy, 'android', ago(100), null]);
  await q('INSERT INTO push_prefs (listener_id, new_episodes, popular, likes, system) VALUES ($1, false, true, false, true)', [L.bea]);
  await q('INSERT INTO push_prefs (listener_id) VALUES ($1)', [L.cy]); // all on (defaults)
  await q('INSERT INTO push_sent (listener_id, episode_id, kind, sent_at) VALUES ($1, $2, $3, $4)', [L.bea, b.ep('rocky').id, 'new_episode', ago(200)]);
  await q('INSERT INTO push_sent (listener_id, episode_id, kind, sent_at) VALUES ($1, $2, $3, $4)', [L.bea, b.ep('phone').id, 'popular', ago(30)]);
  await q('INSERT INTO push_sent (listener_id, episode_id, kind, sent_at) VALUES ($1, $2, $3, $4)', [L.eli, b.ep('bamboo').id, 'popular', ago(5)]); // no switches row
  await q('INSERT INTO push_sent (listener_id, episode_id, kind, sent_at) VALUES ($1, $2, $3, $4)', [L.cy, b.ep('rules').id, 'new_episode', ago(24 * 40)]); // past 30 days
  await q('INSERT INTO push_like_windows (listener_id, target_key, first_at, count) VALUES ($1, $2, $3, $4)', [L.bea, `like:comment:${id(0x999)}`, ago(0.1), 3]);
  await q('INSERT INTO push_like_windows (listener_id, target_key, first_at, count) VALUES ($1, $2, $3, $4)', [L.cy, `status_reaction:${id(0x998)}`, ago(24 * 10), 1]);
  await q('INSERT INTO notify_show_prefs (listener_id, feed_url, enabled) VALUES ($1, $2, false)', [L.bea, b.FEEDS.pi]);
  await q('INSERT INTO notify_show_prefs (listener_id, feed_url, enabled) VALUES ($1, $2, true)', [L.cy, b.FEEDS.stoic]);
  await q('INSERT INTO status_push_log (author_id, day, count) VALUES ($1, $2::date, $3)', [L.bea, today, 2]);
  await q('INSERT INTO status_push_log (author_id, day, count) VALUES ($1, $2::date, $3)', [L.cy, yesterday, 1]);
  await q('INSERT INTO weekly_digests (listener_id, iso_week, episode_ids, sent_at) VALUES ($1, $2, $3::text[], $4)', [L.bea, '2026-W40', [b.ep('rocky').id, b.ep('phone').id], ago(24 * 3)]);
  await q('INSERT INTO weekly_digests (listener_id, iso_week, episode_ids, sent_at) VALUES ($1, $2, $3::text[], $4)', [L.cy, '2026-W31', [b.ep('rules').id], ago(24 * 60)]); // past the 28-day keep

  // ---- feedback: anonymous text; a sender with two pictures today (the FBIMG log); an old picture
  const fbInsert = 'INSERT INTO feedback (id, listener_id, kind, body, app_version, created_at) VALUES ($1, $2, $3, $4, $5, $6)';
  await q(fbInsert, [id(0x201), null, 'bug', 'The sleep timer stopped one minute early.', null, ago(48)]);
  await q(fbInsert, [id(0x202), L.bea, 'idea', 'Could the heat curve show replies too?', '1.4.0', ago(3)]);
  await q(fbInsert, [id(0x203), L.cy, 'bug', 'The cover looked stretched on my tablet.', '1.2.1', ago(24 * 100)]);
  const fiInsert = 'INSERT INTO feedback_images (feedback_id, n, mime, bytes, created_at) VALUES ($1, $2, $3, $4, $5)';
  await q(fiInsert, [id(0x202), 1, 'image/jpeg', img(1, 1200), ago(3)]);
  await q(fiInsert, [id(0x202), 2, 'image/png', img(2, 800), ago(3)]);
  await q(fiInsert, [id(0x203), 1, 'image/png', img(3, 500), ago(24 * 100)]); // past 90 days: the sweep's next run takes it

  // ---- our own error log: a phone error with a sender and a stack; an old server error with neither
  await q(`INSERT INTO error_reports (id, listener_id, scope, message, stack, app_version, platform, count, first_seen, last_seen)
           VALUES ($1, $2, 'player', 'Playback stalled at 00:41', 'at Player.tick (player.ts:120)', '1.4.0', 'ios', 3, $3, $4)`, [id(0x301), L.bea, ago(30), ago(2)]);
  await q(`INSERT INTO error_reports (id, listener_id, scope, message, stack, app_version, platform, count, first_seen, last_seen)
           VALUES ($1, NULL, 'server', 'unknown error', NULL, '', 'server', 1, $2, $2)`, [id(0x302), ago(24 * 40)]);

  // ---- interests, "not liking these?", stickers, the synced queue, linked sign-in accounts
  await q('INSERT INTO listener_interests (listener_id, genre_ids, skipped_at, updated_at) VALUES ($1, $2::int[], NULL, $3)', [L.bea, [1301, 1304], ago(20)]);
  await q('INSERT INTO listener_interests (listener_id, genre_ids, skipped_at, updated_at) VALUES ($1, $2::int[], $3, $3)', [L.cy, [], ago(10)]);
  await q('INSERT INTO rec_feedback (id, listener_id, reason, note, created_at) VALUES ($1, $2, $3, $4, $5)', [id(0x401), L.bea, 'long', 'Mostly over an hour.', ago(15)]);
  await q('INSERT INTO rec_feedback (id, listener_id, reason, note, created_at) VALUES ($1, $2, $3, $4, $5)', [id(0x402), L.cy, 'other', null, ago(9)]);
  const stInsert = 'INSERT INTO sticker_placements (listener_id, sticker_id, x, y, scale, rot, z, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
  await q(stInsert, [L.bea, 'star', 0.25, 0.5, 1, 0, 1, ago(40)]);
  await q(stInsert, [L.bea, 'moon', 0.75, 0.3, 1.5, 0.5, 2, ago(40)]);
  await q(stInsert, [L.eli, 'leaf', 0.1, 0.9, 0.75, -1, 0, ago(70)]);
  await q('INSERT INTO queues (listener_id, items, version, device_id, updated_at) VALUES ($1, ($2::text)::jsonb, $3, $4, $5)',
    [L.bea, JSON.stringify([b.ep('bamboo').id, b.ep('tootle').id, b.ep('cycle').id]), 3, 'phone-1', ago(6)]);
  await q('INSERT INTO queues (listener_id, items, version, device_id, updated_at) VALUES ($1, ($2::text)::jsonb, $3, $4, $5)', [L.cy, '[]', 0, null, ago(80)]);
  await q('INSERT INTO listener_identities (provider, subject, listener_id, email, created_at) VALUES ($1, $2, $3, $4, $5)', ['google', 'g-1000001', L.bea, 'bea.reads@gmail.example.test', ago(500)]);
  await q('INSERT INTO listener_identities (provider, subject, listener_id, email, created_at) VALUES ($1, $2, $3, $4, $5)', ['facebook', 'fb-2000002', L.cy, null, ago(200)]);

  // ---- deletions: Jo's waits (hidden meanwhile), Fay kept her account
  await q('INSERT INTO account_deletions (listener_id, requested_at, due_at, cancelled_at) VALUES ($1, $2, $3, NULL)', [L.jo, ago(24), ago(-24 * 14)]);
  await q('INSERT INTO account_deletions (listener_id, requested_at, due_at, cancelled_at) VALUES ($1, $2, $3, $4)', [L.fay, ago(24 * 5), ago(-24 * 10), ago(24 * 4)]);

  // ---- rate windows and app use
  await q('INSERT INTO rate_counters (key, window_start, count) VALUES ($1, $2, $3)', ['code:ip:203.0.113.7', ago(0.01), 2]);
  await q('INSERT INTO rate_counters (key, window_start, count) VALUES ($1, $2, $3)', ['code:global', ago(30), 41]);
  await q('INSERT INTO daily_active (day, listener_id) VALUES ($1::date, $2)', [today, L.bea]);
  await q('INSERT INTO daily_active (day, listener_id) VALUES ($1::date, $2)', [yesterday, L.bea]);
  await q('INSERT INTO daily_active (day, listener_id) VALUES ($1::date, $2)', [yesterday, L.cy]);
}
