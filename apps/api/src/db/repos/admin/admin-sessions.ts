// Database queries on sessions for Admin's "act as" (M26: moved here from routes/admin/accounts.ts).
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

/** The accounts this admin is acting as now (one row per acting session). */
async function actingSessionRowsPg(db: Db, adminId: string): Promise<{ listener_id: string }[]> {
  return db.query<{ listener_id: string }>('SELECT listener_id FROM sessions WHERE acting_admin_id = $1', [adminId]);
}

// M26 lane SF: on DynamoDB (safety/ddb/admin-sessions.ts) when the Db carries a Store (lane AC's act-as pointers).
export const actingSessionRows = dual('sf/admin-sessions', 'actingSessionRows', actingSessionRowsPg);
