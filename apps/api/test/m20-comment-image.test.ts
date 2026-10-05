// Tests comment images: the R2 signing, who may add one, the limits, and deletion from the store.
/**
 * M20 US9 (spec FR-053–FR-055; constitution v3.2.0). Guard G-M20-8: an image leaves the store
 * when its comment is deleted, removed by moderation, or its author's account is deleted. The
 * break that turns it red: drop the `images.remove` line in the DELETE route of
 * src/routes/social/comments.ts. The real R2 bucket is NOT VERIFIED here (fake store; quickstart B13).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { freshDb, signUp } from './harness.ts';
import { r2ImageStorage, sigV4, type ImageStorage } from '../src/storage/image-store.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

function fakeStore(ready = true) {
  const puts: string[] = [];
  const removed: string[] = [];
  const store: ImageStorage = {
    ready,
    put: async (path) => { puts.push(path); return { url: `https://pub.example/${path}`, pathname: path }; },
    remove: async (path) => { removed.push(path); },
  };
  return { store, puts, removed };
}

test('sigV4 matches AWS\'s own test vector (aws4_testsuite get-vanilla, as shipped in botocore)', () => {
  const auth = sigV4({
    method: 'GET', host: 'example.amazonaws.com', path: '/', payloadHash: createHash('sha256').update('').digest('hex'),
    region: 'us-east-1', service: 'service', amzDate: '20150830T123600Z',
    accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  });
  assert.equal(auth, 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
});

test('the R2 store: not ready without its env; a PUT goes to the bucket, signed for auto/s3; the public address comes back', async () => {
  assert.equal(r2ImageStorage({}).ready, false);
  const seen: { url: string; method: string; auth: string; sha: string }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    seen.push({ url, method: String(init.method), auth: h['authorization']!, sha: h['x-amz-content-sha256']! });
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  const s = r2ImageStorage({ R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'socialmorning-images', R2_PUBLIC_BASE: 'https://pub-x.r2.dev/' }, f, () => new Date('2026-10-06T01:02:03Z'));
  assert.equal(s.ready, true);
  const out = await s.put('comments/a/b.jpg', JPEG, 'image/jpeg');
  assert.deepEqual(out, { url: 'https://pub-x.r2.dev/comments/a/b.jpg', pathname: 'comments/a/b.jpg' });
  assert.equal(seen[0]!.url, 'https://acct.r2.cloudflarestorage.com/socialmorning-images/comments/a/b.jpg');
  assert.equal(seen[0]!.method, 'PUT');
  assert.match(seen[0]!.auth, /^AWS4-HMAC-SHA256 Credential=key\/20261006\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  assert.equal(seen[0]!.sha, createHash('sha256').update(JPEG).digest('hex'));
  await s.remove('comments/a/b.jpg');
  assert.equal(seen[1]!.method, 'DELETE');
});

async function setup(store: ImageStorage) {
  const t = await freshDb({ imageStorage: store, jobToken: 'job-token-not-secret' });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url) VALUES ('e1','https://f/x.xml','g','Ep','Show','https://c/x.mp3')");
  const comment = async (token: string) => ((await (await t.call('POST', '/v1/episodes/e1/comments', { body: 'look', offsetMs: 1000 }, token)).json()) as { comment: { id: string } }).comment.id;
  const add = (id: string, token: string, bytes: Uint8Array = JPEG, w = '640', h = '480') =>
    t.app.request(`/v1/comments/${id}/image`, { method: 'POST', body: bytes as unknown as BodyInit, headers: { 'content-type': 'image/jpeg', 'x-width': w, 'x-height': h, authorization: `Bearer ${token}` } });
  return { t, a, b, comment, add };
}

test('FR-053: the author adds one JPEG within 10 minutes; others see it; not someone else\'s, not twice, not a fake picture', async () => {
  const f = fakeStore();
  const { t, a, b, comment, add } = await setup(f.store);
  assert.deepEqual(await (await t.call('GET', '/v1/comments/images')).json(), { on: true });
  const id = await comment(a.token);
  assert.equal((await add(id, b.token)).status, 403);
  assert.equal((await add(id, a.token, new Uint8Array([1, 2, 3, 4]))).status, 422);
  const ok = await add(id, a.token);
  assert.equal(ok.status, 201, await ok.clone().text());
  assert.ok(f.puts[0]!.startsWith(`comments/${a.id}/`));
  assert.equal((await add(id, a.token)).status, 409);
  const seen = ((await (await t.call('GET', '/v1/episodes/e1/social', undefined, b.token)).json()) as { comments: { id: string; image?: { url: string; w: number; h: number } }[] }).comments;
  assert.deepEqual(seen.find((c) => c.id === id)!.image, { url: `https://pub.example/${f.puts[0]}`, w: 640, h: 480 });
  await t.q("UPDATE comments SET created_at = now() - interval '11 minutes'");
  const late = await comment(a.token);
  await t.q("UPDATE comments SET created_at = now() - interval '11 minutes' WHERE id = $1", [late]);
  assert.equal((await add(late, a.token)).status, 422);
  await t.close();
});

test('FR-054: without the store\'s env, no image is taken and the phone is told so', async () => {
  const f = fakeStore(false);
  const { t, a, comment, add } = await setup(f.store);
  assert.deepEqual(await (await t.call('GET', '/v1/comments/images')).json(), { on: false });
  const id = await comment(a.token);
  assert.equal((await add(id, a.token)).status, 503);
  await t.close();
});

test('G-M20-8: deleted, removed by moderation, or the author\'s account deleted → the image leaves the store', async () => {
  const f = fakeStore();
  const { t, a, b, comment, add } = await setup(f.store);
  const one = await comment(a.token);
  await add(one, a.token);
  assert.equal((await t.call('DELETE', `/v1/comments/${one}`, undefined, a.token)).status, 200);
  assert.deepEqual(f.removed, [f.puts[0]]);

  await t.q("UPDATE comments SET created_at = now() - interval '1 minute'");
  const two = await comment(a.token);
  await add(two, a.token);
  await t.q('UPDATE comments SET removed_at = now() WHERE id = $1', [two]);
  await t.call('POST', '/v1/internal/rebuild', { step: 'feeds' }, undefined, { authorization: 'Bearer job-token-not-secret' });
  assert.ok(f.removed.includes(f.puts[1]!), 'the sweep deleted the removed one');
  const [row] = await t.q<{ image_path: string | null }>('SELECT image_path FROM comments WHERE id = $1', [two]);
  assert.equal(row!.image_path, null);

  const three = await comment(b.token);
  await add(three, b.token);
  assert.equal((await t.call('DELETE', '/v1/me', { password: 'correct horse' }, b.token)).status, 200);
  assert.ok(f.removed.includes(f.puts[2]!), 'the account\'s image went before the account');
  await t.close();
});
