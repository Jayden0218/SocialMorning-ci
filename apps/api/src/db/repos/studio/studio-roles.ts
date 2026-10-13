// Decides who may manage which show in the Studio: owner or helper.
/**
 * M11 — who may use the Studio for which show (specs/011-m11-studio/data-model.md).
 * The owner is the PROVEN claim (M10b); operators are `show_members`, and only count while
 * the show still has a proven owner. A show is addressed in URLs by `fnv1a64(feed_url)`, so
 * no feed URL (with its slashes) ever travels through the Studio's proxy as a path segment.
 */
import { fnv1a64 } from '@socialmorning/social-core';
import { viaStore } from '../../backend.ts';

export type Role = 'owner' | 'operator';
export type StudioShow = { key: string; feedUrl: string; title: string | null; image: string | null; role: Role; hosted: boolean };

export const showKey = (feedUrl: string): string => fnv1a64(feedUrl);

// DynamoDB bodies: ddb/roles.ts, the `ROLES#` copies (db/backend.ts).
export const showsFor = viaStore<typeof import('./ddb/roles.ts').showsFor>('st/roles', 'showsFor');
export const roleFor = viaStore<typeof import('./ddb/roles.ts').roleFor>('st/roles', 'roleFor');
