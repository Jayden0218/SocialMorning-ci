# SocialMorning — CI mirror

Test mirror of a private repository. Only the code the gate needs is here; the product
documentation, specs and research are not. Source commit: `49ae96e`.

Every push runs `.github/workflows/gate.yml` (the same checks as `scripts/gate.sh`), as parallel jobs:

- **typecheck** — every workspace; each package's `src/` also alone, with no Node or DOM types.
- **api tests** — three shards (`node --test --test-shard`).
- **checks** — mobile tests with coverage (`src/playback` 100 % branches), Studio tests,
  feed-parser tests, social-core and player-core with 100 % branch coverage, the a11y audit,
  the token and text-colour checks, the backup preflight guard, and the Studio production build.

Also on every push: the Studio end-to-end run (`e2e.yml`) and, when `apps/mobile` changes, the Android compile.
The rest (iOS, Android debug, iOS journey, recommendations, release) run on demand or on a schedule.
