// The admin record on DynamoDB: newest first, 50 a page, by area — month partitions read from the base table.
/**
 * M26 lane SF (SF-56). Records are `AUDIT#<yyyy-mm>` / `<id padded>` (ids from `SEQ#audit`, so id order is time
 * order), with siblings `<id>#after` (the `after` of a change made in the record's own transaction) and `<id>#done`
 * (adminTx's completion of an audit-first record). A page walks the months backwards from the newest — strongly
 * consistent base-table Queries, so the admin sees the write they just made — and stops at 51 records or after
 * 36 empty-handed months (the record is younger than that). Names are lane AC's listener items.
 */
import * as K from '../../../ddb/keys.ts';
import type { AuditArea } from '../../../../auth/admin.ts';
import { AUDIT_PAGE, type AuditRow } from '../../admin/admin-audit.ts';
import { listenersById, nowMs, partition, type Db, type Item, type Store } from './common.ts';

const obj = (v: unknown): Record<string, unknown> | null => {
  if (v === null || v === undefined) return null;
  const x = typeof v === 'string' ? (JSON.parse(v) as unknown) : v;
  return typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : { value: x };
};

const MAX_MONTHS = 36;

export async function listAudit(store: Store, _db: Db, opts: { area?: AuditArea; before?: string }): Promise<{ items: AuditRow[]; next?: string }> {
  const before = opts.before !== undefined && /^\d{1,16}$/.test(opts.before) ? Number(opts.before) : undefined;
  const records: Item[] = [];
  const afters = new Map<number, unknown>();
  const now = new Date(nowMs(store));
  for (let m = 0; m < MAX_MONTHS && records.length <= AUDIT_PAGE; m++) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1)).toISOString().slice(0, 7);
    const items = await partition(store, 'main', `AUDIT#${month}`, before !== undefined ? { to: K.pad(before), newestFirst: true } : { newestFirst: true });
    for (const i of items) {
      const sk = String(i['SK']);
      const id = Number(i['id']);
      if (sk.endsWith('#after')) { afters.set(id, i['after']); continue; }
      if (sk.includes('#')) continue; // #done
      if (before !== undefined && id >= before) continue;
      if (opts.area && i['area'] !== opts.area) continue;
      if (records.length <= AUDIT_PAGE) records.push(i);
    }
  }
  const names = await listenersById(store, records.flatMap((r) => [String(r['adminId'] ?? ''), String(r['actingAs'] ?? '')]));
  const nameOf = (id: unknown) => (typeof id === 'string' ? ((names.get(id)?.['displayName'] as string | undefined) ?? null) : null);
  const page = records.slice(0, AUDIT_PAGE).map((r) => {
    const id = Number(r['id']);
    return {
      id: String(id), at: new Date(String(r['createdAt'])).toISOString(), adminId: String(r['adminId']), adminName: nameOf(r['adminId']),
      actingAs: (r['actingAs'] as string | null | undefined) ?? null, actingAsName: nameOf(r['actingAs']),
      area: r['area'] as AuditArea, action: String(r['action']), target: String(r['target']),
      before: obj(r['before']), after: obj(afters.has(id) ? afters.get(id) : r['after']), device: (r['device'] as string | null | undefined) ?? null,
    };
  });
  const last = page[page.length - 1];
  return records.length > AUDIT_PAGE && last ? { items: page, next: last.id } : { items: page };
}
