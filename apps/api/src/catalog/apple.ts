/**
 * Apple's public podcast catalogue (M5 research R2) — the only catalogue source, no key.
 *   searchShows     search?media=podcast&entity=podcast&term=
 *   searchEpisodes  search?media=podcast&entity=podcastEpisode&term=
 *   topShows        us/rss/toppodcasts/limit=N/genre=<id>/json → Apple ids → lookup for feed URLs
 *   latestEpisodes  lookup?id=&entity=podcastEpisode&limit=n
 * Apple allows roughly 20 search calls a minute (M1's note): callers cache (repos/cache.ts).
 * Every function takes `fetch` so the tests inject recorded fixtures.
 */
export type ShowCard = { appleId?: number; feedUrl: string; title: string; author: string; imageUrl?: string; genres: string[] };
export type EpisodeCard = {
  feedUrl: string; guid: string; title: string; showTitle: string; imageUrl?: string; durationMs?: number; publishedAt?: string; enclosureUrl: string; appleShowId?: number;
};

export class CatalogRateLimited extends Error { constructor(readonly status: number) { super(`Apple answered ${status}`); } }
export class CatalogUnavailable extends Error { constructor(readonly status: number) { super(`Apple answered ${status}`); } }

const SEARCH = 'https://itunes.apple.com/search';
const LOOKUP = 'https://itunes.apple.com/lookup';
const CHART = (limit: number, genreId?: number) => `https://itunes.apple.com/us/rss/toppodcasts/limit=${limit}${genreId !== undefined ? `/genre=${genreId}` : ''}/json`;

type Fetch = typeof fetch;

type AppleShow = { collectionId?: number; collectionName?: string; artistName?: string; feedUrl?: string; artworkUrl600?: string; artworkUrl100?: string; genres?: string[]; wrapperType?: string; kind?: string };
type AppleEpisode = {
  wrapperType?: string; kind?: string; trackName?: string; collectionName?: string; collectionId?: number; episodeGuid?: string; episodeUrl?: string; feedUrl?: string;
  releaseDate?: string; trackTimeMillis?: number; artworkUrl600?: string; artworkUrl160?: string;
};

async function getJson<T>(f: Fetch, url: string): Promise<T> {
  const res = await f(url, { headers: { accept: 'application/json', 'user-agent': 'SocialMorning/0.1 (+https://socialmorning-api.vercel.app)' } });
  if (res.status === 429 || res.status === 403) throw new CatalogRateLimited(res.status);
  if (!res.ok) throw new CatalogUnavailable(res.status);
  return (await res.json()) as T;
}

export const toShowCard = (r: AppleShow): ShowCard | undefined => {
  if (!r.feedUrl) return undefined; // Apple lists shows it has no feed for (M1's note): not subscribable, dropped
  const imageUrl = r.artworkUrl600 ?? r.artworkUrl100;
  return { ...(r.collectionId !== undefined ? { appleId: r.collectionId } : {}), feedUrl: r.feedUrl, title: r.collectionName ?? '', author: r.artistName ?? '', ...(imageUrl ? { imageUrl } : {}), genres: r.genres ?? [] };
};

export const toEpisodeCard = (r: AppleEpisode): EpisodeCard | undefined => {
  if (!r.feedUrl || !r.episodeGuid || !r.episodeUrl) return undefined;
  const imageUrl = r.artworkUrl600 ?? r.artworkUrl160;
  return {
    feedUrl: r.feedUrl, guid: r.episodeGuid, title: r.trackName ?? '', showTitle: r.collectionName ?? '', enclosureUrl: r.episodeUrl,
    ...(imageUrl ? { imageUrl } : {}), ...(r.trackTimeMillis !== undefined ? { durationMs: r.trackTimeMillis } : {}),
    ...(r.releaseDate ? { publishedAt: r.releaseDate } : {}), ...(r.collectionId !== undefined ? { appleShowId: r.collectionId } : {}),
  };
};

export async function searchShows(f: Fetch, term: string, limit = 20): Promise<ShowCard[]> {
  const q = term.trim();
  if (q === '') return [];
  const body = await getJson<{ results?: AppleShow[] }>(f, `${SEARCH}?media=podcast&entity=podcast&term=${encodeURIComponent(q)}&limit=${limit}`);
  return (body.results ?? []).map(toShowCard).filter((s): s is ShowCard => s !== undefined);
}

export async function searchEpisodes(f: Fetch, term: string, limit = 20): Promise<EpisodeCard[]> {
  const q = term.trim();
  if (q === '') return [];
  const body = await getJson<{ results?: AppleEpisode[] }>(f, `${SEARCH}?media=podcast&entity=podcastEpisode&term=${encodeURIComponent(q)}&limit=${limit}`);
  return (body.results ?? []).map(toEpisodeCard).filter((e): e is EpisodeCard => e !== undefined);
}

/** The chart gives Apple ids; one lookup call turns them into shows with feed URLs. */
export async function topShows(f: Fetch, genreId: number | undefined, limit = 10): Promise<ShowCard[]> {
  const chart = await getJson<{ feed?: { entry?: { id?: { attributes?: { 'im:id'?: string } } }[] | { id?: { attributes?: { 'im:id'?: string } } } } }>(f, CHART(limit, genreId));
  const entries = chart.feed?.entry === undefined ? [] : Array.isArray(chart.feed.entry) ? chart.feed.entry : [chart.feed.entry];
  const ids = entries.map((e) => e.id?.attributes?.['im:id']).filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id));
  if (ids.length === 0) return [];
  const body = await getJson<{ results?: AppleShow[] }>(f, `${LOOKUP}?id=${ids.join(',')}&entity=podcast`);
  const byId = new Map((body.results ?? []).map((r) => [r.collectionId, r] as const));
  return ids.map((id) => byId.get(Number(id))).map((r) => (r ? toShowCard(r) : undefined)).filter((s): s is ShowCard => s !== undefined);
}

export async function latestEpisodes(f: Fetch, appleShowId: number, n = 1): Promise<EpisodeCard[]> {
  const body = await getJson<{ results?: AppleEpisode[] }>(f, `${LOOKUP}?id=${appleShowId}&entity=podcastEpisode&limit=${n}`);
  return (body.results ?? []).filter((r) => r.wrapperType === 'podcastEpisode').map(toEpisodeCard).filter((e): e is EpisodeCard => e !== undefined);
}
