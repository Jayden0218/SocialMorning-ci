# packages — shared rules, no UI

Pure TypeScript used by the phone app and the server. Each has its own tests; player-core and
social-core must keep 100 % branch coverage.

| Package | What it does |
|---|---|
| `feed-parser/` | Reads a podcast RSS feed into shows and episodes (dates, durations, chapters links) |
| `player-core/` | What plays next, sleep timer, speed, queue, downloads allowed, what is new (inbox), chapters, transcripts |
| `social-core/` | Rules the phone and server must agree on: clips, heat curve, ranking, feed, moderation, safety, search, stats |
