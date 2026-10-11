// The health check's database probe (M26: moved here from app.ts).
import type { Db } from '../db.ts';
import { dual } from '../backend.ts';

/** One trivial round trip; rejects when the database cannot be reached. */
async function pingPg(db: Db): Promise<void> {
  await db.query('SELECT 1');
}

// M26 lane LE: on DynamoDB one GetItem (safety/ddb/health.ts).
export const ping = dual('sf/health', 'ping', pingPg);
