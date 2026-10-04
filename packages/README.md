# packages — shared rules, no UI

Pure TypeScript used by the phone app and the server. Each has its own tests; player-core and
social-core must keep 100 % branch coverage.

| Package | What it does |
|---|---|
| `feed-parser/` | Reads a podcast RSS feed into shows and episodes (dates, durations, chapters links) |
| `player-core/` | What plays next, sleep timer, speed, queue, downloads allowed, what is new (inbox), chapters, transcripts |
| `social-core/` | Rules the phone and server must agree on: clips, heat curve, ranking, feed, moderation, safety, search, stats |

## File map

Every code file, one plain line each. Each file also starts with the same sentence as a `//` comment — change both together.

### `feed-parser/src/` — reads a podcast RSS feed

| File | What it does |
|---|---|
| `duration.ts` | Reads episode lengths and dates from podcast feeds, refusing values it cannot trust. |
| `index.ts` | Entry point that exports the feed parser and its types. |
| `parse-feed.ts` | Turns a podcast RSS feed into a show and its list of episodes. |
| `types.ts` | Data shapes for a parsed show, episode, transcript and sound clip. |

### `player-core/src/` — playing rules: queue, speed, timer, downloads, inbox

| File | What it does |
|---|---|
| `chapters.ts` | Reads episode chapter lists and finds the chapter at a given time. |
| `downloads.ts` | Decides if a download fits the storage limit and which one starts next. |
| `inbox.ts` | Decides which new episodes from subscribed shows belong in the inbox. |
| `index.ts` | Entry point exporting the player rules: queue, speed, timer, downloads, inbox. |
| `queue.ts` | Play queue rules: add, move, remove, the 300 limit, and what plays next. |
| `speed.ts` | Keeps playback speed between 0.5 and 3.0 and picks each show's speed. |
| `timer.ts` | Sleep timer rules: set it, time left, when it fires, end of episode. |
| `transcript.ts` | Reads transcripts in SRT, VTT, JSON or text and finds the current line. |
| `types.ts` | Data shapes for the queue, downloads, sleep timer, inbox and chapters. |

### `social-core/src/` — social rules the phone and server share

| File | What it does |
|---|---|
| `clip.ts` | Rules for clips as time ranges: suggest one, check its length, adjust edges. |
| `completion.ts` | Decides if a listener finished an episode: 90 percent heard across all sessions. |
| `cover.ts` | The made-for-you cover: two letters from the show's name on one of seven soft colours. |
| `discover.ts` | Ranks episodes by how much people listened and talked, then fills with trending. |
| `empty.ts` | The text and action for each empty screen, and loading and timeout timings. |
| `feed.ts` | Following feed rules: when a listen is posted, the order, and unread count. |
| `hash.ts` | A simple string hash that runs on the phone, used for episode ids. |
| `heat.ts` | Splits an episode into 100 parts and scales reaction counts into a curve. |
| `index.ts` | Entry point exporting the shared rules the phone and server both use. |
| `intervals.ts` | Turns player ticks into listened time ranges and measures total time without double counting. |
| `lockout.ts` | After repeated wrong passwords, locks sign-in for a growing time, at most 15 minutes. |
| `media.ts` | Decides if an episode is audio or video from its declared type or extension. |
| `merge.ts` | The one rule for choosing a listening position when two devices disagree. |
| `moderation.ts` | Report queue rules: group reports by item, allowed actions, and closing. |
| `moment.ts` | Captures the episode time a comment belongs to when the comment box opens. |
| `nextup.ts` | Builds the "Next up" list from four sources, without repeats or finished episodes. |
| `order.ts` | Sorts comments by newest, most liked, or their time in the episode. |
| `picks.ts` | Reads and checks the daily picks file and returns picks for a day. |
| `plural.ts` | Writes counts with the right singular or plural noun, like "1 episode". |
| `rank.ts` | Weights and scoring for recommendations: freshness, popularity, quality and fatigue. |
| `reason.ts` | Writes the short, true reason why each recommended episode is shown. |
| `replay.ts` | Offline score of the recommender: how high it ranks episodes a listener later played. |
| `rerank.ts` | Reorders recommendations for variety, with limits per show and per category. |
| `safety.ts` | Report and block rules: who may report or block, and hiding blocked content. |
| `search.ts` | Search rules: match words, put the library first, and remove duplicate results. |
| `stats.ts` | Listening totals for the last 7 days and all time, with top shows. |
| `swing.ts` | Measures how similar two shows are from the people who like both. |
| `types.ts` | Shared data shapes for positions, playback snapshots, moments and comment order. |
