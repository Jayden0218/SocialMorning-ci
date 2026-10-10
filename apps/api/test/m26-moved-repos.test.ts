// Tests the repo functions M26 F0-01 moved out of routes that no other test reaches (refunds, take-down, translation upkeep).
/**
 * Lane F0 moved every inline query into `src/db/repos/`. A query that sat inside an untested route
 * branch counted as no function before; as a repo function it does, and the coverage floor
 * (apps/api/.c8rc.json, functions 97.7 %) fell to 97.65 % (run 37996422002). These tests call
 * those functions on a real migrated database and check what each one writes or reads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, TEST_PEPPER } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { jobView, seedJob, translationShowCount } from './sf-neutral-tr.ts';
import { tokenHash } from '../src/auth/session.ts';
import { clearSecondFactorCode } from '../src/db/repos/account/second-factor.ts';
import { lastVoidedCheckRows, saveVoidedCheck } from '../src/db/repos/account/purchases.ts';
import { hiddenEpisodeRows, pickEpisodeRows } from '../src/db/repos/library/daily-pick.ts';
import { finishTakedown, markHostedShowDeleted } from '../src/db/repos/safety/mod-shows.ts';
import {
  addTranslationShow, failTranslationJob, recordTranslationJobError, removeTranslationShow,
  requeueFailedTranslationJob, saveFeedTranscriptSegments,
} from '../src/db/repos/safety/translation.ts';

const FEED = 'https://feeds.example.com/m26.xml';
const ep = (guid: string, publishedAt: string) => ({ feedUrl: FEED, guid, title: `Ep ${guid}`, showTitle: 'M26 Show', enclosureUrl: `https://cdn.example.com/${guid}.mp3`, publishedAt });
const idOf = (guid: string) => fnv1a64(FEED + '\u0001' + guid);
/** The `postgres` driver answers a `Result` array; compare plain rows on both drivers. */
const plain = <T extends object>(rows: T[]): T[] => rows.map((r) => ({ ...r }));

test('the Google refund check: nothing read yet, then the last refund and its time are kept', async () => {
  const t = await freshDb();
  try {
    assert.deepEqual([...await lastVoidedCheckRows(t.db)], []);
    await saveVoidedCheck(t.db, { last: 'a' });
    await saveVoidedCheck(t.db, { last: 'b' });
    const [row] = await lastVoidedCheckRows(t.db);
    assert.ok(row && !Number.isNaN(new Date(row.fetched_at).getTime()));
    const [cached] = await t.q<{ body: unknown }>("SELECT body FROM cache WHERE key = 'billing:voided'");
    assert.deepEqual(cached?.body, { last: 'b' });
  } finally { await t.close(); }
});

test('a used-up second-factor code is cleared from its session only', async () => {
  const t = await freshDb();
  try {
    const a = await signUp(t, 'a@example.com');
    const b = await signUp(t, 'b@example.com', 'Bea');
    await t.q("UPDATE sessions SET second_factor_code = 'x'");
    await clearSecondFactorCode(t.db, tokenHash(a.token, TEST_PEPPER));
    const rows = await t.q<{ listener_id: string; second_factor_code: unknown }>('SELECT listener_id, second_factor_code FROM sessions ORDER BY listener_id');
    assert.equal(rows.find((r) => r.listener_id === a.id)?.second_factor_code, null);
    assert.notEqual(rows.find((r) => r.listener_id === b.id)?.second_factor_code, null);
  } finally { await t.close(); }
});

test("the day's pick: the named episode, else the feed's newest; a show-hidden episode is seen", async () => {
  const t = await freshDb();
  try {
    await putEpisode(t, idOf('old'), ep('old', '2026-01-01T00:00:00Z'));
    await putEpisode(t, idOf('new'), ep('new', '2026-02-01T00:00:00Z'));
    assert.deepEqual(plain(await pickEpisodeRows(t.db, { feedUrl: FEED, guid: 'old' })), [{ id: idOf('old'), title: 'Ep old' }]);
    assert.deepEqual(plain(await pickEpisodeRows(t.db, { feedUrl: FEED })), [{ id: idOf('new'), title: 'Ep new' }]);
    assert.equal((await hiddenEpisodeRows(t.db, idOf('old'))).length, 0);
    await t.q('INSERT INTO hidden_episodes (feed_url, guid) VALUES ($1, $2)', [FEED, 'old']);
    assert.equal((await hiddenEpisodeRows(t.db, idOf('old'))).length, 1);
  } finally { await t.close(); }
});

test('a Studio show take-down: marked deleted once, its episodes go, and the hide is recorded', async () => {
  const t = await freshDb();
  try {
    const owner = await signUp(t);
    const [show] = await t.q<{ id: string }>("INSERT INTO hosted_shows (owner_id, feed_url, title) VALUES ($1, $2, 'Mine') RETURNING id", [owner.id, FEED]);
    assert.deepEqual(plain(await markHostedShowDeleted(t.db, show!.id)), [{ feed_url: FEED }]);
    assert.deepEqual(plain(await markHostedShowDeleted(t.db, show!.id)), [], 'a second take-down finds nothing live');
    await finishTakedown(t.db, show!.id, FEED, owner.id);
    const acts = await t.q<{ action: string; target_kind: string; target_id: string }>('SELECT action, target_kind, target_id FROM moderation_actions');
    assert.deepEqual(plain(acts), [{ action: 'hide_show', target_kind: 'show', target_id: FEED }]);
  } finally { await t.close(); }
});

test('translation upkeep: errors fail a job at the limit, a failed job is re-queued, feed transcripts skip to translating, the allow-list', async () => {
  const t = await freshDb();
  try {
    const owner = await signUp(t);
    const state = () => jobView(t, 'e1', 'en');
    await seedJob(t, 'e1', 'en');
    await recordTranslationJobError(t.db, 'e1', 'en', 1, 'slow', 3);
    assert.deepEqual({ ...await state() }, { state: 'queued', errors: 1, error: 'slow', source_lang: null });
    await recordTranslationJobError(t.db, 'e1', 'en', 3, 'gone', 3);
    assert.equal((await state())?.state, 'failed');
    await requeueFailedTranslationJob(t.db, 'e1', 'en');
    assert.deepEqual({ ...await state() }, { state: 'queued', errors: 0, error: null, source_lang: null });
    await failTranslationJob(t.db, 'e1', 'en', 'too long');
    assert.deepEqual({ ...await state() }, { state: 'failed', errors: 0, error: 'too long', source_lang: null });
    await saveFeedTranscriptSegments(t.db, 'e1', 'en', JSON.stringify([{ start: 0, end: 1, text: 'Hi' }]), 'fr');
    assert.deepEqual({ ...await state() }, { state: 'translating', errors: 0, error: 'too long', source_lang: 'fr' });
    await addTranslationShow(t.db, FEED, owner.id);
    await addTranslationShow(t.db, FEED, owner.id);
    assert.equal(await translationShowCount(t), 1);
    await removeTranslationShow(t.db, FEED);
    assert.equal(await translationShowCount(t), 0);
  } finally { await t.close(); }
});
