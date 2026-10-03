// Re-exports the server calls and types used for clips and profiles.
/** The M4 slice of the typed client lives on the one `ApiClient` (one `call`, one token). */
export type { Clip, ClipAuthor, EpisodeRecord, FeedItem, FeedResult, ListenedDay, Profile, ProfileStats } from '@/social/api';
export { createApi, ApiError } from '@/social/api';
