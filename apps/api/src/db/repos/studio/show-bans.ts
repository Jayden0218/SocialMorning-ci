// Studio show bans.
import { viaStore } from '../../backend.ts';

export type BanRow = { id: string; display_name: string; reason: string | null; created_at: Date | string };

// DynamoDB bodies: ddb/team.ts (db/backend.ts).
export const banRows = viaStore<typeof import('./ddb/team.ts').banRows>('st/team', 'banRows');
export const teamRows = viaStore<typeof import('./ddb/team.ts').teamRows>('st/team', 'teamRows');
export const listenerExistsRows = viaStore<typeof import('./ddb/team.ts').listenerExistsRows>('st/team', 'listenerExistsRows');
export const upsertShowMute = viaStore<typeof import('./ddb/team.ts').upsertShowMute>('st/team', 'upsertShowMute');
export const deleteShowMute = viaStore<typeof import('./ddb/team.ts').deleteShowMute>('st/team', 'deleteShowMute');
