// A light vibration tick; does nothing on an app built before expo-haptics was added.
/**
 * Owner, 2026-10-05 ("when scroll the row, i want the phone has some vibration"). expo-haptics
 * has native code, so an app built before it (the Debug app on the phone today) has no module:
 * loading it throws there. It is loaded once, lazily, and a failure turns every tick into a no-op.
 */
type HapticsModule = { selectionAsync: () => Promise<void> };

let mod: HapticsModule | null | undefined;

function load(): HapticsModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy, so a missing native module cannot crash the import
    mod = require('expo-haptics') as HapticsModule;
  } catch {
    mod = null;
  }
  return mod;
}

/** The lightest tick (the one a picker wheel makes). */
export function tick(): void {
  load()?.selectionAsync().catch(() => undefined);
}
