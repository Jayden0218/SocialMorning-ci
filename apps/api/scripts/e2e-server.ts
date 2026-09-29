/**
 * The real API for the Studio's end-to-end test (ci/workflows/e2e.yml) — NOT used in production.
 * Real app, real PostgreSQL, real sessions. Two things are stand-ins, and only these:
 *   - the audio store: tokens are genuine client tokens made from a dummy read-write token (made
 *     locally, no network), the browser's upload call is answered by the test, and `head` here
 *     reports a fixed size for any file under this test's store address;
 *   - Apple's catalogue: always down, so search results can only be shows created here.
 */
import { serve } from '@hono/node-server';
import { createApp } from '../src/app.ts';
import { createClient } from '../src/db/client.ts';
import { fromPostgres } from '../src/db/db.ts';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import type { EpisodeStorage } from '../src/storage/episodes-blob.ts';

export const E2E_STORE = 'https://e2estore.public.blob.vercel-storage.com/';
const DUMMY_RW = 'vercel_blob_rw_e2estore_notarealsecretnotarealsecret00';
const removed: string[] = [];

const storage: EpisodeStorage = {
  ready: true,
  uploadToken: (pathname, o) => generateClientTokenFromReadWriteToken({ token: DUMMY_RW, pathname, maximumSizeInBytes: o.maxBytes, allowedContentTypes: o.types, addRandomSuffix: false }),
  head: async (url) => {
    if (!url.startsWith(E2E_STORE) || removed.includes(url)) return undefined;
    const pathname = url.slice(E2E_STORE.length);
    const contentType = pathname.endsWith('.mp3') ? 'audio/mpeg' : pathname.endsWith('.png') ? 'image/png' : pathname.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
    return { url, pathname, size: 48_000, contentType };
  },
  remove: async (url) => { removed.push(url); },
};

const app = createApp({
  db: fromPostgres(createClient()),
  pepper: process.env['SESSION_PEPPER'] ?? 'e2e-pepper',
  episodeStorage: storage,
  publicBase: 'http://localhost:4173/api',
  catalogFetch: (async () => { throw new Error('catalogue down in e2e'); }) as unknown as typeof fetch,
  pushFetch: (async () => new Response(JSON.stringify({ data: [] }))) as unknown as typeof fetch,
});
// Test-only window into what was deleted from the store (never mounted in production).
const port = Number(process.env['PORT'] ?? 8787);
serve({ fetch: (req, env) => (new URL(req.url).pathname === '/__e2e/removed' ? Response.json(removed) : app.fetch(req, env)), port }, () => console.log(`e2e api on :${port}`));
