// Loads the two app fonts at start-up, falling back to system fonts.
/**
 * M17 (FR-003, research R5): the Editorial fonts — Lora for display headings (owner, 2026-10-04;
 * was Fraunces, whose long-barred "f" read as a line through the word), Manrope for everything
 * else (both SIL OFL 1.1, read in the packages' LICENSE_FONT files). They load
 * once, as a start-up task behind the splash that `app/_layout.tsx` already holds, so nothing
 * draws before they are ready. If they fail or take too long, start-up goes on and the system
 * fonts are used (guard G-E4).
 *
 * A custom font has one file per weight, and `fontWeight` does not pick between them (Expo
 * fonts doc, SDK 58), so each face is registered under its own name and `familyFor` maps a
 * Text's weight class to that name.
 */
import { loadAsync } from 'expo-font';
import { Lora_600SemiBold, Lora_700Bold } from '@expo-google-fonts/lora';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';

/** Registered names = each file's PostScript name, so the same name works on iOS and Android. */
export const FACES = {
  'Lora-SemiBold': Lora_600SemiBold,
  'Lora-Bold': Lora_700Bold,
  'Manrope-Regular': Manrope_400Regular,
  'Manrope-Medium': Manrope_500Medium,
  'Manrope-SemiBold': Manrope_600SemiBold,
  'Manrope-Bold': Manrope_700Bold,
} as const;

export type Face = keyof typeof FACES;

/** Start-up never waits longer than this for the fonts. */
export const FONT_WAIT_MS = 3000;

let ready = false;
const listeners = new Set<() => void>();
export const fontsStore = {
  get: (): boolean => ready,
  subscribe: (f: () => void): (() => void) => { listeners.add(f); return () => { listeners.delete(f); }; },
};

/**
 * Load the faces. Resolves `true` when they are in, `false` when loading failed or took longer
 * than `FONT_WAIT_MS` — it never rejects, so the start-up task list always settles.
 */
export async function loadFonts(load: (faces: typeof FACES) => Promise<void> = loadAsync, waitMs = FONT_WAIT_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<boolean>((res) => { timer = setTimeout(() => res(false), waitMs); });
  const ok = load(FACES).then(() => true, () => false);
  const won = await Promise.race([ok, late]);
  if (timer !== undefined) clearTimeout(timer);
  if (won) {
    ready = true;
    for (const f of listeners) f();
  }
  return won;
}

/** For tests: back to "not loaded". */
export function resetFontsForTest(): void { ready = false; }

/**
 * The face for a Text's classes: `font-display` → Lora Bold, `font-display-semibold` →
 * Lora SemiBold; otherwise Manrope at the class's weight (`font-medium`, `font-semibold`,
 * `font-bold` / `font-extrabold`, else Regular).
 */
export function familyFor(className: string | undefined): Face {
  const c = ` ${className ?? ''} `;
  // Patterns, not quoted class strings: the token check reads a quoted "font-…" as a style.
  if (/\sfont-display-semibold\s/.test(c)) return 'Lora-SemiBold';
  if (/\sfont-display\s/.test(c)) return 'Lora-Bold';
  if (/\sfont-(bold|extrabold|black)\s/.test(c)) return 'Manrope-Bold';
  if (/\sfont-semibold\s/.test(c)) return 'Manrope-SemiBold';
  if (/\sfont-medium\s/.test(c)) return 'Manrope-Medium';
  return 'Manrope-Regular';
}
