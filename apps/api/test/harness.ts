/**
 * Test harness (research R8): an in-process Postgres (pglite) running the SAME
 * migration files the real database gets, and the real Hono app on top of it.
 * Nothing is mocked below the routes.
 */
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { migrate, type MigrationRunner } from '../src/db/migrate.ts';
import { fromPglite, type Db } from '../src/db/db.ts';
import { createApp } from '../src/app.ts';

export const TEST_PEPPER = 'test-pepper-not-secret';

export type TestDb = {
  pg: PGlite;
  db: Db;
  runner: MigrationRunner;
  app: ReturnType<typeof createApp>;
  q<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** JSON request helper: `call('POST', '/v1/auth/sign-in', body, token)`. */
  call(method: string, path: string, body?: unknown, token?: string, headers?: Record<string, string>): Promise<Response>;
  close(): Promise<void>;
};

export async function freshDb(): Promise<TestDb> {
  const pg = new PGlite({ extensions: { citext } });
  const runner: MigrationRunner = {
    exec: (s) => pg.exec(s),
    query: async <T,>(s: string, params?: unknown[]) => (await pg.query<T>(s, params)).rows,
  };
  await migrate(runner);
  const db = fromPglite(pg);
  const app = createApp({ db, pepper: TEST_PEPPER });
  return {
    pg,
    db,
    runner,
    app,
    q: async <T,>(s: string, params?: unknown[]) => (await pg.query<T>(s, params)).rows,
    call: async (method, path, body, token, headers = {}) =>
      app.request(path, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    close: () => pg.close(),
  };
}

/** Sign up a listener and return their token + id. */
export async function signUp(t: TestDb, email = 'a@example.com', displayName = 'Alex', password = 'correct horse') {
  const res = await t.call('POST', '/v1/auth/sign-up', { email, password, displayName });
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { token: string; listener: { id: string } };
  return { token: j.token, id: j.listener.id };
}
