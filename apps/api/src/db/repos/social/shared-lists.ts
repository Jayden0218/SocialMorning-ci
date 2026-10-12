// Database queries for shared show lists (M22 US17 item 5; moved from routes/lists.ts in M26 F0-01).
import { viaStore } from '../../backend.ts';

export type SharedListRow = { id: string; title: string; feed_urls: string[] | string; created_at: Date | string; owner_id: string; display_name: string; suspended_at: string | null };
export type SharedListShowRow = { feed_url: string; title: string | null; image_url: string | null };

// The titles come from lane ST's overrides and lane LB's show META (discover/ddb/shared-lists.ts).
export const sharedListShowRows = viaStore<typeof import('../discover/ddb/shared-lists.ts').sharedListShowRows>('dv/shared-lists', 'sharedListShowRows');
// The list itself: lists-ddb/shared-lists.ts (folder `sl`).
export const sharedListRows = viaStore<typeof import('./lists-ddb/shared-lists.ts').sharedListRows>('sl/shared-lists', 'sharedListRows');
export const insertSharedList = viaStore<typeof import('./lists-ddb/shared-lists.ts').insertSharedList>('sl/shared-lists', 'insertSharedList');
