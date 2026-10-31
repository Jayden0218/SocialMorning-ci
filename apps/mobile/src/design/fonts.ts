// Loads the two app fonts at start-up, falling back to system fonts.
/**
 * M31 (T021, research T020 §1): the Pulse fonts — Unbounded for display, Geist for the interface,
 * Geist Mono for numerals and timestamps (all SIL OFL 1.1, read in the packages' LICENSE_FONT
 * files; replaces M17's Lora + Manrope). They load once, as a start-up task behind the splash that
 * `app/_layout.tsx` already holds, so nothing draws before they are ready. If they fail or take
 * too long, start-up goes on and the system fonts are used (guard G-E4).
 *
 * A custom font has one file per weight, and `fontWeight` does not pick between them (Expo
 * fonts doc, SDK 58), so each face is registered under its own name and `familyFor` maps a
 * Text's classes to that name. Faces: Unbounded 600 / 700 / 800, Geist 400 / 500 / 600 / 700,
 * Geist Mono 400 / 500 / 600 (the drawings' mono 700, used five times, is drawn as 600).
 */
import { loadAsync } from 'expo-font';
import { Unbounded_600SemiBold, Unbounded_700Bold, Unbounded_800ExtraBold } from '@expo-google-fonts/unbounded';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium, GeistMono_600SemiBold } from '@expo-google-fonts/geist-mono';

/** Registered names = each file's PostScript name, so the same name works on iOS and Android. */
export const FACES = {
  'Unbounded-SemiBold': Unbounded_600SemiBold,
  'Unbounded-Bold': Unbounded_700Bold,
  'Unbounded-ExtraBold': Unbounded_800ExtraBold,
  'Geist-Regular': Geist_400Regular,
  'Geist-Medium': Geist_500Medium,
  'Geist-SemiBold': Geist_600SemiBold,
  'Geist-Bold': Geist_700Bold,
  'GeistMono-Regular': GeistMono_400Regular,
  'GeistMono-Medium': GeistMono_500Medium,
  'GeistMono-SemiBold': GeistMono_600SemiBold,
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

function markReady(): void {
  if (ready) return;
  ready = true;
  for (const f of listeners) f();
}

/**
 * Load the faces. Resolves `true` when they are in, `false` when loading failed or took longer
 * than `FONT_WAIT_MS` — it never rejects, so the start-up task list always settles.
 */
export async function loadFonts(load: (faces: typeof FACES) => Promise<void> = loadAsync, waitMs = FONT_WAIT_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<boolean>((res) => { timer = setTimeout(() => res(false), waitMs); });
  const ok = load(FACES).then(() => true, () => false);
  // Owner, 2026-10-04 ("why did the font change back?"): fonts that arrived after the wait were
  // thrown away for the whole session — in a Debug build they come over the cable from Metro and
  // a reload could miss the 3 s. Start-up still waits at most FONT_WAIT_MS; a late arrival now
  // switches the app to the fonts as soon as they are in.
  void ok.then((v) => { if (v) markReady(); });
  const won = await Promise.race([ok, late]);
  if (timer !== undefined) clearTimeout(timer);
  if (won) markReady();
  return won;
}

/** For tests: back to "not loaded". */
export function resetFontsForTest(): void { ready = false; }

/**
 * The face for a Text's classes (the Pulse type scale, `typeScale` in tokens.ts):
 *   `font-display`                       → Unbounded Bold (700)
 *   `font-display-semibold`              → Unbounded SemiBold (600), as `font-display font-semibold`
 *   `font-display font-extrabold`        → Unbounded ExtraBold (800), `font-display font-black` too
 *   `font-mono`                          → Geist Mono Medium (500); with `font-normal` Regular (400);
 *                                          with `font-semibold` / `font-bold` SemiBold (600)
 *   otherwise Geist at the class's weight (`font-medium`, `font-semibold`, `font-bold`;
 *   `font-extrabold` / `font-black` → Bold; else Regular).
 */
export function familyFor(className: string | undefined): Face {
  const c = ` ${className ?? ''} `;
  const has = (re: RegExp) => re.test(c);
  // Patterns, not quoted class strings: the token check reads a quoted "font-…" as a style.
  if (has(/\sfont-display-semibold\s/)) return 'Unbounded-SemiBold';
  if (has(/\sfont-display\s/)) {
    if (has(/\sfont-(extrabold|black)\s/)) return 'Unbounded-ExtraBold';
    if (has(/\sfont-semibold\s/)) return 'Unbounded-SemiBold';
    return 'Unbounded-Bold';
  }
  if (has(/\sfont-mono\s/)) {
    if (has(/\sfont-(semibold|bold|extrabold|black)\s/)) return 'GeistMono-SemiBold';
    if (has(/\sfont-normal\s/)) return 'GeistMono-Regular';
    return 'GeistMono-Medium';
  }
  if (has(/\sfont-(bold|extrabold|black)\s/)) return 'Geist-Bold';
  if (has(/\sfont-semibold\s/)) return 'Geist-SemiBold';
  if (has(/\sfont-medium\s/)) return 'Geist-Medium';
  return 'Geist-Regular';
}
