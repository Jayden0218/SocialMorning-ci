/**
 * US1 #6: the text and the captured moment survive a trip through sign-in, a
 * failed post, or a killed app. One draft per episode; debounced writes so a
 * keystroke storm is one SQLite row update.
 */
import type { DraftRow, DraftStore } from '../storage/types';

export type Drafts = {
  load(episodeId: string): DraftRow | undefined;
  /** Debounced (500 ms) save; `flush` writes immediately. */
  save(d: Omit<DraftRow, 'savedAt'>): void;
  flush(): void;
  clear(episodeId: string): void;
};

export function createDrafts(store: DraftStore, now: () => number, debounceMs = 500): Drafts {
  let pending: Omit<DraftRow, 'savedAt'> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    if (pending) { store.put({ ...pending, savedAt: now() }); pending = undefined; }
  };
  return {
    load: (id) => store.get(id),
    save(d) {
      pending = d;
      if (timer === undefined) timer = setTimeout(flush, debounceMs);
    },
    flush,
    clear(id) {
      if (pending?.episodeId === id) pending = undefined;
      store.clear(id);
    },
  };
}
