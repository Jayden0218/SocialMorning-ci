// Share events.
import { viaStore } from '../../backend.ts';

// DynamoDB bodies: ddb/page.ts (db/backend.ts).
export const recentShareCountRows = viaStore<typeof import('./ddb/page.ts').recentShareCountRows>('st/page', 'recentShareCountRows');
export const insertShareEvent = viaStore<typeof import('./ddb/page.ts').insertShareEvent>('st/page', 'insertShareEvent');
