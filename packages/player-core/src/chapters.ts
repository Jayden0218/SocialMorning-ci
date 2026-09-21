import type { Chapter } from './types';

/**
 * Podcasting 2.0 JSON chapters (research R5):
 * `{ version, chapters: [{ startTime (s), endTime?, title?, img?, url?, toc? }] }`.
 * A bad entry is skipped, the rest kept (Principle IV); anything unrecognisable → [].
 */
export function parseChapters(json: unknown): Chapter[] {
  const root = json as { chapters?: unknown } | null;
  if (!root || typeof root !== 'object' || !Array.isArray(root.chapters)) return [];
  const out: Chapter[] = [];
  for (const raw of root.chapters) {
    const c = raw as { startTime?: unknown; endTime?: unknown; title?: unknown; img?: unknown; url?: unknown; toc?: unknown };
    if (!c || typeof c !== 'object' || typeof c.startTime !== 'number' || !Number.isFinite(c.startTime) || c.startTime < 0) continue;
    if (c.toc === false) continue; // the spec's "not in the table of contents"
    out.push({
      startMs: Math.round(c.startTime * 1000),
      ...(typeof c.endTime === 'number' && Number.isFinite(c.endTime) ? { endMs: Math.round(c.endTime * 1000) } : {}),
      ...(typeof c.title === 'string' && c.title.trim() ? { title: c.title.trim() } : {}),
      ...(typeof c.img === 'string' && c.img ? { imageUrl: c.img } : {}),
      ...(typeof c.url === 'string' && c.url ? { url: c.url } : {}),
    });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** Index of the chapter containing `positionMs`, or undefined before the first one. */
export function currentChapter(chapters: readonly Chapter[], positionMs: number): number | undefined {
  let found: number | undefined;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i]!.startMs <= positionMs) found = i;
    else break;
  }
  return found;
}
