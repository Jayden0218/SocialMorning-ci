// Reads the admin catalogue tables: pick days and items, curated issues and their items, collections and their items.
import { viaStore } from '../../backend.ts';

// M26 lane DV: lane DV's tables (picks, issues, collections) — on DynamoDB read from their documents (discover/ddb/catalog.ts).
export const listPickDays = viaStore<typeof import('../discover/ddb/catalog.ts').listPickDays>('dv/catalog', 'listPickDays');
export const listPickItems = viaStore<typeof import('../discover/ddb/catalog.ts').listPickItems>('dv/catalog', 'listPickItems');
export const listCuratedIssues = viaStore<typeof import('../discover/ddb/catalog.ts').listCuratedIssues>('dv/catalog', 'listCuratedIssues');
export const listCuratedIssueItems = viaStore<typeof import('../discover/ddb/catalog.ts').listCuratedIssueItems>('dv/catalog', 'listCuratedIssueItems');
export const listCollectionRows = viaStore<typeof import('../discover/ddb/catalog.ts').listCollectionRows>('dv/catalog', 'listCollectionRows');
export const listCollectionItemRows = viaStore<typeof import('../discover/ddb/catalog.ts').listCollectionItemRows>('dv/catalog', 'listCollectionItemRows');
