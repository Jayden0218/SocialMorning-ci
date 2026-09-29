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
const TAILWIND_ADDITIONS = ['nativewind', 'react-native-reanimated', 'react-native-worklets'];

/** Notification permission on the sign-in page (owner, 2026-09-27). MIT (LICENSES.md). */
const NOTIFY_ADDITIONS = ['expo-notifications'];

/** Tab bar and mini player icons (owner, 2026-09-27). A font over expo-font; MIT (LICENSES.md). */
const ICON_ADDITIONS = ['@expo/vector-icons'];

/** Scanning a QR code on the search page (owner, 2026-09-27). MIT (LICENSES.md). */
const SCAN_ADDITIONS = ['expo-camera'];

/** M10b US5: the picture for video episodes (spec 010, research R7). MIT (LICENSES.md). */
const VIDEO_ADDITIONS = ['expo-video'];

/** M10b US6: images in feedback — pick and shrink on the phone (research R8). MIT (LICENSES.md). */
const FEEDBACK_ADDITIONS = ['expo-image-picker', 'expo-image-manipulator'];

/** M10b US9: widgets (Android + iOS) and the iPhone live activity (research R11). MIT (LICENSES.md). */
const OUTSIDE_ADDITIONS = ['react-native-android-widget', '@bacons/apple-targets', 'expo-live-activity'];

/** One launch screen: the native one draws the same icon as the in-app Splash (owner, 2026-09-29). MIT (LICENSES.md). */
const SPLASH_ADDITIONS = ['expo-splash-screen'];

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
  expect(added.sort()).toEqual([...M7_ADDITIONS, ...TAILWIND_ADDITIONS, ...NOTIFY_ADDITIONS, ...SCAN_ADDITIONS, ...ICON_ADDITIONS, ...VIDEO_ADDITIONS, ...FEEDBACK_ADDITIONS, ...OUTSIDE_ADDITIONS, ...SPLASH_ADDITIONS].sort());
  expect(removed).toEqual([]);
});
