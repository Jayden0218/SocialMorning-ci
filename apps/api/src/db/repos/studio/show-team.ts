// A show's owner and helpers: add helpers by email, remove, give the show back.
/**
 * M11 US6 — the owner's helpers (operators) and giving the show back (FR-025, FR-026).
 * There is no handle in this product, so an operator is added by their account's email.
 */
import { viaStore } from '../../backend.ts';

export const MAX_OPERATORS = 10;

// DynamoDB bodies: ddb/team.ts (db/backend.ts).
export const team = viaStore<typeof import('./ddb/team.ts').team>('st/team', 'team');
export const addOperator = viaStore<typeof import('./ddb/team.ts').addOperator>('st/team', 'addOperator');
export const removeOperator = viaStore<typeof import('./ddb/team.ts').removeOperator>('st/team', 'removeOperator');
export const release = viaStore<typeof import('./ddb/team.ts').release>('st/team', 'release');
