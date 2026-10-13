// Finds the curator who shared an outside show, hiding suspended accounts.
/**
 * M15 T029 (D3) — a curator shares an external show: the app says "Shared by <name>", never
 * "Host" (FR-023). One curator per show. A suspended account is not shown (FR-025).
 */
import { viaStore } from '../../backend.ts';

export type Curator = { id: string; displayName: string };

// DynamoDB bodies: ddb/team.ts, `CFG#curators` (db/backend.ts).
export const curatorFor = viaStore<typeof import('./ddb/team.ts').curatorFor>('st/team', 'curatorFor');
export const listCurators = viaStore<typeof import('./ddb/team.ts').listCurators>('st/team', 'listCurators');
export const setCurator = viaStore<typeof import('./ddb/team.ts').setCurator>('st/team', 'setCurator');
