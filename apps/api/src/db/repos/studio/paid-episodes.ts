// Paid shows and their episodes.
import { viaStore } from '../../backend.ts';

export type PaidPreviewAudioRow = { audio_url: string; audio_bytes: string | number; audio_type: string; duration_ms: number | null; preview_start_ms: number | null; preview_end_ms: number | null };

// DynamoDB bodies: ddb/hosted.ts (db/backend.ts).
export const showEntitlementRows = viaStore<typeof import('./ddb/hosted.ts').showEntitlementRows>('st/hosted', 'showEntitlementRows');
export const paidEpisodeFeedRows = viaStore<typeof import('./ddb/hosted.ts').paidEpisodeFeedRows>('st/hosted', 'paidEpisodeFeedRows');
export const paidEpisodePreviewRows = viaStore<typeof import('./ddb/hosted.ts').paidEpisodePreviewRows>('st/hosted', 'paidEpisodePreviewRows');
export const paidEpisodeAudioRows = viaStore<typeof import('./ddb/hosted.ts').paidEpisodeAudioRows>('st/hosted', 'paidEpisodeAudioRows');
export const paidEpisodePreviewAudioRows = viaStore<typeof import('./ddb/hosted.ts').paidEpisodePreviewAudioRows>('st/hosted', 'paidEpisodePreviewAudioRows');
