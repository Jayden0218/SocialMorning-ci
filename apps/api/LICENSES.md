# apps/api — dependency licences

Checked with `npm view <pkg> license` on 2026-09-21 (constitution, Principle III).

| Package | Version | Licence |
|---|---|---|
| hono | 4.13.8 | MIT |
| @hono/node-server | 2.1.1 | MIT |
| zod | 4.6.5 | MIT |
| postgres | 3.4.9 | Unlicense |
| @electric-sql/pglite (dev) | 0.5.8 | Apache-2.0 |
| tsx (dev) | 4.23.15 | MIT |
| c8 (dev, social-core) | 10.x | ISC |
| esbuild (dev) | 0.28.2 | MIT |

M4 (2026-09-21) added no dependency to `apps/api`: clips, follows, feed, listened and profiles use Hono, zod, `postgres` and `@socialmorning/social-core` already listed.

M5 (2026-09-22) added no dependency: the catalogue is Apple's public search/lookup/charts (no key); `@socialmorning/feed-parser` (this repo) is now also used server-side for picks and "new on this show".

M12 (2026-09-29) — the share card (FR-034) and voice posts (FR-104). Licences checked with `npm view <pkg> license`; sizes are npm's `dist.unpackedSize`.

| Package | Version | Licence | Size | Why |
|---|---|---|---|---|
| satori | 0.32.0 | MPL-2.0 | ~5.6 MB unpacked | Lays out the share card and turns its text into SVG paths. **Not 0.33.x**: 0.33 added `harfbuzzjs`, which reads `hb.wasm` from its own folder at run time — a file the one-file esbuild bundle does not carry |
| ↳ yoga-layout | 3.2.1 | MIT | — | satori's flexbox; its WebAssembly is inlined as base64 JS, so it bundles |
| @resvg/resvg-wasm | 2.6.2 | MPL-2.0 | 2.5 MB (`index_bg.wasm` 2.4 MB) | SVG → PNG. Pure WebAssembly: no native build on Vercel or the runner |
| @fontsource/inter | 5.3.0 | OFL-1.1 (font) | 4.3 MB unpacked; 2 files used, 30 KB each | Inter 400/700 Latin `.woff`, inlined into the bundle |
| @vercel/blob | 2.8.0 | Apache-2.0 | (already a dependency since M13) | `put`/`del` for the voice store `socialmorning-voice` |

MPL-2.0 is file-level copyleft: we ship the packages unmodified, so nothing of ours becomes MPL. The bundle
(`api/index.js`) grew to ~7.0 MB with the wasm and fonts inlined (`--loader:.wasm=binary --loader:.woff=binary`);
Vercel's function limit is 250 MB. Scripts other than Latin are fetched per card from Google Fonts' CSS2 API
(Noto Sans families, OFL-1.1), subset to the characters on the card — no key, no account, nothing billable.
