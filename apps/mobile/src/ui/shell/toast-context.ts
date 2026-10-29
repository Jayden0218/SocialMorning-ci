// The context that carries the app's one toast function; read by useToast and by parts that may sit outside the providers.
import { createContext, useSyncExternalStore } from 'react';

export const ToastContext = createContext<((message: string) => void) | undefined>(undefined);

/**
 * M31 F14 (wave-7 defect 1): a kit `ActionSheet` is a native Modal, drawn above the root view where the toast host lives, so a toast
 * raised from a sheet was hidden behind it. The host publishes the message it is showing (and where it sits) here; an open sheet
 * registers itself, draws the toast inside its own Modal and the root host stops drawing its copy. A module store, not a provider: the
 * sheets are siblings of the host, not its children, and AppProviders gains nothing. The host still speaks the message exactly once.
 */
export type ToastLayer = { message: string | undefined; bottom: number; sheets: number };
let layer: ToastLayer = { message: undefined, bottom: 0, sheets: 0 };
const listeners = new Set<() => void>();
const set = (next: Partial<ToastLayer>): void => {
  const merged = { ...layer, ...next };
  if (merged.message === layer.message && merged.bottom === layer.bottom && merged.sheets === layer.sheets) return;
  layer = merged;
  listeners.forEach((l) => l());
};

/** The host says what it shows and its `bottom` (undefined message: nothing). */
export function publishToast(message: string | undefined, bottom: number): void { set({ message, bottom }); }
/** A sheet that is a Modal is on screen; the returned function says it is gone. */
export function registerSheet(): () => void {
  set({ sheets: layer.sheets + 1 });
  return () => set({ sheets: Math.max(0, layer.sheets - 1) });
}
export function useToastLayer(): ToastLayer {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => layer, () => layer);
}
