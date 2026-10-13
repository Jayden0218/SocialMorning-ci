// Academy articles and Help questions (`content_pages`): list, read, save with a version check, delete.
/**
 * M25 A8. `body` is the Markdown subset of packages/social-core/src/markdown.ts. The server
 * stores and serves it as text; the Studio and the phone draw it as text runs, never as HTML.
 */
import { ApiError } from '../../../errors.ts';
import { viaStore } from '../../backend.ts';

export const CONTENT_KINDS = ['academy', 'faq'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export const isContentKind = (k: string): k is ContentKind => (CONTENT_KINDS as readonly string[]).includes(k);
export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** The Academy tabs (apps/mobile/app/academy/index.tsx); an article with no tab shows under All only. */
export const ACADEMY_TAGS = ['start', 'grow', 'community'] as const;

export type ContentInput = { title: string; summary: string | null; tag: string | null; body: string; position: number; published: boolean };
export type ContentPage = ContentInput & { kind: ContentKind; slug: string; version: number; updatedAt: string };

export const versionGuard = (current: number, sent: number) => {
  if (current !== sent) throw new ApiError('changed', 'Changed elsewhere — reload.', { version: current });
};

export const listPages = viaStore<typeof import('../safety/ddb/content.ts').listPages>('sf/content', 'listPages');
export const getPage = viaStore<typeof import('../safety/ddb/content.ts').getPage>('sf/content', 'getPage');
export const putPage = viaStore<typeof import('../safety/ddb/content.ts').putPage>('sf/content', 'putPage');
export const deletePage = viaStore<typeof import('../safety/ddb/content.ts').deletePage>('sf/content', 'deletePage');
