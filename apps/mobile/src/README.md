# apps/mobile/src — file map

Every file in `src/`, one plain line each. Screens are in [`../app/`](../app/README.md).
Import any file here as `@/<path>`, e.g. `@/ui/kit/Button`, `@/social/api`.

- **Logic** (no drawing): [the first part](#logic) — data, sync, playback, rules.
- **UI** (what you see): [`ui/`](#ui--what-you-see), split by feature. Shared parts are in `ui/kit/`.

Keep this file up to date: when you add, move or delete a file, change its line here. Each file also starts with the same sentence as a `//` comment — change both together.

## Logic

### `design/` — The app's colours, fonts, sizes and colour checks, kept in one place.

| File | What it does |
|---|---|
| `accent.ts` | Saves the chosen accent colour and applies it across the whole app. |
| `contrast.ts` | Measures colour contrast so every text colour stays easy to read. |
| `fonts.ts` | Loads the two app fonts at start-up, falling back to system fonts. |
| `gradient.ts` | Picks the player's background wash, refusing tints that make text hard to read. |
| `index.ts` | Gathers the design exports so screens import them from one place. |
| `tailwind.ts` | Lets links and gradients accept style class names like other components. |
| `tokens.ts` | Lists every colour, font size, spacing and corner size the app uses. |

### `discover/` — The Discover tab: podcast search, charts, categories and recommendations to explore.

| File | What it does |
|---|---|
| `apple.ts` | Searches Apple's public podcast catalogue for shows. |
| `cache.ts` | Keeps the last Discover page so it still shows when offline. |
| `category-list.ts` | Sorts and filters the shows on a category page. |
| `end-offer.ts` | Decides which episode to suggest when one ends and the queue is empty. |
| `genres.ts` | Lists Apple's podcast categories with their icons. |
| `local-search.ts` | Searches your subscribed shows and their episodes on the phone, offline. |
| `open.ts` | Opens an episode card, fetching its show's feed first if needed. |
| `sections.ts` | Works out which Discover sections to show from the server's data. |
| `trending.ts` | Picks trending show names to rotate as hints in the search box. |
| `useDiscover.ts` | Gives screens the Discover data, refreshes it, and opens or plays cards. |

### `downloads/` — Saving episodes to the phone for offline listening.

| File | What it does |
|---|---|
| `expo-downloader.ts` | Downloads episode files to the phone, with pause and resume. |
| `expo-network.ts` | Tells whether the phone is on Wi-Fi, mobile data, or offline. |
| `manager.ts` | Runs the download queue: order, Wi-Fi rule, storage limit, and progress. |
| `types.ts` | Describes the downloader and network pieces the download manager uses. |

### `feeds/` — Fetching podcast RSS feeds and keeping a copy on the phone.

| File | What it does |
|---|---|
| `fetch-extras.ts` | Fetches and caches an episode's chapters and transcript. |
| `fetch.ts` | Refreshes one show's feed, keeping the saved copy if it fails. |
| `hash.ts` | Makes episode ids the same way the server does. |
| `refresh-all.ts` | Refreshes every subscribed show one by one, so one failure stops nothing. |

### `graph/` — Clips, the Following feed, and listening time shared with other people.

| File | What it does |
|---|---|
| `clips.ts` | Saves new clips on the phone and sends them to the server later. |
| `composer.ts` | Holds the clip maker's start, end and caption while you edit. |
| `context.tsx` | Gives screens the clip sender and each episode's clip list. |
| `feed.ts` | Loads the Following feed, keeps a copy, and counts unread items. |
| `links.ts` | Builds and reads clip links, both web and in-app. |
| `listened.ts` | Records how long you listened each day and sends it to the server. |
| `resolve.ts` | Turns a clip link into an episode the player can play. |
| `share.ts` | Opens the phone's share sheet with a clip's text and link. |

### `launch/` — The short promotion screen shown when the app starts.

| File | What it does |
|---|---|
| `api.ts` | Fetches launch promotions and reports views and taps, without user identity. |
| `choose.ts` | Chooses which promotion, if any, to show at launch. |
| `decide.ts` | Makes the launch-screen choice at start-up from saved data, no network. |
| `launch-files.ts` | Downloads and stores launch-screen images in the phone's cache. |
| `store.ts` | Saves the promotion list, images and daily view counts in settings. |
| `sync.ts` | Updates the promotion list and images in the background for next launch. |

### `legal/` — The legal texts (agreement, privacy, community rules) and how they display.

| File | What it does |
|---|---|
| `markdown.ts` | Turns the legal texts' simple Markdown into blocks a screen can draw. |
| `texts.ts` | Holds the user agreement, privacy policy and community rules text. |

### `me/` — The Me tab: your library, history, favourites, stickers and subscriptions.

| File | What it does |
|---|---|
| `fav-comments.ts` | Keeps the list of comments you starred, newest first. |
| `favourites.ts` | Keeps the list of episodes you starred, newest first. |
| `history.ts` | Lists episodes you listened to, most recent first. |
| `inbox.ts` | Builds the inbox of new episodes from your subscribed shows. |
| `local-list.ts` | Saves and reads small lists on the phone, safely ignoring broken data. |
| `moments.ts` | Keeps saved moments in episodes, each with an optional note. |
| `money.ts` | Formats prices for display and links to store subscription pages. |
| `my-stickers.ts` | Gives the profile card and Stickers page the same listening totals. |
| `stickers.ts` | Works out which listening badges you earned and which comes next. |
| `subscriptions.ts` | Searches, sorts and groups your subscribed shows. |
| `updates.ts` | Lists the newest episodes from all your shows in one feed. |

### `notify/` — Phone notifications: permission and push address.

| File | What it does |
|---|---|
| `expo.ts` | Connects to the phone's notification system, safely if it is missing. |
| `permission.ts` | Asks once for permission to send notifications. |
| `push-token.ts` | Registers this phone's push address at sign-in, removes it at sign-out. |

### `outside/` — Showing the app outside itself: widgets, lock screen, and Android Auto.

| File | What it does |
|---|---|
| `CarLibrarySync.tsx` | Keeps Android Auto's episode lists up to date. Draws nothing. |
| `android-widget.tsx` | Draws the Android home-screen widget with episode and play/pause. |
| `bridge.ts` | Sends player changes to the widgets, only when what they show changes. |
| `car.ts` | Builds the Queue and New episodes lists for Android Auto. |
| `ios.ts` | Updates the iPhone widget and lock-screen live activity. |
| `now-playing.ts` | Works out what widgets show: episode, show, play state, best comment. |
| `sinks.ts` | Picks which outside surfaces this phone supports, without crashing. |

### `playback/` — The audio player: playing, pausing, position, interruptions and queue.

| File | What it does |
|---|---|
| `expo-audio-adapter.ts` | Connects the app's player to the phone's real audio engine. |
| `finished.ts` | Decides when an episode counts as finished. |
| `output.ts` | Placeholder for headphone-unplug events, which the audio library cannot report. |
| `reducer.ts` | The player's rules: how each event changes play state, testable without a phone. |
| `store.ts` | Links player rules, audio engine and storage; gives screens the player. |
| `types.ts` | Defines player states, events and actions shared by the player files. |
| `video/sync.ts` | Keeps a video picture in step with the playing audio. |

### `recs/` — The personal "For You" recommendations.

| File | What it does |
|---|---|
| `cache.ts` | Keeps the last For You list, and clears it at sign-out. |
| `outbox.ts` | Stores what recommendations were shown or tapped, and sends them in batches. |
| `useForYou.ts` | Gives screens the For You list and refreshes it on focus. |
| `useRecOutbox.ts` | Connects the recommendation event outbox to a screen. |

### `safety/` — Reporting and blocking, and hiding that content on screen.

| File | What it does |
|---|---|
| `context.tsx` | Gives screens report, block, and the current hidden and blocked lists. |
| `filter.ts` | Hides reported or blocked comments, clips and people from lists. |
| `hidden.ts` | Saves a report or block at once and sends it to the server later. |

### `search/` — The Search page: history, highlights, QR scans and suggestions.

| File | What it does |
|---|---|
| `history.ts` | Keeps your last 12 search terms on this phone. |
| `match.ts` | Splits a name so the part matching your search can be highlighted. |
| `scan.ts` | Decides what a scanned QR code opens, or searches its text. |
| `suggest.ts` | Suggests show names to search, taken from Discover data. |

### `settings/` — Settings pages, help texts, feedback, and the app's switches.

| File | What it does |
|---|---|
| `academy.ts` | Help articles for podcast creators about using the app and Studio. |
| `collected.ts` | Lists the personal data the app keeps, with live counts. |
| `export-steps.ts` | Explains how to export your shows from other podcast apps. |
| `faq.ts` | Questions and answers for the Help page. |
| `feedback-images.ts` | Lets you pick photos for feedback and shrinks them. |
| `feedback-shrink.ts` | Shrinks a picked image until it is small enough to send. |
| `feedback.ts` | Sends feedback by email and keeps a copy on the phone. |
| `how-for-you.ts` | Explains in plain words how For You picks episodes. |
| `opml.ts` | Imports or exports your subscription list as an OPML file. |
| `playback.ts` | Decides if streaming is allowed on mobile data. |
| `prefs.ts` | Lists the settings switches, their defaults, and reads them. |
| `queue.ts` | Adds an episode to the queue using your queue settings. |

### `social/` — Accounts, comments, reactions and talking to the server.

| File | What it does |
|---|---|
| `api.ts` | Typed client for every server call, with clear error types. |
| `auth-store.ts` | Handles sign-up, sign-in and sign-out, and stores the account. |
| `base-url.ts` | Gives the server address set in the app config. |
| `cache.ts` | Keeps each episode's last comments and reactions for offline viewing. |
| `composer.ts` | Runs the comment box: captures the moment, posts, keeps drafts. |
| `context.tsx` | Gives screens the server client, account, and who is signed in. |
| `drafts.ts` | Saves unsent comment text so it survives sign-in or app closing. |
| `links.ts` | Gives links to legal pages and the appeals email address. |
| `live.ts` | Shows "N listening now" in the player, checking once a minute. |
| `m12-api.ts` | Extra server calls: likes, friends listening, picks, purchases, tips, voice posts. |
| `poll.ts` | Checks for new comments every 10 seconds, only when useful. |
| `react.ts` | Toggles a reaction at once, then confirms with the server. |
| `registration.ts` | Describes an episode to the server using the phone's saved feed. |
| `store-ready.ts` | Remembers whether in-app purchases are switched on. |
| `token.ts` | Stores the sign-in token in the phone's secure storage. |
| `usePoll.ts` | Runs the comment check while the screen is open and online. |
| `voice.ts` | Size and length limits for short voice status posts. |
| `who.ts` | Writes friend names like "Ana, Bo and 3 others". |

### `storage/` — The phone's local database and its data shapes.

| File | What it does |
|---|---|
| `memory.ts` | In-memory copy of the storage, used by tests instead of the database. |
| `playable.ts` | Turns a saved episode into what the player needs, using downloads first. |
| `schema.ts` | Creates and upgrades the phone database tables. |
| `sqlite.ts` | Reads and writes app data in the phone's SQLite database. |
| `types.ts` | Defines the shapes of all saved data and storage functions. |

### `sync/` — Keeping your data the same across your phones through the server.

| File | What it does |
|---|---|
| `device-id.ts` | Makes and keeps a stable id for this phone install. |
| `library.ts` | Syncs favourites, saved moments and search history with your account. |
| `positions.ts` | Syncs where you stopped in each episode with the server. |
| `subscriptions.ts` | Syncs your subscribed shows with the server. |

## ui — what you see

### `ui/kit/` — Small shared parts every screen is built from

| File | What it does |
|---|---|
| `Artwork.tsx` | Show or episode cover; shows the show's first letter while loading or broken. |
| `Button.tsx` | The app's one button: yellow, white with border, or for delete actions. |
| `Card.tsx` | A white box with thin border that groups rows; plus the line between rows. |
| `Chip.tsx` | A round tap-able label; turns yellow when chosen. |
| `ComingSoon.tsx` | A "Coming soon" box shown when you tap a feature not ready yet. |
| `EmptyState.tsx` | What an empty, loading, offline or failed page shows, with a Retry button. |
| `Eyebrow.tsx` | A small grey capital-letter label above a section. |
| `Icon.tsx` | Simple drawn icons (play, pause, arrows) and the one font icon helper. |
| `Loader.tsx` | The app's own loading sign: five sound bars moving up and down. |
| `PageHeader.tsx` | Top of a normal page: back arrow, then the page name in large serif. |
| `ProgressRing.tsx` | A circle that fills around the mini player's play button as you listen. |
| `PullRefresh.tsx` | Pull a list down to reload it, showing the app's own loading sign. |
| `Row.tsx` | The standard list row: cover, title, grey second line, optional item on right. |
| `Screen.tsx` | Outer frame of every screen; leaves room for mini player and tab bar. |
| `Segmented.tsx` | A pill with two to four choices; the chosen one is yellow. |
| `SheetRow.tsx` | One full-width row in a pop-up action list: icon, label, optional detail. |
| `ToastHost.tsx` | The short message that pops up near the top, then goes away. |
| `Toggle.tsx` | The app's own on/off switch. |
| `TopBar.tsx` | Top bar with back (or close) button on left, page actions on right. |
| `confirm.tsx` | A "Are you sure?" sheet from the bottom with the action and Cancel. |
| `format.ts` | Turns numbers into text: times like 14:32, dates, show notes as plain text. |
| `loader-timing.ts` | Timing numbers for the loading sign's moving bars. |
| `ring.ts` | Math for how far the progress circle is turned. |
| `two-tone.ts` | Splits a section title into first word and the rest, for two colours. |
| `useColours.ts` | Gives the app's colour values to code that needs a colour, not a class. |

### `ui/shell/` — The app's outer layer: start-up, tabs, terms and shared setup

| File | What it does |
|---|---|
| `LaunchScreen.tsx` | Full-screen promotion picture for up to 3 seconds at start, with Skip. |
| `LegalDoc.tsx` | Shows one full legal document, with contents, over the terms page. |
| `TabBar.tsx` | The bottom tab bar you tap to change between main pages. |
| `Terms.tsx` | First-run page: you must agree to terms and privacy before using the app. |
| `launch.ts` | Rules for when to open sign-in and keep the start screen up. |
| `providers.tsx` | Sets up data, the audio player and messages once for the whole app. |
| `startup.ts` | Keeps the start screen at least 1 second, at most 6 seconds. |
| `tabs.ts` | The list of bottom tabs (Discover, Updates, Me) as data. |
| `terms.ts` | Terms version, title and text pointers; remembers if you agreed. |

### `ui/player/` — The full player page and its parts

| File | What it does |
|---|---|
| `ChapterList.tsx` | List of episode chapters; current one is bold; tap to jump there. |
| `EndOffer.tsx` | Card at episode end: "Next up" episode with a Play button. |
| `HeatCurve.tsx` | 100 bars under the seek bar showing where listeners reacted; tap to jump. |
| `MiniPlayer.tsx` | Small bar at the bottom showing what plays; tap to open the player. |
| `NextUp.tsx` | Loads the "Next up" episodes, each with a reason, for the episode page. |
| `Rail.tsx` | Small marks on the seek bar where people left timed comments. |
| `Scrubber.tsx` | The seek bar under the player; drag it to jump in the episode. |
| `SleepTimerControl.tsx` | Sleep timer choices (5–60 min, end of episode), time left, Cancel. |
| `SpeedControl.tsx` | Play speed: minus and plus buttons, quick choices, set as default. |
| `TranscriptPane.tsx` | Episode transcript; current line is marked; tap a line to jump. |
| `VideoStage.tsx` | Shows the video picture for video episodes; sound comes from the audio. |
| `mini-player-swipe.ts` | Hides the mini player early on swipe-back, so it never shows under tabs. |
| `palette.ts` | Player colours, with a light tint of the show's own colour at the top. |

### `ui/queue/` — The list of episodes waiting to play

| File | What it does |
|---|---|
| `QueueButtons.tsx` | "Add to queue" and "Play next" buttons, as tiles in the episode menu. |
| `QueueList.tsx` | The queue's rows: play, move up/down, remove, drag to reorder. |
| `QueueSheet.tsx` | The queue as a sheet over the player, titled "Up next". |

### `ui/comments/` — Comments on an episode: read, write, report

| File | What it does |
|---|---|
| `CommentPreview.tsx` | Two newest comments on the episode page, then "All N comments". |
| `CommentRow.tsx` | One comment card: picture, name, time, moment chip, text, likes, replies. |
| `CommentsButton.tsx` | Comment icon with the comment count under an Updates row. |
| `Composer.tsx` | The box where you write a comment or reply, with its moment in time. |
| `EpisodeCard.tsx` | The episode with play/pause at the top of the comments page. |
| `MomentSheet.tsx` | Sheet with the comments at one moment; reply, delete or report. |
| `Placeholder.tsx` | Short text shown instead of a deleted, removed, blocked or reported comment. |
| `ReportSheet.tsx` | Sheet to report a comment: pick a reason, add a note, send. |

### `ui/clips/` — Short parts of an episode that listeners save and share

| File | What it does |
|---|---|
| `ClipCard.tsx` | One clip: caption, who made it, time range, play and share buttons. |
| `ClipComposer.tsx` | Make a clip: set start and end while listening, preview, add caption, save. |
| `ClipList.tsx` | The episode's clips, sending ones first, then newest first. |
| `ShareChooser.tsx` | The app's share panel: share episode, this moment, or a picture. |

### `ui/social/` — People: follow, block, profiles and activity

| File | What it does |
|---|---|
| `BlockButton.tsx` | Block or Unblock a person, asking first. |
| `FeedItem.tsx` | One activity row: who commented, clipped or listened, and on which episode. |
| `FollowButton.tsx` | Follow or Following button on a profile. |
| `FollowList.tsx` | Page-by-page list of a person's followers or who they follow. |
| `NoticeCards.tsx` | Two-choice switch at top of Notifications: System or People. |
| `ProfileStatRow.tsx` | A profile's numbers in one row: following, followers, shows, listening time. |
| `StatsBlock.tsx` | Listening numbers for last 7 days and all time: time, finished, top shows. |
| `VoicePosts.tsx` | Short voice posts from you and people you follow; tap to play, record new. |

### `ui/episode/` — Parts of episode rows and the episode page

| File | What it does |
|---|---|
| `ContinueListening.tsx` | Card at top of Updates to go on with your last episode. |
| `DownloadButton.tsx` | Download button showing every state: waiting, percent, done, failed, remove. |
| `EpisodeRow.tsx` | One episode in a list: cover, title, show, length and date. |
| `HeroArtwork.tsx` | Big cover with soft shadow at the top of episode and show pages. |
| `RelatedEpisodes.tsx` | Up to 5 related episodes at the bottom of the episode page. |
| `ShowNotes.tsx` | Episode notes; lines starting with a time become rows that play from there. |
| `UpdateEpisodeRow.tsx` | One episode card on Updates: notes, plays, comments, small buttons, Play. |

### `ui/show/` — Parts of the show page

| File | What it does |
|---|---|
| `AnnouncementCard.tsx` | The host's newest announcement as a card; tap to read it all. |
| `CuratorLine.tsx` | "Hosted by" line and "Shared by" line linking to who shared the show. |
| `EpisodeMeta.tsx` | Small line under a show's episode: length, how long ago, plays, comments. |
| `ShowExtras.tsx` | What the host added: announcements, polls, hosts, links and contacts. |
| `order.ts` | Sorts the show's episodes: newest, oldest, unplayed only, or most played. |

### `ui/discover/` — The Discover (home) page and its sections

| File | What it does |
|---|---|
| `DiscoverSections.tsx` | Discover's main sections: picks, then episode lists, with an old-data note. |
| `ForYou.tsx` | "For You" list of suggested episodes, each with its reason; signed in only. |
| `PickCard.tsx` | One editor's pick: the episode plus a short quote on why. |
| `parts.tsx` | Small Discover pieces: section title, round play button, episode line, pager, search box. |
| `sections.tsx` | Each Discover section: shortcuts, editor picks, For You, the chart, and more. |

### `ui/search/` — Search for shows and episodes

| File | What it does |
|---|---|
| `SearchOverlay.tsx` | Opens search on top of the tabs, in place, not as a new page. |
| `SearchPage.tsx` | Search box, your shows first, then catalogue results; recent searches and categories. |

### `ui/me/` — The Me tab and your own lists

| File | What it does |
|---|---|
| `EpisodeExtras.tsx` | Favourite and "Save moment" (with a note) buttons in the episode menu. |
| `FilterBar.tsx` | Search box above History, Favourites, Subscriptions; History's "Only finished" choice. |
| `SignOut.tsx` | Sign out button that asks first. |
| `country.ts` | Turns a country code like "MY" into its name, "Malaysia". |
| `parts.tsx` | Me page pieces: a menu row with icon and arrow, and an empty-page picture. |

### `ui/settings/` — Parts of the settings pages

| File | What it does |
|---|---|
| `NotifyShows.tsx` | One "new episodes" alert switch for each show you follow. |
| `rows.tsx` | Settings rows: icon, label, optional value, then an arrow or switch. |

### `ui/auth/` — Sign-in and sign-up pages

| File | What it does |
|---|---|
| `ArtWall.tsx` | A row of show covers moving slowly on the sign-in page. |
| `AuthShell.tsx` | Shared frame for sign-in pages: close ✕, big title, form, bottom button. |
| `Consent.tsx` | The "I agree" tick box under sign-in, and the ask if not ticked. |
| `art.ts` | Picks which real show covers to show on the sign-in page. |
| `display.ts` | The large serif title style on sign-in pages. |
| `errors.ts` | Turns a sign-in error into a short message for the user. |
| `methods.ts` | The other sign-in ways (Google, Facebook), not ready yet. |
| `navigate.ts` | Where you go after signing in or out. |
| `rules.ts` | Rules for the sign-in button and checking an email looks right. |

### `ui/lib/` — gluestack-ui building blocks (Text, Box, Pressable, sheets…) — generated, rarely edited
