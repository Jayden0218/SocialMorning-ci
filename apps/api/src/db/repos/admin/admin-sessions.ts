// Sessions for Admin's "act as".
import { viaStore } from '../../backend.ts';

// DynamoDB body: safety/ddb/admin-sessions.ts (act-as pointers).
export const actingSessionRows = viaStore<typeof import('../safety/ddb/admin-sessions.ts').actingSessionRows>('sf/admin-sessions', 'actingSessionRows');
