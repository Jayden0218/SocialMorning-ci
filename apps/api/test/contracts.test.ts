// M25 G8: the real answers of the routes the phone reads match packages/contracts (the phone half is apps/mobile/__tests__/contracts.test.ts).
/**
 * One account does what a phone does — signs in, comments, gets a reply, follows, is sent a system
 * notice, buys — and every answer the phone reads is checked against its JSON Schema. The schemas'
 * examples are checked too, so an example the phone test feeds in can never drift from its schema.
 *
 * The break that turns it red (seen on lane-gb-red, tasks.md GB): rename one field in an answer,
 * e.g. `displayName` → `name` in `publicListener` (src/auth/session.ts) — `signIn` and `me` fail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { CONTRACTS, validate, type ContractName } from '../../../packages/contracts/src/index.ts';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { fakeApple } from './fake-apple.ts';
import { insertNotice } from '../src/db/repos/social/system-notices.ts';

const ep = { feedUrl: 'https://feeds.example.com/contract.xml', guid: 'c1', title: 'Ep C', showTitle: 'Contract Show', enclosureUrl: 'https://cdn.example.com/c1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

const ok = (name: ContractName, body: unknown) =>
  assert.deepEqual(validate(CONTRACTS[name].schema, body), [], `${name}: the real answer does not match packages/contracts (${JSON.stringify(body).slice(0, 400)})`);

async function get(t: TestDb, path: string, token?: string): Promise<unknown> {
  const r = await t.call('GET', path, undefined, token);
  assert.equal(r.status, 200, `${path} → ${r.status} ${await r.clone().text()}`);
  return r.json();
}

test('every contract example matches its own schema, and every schema is plain JSON', () => {
  for (const [name, c] of Object.entries(CONTRACTS)) {
    assert.deepEqual(validate(c.schema, c.example), [], `${name}: example does not match its schema`);
    assert.deepEqual(JSON.parse(JSON.stringify(c.schema)), c.schema, `${name}: schema is not plain JSON`);
  }
});

test('the real answers the phone reads match their contracts', async () => {
  const t = await freshDb({ catalogFetch: fakeApple().fetch, picksRaw: [] });
  await putEpisode(t, EP, { ...ep, durationMs: 2_000_000 });
  await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bea');

  // signIn: the same answer as code/verify (token + listener).
  const signedIn = await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' });
  assert.equal(signedIn.status, 200);
  const s = (await signedIn.json()) as { token: string; listener: { id: string } };
  ok('signIn', s);
  const a = { token: s.token, id: s.listener.id };

  ok('me', await get(t, '/v1/me', a.token));

  // Alex comments at 0:20, Bea replies (a notice for Alex); Alex follows Bea (her reply is in his feed).
  const post = async (who: { token: string; id: string }, body: string, parentId?: string) => {
    await t.q(`UPDATE comments SET created_at = created_at - interval '1 minute' WHERE author_id = $1`, [who.id]);
    const r = await t.call('POST', `/v1/episodes/${EP}/comments`, { body, offsetMs: 20_000, ...(parentId ? { parentId } : {}) }, who.token);
    assert.equal(r.status, 200, await r.clone().text());
    return ((await r.json()) as { comment: { id: string } }).comment.id;
  };
  const root = await post(a, 'At 0:20 — love it');
  await post(b, 'Same', root);
  assert.equal((await t.call('PUT', `/v1/comments/${root}/like`, undefined, b.token)).status, 200);
  assert.equal((await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, a.token)).status, 204);

  const social = (await get(t, `/v1/episodes/${EP}/social`, a.token)) as { comments: unknown[] };
  assert.ok(social.comments.length > 0);
  ok('social', social);

  const feed = (await get(t, '/v1/me/feed', a.token)) as { items: unknown[] };
  assert.ok(feed.items.length > 0, 'the feed has Bea\'s reply');
  ok('feed', feed);

  ok('discover', await get(t, '/v1/discover', a.token));
  ok('config', await get(t, '/v1/config'));
  const academy = (await get(t, '/v1/content/academy')) as { items: unknown[] };
  assert.ok(academy.items.length > 0, 'migration 029 seeds the Academy');
  ok('content', academy);

  const inbox = (await get(t, '/v1/me/notifications', a.token)) as { items: unknown[] };
  assert.ok(inbox.items.length >= 2, 'a reply and a like');
  ok('notifications', inbox);

  await insertNotice(t.db, { title: 'Welcome', body: 'Hello from SocialNet.', link: { label: 'Open Discover', route: '/discover' } });
  await insertNotice(t.db, { title: 'Yours', body: 'Only for you.', listenerId: a.id });
  const sys = (await get(t, '/v1/me/notifications/system', a.token)) as { items: unknown[] };
  assert.equal(sys.items.length, 2);
  ok('systemNotices', sys);

  const [p] = await t.q<{ id: string }>(
    `INSERT INTO purchases (listener_id, store, product_id, store_txn_id, status, expires_at, amount_micros, currency)
     VALUES ($1, 'google', 'plus_month', 'txn-contract-1', 'active', now() + interval '30 days', 9900000, 'MYR') RETURNING id`, [a.id]);
  await t.q('INSERT INTO tips (from_listener, to_feed_url, purchase_id) VALUES ($1, $2, $3)', [a.id, ep.feedUrl, p!.id]);
  const purchases = (await get(t, '/v1/me/purchases', a.token)) as { items: unknown[] };
  assert.ok(purchases.items.length > 0);
  ok('purchases', purchases);
  const tips = (await get(t, '/v1/me/tips', a.token)) as { items: unknown[] };
  assert.ok(tips.items.length > 0);
  ok('tips', tips);
  await t.close();
});
