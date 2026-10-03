/**
 * M10b US6 — feedback with images reaches the owner, and only the owner. An image is at most
 * 250 000 bytes and must really be a JPEG or PNG (its first bytes, not its claimed type).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, type TestDb } from './harness.ts';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]).toString('base64');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');

async function ownerCookie(t: TestDb, email: string): Promise<string> {
  const r = await t.app.request('/mod/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password: 'correct horse' }).toString(), redirect: 'manual' });
  return r.headers.get('set-cookie')!.split(';')[0]!;
}

test('feedback with images: stored, shown to the owner with its images, refused to anyone else', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Al');
  const o = await signUp(t, 'o@example.com', 'Owner');
  t.setOwner!(o.id);
  const r = await t.call('POST', '/v1/feedback', { kind: 'Using the app', body: 'The play button hides', appVersion: '0.1.0', images: [{ mime: 'image/jpeg', base64: JPEG }, { mime: 'image/png', base64: PNG }] }, a.token);
  assert.equal(r.status, 200);
  const { id } = (await r.json()) as { id: string };
  assert.equal((await t.call('POST', '/v1/feedback', { kind: 'Other', body: 'signed out is fine' })).status, 200);

  const cookie = await ownerCookie(t, 'o@example.com');
  const page = await t.app.request('/mod/feedback', { headers: { cookie } });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /The play button hides/);
  assert.match(html, new RegExp(`/mod/feedback/${id}/2`));
  const img = await t.app.request(`/mod/feedback/${id}/1`, { headers: { cookie } });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');

  assert.equal((await t.app.request('/mod/feedback')).status, 403, 'no cookie, no feedback');
  assert.equal((await t.app.request(`/mod/feedback/${id}/1`)).status, 403, 'no cookie, no image');
  await t.close();
});

test('an image too large is 413; a type the bytes do not match is refused; more than 3 is refused', async () => {
  const t = await freshDb();
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(250_001)]).toString('base64');
  assert.equal((await t.call('POST', '/v1/feedback', { kind: 'x', body: 'y', images: [{ mime: 'image/jpeg', base64: big }] })).status, 413);
  assert.equal((await t.call('POST', '/v1/feedback', { kind: 'x', body: 'y', images: [{ mime: 'image/png', base64: JPEG }] })).status, 422, 'says PNG, is a JPEG');
  assert.equal((await t.call('POST', '/v1/feedback', { kind: 'x', body: 'y', images: [{ mime: 'image/jpeg', base64: Buffer.from('<svg/>').toString('base64') }] })).status, 422);
  const four = Array.from({ length: 4 }, () => ({ mime: 'image/jpeg', base64: JPEG }));
  assert.equal((await t.call('POST', '/v1/feedback', { kind: 'x', body: 'y', images: four })).status, 422);
  await t.close();
});

test('FR-020: images older than 90 days are swept; the text stays', async () => {
  const t = await freshDb();
  await t.call('POST', '/v1/feedback', { kind: 'x', body: 'keep me', images: [{ mime: 'image/jpeg', base64: JPEG }] });
  await t.q("UPDATE feedback_images SET created_at = now() - interval '91 days'");
  const { sweepImages } = await import('../src/db/repos/account/feedback.ts');
  assert.equal(await sweepImages(t.db), 1);
  assert.equal((await t.q('SELECT 1 FROM feedback_images')).length, 0);
  assert.equal((await t.q("SELECT 1 FROM feedback WHERE body = 'keep me'")).length, 1);
  await t.close();
});
