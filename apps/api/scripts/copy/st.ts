// Lane ST's copy: the Studio's 21 Postgres tables (claims, team, hosted shows, announcements, polls, …) and the Studio facts and rollups, as lane ST's DynamoDB code writes them.
/**
 * M26 lane MIG, lane ST (data-model.md §19 "Lane ST changes"; bodies in src/db/repos/studio/ddb/).
 *
 * Item shapes follow the writers exactly: claims.ts (`claimItem`, `proveInTx`), team.ts, hosted.ts (`showItem`,
 * `epItem`), page.ts, comments.ts, announce.ts and facts.ts. Where a writer omits an attribute instead of storing null
 * (an invite's `usedAt`/`usedBy`/`revokedAt`, a poll's `closedAt`, a feed sync's `manualAt`, a held comment's picture,
 * a hosted episode's `deletedAt`/`promotedAt`), the copy omits it too — readers test `attribute_not_exists`.
 *
 * Derived items (one writer each):
 * - claims: `L#/CLAIM#`, `U#CLAIMCODE#` (every claim — a revoke never frees a code), and for the proven one of a feed
 *   `U#PROVEN#<fk>` (G4 `Q#proven`) + the owner's role copy `L#/ROLES#<showKey>` { role: owner, since: provenAt }.
 * - helpers: `SH#/TEAM#` (G4 `Q#team-members`) + `L#/ROLES#` { role: operator } (not for the proven owner — the owner's
 *   copy wins, as `addOperator` refuses the owner); hosts `SH#/HOST#` + `L#/HOSTOF#`; mutes `SH#/SMUTE#` + `L#/SMUTEON#`;
 *   `SH#/TEAMV` { v = helpers + hosts } for every show with a team (the version only has to be a number).
 * - invites `SH#/INVITE#` + `U#INVITE#<hex sha256>` (the stored token hash IS the code's hash).
 * - hosted shows `HS#/S` (G4 `Q#hosted` while live) + `SH#/HOSTED` + `L#/HOSTED#`; episodes `HS#/E#` + `HEP#/R`.
 *   An episode that is waiting (published, free, not deleted) and whose app episode already exists in `episodes` was
 *   promoted by the old promote-on-read: `promotedAt` = that episode's `first_seen_at`, no queue key. A waiting one with
 *   no app episode keeps G4 `Q#scheduled` (the timer or the next read promotes it).
 * - overrides `SH#/OVERRIDE` (G4 `Q#milestone-msgs` while it has a message), `POLICY#`, `PICKS` (one item per show,
 *   ids in position order), `FEEDSYNC`, `CFG#curators`, hidden episodes `SH#/HIDDENEP#` + `CFG#hidden-eps` copies.
 * - held comments `EP#/HELD#` + `HELDREF#` + `SH#/HELDQ#` + `L#/HELD#`; `CFG#host-hides` from `comments.host_hidden_at`
 *   (the /mod list joins the comment's `hostHiddenAt` to the mark's `at`, exactly the SQL's source).
 * - announcements `SH#/ANN#` + `SH#/ANNPUSH#<yyyy-mm>` { n = pushed that UTC month, deleted ones included — the SQL's count }.
 * - polls `SH#/POLL#` { options (labels by idx), votes (per option), voters, v: 0 } + `POLLREF#`; one `POLLVOTE#` per
 *   voter { options } + `L#/PVOTE#`.
 * - milestones `SH#/MILESTONE#<n>` + `L#/MSTONE#`.
 * - Studio facts in sm-events `SX#<fk>` (+ `STF#` pointers, E1 `DAY#`) re-derived from their sources with facts.ts
 *   `wantOf`'s rules, and the rollups `R#st#<fk>#<metric>` as the fact writers move them (zero rollups not written).
 *   `shareRate` burst markers (TTL 1 day, only the last minute is read) are not copied: the database is frozen.
 * - `SEQ#share_events` = max(id); `CFG#studio-history-since` = migration 008's `applied_at` day.
 * Byte ceilings (`CFG#bytes`) are lane AC's item: this module only CHECKS hostedAudioBytes and heldImageBytes.
 */
import { mergeRanges, type Range } from '@socialmorning/social-core';
import { encode } from '../../src/db/ddb/codec.ts';
import * as K from '../../src/db/ddb/keys.ts';
import type { Item } from '../../src/db/ddb/store.ts';
import { claimItem } from '../../src/db/repos/studio/ddb/claims.ts';
import { epItem, showItem } from '../../src/db/repos/studio/ddb/hosted.ts';
import { showKey } from '../../src/db/repos/studio/studio-roles.ts';
import {
  bool, bytes, dayOf, iso, isoReq, json, num, numReq, str,
  type CounterCheck, type ItemIndex, type LaneModule, type Mismatch, type Out, type Row, type TableSpec,
} from './types.ts';

const main = (item: Item): Out => ({ table: 'main', item });
const events = (item: Item): Out => ({ table: 'events', item });
const s = (v: unknown): string => String(v);
const t = (it: Item): string => String(it['t']);
const S = (it: Item, k: string): string | null => str(it[k]);
/** Drops `undefined` and `null` values (writers that omit an attribute rather than store null). */
const defined = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
const hourOf = (at: string): string => K.ts(at).slice(0, 13);
const UTC_HOUR = `'YYYY-MM-DD"T"HH24'`;

// ---------------------------------------------------------------------------------------------------------------
// creator_claims
// ---------------------------------------------------------------------------------------------------------------

const claims: TableSpec = {
  pgTable: 'creator_claims',
  sources: [{
    name: 'st.claims',
    sql: `SELECT id::text AS id, listener_id::text AS listener_id, feed_url, code, status, created_at,
                 CASE WHEN status = 'proven' THEN coalesce(proven_at, created_at) ELSE proven_at END AS proven_at
            FROM creator_claims`,
    keys: ['id'],
    map(r) {
      const id = s(r['id']); const listenerId = s(r['listener_id']); const feedUrl = s(r['feed_url']); const code = s(r['code']);
      const status = s(r['status']) as 'pending' | 'proven' | 'revoked';
      const provenAt = iso(r['proven_at']);
      const out: Out[] = [
        main(claimItem({ id, listenerId, feedUrl, code, status, provenAt, createdAt: isoReq(r['created_at']) })),
        main(encode('unique', K.U.claimCode(code), { owner: id })),
      ];
      if (status === 'proven') {
        const at = provenAt!;
        out.push(main(encode('provenClaim', K.U.proven(feedUrl), { owner: id, listenerId, claimId: id, feedUrl, provenAt: at }, { gsi: K.G4('proven', at, K.feedKey(feedUrl)) })));
        out.push(main(encode('roles', K.roleCopy(listenerId, showKey(feedUrl)), { feedUrl, role: 'owner', since: at, showKey: showKey(feedUrl) })));
      }
      return out;
    },
  }],
  counts: [
    { type: 'claim' },
    { label: 'creator_claims → U#CLAIMCODE', type: 'unique', pk: 'U#CLAIMCODE#' },
    { label: 'creator_claims (proven) → U#PROVEN', type: 'provenClaim', sql: "SELECT count(*)::int AS n FROM creator_claims WHERE status = 'proven'" },
    { label: 'creator_claims (proven) → owner role copies', type: 'roles', where: (i) => i['role'] === 'owner', sql: "SELECT count(*)::int AS n FROM creator_claims WHERE status = 'proven'" },
  ],
  back: [{
    pgTable: 'creator_claims', pk: ['id'],
    match: (i) => t(i) === 'claim',
    toRow: (i) => ({ id: i['id'], listener_id: i['listenerId'], feed_url: i['feedUrl'], code: i['code'], status: i['status'], created_at: i['createdAt'], proven_at: S(i, 'provenAt') }),
  }],
};

// ---------------------------------------------------------------------------------------------------------------
// show_members (helpers), show_hosts, TEAMV, show_mutes, show_invites, show_curators
// ---------------------------------------------------------------------------------------------------------------

const PROVEN_OWNER = (alias: string) =>
  `EXISTS (SELECT 1 FROM creator_claims c WHERE c.feed_url = ${alias}.feed_url AND c.listener_id = ${alias}.listener_id AND c.status = 'proven')`;

const members: TableSpec = {
  pgTable: 'show_members',
  sources: [{
    name: 'st.members',
    sql: `SELECT m.feed_url, m.listener_id::text AS listener_id, m.added_by::text AS added_by, m.created_at, ${PROVEN_OWNER('m')} AS is_owner FROM show_members m`,
    keys: ['feed_url', 'listener_id'],
    map(r) {
      const feedUrl = s(r['feed_url']); const id = s(r['listener_id']); const at = isoReq(r['created_at']);
      const out: Out[] = [main(encode('teamMember', K.teamMember(feedUrl, id), { listenerId: id, feedUrl, addedBy: str(r['added_by']), createdAt: at },
        { gsi: K.G4('team-members', at, `${K.feedKey(feedUrl)}#${id}`) }))];
      // The proven owner's own copy (role owner) is creator_claims' item; a helper row for the owner grants nothing more.
      if (!bool(r['is_owner'])) out.push(main(encode('roles', K.roleCopy(id, showKey(feedUrl)), { feedUrl, role: 'operator', since: at, showKey: showKey(feedUrl) })));
      return out;
    },
  }],
  counts: [
    { type: 'teamMember' },
    { label: 'show_members → operator role copies', type: 'roles', where: (i) => i['role'] === 'operator', sql: `SELECT count(*)::int AS n FROM show_members m WHERE NOT ${PROVEN_OWNER('m')}` },
  ],
  back: [{
    pgTable: 'show_members', pk: ['feed_url', 'listener_id'],
    match: (i) => t(i) === 'teamMember',
    toRow: (i) => ({ feed_url: i['feedUrl'], listener_id: i['listenerId'], role: 'operator', added_by: S(i, 'addedBy'), created_at: i['createdAt'] }),
  }],
};

const hosts: TableSpec = {
  pgTable: 'show_hosts',
  sources: [
    {
      name: 'st.hosts',
      sql: 'SELECT feed_url, listener_id::text AS listener_id, added_at FROM show_hosts',
      keys: ['feed_url', 'listener_id'],
      map(r) {
        const feedUrl = s(r['feed_url']); const id = s(r['listener_id']); const at = isoReq(r['added_at']);
        return [
          main(encode('showHost', K.showHost(feedUrl, id), { listenerId: id, feedUrl, addedAt: at })),
          main(encode('hostPtr', K.hostOf(id, feedUrl), { feedUrl, addedAt: at })),
        ];
      },
    },
    {
      // The team's version: any number works (it serialises later changes); helpers + hosts keeps it > 0 where a team exists.
      name: 'st.teamv',
      sql: `SELECT feed_url, count(*)::int AS n FROM (SELECT feed_url FROM show_members UNION ALL SELECT feed_url FROM show_hosts) x GROUP BY feed_url`,
      keys: ['feed_url'],
      map: (r) => [main(encode('teamVersion', K.teamVersion(s(r['feed_url'])), { feedUrl: s(r['feed_url']), v: numReq(r['n']) }))],
    },
  ],
  counts: [
    { type: 'showHost' },
    { label: 'show_hosts → HOSTOF# pointers', type: 'hostPtr' },
    { label: 'shows with a team → TEAMV', type: 'teamVersion', sql: 'SELECT count(*)::int AS n FROM (SELECT feed_url FROM show_members UNION SELECT feed_url FROM show_hosts) x' },
  ],
  back: [{
    pgTable: 'show_hosts', pk: ['feed_url', 'listener_id'],
    match: (i) => t(i) === 'showHost',
    toRow: (i) => ({ feed_url: i['feedUrl'], listener_id: i['listenerId'], added_at: i['addedAt'] }),
  }],
};

const mutes: TableSpec = {
  pgTable: 'show_mutes',
  sources: [{
    name: 'st.mutes',
    sql: 'SELECT feed_url, listener_id::text AS listener_id, muted_by::text AS muted_by, reason, created_at FROM show_mutes',
    keys: ['feed_url', 'listener_id'],
    map(r) {
      const feedUrl = s(r['feed_url']); const id = s(r['listener_id']);
      return [
        main(encode('showMute', K.showMute(feedUrl, id), { listenerId: id, feedUrl, mutedBy: str(r['muted_by']), reason: str(r['reason']), createdAt: isoReq(r['created_at']) })),
        main(encode('showMutePtr', K.showMutePtr(id, feedUrl), { feedUrl })),
      ];
    },
  }],
  counts: [{ type: 'showMute' }, { label: 'show_mutes → SMUTEON# pointers', type: 'showMutePtr' }],
  back: [{
    pgTable: 'show_mutes', pk: ['feed_url', 'listener_id'],
    match: (i) => t(i) === 'showMute',
    toRow: (i) => ({ feed_url: i['feedUrl'], listener_id: i['listenerId'], muted_by: S(i, 'mutedBy'), reason: S(i, 'reason'), created_at: i['createdAt'] }),
  }],
};

const invites: TableSpec = {
  pgTable: 'show_invites',
  sources: [{
    name: 'st.invites',
    sql: `SELECT id::text AS id, feed_url, token_hash, created_by::text AS created_by, created_at, expires_at, used_at, used_by::text AS used_by, revoked_at FROM show_invites`,
    keys: ['id'],
    map(r) {
      const id = s(r['id']); const feedUrl = s(r['feed_url']);
      return [
        main(encode('invite', K.invite(feedUrl, id), defined({
          id, feedUrl, createdBy: str(r['created_by']), createdAt: isoReq(r['created_at']), expiresAt: isoReq(r['expires_at']),
          usedAt: iso(r['used_at']), usedBy: str(r['used_by']), revokedAt: iso(r['revoked_at']),
          tokenHash: bytes(r['token_hash'])!.toString('hex'), // lane LE: the way back can restore the link
        }))),
        main(encode('inviteToken', K.U.invite(bytes(r['token_hash'])!.toString('hex')), { owner: id, feedUrl })),
      ];
    },
  }],
  counts: [{ type: 'invite' }, { label: 'show_invites → U#INVITE', type: 'inviteToken' }],
  back: [{
    pgTable: 'show_invites', pk: ['id'],
    match: (i) => t(i) === 'invite',
    // Lane LE: the invite item carries its token hash (hex); an item written before that gets an unguessable
    // placeholder, so the row exists but its link stops working (an open invite must be made again).
    toRow: (i) => ({
      id: i['id'], feed_url: i['feedUrl'],
      token_hash: typeof i['tokenHash'] === 'string' ? Buffer.from(i['tokenHash'], 'hex') : Buffer.from(K.sha(`lost-invite|${s(i['id'])}`)), created_by: S(i, 'createdBy'),
      created_at: i['createdAt'], expires_at: i['expiresAt'], used_at: S(i, 'usedAt'), used_by: S(i, 'usedBy'), revoked_at: S(i, 'revokedAt'),
    }),
  }],
};

const curators: TableSpec = {
  pgTable: 'show_curators',
  sources: [{
    name: 'st.curators',
    sql: 'SELECT feed_url, listener_id::text AS listener_id, created_at, created_by::text AS created_by FROM show_curators',
    keys: ['feed_url'],
    map: (r) => [main(encode('curator', K.curator(s(r['feed_url'])), { feedUrl: s(r['feed_url']), listenerId: s(r['listener_id']), createdBy: str(r['created_by']), createdAt: isoReq(r['created_at']) }))],
  }],
  counts: [{ type: 'curator' }],
  back: [{
    pgTable: 'show_curators', pk: ['feed_url'],
    match: (i) => t(i) === 'curator',
    toRow: (i) => ({ feed_url: i['feedUrl'], listener_id: i['listenerId'], created_at: i['createdAt'], created_by: S(i, 'createdBy') }),
  }],
};

// ---------------------------------------------------------------------------------------------------------------
// hosted_shows, hosted_episodes
// ---------------------------------------------------------------------------------------------------------------

const hostedShows: TableSpec = {
  pgTable: 'hosted_shows',
  sources: [{
    name: 'st.hostedShows',
    sql: `SELECT id::text AS id, owner_id::text AS owner_id, feed_url, title, description, author, language, category, explicit, cover_url, price_tier,
                 created_at, updated_at, deleted_at FROM hosted_shows`,
    keys: ['id'],
    map(r) {
      const id = s(r['id']); const ownerId = s(r['owner_id']); const feedUrl = s(r['feed_url']); const createdAt = isoReq(r['created_at']);
      return [
        main(showItem({
          id, ownerId, feedUrl, title: s(r['title']), description: s(r['description']), author: s(r['author']), language: s(r['language']),
          category: s(r['category']), explicit: bool(r['explicit']), coverUrl: str(r['cover_url']), priceTier: num(r['price_tier']),
          createdAt, updatedAt: isoReq(r['updated_at']), deletedAt: iso(r['deleted_at']),
        })),
        main(encode('hostedFeed', K.hostedFeed(feedUrl), { showId: id, feedUrl })),
        main(encode('ownedHosted', K.ownedHosted(ownerId, id), { showId: id, feedUrl, createdAt })),
      ];
    },
  }],
  counts: [
    { type: 'hostedShow' },
    { label: 'hosted_shows → SH#/HOSTED', type: 'hostedFeed' },
    { label: 'hosted_shows → L#/HOSTED#', type: 'ownedHosted' },
  ],
  back: [{
    pgTable: 'hosted_shows', pk: ['id'],
    match: (i) => t(i) === 'hostedShow',
    toRow: (i) => ({
      id: i['id'], owner_id: i['ownerId'], feed_url: i['feedUrl'], title: i['title'], description: i['description'], author: i['author'], language: i['language'],
      category: i['category'], explicit: i['explicit'] === true, cover_url: S(i, 'coverUrl'), price_tier: i['priceTier'] ?? null,
      created_at: i['createdAt'], updated_at: i['updatedAt'], deleted_at: S(i, 'deletedAt'),
    }),
  }],
};

const hostedEpisodes: TableSpec = {
  pgTable: 'hosted_episodes',
  sources: [{
    name: 'st.hostedEpisodes',
    sql: `SELECT he.id::text AS id, he.show_id::text AS show_id, he.guid, he.episode_id, he.title, he.description, he.audio_url, he.audio_bytes::text AS audio_bytes,
                 he.audio_type, he.duration_ms, he.published_at, he.created_by::text AS created_by, he.deleted_at, he.status, he.cover_url, he.paid, he.created_at,
                 he.preview_start_ms, he.preview_end_ms, ae.first_seen_at AS app_first_seen_at
            FROM hosted_episodes he LEFT JOIN episodes ae ON ae.id = he.episode_id`,
    keys: ['id'],
    map(r) {
      const id = s(r['id']); const showId = s(r['show_id']);
      const status = s(r['status']); const paid = bool(r['paid']); const deletedAt = iso(r['deleted_at']);
      const waiting = status === 'published' && !paid && deletedAt === null;
      const promotedAt = waiting && r['app_first_seen_at'] !== null && r['app_first_seen_at'] !== undefined ? isoReq(r['app_first_seen_at']) : undefined;
      return [
        main(epItem({
          id, showId, guid: s(r['guid']), episodeId: s(r['episode_id']), title: s(r['title']), description: s(r['description']), audioUrl: s(r['audio_url']),
          audioBytes: numReq(r['audio_bytes']), audioType: s(r['audio_type']), durationMs: num(r['duration_ms']), publishedAt: isoReq(r['published_at']),
          status, coverUrl: str(r['cover_url']), paid, createdAt: iso(r['created_at']), createdBy: str(r['created_by']),
          previewStartMs: num(r['preview_start_ms']), previewEndMs: num(r['preview_end_ms']), deletedAt, promotedAt,
        })),
        main(encode('hostedEpisodeRef', K.hostedEpisodeRef(id), { id, showId })),
      ];
    },
  }],
  counts: [
    { type: 'hostedEpisode' },
    { label: 'hosted_episodes → HEP# refs', type: 'hostedEpisodeRef' },
    {
      label: 'hosted_episodes waiting, not live yet → G4 Q#scheduled', type: 'hostedEpisode', where: (i) => i['G4PK'] === 'Q#scheduled',
      sql: `SELECT count(*)::int AS n FROM hosted_episodes he WHERE he.status = 'published' AND NOT he.paid AND he.deleted_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM episodes e WHERE e.id = he.episode_id)`,
    },
  ],
  back: [{
    pgTable: 'hosted_episodes', pk: ['id'],
    match: (i) => t(i) === 'hostedEpisode',
    toRow: (i) => ({
      id: i['id'], show_id: i['showId'], guid: i['guid'], episode_id: i['episodeId'], title: i['title'], description: i['description'], audio_url: i['audioUrl'],
      audio_bytes: i['audioBytes'], audio_type: i['audioType'], duration_ms: i['durationMs'] ?? null, published_at: i['publishedAt'], created_by: S(i, 'createdBy'),
      deleted_at: S(i, 'deletedAt'), status: i['status'], cover_url: S(i, 'coverUrl'), paid: i['paid'] === true, created_at: S(i, 'createdAt'),
      preview_start_ms: i['previewStartMs'] ?? null, preview_end_ms: i['previewEndMs'] ?? null,
    }),
  }],
};

// ---------------------------------------------------------------------------------------------------------------
// show_overrides, comment_policy, host_picks, feed_sync, hidden_episodes
// ---------------------------------------------------------------------------------------------------------------

const hasMessage = (m: unknown): boolean => typeof m === 'string' && m.trim() !== '';

const overrides: TableSpec = {
  pgTable: 'show_overrides',
  sources: [{
    name: 'st.overrides',
    sql: `SELECT feed_url, title, description, cover_url, theme_colour, milestone_message, hosts, links, contacts, tips_enabled, updated_at, updated_by::text AS updated_by FROM show_overrides`,
    keys: ['feed_url'],
    map(r) {
      const feedUrl = s(r['feed_url']); const updatedAt = isoReq(r['updated_at']); const msg = str(r['milestone_message']);
      return [main(encode('showOverride', K.showSingleton(feedUrl, 'OVERRIDE'), {
        feedUrl, title: str(r['title']), description: str(r['description']), coverUrl: str(r['cover_url']), themeColour: str(r['theme_colour']), milestoneMessage: msg,
        hosts: json(r['hosts']), links: json(r['links']), contacts: json(r['contacts']), tipsEnabled: bool(r['tips_enabled']), updatedAt, updatedBy: str(r['updated_by']),
      }, hasMessage(msg) ? { gsi: K.G4('milestone-msgs', updatedAt, K.feedKey(feedUrl)) } : {}))];
    },
  }],
  counts: [
    { type: 'showOverride' },
    { label: 'show_overrides with a message → G4 Q#milestone-msgs', type: 'showOverride', where: (i) => i['G4PK'] === 'Q#milestone-msgs', sql: "SELECT count(*)::int AS n FROM show_overrides WHERE btrim(coalesce(milestone_message, '')) <> ''" },
  ],
  back: [{
    pgTable: 'show_overrides', pk: ['feed_url'],
    match: (i) => t(i) === 'showOverride',
    toRow: (i) => ({
      feed_url: i['feedUrl'], title: S(i, 'title'), description: S(i, 'description'), cover_url: S(i, 'coverUrl'), theme_colour: S(i, 'themeColour'),
      milestone_message: S(i, 'milestoneMessage'), hosts: i['hosts'] ?? null, links: i['links'] ?? null, contacts: i['contacts'] ?? null,
      tips_enabled: i['tipsEnabled'] === true, updated_at: i['updatedAt'], updated_by: S(i, 'updatedBy'),
    }),
  }],
};

const policy: TableSpec = {
  pgTable: 'comment_policy',
  sources: [{
    name: 'st.policy',
    sql: 'SELECT feed_url, episode_id, mode, updated_by::text AS updated_by, updated_at FROM comment_policy',
    keys: ['feed_url', 'episode_id'],
    map: (r) => [main(encode('commentPolicy', K.commentPolicy(s(r['feed_url']), s(r['episode_id'])), {
      feedUrl: s(r['feed_url']), episodeId: s(r['episode_id']), mode: s(r['mode']), updatedBy: str(r['updated_by']), updatedAt: isoReq(r['updated_at']),
    }))],
  }],
  counts: [{ type: 'commentPolicy' }],
  back: [{
    pgTable: 'comment_policy', pk: ['feed_url', 'episode_id'],
    match: (i) => t(i) === 'commentPolicy',
    toRow: (i) => ({ feed_url: i['feedUrl'], episode_id: i['episodeId'], mode: i['mode'], updated_by: S(i, 'updatedBy'), updated_at: i['updatedAt'] }),
  }],
};

const picks: TableSpec = {
  pgTable: 'host_picks',
  sources: [{
    // One item per show; `setHostPicks` writes the whole list (by position), who picked, and when.
    name: 'st.picks',
    sql: `SELECT feed_url, json_agg(episode_id ORDER BY position) AS ids, (array_agg(picked_by::text ORDER BY position))[1] AS picked_by, max(created_at) AS updated_at
            FROM host_picks GROUP BY feed_url`,
    keys: ['feed_url'],
    map: (r) => [main(encode('hostPicks', K.hostPicks(s(r['feed_url'])), {
      feedUrl: s(r['feed_url']), episodeIds: (json<string[]>(r['ids']) ?? []).map(String), pickedBy: str(r['picked_by']), updatedAt: isoReq(r['updated_at']),
    }))],
  }],
  counts: [
    { label: 'host_picks rows → ids inside PICKS items', measure: (ix) => ix.ofType('hostPicks').reduce((n, i) => n + ((i['episodeIds'] as unknown[] | undefined)?.length ?? 0), 0) },
    { label: 'shows with picks → PICKS items', type: 'hostPicks', sql: 'SELECT count(DISTINCT feed_url)::int AS n FROM host_picks' },
  ],
  // The way back: the whole table from every PICKS item (lane LE) — a list emptied after the cutover deletes its rows.
  back: [{
    pgTable: 'host_picks', pk: ['feed_url', 'episode_id'],
    match: (i) => t(i) === 'hostPicks',
    whole: (items) => items.flatMap((i) => ((i['episodeIds'] as string[] | undefined) ?? []).map((episode_id, n) => ({ feed_url: i['feedUrl'], episode_id, position: n + 1, picked_by: S(i, 'pickedBy'), created_at: i['updatedAt'] }))),
    toRow: (i) => ({ feed_url: i['feedUrl'], episode_id: (i['episodeIds'] as string[])[0], position: 1, picked_by: S(i, 'pickedBy'), created_at: i['updatedAt'] }),
    children: (i) => [{
      table: 'host_picks', match: { feed_url: i['feedUrl'] },
      rows: (i['episodeIds'] as string[]).map((episode_id, n) => ({ feed_url: i['feedUrl'], episode_id, position: n + 1, picked_by: S(i, 'pickedBy'), created_at: i['updatedAt'] })),
    }],
  }],
};

const feedSync: TableSpec = {
  pgTable: 'feed_sync',
  sources: [{
    name: 'st.feedSync',
    sql: 'SELECT feed_url, fetched_at, ok, error, manual_at FROM feed_sync',
    keys: ['feed_url'],
    map: (r) => [main(encode('feedSync', K.feedSync(s(r['feed_url'])), {
      feedUrl: s(r['feed_url']), fetchedAt: isoReq(r['fetched_at']), ok: bool(r['ok']), error: str(r['error']),
      // `recordSync` without "Sync now" never sets manualAt; `claimManual` reads attribute_not_exists.
      ...(r['manual_at'] !== null && r['manual_at'] !== undefined ? { manualAt: isoReq(r['manual_at']) } : {}),
    }))],
  }],
  counts: [{ type: 'feedSync' }],
  back: [{
    pgTable: 'feed_sync', pk: ['feed_url'],
    match: (i) => t(i) === 'feedSync',
    toRow: (i) => ({ feed_url: i['feedUrl'], fetched_at: i['fetchedAt'], ok: i['ok'] === true, error: S(i, 'error'), manual_at: S(i, 'manualAt') }),
  }],
};

const hidden: TableSpec = {
  pgTable: 'hidden_episodes',
  sources: [{
    // The episode META `hidden` hint is lane LB's (it owns EP#/META and reads hidden_episodes for it).
    name: 'st.hiddenEpisodes',
    sql: 'SELECT feed_url, guid, hidden_by::text AS hidden_by, reason, hidden_at FROM hidden_episodes',
    keys: ['feed_url', 'guid'],
    map(r) {
      const feedUrl = s(r['feed_url']); const guid = s(r['guid']); const hiddenAt = isoReq(r['hidden_at']);
      return [
        main(encode('hiddenEpisode', K.hiddenEp(feedUrl, guid), { feedUrl, guid, hiddenBy: str(r['hidden_by']), reason: str(r['reason']), hiddenAt })),
        main(encode('hiddenEpCopy', K.hiddenEpAll(feedUrl, guid), { feedUrl, guid, hiddenAt })),
      ];
    },
  }],
  counts: [{ type: 'hiddenEpisode' }, { label: 'hidden_episodes → CFG#hidden-eps copies', type: 'hiddenEpCopy' }],
  back: [{
    pgTable: 'hidden_episodes', pk: ['feed_url', 'guid'],
    match: (i) => t(i) === 'hiddenEpisode',
    toRow: (i) => ({ feed_url: i['feedUrl'], guid: i['guid'], hidden_by: S(i, 'hiddenBy'), reason: S(i, 'reason'), hidden_at: i['hiddenAt'] }),
  }],
};

// ---------------------------------------------------------------------------------------------------------------
// held_comments (+ /mod's host hides, derived from comments.host_hidden_at)
// ---------------------------------------------------------------------------------------------------------------

const held: TableSpec = {
  pgTable: 'held_comments',
  sources: [
    {
      name: 'st.held',
      sql: `SELECT h.id::text AS id, h.episode_id, e.feed_url, h.author_id::text AS author_id, h.parent_id::text AS parent_id, h.body, h.offset_ms, h.country, h.created_at,
                   h.image_url, h.image_path, h.image_w, h.image_h, h.image_bytes
              FROM held_comments h JOIN episodes e ON e.id = h.episode_id`,
      keys: ['id'],
      map(r) {
        const id = s(r['id']); const episodeId = s(r['episode_id']); const feedUrl = s(r['feed_url']); const authorId = s(r['author_id']); const createdAt = isoReq(r['created_at']);
        const country = str(r['country']);
        return [
          main(encode('heldComment', K.heldComment(episodeId, id), {
            id, episodeId, feedUrl, authorId, parentId: str(r['parent_id']), body: s(r['body']), offsetMs: num(r['offset_ms']), country: country === null ? null : country.trim(), createdAt,
            // The picture attributes exist only once a picture was added (`setHeldImage` SETs, `forgetHeldImage` REMOVEs).
            ...defined({ imageUrl: str(r['image_url']), imagePath: str(r['image_path']), imageW: num(r['image_w']), imageH: num(r['image_h']), imageBytes: num(r['image_bytes']) }),
          })),
          main(encode('heldRef', K.heldRef(id), { id, episodeId, feedUrl, authorId, createdAt })),
          main(encode('heldPtr', K.heldInShow(feedUrl, createdAt, id), { id, episodeId, createdAt })),
          main(encode('heldPtr', K.heldBy(authorId, createdAt, id), { id, episodeId, createdAt })),
        ];
      },
    },
    {
      name: 'st.hostHides',
      sql: `SELECT c.id::text AS id, c.episode_id, e.feed_url, c.host_hidden_at, c.host_hidden_by::text AS host_hidden_by
              FROM comments c JOIN episodes e ON e.id = c.episode_id WHERE c.host_hidden_at IS NOT NULL`,
      keys: ['id'],
      map(r) {
        const at = isoReq(r['host_hidden_at']);
        return [main(encode('hostHide', K.hostHide(at, s(r['id'])), { commentId: s(r['id']), episodeId: s(r['episode_id']), feedUrl: s(r['feed_url']), by: str(r['host_hidden_by']), at }))];
      },
    },
  ],
  counts: [
    { type: 'heldComment' },
    { label: 'held_comments → HELDREF#', type: 'heldRef' },
    { label: 'held_comments → HELDQ# + L#/HELD# pointers', type: 'heldPtr', sql: 'SELECT (2 * count(*))::int AS n FROM held_comments h JOIN episodes e ON e.id = h.episode_id' },
    { label: 'comments host-hidden → CFG#host-hides', type: 'hostHide', sql: 'SELECT count(*)::int AS n FROM comments c JOIN episodes e ON e.id = c.episode_id WHERE c.host_hidden_at IS NOT NULL' },
  ],
  back: [{
    pgTable: 'held_comments', pk: ['id'],
    match: (i) => t(i) === 'heldComment',
    toRow: (i) => ({
      id: i['id'], episode_id: i['episodeId'], author_id: i['authorId'], parent_id: S(i, 'parentId'), body: i['body'], offset_ms: i['offsetMs'] ?? null,
      country: S(i, 'country'), created_at: i['createdAt'], image_url: S(i, 'imageUrl'), image_path: S(i, 'imagePath'),
      image_w: i['imageW'] ?? null, image_h: i['imageH'] ?? null, image_bytes: i['imageBytes'] ?? null,
    }),
  }],
};

// ---------------------------------------------------------------------------------------------------------------
// announcements, polls (+ poll_options, poll_votes), milestones_sent
// ---------------------------------------------------------------------------------------------------------------

const announcements: TableSpec = {
  pgTable: 'announcements',
  sources: [
    {
      name: 'st.announcements',
      sql: `SELECT id::text AS id, feed_url, author_id::text AS author_id, body, images, created_at, edited_at, pushed_at, release_at, deleted_at FROM announcements`,
      keys: ['id'],
      map(r) {
        const id = s(r['id']); const feedUrl = s(r['feed_url']); const createdAt = isoReq(r['created_at']);
        return [main(encode('announcement', K.announcement(feedUrl, createdAt, id), {
          id, feedUrl, authorId: str(r['author_id']), body: s(r['body']), images: json<unknown[]>(r['images']) ?? [], createdAt,
          editedAt: iso(r['edited_at']), pushedAt: iso(r['pushed_at']), releaseAt: isoReq(r['release_at']), deletedAt: iso(r['deleted_at']),
        }))];
      },
    },
    {
      // "2 pushes a month": the SQL counted every row pushed in the UTC month (deleted ones too).
      name: 'st.announcePushes',
      sql: `SELECT feed_url, to_char(pushed_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month, count(*)::int AS n
              FROM announcements WHERE pushed_at IS NOT NULL GROUP BY 1, 2`,
      keys: ['feed_url', 'month'],
      map: (r) => [main(encode('announcePushes', K.announcePushes(s(r['feed_url']), s(r['month'])), { feedUrl: s(r['feed_url']), month: s(r['month']), n: numReq(r['n']) }))],
    },
  ],
  counts: [
    { type: 'announcement' },
    { label: 'announcements pushed → ANNPUSH# months', type: 'announcePushes', sql: "SELECT count(*)::int AS n FROM (SELECT DISTINCT feed_url, to_char(pushed_at AT TIME ZONE 'UTC', 'YYYY-MM') FROM announcements WHERE pushed_at IS NOT NULL) x" },
  ],
  back: [{
    pgTable: 'announcements', pk: ['id'],
    match: (i) => t(i) === 'announcement',
    toRow: (i) => ({
      id: i['id'], feed_url: i['feedUrl'], author_id: S(i, 'authorId'), body: i['body'], images: i['images'] ?? [], created_at: i['createdAt'],
      edited_at: S(i, 'editedAt'), pushed_at: S(i, 'pushedAt'), release_at: i['releaseAt'], deleted_at: S(i, 'deletedAt'),
    }),
  }],
};

const polls: TableSpec = {
  pgTable: 'polls',
  sources: [{
    // Options are labels in idx order (the poll's own option index = array position, as createPoll writes 0..n-1);
    // `votes[k]` counts the votes for the k-th option, `voters` the distinct voters (the SQL's GROUP BY counts, kind A).
    name: 'st.polls',
    sql: `SELECT p.id::text AS id, p.feed_url, p.episode_id, p.question, p.ends_at, p.closed_at, p.created_by::text AS created_by, p.created_at, p.multi,
                 (SELECT coalesce(json_agg(json_build_array(o.idx, o.label) ORDER BY o.idx), '[]'::json) FROM poll_options o WHERE o.poll_id = p.id) AS opts,
                 (SELECT coalesce(json_agg(json_build_array(v.option_idx, v.n)), '[]'::json)
                    FROM (SELECT option_idx, count(*)::int AS n FROM poll_votes WHERE poll_id = p.id GROUP BY option_idx) v) AS counts,
                 (SELECT count(DISTINCT listener_id)::int FROM poll_votes WHERE poll_id = p.id) AS voters
            FROM polls p`,
    keys: ['id'],
    map(r) {
      const id = s(r['id']); const feedUrl = s(r['feed_url']);
      const opts = (json<[number, string][]>(r['opts']) ?? []).map(([idx, label]) => ({ idx: Number(idx), label: String(label) }));
      const counts = new Map((json<[number, number][]>(r['counts']) ?? []).map(([idx, n]) => [Number(idx), Number(n)]));
      return [
        main(encode('poll', K.poll(feedUrl, id), {
          id, feedUrl, episodeId: str(r['episode_id']), question: s(r['question']), options: opts.map((o) => o.label), votes: opts.map((o) => counts.get(o.idx) ?? 0),
          voters: numReq(r['voters']), multi: bool(r['multi']), endsAt: isoReq(r['ends_at']), createdBy: str(r['created_by']), createdAt: isoReq(r['created_at']), v: 0,
          // createPoll leaves closedAt out; closePoll sets it with if_not_exists.
          ...(r['closed_at'] !== null && r['closed_at'] !== undefined ? { closedAt: isoReq(r['closed_at']) } : {}),
        })),
        main(encode('pollRef', K.pollRef(id), { id, feedUrl })),
      ];
    },
  }],
  counts: [{ type: 'poll' }, { label: 'polls → POLLREF#', type: 'pollRef' }],
  back: [{
    pgTable: 'polls', pk: ['id'],
    match: (i) => t(i) === 'poll',
    toRow: (i) => ({
      id: i['id'], feed_url: i['feedUrl'], episode_id: S(i, 'episodeId'), question: i['question'], ends_at: i['endsAt'], closed_at: S(i, 'closedAt'),
      created_by: S(i, 'createdBy'), created_at: i['createdAt'], multi: i['multi'] === true,
    }),
    // Options are written back only for a poll nobody voted on (v = 0): replacing them later would cascade-delete its
    // votes (poll_votes → poll_options ON DELETE CASCADE), and the labels never change after creation.
    children: (i) => (Number(i['v'] ?? 0) === 0 ? [{
      table: 'poll_options', match: { poll_id: i['id'] },
      rows: ((i['options'] as string[] | undefined) ?? []).map((label, idx) => ({ poll_id: i['id'], idx, label })),
    }] : []),
  }],
};

const pollOptions: TableSpec = {
  pgTable: 'poll_options',
  sources: [],
  // Held inside the poll item (`options`): no source of their own.
  counts: [{ label: 'poll_options → labels inside POLL items', measure: (ix) => ix.ofType('poll').reduce((n, i) => n + ((i['options'] as unknown[] | undefined)?.length ?? 0), 0) }],
};

const pollVotes: TableSpec = {
  pgTable: 'poll_votes',
  sources: [{
    // ONE item per voter (the old primary key before 024; a multi-choice voter's options in one list).
    name: 'st.pollVotes',
    sql: `SELECT v.poll_id::text AS poll_id, v.listener_id::text AS listener_id, p.feed_url, json_agg(v.option_idx ORDER BY v.option_idx) AS opts, max(v.created_at) AS voted_at
            FROM poll_votes v JOIN polls p ON p.id = v.poll_id GROUP BY v.poll_id, v.listener_id, p.feed_url`,
    keys: ['poll_id', 'listener_id'],
    map(r) {
      const pollId = s(r['poll_id']); const listenerId = s(r['listener_id']); const feedUrl = s(r['feed_url']);
      return [
        main(encode('pollVote', K.pollVote(feedUrl, pollId, listenerId), { pollId, listenerId, options: (json<number[]>(r['opts']) ?? []).map(Number), votedAt: isoReq(r['voted_at']) })),
        main(encode('pollVotePtr', K.pollVotePtr(listenerId, pollId), { pollId, feedUrl })),
      ];
    },
  }],
  counts: [
    { label: 'poll_votes rows → options inside POLLVOTE# items', measure: (ix) => ix.ofType('pollVote').reduce((n, i) => n + ((i['options'] as unknown[] | undefined)?.length ?? 0), 0) },
    { label: 'poll voters → POLLVOTE# items', type: 'pollVote', sql: 'SELECT count(*)::int AS n FROM (SELECT DISTINCT poll_id, listener_id FROM poll_votes) x' },
    { label: 'poll voters → PVOTE# pointers', type: 'pollVotePtr', sql: 'SELECT count(*)::int AS n FROM (SELECT DISTINCT poll_id, listener_id FROM poll_votes) x' },
  ],
  back: [{
    pgTable: 'poll_votes', pk: ['poll_id', 'listener_id', 'option_idx'],
    match: (i) => t(i) === 'pollVote' && ((i['options'] as unknown[] | undefined)?.length ?? 0) > 0,
    toRow: (i) => ({ poll_id: i['pollId'], listener_id: i['listenerId'], option_idx: (i['options'] as number[])[0], created_at: i['votedAt'] }),
    children: (i) => [{
      table: 'poll_votes', match: { poll_id: i['pollId'], listener_id: i['listenerId'] },
      rows: (i['options'] as number[]).map((option_idx) => ({ poll_id: i['pollId'], listener_id: i['listenerId'], option_idx, created_at: i['votedAt'] })),
    }],
  }],
};

const milestones: TableSpec = {
  pgTable: 'milestones_sent',
  sources: [{
    name: 'st.milestones',
    sql: 'SELECT id::text AS id, feed_url, milestone, listener_id::text AS listener_id, body, sent_at FROM milestones_sent',
    keys: ['id'],
    map(r) {
      const id = s(r['id']); const feedUrl = s(r['feed_url']); const m = numReq(r['milestone']); const sentAt = isoReq(r['sent_at']); const body = s(r['body']);
      return [
        main(encode('milestone', K.milestoneSent(feedUrl, m), { id, feedUrl, milestone: m, listenerId: s(r['listener_id']), body, sentAt })),
        main(encode('milestoneCopy', K.milestoneCopy(s(r['listener_id']), sentAt, id), { id, feedUrl, milestone: m, body, sentAt })),
      ];
    },
  }],
  counts: [{ type: 'milestone' }, { label: 'milestones_sent → L#/MSTONE# copies', type: 'milestoneCopy' }],
  back: [{
    pgTable: 'milestones_sent', pk: ['feed_url', 'milestone'],
    match: (i) => t(i) === 'milestone',
    toRow: (i) => ({ id: i['id'], feed_url: i['feedUrl'], milestone: i['milestone'], listener_id: i['listenerId'], body: i['body'], sent_at: i['sentAt'] }),
  }],
};

// ---------------------------------------------------------------------------------------------------------------
// share_events + the Studio facts and rollups (sm-events)
// ---------------------------------------------------------------------------------------------------------------

const fact = (fk: string, sk: string, type: 'stPlay' | 'stLike' | 'stSave' | 'stRanges', listenerId: string, attrs: Record<string, unknown>, e1Day: string): Out[] => [
  events(encode(type, K.stFact(fk, sk), { ...attrs, v: 1 }, { gsi: K.E1(e1Day, 'st', `${fk}#${sk}`) })),
  events(encode('stFactPtr', K.stFactPtr(listenerId, fk, sk), { pk: `SX#${fk}`, sk })),
];

/** Rollup items, as `rollAdd` leaves them: `{ t: rollup, metric: st:<m>, n }`. */
const rollup = (metric: 'plays' | 'likes' | 'saves' | 'shares') => (r: Row): Out[] =>
  [events(encode('rollup', K.stRollup(K.feedKey(s(r['feed_url'])), metric, s(r['b'])), { metric: `st:${metric}`, n: numReq(r['n']) }))];

/** The fact sources' SQL (each rollup query below groups the same rows). */
const PLAYS = `SELECT a.id, a.actor_id, a.episode_id, a.day, a.created_at, e.feed_url FROM activity a JOIN episodes e ON e.id = a.episode_id
                WHERE a.kind = 'listened' AND a.day IS NOT NULL`;
const LIKES = `SELECT r.listener_id, r.episode_id, min(r.created_at) AS at, e.feed_url FROM reactions r JOIN episodes e ON e.id = r.episode_id
                GROUP BY r.listener_id, r.episode_id, e.feed_url`;
const SAVES = `SELECT li.listener_id, li.item_key AS episode_id, li.updated_at AS at, e.feed_url FROM library_items li JOIN episodes e ON e.id = li.item_key
                WHERE li.kind = 'fav_episode' AND li.deleted_at IS NULL`;
const PAIRS = `WITH r AS (SELECT listener_id, episode_id, json_agg(ranges ORDER BY day, device_id) AS parts, max(updated_at) AS at FROM listened_ranges GROUP BY 1, 2),
                    p AS (SELECT listener_id, episode_id, received_at FROM positions WHERE finished)
               SELECT coalesce(r.listener_id, p.listener_id)::text AS listener_id, coalesce(r.episode_id, p.episode_id) AS episode_id, e.feed_url,
                      r.parts, (p.listener_id IS NOT NULL) AS finished, greatest(r.at, p.received_at) AS at
                 FROM r FULL JOIN p ON p.listener_id = r.listener_id AND p.episode_id = r.episode_id
                 JOIN episodes e ON e.id = coalesce(r.episode_id, p.episode_id)`;

const ROLLUPS_SQL = `
  SELECT count(*)::int AS n FROM (
    SELECT feed_url, day::text FROM (${PLAYS}) x GROUP BY 1, 2
    UNION ALL SELECT feed_url, to_char(at AT TIME ZONE 'UTC', ${UTC_HOUR}) FROM (${LIKES}) x GROUP BY 1, 2
    UNION ALL SELECT feed_url, to_char(at AT TIME ZONE 'UTC', ${UTC_HOUR}) FROM (${SAVES}) x GROUP BY 1, 2
    UNION ALL SELECT feed_url, to_char(at AT TIME ZONE 'UTC', ${UTC_HOUR}) FROM share_events GROUP BY 1, 2) g`;

const shares: TableSpec = {
  pgTable: 'share_events',
  sources: [
    {
      name: 'st.shares',
      sql: 'SELECT id::text AS id, listener_id::text AS listener_id, target_kind, target_id, feed_url, at FROM share_events',
      keys: ['id'],
      map(r) {
        const id = numReq(r['id']); const feedUrl = s(r['feed_url']); const fk = K.feedKey(feedUrl); const at = isoReq(r['at']); const listenerId = str(r['listener_id']);
        const sk = `S#${K.ts(at)}#${K.pad(id)}`;
        const out: Out[] = [events(encode('shareEvent', K.stFact(fk, sk), { id, listenerId, targetKind: s(r['target_kind']), targetId: s(r['target_id']), feedUrl, at }, {
          gsi: K.E1(K.day(at), 'st', `${fk}#${sk}`),
        }))];
        if (listenerId) out.push(events(encode('stFactPtr', K.stFactPtr(listenerId, fk, sk), { pk: `SX#${fk}`, sk })));
        return out;
      },
    },
    {
      name: 'st.shareSeq',
      sql: `SELECT 'share_events' AS name, max(id)::text AS v FROM share_events HAVING max(id) IS NOT NULL`,
      keys: ['name'],
      map: (r) => [main(encode('seq', K.seq('share_events'), { v: numReq(r['v']) }))],
    },
    {
      // A play: one `listened` activity (hidden included), keyed by the listener's own day; at = the activity's time.
      name: 'st.factPlays',
      sql: `SELECT id::text AS id, actor_id::text AS listener_id, episode_id, day::text AS day, created_at, feed_url FROM (${PLAYS}) x`,
      keys: ['id'],
      map(r) {
        const fk = K.feedKey(s(r['feed_url'])); const l = s(r['listener_id']); const ep = s(r['episode_id']); const d = dayOf(r['day'])!; const at = isoReq(r['created_at']);
        return fact(fk, `P#${d}#${ep}#${l}`, 'stPlay', l, { episodeId: ep, listenerId: l, day: d, at, activityId: numReq(r['id']) }, K.day(at));
      },
    },
    {
      // A like: the listener's FIRST reaction on the episode.
      name: 'st.factLikes',
      sql: `SELECT listener_id::text AS listener_id, episode_id, at, feed_url FROM (${LIKES}) x`,
      keys: ['listener_id', 'episode_id'],
      map(r) {
        const fk = K.feedKey(s(r['feed_url'])); const l = s(r['listener_id']); const ep = s(r['episode_id']); const at = isoReq(r['at']);
        return fact(fk, `L#${ep}#${l}`, 'stLike', l, { episodeId: ep, listenerId: l, at }, K.day(at));
      },
    },
    {
      // A save: a live fav_episode library item; at = its updatedAt.
      name: 'st.factSaves',
      sql: `SELECT listener_id::text AS listener_id, episode_id, at, feed_url FROM (${SAVES}) x`,
      keys: ['listener_id', 'episode_id'],
      map(r) {
        const fk = K.feedKey(s(r['feed_url'])); const l = s(r['listener_id']); const ep = s(r['episode_id']); const at = isoReq(r['at']);
        return fact(fk, `V#${ep}#${l}`, 'stSave', l, { episodeId: ep, listenerId: l, at }, K.day(at));
      },
    },
    {
      // What the listener heard (every device and day merged) and whether they finished it. The writer has no `at` and
      // dates the E1 key by its own clock; the copy dates it by the newest source row (only `checkRollups` reads it).
      name: 'st.factRanges',
      sql: `SELECT listener_id, episode_id, feed_url, parts, finished, at FROM (${PAIRS}) x`,
      keys: ['listener_id', 'episode_id'],
      map(r) {
        const fk = K.feedKey(s(r['feed_url'])); const l = s(r['listener_id']); const ep = s(r['episode_id']);
        const parts = (json<unknown[]>(r['parts']) ?? []).map((p) => json<Range[]>(p) ?? []);
        const ranges = mergeRanges(parts.flat().map((x) => [Number(x[0]), Number(x[1])] as const));
        const finished = bool(r['finished']);
        if (ranges.length === 0 && !finished) return [];
        return fact(fk, `R#${ep}#${l}`, 'stRanges', l, { episodeId: ep, listenerId: l, ranges, finished }, K.day(isoReq(r['at'])));
      },
    },
    {
      name: 'st.rollPlays',
      sql: `SELECT feed_url, day::text AS b, count(*)::int AS n FROM (${PLAYS}) x GROUP BY 1, 2`,
      keys: ['feed_url', 'b'],
      map: rollup('plays'),
    },
    {
      name: 'st.rollLikes',
      sql: `SELECT feed_url, to_char(at AT TIME ZONE 'UTC', ${UTC_HOUR}) AS b, count(*)::int AS n FROM (${LIKES}) x GROUP BY 1, 2`,
      keys: ['feed_url', 'b'],
      map: rollup('likes'),
    },
    {
      name: 'st.rollSaves',
      sql: `SELECT feed_url, to_char(at AT TIME ZONE 'UTC', ${UTC_HOUR}) AS b, count(*)::int AS n FROM (${SAVES}) x GROUP BY 1, 2`,
      keys: ['feed_url', 'b'],
      map: rollup('saves'),
    },
    {
      name: 'st.rollShares',
      sql: `SELECT feed_url, to_char(at AT TIME ZONE 'UTC', ${UTC_HOUR}) AS b, count(*)::int AS n FROM share_events GROUP BY 1, 2`,
      keys: ['feed_url', 'b'],
      map: rollup('shares'),
    },
  ],
  counts: [
    { type: 'shareEvent' },
    { label: 'share_events max(id) → SEQ#share_events', type: 'seq', pk: 'SEQ#share_events', sql: 'SELECT (count(*) > 0)::int AS n FROM share_events' },
    { label: 'listened activity → Studio plays', type: 'stPlay', sql: `SELECT count(*)::int AS n FROM (${PLAYS}) x` },
    { label: 'first reactions → Studio likes', type: 'stLike', sql: `SELECT count(*)::int AS n FROM (${LIKES}) x` },
    { label: 'live fav_episode → Studio saves', type: 'stSave', sql: `SELECT count(*)::int AS n FROM (${SAVES}) x` },
    {
      label: 'Studio fact pointers STF#', type: 'stFactPtr',
      // Every play, like and save, every ranges fact, every share with a sharer. (A pair whose ranges are all empty
      // and that is not finished has no fact but is counted here — the app never stores such ranges.)
      measure: (ix) => (['stPlay', 'stLike', 'stSave', 'stRanges'] as const).reduce((n, ty) => n + ix.ofType(ty).length, 0) + ix.ofType('shareEvent').filter((i) => i['listenerId']).length,
      sql: `SELECT ((SELECT count(*) FROM (${PLAYS}) a) + (SELECT count(*) FROM (${LIKES}) b) + (SELECT count(*) FROM (${SAVES}) c)
                   + (SELECT count(*) FROM share_events WHERE listener_id IS NOT NULL)
                   + (SELECT count(*) FROM (${PAIRS}) d WHERE d.finished OR d.parts IS NOT NULL))::int AS n`,
    },
    { label: 'Studio rollups R#st#', type: 'rollup', pk: 'R#st#', sql: ROLLUPS_SQL },
  ],
  back: [{
    pgTable: 'share_events', pk: ['id'],
    match: (i) => t(i) === 'shareEvent',
    toRow: (i) => ({ id: i['id'], listener_id: S(i, 'listenerId'), target_kind: i['targetKind'], target_id: i['targetId'], feed_url: i['feedUrl'], at: i['at'] }),
  }],
  // Facts and rollups are derived (their sources are other lanes' tables, copied back by those lanes).
};

// ---------------------------------------------------------------------------------------------------------------
// schema_migrations → CFG#studio-history-since
// ---------------------------------------------------------------------------------------------------------------

const schemaMigrations: TableSpec = {
  pgTable: 'schema_migrations',
  sources: [{
    // Only what the DynamoDB code reads: when subscribe/unsubscribe history began (migration 008), as the SQL's
    // `applied_at` UTC day. The migration log itself is not data (no way back: the target database keeps its own).
    name: 'st.historySince',
    sql: `SELECT version, to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS since FROM schema_migrations WHERE version = 8`,
    keys: ['version'],
    map: (r) => [main(encode('config', K.config('studio-history-since'), { since: s(r['since']) }))],
  }],
  counts: [{ label: 'schema_migrations row 8 → CFG#studio-history-since', type: 'config', pk: 'CFG#studio-history-since', sql: 'SELECT count(*)::int AS n FROM schema_migrations WHERE version = 8' }],
};

// ---------------------------------------------------------------------------------------------------------------
// counters (read only)
// ---------------------------------------------------------------------------------------------------------------

const keyText = (i: Item) => `${s(i['PK'])}|${s(i['SK'])}`;

const pollCounts: CounterCheck = {
  name: 'poll.votes',
  check(ix) {
    const out: Mismatch[] = [];
    for (const p of ix.ofType('poll')) {
      const id = s(p['id']);
      const votes = ix.partition('main', s(p['PK'])).filter((v) => s(v['SK']).startsWith(`POLLVOTE#${id}#`));
      const n = ((p['options'] as unknown[] | undefined) ?? []).length;
      const want = Array.from({ length: n }, () => 0);
      for (const v of votes) for (const o of (v['options'] as number[] | undefined) ?? []) want[Number(o)] = (want[Number(o)] ?? 0) + 1;
      const have = ((p['votes'] as unknown[] | undefined) ?? []).map(Number);
      if (JSON.stringify(have) !== JSON.stringify(want)) out.push({ counter: 'poll.votes', key: keyText(p), stored: have, recomputed: want });
      if (Number(p['voters'] ?? 0) !== votes.length) out.push({ counter: 'poll.voters', key: keyText(p), stored: p['voters'], recomputed: votes.length });
    }
    return out;
  },
};

const announcePushCounts: CounterCheck = {
  name: 'announcePushes.n',
  check(ix) {
    const want = new Map<string, number>();
    for (const a of ix.ofType('announcement')) {
      const at = S(a, 'pushedAt');
      if (!at) continue;
      const k = `${s(a['PK'])}|ANNPUSH#${K.ts(at).slice(0, 7)}`;
      want.set(k, (want.get(k) ?? 0) + 1);
    }
    const out: Mismatch[] = [];
    const seen = new Set<string>();
    for (const c of ix.ofType('announcePushes')) {
      const k = keyText(c); seen.add(k);
      if (Number(c['n'] ?? 0) !== (want.get(k) ?? 0)) out.push({ counter: 'announcePushes.n', key: k, stored: c['n'], recomputed: want.get(k) ?? 0 });
    }
    for (const [k, n] of want) if (!seen.has(k)) out.push({ counter: 'announcePushes.n', key: k, stored: undefined, recomputed: n });
    return out;
  },
};

/** The rule of facts.ts `recountDay` over every day: plays by their day, likes / saves / shares by the UTC hour of `at`. */
const studioRollups: CounterCheck = {
  name: 'studio.rollups',
  check(ix: ItemIndex) {
    const want = new Map<string, number>();
    const add = (fk: string, m: string, b: string) => { const k = `R#st#${fk}#${m}|${b}`; want.set(k, (want.get(k) ?? 0) + 1); };
    for (const i of ix.all) {
      if (i._table !== 'events') continue;
      const pk = s(i['PK']);
      if (!pk.startsWith('SX#')) continue;
      const fk = pk.slice(3); const sk = s(i['SK']);
      if (sk.startsWith('P#')) add(fk, 'plays', s(i['day']));
      else if (sk.startsWith('L#')) add(fk, 'likes', hourOf(s(i['at'])));
      else if (sk.startsWith('V#')) add(fk, 'saves', hourOf(s(i['at'])));
      else if (sk.startsWith('S#')) add(fk, 'shares', hourOf(s(i['at'])));
    }
    const out: Mismatch[] = [];
    const seen = new Set<string>();
    for (const r of ix.ofType('rollup')) {
      if (!s(r['PK']).startsWith('R#st#')) continue;
      const k = keyText(r); seen.add(k);
      const n = Number(r['n'] ?? 0);
      if (n !== (want.get(k) ?? 0)) out.push({ counter: 'studio.rollup', key: k, stored: n, recomputed: want.get(k) ?? 0 });
    }
    for (const [k, n] of want) if (!seen.has(k)) out.push({ counter: 'studio.rollup', key: k, stored: undefined, recomputed: n });
    return out;
  },
};

const shareSeq: CounterCheck = {
  name: 'seq.share_events',
  check(ix) {
    const max = ix.ofType('shareEvent').reduce((m, i) => Math.max(m, Number(i['id'] ?? 0)), 0);
    const it = ix.get('main', 'SEQ#share_events', 'S');
    const v = it ? Number(it['v'] ?? 0) : 0;
    return v >= max ? [] : [{ counter: 'seq.share_events', key: 'SEQ#share_events|S', stored: it ? v : undefined, recomputed: max }];
  },
};

/** Byte ceilings kept on lane AC's `CFG#bytes` by lane ST's writers (hosted audio; pictures on held comments). */
const studioBytes: CounterCheck = {
  name: 'bytes.studio',
  check(ix) {
    const cfg = ix.get('main', 'CFG#bytes', 'V');
    const audio = ix.ofType('hostedEpisode').filter((e) => !e['deletedAt']).reduce((n, e) => n + Number(e['audioBytes'] ?? 0), 0);
    const pics = ix.ofType('heldComment').reduce((n, h) => n + Number(h['imageBytes'] ?? 0), 0);
    const out: Mismatch[] = [];
    const have = (k: string) => Number(cfg?.[k] ?? 0);
    if (have('hostedAudioBytes') !== audio) out.push({ counter: 'bytes.hostedAudioBytes', key: 'CFG#bytes|V', stored: cfg?.['hostedAudioBytes'], recomputed: audio });
    if (have('heldImageBytes') !== pics) out.push({ counter: 'bytes.heldImageBytes', key: 'CFG#bytes|V', stored: cfg?.['heldImageBytes'], recomputed: pics });
    return out;
  },
};


export const lane: LaneModule = {
  lane: 'st',
  tables: [
    claims, members, hosts, mutes, invites, curators,
    hostedShows, hostedEpisodes,
    overrides, policy, picks, feedSync, hidden,
    held,
    announcements, polls, pollOptions, pollVotes, milestones,
    shares,
    schemaMigrations,
  ],
  counters: [pollCounts, announcePushCounts, studioRollups, shareSeq, studioBytes],
};
