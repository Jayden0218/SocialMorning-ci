# apps/api — the server

Hono on Vercel (`https://socialmorning-api.vercel.app`), Postgres on Neon. Deploy from the repo root (see `CLAUDE.md`).

| Path | What is in it |
|---|---|
| `src/app.ts` | Builds the app: every route mounted in one place |
| `src/server.ts`, `src/vercel-entry.ts` | Start it locally / on Vercel |
| `src/routes/` | One file per API area (comments, clips, follows, discover, library…) |
| `src/db/repos/` | One file per table group: the SQL lives here, nowhere else |
| `src/db/migrations/`, `src/db/migrate.ts` | Database changes, numbered, run in order |
| `src/auth/` | Passwords, sessions, sign-in codes, admin and Studio sessions |
| `src/catalog/` | Apple podcast search, feeds, genres, curated collections |
| `src/pages/` | Server-drawn web pages: share cards for clips/episodes/shows, legal, `/mod` |
| `src/heat/`, `src/share/`, `src/voice/`, `src/storage/`, `src/mail/` | Heat curve rebuild, share links, voice posts, blob storage, email |
| `test/` | Tests (pglite database + a fake Apple; run in the cloud) |
| `scripts/` | End-to-end server and journey replays used by CI |
| `picks.json`, `collections.json` | Editorial picks and collections the server serves |
