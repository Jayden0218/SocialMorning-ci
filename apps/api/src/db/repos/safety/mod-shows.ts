// The /mod page's Studio shows list and take-down.
import { viaStore } from '../../backend.ts';

export type CreatedShowRow = { id: string; title: string; feed_url: string; owner: string | null; created_at: Date | string; updated_at: Date | string; eps: number; hidden: boolean };

// DynamoDB bodies: ddb/mod-shows.ts; markHostedShowDeleted is in studio/ddb/hosted.ts.
export const markHostedShowDeleted = viaStore<typeof import('../studio/ddb/hosted.ts').markHostedShowDeletedRows>('st/hosted', 'markHostedShowDeletedRows');
export const studioCreatedShows = viaStore<typeof import('./ddb/mod-shows.ts').studioCreatedShows>('sf/mod-shows', 'studioCreatedShows');
export const finishTakedown = viaStore<typeof import('./ddb/mod-shows.ts').finishTakedown>('sf/mod-shows', 'finishTakedown');
