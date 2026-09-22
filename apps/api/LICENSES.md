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
