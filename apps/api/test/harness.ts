// Test helper: the real app on DynamoDB Local, with the real routes. Nothing is mocked below them.
/**
 * Test harness. Every test gets its OWN DynamoDB table set (`t<pid>_<n>_<rand>_main/events/cache`, created from
 * infra/tables.yaml) on DynamoDB Local (`DDB_ENDPOINT`, scripts/ddb-local.sh; ci/workflows/ddb-api.yml) and drops it on
 * close. After every `t.call` the outbox is drained, so effects are deterministic (data-model.md §9).
 */
import type { Db } from '../src/db/db.ts';
import { createApp } from '../src/app.ts';
import { createListener } from '../src/db/repos/account/listeners.ts';
import { hashPassword } from '../src/auth/password.ts';
import { createSession } from '../src/auth/session.ts';
import type { Mail, Mailer } from '../src/mail/mailer.ts';
import type { VoiceStorage } from '../src/storage/voice-blob.ts';
import type { Clock, Store, Tables } from '../src/db/ddb/store.ts';
import type { DrainResult } from '../src/jobs/outbox.ts';

export const TEST_PEPPER = 'test-pepper-not-secret';
export const TEST_CURSOR_SECRET = 'test-cursor-secret-not-secret';
export const TEST_APPEALS = 'appeals@example.test';

export type TestDb = {
  db: Db;
  app: ReturnType<typeof createApp>;
  /** This test's own DynamoDB table set, behind `db`. */
  store: Store;
  /** JSON request helper: `call('POST', '/v1/auth/sign-in', body, token)`. */
  call(method: string, path: string, body?: unknown, token?: string, headers?: Record<string, string>): Promise<Response>;
  /** Every email the app would have sent (a fake mailer; see `src/mail/mailer.ts`). */
  mail?: Mail[];
  /** The last code sent to this address. */
  lastCode?(to: string): string;
  /** M6: rebuilds the app with this listener as the owner (the id exists only after a sign-up). */
  setOwner?(id: string): void;
  close(): Promise<void>;
};

/**
 * M25 S7: the SSRF guard resolves every host it fetches. Tests never touch real DNS: every name
 * resolves to one public documentation-free address, unless a test passes its own `resolveHost`.
 * (Literal private addresses and `localhost` are refused by the guard before any lookup.)
 */
export const publicResolve = async (): Promise<string[]> => ['93.184.216.34'];

/** The app on a fresh table set. `ownerListenerId` is unknown until a listener exists: tests that need the owner sign up first, then `setOwner`. */
export async function freshDb(allOpts: { ownerListenerId?: string; appealsEmail?: string; releaseSha256?: string; noMailer?: boolean; pushFetch?: typeof fetch; catalogFetch?: typeof fetch;
  /** M12 */ jobToken?: string; voiceStorage?: VoiceStorage; /** M19 */ avatarStorage?: VoiceStorage; imageFetch?: typeof fetch;
  /** M25 */ audioFetch?: typeof fetch; resolveHost?: (host: string) => Promise<string[]>; /** M20 */ imageStorage?: import('../src/storage/image-store.ts').ImageStorage; imageCeilingBytes?: number; play?: import('../src/billing/google-play.ts').GooglePlay; picksRaw?: unknown; today?: () => string } = {}): Promise<TestDb> {
  const { noMailer, ...given } = allOpts;
  const opts = { resolveHost: publicResolve, ...given };
  const hy = await appDb();
  const db = hy.db;
  const mail: Mail[] = [];
  const mailer: Mailer | undefined = noMailer ? undefined : { send: async (m) => { mail.push(m); } };
  let app = createApp({ db, pepper: TEST_PEPPER, appealsEmail: TEST_APPEALS, ...(mailer ? { mailer } : {}), ...opts });
  const t: TestDb = {
    db,
    store: hy.store,
    app,
    mail,
    lastCode: (to) => {
      const m = [...mail].reverse().find((x) => x.to === to);
      const code = m ? /\b(\d{6})\b/.exec(m.text)?.[1] : undefined;
      if (!code) throw new Error(`no code was sent to ${to}`);
      return code;
    },
    setOwner: (id) => { app = createApp({ db, pepper: TEST_PEPPER, appealsEmail: TEST_APPEALS, ...(mailer ? { mailer } : {}), ...opts, ownerListenerId: id }); t.app = app; },
    call: async (method, path, body, token, headers = {}) => {
      const res = await app.request(path, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      await hy.drain(); // the outbox runs after each request
      return res;
    },
    close: () => hy.close(),
  };
  return t;
}


/**
 * Makes a listener (with this password, for the tests that sign in with one) and a session, and
 * returns their token + id. M25 S3: `POST /v1/auth/sign-up` is gone, so this writes the same rows
 * the old route wrote, directly; `signUpWithCode` goes through the real code route.
 */
export async function signUp(t: Pick<TestDb, 'db'>, email = 'a@example.com', displayName = 'Alex', password = 'correct horse') {
  const created = await createListener(t.db, email.trim().toLowerCase(), await hashPassword(password), displayName);
  if (created === 'exists') throw new Error(`sign-up failed: ${email} exists`);
  return { token: await createSession(t.db, created.id, TEST_PEPPER), id: created.id };
}

/** A new account the way the app makes one: a code to the email, then the code and a name. */
export async function signUpWithCode(t: TestDb, email: string, displayName: string): Promise<{ status: number; token?: string; id?: string }> {
  const sent = await t.call('POST', '/v1/auth/code', { email });
  if (sent.status !== 200) return { status: sent.status };
  const res = await t.call('POST', '/v1/auth/code/verify', { email, code: t.lastCode!(email.trim().toLowerCase()), displayName });
  if (res.status !== 200) return { status: res.status };
  const j = (await res.json()) as { token: string; listener: { id: string } };
  return { status: 200, token: j.token, id: j.listener.id };
}

export type TestStore = { store: Store; tables: Tables; drain(): Promise<DrainResult>; close(): Promise<void> };
let storeCounter = 0;

/** A fresh table set on DynamoDB Local and a Store over it. */
export async function freshStore(opts: { clock?: Clock } = {}): Promise<TestStore> {
  const [{ createDdbClients }, { createStore, prefixedTables }, { createTableSet, deleteTableSet }, { drainOutbox }] = await Promise.all([
    import('../src/db/ddb/client.ts'), import('../src/db/ddb/store.ts'), import('../src/db/ddb/schema.ts'), import('../src/jobs/outbox.ts'),
  ]);
  const clients = createDdbClients();
  const tables = prefixedTables(`t${process.pid}_${++storeCounter}_${Math.random().toString(36).slice(2, 8)}`);
  await createTableSet(clients.raw, tables);
  const store = createStore({ clients, tables, secret: TEST_CURSOR_SECRET, ...(opts.clock ? { clock: opts.clock } : {}) });
  return {
    store,
    tables,
    drain: () => drainOutbox(store),
    close: async () => { await deleteTableSet(clients.raw, tables); clients.raw.destroy(); },
  };
}

/**
 * A fresh table set with the default Academy/Help pages, and the `Db` handle the app's repo functions take (`withStore`).
 * Tests that build their own app call it too (test/push.test.ts).
 */
export async function appDb(): Promise<{ db: Db; store: Store; drain(): Promise<unknown>; close(): Promise<void> }> {
  const s = await freshStore();
  await (await import('../src/db/repos/safety/ddb/content-seed.ts')).seedDefaultContent(s.store);
  const { withStore } = await import('../src/db/backend-ddb.ts');
  const store = await withListenerDefaults(s.store);
  // The outbox drains through the same (wrapped) Store the app runs on: handlers find what the app's repos remembered by it.
  const { drainOutbox } = await import('../src/jobs/outbox.ts');
  return { db: withStore(undefined, store), store, drain: () => drainOutbox(store), close: () => s.close() };
}

/**
 * M26 lane SC: every test listener gets `rulesAcceptedAt` set at creation (the rules tests set it
 * back to NULL — comments-m21.test.ts); this is the same test-only default on the DynamoDB listener item: a listener
 * item written without `rulesAcceptedAt` gets its `createdAt`. App code never sees the difference.
 */
async function withListenerDefaults(store: Store): Promise<Store> {
  const [{ PutCommand, TransactWriteCommand }, { wrapStore }] = await Promise.all([import('@aws-sdk/lib-dynamodb'), import('../src/db/ddb/store.ts')]);
  const fill = (item: Record<string, unknown> | undefined) => {
    if (item && item['t'] === 'listener' && item['rulesAcceptedAt'] === undefined && typeof item['createdAt'] === 'string') item['rulesAcceptedAt'] = item['createdAt'];
  };
  return wrapStore(store, (cmd, next) => {
    if (cmd instanceof PutCommand) fill((cmd.input as { Item?: Record<string, unknown> }).Item);
    if (cmd instanceof TransactWriteCommand) for (const a of (cmd.input as { TransactItems?: { Put?: { Item?: Record<string, unknown> } }[] }).TransactItems ?? []) fill(a.Put?.Item);
    return next(cmd);
  });
}

