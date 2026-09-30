/**
 * The real API for the Studio's end-to-end test (ci/workflows/e2e.yml) — NOT used in production.
 * Real app, real PostgreSQL, real sessions. Two things are stand-ins, and only these:
 *   - the audio store: tokens are genuine client tokens made from a dummy read-write token (made
 *     locally, no network), the browser's upload call is answered by the test, and `head` here
 *     reports a fixed size for any file under this test's store address;
 *   - Apple's catalogue: always down, so search results can only be shows created here.
 *
 * The listener journey (specs/015-e2e-journey) adds three switches, all off by default so the
 * Studio test runs exactly as before:
 *   - no DATABASE_URL → PGlite in memory, migrated at start (the Mac run for the real iPhone,
 *     which must never touch Neon);
 *   - E2E_STORE_BASE=<this server>/__e2e/store/ → the store's files are served HERE, every audio
 *     file being scripts/fixtures/journey.mp3 (60 s, byte ranges for the phone's player), so a
 *     published episode really plays;
 *   - E2E_MOD_EMAIL + E2E_MOD_PASSWORD → that account exists at start and is the moderator;
 *   - E2E_PUBLIC_BASE → the address feeds and pages name (the phone needs the Mac's LAN address);
 *   - the email-code sign-in always works here: codes go to an in-memory inbox, and
 *     GET /__e2e/code?email=… returns the latest (the phone signs in by code, as a person would).
 */
import { serve } from '@hono/node-server';
import { createApp } from '../src/app.ts';
import { createClient } from '../src/db/client.ts';
import { fromPglite, fromPostgres, type Db } from '../src/db/db.ts';
import { migrate } from '../src/db/migrate.ts';
import { createListener, listenerByEmail } from '../src/db/repos/listeners.ts';
import { hashPassword } from '../src/auth/password.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import type { EpisodeStorage } from '../src/storage/episodes-blob.ts';

export const E2E_STORE = process.env['E2E_STORE_BASE'] ?? 'https://e2estore.public.blob.vercel-storage.com/';
const SERVED_STORE = '/__e2e/store/';
const AUDIO = readFileSync(fileURLToPath(new URL('./fixtures/journey.mp3', import.meta.url)));
const DUMMY_RW = 'vercel_blob_rw_e2estore_notarealsecretnotarealsecret00';
const removed: string[] = [];
/** Files the test published (seen through `head` at publish), so the media library has something to list. */
const seen = new Map<string, { url: string; pathname: string; size: number; contentType: string }>();

const storage: EpisodeStorage = {
  ready: true,
  uploadToken: (pathname, o) => generateClientTokenFromReadWriteToken({ token: DUMMY_RW, pathname, maximumSizeInBytes: o.maxBytes, allowedContentTypes: o.types, addRandomSuffix: false }),
  head: async (url) => {
    if (!url.startsWith(E2E_STORE) || removed.includes(url)) return undefined;
    const pathname = url.slice(E2E_STORE.length);
    const contentType = pathname.endsWith('.mp3') ? 'audio/mpeg' : pathname.endsWith('.png') ? 'image/png' : pathname.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
    const f = { url, pathname, size: 48_000, contentType };
    seen.set(url, f);
    return f;
  },
  remove: async (url) => { removed.push(url); seen.delete(url); },
  list: async (prefix) => [...seen.values()].filter((f) => f.pathname.startsWith(prefix)),
};

async function database(): Promise<Db> {
  if (process.env['DATABASE_URL']) return fromPostgres(createClient());
  const { PGlite } = await import('@electric-sql/pglite');
  const { citext } = await import('@electric-sql/pglite/contrib/citext');
  const pg = new PGlite({ extensions: { citext } });
  await migrate({ exec: (q) => pg.exec(q).then(() => undefined), query: async <T,>(q: string, p?: unknown[]) => (await pg.query<T>(q, p)).rows });
  console.log('e2e api: PGlite in memory (no DATABASE_URL)');
  return fromPglite(pg);
}
const db = await database();
// The store served HERE is plain http on the Mac (the phone cannot trust a self-made certificate),
// so this throw-away test database drops the one rule that wants https audio. Only when the
// audio really is served by this server; production's rule is untouched (migration 010).
if (E2E_STORE.startsWith('http://')) await db.query('ALTER TABLE hosted_episodes DROP CONSTRAINT IF EXISTS hosted_episodes_audio_url_check');

async function moderator(): Promise<string | undefined> {
  const email = process.env['E2E_MOD_EMAIL'];
  if (!email) return undefined;
  const made = await createListener(db, email, await hashPassword(process.env['E2E_MOD_PASSWORD'] ?? 'e2e-correct-horse'), 'Moderator');
  return made === 'exists' ? (await listenerByEmail(db, email))?.id : made.id;
}
const ownerListenerId = await moderator();

/** The inbox: the latest sign-in code per address (the app's only way in is an emailed code). */
const inbox = new Map<string, string>();
const mailer = { async send(m: { to: string; subject: string }) { const code = /\b(\d{6})\b/.exec(m.subject)?.[1]; if (code) inbox.set(m.to.toLowerCase(), code); } };

/** The store's files, served here when E2E_STORE_BASE points at this server: every audio file is the fixture. */
function servedFile(req: Request): Response | undefined {
  const url = new URL(req.url);
  if (!url.pathname.startsWith(SERVED_STORE)) return undefined;
  if (!/\.(mp3|m4a|aac)$/.test(url.pathname)) return new Response('not found', { status: 404 });
  const size = AUDIO.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  const head = { 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes' };
  if (!m) return new Response(req.method === 'HEAD' ? null : AUDIO, { headers: { ...head, 'content-length': String(size) } });
  const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  const end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
  const part = AUDIO.subarray(start, end + 1);
  return new Response(req.method === 'HEAD' ? null : part, { status: 206, headers: { ...head, 'content-length': String(part.byteLength), 'content-range': `bytes ${start}-${end}/${size}` } });
}

const app = createApp({
  db,
  mailer,
  ...(ownerListenerId ? { ownerListenerId, appealsEmail: 'appeals@e2e.test' } : {}),
  pepper: process.env['SESSION_PEPPER'] ?? 'e2e-pepper',
  episodeStorage: storage,
  publicBase: process.env['E2E_PUBLIC_BASE'] ?? 'http://localhost:4173/api',
  catalogFetch: (async () => { throw new Error('catalogue down in e2e'); }) as unknown as typeof fetch,
  pushFetch: (async () => new Response(JSON.stringify({ data: [] }))) as unknown as typeof fetch,
});
// Test-only window into what was deleted from the store (never mounted in production).
const port = Number(process.env['PORT'] ?? 8787);
serve({
  fetch: (req, env) => {
    const url = new URL(req.url);
    if (url.pathname === '/__e2e/removed') return Response.json(removed);
    if (url.pathname === '/__e2e/code') {
      const code = inbox.get((url.searchParams.get('email') ?? '').toLowerCase());
      return code ? Response.json({ code }) : Response.json({ error: 'no code yet' }, { status: 404 });
    }
    return servedFile(req) ?? app.fetch(req, env);
  },
  port,
  hostname: process.env['E2E_HOST'] ?? '0.0.0.0',
}, () => console.log(`e2e api on :${port}${ownerListenerId ? ' (moderator set)' : ''}`));
