/**
 * M15 US3 (research R5): which promotion, if any, the launch screen shows — decided from
 * what is already on the phone, so a launch with nothing cached costs no network time
 * (SC-004, guard G-L4). Pure: no React, no expo, no clock and no `Math.random` of its own,
 * so every branch is covered by `__tests__/launch-choose.test.ts` (guard G-L1).
 *
 * The constitution (v2.4.0): the owner's own promotions only, at most 3 s, never in minor
 * mode, and only aggregate counts — nothing here knows who the listener is.
 */

/** One item of `GET /v1/launch` (specs/015-m15-admin/contracts/admin-api.md). */
export type Promotion = {
  id: string;
  imageUrl: string;
  targetKind: 'route' | 'url';
  target: string;
  label: string;
  startsAt: string;
  endsAt: string;
  weight: number;
  dailyCap: number;
};

/** `launch.shown` in the settings store: how often each promotion showed on one local day. */
export type Shown = { day: string; counts: Record<string, number> };

export type ChooseInput = {
  list: readonly Promotion[];
  /** Ids whose image is in `Paths.cache/launch/` right now. */
  cachedIds: ReadonlySet<string>;
  now: number;
  shown: Shown | undefined;
  /** Minor mode — `getPref(settings, 'hideExplicit')`. */
  minor: boolean;
  signedIn: boolean;
  /** The Terms overlay will show on this launch. */
  termsDue: boolean;
  /** [0, 1) — `Math.random` in the app, seeded in the test. */
  random: () => number;
};

/** The screen shows for at most this long (FR-016). */
export const LAUNCH_MAX_MS = 3_000;

/** "YYYY-MM-DD" in the phone's own time zone — the daily cap resets at local midnight. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** How many times `id` showed today (0 when the stored day is another day). */
export function shownToday(shown: Shown | undefined, id: string, today: string): number {
  if (shown === undefined || shown.day !== today) return 0;
  return shown.counts[id] ?? 0;
}

/** The count after one more impression of `id` today; a new day starts from nothing. */
export function markShown(shown: Shown | undefined, id: string, today: string): Shown {
  const counts = shown !== undefined && shown.day === today ? { ...shown.counts } : {};
  counts[id] = (counts[id] ?? 0) + 1;
  return { day: today, counts };
}

/** Live now: started, not ended. An unreadable date is never live. */
export function isLive(p: Pick<Promotion, 'startsAt' | 'endsAt'>, now: number): boolean {
  const start = Date.parse(p.startsAt);
  const end = Date.parse(p.endsAt);
  return start <= now && now < end;
}

/** The promotion to show, or `undefined` for none. Weighted by `weight` among the eligible. */
export function chooseLaunch(input: ChooseInput): Promotion | undefined {
  if (!input.signedIn || input.termsDue || input.minor) return undefined;
  const today = localDay(input.now);
  const eligible = input.list.filter((p) =>
    input.cachedIds.has(p.id)
    && isLive(p, input.now)
    && p.weight > 0
    && shownToday(input.shown, p.id, today) < p.dailyCap);
  if (eligible.length === 0) return undefined;
  const total = eligible.reduce((sum, p) => sum + p.weight, 0);
  let r = input.random() * total;
  for (const p of eligible) {
    r -= p.weight;
    if (r < 0) return p;
  }
  // `random()` returned 1 (outside [0, 1)) — the last one, never none.
  return eligible[eligible.length - 1];
}

/**
 * Where a tap goes (FR-013, edge case "a page that no longer exists"): an https address
 * opens outside the app; an in-app path the app knows opens there; anything else opens
 * Discover (`/`).
 */
export type LaunchTarget = { kind: 'url'; url: string } | { kind: 'route'; path: string };

export function resolveTarget(p: Pick<Promotion, 'targetKind' | 'target'>, known: (path: string) => boolean): LaunchTarget {
  if (p.targetKind === 'url') return /^https:\/\//i.test(p.target) ? { kind: 'url', url: p.target } : { kind: 'route', path: '/' };
  return known(p.target) ? { kind: 'route', path: p.target } : { kind: 'route', path: '/' };
}

/**
 * The in-app pages a promotion may link to, as expo-router patterns. `[x]` matches one
 * segment. `__tests__/launch-choose.test.ts` checks each still has a file under `app/`.
 */
export const LAUNCH_ROUTES: readonly string[] = [
  '/', '/following', '/library', '/me',
  '/academy', '/academy/[slug]', '/categories', '/category/[id]', '/chart', '/episode/[id]',
  '/show/[feedUrl]', '/issue/[id]', '/issues', '/picks/past', '/profile/[id]',
  '/inbox', '/queue', '/downloads', '/friends-listening', '/search', '/notifications',
  '/subscriptions', '/stickers', '/tips', '/wallet', '/creator', '/settings/about', '/settings/help',
];

/** True when `path` (query and hash ignored) matches one of `routes`. */
export function knownRoute(path: string, routes: readonly string[] = LAUNCH_ROUTES): boolean {
  if (!path.startsWith('/')) return false;
  const bare = path.replace(/[?#].*$/, '');
  const segs = bare.split('/').filter((s) => s.length > 0);
  return routes.some((r) => {
    const pat = r.split('/').filter((s) => s.length > 0);
    return pat.length === segs.length && pat.every((s, i) => (/^\[.+\]$/.test(s) ? segs[i]!.length > 0 : s === segs[i]));
  });
}
