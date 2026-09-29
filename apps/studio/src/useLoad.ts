import { useCallback, useEffect, useState } from 'react';
import { HttpError } from './api';

export type Load<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T };

/** One request per block, so one failing block never blanks the page (Principle IV). */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): Load<T> & { retry: () => void } {
  const [load, setLoad] = useState<Load<T>>({ state: 'loading' });
  const [n, setN] = useState(0);
  const retry = useCallback(() => setN((x) => x + 1), []);
  useEffect(() => {
    let live = true;
    setLoad({ state: 'loading' });
    fn().then(
      (data) => live && setLoad({ state: 'ready', data }),
      (e: unknown) => live && setLoad({ state: 'error', message: e instanceof HttpError ? e.message : 'Something went wrong.' }),
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...load, retry };
}
