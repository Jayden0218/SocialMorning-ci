import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** The subset of a SQL client both `postgres` and pglite can offer us. */
export interface MigrationRunner {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Applies every `NNN_*.sql` not yet in `schema_migrations`, in order. Idempotent. */
export async function migrate(db: MigrationRunner): Promise<number[]> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set(
    (await db.query<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => Number(r.version)),
  );
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
  const done: number[] = [];
  for (const file of files) {
    const version = Number(file.slice(0, 3));
    if (applied.has(version)) continue;
    const body = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await db.exec('BEGIN');
    try {
      await db.exec(body);
      await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    }
    done.push(version);
  }
  return done;
}

/** `npm run migrate -w apps/api` — against DATABASE_URL. */
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { createClient } = await import('./client.ts');
  const sql = createClient();
  const runner: MigrationRunner = {
    exec: (s) => sql.unsafe(s),
    query: (s, params) => sql.unsafe(s, (params ?? []) as never) as unknown as Promise<never[]>,
  };
  const done = await migrate(runner);
  console.log(done.length ? `applied ${done.join(', ')}` : 'nothing to apply');
  await sql.end();
}
