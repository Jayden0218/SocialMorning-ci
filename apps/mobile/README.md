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
