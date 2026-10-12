// Listener playlists: make, rename, reorder, share publicly or keep private.
/**
 * M19 US4 (FR-030–FR-032). At most 50 playlists per listener and 300 episodes each. A private
 * playlist answers "not found" to anyone but its owner; a deleted one is kept as a tombstone
 * (`deleted_at`) so a second phone learns it went. Hidden shows' episodes are left out on read.
 */
import { viaStore } from '../../backend.ts';
import type { EpisodeCard } from '../../../catalog/apple.ts';

export const PLAYLISTS_MAX = 50;
export const PLAYLIST_ITEMS_MAX = 300;

export type Playlist = {
  id: string; title: string; isPublic: boolean; count: number; updatedAt: string;
  owner?: { id: string; displayName: string; avatarUrl?: string };
  items?: (EpisodeCard & { id: string })[];
  imageUrl?: string;
};

// Bodies in graph-ddb/ (src/db/backend.ts).
export const myPlaylists = viaStore<typeof import('./graph-ddb/index.ts').myPlaylists>('sg/index', 'myPlaylists');
export const playlistsOf = viaStore<typeof import('./graph-ddb/index.ts').playlistsOf>('sg/index', 'playlistsOf');
export const createPlaylist = viaStore<typeof import('./graph-ddb/index.ts').createPlaylist>('sg/index', 'createPlaylist');
export const updatePlaylist = viaStore<typeof import('./graph-ddb/index.ts').updatePlaylist>('sg/index', 'updatePlaylist');
export const deletePlaylist = viaStore<typeof import('./graph-ddb/index.ts').deletePlaylist>('sg/index', 'deletePlaylist');
export const setItems = viaStore<typeof import('./graph-ddb/index.ts').setItems>('sg/index', 'setItems');
export const addItem = viaStore<typeof import('./graph-ddb/index.ts').addItem>('sg/index', 'addItem');
export const getPlaylist = viaStore<typeof import('./graph-ddb/index.ts').getPlaylist>('sg/index', 'getPlaylist');
