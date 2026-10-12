// Demographics: age range, gender and country totals of a show's subscribers, never under 10.
/**
 * M19 US12 (FR-073). Only listeners who chose to give an age range or gender are counted for
 * those; country comes from the public sign-in country (M10b). Any group under MIN_GROUP is
 * reported as '<10' so no listener can be picked out — a creator never learns who.
 */
import { viaStore } from '../../backend.ts';

export const MIN_GROUP = 10;

export type Bucket = { key: string; count: number | '<10' };
export type Demographics = { total: number; age: Bucket[]; gender: Bucket[]; countries: Bucket[] };

// DynamoDB bodies: ddb/ (db/backend.ts).
export const demographics = viaStore<typeof import('./ddb/numbers.ts').demographics>('st/numbers', 'demographics');
