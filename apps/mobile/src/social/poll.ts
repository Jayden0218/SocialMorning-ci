/**
 * The 10-second poll (research R7, FR-015). It runs ONLY while all three are true:
 * the episode's screen is focused, the app is in the foreground, and the phone is
 * online. Any of them false → no timer, no request. That is the whole free-tier
 * budget argument (research R1), so it is pinned by `__tests__/poll.test.ts` (A18).
 *
 * `tick` is whatever fetches and caches one episode's social view (the provider's
 * `refresh`). The scheduler never touches the network itself.
 */
export const POLL_INTERVAL_MS = 10_000;

export type PollDeps = {
  tick: (episodeId: string) => Promise<unknown>;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

export type PollState = { focused: boolean; foreground: boolean; online: boolean; episodeId?: string };

export type Poller = {
  update(patch: Partial<PollState>): void;
  /** For tests and diagnostics. */
  isRunning(): boolean;
  dispose(): void;
};

export function createPoller(deps: PollDeps, initial: Partial<PollState> = {}): Poller {
  let state: PollState = { focused: false, foreground: true, online: true, ...initial };
  let handle: unknown;
  let inFlight = false;

  const shouldRun = () => state.focused && state.foreground && state.online && state.episodeId !== undefined;

  const fire = () => {
    if (inFlight || state.episodeId === undefined) return;
    inFlight = true;
    // A failed tick is the fetcher's business (it marks the view stale, FR-032);
    // the scheduler only cares that the next one may run.
    let p: Promise<unknown>;
    try { p = Promise.resolve(deps.tick(state.episodeId)); } catch (e) { p = Promise.reject(e); }
    p.catch(() => undefined).finally(() => { inFlight = false; });
  };

  const reconcile = () => {
    if (shouldRun() && handle === undefined) {
      fire(); // immediately on becoming eligible, then every 10 s
      handle = deps.setInterval(fire, POLL_INTERVAL_MS);
    } else if (!shouldRun() && handle !== undefined) {
      deps.clearInterval(handle);
      handle = undefined;
    }
  };

  reconcile(); // an initially eligible poller starts at once

  return {
    update(patch) {
      const episodeChanged = patch.episodeId !== undefined && patch.episodeId !== state.episodeId;
      state = { ...state, ...patch };
      if (episodeChanged && handle !== undefined) {
        // New episode on the same screen: restart so the first tick is immediate.
        deps.clearInterval(handle);
        handle = undefined;
      }
      reconcile();
    },
    isRunning: () => handle !== undefined,
    dispose() {
      if (handle !== undefined) deps.clearInterval(handle);
      handle = undefined;
    },
  };
}
