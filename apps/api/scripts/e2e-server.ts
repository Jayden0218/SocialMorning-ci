// Starts the real API on a test database for browser end-to-end tests.
/**
 * The real API for the Studio's end-to-end test (ci/workflows/e2e.yml) — NOT used in production.
 * Real app, real DynamoDB (DynamoDB Local, DDB_ENDPOINT), real sessions. Two things are stand-ins, and only these:
 *   - the audio store: tokens are genuine client tokens made from a dummy read-write token (made
 *     locally, no network), the browser's upload call is answered by the test, and `head` here
 *     reports a fixed size for any file under this test's store address;
 *   - Apple's catalogue: always down, so search results can only be shows created here.
 *
 * The listener journey (specs/015-e2e-journey) adds three switches, all off by default so the
 * Studio test runs exactly as before:
 *   - the data is a new table set on DynamoDB Local made at start (`e2e_<random>_main/events/cache`) and dropped at exit;
 *     DDB_ENDPOINT must name a local DynamoDB (never AWS). The outbox is drained every 200 ms, as the worker would;
 *   - E2E_STORE_BASE=<this server>/__e2e/store/ → the store's files are served HERE, every audio
 *     file being scripts/fixtures/journey.mp3 (60 s, byte ranges for the phone's player), so a
 *     published episode really plays;
 *   - E2E_MOD_EMAIL + E2E_MOD_PASSWORD → that account exists at start and is the moderator;
 *   - E2E_PUBLIC_BASE → the address feeds and pages name (the phone needs the Mac's LAN address);
 *   - the email-code sign-in always works here: codes go to an in-memory inbox, and
 *     GET /__e2e/code?email=… returns the latest (the phone signs in by code, as a person would);
 *   - M27: POST /__e2e/fault { path, mode: 'slow'|'fail'|'off', ms? } makes a request path (prefix) slow
 *     (default 15000 ms) or answer 503 {error:'unavailable'}; { mode:'off' } with no path clears all.
 *     The screen capture uses it to show loading and error states without touching app code.
 *   - M25 S3: POST /__e2e/account { email, password, displayName } makes an account with a
 *     password and answers { token, listener: { id } } — what `POST /v1/auth/sign-up` did before it
 *     was removed. The Studio's Password tab needs accounts that have one. Test server only.
 */
import { serve } from '@hono/node-server';
import { createApp } from '../src/app.ts';
import { createDdbClients } from '../src/db/ddb/client.ts';
import { createStore, prefixedTables } from '../src/db/ddb/store.ts';
import { createTableSet, deleteTableSet } from '../src/db/ddb/schema.ts';
import { withStore } from '../src/db/backend-ddb.ts';
import { drainOutbox } from '../src/jobs/outbox.ts';
import type { Db } from '../src/db/db.ts';
import { createListener, listenerByEmail } from '../src/db/repos/account/listeners.ts';
import { hashPassword } from '../src/auth/password.ts';
import { createSession } from '../src/auth/session.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import type { EpisodeStorage } from '../src/storage/episodes-blob.ts';
import { withRequestLog } from './request-log.ts';

export const E2E_STORE = process.env['E2E_STORE_BASE'] ?? 'https://e2estore.public.blob.vercel-storage.com/';
const SERVED_STORE = '/__e2e/store/';
const AUDIO = readFileSync(fileURLToPath(new URL('./fixtures/journey.mp3', import.meta.url)));
const DUMMY_RW = 'vercel_blob_rw' + '_e2estore_notarealsecretnotarealsecret00';
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
  if (!process.env['DDB_ENDPOINT']) throw new Error('e2e api: DDB_ENDPOINT is not set (DynamoDB Local, e.g. scripts/ddb-local.sh)');
  const clients = createDdbClients();
  const tables = prefixedTables(`e2e_${Math.random().toString(36).slice(2, 8)}`);
  await createTableSet(clients.raw, tables);
  const store = createStore({ clients, tables, secret: process.env['CURSOR_SECRET'] ?? 'e2e-cursor-secret' });
  // The worker's job in production: run the outbox (notifications, fan-out, counters) shortly after each write.
  const timer = setInterval(() => { void drainOutbox(store).catch(() => undefined); }, 200);
  timer.unref();
  const drop = async () => { clearInterval(timer); await deleteTableSet(clients.raw, tables).catch(() => undefined); clients.raw.destroy(); };
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => { void drop().finally(() => process.exit(0)); });
  console.log(`e2e api: DynamoDB Local tables ${tables.main}, ${tables.events}, ${tables.cache}`);
  return withStore(undefined, store);
}
const db = await database();

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

const pepper = process.env['SESSION_PEPPER'] ?? 'e2e-pepper';

/** M25 S3: the old password sign-up, for this test server only (see the header). */
async function e2eAccount(req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as { email?: string; password?: string; displayName?: string };
  if (!b.email || !b.password || !b.displayName) return Response.json({ error: 'validation' }, { status: 422 });
  const made = await createListener(db, b.email.trim().toLowerCase(), await hashPassword(b.password), b.displayName);
  if (made === 'exists') return Response.json({ error: 'conflict', message: 'An account with this email exists — sign in instead.' }, { status: 409 });
  return Response.json({ token: await createSession(db, made.id, pepper), listener: { id: made.id, displayName: made.display_name } });
}

const app = createApp({
  db,
  mailer,
  ...(ownerListenerId ? { ownerListenerId, appealsEmail: 'appeals@e2e.test' } : {}),
  pepper,
  episodeStorage: storage,
  publicBase: process.env['E2E_PUBLIC_BASE'] ?? 'http://localhost:4173/api',
  catalogFetch: (async () => { throw new Error('catalogue down in e2e'); }) as unknown as typeof fetch,
  pushFetch: (async () => new Response(JSON.stringify({ data: [] }))) as unknown as typeof fetch,
});
/** M27: the fault switch — request-path prefixes made slow or failing. Test server only; empty by default. */
const faults = new Map<string, { mode: 'slow' | 'fail'; ms: number }>();
async function e2eFault(req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as { path?: unknown; mode?: unknown; ms?: unknown };
  if (b.mode === 'off') {
    if (typeof b.path === 'string') faults.delete(b.path); else faults.clear();
    return Response.json({ faults: Object.fromEntries(faults) });
  }
  if ((b.mode !== 'slow' && b.mode !== 'fail') || typeof b.path !== 'string' || !b.path.startsWith('/')) return Response.json({ error: 'validation', message: "Send { path: '/…', mode: 'slow'|'fail'|'off', ms? }." }, { status: 422 });
  const ms = typeof b.ms === 'number' && b.ms >= 0 ? b.ms : 15_000;
  faults.set(b.path, { mode: b.mode, ms });
  return Response.json({ faults: Object.fromEntries(faults) });
}
/** The longest matching prefix wins; the test server's own /__e2e routes are never faulted. */
function faultFor(pathname: string): { mode: 'slow' | 'fail'; ms: number } | undefined {
  if (faults.size === 0 || pathname.startsWith('/__e2e/')) return undefined;
  let best: string | undefined;
  for (const p of faults.keys()) if (pathname.startsWith(p) && (best === undefined || p.length > best.length)) best = p;
  return best === undefined ? undefined : faults.get(best);
}

// Test-only window into what was deleted from the store (never mounted in production).
const port = Number(process.env['PORT'] ?? 8787);
serve({
  // ios-journey: one arrival line and one finish line per request in api.log (method, path, status, ms, id; no bodies, headers or tokens).
  fetch: withRequestLog(async (req, env) => {
    const url = new URL(req.url);
    if (url.pathname === '/__e2e/fault' && req.method === 'POST') return e2eFault(req);
    const fault = faultFor(url.pathname);
    if (fault?.mode === 'fail') return Response.json({ error: 'unavailable' }, { status: 503 });
    if (fault?.mode === 'slow') await new Promise((r) => setTimeout(r, fault.ms));
    if (url.pathname === '/__e2e/removed') return Response.json(removed);
    if (url.pathname === '/__e2e/account' && req.method === 'POST') return e2eAccount(req);
    if (url.pathname === '/__e2e/code') {
      const code = inbox.get((url.searchParams.get('email') ?? '').toLowerCase());
      return code ? Response.json({ code }) : Response.json({ error: 'no code yet' }, { status: 404 });
    }
    return servedFile(req) ?? app.fetch(req, env);
  }),
  port,
  hostname: process.env['E2E_HOST'] ?? '0.0.0.0',
}, () => console.log(`e2e api on :${port}${ownerListenerId ? ' (moderator set)' : ''}`));
