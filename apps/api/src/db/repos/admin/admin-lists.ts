// Hiding a show or an episode everywhere from Admin.
import { viaStore } from '../../backend.ts';

export type HiddenShowRow = { feed_url: string; reason: string | null; hidden_at: Date | string; title: string | null; by_report: boolean };
export type HiddenEpRow = { feed_url: string; guid: string; reason: string | null; hidden_at: Date | string; title: string | null; show_title: string | null; hidden_by: string | null };

// Hidden episodes live in studio/hidden-episodes.ts.
export { hiddenEpisodeRows, hiddenEpisodeReason, hideEpisodeWithReason, unhideEpisode } from '../studio/hidden-episodes.ts';

// Hidden feeds: DynamoDB bodies in safety/ddb/admin-lists.ts.
export const hiddenShowRows = viaStore<typeof import('../safety/ddb/admin-lists.ts').hiddenShowRows>('sf/admin-lists', 'hiddenShowRows');
export const hiddenFeedRow = viaStore<typeof import('../safety/ddb/admin-lists.ts').hiddenFeedRow>('sf/admin-lists', 'hiddenFeedRow');
export const setHiddenFeedReason = viaStore<typeof import('../safety/ddb/admin-lists.ts').setHiddenFeedReason>('sf/admin-lists', 'setHiddenFeedReason');
