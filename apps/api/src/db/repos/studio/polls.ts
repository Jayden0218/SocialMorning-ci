// Show polls: create, vote once per listener, close, and count votes.
/**
 * M11 US5 — polls on a show (FR-022, FR-023). One vote per listener is the table's primary key
 * (guard G-P1); a second vote changes nothing, and a closed or expired poll takes none.
 * M24 US14: a poll may be multiple choice (`multi`): one vote row per chosen option, so the key is
 * now (poll_id, listener_id, option_idx); a single-choice vote replaces the listener's rows in one
 * transaction, which keeps it to one. The creator may delete a poll (its votes go with it).
 */
import { viaStore } from '../../backend.ts';

export type Poll = {
  id: string; question: string; episodeId: string | null; endsAt: string; closedAt: string | null; open: boolean;
  total: number; options: { idx: number; label: string; votes: number }[]; myVote?: number | null;
  /** M24 US14: several options may be chosen; `voters` = how many listeners voted (total counts choices). */
  multi: boolean; voters: number; myVotes?: number[];
};

export const MAX_DAYS = 30;

// DynamoDB bodies: ddb/announce.ts (db/backend.ts).
export const listPolls = viaStore<typeof import('./ddb/announce.ts').listPolls>('st/announce', 'listPolls');
export const pollsForApp = viaStore<typeof import('./ddb/announce.ts').pollsForApp>('st/announce', 'pollsForApp');
export const createPoll = viaStore<typeof import('./ddb/announce.ts').createPoll>('st/announce', 'createPoll');
export const closePoll = viaStore<typeof import('./ddb/announce.ts').closePoll>('st/announce', 'closePoll');
export const deletePoll = viaStore<typeof import('./ddb/announce.ts').deletePoll>('st/announce', 'deletePoll');
export const vote = viaStore<typeof import('./ddb/announce.ts').vote>('st/announce', 'vote');
