// Recommendation events on DynamoDB: RE#<listener> items in sm-events, an hourly per-channel rollup, the 90-day sweep by day.
/**
 * M26 lane LB, patterns LB-24/25/58, data-model.md §4 (`RE#<listenerId>`, TTL 90 d), §7 C (rollups).
 * - Each event: `RE#<listenerId>` / `<at>#<id padded>` with a numeric id from `SEQ#rec_events`, E1
 *   `DAY#<day>` / `re#<listenerId>#<id>` (the sweep reads a day without a Scan) and TTL at + 90 days
 *   (a backstop: the hourly sweep deletes on time, as today).
 * - Rollup: `R#recs#all` / `<yyyy-mm-ddThh>` with one counter per channel×kind (`ADD`), so the 7-day table
 *   for /mod/recs is one Query over ≤ 168 hour items. The window is whole hours (the SQL's was to the
 *   second) — documented in data-model.md "Lane LB changes".
 */
import type { NativeAttributeValue } from '@aws-sdk/lib-dynamodb';
import type { Db } from '../../../db.ts';
import { bridgeOf } from '../../../backend-ddb.ts';
import { batchWriteAll } from '../../../ddb/batch.ts';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { nextSeq } from '../../../ddb/seq.ts';
import { update, type Store } from '../../../ddb/store.ts';
import * as pg from '../rec-events.ts';
import { sweepOldRecEvents as pgSweepOldRecEvents } from '../../old-rows-sweep.ts';
import type { ChannelRollup, RecEventIn } from '../rec-events.ts';

const DAY_MS = 86_400_000;
export const REC_KEEP_DAYS = 90;
const KINDS = { impression: 'shown', open: 'opened', play: 'played', finish: 'finished' } as const;
const ROLLUP_PK = K.ev.rollup('recs', 'all', '2000-01-01T00:00:00Z').PK;

export async function recordEvents(store: Store, db: Db, listenerId: string, events: readonly RecEventIn[]): Promise<number> {
  if (events.length === 0) return 0;
  const first = await nextSeq(store, 'rec_events', events.length);
  await batchWriteAll(store, 'events', events.map((e, i) => {
    const id = first + i;
    const at = K.ts(e.at);
    return {
      put: encode('recEvent', K.ev.recEvent(listenerId, at, id), { id, listenerId, episodeId: e.episodeId, channel: e.channel, rank: e.rank, kind: e.kind, at }, {
        gsi: K.E1(at.slice(0, 10), 're', `${listenerId}#${id}`), ttl: ttlAfter(Date.parse(at), REC_KEEP_DAYS * DAY_MS),
      }),
    };
  }));
  const perHour = new Map<string, Map<string, number>>();
  for (const e of events) {
    const hour = K.ts(e.at);
    const counts = perHour.get(K.ev.rollup('recs', 'all', hour).SK) ?? new Map<string, number>();
    const attr = `${e.channel}|${e.kind}`;
    counts.set(attr, (counts.get(attr) ?? 0) + 1);
    perHour.set(K.ev.rollup('recs', 'all', hour).SK, counts);
  }
  for (const [sk, counts] of perHour) {
    const names: Record<string, string> = { '#t': 't' };
    const values: Record<string, NativeAttributeValue> = { ':t': 'rollup' };
    const adds = [...counts].map(([attr, n], i) => { names[`#c${i}`] = attr; values[`:c${i}`] = n; return `#c${i} :c${i}`; });
    await update(store, 'events', { PK: ROLLUP_PK, SK: sk }, { update: `SET #t = :t ADD ${adds.join(', ')}`, names, values });
  }
  const raw = bridgeOf(db);
  if (raw) await pg.recordEvents(raw, listenerId, events);
  return events.length;
}

export async function rollup(store: Store, _db: Db, days = 7): Promise<ChannelRollup[]> {
  const from = K.ev.rollup('recs', 'all', new Date(store.clock.now() - days * DAY_MS).toISOString()).SK;
  const { items } = await queryAll(store, 'events', {
    KeyConditionExpression: 'PK = :pk AND SK >= :from',
    ExpressionAttributeValues: { ':pk': ROLLUP_PK, ':from': from },
  });
  const by = new Map<string, ChannelRollup>();
  for (const it of items) {
    for (const [attr, n] of Object.entries(it)) {
      const [channel, kind] = attr.split('|') as [string, keyof typeof KINDS | undefined];
      if (!kind || !(kind in KINDS)) continue;
      const row = by.get(channel) ?? { channel, shown: 0, opened: 0, played: 0, finished: 0 };
      row[KINDS[kind]] += Number(n);
      by.set(channel, row);
    }
  }
  return [...by.values()].sort((a, b) => a.channel.localeCompare(b.channel));
}

/**
 * LB-58: events older than 90 days, read by day through E1 (the 30 days before the cutoff — the sweep runs
 * hourly, so nothing older survives it; TTL removes anything a long outage left behind).
 */
export async function sweepOldRecEvents(store: Store, db: Db): Promise<number> {
  const cutoff = store.clock.now() - REC_KEEP_DAYS * DAY_MS;
  const doomed: { PK: string; SK: string }[] = [];
  for (let d = 0; d <= 30; d++) {
    const day = K.day(cutoff - d * DAY_MS);
    const { items } = await queryAll(store, 'events', {
      IndexName: K.INDEX.E1, KeyConditionExpression: 'E1PK = :d AND begins_with(E1SK, :re)', ExpressionAttributeValues: { ':d': `DAY#${day}`, ':re': 're#' },
    });
    for (const it of items) if (Date.parse(String(it['SK']).slice(0, 24)) < cutoff) doomed.push({ PK: String(it['PK']), SK: String(it['SK']) });
  }
  await batchWriteAll(store, 'events', doomed.map((k) => ({ delete: k })));
  const raw = bridgeOf(db);
  if (raw) await pgSweepOldRecEvents(raw);
  return doomed.length;
}
