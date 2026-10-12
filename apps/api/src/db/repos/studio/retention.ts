// Retention: the share of an episode's listeners still listening at each minute.
/**
 * M19 US12 (FR-070). From the listened ranges every phone sends (M4): for each minute, the
 * listeners whose heard ranges cover that minute's middle, divided by everyone who heard any of
 * it. A count of listeners, never who; private listening counts in totals like everywhere else.
 */
import { viaStore } from '../../backend.ts';

export const RETENTION_MAX_MINUTES = 600;

// DynamoDB bodies: ddb/ (db/backend.ts).
export const retention = viaStore<typeof import('./ddb/numbers.ts').retention>('st/numbers', 'retention');
