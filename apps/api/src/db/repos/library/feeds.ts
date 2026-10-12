// Feed moves: every live subscription follows a publisher's new feed address, in one transaction.
import { viaStore } from '../../backend.ts';

// Each function runs on DynamoDB (`ddb/` bodies; db/backend.ts).
export const moveSubscriptionsToFeed = viaStore<typeof import('./ddb/feeds.ts').moveSubscriptionsToFeed>('lb/feeds', 'moveSubscriptionsToFeed');
