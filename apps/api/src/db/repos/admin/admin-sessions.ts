// Database queries on sessions for Admin's "act as" (M26: moved here from routes/admin/accounts.ts).
import type { Db } from '../../db.ts';

/** The accounts this admin is acting as now (one row per acting session). */
export async function actingSessionRows(db: Db, adminId: string): Promise<{ listener_id: string }[]> {
  return db.query<{ listener_id: string }>('SELECT listener_id FROM sessions WHERE acting_admin_id = $1', [adminId]);
}
