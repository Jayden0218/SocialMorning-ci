# SocialMorning — CI mirror

Test mirror of a private repository. Only the code the gate needs is here; the product
documentation, specs and research are not. Source commit: `d8ebb03b`.

Every push runs `.github/workflows/gate.yml`, which calls `scripts/gate.sh` once per job (the list of checks lives only there):

- **typecheck** — every workspace; each package's `src/` also alone, with no Node or DOM types; then oxlint with `--max-warnings`.
- **api tests** — three shards (`node --test --test-shard`).
- **checks** — mobile tests with coverage (`src/playback` 100 % branches), Studio tests,
  feed-parser tests, social-core and player-core with 100 % branch coverage, the a11y audit,
  the token and text-colour checks, the backup preflight guard, and the Studio production build.

Only when their paths change: the Studio end-to-end run (`e2e.yml`: apps/studio, apps/api, packages), the
infra template check (`infra.yml`: apps/api/infra), CodeQL (`codeql.yml`: apps/api, packages; also weekly) and the
Android compile (apps/mobile). The rest (iOS, Android debug, iOS journey, recommendations, release) run on demand or on a schedule.
