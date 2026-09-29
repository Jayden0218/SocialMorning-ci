/**
 * M13 — shows created in the Studio, and their episodes (specs/013-m13-create-show).
 * A created show is ALSO a proven claim on its own feed address (plan R3), so the whole M11
 * Studio — roles, numbers, comments, settings — works on it without a second code path.
 */
import { fnv1a64 } from '@socialmorning/social-core';
import type { Db } from '../db.ts';
import { ApiError } from '../../errors.ts';

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
};
export type HostedEpisode = {
  id: string; guid: string; episodeId: string; title: string; description: string; audioUrl: string;
  audioBytes: number; audioType: string; durationMs: number | null; publishedAt: string;
};

type ShowRow = { id: string; owner_id: string; feed_url: string; title: string; description: string; author: string; language: string; category: string; explicit: boolean; cover_url: string | null; created_at: Date | string; updated_at: Date | string };
type EpRow = { id: string; guid: string; episode_id: string; title: string; description: string; audio_url: string; audio_bytes: string | number; audio_type: string; duration_ms: number | null; published_at: Date | string };

const iso = (d: Date | string) => new Date(d).toISOString();
const toShow = (r: ShowRow): HostedShow => ({
  id: r.id, ownerId: r.owner_id, feedUrl: r.feed_url, title: r.title, description: r.description, author: r.author,
  language: r.language, category: r.category, explicit: r.explicit, coverUrl: r.cover_url, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
});
const toEp = (r: EpRow): HostedEpisode => ({
  id: r.id, guid: r.guid, episodeId: r.episode_id, title: r.title, description: r.description, audioUrl: r.audio_url,
  audioBytes: Number(r.audio_bytes), audioType: r.audio_type, durationMs: r.duration_ms, publishedAt: iso(r.published_at),
});
const SHOW_COLS = 'id, owner_id, feed_url, title, description, author, language, category, explicit, cover_url, created_at, updated_at';
const EP_COLS = 'id, guid, episode_id, title, description, audio_url, audio_bytes, audio_type, duration_ms, published_at';

export type ShowIn = { title: string; description?: string; author?: string; language?: string; category?: string; explicit?: boolean; coverUrl?: string | null };

/** Creates the show, its feed address and the owner's proven claim, in one transaction. */
export async function createHostedShow(db: Db, ownerId: string, publicBase: string, s: ShowIn): Promise<HostedShow> {
  return db.transaction(async (tx) => {
    const [{ id }] = (await tx.query<{ id: string }>('SELECT gen_random_uuid()::text AS id')) as [{ id: string }];
    const feedUrl = `${publicBase.replace(/\/$/, '')}/feeds/${id}.xml`;
    const [r] = await tx.query<ShowRow>(
      `INSERT INTO hosted_shows (id, owner_id, feed_url, title, description, author, language, category, explicit, cover_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${SHOW_COLS}`,
      [id, ownerId, feedUrl, s.title, s.description ?? '', s.author ?? '', s.language ?? 'zh', s.category ?? 'Society & Culture', s.explicit ?? false, s.coverUrl ?? null],
    );
    await tx.query(
      "INSERT INTO creator_claims (listener_id, feed_url, code, status, proven_at) VALUES ($1, $2, $3, 'proven', now())",
      [ownerId, feedUrl, `hosted:${id}`],
    );
    return toShow(r!);
  });
}

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
  const [r] = await db.query<ShowRow>(
    `UPDATE hosted_shows SET title = $2, description = $3, author = $4, language = $5, category = $6, explicit = $7, cover_url = $8, updated_at = now()
      WHERE id = $1 RETURNING ${SHOW_COLS}`,
    [id, n.title, n.description, n.author, n.language, n.category, n.explicit, n.coverUrl],
  );
  // Keep the app's episode rows' show title in step, so lists and search read the new name.
  await db.query('UPDATE episodes SET show_title = $2, image_url = coalesce($3, image_url) WHERE feed_url = $1', [cur.feedUrl, n.title, n.coverUrl]);
  return toShow(r!);
}

export async function listHostedEpisodes(db: Db, showId: string): Promise<HostedEpisode[]> {
  return (await db.query<EpRow>(`SELECT ${EP_COLS} FROM hosted_episodes WHERE show_id = $1 AND deleted_at IS NULL ORDER BY published_at DESC`, [showId])).map(toEp);
}

/** Every created show's audio, in bytes — what the ceiling is measured against. */
export async function storedBytes(db: Db): Promise<number> {
  const [r] = await db.query<{ n: string | number | null }>('SELECT coalesce(sum(audio_bytes), 0) AS n FROM hosted_episodes WHERE deleted_at IS NULL');
  return Number(r?.n ?? 0);
}

/** Publish: the episode joins the feed and the app's episode table (so Studio numbers and comments work at once). */
export async function publishEpisode(db: Db, show: HostedShow, by: string, e: { title: string; description: string; audioUrl: string; audioBytes: number; audioType: string; durationMs: number | null }): Promise<HostedEpisode> {
  return db.transaction(async (tx) => {
    const [{ guid }] = (await tx.query<{ guid: string }>('SELECT gen_random_uuid()::text AS guid')) as [{ guid: string }];
    const episodeId = fnv1a64(show.feedUrl + '\u0001' + guid);
    const [r] = await tx.query<EpRow>(
      `INSERT INTO hosted_episodes (show_id, guid, episode_id, title, description, audio_url, audio_bytes, audio_type, duration_ms, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${EP_COLS}`,
      [show.id, guid, episodeId, e.title, e.description, e.audioUrl, e.audioBytes, e.audioType, e.durationMs, by],
    );
    await tx.query(
      `INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, image_url, duration_ms, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING`,
      [episodeId, show.feedUrl, guid, e.title, show.title, e.audioUrl, show.coverUrl, e.durationMs, r!.published_at],
    );
    return toEp(r!);
  });
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
${secs(e.durationMs) === null ? '' : `      <itunes:duration>${secs(e.durationMs)}</itunes:duration>\n`}    </item>`).join('\n');
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
