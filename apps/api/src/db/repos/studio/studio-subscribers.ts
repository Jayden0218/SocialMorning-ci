// A show's subscribers: totals, trend, listening hours, names, and muted listeners.
/**
 * M11 US4 — who subscribes, how that changes, and who may not comment (FR-017..FR-019).
 *
 * Names are shown by the owner's decision (spec Q1 = B) after the privacy page says so (FR-031).
 * Listening hours are a PROXY: the time each listen was recorded (research R3), labelled as such.
 */
import { viaStore } from '../../backend.ts';

// DynamoDB bodies: ddb/numbers.ts, ddb/team.ts (db/backend.ts).
export const subscriberStats = viaStore<typeof import('./ddb/numbers.ts').subscriberStats>('st/numbers', 'subscriberStats');
export const subscriberList = viaStore<typeof import('./ddb/numbers.ts').subscriberList>('st/numbers', 'subscriberList');
export const mute = viaStore<typeof import('./ddb/team.ts').mute>('st/team', 'mute');
export const unmute = viaStore<typeof import('./ddb/team.ts').unmute>('st/team', 'unmute');
export const listMutes = viaStore<typeof import('./ddb/team.ts').listMutes>('st/team', 'listMutes');
export const isMutedOn = viaStore<typeof import('./ddb/team.ts').isMutedOn>('st/team', 'isMutedOn');
