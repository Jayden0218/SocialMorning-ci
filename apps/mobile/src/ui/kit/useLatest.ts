// Hooks for handlers made once: a getter for the newest value, and a mutable cell that never causes a render.
import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A getter for the newest `value`, for handlers that are made once (a PanResponder, a listener) and must
 * not close over stale props. The value is stored after each commit, so a handler that runs in an event
 * always sees the latest committed one; nothing reads or writes a ref while rendering.
 */
export function useLatest<T>(value: T): () => T {
  const ref = useRef(value);
  useLayoutEffect(() => { ref.current = value; });
  return useCallback(() => ref.current, []);
}

/** A mutable cell that never causes a render: `[get, set]`, both stable. For gesture scratch values. */
export function useCell<T>(initial: T): readonly [() => T, (next: T) => void] {
  const ref = useRef(initial);
  const get = useCallback(() => ref.current, []);
  const set = useCallback((next: T) => { ref.current = next; }, []);
  return [get, set] as const;
}
