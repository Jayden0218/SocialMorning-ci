# apps/mobile — dependency licences

Checked with `npm view <pkg> license` on 2026-09-21 (constitution, Principle III).

| Package | Version | Licence | Since |
|---|---|---|---|
| expo | 58.0.0-preview.3 | MIT | M1 |
| expo-audio | 58.0.0 | MIT | M1 |
| expo-router | 58.x | MIT | M1 |
| expo-sqlite | 58.x | MIT | M1 |
| expo-secure-store | 58.0.0 | MIT | M3 |
| expo-file-system (incl. `/legacy` sub-path, research R1) | 58.0.0 | MIT | M2 |
| expo-network | 58.0.0 | MIT | M2 |
| expo-linking (already installed with expo-router; first used by M4's clip links) | 58.0.3 | MIT | M4 |
| fast-xml-parser (via feed-parser) | 5.x | MIT | M1 |
| expo-blur | 58.0.1 | MIT | M7 |
| expo-linear-gradient | 58.0.1 | MIT | M7 |
| nativewind | 4.2.7 | MIT | Tailwind, 2026-09-27 |
| react-native-css-interop | 0.2.7 | MIT | Tailwind (via nativewind) |
| react-native-reanimated | 4.7.0 | MIT | Tailwind (nativewind peer; was already installed by expo-router) |
| expo-notifications | 58.0.7 | MIT | Notification permission on the sign-in page, 2026-09-27 |
| @expo/vector-icons | 15.1.1 | MIT | Tab bar and mini player icons (Ionicons font), 2026-09-27 |
| expo-camera | 58.0.3 | MIT | Scanning a QR code from the search page, 2026-09-27 |
| expo-video | 58.0.3 | MIT | The picture for video episodes (spec 010 US5), 2026-09-27 |
| react-native-android-widget | 0.22.1 | MIT | The Android home-screen widget (spec 010 US9), 2026-09-27 |
| @bacons/apple-targets | 5.0.0 | MIT | The iPhone widget and Siri shortcut targets (spec 010 US9; linked only with SOCIALNET_IOS_EXTRAS=1), 2026-09-27 |
| expo-live-activity | 0.4.2 | MIT | The iPhone lock-screen live activity (spec 010 US9; linked only with SOCIALNET_IOS_EXTRAS=1), 2026-09-27 |
| expo-image-picker | 58.0.7 | MIT | Adding images to feedback (spec 010 US6), 2026-09-27 |
| expo-image-manipulator | 58.0.8 | MIT | Shrinking feedback images on the phone (spec 010 US6), 2026-09-27 |
| react-native-worklets | 0.13.0 | MIT | Tailwind (reanimated peer; same) |
| tailwindcss (dev) | 3.4.19 | MIT | Tailwind |

**Third-party marks (not code), 2026-09-27.** `assets/google-g.png` is Google's "G", cut
unchanged from Google's own sign-in button kit
(`developers.google.com/static/identity/images/signin-assets.zip`, iOS @3x, Light, no
text). Google's branding guidelines allow it on a custom "Continue with Google" button if
it is the standard colour version, at its supplied size (20 pt from the @3x file), on white. The Facebook mark is
Ionicons' `logo-facebook` (MIT, above), tinted #1877F2.

M4 (2026-09-21) added **no** dependency: the share sheet is React Native's built-in `Share`, the clip link routes through expo-router and expo-linking, both already present.


## M7 — where the look came from

The app's visual design was **re-implemented from**, not copied out of,
[CodeWithGionatha-Labs/music-player](https://github.com/CodeWithGionatha-Labs/music-player)
(MIT, © 2024 gionatha) — an Apple Music–inspired Expo player read from its repository on
2026-09-24.

**Nothing was copied.** No file, style sheet or code fragment of that project is present
here; its decisions were read the way one reads a colour off a screenshot, and then
written against our own components, our own data and our own accessibility work. MIT's
attribution clause is therefore not engaged — this note is a courtesy, because it is
where the look came from.

**Taken as decisions**: a black background with white text and one muted grey; a single
accent; a four-step type scale; one horizontal screen padding; large blurred transparent
headers; big rounded artwork over a gradient drawn from the artwork itself; a hairline row
separator; a floating mini player above a bottom tab bar.

**Deliberately changed, and why**:

| Theirs | Ours | Why |
|---|---|---|
| heat-bar-style opacity 30 % | **40 %** | 30 % white on black measures **2.45** — under the 3:1 floor for anything carrying information (research R1) |
| — | blue `#0645ad` and dark red `#b00020` dropped | they measure 2.46 and 2.87 on black: illegible |
| tabs: Songs · Artists · Playlists | **Library · Discover · Following** | our destinations, not theirs |
| `react-native-track-player` | **`expo-audio`, unchanged** | M1's player is the most expensive thing in this project to re-earn; none of their playback stack is here |
