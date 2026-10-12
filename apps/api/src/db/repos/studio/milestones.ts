// The subscriber-milestone message: sent once to the listener who became a show's 100th, 1 000th or 10 000th subscriber.
/**
 * M24 US12 (specs/025-m24-gaps-and-look). The host saves a short message in Studio › Settings ›
 * Contacts (the show's `milestoneMessage` override). The hourly sweep finds each show with a message
 * whose live subscriber count has reached a milestone not yet sent, picks the listener who is the
 * Nth live subscriber (oldest first), and records one sent item per (show, milestone), written
 * only if absent, so it is once per show per milestone, even if two runs overlap.
 *
 * Only a crossing in the last 7 days is sent: a show that already had 5 000 subscribers when the
 * message was first saved does not write to its 100th subscriber from two years ago.
 * The listener reads it in Notifications › From hosts (`hostNotices` unions these rows).
 */
import { viaStore } from '../../backend.ts';

export const MILESTONES = [100, 1000, 10000] as const;
export const RECENT_DAYS = 7;

/** The message as sent: `{n}` in the host's text becomes the milestone ("1,000"). */
export function milestoneText(template: string, milestone: number): string {
  return template.replace(/\{n\}/g, milestone.toLocaleString('en-US')).slice(0, 200);
}

// DynamoDB bodies: ddb/ (db/backend.ts).
export const sendMilestones = viaStore<typeof import('./ddb/announce.ts').sendMilestones>('st/announce', 'sendMilestones');
