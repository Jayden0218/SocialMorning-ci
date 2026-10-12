// Database queries for "Can't find it? Tell us" search requests (M26 F0: moved here from routes/discover/search-requests.ts).
import { viaStore } from '../../backend.ts';

// Each runs its DynamoDB body (ddb/search-requests.ts) on the Store the Db carries (db/backend.ts).
export const insertSearchRequest = viaStore<typeof import('./ddb/search-requests.ts').insertSearchRequest>('dv/search-requests', 'insertSearchRequest');
export const searchRequestRows = viaStore<typeof import('./ddb/search-requests.ts').searchRequestRows>('dv/search-requests', 'searchRequestRows');
