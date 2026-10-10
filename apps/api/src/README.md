# apps/api/src — file map

Every code file in the server, one plain line each. Each file also starts with the same sentence
as a `//` comment — change both together. A check in the cloud tests fails if a file is missing
here or a line does not match its file.

- **Routes** (`routes/<area>/`) answer the web requests; **repos** (`db/repos/<area>/`) hold the SQL.
  Both use the same areas: account, social, safety, library, discover, creators/studio, admin.
- `routes/admin/` and `routes/studio/` are one router each, split into one file per part of the page;
  `index.ts` builds the router and calls the parts in order (route order matters).
- Database changes are numbered files in `db/migrations/` (SQL, not listed here).

### Top level — start-up, the app, errors, input checks

| File | What it does |
|---|---|
| `app.ts` | Builds the Hono app: shared setup, error handling, and every route mounted. |
| `errors.ts` | The single API error shape and its error codes with HTTP statuses. |
| `server.ts` | Starts the API locally on Node with the real database. |
| `validate.ts` | Checks JSON request bodies with zod and answers 422 naming bad fields. |
| `vercel-entry.ts` | Entry point that runs the API as a Vercel serverless function. |

### `routes/` — requests that belong to no single area

| File | What it does |
|---|---|
| `errors.ts` | Error log route: the phone sends its recent errors in small batches, signed in or not. |
| `internal.ts` | Internal routes the scheduled job calls to rebuild data in small steps. |
| `lists.ts` | Shared show lists: a listener picks some of their shows, gives them a title, and shares one link. |
| `config.ts` | Public app settings for the phone: GET /v1/config, cached, with an ETag. |
| `content.ts` | Public Academy articles and Help questions: GET /v1/content/:kind and /v1/content/:kind/:slug. |

### `routes/account/` — sign-in, your account, notifications, wallet, feedback

| File | What it does |
|---|---|
| `auth.ts` | Sign-in routes: sign in, sign out, and email code sign-in (an account is created only by a code). |
| `data-export.ts` | "Download my data": emails the listener a 24-hour link to a JSON file of their own data; one a day. |
| `devices.ts` | Signed-in devices: list this account's sessions, sign one out, or sign out every other one. |
| `digests.ts` | Weekly digest route: my Monday catch-ups from the last 4 weeks. |
| `feedback.ts` | Feedback route: text signed in or not; up to three images, signed in only and limited. |
| `gifts.ts` | Gift routes: see what a gift link offers, claim it once, list the gifts I bought, and the link's web page. |
| `me.ts` | My account routes: read, edit name and privacy, delete the account after a 15-day wait, and set the time zone. |
| `notify.ts` | Per-show notification routes: list shows and turn new-episode alerts on or off. |
| `push.ts` | Push routes: register or remove a device token and set alert preferences. |
| `wallet.ts` | Read-only wallet routes: my purchases and the tips I gave. |
| `redeem.ts` | Redeem a code: POST /v1/me/redeem gives the code's free grant (PLUS days or a paid show) once per account. |
| `email.ts` | Change the sign-in email: a code to the new address AND one to the old, check both, switch, tell the old address. |
| `m19.ts` | My notices from hosts, my monthly report, and the teen-mode passcode reset by email code. |
| `purchases-google.ts` | Purchase route: the phone sends a Google Play purchase; the server checks it with Google, then grants it. |
| `stickers.ts` | Sticker placement routes: read my stickers on my profile header, or replace them all. |
| `queue.ts` | Queue sync routes: read the account's play queue, and replace it from the version the phone last saw. |
| `interests.ts` | Interests routes: read and save my first-open categories, and send "Not liking these?" answers. |

### `routes/social/` — comments, reactions, clips, follows, profiles, voice posts, sharing

| File | What it does |
|---|---|
| `chat.ts` | Chat routes: my conversations, unread count, friends to chat with, read and send messages. |
| `clips.ts` | Clip routes: create, list, read and delete clips on an episode. |
| `comment-counts.ts` | Route returning comment counts for many episodes in one call. |
| `comments.ts` | Comment routes: post, delete and like comments on an episode. |
| `feed.ts` | Following feed route: activity by people I follow, with caching headers. |
| `follows.ts` | Follow routes: follow, unfollow, and list followers and following. |
| `friends.ts` | Route listing episodes that people I follow listened to this week. |
| `live.ts` | "Listening now" routes: send a heartbeat and read the live count. |
| `profiles.ts` | Profile routes: read a listener's profile and public subscriptions, and set my privacy switch. |
| `reactions.ts` | Reaction route: toggle a reaction at a moment in an episode. |
| `share.ts` | Share card routes: draw a PNG for an episode moment, lines from its transcript as a quote, or a monthly recap. |
| `social.ts` | Episode social poll route: comments and heat curve in one cached answer. |
| `voice.ts` | Voice post routes: upload a short recording or post a text status, list, and delete posts. |
| `comment-image.ts` | Comment image route: the author adds one picture to their comment, kept in the image store. |
| `likes.ts` | Like routes: like an episode with a note, unlike, my timeline, one account's likes, like posts. |
| `playlists.ts` | Playlist routes: my playlists, one playlist, its order, and an account's public ones. |
| `voice-comments.ts` | Voice comment route: post a recording of up to 60 seconds as a comment at a moment. |
| `mutes.ts` | Mute routes: list the listeners I muted, mute one, unmute one. |
| `notifications.ts` | Notification routes: my interaction notices in pages, and mark them all read. |
| `muted-threads.ts` | Muted-thread routes: mute or unmute one notice thread, list them; stop like notices on my comment. |

### `routes/safety/` — reports and blocks

| File | What it does |
|---|---|
| `blocks.ts` | Block routes: list, block and unblock listeners. |
| `reports.ts` | Report routes: report content, rate-limited, and list what I have hidden. |
| `appeals.ts` | Appeal routes for the phone: what I may appeal, and sending one appeal per action — even while suspended. |
| `maintenance.ts` | While the admin's maintenance switch is on, every API call answers 503 with the body the phone reads. |
| `word-filter.ts` | Refuses a write whose text holds a blocked word, before the route sees it (422 blocked_word). |

### `routes/library/` — subscriptions, positions, listening, history

| File | What it does |
|---|---|
| `episodes.ts` | Episode route: the app registers an episode's details with the server. |
| `library.ts` | Library routes: sync favourites, moments and searches; list my comments. |
| `listened.ts` | Listened-time routes: a device replaces its listened ranges per day; my minutes per day or month. |
| `positions.ts` | Playback position routes: send positions from a device and read them back. |
| `rec-events.ts` | Route to record which recommendations were shown, opened, played or finished. |
| `subscriptions.ts` | Subscription routes: read and sync my subscriptions across devices, and save my own order. |
| `dismissals.ts` | "Not interested" routes: list, add and restore the episodes and shows For You must skip. |

### `routes/discover/` — Discover, search, For You, next up, launch screen

| File | What it does |
|---|---|
| `categories.ts` | Category routes: list genres and show each genre's top shows. |
| `discover.ts` | Discover route: the public Discover page, the three charts, the treasure hunt, the plaza and daily picks. |
| `foryou.ts` | For You route: the personal recommendation list — signed in, or signed out with picked categories. |
| `issues.ts` | Routes for past daily picks and curated issues. |
| `launch.ts` | Public launch-screen routes: live promotions and anonymous view or tap counts. |
| `nextup.ts` | Route for an episode's "Next up" suggestions. |
| `search.ts` | Search routes: shows and episodes from Apple, and people by name, rate-limited. |
| `search-requests.ts` | "Can't find it? Tell us": a listener sends search words the catalogue did not answer. |

### `routes/mod/` — owner-only lists added to the /mod pages

| File | What it does |
|---|---|
| `errors.ts` | The owner's error log page under /mod: newest first, with scope, message, version, platform and count. |
| `search-requests.ts` | The owner's list of searches listeners asked the editors to add (HTML under /mod, JSON under /v1/mod). |

### `routes/creators/` — show owners in the app: claims, extras, hosted feeds

| File | What it does |
|---|---|
| `covers.ts` | Serves the made-for-you show cover PNG named by its address. |
| `creator.ts` | Creator claim routes in the app: list, start and verify claims, see stats. |
| `extras.ts` | App routes for creator features: show extras, poll votes, and share events. |
| `feeds.ts` | Serves the public RSS feed of a show created in the Studio. |
| `paid.ts` | Paid episode routes: a show's paid episodes, and a short-lived audio link for a listener who bought them. |

### `routes/studio/` — the Studio website's API, one file per page

| File | What it does |
|---|---|
| `announcements.ts` | Studio routes for show announcements and polls. |
| `bans.ts` | Studio ban routes: list the listeners banned from commenting on a show, ban one with a reason, lift a ban. |
| `claims.ts` | Studio routes to claim a show and verify the claim. |
| `second-factor.ts` | Studio routes for the admin second factor: is it needed, send the code, check it (and remember this browser). |
| `comments.ts` | Studio comment routes: list a show's comments, reply, hide, unhide and pin. |
| `common.ts` | Helpers shared by Studio routes: owner-only check, date ranges, CSV answers. |
| `create.ts` | Studio routes to create a new show and check storage status. |
| `data.ts` | Studio data routes: yesterday, top episodes, episode table, CSV exports. |
| `episodes.ts` | Studio routes for a created show: edit details, upload and publish episodes. |
| `feed.ts` | Studio routes for a claimed feed: its last fetch and "Sync now", and hiding one episode from listeners. |
| `host-picks.ts` | Studio host picks: read and replace the episodes a show's host marks for its show page. |
| `hosts.ts` | Studio host routes: list hosts, remove one, make and accept invite links. |
| `index.ts` | Studio router: no-cache, cross-site check, session and show-role walls for every route. |
| `media.ts` | Studio media library routes: list a show's stored files and delete unused ones. |
| `overview.ts` | Studio overview routes: a show's totals and trend over time. |
| `settings.ts` | Studio settings routes: show overrides, helpers team, and giving the show back. |
| `subscribers.ts` | Studio subscriber routes: stats, subscriber list, and muting listeners. |
| `tips.ts` | Studio routes for money: the show's tips, and its earnings (sales, gifts, tips, refunds) with a CSV. Owner only. |
| `transcript-reports.ts` | Studio transcript reports: a show's listener corrections, and marking one done. |

### `routes/mod/` — moderator routes behind the Admin wall

| File | What it does |
|---|---|
| `translation.ts` | Moderator routes for translation: the allow-list of shows, today's Groq usage and the job queue. |

### `translate/` — translated transcripts on Groq's free tier

| File | What it does |
|---|---|
| `groq.ts` | Calls Groq's free tier: speech-to-text from the publisher's audio URL, and line-by-line translation as strict JSON. |
| `job.ts` | Moves translation jobs forward one Groq call at a time, inside the free-tier budget, and serves finished translations. |
| `routes.ts` | Translation routes: a PLUS member reads or asks for an allow-listed episode's translated transcript. |

### `routes/admin/` — the owner-only Admin API, one file per page

| File | What it does |
|---|---|
| `accounts.ts` | Admin routes for accounts: list, create, edit, and act as an account. |
| `common.ts` | Helpers shared by admin routes: date and id checks, body shapes, cache reset. |
| `curated.ts` | Admin routes for curated issues and collections: list, read, save, retire. |
| `discover.ts` | Admin routes for Discover layout and featured shows per category. |
| `index.ts` | Admin router: puts every admin route behind the admin-only check. |
| `launch.ts` | Admin routes for launch-screen promotions: upload images, create, edit, end. |
| `metrics.ts` | Admin dashboard route: usage numbers for 7, 30 or 90 days, cached five minutes. |
| `picks.ts` | Admin routes for daily picks: list, read and save a day's picks. |
| `record.ts` | Admin route to read the admin action record, filtered by area. |
| `redeem.ts` | Admin routes for redeem codes: list them, make new ones, switch one off. |
| `users.ts` | Admin routes for users and safety: list, rename, suspend, restore, act on reports. |
| `appeals.ts` | Admin routes for appeals (accept = undo, reject) and the account deletion queue. |
| `safety.ts` | Admin routes for blocked words, the maintenance switch and system notices. |
| `config.ts` | Admin routes for the app settings (Admin › App settings): read every key, save one, reset one. |
| `content.ts` | Admin routes for Academy articles and Help questions (Admin › Content): list, save, delete. |
| `lists.ts` | Admin routes for every list's pins and hides, the category page's default chip, and hiding a show or episode everywhere. |
| `foryou.ts` | Admin routes for For You (boost, bury, never recommend; the ranking weights) and the inbox moved from /mod (feedback, search requests, rec numbers). |

### `db/` — the database connection and migrations

| File | What it does |
|---|---|
| `client.ts` | Creates the one Postgres connection each server instance uses. |
| `db.ts` | The shared database interface, with adapters for real Postgres and in-memory pglite. |
| `backend-ddb.ts` | Attaches a DynamoDB Store to a Postgres Db handle, so the converted repo functions run on DynamoDB (backend.ts). |
| `backend.ts` | The dual-backend switch: a repo function runs on Postgres, or on DynamoDB when a Store is attached to the Db handle. |
| `migrate.ts` | Runs every database migration file not yet applied, in order. |

### `db/ddb/` — the DynamoDB data layer (M26, being built beside Postgres; not used by any route yet)

| File | What it does |
|---|---|
| `batch.ts` | Batch reads (100 keys) and writes (25 puts/deletes) in chunks, retrying what DynamoDB left unprocessed. |
| `client.ts` | The DynamoDB DocumentClient: plain JS objects in and out; refuses real AWS until it is approved. |
| `codec.ts` | Row ↔ item: every item gets its type `t`, dates become ISO strings, and each type's attribute allowlist is enforced. |
| `cursor.ts` | Page cursors: a DynamoDB resume key ↔ an opaque, signed string the API hands out (a forged one is refused). |
| `keys.ts` | Every DynamoDB key shape in data-model.md §3–§5, one function each, so no repo spells a key by hand. |
| `paginate.ts` | "Up to N" lists over DynamoDB's 1 MB pages: keep querying until N items are found or the partition ends. |
| `retry.ts` | Retry for optimistic writes: a version check or transaction conflict is retried a few times, never forever. |
| `schema.ts` | Reads infra/tables.yaml and creates or drops a table set (tests and rehearsals; production tables come from CloudFormation). |
| `seq.ts` | Numeric ids for the seven former bigserial tables: a SEQ# counter item, so ids keep their type and order. |
| `store.ts` | The Store handle every DynamoDB repo takes: the client, the three table names, a clock and a cursor secret. |
| `test-wrappers.ts` | Test-only Store wrappers for what DynamoDB Local cannot do: GSI lag, transaction conflicts, faults by key prefix. |
| `tx.ts` | TransactWriteItems builder: refuses more than 100 items before sending, and names which item cancelled a transaction. |
| `unique.ts` | Uniqueness without a UNIQUE index: a U# item claimed with attribute_not_exists in the same transaction as the row. |

### `jobs/` — background work (M26); the only place a full-table Scan may appear

| File | What it does |
|---|---|
| `cache-sweep.ts` | The hourly cache sweep on DynamoDB: feed and Apple-search entries older than 7 days go (a Scan of sm-cache — jobs only). |
| `outbox.ts` | The outbox: work a commit causes (fan-outs, rollups) queued in the same transaction, then drained idempotently; and resumable jobs. |

### `db/repos/` — shared database helpers

| File | What it does |
|---|---|
| `cache.ts` | Simple database cache: serve fresh rows, fall back to stale rows on failure. |
| `health.ts` | The health check's database probe (M26: moved here from app.ts). |
| `old-rows-sweep.ts` | The hourly sweep's deletes of old rows (M26: moved here from routes/internal.ts). |
| `tint-cache.ts` | The cover tint's rows in the `cache` table (`tint:<imageUrl>`): read one, write one. |

### `db/repos/config/` — app settings and content pages an admin edits (M25)

| File | What it does |
|---|---|
| `app-config.ts` | The app settings an admin may change (`app_config`): read, save with a version check, reset to default. |
| `content.ts` | Academy articles and Help questions (`content_pages`): list, read, save with a version check, delete. |

### `db/repos/account/` — accounts and what belongs to them

| File | What it does |
|---|---|
| `country.ts` | Keeps the listener's two-letter country from the sign-in request, nothing more. |
| `data-export.ts` | Builds one listener's own data as JSON: profile, library, comments, clips, statuses, lists, purchases and tips. |
| `delete-account.ts` | Deletes an account and its data in one step, keeping reply threads intact. |
| `deletion.ts` | Account deletion waits 15 days: request it, keep the account, and delete the due ones for good. |
| `digest.ts` | The Monday digest for PLUS members: up to 10 unplayed episodes from last week, once per ISO week, at noon local time. |
| `error-reports.ts` | Our own error log: phone errors counted by scope, message, version and platform; kept 30 days. |
| `feedback.ts` | Stores feedback with up to three small images; images deleted after 90 days. |
| `gifts.ts` | Gifts of a paid show: a code made after the store purchase is verified, claimed once, withdrawn on a refund. |
| `listeners.ts` | Database queries to create and find listener accounts. |
| `push.ts` | Sends new-episode push notifications through Expo, never twice to one device. |
| `profile.ts` | My profile: name, bio, photo, optional age range and gender; the photo's storage limits. |
| `purchases.ts` | Grants what a store purchase bought, once, and takes it back when the store reports a refund. |
| `redeem.ts` | Redeem codes: the owner gives PLUS days or a paid show for free; each account uses a code once. |
| `queue.ts` | The listener's synced play queue: read it, and replace it only from the version the phone last saw. |
| `stickers.ts` | Stickers placed on a profile header: read them, replace them all, and what a viewer may see. |
| `interests.ts` | A listener's chosen categories (first-open interests) and their "Not liking these?" answers. |
| `devices.ts` | Database queries for the signed-in devices list (M26: moved here from routes/account/devices.ts). |
| `email-change.ts` | Database queries for changing the sign-in email (M26: moved here from routes/account/email.ts). |
| `notify-shows.ts` | Database queries for per-show new-episode notifications (M26: moved here from routes/account/notify.ts). |
| `rate-limits.ts` | Database queries for fixed-window rate limits (M26 F0-01: moved here from auth/rate.ts). |
| `second-factor.ts` | Database queries for the admin second factor kept on the session row (M26 F0-01: moved here from auth/second-factor.ts). |
| `sessions.ts` | Database queries for sign-in sessions (M26 F0-01: moved here from auth/, routes/ and pages/). |
| `sign-in-codes.ts` | Database queries for email sign-in codes (M26 F0-01: moved here from auth/codes.ts). |

### `db/repos/account/ddb/` — the account lane on DynamoDB (M26 lane AC; used when the app carries a Store)

| File | What it does |
|---|---|
| `account.ts` | Signed-in devices, the email change and "Download my data" on DynamoDB. |
| `codes.ts` | Emailed sign-in codes and fixed-window rate counters on DynamoDB, with conditional counters instead of row locks. |
| `common.ts` | Shared pieces of the account lane's DynamoDB code: the clock, key forms, the listener item, session copies and the Postgres shadow. |
| `deletion.ts` | Account deletion on DynamoDB: the 15-day wait, then a resumable job (JOB#delete) that removes the account piece by piece, listener item last. |
| `feedback.ts` | Feedback (with its small images) and our own error log on DynamoDB. |
| `foreign.ts` | What the account lane reads from lanes that are still on Postgres (hybrid only): subscriptions, PLUS, episodes, follows, blocks… |
| `index.ts` | The account lane's DynamoDB bodies for the switch: `dual('ac/index', name, …)` calls `name(store, db, ...args)` here. |
| `listeners.ts` | Listener accounts on DynamoDB: the listener item plus its U#EMAIL uniqueness item, lockout counters, country, profile reads. |
| `profile.ts` | The listener's own profile, interests, stickers and synced queue on DynamoDB. |
| `push.ts` | Push tokens, switches, the "never twice" record, social pushes, the status fan-out (outbox), the weekly digest and per-show switches on DynamoDB. |
| `sessions.ts` | Sessions on DynamoDB: one item per token hash carrying copies of the listener, so a request is authenticated by ONE GetItem. |

### `db/repos/social/` — comments, clips, follows, profiles, activity

| File | What it does |
|---|---|
| `activity.ts` | The Following feed: activity by people you follow, newest first, in pages. |
| `chat.ts` | Chat messages between two listeners who follow each other: send, read, list conversations. |
| `clips.ts` | Clips: save, list and delete a time range of an episode, no audio. |
| `comment-extras.ts` | Comment pins, "unfriendly" marks and the reply page's thread. |
| `comment-likes.ts` | Comment likes: one per listener, never your own, hidden comments not likeable. |
| `comments.ts` | Comments: create, list as threads, delete, and shape them for each viewer. |
| `follows.ts` | Follow and unfollow listeners, and list followers and following. |
| `live-listeners.ts` | Counts "listening now" per episode using only daily-salted install hashes. |
| `profiles.ts` | Builds a listener's profile: name, counts, stats and recent public activity. |
| `voice-posts.ts` | Voice status posts up to 60 seconds, fully deleted after 24 hours. |
| `status-replies.ts` | Replies and reactions on a status: text or voice replies only the owner and the author see, six reactions. |
| `status-items.ts` | Items on a status: up to 10 episode cards and photos; photos live in the image store until the status goes. |
| `muted-threads.ts` | Muted notice threads: no more notices or pushes from one comment thread or one like-post. |
| `voice-comments.ts` | Voice comments: their recording limits, and deleting the audio of removed comments. |
| `mutes.ts` | Mutes: hide a listener's comments, voice posts and likes from me only; they are never told. |
| `notifications.ts` | Interaction notices: replies, likes, mentions and follows aimed at you, never from yourself or someone you shut out. |
| `comment-images.ts` | Comment images: deleting them from the store when their comment or their author goes. |
| `likes.ts` | Likes with a note: like or unlike an episode, a timeline of likes from people you follow, and like posts. |
| `playlists.ts` | Listener playlists: make, rename, reorder, share publicly or keep private. |
| `host-notices.ts` | Host notices: announcements from the shows a listener follows, from their release time. |
| `report.ts` | The monthly listening report: minutes, shows, episodes, top three of each, comments and clips. |
| `system-notices.ts` | System notices: messages from SocialNet to everyone or to one listener, and their optional push. |
| `comment-writes.ts` | Comment writes the comment routes run: the rate floor, posting and deleting in a transaction, images, reactions. |
| `episode-social.ts` | The episode social poll's reads: the change stamp, the heat rows and the viewer's reaction buckets. |
| `friends-listening.ts` | "Friends are listening": what people I follow listened to in the last 7 days. |
| `public-pages.ts` | Reads for the public pages and share routes: the share card's fallback artwork, an episode check, the show card, the cached feed. |
| `rate-floors.ts` | Per-minute rate floors for follows, chat messages and clips, and the follow transaction. |
| `shared-lists.ts` | Database queries for shared show lists (M22 US17 item 5; moved from routes/lists.ts in M26 F0-01). |
| `status-writes.ts` | Status route writes and checks: a text status with its items in one transaction, a listener check, image bytes used. |

### `db/repos/social/graph-ddb/` — the social-graph lane on DynamoDB (M26 lane SG; used when the app carries a Store)

| File | What it does |
|---|---|
| `activity.ts` | The activity log and the Following feed on DynamoDB: activity items per actor, fanned out to each follower's inbox by the outbox. |
| `common.ts` | Shared pieces of the social-graph lane's DynamoDB code: the hybrid handle, the bridge, foreign reads of lanes still on Postgres. |
| `deletion.ts` | The social-graph phase of the account deletion job: follows both ways (with the other side's counters), activity, notices, playlist pointers. |
| `export.ts` | The social-graph sections of "Download my data" on DynamoDB: who I follow and my playlists, as the old rows. |
| `follows.ts` | Follows on DynamoDB: both directions and both counters in one transaction, the lists read from the listener's own partition. |
| `friends.ts` | "Friends are listening" on DynamoDB: one inbox item per (episode, friend) in my partition, written when a friend listens. |
| `index.ts` | The social-graph lane's DynamoDB bodies for the switch: `dual('sg/index', name, …)` calls `name(store, db, ...args)` here. |
| `live.ts` | "Listening now" on DynamoDB: one item per salted install hash and episode, never an account (strict attribute allowlist). |
| `mutes.ts` | Mutes and muted notice threads on DynamoDB: items in the muter's own partition, so the whole set is one Query. |
| `notices.ts` | System notices and host notices on DynamoDB: notices to everyone or to one listener, and the announcements of the shows I follow. |
| `notifications.ts` | Notifications on DynamoDB: one item per notice in the recipient's partition, a dedupe item so a repeated like or follow is told once. |
| `playlists.ts` | Playlists on DynamoDB: one item per playlist holding its ordered episodes, changed with a version check. |
| `profiles.ts` | Profiles on DynamoDB: the listener item (lane AC) plus this lane's counts, follow state and recent activity, the same answer as before. |

### `db/repos/safety/` — reports, blocks, moderation

| File | What it does |
|---|---|
| `blocks.ts` | Block and unblock listeners; a block also removes follows both ways. |
| `moderation.ts` | Applies a moderation action, closes its reports and records it, in one step. |
| `reports.ts` | Stores reports with a copy of the reported item, hidden for the reporter. |
| `appeals.ts` | Appeals: what a listener may appeal, sending one appeal per action, and the admin's decision. |
| `maintenance.ts` | The maintenance switch the admin turns on and off: stored in app_settings, read through a short memo. |
| `words.ts` | Blocked words: the admin's list, read through a short memo, and the check every write uses. |
| `mod-shows.ts` | Database queries for the /mod page's Studio shows list and take-down (M26: moved here from pages/mod.ts). |
| `translation.ts` | Translation queries: the Groq usage ledger, translation jobs, finished translations and the /mod allow-list. |

### `db/repos/library/` — subscriptions, positions, listening, library

| File | What it does |
|---|---|
| `episodes.ts` | Saves and reads episodes the app registers; a known duration is never overwritten. |
| `library.ts` | Syncs favourites, saved moments and search history across a listener's devices. |
| `listened.ts` | Stores listened time ranges per device and counts their union across devices. |
| `positions.ts` | Stores and merges playback positions sent from each device. |
| `rec-events.ts` | Records what recommendations were shown and opened, counted per source. |
| `subscriptions.ts` | Syncs subscriptions across devices; an unsubscribe wins a tie. |
| `catalog.ts` | Reads the admin catalogue tables: pick days and items, curated issues and their items, collections and their items. |
| `daily-pick.ts` | Database queries for pushing the day's pick (M26: moved here from routes/internal.ts). |
| `feed-refresh.ts` | Database queries for the hourly feed refresh (M26: moved here from routes/internal.ts). |
| `feeds.ts` | Feed moves: every live subscription follows a publisher's new feed address, in one transaction. |
| `heat.ts` | The two statements of an episode's heat rebuild (see heat/rebuild.ts for the rule they keep). |

### `db/repos/library/ddb/` — the same functions on DynamoDB (M26 lane LB; run when the Db carries a Store — db/backend.ts)

| File | What it does |
|---|---|
| `cache.ts` | The cache on DynamoDB (sm-cache): gzip bodies, chunks over 350 KB, a TTL per key prefix, generations for prefix invalidation. |
| `daily-pick.ts` | The day's pick on DynamoDB: the named episode by its (feed, guid) item, or the show's newest from G2. |
| `episodes.ts` | Episodes on DynamoDB: EP#<id>/META, the (feed, guid) uniqueness item, the show's META kept up to date. |
| `feed-refresh.ts` | The hourly feed refresh on DynamoDB: the subscribed-feed list from G4 `Q#feeds`, known guids by GetItem. |
| `feeds.ts` | The moved-feed job on DynamoDB: every live subscriber of the old address moves to the new one, 4 items per subscriber. |
| `heat.ts` | The heat rebuild on DynamoDB while reactions and comments still live on Postgres (the bridge until lane SC lands). |
| `library.ts` | Library sync on DynamoDB: L#<id>/LIB#<kind>#<key> items merged one by one, tombstones kept 30 days, 12 searches. |
| `listened.ts` | Listened ranges on DynamoDB: RANGE# items per device, the union kept per day in LDAY#, the badge total moved by the union's change. |
| `old-rows-sweep.ts` | The hourly sweep's cache and rec-events deletes on DynamoDB (LB-56, LB-58). |
| `positions.ts` | Playback positions on DynamoDB: L#<id>/POS#<episodeId>, merged with mergePosition under a version check. |
| `rec-events.ts` | Recommendation events on DynamoDB: RE#<listener> items in sm-events, an hourly per-channel rollup, the 90-day sweep by day. |
| `subscriptions.ts` | Subscriptions on DynamoDB: L#<id>/SUB#<feedKey> merged item by item, the order list, events, the show's subscriber count. |
| `tint-cache.ts` | The cover tint's cache entries on DynamoDB (`tint:<imageUrl>` in sm-cache) — LB-68/69. |

### `db/repos/discover/` — Discover, For You, similarity, next up, launch

| File | What it does |
|---|---|
| `activity-stats.ts` | Counts listens, comments, clips and reactions per episode, never naming listeners. |
| `discover-extras.ts` | Extra Discover parts: pick counts, followed shows, new arrivals, what people said, collections. |
| `discover-settings.ts` | Applies the owner's Discover settings: section order and hidden sections; the M15 pin routes over list_overrides. |
| `lists.ts` | The owner's pins and hides on every list the phone shows (one table), and how they are applied. |
| `served.ts` | The lists the phone is served, with the owner's pins and hides applied — shared by the public routes and Admin › Lists. |
| `foryou-rules.ts` | The owner's For You rules: boost, bury or never recommend a show; and the ranking weights. |
| `discover.ts` | Builds the Discover page: daily picks, talked-about episodes and the chart, cached hourly. |
| `foryou.ts` | Builds the personal For You list from eight sources, scored and mixed. |
| `nextup.ts` | Builds "Next up" suggestions for an episode from four sources. |
| `promotions.ts` | Launch-screen promotions: store, schedule, count views and taps as totals only. |
| `similarity.ts` | Computes which shows are similar, ignoring private listeners and storing no listener ids. |
| `dismissals.ts` | "Not interested" choices: episodes and shows a listener asked For You to stop showing. |
| `explore.ts` | Explore lists: the three charts, the treasure hunt, the new-shows plaza, and followed faces on picks. |
| `pick-episodes.ts` | Database queries for past picks and curated issues (M26 F0: moved here from routes/discover/issues.ts). |
| `search-local.ts` | Database queries for search: Studio-created shows and people (M26 F0: moved here from routes/discover/search.ts). |
| `search-requests.ts` | Database queries for "Can't find it? Tell us" search requests (M26 F0: moved here from routes/discover/search-requests.ts). |

### `db/repos/studio/` — a show's data for its creators

| File | What it does |
|---|---|
| `announcements.ts` | Show announcements; at most two pushed per show each month. |
| `comment-policy.ts` | Comment control per show and per episode: open, closed, or held for the host's review. |
| `creator.ts` | Lets a creator claim a show by placing a code in their live feed. |
| `curators.ts` | Finds the curator who shared an outside show, hiding suspended accounts. |
| `feed-sync.ts` | A claimed feed's last fetch — when, whether it worked, the error — and the "Sync now" limit. |
| `hidden-episodes.ts` | Episodes of a claimed show that its creator hid from listeners. |
| `hosted.ts` | Shows and episodes created in the Studio, and the RSS feed built from them. |
| `milestones.ts` | The subscriber-milestone message: sent once to the listener who became a show's 100th, 1 000th or 10 000th subscriber. |
| `polls.ts` | Show polls: create, vote once per listener, close, and count votes. |
| `show-hosts.ts` | Show hosts added by single-use invite links lasting four days, five hosts maximum. |
| `show-overrides.ts` | Owner changes to how a show looks in the app, like title, cover, contacts. |
| `show-page.ts` | What the app's show page reads from us: subscribers, hosts with faces, host picks, owner info. |
| `show-team.ts` | A show's owner and helpers: add helpers by email, remove, give the show back. |
| `studio-comments.ts` | A show's comments for the creator: list, reply, and hide or unhide. |
| `studio-earnings.ts` | Earnings for a show: paid-show sales, gifts and tips per month, refunds apart, and the CSV. |
| `studio-numbers.ts` | A show's Studio numbers: plays, completion, likes, saves, shares, trends, CSV. |
| `studio-roles.ts` | Decides who may manage which show in the Studio: owner or helper. |
| `studio-subscribers.ts` | A show's subscribers: totals, trend, listening hours, names, and muted listeners. |
| `studio-tips.ts` | Lists tips a show received, leaving out refunded purchases. |
| `retention.ts` | Retention: the share of an episode's listeners still listening at each minute. |
| `demographics.ts` | Demographics: age range, gender and country totals of a show's subscribers, never under 10. |
| `paid-episodes.ts` | Database queries for paid shows and their episodes (M26 F0: moved here from routes/creators/paid.ts). |
| `share-events.ts` | Database queries for share events (M26 F0: moved here from routes/creators/extras.ts). |
| `show-bans.ts` | Database queries for Studio show bans (M26 F0: moved here from routes/studio/bans.ts). |

### `db/repos/admin/` — what the Admin pages read and write

| File | What it does |
|---|---|
| `admin-accounts.ts` | Admin-made accounts: create one or many, edit, with or without email. |
| `admin-audit.ts` | Reads the admin action record, newest first, 50 per page, by area. |
| `admin-curated.ts` | Curated issues and collections stored in the database, with save and retire. |
| `admin-picks.ts` | The owner's daily picks stored in the database, refusing out-of-date saves. |
| `metrics.ts` | Admin dashboard numbers: totals only, each section fails on its own. |
| `admin-access.ts` | Database queries for admin access: who is admin, and the admin action record (M26 F0-01: moved here from auth/admin.ts). |
| `admin-lists.ts` | Database queries for hiding a show or an episode everywhere from Admin (M26: moved here from routes/admin/lists.ts). |
| `admin-sessions.ts` | Database queries on sessions for Admin's "act as" (M26: moved here from routes/admin/accounts.ts). |
| `admin-users.ts` | Database queries for the admin user pages: search, one account in full, PLUS by hand, photo and bio removal, the deletion queue (M26: moved here from routes/admin/). |

### `auth/` — sessions, passwords, codes, admin access

| File | What it does |
|---|---|
| `admin.ts` | Admin access: who is admin, the admin-only wall, and the admin action record. |
| `admin-tx.ts` | adminWrite on DynamoDB: the change and its one audit item in ONE TransactWriteItems; a change too big for one goes audit-first. |
| `appeal-token.ts` | A signed, short-lived token that lets a suspended listener appeal without a working session. |
| `codes.ts` | Email sign-in codes: six digits, ten minutes, five tries, stored only hashed. |
| `password.ts` | Hashes and checks passwords with scrypt from Node's built-in crypto. |
| `rate.ts` | Fixed-window rate limits kept in the rate_counters table (per address, or global). |
| `second-factor.ts` | The admin second factor: an emailed code per session, and a signed cookie that remembers a device for 30 days. |
| `session.ts` | Session tokens: create, hash, look up the signed-in listener, require sign-in. |
| `studio-session.ts` | Studio web session: cookie sign-in, 12-hour idle limit, and cross-site write check. |
| `write-limit.ts` | A floor rate limit on every write to /v1: per signed-in session, and per network when signed out. |

### `catalog/` — Apple podcast search and RSS feeds

| File | What it does |
|---|---|
| `apple.ts` | Reads Apple's public podcast catalogue: show search, episode search, charts, latest episodes. |
| `collections.ts` | Checks the owner's curated collections file, dropping bad items with a warning. |
| `feed.ts` | Fetches and parses a podcast RSS feed on the server, cached for one hour. |
| `genres.ts` | Apple's top podcast genres, and matching a feed's category to a genre id. |
| `live.ts` | Merges picks, issues and collections from the database over the built-in files. |

### `pages/` — web pages the server draws (share cards, legal, moderation)

| File | What it does |
|---|---|
| `clip.ts` | Public web page for a shared clip, plus the Android app-link file. |
| `episode.ts` | Public web page for a shared episode link, with "Open in app". |
| `legal.ts` | Plain web pages: privacy, terms, community rules, and where to get the app. |
| `legal-texts.ts` | The same legal texts the app shows, for the web pages /privacy and /terms. |
| `mod.ts` | The owner's moderation web page: sign in, review reports, act on them. |
| `show-card.ts` | Public web card for a show: cover, name, description, latest episodes. |

### `heat/` — the reaction heat curve

| File | What it does |
|---|---|
| `ddb.ts` | The heat curve on DynamoDB: 100 buckets per episode, a listener counted once per bucket, kept in the writing transaction. |
| `rebuild.ts` | Rebuilds an episode's reaction heat curve, counting each listener once per segment. |

### `billing/` — selling through the stores

| File | What it does |
|---|---|
| `google-play.ts` | Talks to Google Play for purchases: checks a purchase, acknowledges it, and lists refunds. |
| `products.ts` | The products SocialNet sells through the stores: PLUS, a paid show's price levels, gifts of a paid show, and tips. |

### `share/` — share images

| File | What it does |
|---|---|
| `card.ts` | Draws the 1080×1350 share card PNG with artwork, title and time. |
| `cover.ts` | Draws the made-for-you show cover: a 1400 px PNG of two letters on a soft colour. |
| `fetch-image.ts` | Fetches a publisher's cover image with a 4 s timeout and an 8 MB cap; PNG or JPEG only. |
| `recap.ts` | Draws the monthly recap share card: the month, hours listened, top 3 shows and the app link. |
| `tint.ts` | Works out a cover's average colour as #rrggbb, cached by image URL for 30 days. |

### `storage/` — file storage for hosted audio, images and voice

| File | What it does |
|---|---|
| `episodes-blob.ts` | Storage for created shows' audio and covers: upload tokens, check, delete. |
| `voice-blob.ts` | Storage for voice post recordings in Vercel Blob. |
| `image-store.ts` | Storage for comment images: the Vercel Blob store `socialmorning-images`, or later a Cloudflare R2 bucket. |

### `mail/` — sending email

| File | What it does |
|---|---|
| `mailer.ts` | Sends sign-in code emails through Gmail SMTP. |

### `net/` — outbound fetches and response headers

| File | What it does |
|---|---|
| `headers.ts` | Security headers on every API response: CSP, no framing, no sniffing, a strict referrer. |
| `safe-fetch.ts` | One guard for every fetch the server makes to an address a user or a feed chose (SSRF). |

### `voice/` — voice post helpers

| File | What it does |
|---|---|
| `duration.ts` | Measures audio length from MP4 or AAC file bytes. |
| `transcript.ts` | Reads the optional text of a voice post or comment from its upload's x-transcript header. |
