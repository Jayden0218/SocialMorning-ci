// Academy articles and Help questions (`content_pages`): list, read, save with a version check, delete.
/**
 * M25 A8. `body` is the Markdown subset of packages/social-core/src/markdown.ts. The server
 * stores and serves it as text; the Studio and the phone draw it as text runs, never as HTML.
 */
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';

export const CONTENT_KINDS = ['academy', 'faq'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export const isContentKind = (k: string): k is ContentKind => (CONTENT_KINDS as readonly string[]).includes(k);
export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** The Academy tabs (apps/mobile/app/academy/index.tsx); an article with no tab shows under All only. */
export const ACADEMY_TAGS = ['start', 'grow', 'community'] as const;

export type ContentInput = { title: string; summary: string | null; tag: string | null; body: string; position: number; published: boolean };
export type ContentPage = ContentInput & { kind: ContentKind; slug: string; version: number; updatedAt: string };

type Row = { kind: ContentKind; slug: string; title: string; summary: string | null; tag: string | null; body: string; position: number; published: boolean; version: number; updated_at: Date | string };
const toPage = (r: Row): ContentPage => ({
  kind: r.kind, slug: r.slug, title: r.title, summary: r.summary, tag: r.tag, body: r.body, position: Number(r.position),
  published: Boolean(r.published), version: Number(r.version), updatedAt: new Date(r.updated_at).toISOString(),
});

export async function listPages(db: Db, kind: ContentKind, opts: { all: boolean }): Promise<ContentPage[]> {
  const rows = await db.query<Row>(
    `SELECT kind, slug, title, summary, tag, body, position, published, version, updated_at FROM content_pages
      WHERE kind = $1 AND ($2::boolean OR published) ORDER BY position, slug`, [kind, opts.all]);
  return rows.map(toPage);
}

export async function getPage(db: Db, kind: ContentKind, slug: string): Promise<ContentPage | null> {
  const [r] = await db.query<Row>('SELECT kind, slug, title, summary, tag, body, position, published, version, updated_at FROM content_pages WHERE kind = $1 AND slug = $2', [kind, slug]);
  return r ? toPage(r) : null;
}

const versionGuard = (current: number, sent: number) => {
  if (current !== sent) throw new ApiError('changed', 'Changed elsewhere — reload.', { version: current });
};

/** Create (version 0) or update (the stored version). Returns the new version. */
export async function putPage(tx: Db, kind: ContentKind, slug: string, version: number, p: ContentInput): Promise<number> {
  const [cur] = await tx.query<{ version: number }>('SELECT version FROM content_pages WHERE kind = $1 AND slug = $2 FOR UPDATE', [kind, slug]);
  const current = cur ? Number(cur.version) : 0;
  versionGuard(current, version);
  const next = current + 1;
  await tx.query(
    `INSERT INTO content_pages (kind, slug, title, summary, tag, body, position, published, version, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (kind, slug) DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary, tag = EXCLUDED.tag, body = EXCLUDED.body,
       position = EXCLUDED.position, published = EXCLUDED.published, version = EXCLUDED.version, updated_at = now()`,
    [kind, slug, p.title, p.summary, p.tag, p.body, p.position, p.published, next],
  );
  return next;
}

export async function deletePage(tx: Db, kind: ContentKind, slug: string, version: number): Promise<void> {
  const [cur] = await tx.query<{ version: number }>('SELECT version FROM content_pages WHERE kind = $1 AND slug = $2 FOR UPDATE', [kind, slug]);
  if (!cur) throw new ApiError('not_found', 'No such page.');
  versionGuard(Number(cur.version), version);
  await tx.query('DELETE FROM content_pages WHERE kind = $1 AND slug = $2', [kind, slug]);
}
