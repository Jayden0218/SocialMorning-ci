// Lists tips a show received, leaving out refunded purchases.
/**
 * M11 US7 — tips a show received (FR-027). Tips are sold only through the App Store and Google
 * Play and verified by the server (constitution V); a refunded purchase is not counted (G-T1).
 * There is no withdrawal: payouts are not built (payments are owner-blocked, M10b).
 */
import { viaStore } from '../../backend.ts';

// DynamoDB bodies: ddb/ (db/backend.ts).
export const tipsFor = viaStore<typeof import('./ddb/numbers.ts').tipsFor>('st/numbers', 'tipsFor');
