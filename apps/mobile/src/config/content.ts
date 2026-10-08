// The Academy articles and Help questions the phone shows: the server's when it has them, the bundled copy otherwise.
/**
 * M25 A8. The admin writes these in Admin › Content (`content_pages`); the server seeded them from
 * the bundled copy (src/settings/academy.ts, faq.ts), which stays here as the fallback for a phone
 * that has never reached the server. Each kind's last answer is kept in `feed_cache`
 * (`content:academy`, `content:faq`) with its ETag.
 *
 * Bodies are the Markdown subset of packages/social-core/src/markdown.ts, parsed into text runs;
 * src/ui/content/Markdown.tsx draws them as <Text> — never as HTML (guard G-AC2).
 */
import { useEffect, useMemo, useState } from 'react';
import { parseMarkdown, sectionsOf, type MdBlock } from '@socialmorning/social-core';
import type { FeedCacheStore } from '@/storage/types';
import { ARTICLES } from '@/settings/academy';
import { FAQ } from '@/settings/faq';
import { apiBaseUrl } from '@/social/base-url';
import { secureToken } from '@/social/token';
import { useStores } from '@/ui/shell/providers';
import { createConfigApi, type ConfigApi, type ContentKind, type ServerPage } from './api';

export type ArticleView = { slug: string; title: string; summary: string; tab?: string; sections: { heading: string; blocks: MdBlock[] }[] };
export type FaqView = { slug: string; q: string; tag: string; blocks: MdBlock[] };

/** Which Academy tab each bundled article sits under (was in app/academy/index.tsx). */
export const BUNDLED_TABS: Readonly<Record<string, string>> = { 'claim-your-show': 'start', 'the-studio': 'start', 'read-your-numbers': 'grow', clips: 'grow', 'reply-to-comments': 'community' };

const para = (text: string): MdBlock[] => [{ t: 'p', v: [{ t: 'text', v: text }] }];

export const BUNDLED_ARTICLES: readonly ArticleView[] = ARTICLES.map((a) => ({
  slug: a.slug, title: a.title, summary: a.summary, ...(BUNDLED_TABS[a.slug] ? { tab: BUNDLED_TABS[a.slug] } : {}),
  sections: a.sections.map((s) => ({ heading: s.heading, blocks: para(s.body) })),
}));
export const BUNDLED_FAQ: readonly FaqView[] = FAQ.map((f, i) => ({ slug: `faq-${i}`, q: f.q, tag: f.tag, blocks: para(f.a) }));

export const articleOf = (p: ServerPage): ArticleView => ({
  slug: p.slug, title: p.title, summary: p.summary ?? '', ...(p.tag ? { tab: p.tag } : {}),
  sections: sectionsOf(parseMarkdown(p.body)),
});
export const faqOf = (p: ServerPage): FaqView => ({ slug: p.slug, q: p.title, tag: p.tag ?? 'Other', blocks: parseMarkdown(p.body) });

export const contentKey = (kind: ContentKind): string => `content:${kind}`;

function readCached(cache: FeedCacheStore, kind: ContentKind): { items: ServerPage[]; etag?: string } | undefined {
  const row = cache.get(contentKey(kind));
  if (!row) return undefined;
  try {
    const items = (JSON.parse(row.body) as { items?: unknown }).items;
    return Array.isArray(items) ? { items: items as ServerPage[], ...(row.etag ? { etag: row.etag } : {}) } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The pages of one kind: the cached server copy at once (else undefined → the caller's bundled
 * copy), then the server's answer. Any failure keeps what there is. Never throws.
 */
export function createContentLoader(deps: { api: Pick<ConfigApi, 'content'>; cache: FeedCacheStore; now: () => number }) {
  return {
    cached: (kind: ContentKind): ServerPage[] | undefined => readCached(deps.cache, kind)?.items,
    async refresh(kind: ContentKind): Promise<ServerPage[] | undefined> {
      const c = readCached(deps.cache, kind);
      try {
        const r = await deps.api.content(kind, c?.etag);
        if (r.status === 304) return c?.items;
        const raw: unknown = (r.body as { items?: unknown } | undefined)?.items;
        const items = Array.isArray(raw)
          ? (raw as (ServerPage | null)[]).filter((p): p is ServerPage => typeof p?.slug === 'string' && typeof p.title === 'string' && typeof p.body === 'string')
          : undefined;
        if (!items) return c?.items;
        deps.cache.set({ key: contentKey(kind), ...(r.etag ? { etag: r.etag } : {}), fetchedAt: deps.now(), body: JSON.stringify({ items }) });
        return items;
      } catch {
        return c?.items;
      }
    },
  };
}

function useContent(kind: ContentKind): ServerPage[] | undefined {
  const stores = useStores();
  const loader = useMemo(() => createContentLoader({
    api: createConfigApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), cache: stores.feedCache, now: () => Date.now(),
  }), [stores.feedCache]);
  const [items, setItems] = useState<ServerPage[] | undefined>(() => loader.cached(kind));
  useEffect(() => {
    let live = true;
    void loader.refresh(kind).then((x) => { if (live && x) setItems(x); });
    return () => { live = false; };
  }, [loader, kind]);
  return items;
}

/** The Academy articles to show, in order. */
export function useAcademy(): readonly ArticleView[] {
  const items = useContent('academy');
  return useMemo(() => (items ? items.map(articleOf) : BUNDLED_ARTICLES), [items]);
}

/** The Help questions to show, in order. */
export function useFaq(): readonly FaqView[] {
  const items = useContent('faq');
  return useMemo(() => (items ? items.map(faqOf) : BUNDLED_FAQ), [items]);
}
