// "Friends are listening": what people I follow listened to in the last 7 days.
import { viaStore } from '../../backend.ts';

export type FriendsListeningRow = {
  episode_id: string; listener_id: string; display_name: string; at: Date | string;
  feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string;
};

// Bodies in graph-ddb/ (src/db/backend.ts).
export const friendsListeningRows = viaStore<typeof import('./graph-ddb/index.ts').friendsListeningRows>('sg/index', 'friendsListeningRows');
