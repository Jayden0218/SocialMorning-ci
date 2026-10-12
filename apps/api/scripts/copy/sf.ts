// Lane SF's copy: safety (reports, blocks, actions, appeals, hidden shows), admin (admins, audit), config, words, content, translation.
/**
 * M26 lane MIG for lane SF (data-model.md "Lane SF changes", §3 `RPT#`/`MA#`/`APPEAL#`/`BLOCK#`, Appendix A rows
 * 13–16, 50, 51, 88–91, 98, 100, 101, 114, 115). Each row becomes the items lane SF's own code
 * (src/db/repos/safety/ddb/**, src/auth/admin-tx.ts) writes for it:
 *
 * - moderation_actions → `MA#<id>/A` with G4 `Q#actions`, G5 `REF#subject#<person>`; `snapshot` + `reportAuthorId` are
 *   the copy of the FIRST report it closed (`closed_by = id`, by created_at — act()'s `firstCopy`), `subjectListenerId`
 *   the profile itself or that copy's author. A Studio host hide/unhide (lane ST's setHostHidden) keeps `snapshot: {}`
 *   and no subject; a /mod Studio take-down (finishTakedown) closes no report → `snapshot: null` (the same rule gives it).
 * - reports → `RPT#<kind>#<target>/BY#<reporter>` (G4 open/closed queue, G5 by id, G1 the reported person, G2 `SHTR#`
 *   on transcript reports — `reportGsi`), TTL closedAt + 90 d on a closed one, + the reporter's own `L#/RPTBY#` copy.
 *   A report whose reporter deleted their account (`reporter_id` NULL) keeps no copy, and — the original reporter
 *   being unknown — its SK is `BY#<report id>` (unique, cannot collide with a listener id).
 * - blocks → `L#<blocker>/BLOCK#<blocked>` (G4 `Q#blocks`) + `L#<blocked>/BLOCKEDBY#<blocker>`.
 * - hidden_feeds → `CFG#hidden-feeds/<feedKey>`; the publishers' `itunes:block` marks (`cache` rows `feed-block:<url>`,
 *   lane LB's table) → `CFG#hidden-feeds/PUB#<feedKey>` (this lane owns the partition; createdAt = the marker's fetched_at).
 * - The dashboard counters `R#dash#{reports,actions,blocks}/<yyyy-mm-ddThh>` (sm-events): rows per UTC hour of
 *   created_at — every report, every action, every block that exists (dash.ts / metrics.ts recountDay).
 * - admins → ONE `CFG#admins/V` item (map id → { grantedAt, grantedBy }); none when the table is empty.
 * - admin_audit → `AUDIT#<yyyy-mm>/<id>` (`create: true`: append-only) with its `after` in the record (no `#after`
 *   sibling: that exists only when the change rode in the record's own transaction) + `SEQ#audit` = max(id).
 * - blocked_words → ONE `CFG#words/V` { words: word → { by, at }, v: 1 } (v = what a first write gives).
 * - app_settings → `CFG#maintenance/V` for key `maintenance` — the only key the code reads (maintenance.ts). Any other
 *   key has no DynamoDB home and is not copied (count narrowed with the same WHERE).
 * - app_config → `CFG#app-config/<key>`; content_pages → `CONTENT#<kind>/<slug>` (content.ts `pageItem`).
 * - translation_jobs → `TRJOB#<ep>#<lang>/J` (G4 `Q#trjobs` while active, G5 `REF#trjob#all`, v 0) + `SEG#n` pieces of
 *   the segments JSON (`splitJson`, write id `w` from the row); transcripts_translated → `TR#<ep>#<lang>/META` + `LINES#n`.
 * - translation_shows → `CFG#translation-shows/<feedKey>`; groq_usage → `GROQ#<day>/<model>` (sm-events).
 */
import { encode } from '../../src/db/ddb/codec.ts';
import * as K from '../../src/db/ddb/keys.ts';
import type { Item } from '../../src/db/ddb/store.ts';
import { pageItem } from '../../src/db/repos/safety/ddb/content.ts';
import { KEEP_CLOSED_DAYS, reportGsi } from '../../src/db/repos/safety/ddb/reports.ts';
import { splitJson } from '../../src/db/repos/safety/ddb/translation.ts';
import { DASH_METRICS } from '../../src/db/repos/safety/ddb/dash.ts';
import { chunkWords } from '../../src/db/repos/safety/ddb/words.ts';
import type { ContentKind } from '../../src/db/repos/config/content.ts';
import {
  bool, dayOf, iso, isoReq, json, num, numReq, str, ttlFrom,
  type CounterCheck, type ItemIndex, type LaneModule, type Mismatch, type Out, type Row, type TableSpec,
} from './types.ts';

const DAY_MS = 86_400_000;
const main = (item: Item, create = false): Out => (create ? { table: 'main', item, create } : { table: 'main', item });
const events = (item: Item): Out => ({ table: 'events', item });
const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
const obj = (v: unknown): Record<string, unknown> => {
  const x = json(v);
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
};
/** A timestamptz as the ISO text `iso()` gives (UTC, milliseconds) — for values built inside SQL (jsonb maps). */
const isoSql = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const ACTIVE_JOB = new Set(['queued', 'transcribing', 'translating']);
/** A chunk write id from the row (the code uses a random uuid; any id shared by the job and its pieces will do). */
const writeId = (...parts: string[]) => `mig-${K.sha(parts.join('#')).slice(0, 22)}`;
const pkTail = (item: Item, prefix: string) => String(item['PK']).slice(prefix.length);

// ---------------------------------------------------------------- moderation_actions

const moderationActions: TableSpec = {
  pgTable: 'moderation_actions',
  sources: [{
    name: 'sf.actions',
    sql: `SELECT a.id::text AS id, a.actor_id::text AS actor_id, a.action, a.target_kind, a.target_id, a.created_at,
                 (SELECT r.snapshot FROM reports r WHERE r.closed_by = a.id ORDER BY r.created_at, r.id LIMIT 1) AS first_snapshot
            FROM moderation_actions a`,
    keys: ['id'],
    map(r: Row): Out[] {
      const id = String(r['id']);
      const at = isoReq(r['created_at']);
      const action = String(r['action']);
      const kind = String(r['target_kind']);
      const targetId = String(r['target_id']);
      const host = action === 'host_hide' || action === 'host_unhide';
      const first = r['first_snapshot'] === null || r['first_snapshot'] === undefined ? null : obj(r['first_snapshot']);
      const reportAuthorId = first && isUuid(first['authorId']) ? first['authorId'] : null;
      const subject = host ? null : kind === 'profile' && isUuid(targetId) ? targetId : reportAuthorId;
      return [main(encode('moderationAction', K.moderationAction(id), {
        id, actorId: String(r['actor_id']), action, targetKind: kind, targetId,
        subjectListenerId: subject, reportAuthorId: host ? null : reportAuthorId, snapshot: host ? {} : first, createdAt: at,
      }, { gsi: { ...K.G4('actions', at, id), ...(subject ? K.G5('subject', subject, at) : {}) } }))];
    },
  }],
  counts: [{ type: 'moderationAction' }],
  back: [{
    pgTable: 'moderation_actions', pk: ['id'],
    match: (i) => i['t'] === 'moderationAction',
    toRow: (i) => ({ id: i['id'], actor_id: i['actorId'], action: i['action'], target_kind: i['targetKind'], target_id: i['targetId'], created_at: i['createdAt'] }),
  }],
};

// ---------------------------------------------------------------- reports

const reports: TableSpec = {
  pgTable: 'reports',
  sources: [{
    name: 'sf.reports',
    sql: `SELECT id::text AS id, target_kind, target_id, reporter_id::text AS reporter_id, reason, note, snapshot, detail,
                 created_at, closed_at, closed_by::text AS closed_by, close_reason
            FROM reports`,
    keys: ['id'],
    map(r: Row): Out[] {
      const id = String(r['id']);
      const kind = String(r['target_kind']);
      const targetId = String(r['target_id']);
      const reporterId = str(r['reporter_id']);
      const createdAt = isoReq(r['created_at']);
      const closedAt = iso(r['closed_at']);
      const snapshot = obj(r['snapshot']);
      const detail = json(r['detail']);
      const feedUrl = kind === 'transcript' && typeof snapshot['feedUrl'] === 'string' ? (snapshot['feedUrl'] as string) : null;
      const out: Out[] = [main(encode('report', K.report(kind, targetId, reporterId ?? id), {
        id, targetKind: kind, targetId, reporterId, reason: String(r['reason']), note: str(r['note']), snapshot, detail: detail ?? null,
        createdAt, closedAt, closedBy: str(r['closed_by']), closeReason: str(r['close_reason']), feedUrl,
      }, {
        gsi: reportGsi({ id, kind, targetId, createdAt, closedAt, snapshot, feedUrl }),
        ...(closedAt ? { ttl: ttlFrom(closedAt, KEEP_CLOSED_DAYS * DAY_MS) } : {}),
      }))];
      if (reporterId) {
        out.push(main(encode('reporterMark', K.reporterMark(reporterId, createdAt, id), { reportId: id, targetKind: kind, targetId, createdAt })));
      }
      return out;
    },
  }],
  counts: [
    { type: 'report' },
    { label: 'reports → reporterMark (RPTBY#)', type: 'reporterMark', sql: 'SELECT count(*)::int AS n FROM reports WHERE reporter_id IS NOT NULL' },
  ],
  back: [{
    pgTable: 'reports', pk: ['id'],
    match: (i) => i['t'] === 'report',
    toRow: (i) => ({
      id: i['id'], target_kind: i['targetKind'], target_id: i['targetId'], reporter_id: i['reporterId'] ?? null, reason: i['reason'],
      note: i['note'] ?? null, snapshot: i['snapshot'] ?? {}, detail: i['detail'] ?? null, created_at: i['createdAt'],
      closed_at: i['closedAt'] ?? null, closed_by: i['closedBy'] ?? null, close_reason: i['closeReason'] ?? null,
    }),
  }],
};

// ---------------------------------------------------------------- blocks (+ the dashboard counters)

/** One row per (metric, UTC hour): what dash.ts keeps and metrics.ts `recountDay` recounts. */
const DASH_SQL = `
  SELECT metric, hour, n FROM (
    SELECT 'reports' AS metric, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24') AS hour, count(*)::int AS n FROM reports GROUP BY 2
    UNION ALL
    SELECT 'actions', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24'), count(*)::int FROM moderation_actions GROUP BY 2
    UNION ALL
    SELECT 'blocks', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24'), count(*)::int FROM blocks GROUP BY 2
  ) d`;

const blocks: TableSpec = {
  pgTable: 'blocks',
  sources: [
    {
      name: 'sf.blocks',
      sql: 'SELECT blocker_id::text AS blocker_id, blocked_id::text AS blocked_id, created_at FROM blocks',
      keys: ['blocker_id', 'blocked_id'],
      map(r: Row): Out[] {
        const blockerId = String(r['blocker_id']);
        const blockedId = String(r['blocked_id']);
        const at = isoReq(r['created_at']);
        return [
          main(encode('block', K.block(blockerId, blockedId), { blockedId, createdAt: at }, { gsi: K.G4('blocks', at, `${blockerId}#${blockedId}`) })),
          main(encode('blockedBy', K.blockedBy(blockedId, blockerId), { blockerId, createdAt: at })),
        ];
      },
    },
    {
      // Derived: the dashboard's hourly counters (R#dash#… is lane SF's; data-model §7 kind A). No way back: the API keeps them.
      name: 'sf.dash',
      sql: DASH_SQL,
      keys: ['metric', 'hour'],
      map(r: Row): Out[] {
        const metric = String(r['metric']);
        return [events(encode('rollup', K.ev.rollup('dash', metric, `${String(r['hour'])}:00:00.000Z`), { metric, n: numReq(r['n']) }))];
      },
    },
  ],
  counts: [
    { type: 'block' },
    { label: 'blocks → blockedBy (BLOCKEDBY#)', type: 'blockedBy' },
    { label: 'dashboard counters R#dash#…', type: 'rollup', pk: 'R#dash#', sql: `SELECT count(*)::int AS n FROM (${DASH_SQL}) x` },
  ],
  back: [{
    pgTable: 'blocks', pk: ['blocker_id', 'blocked_id'],
    match: (i) => i['t'] === 'block',
    toRow: (i) => ({ blocker_id: pkTail(i, 'L#'), blocked_id: i['blockedId'], created_at: i['createdAt'] }),
  }],
};

// ---------------------------------------------------------------- hidden_feeds (+ publisher itunes:block marks)

const hiddenFeeds: TableSpec = {
  pgTable: 'hidden_feeds',
  sources: [
    {
      name: 'sf.hidden-feeds',
      sql: 'SELECT feed_url, action_id::text AS action_id, reason, hidden_at FROM hidden_feeds',
      keys: ['feed_url'],
      map(r: Row): Out[] {
        const feedUrl = String(r['feed_url']);
        return [main(encode('hiddenFeed', K.hiddenFeed(feedUrl), { feedUrl, actionId: String(r['action_id']), reason: str(r['reason']), createdAt: isoReq(r['hidden_at']) }))];
      },
    },
    {
      // Lane LB's `cache` marker rows (catalog/feed.ts setPublisherBlock): their hidden-feeds copy is this lane's item.
      name: 'sf.publisher-blocks',
      sql: "SELECT substr(key, 12) AS feed_url, fetched_at FROM cache WHERE key LIKE 'feed-block:%'",
      keys: ['feed_url'],
      map(r: Row): Out[] {
        const feedUrl = String(r['feed_url']);
        return [main(encode('publisherBlock', K.publisherBlock(feedUrl), { feedUrl, createdAt: isoReq(r['fetched_at']) }))];
      },
    },
  ],
  counts: [
    { type: 'hiddenFeed' },
    { label: "cache 'feed-block:' → publisherBlock (PUB#)", type: 'publisherBlock', sql: "SELECT count(*)::int AS n FROM cache WHERE key LIKE 'feed-block:%'" },
  ],
  // The PUB# marks go back as lane LB's cache rows (the code writes the cache marker too) — not here.
  back: [{
    pgTable: 'hidden_feeds', pk: ['feed_url'],
    match: (i) => i['t'] === 'hiddenFeed',
    toRow: (i) => ({ feed_url: i['feedUrl'], action_id: i['actionId'], reason: i['reason'] ?? null, hidden_at: i['createdAt'] }),
  }],
};

// ---------------------------------------------------------------- admins (one map item)

type AdminEntry = { grantedAt: string; grantedBy: string | null };
const adminRows = (i: Item): Row[] => Object.entries((i['admins'] ?? {}) as Record<string, AdminEntry>)
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([id, e]) => ({ listener_id: id, granted_at: e.grantedAt, granted_by: e.grantedBy ?? null }));

const admins: TableSpec = {
  pgTable: 'admins',
  sources: [{
    name: 'sf.admins',
    sql: `SELECT 'V' AS k, jsonb_object_agg(listener_id::text, jsonb_build_object('grantedAt', ${isoSql('granted_at')}, 'grantedBy', granted_by::text)) AS admins
            FROM admins HAVING count(*) > 0`,
    keys: ['k'],
    map(r: Row): Out[] {
      return [main(encode('adminSet', K.adminSet(), { admins: obj(r['admins']) }))];
    },
  }],
  counts: [{
    label: 'admins → CFG#admins entries',
    measure: (ix) => ix.ofType('adminSet').reduce((n, i) => n + Object.keys((i['admins'] ?? {}) as object).length, 0),
  }],
  // One item, many rows, rebuilt whole (lane LE): every admin upserted first, then each one removed after T0 deleted
  // alone — trigger `admins_keep_one` never sees the table emptied.
  back: [{
    pgTable: 'admins', pk: ['listener_id'],
    match: (i) => i['t'] === 'adminSet',
    toRow: (i) => adminRows(i)[0] ?? {},
    whole: (items) => items.flatMap(adminRows),
  }],
};

// ---------------------------------------------------------------- admin_audit (append-only) + SEQ#audit

const isAuditRecord = (i: Item) => i['t'] === 'audit' && !String(i['SK']).includes('#');

const adminAudit: TableSpec = {
  pgTable: 'admin_audit',
  sources: [
    {
      name: 'sf.audit',
      sql: 'SELECT id::text AS id, at, admin_id::text AS admin_id, acting_as::text AS acting_as, area, action, target, before, after, device FROM admin_audit',
      keys: ['id'],
      map(r: Row): Out[] {
        const id = numReq(r['id']);
        const at = isoReq(r['at']);
        return [main(encode('audit', K.audit(at, id), {
          id, adminId: String(r['admin_id']), actingAs: str(r['acting_as']), area: String(r['area']), action: String(r['action']),
          target: String(r['target']).slice(0, 2048), before: json(r['before']), after: json(r['after']), device: str(r['device']), createdAt: at,
        }), true)];
      },
    },
    {
      // Derived: the sequence adminTx reads (`readSeq` + `seqTxUpdate`): the last id issued; absent when there is none.
      name: 'sf.audit-seq',
      sql: "SELECT 'audit' AS name, max(id)::text AS v FROM admin_audit HAVING count(*) > 0",
      keys: ['name'],
      map(r: Row): Out[] {
        return [main(encode('seq', K.seq('audit'), { v: numReq(r['v']) }))];
      },
    },
  ],
  counts: [
    { label: 'admin_audit → audit records', type: 'audit', where: isAuditRecord },
    { label: 'SEQ#audit', type: 'seq', pk: 'SEQ#audit', sql: 'SELECT (count(*) > 0)::int AS n FROM admin_audit' },
  ],
  // Upsert of a row that is already there is an UPDATE, which trigger admin_audit_append_only refuses: the way back
  // must insert ON CONFLICT DO NOTHING for this table. A `#after` sibling (written after T0) is not merged back.
  back: [{
    pgTable: 'admin_audit', pk: ['id'],
    match: isAuditRecord,
    toRow: (i) => ({
      id: i['id'], at: i['createdAt'], admin_id: i['adminId'], acting_as: i['actingAs'] ?? null, area: i['area'], action: i['action'],
      target: i['target'], before: i['before'] ?? null, after: i['after'] ?? null, device: i['device'] ?? null,
    }),
  }],
};

// ---------------------------------------------------------------- blocked_words (a head + chunks — lane LE)

type WordEntry = { by: string | null; at: string };
/** The words of a chunk item, or of a head in the old one-item shape. */
const wordsOf = (i: Item): Record<string, WordEntry> => ((i['words'] ?? {}) as Record<string, WordEntry>);
const wordRows = (i: Item): Row[] => Object.entries(wordsOf(i))
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([word, e]) => ({ word, added_by: e.by ?? null, added_at: e.at }));

const blockedWords: TableSpec = {
  pgTable: 'blocked_words',
  sources: [{
    name: 'sf.words',
    sql: `SELECT 'V' AS k, jsonb_object_agg(word, jsonb_build_object('by', added_by::text, 'at', ${isoSql('added_at')})) AS words
            FROM blocked_words HAVING count(*) > 0`,
    keys: ['k'],
    map(r: Row): Out[] {
      // As the app writes it (safety/ddb/words.ts): head { v: 1, chunks } + chunks of ≤ CHUNK_BYTES — the worst list is over 400 KB.
      const parts = chunkWords(new Map(Object.entries(obj(r['words']) as Record<string, WordEntry>)));
      return [
        main(encode('wordList', K.config('words'), { v: 1, chunks: parts.length })),
        ...parts.map((words, n) => main(encode('wordChunk', K.configChunk('words', n), { words, v: 1, n }))),
      ];
    },
  }],
  counts: [{
    label: 'blocked_words → CFG#words entries',
    measure: (ix) => [...ix.ofType('wordChunk'), ...ix.ofType('wordList')].reduce((n, i) => n + Object.keys(wordsOf(i)).length, 0),
  }],
  // The whole table from the chunks (and an old-shape head): an emptied list empties the table (lane LE).
  back: [{
    pgTable: 'blocked_words', pk: ['word'],
    match: (i) => i['t'] === 'wordChunk' || (i['t'] === 'wordList' && i['words'] !== undefined),
    toRow: (i) => wordRows(i)[0] ?? {},
    whole: (items) => items.flatMap(wordRows),
  }],
};

// ---------------------------------------------------------------- app_settings (only `maintenance` has a home)

const appSettings: TableSpec = {
  pgTable: 'app_settings',
  sources: [{
    name: 'sf.maintenance',
    sql: "SELECT key, value, updated_at, updated_by::text AS updated_by FROM app_settings WHERE key = 'maintenance'",
    keys: ['key'],
    map(r: Row): Out[] {
      const v = obj(r['value']);
      return [main(encode('maintenance', K.config('maintenance'), { until: v['until'], message: v['message'], updatedAt: isoReq(r['updated_at']), updatedBy: str(r['updated_by']) }))];
    },
  }, {
    // Lane LE: every other key. No code reads or writes one (safety/maintenance.ts is the table's only user), so there is
    // nothing to put behind dual; the rows are kept as they are (`CFG#app-settings/<key>`, type `appSetting`) so none is lost.
    name: 'sf.app-settings-other',
    sql: "SELECT key, value, updated_at, updated_by::text AS updated_by FROM app_settings WHERE key <> 'maintenance'",
    keys: ['key'],
    map(r: Row): Out[] {
      return [main(encode('appSetting', K.appSetting(String(r['key'])), { key: String(r['key']), value: obj(r['value']), updatedAt: isoReq(r['updated_at']), updatedBy: str(r['updated_by']) }))];
    },
  }],
  counts: [
    { label: "app_settings 'maintenance' → CFG#maintenance", type: 'maintenance', sql: "SELECT count(*)::int AS n FROM app_settings WHERE key = 'maintenance'" },
    { label: 'app_settings other keys → CFG#app-settings', type: 'appSetting', sql: "SELECT count(*)::int AS n FROM app_settings WHERE key <> 'maintenance'" },
  ],
  back: [{
    pgTable: 'app_settings', pk: ['key'],
    match: (i) => i['t'] === 'maintenance',
    toRow: (i) => ({
      key: 'maintenance', value: { ...(i['until'] !== undefined ? { until: i['until'] } : {}), ...(i['message'] !== undefined ? { message: i['message'] } : {}) },
      updated_at: i['updatedAt'], updated_by: i['updatedBy'] ?? null,
    }),
  }, {
    pgTable: 'app_settings', pk: ['key'],
    match: (i) => i['t'] === 'appSetting',
    toRow: (i) => ({ key: i['key'], value: i['value'] ?? {}, updated_at: i['updatedAt'], updated_by: i['updatedBy'] ?? null }),
  }],
};

// ---------------------------------------------------------------- appeals

const appeals: TableSpec = {
  pgTable: 'appeals',
  sources: [{
    name: 'sf.appeals',
    sql: `SELECT ap.id::text AS id, ap.listener_id::text AS listener_id, ap.action_id::text AS action_id, ap.text, ap.state,
                 ap.created_at, ap.decided_at, ap.decided_by::text AS decided_by,
                 a.action, a.target_kind, a.target_id, a.created_at AS action_at
            FROM appeals ap JOIN moderation_actions a ON a.id = ap.action_id`,
    keys: ['id'],
    map(r: Row): Out[] {
      const id = String(r['id']);
      const actionId = String(r['action_id']);
      const createdAt = isoReq(r['created_at']);
      const decidedAt = iso(r['decided_at']);
      const state = String(r['state']);
      const q = state === 'open' ? K.G4('appeals-open', createdAt, id) : K.G4('appeals-decided', decidedAt ?? createdAt, id);
      return [main(encode('appeal', K.appeal(actionId), {
        id, listenerId: String(r['listener_id']), actionId, text: String(r['text']), state, createdAt, decidedAt, decidedBy: str(r['decided_by']),
        action: String(r['action']), targetKind: String(r['target_kind']), targetId: String(r['target_id']), actionAt: isoReq(r['action_at']),
      }, { gsi: { ...q, ...K.G5('appeal', id, createdAt) } }))];
    },
  }],
  counts: [{ type: 'appeal' }],
  back: [{
    pgTable: 'appeals', pk: ['id'],
    match: (i) => i['t'] === 'appeal',
    toRow: (i) => ({
      id: i['id'], listener_id: i['listenerId'], action_id: i['actionId'], text: i['text'], state: i['state'], created_at: i['createdAt'],
      decided_at: i['decidedAt'] ?? null, decided_by: i['decidedBy'] ?? null,
    }),
  }],
};

// ---------------------------------------------------------------- app_config, content_pages

const appConfig: TableSpec = {
  pgTable: 'app_config',
  sources: [{
    name: 'sf.app-config',
    sql: 'SELECT key, value, version, updated_at FROM app_config',
    keys: ['key'],
    map(r: Row): Out[] {
      const key = String(r['key']);
      return [main(encode('appConfig', K.appConfig(key), { key, value: json(r['value']), version: numReq(r['version']), updatedAt: isoReq(r['updated_at']) }))];
    },
  }],
  counts: [{ type: 'appConfig' }],
  back: [{
    pgTable: 'app_config', pk: ['key'],
    match: (i) => i['t'] === 'appConfig',
    toRow: (i) => ({ key: i['key'], value: i['value'], version: i['version'], updated_at: i['updatedAt'] }),
  }],
};

const contentPages: TableSpec = {
  pgTable: 'content_pages',
  sources: [{
    name: 'sf.content',
    sql: 'SELECT kind, slug, title, summary, tag, body, position, published, version, updated_at FROM content_pages',
    keys: ['kind', 'slug'],
    map(r: Row): Out[] {
      return [main(pageItem(String(r['kind']) as ContentKind, String(r['slug']), {
        title: String(r['title']), summary: str(r['summary']), tag: str(r['tag']), body: String(r['body']), position: numReq(r['position']), published: bool(r['published']),
      }, numReq(r['version']), isoReq(r['updated_at'])))];
    },
  }],
  counts: [{ type: 'contentPage' }],
  back: [{
    pgTable: 'content_pages', pk: ['kind', 'slug'],
    match: (i) => i['t'] === 'contentPage',
    toRow: (i) => ({
      kind: i['kind'], slug: i['slug'], title: i['title'], summary: i['summary'] ?? null, tag: i['tag'] ?? null, body: i['body'],
      position: i['position'], published: i['published'], version: i['version'], updated_at: i['updatedAt'],
    }),
  }],
};

// ---------------------------------------------------------------- translation

const translationShows: TableSpec = {
  pgTable: 'translation_shows',
  sources: [{
    name: 'sf.translation-shows',
    sql: 'SELECT feed_url, added_by::text AS added_by, created_at FROM translation_shows',
    keys: ['feed_url'],
    map(r: Row): Out[] {
      const feedUrl = String(r['feed_url']);
      return [main(encode('translationShow', K.translationShow(feedUrl), { feedUrl, addedBy: str(r['added_by']), createdAt: isoReq(r['created_at']) }))];
    },
  }],
  counts: [{ type: 'translationShow' }],
  back: [{
    pgTable: 'translation_shows', pk: ['feed_url'],
    match: (i) => i['t'] === 'translationShow',
    toRow: (i) => ({ feed_url: i['feedUrl'], added_by: i['addedBy'] ?? null, created_at: i['createdAt'] }),
  }],
};

const translationJobs: TableSpec = {
  pgTable: 'translation_jobs',
  sources: [{
    name: 'sf.translation-jobs',
    // jsonb as its text: the pieces are cut from exactly the JSON the reader will JSON.parse (no driver round trip).
    sql: `SELECT episode_id, target_lang, state, source_lang, segments::text AS segments_text, next_chunk, audio_s, tokens, errors, error,
                 not_before, requested_at, updated_at
            FROM translation_jobs`,
    keys: ['episode_id', 'target_lang'],
    map(r: Row): Out[] {
      const episodeId = String(r['episode_id']);
      const lang = String(r['target_lang']);
      const state = String(r['state']);
      const requestedAt = isoReq(r['requested_at']);
      const updatedAt = isoReq(r['updated_at']);
      const segs = str(r['segments_text']);
      const parts = segs === null ? [] : splitJson(segs);
      const w = parts.length > 0 ? writeId('trjob', episodeId, lang, updatedAt) : undefined;
      const job = encode('translationJob', K.translationJob(episodeId, lang), {
        episodeId, targetLang: lang, state, sourceLang: str(r['source_lang']), segChunks: parts.length, nextChunk: numReq(r['next_chunk']),
        audioS: numReq(r['audio_s']), tokens: numReq(r['tokens']), errors: numReq(r['errors']), error: str(r['error']), notBefore: iso(r['not_before']),
        requestedAt, updatedAt, v: 0, w,
      }, { gsi: { ...(ACTIVE_JOB.has(state) ? K.G4('trjobs', requestedAt, `${episodeId}#${lang}`) : {}), ...K.G5('trjob', 'all', requestedAt) } });
      return [main(job), ...parts.map((data, n) => main(encode('translationJobChunk', K.translationJobChunk(episodeId, lang, n), { n, data, w })))];
    },
  }],
  counts: [
    { type: 'translationJob' },
    {
      label: 'translation_jobs segments → SEG# pieces (jobs with segments)',
      measure: (ix) => ix.ofType('translationJob').filter((j) => Number(j['segChunks'] ?? 0) > 0).length,
      sql: 'SELECT count(*)::int AS n FROM translation_jobs WHERE segments IS NOT NULL',
    },
  ],
  // The segments live in SEG# pieces a single item cannot see: they come back NULL, which the worker treats as
  // "start again from the transcript" (translate/job.ts) — never a mixed or partial text.
  back: [{
    pgTable: 'translation_jobs', pk: ['episode_id', 'target_lang'],
    match: (i) => i['t'] === 'translationJob',
    toRow: (i) => ({
      episode_id: i['episodeId'], target_lang: i['targetLang'], state: i['state'], source_lang: i['sourceLang'] ?? null, segments: null,
      next_chunk: Number(i['segChunks'] ?? 0) > 0 ? 0 : i['nextChunk'], audio_s: i['audioS'], tokens: i['tokens'], errors: i['errors'],
      error: i['error'] ?? null, not_before: i['notBefore'] ?? null, requested_at: i['requestedAt'], updated_at: i['updatedAt'],
    }),
  }],
};

const transcriptsTranslated: TableSpec = {
  pgTable: 'transcripts_translated',
  sources: [{
    name: 'sf.translated',
    sql: 'SELECT episode_id, target_lang, lines::text AS lines_text, made_at FROM transcripts_translated',
    keys: ['episode_id', 'target_lang'],
    map(r: Row): Out[] {
      const episodeId = String(r['episode_id']);
      const lang = String(r['target_lang']);
      const madeAt = isoReq(r['made_at']);
      const parts = splitJson(String(r['lines_text']));
      const w = writeId('tr', episodeId, lang, madeAt);
      return [
        main(encode('translated', K.translated(episodeId, lang), { episodeId, targetLang: lang, chunks: parts.length, madeAt, w })),
        ...parts.map((data, n) => main(encode('translatedChunk', K.translatedChunk(episodeId, lang, n), { n, data, w }))),
      ];
    },
  }],
  counts: [{ type: 'translated' }],
  // No `back`: `lines` (NOT NULL) is spread over LINES# pieces that toRow(item) cannot read. A translation made after
  // T0 is lost on the way back and is made again on request (requests to MIG lead: give toRow the partition).
};

const groqUsage: TableSpec = {
  pgTable: 'groq_usage',
  sources: [{
    name: 'sf.groq-usage',
    sql: 'SELECT day::text AS day, model, requests, audio_s, tokens FROM groq_usage',
    keys: ['day', 'model'],
    map(r: Row): Out[] {
      const d = dayOf(r['day'])!;
      const model = String(r['model']);
      return [events(encode('groqUsage', K.groqUsage(d, model), { day: d, model, requests: numReq(r['requests']), audioS: numReq(r['audio_s']), tokens: numReq(r['tokens']) }))];
    },
  }],
  counts: [{ type: 'groqUsage' }],
  back: [{
    pgTable: 'groq_usage', pk: ['day', 'model'],
    match: (i) => i['t'] === 'groqUsage',
    toRow: (i) => ({ day: i['day'], model: i['model'], requests: i['requests'], audio_s: i['audioS'], tokens: i['tokens'] }),
  }],
};

// ---------------------------------------------------------------- counter checks (read only)

const hourOf = (t: unknown): string => K.ts(String(t)).slice(0, 13);

/** dash.ts: `R#dash#<metric>/<hour>`.n = reports created / actions taken / blocks that exist in that UTC hour. */
const dashCounters: CounterCheck = {
  name: 'dash.hourly',
  check(ix: ItemIndex): Mismatch[] {
    const source: Record<string, string> = { reports: 'report', actions: 'moderationAction', blocks: 'block' };
    const out: Mismatch[] = [];
    for (const metric of DASH_METRICS) {
      const want = new Map<string, number>();
      for (const it of ix.ofType(source[metric] as 'report')) want.set(hourOf(it['createdAt']), (want.get(hourOf(it['createdAt'])) ?? 0) + 1);
      const pk = `R#dash#${metric}`;
      const have = new Map(ix.partition('events', pk).map((it) => [String(it['SK']), num(it['n']) ?? 0]));
      for (const sk of new Set([...want.keys(), ...have.keys()])) {
        const stored = have.get(sk) ?? 0;
        const recomputed = want.get(sk) ?? 0;
        if (stored !== recomputed) out.push({ counter: `dash.${metric}`, key: `${pk}|${sk}`, stored, recomputed });
      }
    }
    return out;
  },
};

/** seq.ts: `SEQ#audit`.v is the last id issued — at least every audit record's id (absent = 0). */
const auditSeq: CounterCheck = {
  name: 'seq.audit',
  check(ix: ItemIndex): Mismatch[] {
    const max = ix.ofType('audit').reduce((m, i) => Math.max(m, num(i['id']) ?? 0), 0);
    const key = K.seq('audit');
    const stored = num(ix.get('main', key.PK, key.SK)?.['v']) ?? 0;
    return stored >= max ? [] : [{ counter: 'seq.audit', key: `${key.PK}|${key.SK}`, stored, recomputed: max }];
  },
};

/** translation.ts `readChunks`: the item's count = its pieces of write `w`, numbered 0…count−1. */
function chunkCheck(name: string, type: 'translationJob' | 'translated', countAttr: string, prefix: string): CounterCheck {
  return {
    name,
    check(ix: ItemIndex): Mismatch[] {
      const out: Mismatch[] = [];
      for (const it of ix.ofType(type)) {
        const pieces = ix.partition('main', String(it['PK'])).filter((c) => String(c['SK']).startsWith(prefix) && c['w'] === it['w']);
        const contiguous = pieces.every((c, i) => num(c['n']) === i);
        const recomputed = contiguous ? pieces.length : -1;
        const stored = num(it[countAttr]) ?? 0;
        if (stored !== recomputed && !(stored === 0 && pieces.length === 0)) out.push({ counter: name, key: `${String(it['PK'])}|${String(it['SK'])}`, stored, recomputed });
      }
      return out;
    },
  };
}

export const lane: LaneModule = {
  lane: 'sf',
  tables: [
    moderationActions, reports, blocks, hiddenFeeds, admins, adminAudit, blockedWords, appSettings, appeals, appConfig, contentPages,
    translationShows, translationJobs, transcriptsTranslated, groqUsage,
  ],
  counters: [
    dashCounters,
    auditSeq,
    chunkCheck('translationJob.segChunks', 'translationJob', 'segChunks', 'SEG#'),
    chunkCheck('translated.chunks', 'translated', 'chunks', 'LINES#'),
  ],
};
