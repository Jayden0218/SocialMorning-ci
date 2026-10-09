# apps/mobile — the phone app

Expo (React Native) app for iPhone and Android. Never build or test it on the laptop:
tests run in the cloud CI, the iPhone app is built in the cloud (see the root `CLAUDE.md`).

| Path | What is in it |
|---|---|
| [`app/`](app/README.md) | The screens. One file = one route. Map: `app/README.md` |
| [`src/`](src/README.md) | Everything the screens use: logic folders and `ui/` parts. Map: `src/README.md` |
| `__tests__/` | Jest tests and guards (run in the cloud only) |
| `__mocks__/` | Jest stand-ins for native modules |
| `scripts/` | Checks the gate runs: a11y audit, colour tokens, text colour, action inventory; token → CSS; legal text sync |
| `m17/` | Data the M17 guards read (surfaces, designs, action inventory) |
| `assets/` | Icons, fonts, images |
| `modules/` | Local native modules. `clip-video`: a clip as an .mp4 made with the phone's own encoders (M19); `audio-route`: the audio-output picker (M21); `watch-link`: WatchConnectivity to the Apple Watch app (M21, iPhone only) |
| `plugins/`, `targets/` | Native config: Expo config plugins; iPhone widget / Siri targets; `targets/watch`: the Apple Watch app (SwiftUI, M21 US12, built only with `SOCIALNET_IOS_EXTRAS=1`) |
| `global.css` | Tailwind theme (generated from `src/design/tokens.ts` — do not edit the generated block) |
| `jest.uniwind.*.js` | Make Jest read Tailwind classes the way the app does |

Imports: `@/x` means `src/x`. A file in the same folder is `./x`.

## Two apps: prod and dev, side by side

`APP_VARIANT` in `app.config.js` picks the app. Unset (or `prod`) is the real app, exactly as before.
`dev` is a second app that installs **beside** it, with its own id, name, icon and data.

| | prod (default) | dev (`APP_VARIANT=dev`) |
|---|---|---|
| iOS bundle id / Android package | `app.socialmorning.mobile` | `app.socialmorning.mobile.dev` |
| Name on the home screen | SocialNet | SocialNet Dev (red DEV badge, `assets/dev/`) |
| URL scheme | `socialmorning://` | `socialmorning-dev://` |
| App Group (iOS extras) | `group.app.socialmorning.mobile` | `group.app.socialmorning.mobile.dev` |
| API address | app.json `extra.apiBaseUrl` | `SOCIALNET_DEV_API_BASE_URL`; unset → the **production** API (no dev backend until the AWS lane) |
| https clip links (`/c/…`) | open in this app | not claimed, so they keep opening the real app |
| Purchases | Google Play, as before | never: Wallet says "not available" |
| Marker | none | "DEV" beside the version in Settings › About |

Build and install (never on the laptop; the builds run in the cloud):

```sh
# iPhone: build in the mirror, then sign and install over USB
gh workflow run ios.yml -R Jayden0218/SocialMorning-ci --ref main -f variant=dev   # or variant=prod
scripts/ios-install.sh <run-id> [--debug]   # reads the bundle id from the app; its help says how to get the dev profile

# Android: an APK signed with the template's debug key (artifact socialnet-release-apk-dev)
gh workflow run android-compile.yml -R Jayden0218/SocialMorning-ci --ref main -f variant=dev
# or with EAS: eas build -p android --profile development   (needs its own EAS credentials for the .dev package)

# Metro for a dev Debug build
APP_VARIANT=dev SOCIALNET_DEV_API_BASE_URL=https://… npx expo start
```

The free Apple team allows **10 App IDs per 7 days**; dev adds 1 (4 with the extras). The DEV icons
are drawn by `scripts/render-dev-icons.mjs` from today's icons. Guard: `__tests__/app-variant.test.ts`.
