// Database queries for pushing the day's pick (M26: moved here from routes/internal.ts).
import { viaStore } from '../../backend.ts';

// Each function runs on DynamoDB (`ddb/` bodies; db/backend.ts).
export const pickEpisodeRows = viaStore<typeof import('./ddb/daily-pick.ts').pickEpisodeRows>('lb/daily-pick', 'pickEpisodeRows');
// M26 lane ST: LB-63 (hidden by its show) reads lane ST's hidden set (studio/ddb/page.ts).
export const hiddenEpisodeRows = viaStore<typeof import('../studio/ddb/page.ts').episodeHiddenRows>('st/page', 'episodeHiddenRows');
