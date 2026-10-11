// Lane DV's copy module: Discover's tables (lists, picks, curation, settings, promotions, dismissals, search words, similarity) and the per-episode listen index.
/**
 * M26 lane MIG for lane DV (data-model.md §20 "Lane DV changes"; bodies in src/db/repos/discover/ddb/).
 *
 * - `list_overrides` + `list_settings` → ONE `LIST#<listId> / V` document (`listDoc`) per list: every row with its
 *   numeric id, `v` (1 when it has rows — one save made it; 0 for a chip-only list, see below), `defaultTab` only when
 *   set (setDefaultTab REMOVEs it for NULL), and `SEQ#list_overrides` = max(id).
 * - `pick_days`/`pick_items`, `curated_issues`/`curated_issue_items`, `collections`/`collection_items` → one document
 *   each (`PICKS`, `CUR#issues`, `CUR#collections`), the child rows as `items` in position order.
 * - `discover_settings`, `foryou_weights` → `CFG#…/V` singletons; `foryou_rules` → `CFG#foryou-rules/<feedKey>`.
 * - `promotions` → `PROMO/<id>` (STRICT, no person attribute — G-L2); `rec_dismissals` → `L#<id>/DISMISS#…`.
 * - `search_requests` → `SEARCHREQ/<createdAt>#<id>` WITHOUT the listener id, plus the once-a-day mark
 *   (`L#<id>/SRQ#…` or `SRQ#anon/…`) for each asker and words of the last 2 days (the mark's own TTL; only the last
 *   24 h change behaviour). Requests older than 91 days are dropped (the item's TTL; the read keeps 90).
 * - `show_similarity` → `SIM#<generation>#…` rows + the `CFG#sim-current` pointer as a FINISHED build leaves it
 *   (`generation`, `computedAt`, `previous: null`; no `building*`). The generation name has the build's shape
 *   (`<compact time>-<8 hex>`), derived from the table: its max(computed_at) and row count.
 * - `activity` rows of kind `listened` (lane SG's table) → one `LSN#<episodeId>/<actorId>#<day>` item each, built by
 *   `listenMarkItem` exactly as lane SG's `writeAct` puts it (rows with a NULL day get none, as in writeAct).
 *
 * Skipped: `show_similarity_next` (build buffer), `trending_pins`, `trending_hides`, `category_features` (legacy,
 * copied into list_overrides by migration 028; no code reads them), `shared_lists` (still Postgres — see its spec).
 */
import { createHash } from 'node:crypto';
import { cleanWeights } from '@socialmorning/social-core';
import { encode } from '../../src/db/ddb/codec.ts';
import * as K from '../../src/db/ddb/keys.ts';
import type { Item } from '../../src/db/ddb/store.ts';
import { listenMarkItem } from '../../src/db/repos/discover/ddb/listens.ts';
import { MAX_OVERRIDES_PER_LIST } from '../../src/db/repos/discover/lists.ts';
import {
  arr, bool, dayOf, iso, isoReq, json, num, numReq, str, ttlFrom,
  type CounterCheck, type ItemIndex, type LaneModule, type Mismatch, type Out, type Row, type TableSpec,
} from './types.ts';

const DAY_MS = 86_400_000;
const main = (item: Item): Out => ({ table: 'main', item });
/** A timestamptz as the ISO text `toISOString` gives (ms, `Z`), inside json_build_object. */
const ISO = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const pkTail = (it: Item, prefix: string) => String(it['PK']).slice(prefix.length);
const sumOf = (xs: readonly Item[], f: (i: Item) => number) => xs.reduce((s, i) => s + f(i), 0);
const lenOf = (v: unknown) => (Array.isArray(v) ? v.length : 0);

// ---- similarity ----

const SIM_KEEP_MS = 30 * DAY_MS; // similarity.ts SIM_KEEP_DAYS
/** The generation name, `rebuildSimilarity`'s shape (`<compact ISO>-<8 hex>`), from the table only. */
export function simGeneration(maxComputedAt: unknown, rows: number): string {
  const at = isoReq(maxComputedAt);
  return `${at.replace(/[-:.TZ]/g, '')}-${createHash('sha256').update(`show_similarity|${at}|${rows}`).digest('hex').slice(0, 8)}`;
}

const similarity: TableSpec = {
  pgTable: 'show_similarity',
  sources: [
    {
      name: 'dv.similarity',
      sql: `SELECT s.show_a, s.show_b, s.sim::text AS sim, s.computed_at, g.at AS gen_at, g.n AS gen_n
              FROM show_similarity s CROSS JOIN (SELECT max(computed_at) AS at, count(*)::int AS n FROM show_similarity) g`,
      keys: ['show_a', 'show_b'],
      map(r: Row): Out[] {
        const generation = simGeneration(r['gen_at'], numReq(r['gen_n']));
        const showA = String(r['show_a']);
        const showB = String(r['show_b']);
        const sim = numReq(r['sim']);
        // TTL from the row's own time, as the build sets it (the hourly rebuild replaces the generation within 20 h).
        return [main(encode('similarity', K.similarity(generation, showA, sim, showB), { generation, showA, showB, sim, computedAt: isoReq(r['computed_at']) }, { ttl: ttlFrom(r['computed_at'], SIM_KEEP_MS) }))];
      },
    },
    {
      // The pointer as the last chunk's flip leaves it. An empty table gets no pointer (age null, no neighbours — as SQL).
      name: 'dv.simPointer',
      sql: `SELECT 'sim' AS k, max(computed_at) AS at, count(*)::int AS n FROM show_similarity HAVING count(*) > 0`,
      keys: ['k'],
      map(r: Row): Out[] {
        return [main(encode('simPointer', K.simPointer(), { generation: simGeneration(r['at'], numReq(r['n'])), computedAt: isoReq(r['at']), previous: null }))];
      },
    },
    {
      // Lane SG's `activity` table, kind `listened`: the per-episode listen index lane DV owns (data-model.md §20).
      // Kept on this spec because `activity` itself is lane SG's TableSpec.
      name: 'dv.listenMarks',
      sql: `SELECT a.id, a.actor_id::text AS actor_id, a.episode_id, a.day::text AS day, a.hidden, a.created_at
              FROM activity a WHERE a.kind = 'listened' AND a.day IS NOT NULL`,
      keys: ['id'],
      map(r: Row): Out[] {
        return [{ table: 'events', item: listenMarkItem({ actorId: String(r['actor_id']), episodeId: String(r['episode_id']), day: dayOf(r['day'])!, hidden: bool(r['hidden']), createdAt: isoReq(r['created_at']) }) }];
      },
    },
  ],
  counts: [
    { type: 'similarity' },
    { label: 'show_similarity → simPointer', type: 'simPointer', sql: 'SELECT (count(*) > 0)::int AS n FROM show_similarity' },
    { label: "activity(listened) → listenMark", type: 'listenMark', sql: "SELECT count(*)::int AS n FROM activity WHERE kind = 'listened' AND day IS NOT NULL" },
  ],
  // No `back`: show_similarity is derived — the hourly rebuild (jobs) recomputes it on Postgres from subscriptions and
  // finished positions. The listen index is derived from lane SG's activity rows (SG copies those back).
};

const similarityNext: TableSpec = {
  pgTable: 'show_similarity_next',
  skip: 'Build buffer of the Postgres rebuild (emptied at every swap). On DynamoDB the build writes a `building` generation under CFG#sim-current instead; no DynamoDB code reads this table.',
  sources: [], counts: [],
};

// ---- picks, issues, collections (documents) ----

type PickIt = { feedUrl: string; guid?: string | null; why: string; warning?: string | null };
type IssueIt = { feedUrl: string; guid?: string | null; note: string };
type ColIt = { feedUrl: string; guid?: string | null; why?: string | null };

const pickDays: TableSpec = {
  pgTable: 'pick_days',
  sources: [{
    name: 'dv.pickDays',
    sql: `SELECT d.day::text AS day, d.version, d.updated_at, d.updated_by::text AS updated_by,
                 (SELECT coalesce(json_agg(json_build_object('feedUrl', i.feed_url, 'guid', i.guid, 'why', i.why, 'warning', i.warning) ORDER BY i.position), '[]'::json)
                    FROM pick_items i WHERE i.day = d.day) AS items
            FROM pick_days d`,
    keys: ['day'],
    map(r: Row): Out[] {
      const day = dayOf(r['day'])!;
      const items = (json<PickIt[]>(r['items']) ?? []).map((p) => ({ feedUrl: p.feedUrl, ...(p.guid != null ? { guid: p.guid } : {}), why: p.why, ...(p.warning ? { warning: p.warning } : {}) }));
      return [main(encode('pickDay', K.pickDay(day), { day, version: numReq(r['version']), updatedAt: isoReq(r['updated_at']), updatedBy: str(r['updated_by']) ?? undefined, items }))];
    },
  }],
  counts: [{ type: 'pickDay' }],
  back: [{
    pgTable: 'pick_days', pk: ['day'],
    match: (it) => it['t'] === 'pickDay',
    toRow: (it) => ({ day: String(it['day']), version: Number(it['version']), updated_at: String(it['updatedAt']), updated_by: (it['updatedBy'] as string | undefined) ?? null }),
    children: (it) => [{
      table: 'pick_items', match: { day: String(it['day']) },
      rows: ((it['items'] as PickIt[] | undefined) ?? []).map((p, i) => ({ day: String(it['day']), position: i + 1, feed_url: p.feedUrl, guid: p.guid ?? null, why: p.why, warning: p.warning ?? null })),
    }],
  }],
};

const pickItems: TableSpec = {
  pgTable: 'pick_items',
  // Held inside the `PICKS/<day>` documents (dv.pickDays); written back as pick_days' children.
  sources: [],
  counts: [{ label: 'pick_items → pickDay.items', measure: (ix) => sumOf(ix.ofType('pickDay'), (i) => lenOf(i['items'])) }],
};

const curatedIssues: TableSpec = {
  pgTable: 'curated_issues',
  sources: [{
    name: 'dv.curatedIssues',
    sql: `SELECT c.id, c.day::text AS day, c.title, c.intro, c.retired_at, c.version, c.updated_at,
                 (SELECT coalesce(json_agg(json_build_object('feedUrl', i.feed_url, 'guid', i.guid, 'note', i.note) ORDER BY i.position), '[]'::json)
                    FROM curated_issue_items i WHERE i.issue_id = c.id) AS items
            FROM curated_issues c`,
    keys: ['id'],
    map(r: Row): Out[] {
      const id = String(r['id']);
      const items = (json<IssueIt[]>(r['items']) ?? []).map((x) => ({ feedUrl: x.feedUrl, ...(x.guid ? { guid: x.guid } : {}), note: x.note }));
      return [main(encode('curatedIssue', K.curatedIssue(id), {
        id, day: dayOf(r['day']), title: String(r['title']), intro: String(r['intro']), items, version: numReq(r['version']), retiredAt: iso(r['retired_at']), updatedAt: isoReq(r['updated_at']),
      }))];
    },
  }],
  counts: [{ type: 'curatedIssue' }],
  back: [{
    pgTable: 'curated_issues', pk: ['id'],
    match: (it) => it['t'] === 'curatedIssue',
    toRow: (it) => ({ id: String(it['id']), day: String(it['day']), title: String(it['title']), intro: String(it['intro']), retired_at: (it['retiredAt'] as string | null | undefined) ?? null, version: Number(it['version']), updated_at: String(it['updatedAt']) }),
    children: (it) => [{
      table: 'curated_issue_items', match: { issue_id: String(it['id']) },
      rows: ((it['items'] as IssueIt[] | undefined) ?? []).map((x, i) => ({ issue_id: String(it['id']), position: i + 1, feed_url: x.feedUrl, guid: x.guid ?? null, note: x.note })),
    }],
  }],
};

const curatedIssueItems: TableSpec = {
  pgTable: 'curated_issue_items',
  // Held inside `CUR#issues/<id>` (dv.curatedIssues). Positions become 1…n in order (the readers number them i + 1).
  sources: [],
  counts: [{ label: 'curated_issue_items → curatedIssue.items', measure: (ix) => sumOf(ix.ofType('curatedIssue'), (i) => lenOf(i['items'])) }],
};

const collections: TableSpec = {
  pgTable: 'collections',
  sources: [{
    name: 'dv.collections',
    sql: `SELECT c.id, c.title, c.subtitle, c.position, c.retired_at, c.version, c.updated_at,
                 (SELECT coalesce(json_agg(json_build_object('feedUrl', i.feed_url, 'guid', i.guid, 'why', i.why) ORDER BY i.position), '[]'::json)
                    FROM collection_items i WHERE i.collection_id = c.id) AS items
            FROM collections c`,
    keys: ['id'],
    map(r: Row): Out[] {
      const id = String(r['id']);
      const items = (json<ColIt[]>(r['items']) ?? []).map((x) => ({ feedUrl: x.feedUrl, ...(x.guid ? { guid: x.guid } : {}), ...(x.why ? { why: x.why } : {}) }));
      return [main(encode('curatedCollection', K.curatedCollection(id), {
        id, title: String(r['title']), subtitle: str(r['subtitle']), position: numReq(r['position']), items, version: numReq(r['version']), retiredAt: iso(r['retired_at']), updatedAt: isoReq(r['updated_at']),
      }))];
    },
  }],
  counts: [{ type: 'curatedCollection' }],
  back: [{
    pgTable: 'collections', pk: ['id'],
    match: (it) => it['t'] === 'curatedCollection',
    toRow: (it) => ({ id: String(it['id']), title: String(it['title']), subtitle: (it['subtitle'] as string | null | undefined) ?? null, position: Number(it['position']), retired_at: (it['retiredAt'] as string | null | undefined) ?? null, version: Number(it['version']), updated_at: String(it['updatedAt']) }),
    children: (it) => [{
      table: 'collection_items', match: { collection_id: String(it['id']) },
      rows: ((it['items'] as ColIt[] | undefined) ?? []).map((x, i) => ({ collection_id: String(it['id']), position: i + 1, feed_url: x.feedUrl, guid: x.guid ?? null, why: x.why ?? null })),
    }],
  }],
};

const collectionItems: TableSpec = {
  pgTable: 'collection_items',
  // Held inside `CUR#collections/<id>` (dv.collections).
  sources: [],
  counts: [{ label: 'collection_items → curatedCollection.items', measure: (ix) => sumOf(ix.ofType('curatedCollection'), (i) => lenOf(i['items'])) }],
};

// ---- settings, weights, rules ----

const discoverSettings: TableSpec = {
  pgTable: 'discover_settings',
  sources: [{
    name: 'dv.discoverSettings',
    sql: 'SELECT id, section_order, hidden_sections, version FROM discover_settings',
    keys: ['id'],
    // The arrays as stored (the Postgres read returns them unfiltered; the writer's filter ran when they were saved).
    map: (r: Row): Out[] => [main(encode('discoverSettings', K.config('discover-settings'), { order: arr(r['section_order']) ?? [], hidden: arr(r['hidden_sections']) ?? [], version: numReq(r['version']) }))],
  }],
  counts: [{ type: 'discoverSettings' }],
  back: [{
    pgTable: 'discover_settings', pk: ['id'],
    match: (it) => it['t'] === 'discoverSettings',
    toRow: (it) => ({ id: 1, section_order: (it['order'] as string[] | undefined) ?? [], hidden_sections: (it['hidden'] as string[] | undefined) ?? [], version: Number(it['version']) }),
  }],
};

const forYouRules: TableSpec = {
  pgTable: 'foryou_rules',
  sources: [{
    name: 'dv.forYouRules',
    sql: 'SELECT feed_url, rule, note, created_by::text AS created_by, created_at FROM foryou_rules',
    keys: ['feed_url'],
    map: (r: Row): Out[] => [main(encode('forYouRule', K.forYouRule(String(r['feed_url'])), {
      feedUrl: String(r['feed_url']), rule: String(r['rule']), note: str(r['note']), createdBy: str(r['created_by']), createdAt: isoReq(r['created_at']),
    }))],
  }],
  counts: [{ type: 'forYouRule' }],
  back: [{
    pgTable: 'foryou_rules', pk: ['feed_url'],
    match: (it) => it['t'] === 'forYouRule',
    toRow: (it) => ({ feed_url: String(it['feedUrl']), rule: String(it['rule']), note: (it['note'] as string | null | undefined) ?? null, created_by: (it['createdBy'] as string | null | undefined) ?? null, created_at: String(it['createdAt']) }),
  }],
};

const forYouWeights: TableSpec = {
  pgTable: 'foryou_weights',
  sources: [{
    name: 'dv.forYouWeights',
    sql: 'SELECT id, weights, version, updated_at FROM foryou_weights',
    keys: ['id'],
    // cleanWeights, as putWeights stores it (both reads apply it too, so the answer is the same).
    map: (r: Row): Out[] => [main(encode('forYouWeights', K.config('foryou-weights'), { weights: cleanWeights(json(r['weights'])), version: numReq(r['version']), updatedAt: isoReq(r['updated_at']) }))],
  }],
  counts: [{ type: 'forYouWeights' }],
  back: [{
    pgTable: 'foryou_weights', pk: ['id'],
    match: (it) => it['t'] === 'forYouWeights',
    toRow: (it) => ({ id: 1, weights: it['weights'] as object, version: Number(it['version']), updated_at: String(it['updatedAt']) }),
  }],
};

// ---- lists: list_overrides + list_settings → one document per list ----

type DocRow = {
  id: number; kind: string; feedUrl: string | null; guid: string | null; commentId: string | null; position: number | null;
  startsAt: string | null; endsAt: string | null; note: string | null; createdAt: string; createdBy: string | null;
};

const listOverrides: TableSpec = {
  pgTable: 'list_overrides',
  sources: [
    {
      name: 'dv.listDocs',
      sql: `SELECT l.list_id, s.default_tab, s.updated_at AS settings_at,
                   (SELECT max(o.created_at) FROM list_overrides o WHERE o.list_id = l.list_id) AS rows_at,
                   (SELECT coalesce(json_agg(json_build_object(
                             'id', o.id, 'kind', o.kind, 'feedUrl', o.feed_url, 'guid', o.guid, 'commentId', o.comment_id::text, 'position', o.position,
                             'startsAt', ${ISO('o.starts_at')}, 'endsAt', ${ISO('o.ends_at')}, 'note', o.note, 'createdAt', ${ISO('o.created_at')}, 'createdBy', o.created_by::text
                           ) ORDER BY o.id), '[]'::json)
                      FROM list_overrides o WHERE o.list_id = l.list_id) AS rows
              FROM (SELECT list_id FROM list_overrides UNION SELECT list_id FROM list_settings) l
              LEFT JOIN list_settings s ON s.list_id = l.list_id`,
      keys: ['list_id'],
      map(r: Row): Out[] {
        const listId = String(r['list_id']);
        const rows: DocRow[] = (json<DocRow[]>(r['rows']) ?? []).map((x) => ({
          id: numReq(x.id), kind: x.kind, feedUrl: x.feedUrl ?? null, guid: x.guid ?? null, commentId: x.commentId ?? null, position: num(x.position),
          startsAt: x.startsAt ?? null, endsAt: x.endsAt ?? null, note: x.note ?? null, createdAt: x.createdAt, createdBy: x.createdBy ?? null,
        }));
        const times = [iso(r['rows_at']), iso(r['settings_at'])].filter((t): t is string => t !== null).sort();
        const tab = str(r['default_tab']);
        // `v` 1 = one save made the rows. A chip-only list (setDefaultTab alone writes no `v`/`rows`) gets rows [] and
        // v 0 here: readDoc then sees v 0 and the first pin's `#v = :seen` condition holds (with `v` absent it never would).
        return [main(encode('listDoc', K.listDoc(listId), {
          listId, rows, v: rows.length > 0 ? 1 : 0, updatedAt: times[times.length - 1]!, ...(tab !== null ? { defaultTab: tab } : {}),
        }))];
      },
    },
    {
      // `SEQ#list_overrides` = the last id issued (seq.ts); absent when the table is empty.
      name: 'dv.listOverridesSeq',
      sql: `SELECT 'list_overrides' AS name, max(id)::text AS v FROM list_overrides HAVING count(*) > 0`,
      keys: ['name'],
      map: (r: Row): Out[] => [main(encode('seq', K.seq('list_overrides'), { v: numReq(r['v']) }))],
    },
  ],
  counts: [
    { label: 'list_overrides → listDoc.rows', measure: (ix) => sumOf(ix.ofType('listDoc'), (i) => lenOf(i['rows'])) },
    { label: 'lists → listDoc', type: 'listDoc', sql: 'SELECT count(*)::int AS n FROM (SELECT list_id FROM list_overrides UNION SELECT list_id FROM list_settings) s' },
    { label: 'list_overrides → SEQ#list_overrides', type: 'seq', pk: 'SEQ#list_overrides', sql: 'SELECT (count(*) > 0)::int AS n FROM list_overrides' },
  ],
  // Written back as list_settings' children (one document holds both tables).
};

const listSettings: TableSpec = {
  pgTable: 'list_settings',
  // Inside the `LIST#<listId>/V` documents (dv.listDocs on list_overrides' spec).
  sources: [],
  counts: [{ label: 'list_settings(default_tab) → listDoc.defaultTab', type: 'listDoc', where: (i) => typeof i['defaultTab'] === 'string', sql: 'SELECT count(*)::int AS n FROM list_settings WHERE default_tab IS NOT NULL' }],
  back: [{
    // Every document: its settings row (default_tab NULL reads as "no default", as a missing row does) and its overrides.
    pgTable: 'list_settings', pk: ['list_id'],
    match: (it) => it['t'] === 'listDoc',
    toRow: (it) => ({ list_id: String(it['listId']), default_tab: (it['defaultTab'] as string | undefined) ?? null, updated_at: String(it['updatedAt']) }),
    children: (it) => [{
      table: 'list_overrides', match: { list_id: String(it['listId']) },
      rows: ((it['rows'] as DocRow[] | undefined) ?? []).map((x) => ({
        id: Number(x.id), list_id: String(it['listId']), kind: x.kind, feed_url: x.feedUrl ?? null, guid: x.guid ?? null, comment_id: x.commentId ?? null, position: x.position ?? null,
        starts_at: x.startsAt ?? null, ends_at: x.endsAt ?? null, note: x.note ?? null, created_by: x.createdBy ?? null, created_at: x.createdAt,
      })),
    }],
  }],
};

const legacy = (pgTable: string): TableSpec => ({
  pgTable,
  skip: 'Legacy M15 table: migration 028 copied its rows into list_overrides (the `trending` / `category:<id>` documents); no Postgres or DynamoDB code reads it any more.',
  sources: [], counts: [],
});

// ---- promotions, dismissals, search requests ----

const promotions: TableSpec = {
  pgTable: 'promotions',
  sources: [{
    name: 'dv.promotions',
    sql: `SELECT id::text AS id, image_url, image_path, image_bytes, target_kind, target, label, starts_at, ends_at, weight, daily_cap,
                 impressions::text AS impressions, taps::text AS taps, retired_at, created_at FROM promotions`,
    keys: ['id'],
    map: (r: Row): Out[] => [main(encode('promotion', K.promotion(String(r['id'])), {
      id: String(r['id']), imageUrl: String(r['image_url']), imagePath: String(r['image_path']), imageBytes: numReq(r['image_bytes']),
      targetKind: String(r['target_kind']), target: String(r['target']), label: String(r['label']), startsAt: isoReq(r['starts_at']), endsAt: isoReq(r['ends_at']),
      weight: numReq(r['weight']), dailyCap: numReq(r['daily_cap']), impressions: numReq(r['impressions']), taps: numReq(r['taps']), retiredAt: iso(r['retired_at']), createdAt: isoReq(r['created_at']),
    }))],
  }],
  counts: [{ type: 'promotion' }],
  back: [{
    pgTable: 'promotions', pk: ['id'],
    match: (it) => it['t'] === 'promotion',
    toRow: (it) => ({
      id: String(it['id']), image_url: it['imageUrl'], image_path: it['imagePath'], image_bytes: Number(it['imageBytes']), target_kind: it['targetKind'], target: it['target'],
      label: it['label'], starts_at: it['startsAt'], ends_at: it['endsAt'], weight: Number(it['weight']), daily_cap: Number(it['dailyCap']),
      impressions: Number(it['impressions'] ?? 0), taps: Number(it['taps'] ?? 0), retired_at: (it['retiredAt'] as string | null | undefined) ?? null, created_at: it['createdAt'],
    }),
  }],
};

const dismissals: TableSpec = {
  pgTable: 'rec_dismissals',
  sources: [{
    name: 'dv.dismissals',
    sql: 'SELECT listener_id::text AS listener_id, kind, item_key, created_at FROM rec_dismissals',
    keys: ['listener_id', 'kind', 'item_key'],
    map: (r: Row): Out[] => [main(encode('dismissal', K.dismissal(String(r['listener_id']), String(r['kind']), String(r['item_key'])), {
      kind: String(r['kind']), itemKey: String(r['item_key']), createdAt: isoReq(r['created_at']),
    }))],
  }],
  counts: [{ type: 'dismissal' }],
  back: [{
    pgTable: 'rec_dismissals', pk: ['listener_id', 'kind', 'item_key'],
    match: (it) => it['t'] === 'dismissal',
    toRow: (it) => ({ listener_id: pkTail(it, 'L#'), kind: String(it['kind']), item_key: String(it['itemKey']), created_at: String(it['createdAt']) }),
  }],
};

const SEARCH_KEEP_MS = 91 * DAY_MS; // search-requests.ts: TTL KEEP_DAYS + 1
const SEARCH_MARK_MS = 2 * DAY_MS; // the once-a-day mark's TTL

const searchRequests: TableSpec = {
  pgTable: 'search_requests',
  sources: [
    {
      // Dropped: requests older than 91 days (their item's TTL would have removed them; the admin list reads 90).
      name: 'dv.searchRequests',
      sql: `SELECT id::text AS id, q, created_at FROM search_requests WHERE created_at > now() - interval '91 days'`,
      keys: ['id'],
      map(r: Row): Out[] {
        const at = isoReq(r['created_at']);
        return [main(encode('searchRequest', K.searchRequest(at, String(r['id'])), { id: String(r['id']), q: String(r['q']), createdAt: at }, { ttl: ttlFrom(at, SEARCH_KEEP_MS) }))];
      },
    },
    {
      // The once-a-day mark: per asker (a NULL listener = everyone signed out, `SRQ#anon`) and lowercased words, the
      // newest request of the last 2 days (older marks have expired by TTL; only the last 24 h matter to the rule).
      name: 'dv.searchMarks',
      sql: `SELECT coalesce(listener_id::text, '') AS who, lower(q) AS lq, min(q) AS q, max(created_at) AS at
              FROM search_requests WHERE created_at > now() - interval '2 days' GROUP BY 1, 2`,
      keys: ['who', 'lq'],
      map(r: Row): Out[] {
        const at = isoReq(r['at']);
        const who = String(r['who']);
        // The key from the words themselves (`sha(q.toLowerCase())`, as insertSearchRequest computes it).
        return [main(encode('searchDedupe', K.searchDedupe(who === '' ? null : who, String(r['q'])), { at }, { ttl: ttlFrom(at, SEARCH_MARK_MS) }))];
      },
    },
  ],
  counts: [
    { type: 'searchRequest', sql: "SELECT count(*)::int AS n FROM search_requests WHERE created_at > now() - interval '91 days'" },
    { label: 'search_requests → searchDedupe', type: 'searchDedupe', sql: "SELECT count(*)::int AS n FROM (SELECT 1 FROM search_requests WHERE created_at > now() - interval '2 days' GROUP BY coalesce(listener_id::text, ''), lower(q)) s" },
  ],
  back: [{
    // The item carries no listener id (by design): rows come back with listener_id NULL.
    pgTable: 'search_requests', pk: ['id'],
    match: (it) => it['t'] === 'searchRequest',
    toRow: (it) => ({ id: String(it['id']), listener_id: null, q: String(it['q']), created_at: String(it['createdAt']) }),
  }],
};

const sharedLists: TableSpec = {
  pgTable: 'shared_lists',
  skip: 'Still Postgres-only: lane DV moved only the show rows of a shared list (ddb/shared-lists.ts sharedListShowRows). The list rows are read and written in SQL by '
    + 'social/shared-lists.ts sharedListRows + insertSharedList, safety/ddb/foreign.ts sharedListRow / liveAuthor / removeEffect (lane SF\'s DynamoDB moderation, through pg), '
    + 'safety/reports.ts snapshotTargetPg, safety/moderation.ts actPg + authorOfPg, safety/appeals.ts restoreRemovedPg, account/data-export.ts SECTIONS. Lane CUT must convert them.',
  sources: [], counts: [],
};

// ---- counters (read only) ----

const counters: CounterCheck[] = [
  {
    // SEQ#list_overrides must be ≥ every row id in every list document (a new row takes nextSeq).
    name: 'listDoc.seq',
    check(ix: ItemIndex): Mismatch[] {
      const max = ix.ofType('listDoc').reduce((m, d) => Math.max(m, ...((d['rows'] as { id: number }[] | undefined) ?? []).map((r) => Number(r.id))), 0);
      const seq = ix.get('main', 'SEQ#list_overrides', 'S');
      const stored = seq ? Number(seq['v']) : 0;
      return stored >= max ? [] : [{ counter: 'seq.list_overrides', key: 'SEQ#list_overrides|S', stored, recomputed: max }];
    },
  },
  {
    // A list holds at most MAX_OVERRIDES_PER_LIST rows (storeOverride refuses more); ids are unique within it.
    name: 'listDoc.rows',
    check(ix: ItemIndex): Mismatch[] {
      const out: Mismatch[] = [];
      for (const d of ix.ofType('listDoc')) {
        const rows = (d['rows'] as { id: number }[] | undefined) ?? [];
        const ids = new Set(rows.map((r) => Number(r.id)));
        if (rows.length > MAX_OVERRIDES_PER_LIST || ids.size !== rows.length) out.push({ counter: 'listDoc.rows', key: `${String(d['PK'])}|${String(d['SK'])}`, stored: rows.length, recomputed: ids.size });
      }
      return out;
    },
  },
  {
    // The pointer's generation has rows, and its computedAt is the newest row time of that generation.
    name: 'simPointer.generation',
    check(ix: ItemIndex): Mismatch[] {
      const p = ix.get('main', 'CFG#sim-current', 'V');
      if (!p) return [];
      const rows = ix.ofType('similarity').filter((s) => s['generation'] === p['generation']);
      const newest = rows.reduce<string | null>((m, s) => (m === null || String(s['computedAt']) > m ? String(s['computedAt']) : m), null);
      const out: Mismatch[] = [];
      if (rows.length === 0) out.push({ counter: 'simPointer.rows', key: 'CFG#sim-current|V', stored: p['generation'], recomputed: 0 });
      else if (newest !== p['computedAt']) out.push({ counter: 'simPointer.computedAt', key: 'CFG#sim-current|V', stored: p['computedAt'], recomputed: newest });
      return out;
    },
  },
];

export const lane: LaneModule = {
  lane: 'dv',
  tables: [
    similarity, similarityNext,
    pickDays, pickItems, curatedIssues, curatedIssueItems, collections, collectionItems,
    discoverSettings, legacy('trending_pins'), legacy('trending_hides'), legacy('category_features'),
    promotions, dismissals, searchRequests, sharedLists,
    listSettings, listOverrides, forYouRules, forYouWeights,
  ],
  counters,
};
