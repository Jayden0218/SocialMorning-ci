/** quickstart A10: the shareable link page and the App Links statement (research R1). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';
import { assetLinks } from '../src/pages/clip.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Casey <Wants> to Believe', showTitle: 'Reply All', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

test('A10: live → 200 with the title escaped, the caption, the author and "Open in app"; deleted → removed + episode; unknown → 404', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 2_000_000 });
  const a = await signUp(t);
  const c = ((await (await t.call('POST', `/v1/episodes/${EP}/clips`, { clientId: 'k', startMs: 872_000, endMs: 910_000, caption: 'listen "here"' }, a.token)).json()) as { clip: { id: string } }).clip;
  const live = await t.call('GET', `/c/${c.id}`);
  assert.equal(live.status, 200);
  assert.match(live.headers.get('content-type') ?? '', /text\/html/);
  const html = await live.text();
  assert.match(html, /Casey &lt;Wants&gt; to Believe/);
  assert.match(html, /listen &quot;here&quot;/);
  assert.match(html, /Clipped by Alex · 14:32–15:10/);
  assert.match(html, new RegExp(`href="socialmorning://clip/${c.id}"`));
  assert.doesNotMatch(html, /<audio|\.mp3/);
  await t.call('DELETE', `/v1/clips/${c.id}`, undefined, a.token);
  const gone = await t.call('GET', `/c/${c.id}`);
  assert.equal(gone.status, 200);
  assert.match(await gone.text(), /This clip was removed[\s\S]*Casey &lt;Wants&gt;/);
  assert.equal((await t.call('GET', `/c/00000000-0000-4000-8000-000000000000`)).status, 404);
  assert.equal((await t.call('GET', `/c/not-a-uuid`)).status, 404);
  await t.close();
});

test('A10: assetlinks.json is [] until the fingerprint is configured, then the one statement', async () => {
  const t = await freshDb();
  const r = await t.call('GET', '/.well-known/assetlinks.json');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /application\/json/);
  assert.deepEqual(await r.json(), []);
  assert.deepEqual(assetLinks('AA:BB, CC:DD'), [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'app.socialmorning.mobile', sha256_cert_fingerprints: ['AA:BB', 'CC:DD'] } }]);
  assert.deepEqual(assetLinks(undefined), []);
  await t.close();
});
