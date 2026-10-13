// Mutes: hide a listener's comments, voice posts and likes from me only; they are never told.
/**
 * M21 US6 (G-M21-6). A mute is one-way and private: `listener_mutes(muter_id, muted_id)`. Only the
 * muter's reads change (comments and replies, voice posts, the likes timeline); the muted listener
 * sees nothing different and no notice is sent. Self-mutes are refused (the table CHECKs it too).
 */
import { viaStore } from '../../backend.ts';

// Bodies in graph-ddb/ (src/db/backend.ts).
export const mute = viaStore<typeof import('./graph-ddb/index.ts').mute>('sg/index', 'mute');
export const unmute = viaStore<typeof import('./graph-ddb/index.ts').unmute>('sg/index', 'unmute');
export const mutedIdsFor = viaStore<typeof import('./graph-ddb/index.ts').mutedIdsFor>('sg/index', 'mutedIdsFor');
export const listMutes = viaStore<typeof import('./graph-ddb/index.ts').listMutes>('sg/index', 'listMutes');
export const muteStamp = viaStore<typeof import('./graph-ddb/index.ts').muteStamp>('sg/index', 'muteStamp');
