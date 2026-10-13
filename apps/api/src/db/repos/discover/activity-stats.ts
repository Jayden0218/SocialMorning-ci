// Counts listens, comments, clips and reactions per episode, never naming listeners.
/**
 * "Listened and talked about" inputs (M5 research R4): per episode over a window,
 * AGGREGATES ONLY — listeners are counted, never listed (guard G6). `hidden = false`
 * on the listened rows is what keeps private listeners out (guard G2): M4 wrote the
 * flag from the switch at write time.
 */
import { viaStore } from '../../backend.ts';

// Runs its DynamoDB body (ddb/activity-stats.ts) on the Store the Db carries (db/backend.ts).
export const talkedAbout = viaStore<typeof import('./ddb/activity-stats.ts').talkedAbout>('dv/activity-stats', 'talkedAbout');
