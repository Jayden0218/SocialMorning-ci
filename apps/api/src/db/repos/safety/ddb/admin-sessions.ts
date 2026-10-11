// Admin's "act as" sessions on DynamoDB: the act-as pointers lane AC keeps under the admin's own partition.
/**
 * M26 lane SF (SF-55). Lane AC writes `L#<admin>/ACTAS#<publicId>` { tokenHash, targetId } beside each act-as
 * session (keys.ts `actAsPtr`); the accounts an admin is acting as are one strong Query of those pointers whose
 * session still exists.
 */
import * as K from '../../../ddb/keys.ts';
import { getMany, partition, type Db, type Store } from './common.ts';

export async function actingSessionRows(store: Store, _db: Db, adminId: string): Promise<{ listener_id: string }[]> {
  const ptrs = await partition(store, 'main', K.L(adminId), { prefix: K.AC_SK.actAs });
  const live = await getMany(store, 'main', ptrs.map((p) => K.session(String(p['tokenHash']))));
  return live.filter((s) => s['actingAdminId'] === adminId).map((s) => ({ listener_id: String(s['listenerId']) }));
}
