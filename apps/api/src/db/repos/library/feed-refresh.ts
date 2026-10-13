// Database queries for the hourly feed refresh (M26: moved here from routes/internal.ts).
import { viaStore } from '../../backend.ts';

/** Subscribed feeds refreshed per `feeds` call (re-exported by routes/internal.ts). */
export const FEEDS_PER_CALL = 25;

// Each function runs on DynamoDB (`ddb/` bodies; db/backend.ts).
export const subscribedFeedPage = viaStore<typeof import('./ddb/feed-refresh.ts').subscribedFeedPage>('lb/feed-refresh', 'subscribedFeedPage');
export const knownGuidRows = viaStore<typeof import('./ddb/feed-refresh.ts').knownGuidRows>('lb/feed-refresh', 'knownGuidRows');
