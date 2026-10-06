// Talks to the SocialNet Apple Watch app: is it there, send it an episode, hear its positions.
/**
 * M21 US12 (FR-105, research R1). The native side is `ios/WatchLinkModule.swift` (WCSession);
 * the Watch side is `targets/watch/PhoneLink.swift`. iPhone only — there is no Android module.
 *
 * `requireOptionalNativeModule`, not `requireNativeModule`: in Jest, on Android, on the web and in a
 * build made before this module existed there is no native side. Every answer is then "no Watch":
 * the episode sheet hides "Download to Watch" and nothing is ever sent.
 *
 * Positions arrive as raw objects; `src/sync/watch.ts` checks them and decides which one wins.
 */
import { requireOptionalNativeModule } from 'expo';

export type WatchState = { paired: boolean; installed: boolean };

/** What the Watch needs to download and play an episode on its own. */
export type WatchEpisode = {
  id: string;
  title: string;
  show: string;
  /** The publisher's audio address — the Watch downloads from here; we host nothing. */
  url: string;
  artworkUrl?: string;
  positionMs: number;
  durationMs?: number;
  /** The feed's enclosure size, so a Watch without the room can refuse at once. */
  bytes?: number;
};

type Subscription = { remove(): void };
type Native = {
  getState(): WatchState;
  sendEpisode(episode: WatchEpisode): boolean;
  takePending(): unknown[];
  addListener(event: 'onPosition', listener: (raw: unknown) => void): Subscription;
};

const NONE: WatchState = { paired: false, installed: false };

const native = (): Native | null => {
  try { return requireOptionalNativeModule<Native>('WatchLink'); } catch { return null; }
};

/** Is there a paired Watch, and does it have our app? Never throws. */
export function watchState(): WatchState {
  const m = native();
  if (m == null) return NONE;
  try {
    const s = m.getState();
    return { paired: s?.paired === true, installed: s?.paired === true && s?.installed === true };
  } catch { return NONE; }
}

/** Queues the episode for the Watch. False = nothing was sent (no module, no Watch, an error). */
export function sendEpisode(episode: WatchEpisode): boolean {
  const m = native();
  if (m == null) return false;
  // The native Record has no `undefined`: leave absent fields out.
  const clean = Object.fromEntries(Object.entries(episode).filter(([, v]) => v !== undefined)) as WatchEpisode;
  try { return m.sendEpisode(clean) === true; } catch { return false; }
}

/**
 * Every position the Watch sends: first the ones that arrived before anyone listened, then each
 * new one. Returns the function that stops listening. Without the module: nothing, ever.
 */
export function onPositions(listener: (raw: unknown) => void): () => void {
  const m = native();
  if (m == null) return () => undefined;
  let sub: Subscription | undefined;
  try {
    sub = m.addListener('onPosition', listener);
    for (const raw of m.takePending() ?? []) listener(raw);
  } catch { /* an old build: no positions */ }
  return () => { try { sub?.remove(); } catch { /* already gone */ } };
}
