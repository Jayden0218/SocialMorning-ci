// Database queries for search: Studio-created shows and people (M26 F0: moved here from routes/discover/search.ts).
import { viaStore } from '../../backend.ts';

export type CreatedShowRow = { feed_url: string; title: string; author: string; cover_url: string | null; category: string };

// Each runs its DynamoDB body (ddb/search-local.ts) on the Store the Db carries (db/backend.ts).
export const createdShowsMatching = viaStore<typeof import('./ddb/search-local.ts').createdShowsMatching>('dv/search-local', 'createdShowsMatching');
export const peopleMatching = viaStore<typeof import('./ddb/search-local.ts').peopleMatching>('dv/search-local', 'peopleMatching');
