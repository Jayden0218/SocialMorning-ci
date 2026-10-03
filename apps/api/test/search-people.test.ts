// Tests people search: names only, prefix first, at most 20, hides blocked.
/** Owner, 2026-10-01: GET /v1/search/people — names only, suspended and blocked listeners not found, prefix first, at most 20. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, type TestDb } from './harness.ts';

type Body = { listeners: { id: string; displayName: string }[] };
const find = async (t: TestDb, q: string, token?: string): Promise<Body> =>
  (await (await t.call('GET', `/v1/search/people?q=${encodeURIComponent(q)}`, undefined, token)).json()) as Body;

test('search/people: case-insensitive, prefix first, only id + displayName; suspended, blocked (both ways) and self not found; %/_ are literal', async () => {
  const t = await freshDb();
  const me = await signUp(t, 'me@example.com', 'Anna Me');
  const ann = await signUp(t, 'ann@example.com', 'Ann Lee');
  const joanna = await signUp(t, 'jo@example.com', 'Joanna');
  const sus = await signUp(t, 'sus@example.com', 'Annie Gone');
  const blocker = await signUp(t, 'bl@example.com', 'Annabel');
  const blocked = await signUp(t, 'bd@example.com', 'Annika');
  await signUp(t, 'pct@example.com', 'Ann 100%');

  // Anonymous: everyone named like "ann" but the suspended one; the prefix names first.
  await t.q('UPDATE listeners SET suspended_at = now() WHERE id = $1', [sus.id]);
  const anon = await find(t, 'ANN');
  assert.ok(!anon.listeners.some((l) => l.id === sus.id), 'a suspended account is not found');
  assert.equal(anon.listeners.at(-1)!.id, joanna.id, '"Joanna" only contains the term, so it comes last');
  assert.deepEqual(Object.keys(anon.listeners[0]!).sort(), ['displayName', 'id'], 'no other field leaves the server');
  assert.ok(anon.listeners.some((l) => l.id === ann.id));

  // Signed in: not yourself, not someone who blocked you, not someone you blocked.
  assert.equal((await t.call('POST', '/v1/me/blocks', { listenerId: me.id }, blocker.token)).status, 201);
  assert.equal((await t.call('POST', '/v1/me/blocks', { listenerId: blocked.id }, me.token)).status, 201);
  const mine = (await find(t, 'ann', me.token)).listeners.map((l) => l.id);
  assert.ok(!mine.includes(me.id), 'not yourself');
  assert.ok(!mine.includes(blocker.id), 'not someone who blocked you');
  assert.ok(!mine.includes(blocked.id), 'not someone you blocked');
  assert.ok(mine.includes(ann.id) && mine.includes(joanna.id));

  // A wildcard is a character, not a pattern: an unescaped `_` would match the space in "Ann 100%".
  assert.deepEqual(await find(t, 'Ann_100'), { listeners: [] });
  assert.deepEqual((await find(t, '100%')).listeners.map((l) => l.displayName), ['Ann 100%']);
  // Validation.
  assert.equal((await t.call('GET', '/v1/search/people?q=')).status, 422);
  assert.deepEqual(await find(t, '!!'), { listeners: [] });
  await t.close();
});

test('search/people: at most 20', async () => {
  const t = await freshDb();
  await t.q(`INSERT INTO listeners (email, password_hash, display_name)
    SELECT 'p' || i || '@example.com', 'x', 'Pat ' || lpad(i::text, 2, '0') FROM generate_series(1, 23) AS i`);
  assert.equal((await find(t, 'pat')).listeners.length, 20);
  await t.close();
});
