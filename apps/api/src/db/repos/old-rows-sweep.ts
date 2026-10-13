// The hourly sweep's deletes of old rows (M26: moved here from routes/internal.ts).
import { viaStore } from '../backend.ts';

/** M23 US3 (FR-006): how long the hourly sweep keeps each kind of leftover row (re-exported by routes/internal.ts). */
export const CACHE_KEEP_DAYS = 7;
export const PUSH_SENT_KEEP_DAYS = 30;
export const REC_EVENTS_KEEP_DAYS = 90;

// Each function runs on DynamoDB (`ddb/` bodies; db/backend.ts).
export const sweepOldCache = viaStore<typeof import('./library/ddb/old-rows-sweep.ts').sweepOldCache>('lb/old-rows-sweep', 'sweepOldCache');
export const sweepOldRecEvents = viaStore<typeof import('./library/ddb/old-rows-sweep.ts').sweepOldRecEvents>('lb/old-rows-sweep', 'sweepOldRecEvents');
// M26 lane SF: the 400-day sweep of app-use days (DynamoDB: safety/ddb/old-rows-sweep.ts).
export const sweepDailyActive = viaStore<typeof import('./safety/ddb/old-rows-sweep.ts').sweepDailyActive>('sf/old-rows-sweep', 'sweepDailyActive');
// M26 lane LE: on DynamoDB the push-sent items expire by TTL (account/ddb/push-sweep.ts).
export const sweepOldPushSent = viaStore<typeof import('./account/ddb/push-sweep.ts').sweepOldPushSent>('ac/push-sweep', 'sweepOldPushSent');
