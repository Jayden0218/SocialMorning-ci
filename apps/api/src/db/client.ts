import postgres from 'postgres';

export type Sql = ReturnType<typeof postgres>;

/**
 * One connection per function instance: Vercel runs many short-lived instances and
 * Neon's free plan has a small connection budget, so `max: 1` is the honest setting.
 */
export function createClient(url = process.env.DATABASE_URL): Sql {
  if (!url) throw new Error('DATABASE_URL is not set (apps/api/.env — see .env.example)');
  return postgres(url, { max: 1, idle_timeout: 20, prepare: false });
}
