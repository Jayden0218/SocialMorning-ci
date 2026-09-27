/**
 * M10: the owner's curated collections (`apps/api/collections.json`), validated the way
 * picks are (M5 FR-004, guard G1): validation never throws — a bad collection or item is
 * dropped with a warning naming where it was, and the rest serve (principle IV).
 *
 * An item is resolved exactly like a pick: `feedUrl` + optional `guid`; no guid means the
 * show's latest episode. The caps bound the feed fetches one Discover rebuild can cost
 * (Vercel Hobby's function time budget).
 */
export type CollectionItemIn = { feedUrl: string; guid?: string; why?: string };
export type CollectionIn = { id: string; title: string; subtitle?: string; items: CollectionItemIn[] };

export const MAX_COLLECTIONS = 6;
export const MAX_ITEMS_PER_COLLECTION = 10;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max ? v.trim() : undefined);

export function validateCollections(raw: unknown): { collections: CollectionIn[]; warnings: string[] } {
  if (!Array.isArray(raw)) return { collections: [], warnings: ['collections: not an array'] };
  const collections: CollectionIn[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, i) => {
    if (typeof entry !== 'object' || entry === null) { warnings.push(`collections[${i}]: not an object`); return; }
    const e = entry as Record<string, unknown>;
    const id = typeof e['id'] === 'string' && ID.test(e['id']) ? e['id'] : undefined;
    if (id === undefined) { warnings.push(`collections[${i}]: id must be 1–40 of a-z, 0-9, -`); return; }
    if (seen.has(id)) { warnings.push(`collections[${i}]: duplicate id ${id}`); return; }
    const title = text(e['title'], 60);
    if (title === undefined) { warnings.push(`collections[${i}]: title must be 1–60 characters`); return; }
    if (e['subtitle'] !== undefined && text(e['subtitle'], 120) === undefined) { warnings.push(`collections[${i}]: subtitle must be 1–120 characters`); return; }
    if (!Array.isArray(e['items'])) { warnings.push(`collections[${i}]: items must be an array`); return; }
    if (collections.length >= MAX_COLLECTIONS) { warnings.push(`collections[${i}]: more than ${MAX_COLLECTIONS} collections, dropped`); return; }
    const items: CollectionItemIn[] = [];
    (e['items'] as unknown[]).forEach((it, j) => {
      const where = `collections[${i}].items[${j}]`;
      if (typeof it !== 'object' || it === null) { warnings.push(`${where}: not an object`); return; }
      const x = it as Record<string, unknown>;
      const feedUrl = x['feedUrl'];
      const guid = x['guid'];
      const why = x['why'] === undefined ? undefined : text(x['why'], 140);
      if (typeof feedUrl !== 'string' || !/^https?:\/\//.test(feedUrl)) { warnings.push(`${where}: feedUrl must be an http(s) URL`); return; }
      if (guid !== undefined && typeof guid !== 'string') { warnings.push(`${where}: guid must be a string`); return; }
      if (x['why'] !== undefined && why === undefined) { warnings.push(`${where}: why must be 1–140 characters`); return; }
      if (items.length >= MAX_ITEMS_PER_COLLECTION) { warnings.push(`${where}: more than ${MAX_ITEMS_PER_COLLECTION} items, dropped`); return; }
      items.push({ feedUrl, ...(typeof guid === 'string' && guid !== '' ? { guid } : {}), ...(why !== undefined ? { why } : {}) });
    });
    if (items.length === 0) { warnings.push(`collections[${i}]: no valid items`); return; }
    seen.add(id);
    const subtitle = text(e['subtitle'], 120);
    collections.push({ id, title, ...(subtitle !== undefined ? { subtitle } : {}), items });
  });
  return { collections, warnings };
}
