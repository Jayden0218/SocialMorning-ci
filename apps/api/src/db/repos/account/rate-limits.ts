// Database queries for fixed-window rate limits (M26 F0-01: moved here from auth/rate.ts).
import { viaStore } from '../../backend.ts';

/** Adds 1 to `key` in the window starting at `windowStart`; returns the new count. */
export const bumpRateCounter = viaStore<typeof import('./ddb/index.ts').bumpRateCounter>('ac/index', 'bumpRateCounter');

/** Deletes windows that started before `before`. */
export const deleteRateCountersBefore = viaStore<typeof import('./ddb/index.ts').deleteRateCountersBefore>('ac/index', 'deleteRateCountersBefore');
