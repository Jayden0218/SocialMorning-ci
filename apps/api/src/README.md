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

### `routes/account/` — sign-in, your account, notifications, wallet, feedback

| File | What it does |
|---|---|
| `auth.ts` | Sign-in routes: sign up, sign in, sign out, and email code sign-in. |
| `digests.ts` | Weekly digest route: my Monday catch-ups from the last 4 weeks. |
| `feedback.ts` | Feedback route: text signed in or not; up to three images, signed in only and limited. |
| `gifts.ts` | Gift routes: see what a gift link offers, claim it once, list the gifts I bought, and the link's web page. |
| `me.ts` | My account routes: read, edit name and privacy, delete the account after a 15-day wait, and set the time zone. |
| `notify.ts` | Per-show notification routes: list shows and turn new-episode alerts on or off. |
| `push.ts` | Push routes: register or remove a device token and set alert preferences. |
| `wallet.ts` | Read-only wallet routes: my purchases and the tips I gave. |
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
| `comments.ts` | Studio comment routes: list a show's comments, reply, hide, unhide and pin. |
| `common.ts` | Helpers shared by Studio routes: owner-only check, date ranges, CSV answers. |
| `create.ts` | Studio routes to create a new show and check storage status. |
| `data.ts` | Studio data routes: yesterday, top episodes, episode table, CSV exports. |
| `episodes.ts` | Studio routes for a created show: edit details, upload and publish episodes. |
| `host-picks.ts` | Studio host picks: read and replace the episodes a show's host marks for its show page. |
| `hosts.ts` | Studio host routes: list hosts, remove one, make and accept invite links. |
| `index.ts` | Studio router: no-cache, cross-site check, session and show-role walls for every route. |
| `media.ts` | Studio media library routes: list a show's stored files and delete unused ones. |
| `overview.ts` | Studio overview routes: a show's totals and trend over time. |
| `settings.ts` | Studio settings routes: show overrides, helpers team, and giving the show back. |
| `subscribers.ts` | Studio subscriber routes: stats, subscriber list, and muting listeners. |
| `tips.ts` | Studio route listing a show's tips, owner only. |
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
| `users.ts` | Admin routes for users and safety: list, rename, suspend, restore, act on reports. |

### `db/` — the database connection and migrations

| File | What it does |
|---|---|
| `client.ts` | Creates the one Postgres connection each server instance uses. |
| `db.ts` | The shared database interface, with adapters for real Postgres and in-memory pglite. |
| `migrate.ts` | Runs every database migration file not yet applied, in order. |

### `db/repos/` — shared database helpers

| File | What it does |
|---|---|
| `cache.ts` | Simple database cache: serve fresh rows, fall back to stale rows on failure. |

### `db/repos/account/` — accounts and what belongs to them

| File | What it does |
|---|---|
| `country.ts` | Keeps the listener's two-letter country from the sign-in request, nothing more. |
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
| `queue.ts` | The listener's synced play queue: read it, and replace it only from the version the phone last saw. |
| `stickers.ts` | Stickers placed on a profile header: read them, replace them all, and what a viewer may see. |
| `interests.ts` | A listener's chosen categories (first-open interests) and their "Not liking these?" answers. |

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

### `db/repos/safety/` — reports, blocks, moderation

| File | What it does |
|---|---|
| `blocks.ts` | Block and unblock listeners; a block also removes follows both ways. |
| `moderation.ts` | Applies a moderation action, closes its reports and records it, in one step. |
| `reports.ts` | Stores reports with a copy of the reported item, hidden for the reporter. |

### `db/repos/library/` — subscriptions, positions, listening, library

| File | What it does |
|---|---|
| `episodes.ts` | Saves and reads episodes the app registers; a known duration is never overwritten. |
| `library.ts` | Syncs favourites, saved moments and search history across a listener's devices. |
| `listened.ts` | Stores listened time ranges per device and counts their union across devices. |
| `positions.ts` | Stores and merges playback positions sent from each device. |
| `rec-events.ts` | Records what recommendations were shown and opened, counted per source. |
| `subscriptions.ts` | Syncs subscriptions across devices; an unsubscribe wins a tie. |

### `db/repos/discover/` — Discover, For You, similarity, next up, launch

| File | What it does |
|---|---|
| `activity-stats.ts` | Counts listens, comments, clips and reactions per episode, never naming listeners. |
| `discover-extras.ts` | Extra Discover parts: pick counts, followed shows, new arrivals, what people said, collections. |
| `discover-settings.ts` | Applies the owner's Discover settings: section order, hidden items, pinned and featured shows. |
| `discover.ts` | Builds the Discover page: daily picks, talked-about episodes and the chart, cached hourly. |
| `foryou.ts` | Builds the personal For You list from eight sources, scored and mixed. |
| `nextup.ts` | Builds "Next up" suggestions for an episode from four sources. |
| `promotions.ts` | Launch-screen promotions: store, schedule, count views and taps as totals only. |
| `similarity.ts` | Computes which shows are similar, ignoring private listeners and storing no listener ids. |
| `dismissals.ts` | "Not interested" choices: episodes and shows a listener asked For You to stop showing. |
| `explore.ts` | Explore lists: the three charts, the treasure hunt, the new-shows plaza, and followed faces on picks. |

### `db/repos/studio/` — a show's data for its creators

| File | What it does |
|---|---|
| `announcements.ts` | Show announcements; at most two pushed per show each month. |
| `creator.ts` | Lets a creator claim a show by placing a code in their live feed. |
| `curators.ts` | Finds the curator who shared an outside show, hiding suspended accounts. |
| `hosted.ts` | Shows and episodes created in the Studio, and the RSS feed built from them. |
| `polls.ts` | Show polls: create, vote once per listener, close, and count votes. |
| `show-hosts.ts` | Show hosts added by single-use invite links lasting four days, five hosts maximum. |
| `show-overrides.ts` | Owner changes to how a show looks in the app, like title, cover, contacts. |
| `show-page.ts` | What the app's show page reads from us: subscribers, hosts with faces, host picks, owner info. |
| `show-team.ts` | A show's owner and helpers: add helpers by email, remove, give the show back. |
| `studio-comments.ts` | A show's comments for the creator: list, reply, and hide or unhide. |
| `studio-numbers.ts` | A show's Studio numbers: plays, completion, likes, saves, shares, trends, CSV. |
| `studio-roles.ts` | Decides who may manage which show in the Studio: owner or helper. |
| `studio-subscribers.ts` | A show's subscribers: totals, trend, listening hours, names, and muted listeners. |
| `studio-tips.ts` | Lists tips a show received, leaving out refunded purchases. |
| `retention.ts` | Retention: the share of an episode's listeners still listening at each minute. |
| `demographics.ts` | Demographics: age range, gender and country totals of a show's subscribers, never under 10. |

### `db/repos/admin/` — what the Admin pages read and write

| File | What it does |
|---|---|
| `admin-accounts.ts` | Admin-made accounts: create one or many, edit, with or without email. |
| `admin-audit.ts` | Reads the admin action record, newest first, 50 per page, by area. |
| `admin-curated.ts` | Curated issues and collections stored in the database, with save and retire. |
| `admin-picks.ts` | The owner's daily picks stored in the database, refusing out-of-date saves. |
| `metrics.ts` | Admin dashboard numbers: totals only, each section fails on its own. |

### `auth/` — sessions, passwords, codes, admin access

| File | What it does |
|---|---|
| `admin.ts` | Admin access: who is admin, the admin-only wall, and the admin action record. |
| `codes.ts` | Email sign-in codes: six digits, ten minutes, five tries, stored only hashed. |
| `password.ts` | Hashes and checks passwords with scrypt from Node's built-in crypto. |
| `rate.ts` | Fixed-window rate limits kept in the rate_counters table (per address, or global). |
| `session.ts` | Session tokens: create, hash, look up the signed-in listener, require sign-in. |
| `studio-session.ts` | Studio web session: cookie sign-in, 12-hour idle limit, and cross-site write check. |

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
| `legal.ts` | Plain web pages: privacy, community rules, and where to get the app. |
| `mod.ts` | The owner's moderation web page: sign in, review reports, act on them. |
| `show-card.ts` | Public web card for a show: cover, name, description, latest episodes. |

### `heat/` — the reaction heat curve

| File | What it does |
|---|---|
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

### `voice/` — voice post helpers

| File | What it does |
|---|---|
| `duration.ts` | Measures audio length from MP4 or AAC file bytes. |
| `transcript.ts` | Reads the optional text of a voice post or comment from its upload's x-transcript header. |
