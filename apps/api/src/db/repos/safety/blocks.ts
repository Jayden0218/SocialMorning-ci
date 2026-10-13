// Block and unblock listeners; a block also removes follows both ways.
/** M6 blocks (FR-006–FR-010): one-way visibility, two-way interaction; a block removes follows both ways. */
import { viaStore } from '../../backend.ts';

// DynamoDB bodies: ddb/blocks.ts (db/backend.ts).
export const block = viaStore<typeof import('./ddb/blocks.ts').block>('sf/blocks', 'block');
export const unblock = viaStore<typeof import('./ddb/blocks.ts').unblock>('sf/blocks', 'unblock');
export const blockedIdsFor = viaStore<typeof import('./ddb/blocks.ts').blockedIdsFor>('sf/blocks', 'blockedIdsFor');
export const listBlocks = viaStore<typeof import('./ddb/blocks.ts').listBlocks>('sf/blocks', 'listBlocks');
export const isBlockedBy = viaStore<typeof import('./ddb/blocks.ts').isBlockedBy>('sf/blocks', 'isBlockedBy');
export const safetyStamp = viaStore<typeof import('./ddb/blocks.ts').safetyStamp>('sf/blocks', 'safetyStamp');
