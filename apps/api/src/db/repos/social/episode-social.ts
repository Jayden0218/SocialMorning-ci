// The episode social poll's reads: the change stamp, the heat rows and the viewer's reaction buckets.
import { viaStore } from '../../backend.ts';

export type SocialStampRow = { comments_v: string | null; episode_v: string; heat_v: string | null };

// Bodies in ddb/episode-social.ts (src/db/backend.ts).
export const socialStampRows = viaStore<typeof import('./ddb/episode-social.ts').socialStampRows>('sc/episode-social', 'socialStampRows');
export const episodeHeatRows = viaStore<typeof import('./ddb/episode-social.ts').episodeHeatRows>('sc/episode-social', 'episodeHeatRows');
export const myReactionBucketRows = viaStore<typeof import('./ddb/episode-social.ts').myReactionBucketRows>('sc/episode-social', 'myReactionBucketRows');
