// Checks the app's dependencies: no copied reference libraries, expo-audio still used.
/**
 * M7 took the reference's *look*. It must never take its *runtime*.
 *
 * The reference (CodeWithGionatha-Labs/music-player) plays audio with
 * `react-native-track-player` and extracts artwork colour with
 * `react-native-image-colors`. M1's expo-audio player is the most expensive
 * thing in this project to re-earn — 10 device rows and a 100 %-branch
 * adapter — so a restyle that quietly pulls in their player would undo a
 * milestone while every screenshot still looked right.
 *
 * G7. The break that turns it red: add `react-native-track-player` to
 * package.json.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

/** Everything the reference depends on that we deliberately did not take. */
const REFERENCE_ONLY = [
  'react-native-track-player',
  'react-native-image-colors',
  'react-native-reanimated-carousel',
  '@react-native-community/blur',
  'react-native-vector-icons',
  'react-native-linear-gradient',   // theirs; ours is expo-linear-gradient
];

/** The mobile app's dependencies as M6 closed, before any M7 work. */
const M6_DEPENDENCIES = [
  '@socialmorning/feed-parser',
  '@socialmorning/player-core',
  '@socialmorning/social-core',
  'expo',
  'expo-audio',
  'expo-network',
  'expo-router',
  'expo-secure-store',
  'expo-sqlite',
  'expo-status-bar',
  'react',
  'react-native',
];

/** The two M7 is allowed to add (plan, Technical Context; LICENSES.md). */
const M7_ADDITIONS = ['expo-blur', 'expo-linear-gradient'];

/**
 * Tailwind (2026-09-27, the owner's call): NativeWind 4 and its two runtime peers.
 * Reanimated and Worklets were already in the tree through expo-router; listing them
 * directly is what makes autolinking build them for certain. All MIT (LICENSES.md).
 */
const TAILWIND_ADDITIONS = ['react-native-reanimated', 'react-native-worklets'];

/**
 * M9 (2026-09-27, the owner's call): the styling engine is UniWind, not NativeWind — Tailwind
 * v4 is what gluestack-ui v5 needs. Pinned exactly: the Jest setup reads its compiled
 * internals (research R1). MIT (LICENSES.md).
 */
const M9_ENGINE = ['uniwind'];

/**
 * M9 (owner: gluestack-ui v5 everywhere, 2026-09-27): the component library's runtime and
 * the native peers its copied components import. All MIT (LICENSES.md). NativeWind comes
 * back as an unused peer of @legendapp/motion (owner chose to accept it, research R5), so it
 * is allowed in the lockfile but never as a direct dependency and never imported.
 */
const M9_LIBRARY = ['@gluestack-ui/core', '@gluestack-ui/utils', '@expo/html-elements', '@legendapp/motion', 'react-native-svg', 'react-native-safe-area-context'];

/** Notification permission on the sign-in page (owner, 2026-09-27). MIT (LICENSES.md). */
const NOTIFY_ADDITIONS = ['expo-notifications'];

/** Tab bar and mini player icons (owner, 2026-09-27). A font over expo-font; MIT (LICENSES.md). */
const ICON_ADDITIONS = ['@expo/vector-icons'];

/** Scanning a QR code on the search page (owner, 2026-09-27). MIT (LICENSES.md). */
const SCAN_ADDITIONS = ['expo-camera'];

/** M9 iOS i5 (2026-09-27): the launch screen shows the icon, not a plain white page; since
 * 2026-09-29 it is the only launch screen, held until the first page is drawn. MIT (LICENSES.md). */
const SPLASH_ADDITIONS = ['expo-splash-screen'];

/** M10b US5: the picture for video episodes (spec 010, research R7). MIT (LICENSES.md). */
const VIDEO_ADDITIONS = ['expo-video'];

/** M10b US6: images in feedback — pick and shrink on the phone (research R8). MIT (LICENSES.md). */
const FEEDBACK_ADDITIONS = ['expo-image-picker', 'expo-image-manipulator'];

/** M10b US9: widgets (Android + iOS) and the iPhone live activity (research R11). MIT (LICENSES.md). */
const OUTSIDE_ADDITIONS = ['react-native-android-widget', '@bacons/apple-targets', 'expo-live-activity'];
/** M17 (research R5): the Editorial fonts — Lora (was Fraunces until 2026-10-04) + Manrope (OFL-1.1), loaded through expo-font. */
const FONT_ADDITIONS = ['expo-font', '@expo-google-fonts/lora', '@expo-google-fonts/manrope'];
/** Owner, 2026-10-05: a light tick as the category row is swiped. Pinned at 58.0.2: 58.0.3+ drop the android publication version that autolinking 58.0.2 needs (Gradle: "Field 'version' is required", run 37245799305); MIT (LICENSES.md). */
const HAPTICS_ADDITIONS = ['expo-haptics'];
/**
 * M20 (owner "go" on gate G0, 2026-10-05; research R1/R9) — G-M20-9: the M20 packages, added one
 * by one as their wave needs them. W2: speech-to-text for voice posts and comments; W4: Google Play
 * purchases (owner 2026-10-06: build now, Play account later). MIT (LICENSES.md).
 * The break that turns it red: add any package not named here.
 */
const M20_ADDITIONS = ['expo-speech-recognition', 'expo-iap'];

/** M21 (research R7): already linked through expo-router (Podfile.lock RNGestureHandler 3.3.0); listed directly for the sheet and the player gestures. */
const M21_ADDITIONS = ['react-native-gesture-handler'];

it('no reference dependency is installed, anywhere', () => {
  const installed = new Set([
    ...Object.keys(pkg.dependencies),
    ...Object.keys(pkg.devDependencies),
  ]);
  expect(REFERENCE_ONLY.filter((name) => installed.has(name))).toEqual([]);
});

it('expo-audio is still the runtime', () => {
  expect(pkg.dependencies['expo-audio']).toBeDefined();
});

it('M7 added exactly expo-blur and expo-linear-gradient, Tailwind its three, notifications its one, the scanner its one, and removed nothing', () => {
  const now = Object.keys(pkg.dependencies).sort();
  const added = now.filter((name) => !M6_DEPENDENCIES.includes(name));
  const removed = M6_DEPENDENCIES.filter((name) => !now.includes(name));
  expect(added.sort()).toEqual([...M7_ADDITIONS, ...TAILWIND_ADDITIONS, ...NOTIFY_ADDITIONS, ...SCAN_ADDITIONS, ...ICON_ADDITIONS, ...VIDEO_ADDITIONS, ...FEEDBACK_ADDITIONS, ...M9_ENGINE, ...M9_LIBRARY, ...SPLASH_ADDITIONS, ...OUTSIDE_ADDITIONS, ...FONT_ADDITIONS, ...HAPTICS_ADDITIONS, ...M20_ADDITIONS, ...M21_ADDITIONS].sort());
  expect(removed).toEqual([]);
});

it('M9: NativeWind is no longer a dependency, and UniWind is pinned exactly', () => {
  expect(pkg.dependencies['nativewind']).toBeUndefined();
  expect(pkg.dependencies['uniwind']).toMatch(/^\d+\.\d+\.\d+$/);
});
