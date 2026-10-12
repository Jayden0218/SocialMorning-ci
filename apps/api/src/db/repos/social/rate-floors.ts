// Per-minute rate floors for follows, chat messages and clips, and the follow transaction.
import { viaStore } from '../../backend.ts';

// Bodies in ddb/rate-floors.ts (src/db/backend.ts).
export const recentChatRows = viaStore<typeof import('./ddb/rate-floors.ts').recentChatRows>('sc/rate-floors', 'recentChatRows');
export const recentClipRows = viaStore<typeof import('./ddb/rate-floors.ts').recentClipRows>('sc/rate-floors', 'recentClipRows');

// Bodies in graph-ddb/ (src/db/backend.ts).
export const recentFollowRows = viaStore<typeof import('./graph-ddb/index.ts').recentFollowRows>('sg/index', 'recentFollowRows');
export const followInTx = viaStore<typeof import('./graph-ddb/index.ts').followInTx>('sg/index', 'followInTx');
