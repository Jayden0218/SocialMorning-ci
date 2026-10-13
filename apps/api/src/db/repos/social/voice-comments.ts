// Voice comments: their recording limits, and deleting the audio of removed comments.
/**
 * M19 US6 (FR-044–FR-046, constitution v3.1.0). A comment may be a voice recording of at most 60 s,
 * in the voice store, kept like a text comment. When the author deletes it the route removes the
 * file at once; when moderation removes it, the internal cycle's sweep deletes the file and clears
 * the columns — removed means gone from storage, not merely hidden.
 */
import { viaStore } from '../../backend.ts';

export const VOICE_COMMENT_SWEEP_BATCH = 100;

// Bodies in ddb/voice-comments.ts (src/db/backend.ts).
export const sweepRemovedVoice = viaStore<typeof import('./ddb/voice-comments.ts').sweepRemovedVoice>('sc/voice-comments', 'sweepRemovedVoice');
