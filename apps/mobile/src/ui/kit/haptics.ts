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

/**
 * M22 US17 (T074): Settings › Appearance › "Vibration". On by default; off turns every tick
 * into a no-op. Read once at start-up (src/ui/shell/startupExtras.ts) and on the switch.
 */
export const HAPTICS_KEY = 'pref.haptics';
let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function hapticsOn(s: { get(key: string): string | undefined }): boolean {
  return s.get(HAPTICS_KEY) !== '0';
}

/** The lightest tick (the one a picker wheel makes). */
export function tick(): void {
  if (!enabled) return;
  load()?.selectionAsync().catch(() => undefined);
}
