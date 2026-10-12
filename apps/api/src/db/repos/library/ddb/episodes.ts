// Episodes on DynamoDB: EP#<id>/META, the (feed, guid) uniqueness item, the show's META kept up to date.
/**
 * M26 lane LB, LB-T01/T02 (access patterns LB-01…03), data-model.md §3–§6.
 *
 * - `EP#<id> / META`: the episode. Written read-modify-write under a version `v` (the SQL `ON CONFLICT …
 *   COALESCE` rules computed in code against the row just read): a racing writer fails the condition and
 *   the step is retried from a fresh read — so a known `durationMs` is never overwritten (it is only ever
 *   filled while absent), exactly the old `COALESCE(old, new)`.
 * - `U#GUID#<feedKey>#<sha(guid)>`: claimed in the creating transaction (the old UNIQUE (feed_url, guid)), and
 *   the lookup by (feed, guid) as one GetItem (feed refresh, daily pick).
 * - G2 `SHEPS#<feedKey>` / `<publishedAt|~>#<id>` and, with a genre and a date, G3 `GENREEPS#<genre>`.
 * - When the duration becomes known, the same transaction enqueues `heat.place` (§6 parked comments).
 * - `SH#<feedKey> / META` (LB-T02): newest show title and cover (by the episode's date, NULLs last — the old
 *   `ORDER BY published_at DESC NULLS LAST` over episodes with a title/cover), the latest episode, genre (+ G3
 *   `GENRESH#…`). Counters (`subscriberCount`) are added by subscriptions.ts.
 */
import type { NativeAttributeValue } from '@aws-sdk/lib-dynamodb';
import type { Db } from '../../../db.ts';
import { bridgeOf } from '../../../backend-ddb.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { withVersionRetry } from '../../../ddb/retry.ts';
import { get, isoNow, update, type Item, type Store } from '../../../ddb/store.ts';
import { tx } from '../../../ddb/tx.ts';
import { claimUnique } from '../../../ddb/unique.ts';
import { enqueue } from '../../../../jobs/outbox.ts';
import { HEAT_PLACE } from '../../../../heat/ddb.ts';
import * as pg from '../episodes.ts';
import type { EpisodeInput, EpisodeRow } from '../episodes.ts';
import { rebuildFromBridge } from './heat.ts';

const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
const num = (v: unknown): number | null => (v === undefined || v === null ? null : Number(v));

/** The item → the row the repos have always returned (times as ISO strings). */
export function episodeRow(it: Item): EpisodeRow {
  return {
    id: String(it['id']), feed_url: String(it['feedUrl']), guid: String(it['guid']), title: String(it['title']),
    show_title: str(it['showTitle']), enclosure_url: String(it['enclosureUrl']), image_url: str(it['imageUrl']),
    duration_ms: num(it['durationMs']), published_at: str(it['publishedAt']), genre_id: num(it['genreId']),
  };
}

type Fields = { showTitle: string | null; imageUrl: string | null; durationMs: number | null; publishedAt: string | null; genreId: number | null; title: string; mediaKind: string };

function fieldsOf(it: Item): Fields {
  return {
    showTitle: str(it['showTitle']), imageUrl: str(it['imageUrl']), durationMs: num(it['durationMs']),
    publishedAt: str(it['publishedAt']), genreId: num(it['genreId']), title: String(it['title']), mediaKind: str(it['mediaKind']) ?? 'audio',
  };
}

const iso = (s: string | undefined): string | null => (s === undefined ? null : new Date(s).toISOString());

/** The SQL `ON CONFLICT` rules: 'upsert' = the feed refresh (new title wins, others COALESCE(new, old)); 'fill' = only empty fields. */
function nextFields(cur: Fields, e: EpisodeInput, mode: 'upsert' | 'fill'): Fields {
  const inp = { showTitle: e.showTitle ?? null, imageUrl: e.imageUrl ?? null, durationMs: e.durationMs ?? null, publishedAt: iso(e.publishedAt), genreId: e.genreId ?? null };
  if (mode === 'fill') {
    return {
      ...cur,
      showTitle: cur.showTitle ?? inp.showTitle, imageUrl: cur.imageUrl ?? inp.imageUrl, durationMs: cur.durationMs ?? inp.durationMs,
      publishedAt: cur.publishedAt ?? inp.publishedAt, genreId: cur.genreId ?? inp.genreId,
    };
  }
  return {
    title: e.title,
    showTitle: inp.showTitle ?? cur.showTitle, imageUrl: inp.imageUrl ?? cur.imageUrl,
    durationMs: cur.durationMs ?? inp.durationMs, // never overwritten (FR-021)
    publishedAt: inp.publishedAt ?? cur.publishedAt, genreId: inp.genreId ?? cur.genreId,
    mediaKind: e.mediaKind === 'video' ? 'video' : cur.mediaKind,
  };
}

const gsiOf = (feedUrl: string, id: string, f: Pick<Fields, 'publishedAt' | 'genreId'>): Record<string, string> => ({
  ...K.G2eps(feedUrl, f.publishedAt, id),
  ...(f.genreId !== null && f.publishedAt !== null ? K.G3eps(f.genreId, f.publishedAt, id) : {}),
});

/** Writes the episode; returns the row before (undefined when new) and after. */
export async function writeEpisode(store: Store, e: EpisodeInput, mode: 'upsert' | 'fill'): Promise<{ before: EpisodeRow | undefined; after: EpisodeRow }> {
  const out = await withVersionRetry(async () => {
    const cur = await get(store, 'main', K.episode(e.id));
    const now = isoNow(store.clock);
    if (!cur) {
      const f: Fields = { title: e.title, showTitle: e.showTitle ?? null, imageUrl: e.imageUrl ?? null, durationMs: e.durationMs ?? null, publishedAt: iso(e.publishedAt), genreId: e.genreId ?? null, mediaKind: e.mediaKind ?? 'audio' };
      const attrs: Record<string, unknown> = {
        id: e.id, feedUrl: e.feedUrl, feedKey: K.feedKey(e.feedUrl), guid: e.guid, title: f.title, enclosureUrl: e.enclosureUrl, mediaKind: f.mediaKind,
        firstSeenAt: now, updatedAt: now, v: 1,
      };
      for (const k of ['showTitle', 'imageUrl', 'durationMs', 'publishedAt', 'genreId'] as const) if (f[k] !== null) attrs[k] = f[k];
      const item = encode('episode', K.episode(e.id), attrs, { gsi: gsiOf(e.feedUrl, e.id, f) });
      const t = tx(store).put('main', item, { condition: 'attribute_not_exists(PK)', label: 'episode' });
      claimUnique(t, K.U.guid(e.feedUrl, e.guid), e.id);
      if (f.durationMs !== null) enqueue(t, store, { kind: HEAT_PLACE, payload: { episodeId: e.id } });
      await t.commit();
      return { before: undefined, after: item };
    }
    const was = fieldsOf(cur);
    const f = nextFields(was, e, mode);
    const durationKnownNow = was.durationMs === null && f.durationMs !== null;
    const set: Record<string, unknown> = {};
    for (const k of ['title', 'showTitle', 'imageUrl', 'durationMs', 'publishedAt', 'genreId', 'mediaKind'] as const) if (f[k] !== null && f[k] !== was[k]) set[k] = f[k];
    if (Object.keys(set).length === 0) return { before: cur, after: cur };
    if (durationKnownNow) set['updatedAt'] = now;
    const feedUrl = String(cur['feedUrl']);
    Object.assign(set, gsiOf(feedUrl, e.id, f));
    const v = Number(cur['v'] ?? 0);
    const names: Record<string, string> = { '#v': 'v' };
    const values: Record<string, NativeAttributeValue> = { ':nv': v + 1 };
    const parts = Object.entries(set).map(([k, val], i) => { names[`#a${i}`] = k; values[`:a${i}`] = val as NativeAttributeValue; return `#a${i} = :a${i}`; });
    const t = tx(store).update('main', K.episode(e.id), {
      update: `SET ${parts.join(', ')}, #v = :nv`,
      condition: cur['v'] === undefined ? 'attribute_exists(PK) AND attribute_not_exists(#v)' : 'attribute_exists(PK) AND #v = :seen',
      names, values: cur['v'] === undefined ? values : { ...values, ':seen': v }, label: 'episode',
    });
    if (durationKnownNow) enqueue(t, store, { kind: HEAT_PLACE, payload: { episodeId: e.id } });
    await t.commit();
    return { before: cur, after: { ...cur, ...set, v: v + 1 } as Item };
  });
  const after = episodeRow(out.after);
  await touchShow(store, after);
  return { before: out.before ? episodeRow(out.before) : undefined, after };
}

/** LB-T02: the show's META follows its newest episode (title, cover, latest, genre). Writes only on a change. */
export async function touchShow(store: Store, ep: EpisodeRow): Promise<void> {
  const rank = ep.published_at ?? ''; // '' sorts below every date: NULLS LAST under "newest first"
  await withVersionRetry(async () => {
    const cur = await get(store, 'main', K.show(ep.feed_url));
    const set: Record<string, unknown> = {};
    const newer = (attr: string) => cur?.[attr] === undefined || rank >= String(cur[attr]);
    if (ep.show_title !== null && newer('titleRank') && (cur?.['newestTitle'] !== ep.show_title || cur?.['titleRank'] !== rank)) Object.assign(set, { newestTitle: ep.show_title, titleRank: rank });
    if (ep.image_url !== null && newer('imageRank') && (cur?.['newestImage'] !== ep.image_url || cur?.['imageRank'] !== rank)) Object.assign(set, { newestImage: ep.image_url, imageRank: rank });
    if (newer('latestRank') && (cur?.['latestEpisodeId'] !== ep.id || cur?.['latestRank'] !== rank)) {
      Object.assign(set, { latestEpisodeId: ep.id, latestRank: rank, latestPublishedAt: ep.published_at });
    }
    if (ep.genre_id !== null && cur?.['genreId'] !== ep.genre_id) set['genreId'] = ep.genre_id;
    if (Object.keys(set).length === 0) return;
    const genre = (set['genreId'] ?? cur?.['genreId']) as number | undefined;
    const latestAt = (set['latestPublishedAt'] !== undefined ? set['latestPublishedAt'] : cur?.['latestPublishedAt']) as string | null | undefined;
    if (genre !== undefined && genre !== null && latestAt) Object.assign(set, K.G3shows(genre, latestAt, ep.feed_url));
    const v = Number(cur?.['v'] ?? 0);
    const names: Record<string, string> = { '#v': 'v', '#t': 't', '#f': 'feedUrl' };
    const values: Record<string, NativeAttributeValue> = { ':nv': v + 1, ':show': 'show', ':f': ep.feed_url };
    const parts = Object.entries(set).map(([k, val], i) => { names[`#a${i}`] = k; values[`:a${i}`] = val as NativeAttributeValue; return `#a${i} = :a${i}`; });
    await update(store, 'main', K.show(ep.feed_url), {
      update: `SET ${parts.join(', ')}, #v = :nv, #t = if_not_exists(#t, :show), #f = if_not_exists(#f, :f)`,
      condition: cur ? (cur['v'] === undefined ? 'attribute_not_exists(#v)' : '#v = :seen') : 'attribute_not_exists(PK)',
      names, values: cur && cur['v'] !== undefined ? { ...values, ':seen': v } : values,
    });
  });
}

export async function getEpisode(store: Store, _db: Db, id: string): Promise<EpisodeRow | undefined> {
  const it = await get(store, 'main', K.episode(id));
  return it ? episodeRow(it) : undefined;
}

export async function upsertEpisode(store: Store, db: Db, e: EpisodeInput): Promise<EpisodeRow> {
  const { after } = await writeEpisode(store, e, 'upsert');
  const raw = bridgeOf(db);
  if (raw) await pg.upsertEpisode(raw, e);
  return after;
}

export async function fillEpisode(store: Store, db: Db, e: EpisodeInput): Promise<EpisodeRow> {
  const { after } = await writeEpisode(store, e, 'fill');
  const raw = bridgeOf(db);
  if (raw) await pg.fillEpisode(raw, e);
  return after;
}

/**
 * The episode PUT. The heat placement for comments already in DynamoDB is the outbox job enqueued by
 * `writeEpisode`; while comments and reactions still live on Postgres (lane SC not merged), the curve is
 * rebuilt here from them, as the Postgres version does inside its transaction.
 */
export async function registerEpisodeTx(store: Store, db: Db, id: string, input: EpisodeInput, mode: 'fill' | 'authoritative'): Promise<EpisodeRow> {
  const { before, after } = await writeEpisode(store, { ...input, id }, mode === 'fill' ? 'fill' : 'upsert');
  const raw = bridgeOf(db);
  if (raw) await pg.registerEpisodeTx(raw, id, input, mode);
  if ((before?.duration_ms ?? null) === null && after.duration_ms !== null) await rebuildFromBridge(store, db, id);
  return after;
}

/**
 * Lane PD (additive): a show's newest episode title and cover as `touchShow` keeps them on the show META — what the
 * gift page and the wallet read with `SELECT show_title / image_url FROM episodes … ORDER BY published_at DESC NULLS LAST`.
 */
export async function showNewest(store: Store, feedUrl: string): Promise<{ title: string | null; image: string | null }> {
  const it = await get(store, 'main', K.show(feedUrl));
  return { title: str(it?.['newestTitle']), image: str(it?.['newestImage']) };
}
