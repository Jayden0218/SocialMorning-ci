// Lets a creator claim a show by placing a code in their live feed.
/**
 * M10b US8 — a creator claims the show they already publish (owner, 2026-09-27: "Claim your
 * feed"; nothing is uploaded — Principle V). SocialNet hands out a code; the creator puts it
 * anywhere in their feed (the channel description or a `<podcast:txt>` tag is the usual place);
 * verify re-reads the feed from the publisher and looks for it (guard G-C1: only the code in
 * the live feed proves ownership). One proven claim per feed.
 */
import { randomBytes } from 'node:crypto';
import { viaStore } from '../../backend.ts';

export type Claim = { id: string; feedUrl: string; code: string; status: 'pending' | 'proven' | 'revoked'; provenAt?: string };

export const newCode = (): string => `socialnet-verify-${randomBytes(6).toString('hex')}`;

/** M25 S7: a claim check reads at most this much of the feed. */
export const CLAIM_MAX_BYTES = 5 * 1024 * 1024;

// DynamoDB bodies: ddb/claims.ts, ddb/numbers.ts (db/backend.ts).
export const createClaim = viaStore<typeof import('./ddb/claims.ts').createClaim>('st/claims', 'createClaim');
export const myClaims = viaStore<typeof import('./ddb/claims.ts').myClaims>('st/claims', 'myClaims');
export const verifyClaim = viaStore<typeof import('./ddb/claims.ts').verifyClaim>('st/claims', 'verifyClaim');
export const isProvenOwner = viaStore<typeof import('./ddb/claims.ts').isProvenOwner>('st/claims', 'isProvenOwner');
export const showStats = viaStore<typeof import('./ddb/numbers.ts').showStats>('st/numbers', 'showStats');
export const hostsOfEpisode = viaStore<typeof import('./ddb/claims.ts').hostsOfEpisode>('st/claims', 'hostsOfEpisode');
