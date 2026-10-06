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
| ~~nativewind~~ | ~~4.2.7~~ | MIT | removed by M9 (2026-09-27): UniWind replaces it |
| uniwind | 1.12.0 | MIT | M9 styling engine (Tailwind v4), 2026-09-27 |
| react-native-reanimated | 4.7.0 | MIT | Tailwind (nativewind peer; was already installed by expo-router) |
| expo-notifications | 58.0.7 | MIT | Notification permission on the sign-in page, 2026-09-27 |
| @expo/vector-icons | 15.1.1 | MIT | Tab bar and mini player icons (Ionicons font), 2026-09-27 |
| expo-camera | 58.0.3 | MIT | Scanning a QR code from the search page, 2026-09-27 |
| expo-video | 58.0.3 | MIT | The picture for video episodes (spec 010 US5), 2026-09-27 |
| react-native-android-widget | 0.22.1 | MIT | The Android home-screen widget (spec 010 US9), 2026-09-27 |
| @bacons/apple-targets | 5.0.0 | MIT | The iPhone widget and Siri shortcut targets (spec 010 US9; linked only with SOCIALNET_IOS_EXTRAS=1), 2026-09-27 |
| expo-live-activity | 0.4.2 | MIT | The iPhone lock-screen live activity (spec 010 US9; linked only with SOCIALNET_IOS_EXTRAS=1), 2026-09-27 |
| expo-image-picker | 58.0.3 | MIT | Adding images to feedback (spec 010 US6), 2026-09-27 |
| expo-haptics | 58.0.2 | MIT | A light tick as the category row is swiped, 2026-10-05 |
| expo-speech-recognition | 57.1.0 | MIT | M20 US3: the text of a voice post or comment, made by the phone's own speech service while recording (owner "go", 2026-10-05) |
| expo-iap | 5.8.2 | MIT | M20 US6: Google Play purchases (PLUS, paid shows, tips), each checked by the server; switched on when the owner opens a Play account (2026-10-06) |
| androidx.media3:media3-transformer / media3-effect (Google; with media3-common) | 1.9.1 | Apache-2.0 | M19 "Share as video" on Android: the phone's own encoders via Media3 Transformer, the same Media3 version expo-audio already ships (owner approved, 2026-10-05; no FFmpeg) |
| `modules/clip-video` (local Expo module) | — | ours | M19 "Share as video": AVFoundation (iOS) / Media3 Transformer (Android), 2026-10-05 |
| expo-image-manipulator | 58.0.8 | MIT | Shrinking feedback images on the phone (spec 010 US6), 2026-09-27 |
| react-native-worklets | 0.13.0 | MIT | Tailwind (reanimated peer; same) |
| tailwindcss (dev) | 4.x | MIT | Tailwind v4, M9 |
| @gluestack-ui/core | 5.0.15 | MIT | M9 component library, 2026-09-27 |
| @gluestack-ui/utils | 5.0.6 | MIT | M9 (`tva`) |
| gluestack-ui component source | b712c85 | MIT | copied into `src/ui/lib/`, M9 |
| @expo/html-elements | 58.0.x | MIT | M9 (Heading, Actionsheet) |
| @legendapp/motion | 2.5.3 | MIT | M9 (Actionsheet animation) |
| expo-splash-screen | 58.0.x | MIT | M9 iOS i5: the launch screen shows the icon; since 2026-09-29 the only one, held until the first page is drawn |
| expo-font | 58.0.x | MIT | M17: loads the Editorial fonts at start-up (was only a transitive dependency of expo) |
| @expo-google-fonts/lora | 0.4.2 | MIT (package) + OFL-1.1 (font files, © 2011 The Lora Project Authors, Reserved Font Name "Lora" — used unmodified) | The Editorial display serif since 2026-10-04 (owner; replaced Fraunces); licence read in the package's LICENSE_FONT, 2026-10-04 |
| @expo-google-fonts/manrope | 0.4.2 | MIT (package) + OFL-1.1 (font files, © 2018 The Manrope Project Authors) | M17: the Editorial body sans; licence read at github.com/google/fonts ofl/manrope/OFL.txt, 2026-10-03 |
| react-native-svg | 15.15.5 | MIT | M9 (Icon, Badge) — native |
| react-native-safe-area-context | 5.10.0 (^5.9.1) | MIT | M9 (direct; one copy, shared with expo-router) |
| react-aria / react-stately | per @gluestack-ui/core | Apache-2.0 | M9 (transitive) |
| tailwind-variants / tailwind-merge | 0.1.20 / 1.14.0 | MIT | M9 (transitive, via utils) |
| nativewind / react-native-css-interop | 4.2.7 / 0.2.7 | MIT | M9: unused peer of @legendapp/motion — installed, never imported (owner, option a) |

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
