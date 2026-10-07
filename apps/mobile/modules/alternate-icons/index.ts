// Changes the app icon to one of our own designs (Sunrise, Ocean, Forest, Plum) or back to the default.
/**
 * M22 T076 (moved from specs/021 T070–T072). Our own local module, not expo-alternate-app-icons:
 * that package's peer `expo >=53` rejects our prerelease expo 58.0.0-preview.3 (npm ERESOLVE).
 *   - iOS: `UIApplication.setAlternateIconName` (`ios/AlternateIconsModule.swift`); the icon sets
 *     are added to the asset catalog at prebuild by `plugin.js`.
 *   - Android: one launcher activity-alias on, the rest off (`android/…/AlternateIconsModule.kt`);
 *     `plugin.js` writes the aliases and the mipmaps.
 *
 * `requireOptionalNativeModule`: in Jest, on the web and in a build made before this module there
 * is no native side; `isAvailable()` is then false and Settings › Appearance hides the section.
 */
import { requireOptionalNativeModule } from 'expo';

export const ALT_ICONS = ['Sunrise', 'Ocean', 'Forest', 'Plum'] as const;
export type AltIcon = (typeof ALT_ICONS)[number];

type Native = {
  supportsAlternateIcons(): Promise<boolean>;
  getIconName(): Promise<string | null>;
  setIconName(name: string | null): Promise<string | null>;
};

const native = (): Native | null => {
  try { return requireOptionalNativeModule<Native>('AlternateIcons'); } catch { return null; }
};

/** True when this build has the native module (not yet whether the phone supports it). */
export function isAvailable(): boolean {
  return native() != null;
}

/** True when the module is there and the phone (iOS) or the manifest (Android) can switch icons. */
export async function supported(): Promise<boolean> {
  const m = native();
  if (m == null) return false;
  try { return (await m.supportsAlternateIcons()) === true; } catch { return false; }
}

/** The icon in use; null is the default. */
export async function currentIcon(): Promise<AltIcon | null> {
  const m = native();
  if (m == null) return null;
  try {
    const name = await m.getIconName();
    return (ALT_ICONS as readonly string[]).includes(name ?? '') ? (name as AltIcon) : null;
  } catch {
    return null;
  }
}

/** Switch to `name` (null = default). False when the phone refused or there is no module. */
export async function setIcon(name: AltIcon | null): Promise<boolean> {
  const m = native();
  if (m == null) return false;
  try { await m.setIconName(name); return true; } catch { return false; }
}
