/**
 * M6 empty states (spec FR-019–FR-021): the 13 surfaces, each with one sentence on what
 * fills it and one action that leads there; loading after 1 s; give up at 10 s.
 */
export type Surface = 'library' | 'inbox' | 'queue' | 'downloads' | 'feed' | 'followers' | 'following' | 'clips' | 'comments' | 'heat' | 'nextup' | 'stats' | 'search';

export type EmptyAction = { label: string; route: string };
export type EmptySpec = { sentence: string; action: EmptyAction };

export const EMPTY_STATES: Record<Surface, EmptySpec> = {
  library:   { sentence: 'No subscriptions yet. Pick something to listen to.', action: { label: 'Discover', route: '/discover' } },
  inbox:     { sentence: 'Nothing new. New episodes of your subscriptions land here.', action: { label: 'Open Library', route: '/' } },
  queue:     { sentence: 'Nothing queued. Use Add to queue on an episode.', action: { label: 'Open Inbox', route: '/inbox' } },
  downloads: { sentence: 'Nothing downloaded yet. Downloads run on Wi-Fi unless you allow mobile data.', action: { label: 'Open Inbox', route: '/inbox' } },
  feed:      { sentence: 'Follow someone and their comments and clips land here.', action: { label: 'Discover', route: '/discover' } },
  followers: { sentence: 'Nobody follows you yet. Share a clip — your name travels with it.', action: { label: 'Open Discover', route: '/discover' } },
  following: { sentence: 'You follow nobody yet. Tap a name on any comment to see their profile.', action: { label: 'Open Discover', route: '/discover' } },
  clips:     { sentence: 'No clips yet. Clip the good bit from the player.', action: { label: 'Open player', route: '/player' } },
  comments:  { sentence: 'Nobody has said anything at this moment yet.', action: { label: 'Comment here', route: '/player' } },
  heat:      { sentence: 'Nobody has marked a moment yet — tap ♡ while listening.', action: { label: 'React', route: '/player' } },
  nextup:    { sentence: 'Nothing to suggest yet — play something and come back.', action: { label: 'Discover', route: '/discover' } },
  stats:     { sentence: 'Nothing listened yet. Play something — stats count from the first minute.', action: { label: 'Open Library', route: '/' } },
  search:    { sentence: "Nothing matches. Try the show's name, or paste a feed URL.", action: { label: 'Discover', route: '/discover' } },
};

export const SURFACES = Object.keys(EMPTY_STATES) as Surface[];

export const LOADING_AFTER_MS = 1_000;
export const GIVE_UP_AFTER_MS = 10_000;

export const OFFLINE_SENTENCE = "You're offline and nothing is saved here yet.";
export const ERROR_SENTENCE = "Couldn't load this. Check the connection and try again.";

export type EmptyView =
  | { kind: 'loading' }
  | { kind: 'empty'; sentence: string; action: EmptyAction }
  | { kind: 'offline'; sentence: string; retry: true }
  | { kind: 'error'; sentence: string; retry: true }
  | { kind: 'quiet' };

/**
 * What to show for a surface with no items. `loadingMs` is how long the first load has
 * been running (undefined = not loading). Offline with a cached copy → the surface shows
 * the copy (this returns `quiet`); offline without one → the offline variant.
 */
export function emptyState(
  surface: Surface,
  ctx: { offline: boolean; hasCache: boolean; loadingMs?: number; failed?: boolean },
): EmptyView {
  if (ctx.loadingMs !== undefined && ctx.loadingMs < GIVE_UP_AFTER_MS) {
    return ctx.loadingMs >= LOADING_AFTER_MS ? { kind: 'loading' } : { kind: 'quiet' };
  }
  if (ctx.offline && !ctx.hasCache) return { kind: 'offline', sentence: OFFLINE_SENTENCE, retry: true };
  if ((ctx.failed || (ctx.loadingMs !== undefined && ctx.loadingMs >= GIVE_UP_AFTER_MS)) && !ctx.hasCache) {
    return { kind: 'error', sentence: ERROR_SENTENCE, retry: true };
  }
  const spec = EMPTY_STATES[surface];
  return { kind: 'empty', sentence: spec.sentence, action: spec.action };
}
