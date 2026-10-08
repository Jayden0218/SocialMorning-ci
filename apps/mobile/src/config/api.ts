// Server calls for the app settings and the Academy / Help pages, with the ETag so an unchanged answer is a 304.
/**
 * M25 lane AC: its own client (like `src/social/api-m22-discover.ts`), so the test fakes of
 * `ApiClient` need no new methods. Both routes are public: no sign-in needed.
 */
import { requester, type ApiDeps } from '@/social/api';

export type ContentKind = 'academy' | 'faq';
export type ServerPage = { slug: string; title: string; summary: string | null; tag: string | null; body: string; position: number; updatedAt: string };
export type Fetched<T> = { status: 200; etag?: string; body: T } | { status: 304 };

export type ConfigApi = ReturnType<typeof createConfigApi>;

export function createConfigApi(deps: ApiDeps) {
  const call = requester(deps);
  const get = async <T>(path: string, etag: string | undefined): Promise<Fetched<T>> => {
    const r = await call<T>('GET', path, undefined, etag ? { 'if-none-match': etag } : {});
    if (r.status === 304) return { status: 304 };
    const tag = r.headers.get('etag');
    return { status: 200, body: r.json, ...(tag ? { etag: tag } : {}) };
  };
  return {
    config: (etag?: string) => get<unknown>('/v1/config', etag),
    content: (kind: ContentKind, etag?: string) => get<{ items: ServerPage[] }>(`/v1/content/${kind}`, etag),
  };
}
