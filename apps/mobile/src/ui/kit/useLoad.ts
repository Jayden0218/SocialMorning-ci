// Loads a screen's data, drops the answer once the screen has closed, and gives a retry.
/**
 * M23 US9 (FR-014): the hand-written "loading → ok | error" in many screens had no cancel guard,
 * so an answer arriving after the page closed set state on an unmounted screen (and an older,
 * slower answer could replace a newer one after a retry). `useLoad` does it once:
 *
 *   const [state, reload] = useLoad(() => api.chart(kind).then((page) => ({ page })), [api, kind]);
 *
 *  - `state` is `{ kind: 'loading' }`, `{ kind: 'error', message }` or `{ kind: 'ok', ...data }` —
 *    the screen keeps reading `state.page` as before;
 *  - only the newest call may set state, and nothing is set after unmount;
 *  - the message is one sentence: "Couldn't reach the server." offline, else "Couldn't load this
 *    right now."; a crash or a server failure (5xx) also goes to the error log (reportError);
 *  - a reload over data already shown keeps showing it until the new answer arrives;
 *  - `fn` undefined (signed out, no id yet) means nothing to load: the state stays `loading`.
 */
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { ApiError } from '@/social/api';
import { reportError } from '@/telemetry/reportError';

export type LoadState<T extends object> = { kind: 'loading' } | { kind: 'error'; message: string } | ({ kind: 'ok' } & T);

export const OFFLINE_MESSAGE = "Couldn't reach the server.";
export const FAILED_MESSAGE = "Couldn't load this right now.";

export function loadFailedMessage(e: unknown): string {
  return e instanceof ApiError && e.code === 'network' ? OFFLINE_MESSAGE : FAILED_MESSAGE;
}

/** Offline and the server's ordinary answers (signed out, not found: 4xx) are not app errors. */
function worthLogging(e: unknown): boolean {
  return !(e instanceof ApiError) || (e.code !== 'network' && e.status >= 500);
}

export function useLoad<T extends object>(fn: (() => Promise<T>) | undefined, deps: DependencyList, scope = 'screen.load'): [LoadState<T>, () => void] {
  const [state, setState] = useState<LoadState<T>>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  useEffect(() => {
    if (fn === undefined) return undefined;
    const id = ++latest.current;
    let live = true;
    // A retry after an error shows the loader again; a reload over shown data keeps it until the answer.
    setState((s) => (s.kind === 'error' ? { kind: 'loading' } : s));
    fn().then(
      (data) => { if (live && id === latest.current) setState({ ...data, kind: 'ok' } as LoadState<T>); },
      (e: unknown) => {
        if (!live || id !== latest.current) return;
        if (worthLogging(e)) reportError(scope, e);
        setState({ kind: 'error', message: loadFailedMessage(e) });
      },
    );
    return () => { live = false; };
  // `fn` is a new closure each render; the caller's deps say when it really changed.
  }, [...deps, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return [state, reload];
}
