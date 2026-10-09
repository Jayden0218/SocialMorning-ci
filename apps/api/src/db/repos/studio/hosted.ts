// Shows and episodes created in the Studio, and the RSS feed built from them.
/**
 * M13 — shows created in the Studio, and their episodes (specs/013-m13-create-show).
 * A created show is ALSO a proven claim on its own feed address (plan R3), so the whole M11
 * Studio — roles, numbers, comments, settings — works on it without a second code path.
 */
import { autoCoverUrl, fnv1a64, isAutoCover } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';

/** Apple Podcasts' top-level categories (podcasters.apple.com/support/1691, read 2026-09-29). */
export const CATEGORIES = [
  'Arts', 'Business', 'Comedy', 'Education', 'Fiction', 'Government', 'History', 'Health & Fitness', 'Kids & Family',
  'Leisure', 'Music', 'News', 'Religion & Spirituality', 'Science', 'Society & Culture', 'Sports', 'Technology', 'True Crime', 'TV & Film',
] as const;

/** Storage ceiling across all created shows: Blob Hobby's 1 GB minus headroom (FR-008, guard G-Q1). */
export const DEFAULT_CEILING_BYTES = 900 * 1024 * 1024;

export type HostedShow = {
  id: string; ownerId: string; feedUrl: string; title: string; description: string; author: string;
  language: string; category: string; explicit: boolean; coverUrl: string | null; createdAt: string; updatedAt: string;
  /** M20 US6: the show's price level (1–5) for its paid episodes; null = sells nothing. */
  priceTier: number | null;
};
export type HostedEpisode = {
  id: string; guid: string; episodeId: string; title: string; description: string; audioUrl: string;
  audioBytes: number; audioType: string; durationMs: number | null; publishedAt: string;
  /** M14 US4: a draft is not in the feed; a published episode with a future time is scheduled. */
  status: 'draft' | 'published'; coverUrl: string | null; scheduled: boolean;
  /** M20 US6: sold with the show's price level; out of the public feed. `paidAllowed`: made after M20 (FR-024). */
  paid: boolean; paidAllowed: boolean;
  /** M24 US13: a paid episode's free preview, [startMs, endMs) — present only when set. */
  preview?: { startMs: number; endMs: number };
};

type ShowRow = { id: string; owner_id: string; feed_url: string; title: string; description: string; author: string; language: string; category: string; explicit: boolean; cover_url: string | null; created_at: Date | string; updated_at: Date | string; price_tier: number | null };
type EpRow = { id: string; guid: string; episode_id: string; title: string; description: string; audio_url: string; audio_bytes: string | number; audio_type: string; duration_ms: number | null; published_at: Date | string; status: 'draft' | 'published'; cover_url: string | null; paid: boolean; created_at: Date | string | null; preview_start_ms?: number | null; preview_end_ms?: number | null };

const iso = (d: Date | string) => new Date(d).toISOString();
const toShow = (r: ShowRow): HostedShow => ({
  id: r.id, ownerId: r.owner_id, feedUrl: r.feed_url, title: r.title, description: r.description, author: r.author,
  language: r.language, category: r.category, explicit: r.explicit, coverUrl: r.cover_url, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  priceTier: r.price_tier === null ? null : Number(r.price_tier),
});
const toEp = (r: EpRow): HostedEpisode => ({
  id: r.id, guid: r.guid, episodeId: r.episode_id, title: r.title, description: r.description, audioUrl: r.audio_url,
  audioBytes: Number(r.audio_bytes), audioType: r.audio_type, durationMs: r.duration_ms, publishedAt: iso(r.published_at),
  status: r.status, coverUrl: r.cover_url, scheduled: r.status === 'published' && new Date(r.published_at).getTime() > Date.now(),
  paid: r.paid === true, paidAllowed: r.created_at !== null,
  ...(r.preview_start_ms != null && r.preview_end_ms != null ? { preview: { startMs: Number(r.preview_start_ms), endMs: Number(r.preview_end_ms) } } : {}),
});
const SHOW_COLS = 'id, owner_id, feed_url, title, description, author, language, category, explicit, cover_url, created_at, updated_at, price_tier';
const EP_COLS = 'id, guid, episode_id, title, description, audio_url, audio_bytes, audio_type, duration_ms, published_at, status, cover_url, paid, created_at, preview_start_ms, preview_end_ms';

export type ShowIn = { title: string; description?: string; author?: string; language?: string; category?: string; explicit?: boolean; coverUrl?: string | null };

/**
 * Creates the show, its feed address and the owner's proven claim, in one transaction. No cover
 * given: the made-for-you tile (owner, 2026-10-04) is saved as the cover.
 */
export async function createHostedShow(db: Db, ownerId: string, publicBase: string, s: ShowIn): Promise<HostedShow> {
  return db.transaction(async (tx) => {
    const [{ id }] = (await tx.query<{ id: string }>('SELECT gen_random_uuid()::text AS id')) as [{ id: string }];
    const feedUrl = `${publicBase.replace(/\/$/, '')}/feeds/${id}.xml`;
    const [r] = await tx.query<ShowRow>(
      `INSERT INTO hosted_shows (id, owner_id, feed_url, title, description, author, language, category, explicit, cover_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${SHOW_COLS}`,
      [id, ownerId, feedUrl, s.title, s.description ?? '', s.author ?? '', s.language ?? 'zh', s.category ?? 'Society & Culture', s.explicit ?? false, s.coverUrl ?? drawnCover(publicBase, s.title)],
    );
    await tx.query(
      "INSERT INTO creator_claims (listener_id, feed_url, code, status, proven_at) VALUES ($1, $2, $3, 'proven', now())",
      [ownerId, feedUrl, `hosted:${id}`],
    );
    return toShow(r!);
  });
}

/** The API's own address, read back from a show's feed address (`<base>/feeds/<id>.xml`). */
const apiBase = (feedUrl: string) => feedUrl.replace(/\/feeds\/[^/]+$/, '');

/**
 * The made-for-you cover's address — only on an https server: a cover must be https (the column's
 * CHECK, and Apple's rule). A local http server (the Studio e2e run) keeps no cover, as before.
 */
const drawnCover = (base: string, title: string) => (base.startsWith('https://') ? autoCoverUrl(base, title) : null);

export async function hostedByFeed(db: Db, feedUrl: string): Promise<HostedShow | undefined> {
  const [r] = await db.query<ShowRow>(`SELECT ${SHOW_COLS} FROM hosted_shows WHERE feed_url = $1 AND deleted_at IS NULL`, [feedUrl]);
  return r ? toShow(r) : undefined;
}

export async function hostedById(db: Db, id: string): Promise<HostedShow | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const [r] = await db.query<ShowRow>(`SELECT ${SHOW_COLS} FROM hosted_shows WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return r ? toShow(r) : undefined;
}

export async function updateHostedShow(db: Db, id: string, s: Partial<ShowIn>): Promise<HostedShow> {
  const cur = await hostedById(db, id);
  if (!cur) throw new ApiError('not_found', 'No such show.');
  const n = { ...cur, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) } as HostedShow;
  // No cover of the owner's own (none sent, or the drawn one kept): the tile for the name as it
  // is now, so a rename redraws the letters. An uploaded cover is never replaced.
  if (!n.coverUrl || isAutoCover(n.coverUrl)) n.coverUrl = drawnCover(apiBase(cur.feedUrl), n.title);
  const [r] = await db.query<ShowRow>(
    `UPDATE hosted_shows SET title = $2, description = $3, author = $4, language = $5, category = $6, explicit = $7, cover_url = $8, updated_at = now()
      WHERE id = $1 RETURNING ${SHOW_COLS}`,
    [id, n.title, n.description, n.author, n.language, n.category, n.explicit, n.coverUrl],
  );
  // Keep the app's episode rows' show title in step, so lists and search read the new name.
  await db.query('UPDATE episodes SET show_title = $2, image_url = coalesce($3, image_url) WHERE feed_url = $1', [cur.feedUrl, n.title, n.coverUrl]);
  return toShow(r!);
}

export async function listHostedEpisodes(db: Db, showId: string, opts: { liveOnly?: boolean; freeOnly?: boolean; paidOnly?: boolean } = {}): Promise<HostedEpisode[]> {
  // M20 US6: the public feed takes free episodes only; the paid list takes paid ones only.
  const live = (opts.liveOnly ? "AND status = 'published' AND published_at <= now()" : '') + (opts.freeOnly ? ' AND NOT paid' : '') + (opts.paidOnly ? ' AND paid' : '');
  return (await db.query<EpRow>(`SELECT ${EP_COLS} FROM hosted_episodes WHERE show_id = $1 AND deleted_at IS NULL ${live} ORDER BY published_at DESC`, [showId])).map(toEp);
}

/**
 * M14 US4: an episode joins the app's episode table only once it is live (published and due),
 * so a draft or a scheduled one never shows in lists, search or numbers early. Run whenever the
 * feed or the Studio reads a show — there is no clock job, and none is needed.
 */
export async function promoteDue(db: Db, show: HostedShow): Promise<void> {
  await db.query(
    `INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, image_url, duration_ms, published_at)
     SELECT he.episode_id, $2, he.guid, he.title, $3, he.audio_url, coalesce(he.cover_url, $4), he.duration_ms, he.published_at
       FROM hosted_episodes he
      WHERE he.show_id = $1 AND he.deleted_at IS NULL AND he.status = 'published' AND he.published_at <= now() AND NOT he.paid
     ON CONFLICT (id) DO NOTHING`,
    [show.id, show.feedUrl, show.title, show.coverUrl],
  );
}

/** Every created show's audio, in bytes — what the ceiling is measured against. */
export async function storedBytes(db: Db): Promise<number> {
  const [r] = await db.query<{ n: string | number | null }>('SELECT coalesce(sum(audio_bytes), 0) AS n FROM hosted_episodes WHERE deleted_at IS NULL');
  return Number(r?.n ?? 0);
}

/** Publish: the episode joins the feed and the app's episode table (so Studio numbers and comments work at once). */
export async function publishEpisode(db: Db, show: HostedShow, by: string, e: {
  title: string; description: string; audioUrl: string; audioBytes: number; audioType: string; durationMs: number | null;
  status?: 'draft' | 'published'; publishAt?: string | null; coverUrl?: string | null;
}): Promise<HostedEpisode> {
  const ep = await db.transaction(async (tx) => {
    const [{ guid }] = (await tx.query<{ guid: string }>('SELECT gen_random_uuid()::text AS guid')) as [{ guid: string }];
    const episodeId = fnv1a64(show.feedUrl + '\u0001' + guid);
    const [r] = await tx.query<EpRow>(
      `INSERT INTO hosted_episodes (show_id, guid, episode_id, title, description, audio_url, audio_bytes, audio_type, duration_ms, created_by, status, published_at, cover_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, coalesce($12::timestamptz, now()), $13) RETURNING ${EP_COLS}`,
      [show.id, guid, episodeId, e.title, e.description, e.audioUrl, e.audioBytes, e.audioType, e.durationMs, by, e.status ?? 'published', e.publishAt ?? null, e.coverUrl ?? null],
    );
    return toEp(r!);
  });
  await promoteDue(db, show);
  return ep;
}

/** Edit a hosted episode: text, cover, state or time. A live episode's title follows into the app's row. */
export async function updateEpisode(db: Db, show: HostedShow, id: string, e: { title?: string; description?: string; status?: 'draft' | 'published'; publishAt?: string | null; coverUrl?: string | null }): Promise<HostedEpisode> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError('not_found', 'No such episode.');
  const [r] = await db.query<EpRow>(
    `UPDATE hosted_episodes SET title = coalesce($3, title), description = coalesce($4, description), status = coalesce($5, status),
            published_at = CASE WHEN $6::boolean THEN coalesce($7::timestamptz, now()) ELSE published_at END,
            cover_url = CASE WHEN $8::boolean THEN $9 ELSE cover_url END
      WHERE id = $1 AND show_id = $2 AND deleted_at IS NULL RETURNING ${EP_COLS}`,
    [id, show.id, e.title ?? null, e.description ?? null, e.status ?? null, 'publishAt' in e || e.status === 'published', e.publishAt ?? null, 'coverUrl' in e, e.coverUrl ?? null],
  );
  if (!r) throw new ApiError('not_found', 'No such episode.');
  await db.query('UPDATE episodes SET title = $2, image_url = coalesce($3, image_url) WHERE id = $1', [r.episode_id, r.title, r.cover_url]);
  await promoteDue(db, show);
  return toEp(r);
}

/** Unpublish: out of the feed; the caller removes the audio from storage (guard G-D1). */
export async function removeEpisode(db: Db, showId: string, id: string): Promise<HostedEpisode | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const [r] = await db.query<EpRow>(`UPDATE hosted_episodes SET deleted_at = now() WHERE id = $1 AND show_id = $2 AND deleted_at IS NULL RETURNING ${EP_COLS}`, [id, showId]);
  return r ? toEp(r) : undefined;
}

// ---- The public feed (FR-003): RSS 2.0 + iTunes tags, read back by the app's own parser in tests ----

const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rfc822 = (d: string) => new Date(d).toUTCString();
const secs = (ms: number | null) => (ms === null ? null : Math.round(ms / 1000));

export function feedXml(show: HostedShow, eps: HostedEpisode[]): string {
  const items = eps.map((e) => `    <item>
      <title>${x(e.title)}</title>
      <description>${x(e.description)}</description>
      <guid isPermaLink="false">${x(e.guid)}</guid>
      <pubDate>${rfc822(e.publishedAt)}</pubDate>
      <enclosure url="${x(e.audioUrl)}" length="${e.audioBytes}" type="${x(e.audioType)}"/>
${e.coverUrl ? `      <itunes:image href="${x(e.coverUrl)}"/>\n` : ''}${secs(e.durationMs) === null ? '' : `      <itunes:duration>${secs(e.durationMs)}</itunes:duration>\n`}    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${x(show.title)}</title>
    <link>${x(show.feedUrl)}</link>
    <description>${x(show.description)}</description>
    <language>${x(show.language)}</language>
    <itunes:author>${x(show.author)}</itunes:author>
    <itunes:category text="${x(show.category)}"/>
    <itunes:explicit>${show.explicit ? 'true' : 'false'}</itunes:explicit>
${show.coverUrl ? `    <itunes:image href="${x(show.coverUrl)}"/>\n    <image><url>${x(show.coverUrl)}</url><title>${x(show.title)}</title><link>${x(show.feedUrl)}</link></image>\n` : ''}${items}
  </channel>
</rss>
`;
}

/** M20 US6 (FR-024): the show's price level; only a Studio-created show can sell. null = sells nothing. */
export async function setPriceTier(db: Db, showId: string, tier: number | null): Promise<void> {
  await db.query('UPDATE hosted_shows SET price_tier = $2, updated_at = now() WHERE id = $1', [showId, tier]);
}

/**
 * M20 US6 (FR-024, G-M20-6): mark an episode paid or free. Only an episode made after M20 can be
 * paid (`created_at` set; the database refuses otherwise too), only when the show has a price, and
 * only while it is a draft or scheduled — a live episode already has its row (and maybe comments)
 * in the app's episode table, and its audio address is out. A paid episode never enters that table.
 */
export async function setEpisodePaid(db: Db, show: HostedShow, id: string, paid: boolean): Promise<HostedEpisode> {
  const [cur] = await db.query<EpRow>(`SELECT ${EP_COLS} FROM hosted_episodes WHERE id = $1 AND show_id = $2 AND deleted_at IS NULL`, [id, show.id]);
  if (!cur) throw new ApiError('not_found', 'No such episode.');
  if (paid && cur.created_at === null) throw new ApiError('validation', 'Episodes that were free before paid episodes existed stay free.', { fields: ['paid'], reason: 'was_free' });
  const live = cur.status === 'published' && new Date(cur.published_at).getTime() <= Date.now();
  if (paid && !cur.paid && live) throw new ApiError('validation', 'A published episode stays free. Make an episode paid while it is a draft or scheduled.', { fields: ['paid'], reason: 'live' });
  if (paid && show.priceTier === null) throw new ApiError('validation', 'Set the show\'s price first.', { fields: ['paid'], reason: 'no_price' });
  // M24 US13: a free episode has no preview — the whole of it is free.
  const [r] = await db.query<EpRow>(`UPDATE hosted_episodes SET paid = $3, preview_start_ms = CASE WHEN $3 THEN preview_start_ms END, preview_end_ms = CASE WHEN $3 THEN preview_end_ms END
    WHERE id = $1 AND show_id = $2 RETURNING ${EP_COLS}`, [id, show.id, paid]);
  if (!paid) await promoteDue(db, show);
  return toEp(r!);
}

/** M24 US13: the longest free preview — 10 minutes (the database checks it too). */
export const PREVIEW_MAX_MS = 600_000;

/**
 * M24 US13: set (or clear, `null`) a paid episode's free preview. Only a range — no audio is cut or
 * copied: the phone plays the one file and stops at `endMs` for a listener without the purchase.
 */
export async function setPreview(db: Db, show: HostedShow, id: string, range: { startMs: number; endMs: number } | null): Promise<HostedEpisode> {
  const [cur] = await db.query<EpRow>(`SELECT ${EP_COLS} FROM hosted_episodes WHERE id = $1 AND show_id = $2 AND deleted_at IS NULL`, [id, show.id]);
  if (!cur) throw new ApiError('not_found', 'No such episode.');
  if (range && !cur.paid) throw new ApiError('validation', 'Only a paid episode has a free preview.', { fields: ['startMs'], reason: 'not_paid' });
  if (range && (range.endMs <= range.startMs || range.endMs - range.startMs > PREVIEW_MAX_MS)) throw new ApiError('validation', 'A preview is up to 10 minutes long, and ends after it starts.', { fields: ['endMs'] });
  if (range && cur.duration_ms !== null && range.endMs > Number(cur.duration_ms)) throw new ApiError('validation', 'The preview ends after the episode does.', { fields: ['endMs'] });
  const [r] = await db.query<EpRow>(`UPDATE hosted_episodes SET preview_start_ms = $3, preview_end_ms = $4 WHERE id = $1 AND show_id = $2 RETURNING ${EP_COLS}`,
    [id, show.id, range?.startMs ?? null, range?.endMs ?? null]);
  return toEp(r!);
}

/** Mark a created show deleted (giving it back). */
export async function markHostedShowDeleted(db: Db, showId: string): Promise<void> {
  await db.query('UPDATE hosted_shows SET deleted_at = now() WHERE id = $1', [showId]);
}

/** Mark every live episode of a created show deleted. */
export async function markHostedEpisodesDeleted(db: Db, showId: string): Promise<void> {
  await db.query('UPDATE hosted_episodes SET deleted_at = now() WHERE show_id = $1 AND deleted_at IS NULL', [showId]);
}

/** One row when the created show still has a paid, live episode. */
export async function paidEpisodeRows(db: Db, showId: string): Promise<Record<string, unknown>[]> {
  return db.query('SELECT 1 FROM hosted_episodes WHERE show_id = $1 AND paid AND deleted_at IS NULL', [showId]);
}

/** Whether a created show exists and was deleted (the public feed answers 404 / 410). */
export async function hostedShowDeletedRows(db: Db, showId: string): Promise<{ deleted: boolean }[]> {
  return db.query<{ deleted: boolean }>('SELECT deleted_at IS NOT NULL AS deleted FROM hosted_shows WHERE id = $1', [showId]);
}

/** How many live shows the listener has created. */
export async function ownedShowCountRows(db: Db, ownerId: string): Promise<{ n: number }[]> {
  return db.query<{ n: number }>('SELECT count(*)::int AS n FROM hosted_shows WHERE owner_id = $1 AND deleted_at IS NULL', [ownerId]);
}
