// The health check's database probe (M26: moved here from app.ts).
import type { Db } from '../db.ts';

/** One trivial round trip; rejects when the database cannot be reached. */
export async function ping(db: Db): Promise<void> {
  await db.query('SELECT 1');
}
