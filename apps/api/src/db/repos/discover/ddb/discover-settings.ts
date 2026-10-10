// Discover's layout on DynamoDB: one settings item with a version; the trending pins and hides in the trending list document.
/**
 * M26 lane DV (DV-08…DV-11). `CFG#discover-settings / V` (type `discoverSettings`): `order`, `hidden`, `version`.
 * A save is conditioned on the version the editor loaded (`attribute_not_exists` for 0) — the old `FOR UPDATE` +
 * compare. When the M15 body still sends pins/hides, the `trending` document is rewritten in the SAME transaction
 * (both kinds at once: one transaction may not touch one item twice), so layout, pins, hides and the audit record
 * commit together or not at all.
 */
import type { Db } from '../../../db.ts';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Store } from '../../../ddb/store.ts';
import { tx } from '../../../ddb/tx.ts';
import { commitOrDefer } from '../../safety/ddb/admin-scope.ts';
import { MAX_PINS, SECTION_IDS, type EpisodeRef, type Layout } from '../discover-settings.ts';
import { changed as listChanged, docWrite, readDoc, replacedRows } from './lists.ts';

const KEY = () => K.config('discover-settings');
const known = (ids: readonly string[]) => [...new Set(ids.filter((x) => (SECTION_IDS as readonly string[]).includes(x)))];

export async function getLayout(store: Store, _db: Db): Promise<Layout | undefined> {
  const it = await get(store, 'main', KEY());
  return it ? { version: Number(it['version']), order: (it['order'] as string[] | undefined) ?? [], hidden: (it['hidden'] as string[] | undefined) ?? [] } : undefined;
}

export async function putDiscoverSettings(store: Store, _db: Db, s: { version: number; order: string[]; hidden: string[]; pins?: EpisodeRef[]; hides?: { feedUrl: string; guid: string }[] }, by: string | null = null): Promise<number> {
  if (s.pins && s.pins.length > MAX_PINS) throw new ApiError('validation', `At most ${MAX_PINS} pinned episodes.`, { fields: ['pins'] });
  const cur = await get(store, 'main', KEY());
  const current = cur ? Number(cur['version']) : 0;
  if (current !== s.version) throw new ApiError('changed', 'Changed elsewhere — reload.', { version: current });
  const next = current + 1;
  const t = tx(store).put('main', encode('discoverSettings', KEY(), { order: known(s.order), hidden: known(s.hidden), version: next }), {
    condition: cur ? '#v = :cur' : 'attribute_not_exists(PK)', ...(cur ? { names: { '#v': 'version' }, values: { ':cur': current } } : {}), label: 'discover-settings',
  });
  if (s.pins || s.hides) {
    const seen = await readDoc(store, 'trending');
    let rows = seen.rows;
    if (s.pins) rows = await replacedRows(store, rows, 'pin', s.pins, by);
    if (s.hides) rows = await replacedRows(store, rows, 'hide', s.hides, by);
    docWrite(t, store, 'trending', seen, rows);
  }
  await commitOrDefer(store, t, { 'discover-settings': () => new ApiError('changed', 'Changed elsewhere — reload.', { version: current + 1 }), 'list:trending': listChanged });
  return next;
}
