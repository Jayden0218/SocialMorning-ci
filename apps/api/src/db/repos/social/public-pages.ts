// Reads for the public pages and share routes: the share card's fallback artwork, an episode check, the show card, the cached feed.
import { viaStore } from '../../backend.ts';

export type ShowCardInfo = { title: string | null; description: string | null; cover: string | null };

// Claims, overrides and Studio-made shows are read from studio/ddb/page.ts.
export const provenFeedRows = viaStore<typeof import('../studio/ddb/page.ts').provenFeedRows>('st/page', 'provenFeedRows');
export const showCardInfoRows = viaStore<typeof import('../studio/ddb/page.ts').showCardInfoRows>('st/page', 'showCardInfoRows');
// The catalogue reads are in library/ddb/public-pages.ts.
export const showImageRows = viaStore<typeof import('../library/ddb/public-pages.ts').showImageRows>('lb/public-pages', 'showImageRows');
export const episodeIdRows = viaStore<typeof import('../library/ddb/public-pages.ts').episodeIdRows>('lb/public-pages', 'episodeIdRows');
export const showCardEpisodeRows = viaStore<typeof import('../library/ddb/public-pages.ts').showCardEpisodeRows>('lb/public-pages', 'showCardEpisodeRows');
export const cachedFeedRows = viaStore<typeof import('../library/ddb/public-pages.ts').cachedFeedRows>('lb/public-pages', 'cachedFeedRows');
