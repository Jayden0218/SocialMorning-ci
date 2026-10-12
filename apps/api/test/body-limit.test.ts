// M27 T023 (research R3): a Lambda Function URL carries at most 6 MB per request (buffered mode). No route here accepts anywhere near
// that, so nothing that works today can be cut off by the move: every body is limited by app.ts's middleware to ≤ 1.1 MB, and a
// body just over 6 MB is refused with 413 on every route we try (large media goes straight to Vercel Blob with a client token —
// src/storage/episodes-blob.ts — never through the API).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { freshDb } from './harness.ts';

const SIX_MB = 6 * 1024 * 1024;

test('every declared body limit is far below the 6 MB Function URL cap', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/app.ts', import.meta.url)), 'utf8');
  const limits = [...src.matchAll(/bodyLimit\(\{ maxSize: ([^,}]+)/g)].map((m) => m[1]!.trim());
  assert.ok(limits.length >= 7, `found ${limits.length} limits`);
  for (const expr of limits) {
    // Plain numbers (16 * 1024, 1_100_000) are evaluated; named constants are checked below against their value.
    if (/^[\d_ *]+$/.test(expr)) assert.ok(Function(`return ${expr.replaceAll('_', '')}`)() <= 1_100_000, `${expr} is over 1.1 MB`);
  }
});

test('named limits (voice, avatar, comment image) are under 1.1 MB', async () => {
  const { VOICE_MAX_BYTES } = await import('../src/db/repos/social/voice-posts.ts');
  const { AVATAR_MAX_BYTES } = await import('../src/db/repos/account/profile.ts');
  const { COMMENT_IMAGE_MAX_BYTES } = await import('../src/routes/social/comment-image.ts');
  for (const n of [VOICE_MAX_BYTES, AVATAR_MAX_BYTES, COMMENT_IMAGE_MAX_BYTES]) assert.ok(n > 0 && n <= 1_100_000, String(n));
});

test('a body just over 6 MB is refused with 413 on every body-reading route, with or without a Content-Length', async () => {
  const t = await freshDb();
  try {
    const paths: [string, string][] = [
      ['POST', '/v1/feedback'], ['POST', '/v1/errors'], ['POST', '/v1/voice-posts'], ['POST', '/v1/voice-posts/images'],
      ['POST', '/v1/voice-posts/abc/replies'], ['POST', '/v1/episodes/abc/comments/voice'], ['POST', '/v1/comments/abc/image'],
      ['PUT', '/v1/me/avatar'], ['POST', '/v1/admin/accounts'], ['POST', '/v1/admin/content/academy'],
      ['POST', '/v1/auth/sign-in'], ['POST', '/v1/auth/code'], ['POST', '/v1/me/stickers'], ['POST', '/v1/studio/session'], ['PUT', '/v1/me/library'],
      ['POST', '/v1/internal/rebuild'],
    ];
    const big = new Uint8Array(SIX_MB + 1);
    for (const [method, path] of paths) {
      const withLength = await t.app.request(path, { method, headers: { 'content-type': 'application/octet-stream', 'content-length': String(big.length) }, body: big });
      assert.equal(withLength.status, 413, `${method} ${path} with content-length answered ${withLength.status}`);
      const stream = new ReadableStream({ start(c) { c.enqueue(big); c.close(); } });
      const chunked = await t.app.request(new Request(`https://x.test${path}`, { method, headers: { 'content-type': 'application/octet-stream' }, body: stream, duplex: 'half' } as RequestInit));
      assert.equal(chunked.status, 413, `${method} ${path} chunked answered ${chunked.status}`);
    }
  } finally { await t.close(); }
});
