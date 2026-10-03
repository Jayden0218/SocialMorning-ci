// Tests Studio extras: drafts, scheduling, host invites, contacts, media library, show card.
/**
 * M14 — Studio parity (specs/014-m14-studio-parity).
 *
 * The breaks that turn the guards red:
 *   G-I1 (an expired, used or revoked invite is refused): in `src/db/repos/studio/show-hosts.ts` `acceptInvite`,
 *        drop the `expires_at` check.
 *   G-S1 (a scheduled episode is not in the feed before its time): in `src/routes/creators/feeds.ts`, drop `liveOnly: true`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash } from '@socialmorning/social-core';
import { parseFeed } from '@socialmorning/feed-parser';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { sCall, studioLogin, type StudioUser } from './studio-harness.ts';
import { fakeStore } from './fake-store.ts';

async function setup() {
  const store = fakeStore();
  const down = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
  const t = await freshDb({ episodeStorage: store, publicBase: 'https://api.example.test', catalogFetch: down } as never);
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const made = (await (await sCall(t, 'POST', '/v1/studio/hosted-shows', owner, { title: 'Parity Show' })).json()) as { show: { id: string; feedUrl: string }; shows: { key: string }[] };
  return { t, store, owner, show: made.show, key: made.shows[0]!.key };
}

async function uploadFile(t: TestDb, store: ReturnType<typeof fakeStore>, who: StudioUser, key: string, kind: 'audio' | 'cover') {
  const type = kind === 'audio' ? 'audio/mpeg' : 'image/png';
  const tok = (await (await sCall(t, 'POST', `/v1/studio/shows/${key}/uploads`, who, { kind, contentType: type, size: 1000 })).json()) as { pathname: string };
  return store.put(tok.pathname, 1000, type);
}

const feedOf = async (t: TestDb, show: { id: string; feedUrl: string }) =>
  parseFeed(await (await t.call('GET', `/feeds/${show.id}.xml`)).text(), show.feedUrl, { hash });

test('G-S1: a draft and a scheduled episode stay out of the feed; publishing the draft puts it in', async () => {
  const { t, store, owner, show, key } = await setup();
  const draft = await sCall(t, 'POST', `/v1/studio/shows/${key}/hosted-episodes`, owner, { title: 'Draft one', audioUrl: await uploadFile(t, store, owner, key, 'audio'), status: 'draft' });
  assert.equal(draft.status, 201);
  const later = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const sched = await sCall(t, 'POST', `/v1/studio/shows/${key}/hosted-episodes`, owner, { title: 'Later one', audioUrl: await uploadFile(t, store, owner, key, 'audio'), publishAt: later });
  assert.equal(((await sched.json()) as { episode: { scheduled: boolean } }).episode.scheduled, true);
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/hosted-episodes`, owner, { title: 'x', audioUrl: await uploadFile(t, store, owner, key, 'audio'), publishAt: new Date(Date.now() + 100 * 86_400_000).toISOString() })).status, 422, 'more than 90 days ahead');
  assert.equal((await feedOf(t, show)).episodes.length, 0);
  assert.equal((await t.q('SELECT count(*)::int AS n FROM episodes WHERE feed_url = $1', [show.feedUrl]))[0]!.n, 0, 'not in the app early');

  const id = ((await draft.json()) as { episode: { id: string } }).episode.id;
  assert.equal((await sCall(t, 'PUT', `/v1/studio/shows/${key}/hosted-episodes/${id}`, owner, { status: 'published' })).status, 200);
  assert.deepEqual((await feedOf(t, show)).episodes.map((e) => e.title), ['Draft one']);
  // Time passes: the scheduled one becomes live when anything reads the show.
  await t.q("UPDATE hosted_episodes SET published_at = now() - interval '1 minute' WHERE title = 'Later one'");
  assert.deepEqual((await feedOf(t, show)).episodes.map((e) => e.title).sort(), ['Draft one', 'Later one']);
  await t.close();
});

test('an episode can have its own cover, uploaded to this show', async () => {
  const { t, store, owner, show, key } = await setup();
  const cover = await uploadFile(t, store, owner, key, 'cover');
  const r = await sCall(t, 'POST', `/v1/studio/shows/${key}/hosted-episodes`, owner, { title: 'With cover', audioUrl: await uploadFile(t, store, owner, key, 'audio'), coverUrl: cover });
  assert.equal(r.status, 201);
  assert.match(await (await t.call('GET', `/feeds/${show.id}.xml`)).text(), new RegExp(`<itunes:image href="${cover.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"/>`));
  const stray = store.put('covers/other-show/x.png', 10, 'image/png');
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/hosted-episodes`, owner, { title: 'Bad', audioUrl: await uploadFile(t, store, owner, key, 'audio'), coverUrl: stray })).status, 422);
  await t.close();
});

test('G-I1: an invite link works once, for 4 days, and only until revoked; hosts get the Host mark', async () => {
  const { t, owner, key, show } = await setup();
  const inv = (await (await sCall(t, 'POST', `/v1/studio/shows/${key}/host-invites`, owner)).json()) as { url: string; expiresAt: string };
  assert.match(inv.url, /\/invite\/[A-Za-z0-9_-]{32}$/);
  const token = inv.url.split('/').pop()!;
  const host = await studioLogin(t, 'h@example.com', 'Hana');
  assert.equal(((await (await sCall(t, 'GET', `/v1/studio/invites/${token}`, host)).json()) as { state: string; showTitle: string }).state, 'open');
  assert.equal((await sCall(t, 'POST', `/v1/studio/invites/${token}/accept`, host)).status, 200);
  const again = await studioLogin(t, 'x@example.com', 'Xu');
  const used = await sCall(t, 'POST', `/v1/studio/invites/${token}/accept`, again);
  assert.deepEqual([used.status, ((await used.json()) as { reason: string }).reason], [409, 'used']);
  assert.deepEqual(((await (await sCall(t, 'GET', `/v1/studio/shows/${key}/hosts`, owner)).json()) as { hosts: { displayName: string }[] }).hosts.map((h) => h.displayName), ['Hana']);

  const inv2 = (await (await sCall(t, 'POST', `/v1/studio/shows/${key}/host-invites`, owner)).json()) as { url: string };
  await t.q("UPDATE show_invites SET expires_at = now() - interval '1 second' WHERE used_at IS NULL");
  const late = await sCall(t, 'POST', `/v1/studio/invites/${inv2.url.split('/').pop()}/accept`, again);
  assert.deepEqual([late.status, ((await late.json()) as { reason: string }).reason], [409, 'expired']);
  const inv3 = (await (await sCall(t, 'POST', `/v1/studio/shows/${key}/host-invites`, owner)).json()) as { id: string; url: string };
  assert.equal((await sCall(t, 'DELETE', `/v1/studio/shows/${key}/host-invites/${inv3.id}`, owner)).status, 204);
  assert.equal((await sCall(t, 'POST', `/v1/studio/invites/${inv3.url.split('/').pop()}/accept`, again)).status, 404, 'revoked');
  assert.equal((await sCall(t, 'POST', '/v1/studio/invites/not-a-real-token/accept', again)).status, 404);

  // The host's comment carries the Host mark in the app.
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, enclosure_url) VALUES ('ep1', $1, 'g', 'E', 'https://x/a.mp3')", [show.feedUrl]);
  const hostToken = (await (await t.call('POST', '/v1/auth/sign-in', { email: 'h@example.com', password: 'correct horse' })).json()) as { token: string };
  await t.call('POST', '/v1/episodes/ep1/comments', { body: 'Hi from the host' }, hostToken.token);
  const listener = await signUp(t, 'l@example.com', 'L');
  const thread = (await (await t.call('GET', '/v1/episodes/ep1/social', undefined, listener.token)).json()) as { comments: { body: string; host?: true }[] };
  assert.deepEqual(thread.comments.map((c) => [c.body, c.host]), [['Hi from the host', true]]);
  const extras = (await (await t.call('GET', `/v1/shows/extras?feedUrl=${encodeURIComponent(show.feedUrl)}`)).json()) as { hostAccounts: { displayName: string }[] };
  assert.deepEqual(extras.hostAccounts.map((h) => h.displayName), ['Hana']);
  await t.close();
});

test('typed contacts are checked for their type; the tips switch reaches the app', async () => {
  const { t, owner, key, show } = await setup();
  const put = (body: unknown) => sCall(t, 'PUT', `/v1/studio/shows/${key}/overrides`, owner, body);
  assert.equal((await put({ contacts: [{ type: 'email', value: 'not-an-email' }] })).status, 422);
  assert.equal((await put({ contacts: [{ type: 'weibo', value: 'http://insecure.example' }] })).status, 422);
  assert.equal((await put({ contacts: [{ type: 'fax', value: '123' }] })).status, 422);
  assert.equal((await put({ contacts: [{ type: 'wechat_official', value: '早安电台' }, { type: 'email', value: 'hi@example.com' }, { type: 'website', value: 'https://example.com' }], tipsEnabled: true })).status, 200);
  const extras = (await (await t.call('GET', `/v1/shows/extras?feedUrl=${encodeURIComponent(show.feedUrl)}`)).json()) as { overrides: { contacts: { type: string }[] }; tipsEnabled: boolean };
  assert.deepEqual([extras.overrides.contacts.map((c) => c.type), extras.tipsEnabled], [['wechat_official', 'email', 'website'], true]);
  await t.close();
});

test('media library: every stored file with whether it is in use; an in-use file cannot be deleted', async () => {
  const { t, store, owner, key } = await setup();
  const used = await uploadFile(t, store, owner, key, 'audio');
  await sCall(t, 'POST', `/v1/studio/shows/${key}/hosted-episodes`, owner, { title: 'Live', audioUrl: used });
  const orphan = await uploadFile(t, store, owner, key, 'cover');
  const m = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/media`, owner)).json()) as { files: { url: string; usedBy: string | null; kind: string }[]; usedBytes: number };
  assert.deepEqual(m.files.map((f) => [f.kind, f.usedBy]).sort(), [['audio', 'Live'], ['image', null]]);
  assert.equal(m.usedBytes, 2000);
  assert.equal((await sCall(t, 'DELETE', `/v1/studio/shows/${key}/media`, owner, { url: used })).status, 409);
  assert.equal((await sCall(t, 'DELETE', `/v1/studio/shows/${key}/media`, owner, { url: orphan })).status, 204);
  assert.deepEqual(store.removed, [orphan]);
  await t.close();
});

test('sparklines: 14 points per stat on the overview, matching the trend', async () => {
  const { t, owner, key } = await setup();
  const o = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/overview?tz=UTC`, owner)).json()) as { sparklines: Record<string, number[]> };
  assert.deepEqual(Object.keys(o.sparklines).sort(), ['comments', 'likes', 'plays', 'saves', 'shares', 'subs']);
  assert.ok(Object.values(o.sparklines).every((s) => s.length === 14));
  await t.close();
});

test('the show card is public, escapes text, and 404s for an unknown show', async () => {
  const { t, owner, key } = await setup();
  await sCall(t, 'PUT', `/v1/studio/shows/${key}/details`, owner, { title: 'Parity <b>Show</b>', description: 'About & more' });
  const r = await t.call('GET', `/show/${key}`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /Parity &lt;b&gt;Show&lt;\/b&gt;/);
  assert.match(html, /socialmorning:\/\/show\//);
  assert.equal((await t.call('GET', '/show/0000000000000000')).status, 404);
  await t.close();
});

test('overrides written as a JSON string (the postgres driver, before the fix) read back as lists', async () => {
  const t = await freshDb();
  const feed = 'https://feeds.example.com/old.xml';
  await t.q(`INSERT INTO show_overrides (feed_url, hosts, links, contacts) VALUES ($1, to_jsonb($2::text), to_jsonb($3::text), to_jsonb($4::text))`,
    [feed, '["Mei"]', '[{"label":"Site","url":"https://x.example"}]', '[{"type":"email","value":"a@b.co"}]']);
  const { getOverrides } = await import('../src/db/repos/studio/show-overrides.ts');
  const o = await getOverrides(t.db, feed);
  assert.deepEqual([o!.hosts, o!.links, o!.contacts], [['Mei'], [{ label: 'Site', url: 'https://x.example' }], [{ type: 'email', value: 'a@b.co' }]]);
  await t.close();
});
