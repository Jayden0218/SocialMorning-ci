// Where a tapped notification goes: its in-app path, or (older pushes) its episode.
/**
 * M22 US1 (specs/023 contracts "Push"). Pushes since M22 carry `href`, an in-app path. Older
 * ones carry only `episodeId`. Anything else, or a path that is not ours, opens nothing.
 */
const OURS = /^\/(comments\/thread|comments|profile|like|status|digest|episode|gift)\/[^\s?#]+$/;

export function routeForPush(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { href?: unknown; episodeId?: unknown };
  if (typeof d.href === 'string' && OURS.test(d.href)) return d.href;
  if (typeof d.episodeId === 'string' && d.episodeId !== '') return `/episode/${encodeURIComponent(d.episodeId)}`;
  return null;
}
