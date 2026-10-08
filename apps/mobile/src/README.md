# apps/mobile/src — file map

Every file in `src/`, one plain line each. Screens are in [`../app/`](../app/README.md).
Import any file here as `@/<path>`, e.g. `@/ui/kit/Button`, `@/social/api`.

- **Logic** (no drawing): [the first part](#logic) — data, sync, playback, rules.
- **UI** (what you see): [`ui/`](#ui--what-you-see), split by feature. Shared parts are in `ui/kit/`.

Keep this file up to date: when you add, move or delete a file, change its line here. Each file also starts with the same sentence as a `//` comment — change both together.

## Logic

### `billing/` — Buying PLUS, paid shows and tips through Google Play (Android).

| File | What it does |
|---|---|
| `play.ts` | Buys on Google Play (Android) and finishes a purchase only after the server has granted it. |
| `products.ts` | The products the app sells and the rules for each: which are subscriptions, which can be bought again. |
| `purchase-api.ts` | Server calls for purchases: send a Google Play purchase, read a show's paid episodes, get a play link. |

### `design/` — The app's colours, fonts, sizes and colour checks, kept in one place.

| File | What it does |
|---|---|
| `accent.ts` | Saves the chosen accent colour and applies it across the whole app. |
| `contrast.ts` | Measures colour contrast so every text colour stays easy to read. |
| `fonts.ts` | Loads the two app fonts at start-up, falling back to system fonts. |
| `gradient.ts` | Picks page and player tints, refusing any that make text hard to read. |
| `merge.ts` | Teaches the class merger the app's own text sizes, so a colour and a size can sit together. |
| `index.ts` | Gathers the design exports so screens import them from one place. |
| `tailwind.ts` | Lets links and gradients accept style class names like other components. |
| `tokens.ts` | Lists every colour, font size, spacing and corner size the app uses. |

### `discover/` — The Discover tab: podcast search, charts, categories and recommendations to explore.

| File | What it does |
|---|---|
| `cache.ts` | Keeps the last Discover page so it still shows when offline. |
| `category-cache.ts` | Keeps each category's last list so its page shows at once, then refreshes quietly. |
| `row-stats.ts` | Fetches "listened" and comment counts for every episode on Discover in one call. |
| `explore-api.ts` | Server calls for M21 Discover: the three charts, treasure hunt, plaza, daily picks, like posts, dated search. |
| `hidden-categories.ts` | Remembers which category tiles the listener hid on Discover, and brings them back. |
| `plaza-grid.ts` | The plaza's grid sums: which tiles to mount for a pan offset, which show sits in a cell, when to load more. |
| `category-list.ts` | Sorts and filters the shows on a category page. |
| `end-offer.ts` | Decides which episode to suggest when one ends and the queue is empty. |
| `first-paint.ts` | Holds the Discover page back until its data is in, so it appears whole, not piece by piece. |
| `genres.ts` | Lists Apple's podcast categories with their icons. |
| `local-search.ts` | Searches your subscribed shows and their episodes on the phone, offline. |
| `open.ts` | Opens an episode card, fetching its show's feed first if needed. |
| `sections.ts` | Works out which Discover sections to show from the server's data. |
| `trending.ts` | Picks trending show names to rotate as hints in the search box. |
| `useDiscover.ts` | Gives screens the Discover data, refreshes it, and opens or plays cards. |
| `interests.ts` | Remembers the categories picked on first open, and decides when to ask (once more after a skip, a week later). |

### `downloads/` — Saving episodes to the phone for offline listening.

| File | What it does |
|---|---|
| `expo-downloader.ts` | Downloads episode files to the phone, with pause and resume. |
| `expo-network.ts` | Tells whether the phone is on Wi-Fi, mobile data, or offline. |
| `manager.ts` | Runs the download queue: order, Wi-Fi rule, storage limit, and progress. |
| `multi-select.ts` | Choosing several downloads and deleting them together (the Downloads page's Select mode). |
| `types.ts` | Describes the downloader and network pieces the download manager uses. |

### `feeds/` — Fetching podcast RSS feeds and keeping a copy on the phone.

| File | What it does |
|---|---|
| `fetch-extras.ts` | Fetches and caches an episode's chapters and transcript. |
| `fetch.ts` | Refreshes one show's feed, keeping the saved copy if it fails. |
| `hash.ts` | Makes episode ids the same way the server does. |
| `hidden.ts` | Remembers which episodes a show's creator hid, and leaves them out of the phone's lists. |
| `refresh-all.ts` | Refreshes every subscribed show one by one, so one failure stops nothing. |

### `graph/` — Clips, the Following feed, and listening time shared with other people.

| File | What it does |
|---|---|
| `clips.ts` | Saves new clips on the phone and sends them to the server later. |
| `composer.ts` | Holds the clip maker's start, end and caption while you edit. |
| `context.tsx` | Gives screens the clip sender and each episode's clip list. |
| `transcript-select.ts` | Picks a run of transcript lines (contiguous only) and says whether it can become a clip. |
| `feed.ts` | Loads the Following feed, keeps a copy, and counts unread items. |
| `links.ts` | Builds and reads clip links, both web and in-app. |
| `listened.ts` | Records how long you listened each day and sends it to the server. |
| `quote.ts` | Works out the lines a listener picked from a transcript: their text, start, end and limits. |
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
| `licences.ts` | The open-source packages the app ships and their licences, read from the generated licences.json. |
| `texts.ts` | Holds the user agreement, privacy policy and community rules text. |

### `me/` — The Me tab: your library, history, favourites, stickers and subscriptions.

| File | What it does |
|---|---|
| `fav-comments.ts` | Keeps the list of comments you starred, newest first. |
| `favourites.ts` | Keeps the list of episodes you starred, newest first. |
| `history.ts` | Lists episodes you listened to, most recent first. |
| `local-list.ts` | Saves and reads small lists on the phone, safely ignoring broken data. |
| `moments.ts` | Keeps saved moments in episodes, each with an optional note. |
| `listening-api.ts` | Server calls for listening data, sticker placements and the monthly recap picture. |
| `listening-chart.ts` | The Listening data chart's maths and words: the axis top, the bar boxes, and day, month and minute labels. |
| `my-avatar.ts` | My own profile photo for Me and Updates: the saved copy at once, refreshed from the server. |
| `money.ts` | Formats prices for display and links to store subscription pages. |
| `my-stickers.ts` | Gives the profile card and Stickers page the same listening totals, earned dates and others' stickers. |
| `sticker-layout.ts` | The sticker canvas maths: sizes from the canvas width, drag, pinch and turn, add, stack and the button nudges. |
| `stickers.ts` | Works out which listening badges you earned, which comes next, and how each one is earned. |
| `subscriptions.ts` | Searches, sorts and groups your subscribed shows. |
| `subscription-order.ts` | Keeps my own order of subscriptions on the phone and in step with the server. |
| `updates.ts` | Lists the newest episodes from all your shows in one feed. |

### `notify/` — Phone notifications: permission and push address.

| File | What it does |
|---|---|
| `expo.ts` | Connects to the phone's notification system, safely if it is missing. |
| `permission.ts` | Asks once for permission to send notifications. |
| `push-token.ts` | Registers this phone's push address at sign-in, removes it at sign-out. |
| `route.ts` | Where a tapped notification goes: its in-app path, or (older pushes) its episode. |

### `outside/` — Showing the app outside itself: widgets, lock screen, and Android Auto.

| File | What it does |
|---|---|
| `CarLibrarySync.tsx` | Keeps Android Auto's episode lists up to date. Draws nothing. |
| `android-widget.tsx` | Draws the Android home-screen widgets: now playing with play/pause, the playlist, the daily pick and this week's listening. |
| `bridge.ts` | Sends player changes to the widgets, and the nearby comment to the lock screen, only when they change. |
| `car.ts` | Builds the Queue and New episodes lists for Android Auto. |
| `ios.ts` | Updates the iPhone widget and lock-screen live activity. |
| `now-playing.ts` | Works out what widgets and the lock screen show: episode, show, play state, a comment. |
| `sinks.ts` | Picks which outside surfaces this phone supports, without crashing. |
| `widget-data.ts` | Works out and saves what the Playlist, Daily pick and Listening-this-week widgets show. |

### `playback/` — The audio player: playing, pausing, position, interruptions and queue.

| File | What it does |
|---|---|
| `expo-audio-adapter.ts` | Connects the app's player to the phone's real audio engine. |
| `finished.ts` | Decides when an episode counts as finished. |
| `preview.ts` | A paid episode's free preview: play only [startMs, endMs) for a listener who has not bought it. |
| `reducer.ts` | The player's rules: how each event changes play state, testable without a phone. |
| `store.ts` | Links player rules, audio engine and storage; gives screens the player. |
| `types.ts` | Defines player states, events and actions shared by the player files. |
| `video/sync.ts` | Keeps a video picture in step with the playing audio. |

### `recs/` — The personal "For You" recommendations.

| File | What it does |
|---|---|
| `cache.ts` | Keeps the last For You list, and clears it at sign-out. |
| `dismissals.ts` | Remembers the episodes and shows you marked "Not interested", so For You leaves them out at once. |
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
| `audio.ts` | Says when voice boost can work on this phone, and when an episode greys out boost and skip silence. |
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
| `teen-passcode.ts` | Keeps the teen-mode passcode as a salted SHA-256 hash, and counts wrong tries (5 → 15 minutes). |

### `social/` — Accounts, comments, reactions and talking to the server.

| File | What it does |
|---|---|
| `api.ts` | Typed client for every server call, with clear error types. |
| `account-api.ts` | Server calls for the account: redeem a code, change the sign-in email. |
| `api-m22-server.ts` | Server calls for M22 lane 5: bottom pins, the deletion wait, time zone, translated transcripts, gifts and the weekly digest. |
| `auth-store.ts` | Handles sign-up, sign-in and sign-out, and stores the account. |
| `avatar-image.ts` | Lets you pick a square profile photo and shrinks it to 400 px and under 200 KB. |
| `base-url.ts` | Gives the server address set in the app config. |
| `cache.ts` | Keeps each episode's last comments and reactions for offline viewing. |
| `chat-api.ts` | Chat server calls (conversations, messages, friends) and merging new messages into a thread. |
| `comment-extras-api.ts` | Server calls for comment extras: pin, mark unfriendly, the reply page, voice comments, rules and mutes. |
| `composer.ts` | Runs the comment box: captures the moment, posts, keeps drafts. |
| `context.tsx` | Gives screens the server client, account, and who is signed in. |
| `drafts.ts` | Saves unsent comment text so it survives sign-in or app closing. |
| `links.ts` | Gives links to legal pages and the appeals email address. |
| `live.ts` | Shows "N listening now" in the player, checking once a minute. |
| `m12-api.ts` | Extra server calls: likes, friends listening, picks, purchases, tips, voice posts. |
| `m19-api.ts` | Server calls for playlists, notices from hosts, the monthly report and the teen-mode reset. |
| `api-m22-library.ts` | Server calls for the synced playlist and for deleting listening history. |
| `notifications-api.ts` | Server calls for Interactions (replies, likes, mentions, follows), and where each notice opens. |
| `appeals-api.ts` | Server calls for appeals: what I may appeal, and sending one appeal — with a session or the suspension's token. |
| `lists-api.ts` | Server call for one shared show list (GET /v1/lists/:id), and checking what came back. |
| `poll.ts` | Checks for new comments every 10 seconds, only when useful. |
| `profile-api.ts` | Server calls for your profile, photo, hidden recommendations and episode likes. |
| `us8-api.ts` | Server calls for text statuses, my subscription order, and others' public subscriptions. |
| `api-m22-social.ts` | Server calls for M22's social layer: push switches, muted threads, status replies, reactions, items and photos. |
| `react.ts` | Toggles a reaction at once, then confirms with the server. |
| `registration.ts` | Describes an episode to the server using the phone's saved feed. |
| `store-ready.ts` | Remembers whether in-app purchases are switched on. |
| `token.ts` | Stores the sign-in token in the phone's secure storage. |
| `usePoll.ts` | Runs the comment check while the screen is open and online. |
| `voice.ts` | Size and length limits for short voice status posts. |
| `voice-text.ts` | Records a voice post or comment while the phone turns the speech into text, then shrinks the audio. |
| `comment-image.ts` | Lets you pick one photo for a comment and shrinks it to a JPEG the server takes. |
| `image-fit.ts` | The size math for comment pictures: shrink to fit, and the thumbnail's box. |
| `who.ts` | Writes friend names like "Ana, Bo and 3 others". |
| `api-m22-discover.ts` | Server calls for M22's interests, "Not liking these?", tell-the-editors, shared show lists and often listened. |

### `storage/` — The phone's local database and its data shapes.

| File | What it does |
|---|---|
| `clear-cache.ts` | Clear cache: measures and deletes the phone's cache folder and saved pages, never downloads. |
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
| `queue.ts` | Syncs your playlist with your account, and asks which one to keep when two phones changed it. |
| `subscriptions.ts` | Syncs your subscribed shows with the server. |
| `watch.ts` | Brings positions played on the Apple Watch into the phone, and decides when "Download to Watch" shows. |

### `telemetry/` — The app's own error log (M23): swallowed errors, kept and sent to our server.

| File | What it does |
|---|---|
| `reportError.ts` | Keeps the app's last 50 errors and sends them to our own server, at most once a minute. |

## ui — what you see

### `ui/kit/` — Small shared parts every screen is built from

| File | What it does |
|---|---|
| `Artwork.tsx` | Show or episode cover; shows the show's two-letter tile while loading, broken or missing. |
| `Avatar.tsx` | A person's round picture: their photo, or their letters when there is none. |
| `BottomBar.tsx` | The bar pinned to a page's foot: its button sits in the middle, the same space above and below. |
| `Button.tsx` | The app's one button: yellow, white with border, or for delete actions. |
| `BusyContent.tsx` | A button's words and icons, swapped for the moving sound bars while its press runs. |
| `Card.tsx` | A white box with thin border that groups rows; plus the line between rows. |
| `Chip.tsx` | A round tap-able label; turns yellow when chosen. |
| `ComingSoon.tsx` | A "Coming soon" sheet shown when you tap a feature not ready yet. |
| `EmptyState.tsx` | What an empty, loading, offline or failed page shows, with a Retry button. |
| `Eyebrow.tsx` | A small grey capital-letter label above a section. |
| `EndOfList.tsx` | The line under the last row of a fetched list: "No more to fetch". |
| `EpisodeRowSheet.tsx` | The one sheet every episode row opens from ⋯ or a long-press: cover header and episode actions. |
| `TintedPage.tsx` | A paper page that fades to the cover's tint once it is known, never through a dark colour. |
| `haptics.ts` | A light vibration tick; does nothing on an app built before expo-haptics was added. |
| `Icon.tsx` | Simple drawn icons (play, pause, arrows) and the one font icon helper. |
| `Loader.tsx` | The app's own loading sign: five sound bars moving up and down. |
| `PageHeader.tsx` | Top of a normal page: back arrow, then the page name in large serif. |
| `ProgressRing.tsx` | A circle that fills around the mini player's play button as you listen. |
| `PullRefresh.tsx` | Pull a list down to reload it, showing the app's own loading sign. |
| `Screen.tsx` | Outer frame of every screen; leaves room for mini player and tab bar. |
| `Segmented.tsx` | A pill with two to four choices; the chosen one is yellow. |
| `Sheet.tsx` | A sheet from the bottom with two heights: drag its top up to grow it, down to shrink or close it. |
| `SheetRow.tsx` | One full-width row in a pop-up action list: icon, label, optional detail. |
| `SwipeRow.tsx` | A row you can swipe left or right to show its actions, each also a screen-reader action. |
| `ToastHost.tsx` | The short message that pops up near the top, then goes away. |
| `Toggle.tsx` | The app's own on/off switch. |
| `TopBar.tsx` | Top bar with back (or close) button on left, page actions on right. |
| `confirm.tsx` | A "Are you sure?" sheet from the bottom with the action and Cancel. |
| `format.ts` | Turns numbers into text: times like 14:32, dates, show notes as plain text. |
| `loader-timing.ts` | Timing numbers for the loading sign's moving bars. |
| `ring.ts` | Math for how far the progress circle is turned. |
| `useColours.ts` | Gives the app's colour values to code that needs a colour, not a class. |
| `useLoad.ts` | Loads a screen's data, drops the answer once the screen has closed, and gives a retry. |
| `openLink.ts` | Opens a link the right way: web pages in the in-app browser, our own links in the app, the rest by the system. |

### `ui/shell/` — The app's outer layer: start-up, tabs, terms and shared setup

| File | What it does |
|---|---|
| `LaunchScreen.tsx` | Full-screen promotion picture for up to 3 seconds at start, with Skip. |
| `LegalDoc.tsx` | Shows one full legal document, with contents, over the terms page. |
| `RateSheet.tsx` | "Enjoying SocialNet?" — a bottom sheet asking for a store rating, or for feedback instead. |
| `TabBar.tsx` | The bottom tab bar you tap to change between main pages. |
| `Terms.tsx` | First-run page: you must agree to terms and privacy before using the app. |
| `launch.ts` | Rules for when to open sign-in and keep the start screen up. |
| `providers.tsx` | Sets up data, the audio player and messages once for the whole app. |
| `startup.ts` | Keeps the start screen at least 1 second, at most 6 seconds. |
| `tabs.ts` | The list of bottom tabs (Discover, Updates, Chat, Me) as data. |
| `useLayout.ts` | Says whether the window is wide enough for the tablet layout (side rail, two panes) and whether it is a phone. |
| `startupExtras.ts` | Small start-up jobs: hold phones in portrait, app-icon shortcuts, the maintenance check, What's new, vibration and lock-screen skip settings. |
| `ListDetail.tsx` | Two panes on a tablet: the list on the left, the chosen item on the right; just the list on a phone. |
| `iconReset.ts` | Puts the app icon back to Default at start-up when PLUS has ended and one of the PLUS icons is still set. |
| `consent.ts` | Terms version, title and text pointers; remembers if you agreed. |
| `updater.ts` | Decides when the Android self-updater may show, and checks a downloaded APK's SHA-256 before install. |

### `ui/player/` — The full player page and its parts

| File | What it does |
|---|---|
| `ChapterList.tsx` | List of episode chapters; current one is bold; tap to jump there. |
| `EndOffer.tsx` | Card at episode end: "Next up" episode with a Play button. |
| `DataPrompt.tsx` | The sheet that asks before streaming on mobile data: Allow this time, or Always allow. |
| `ClapBurst.tsx` | A short full-screen burst of thumbs when the listener reacts; never blocks a tap; off with Reduce Motion. |
| `HeatCurve.tsx` | 100 bars under the seek bar showing where listeners reacted; tap to jump. |
| `HeatScrubber.tsx` | The heat curve over a seek bar (track, dark fill, knob): tap or drag across either to jump. |
| `MiniPlayer.tsx` | Small bar at the bottom showing what plays; tap to open the player. |
| `PlayRing.tsx` | The mini player's progress ring: a strong yellow arc on a light grey track around play/pause. |
| `NextUp.tsx` | Loads the "Next up" episodes, each with a reason, for the episode page. |
| `Rail.tsx` | Small marks on the seek bar where people left timed comments. |
| `Scrubber.tsx` | The seek bar under the player; drag it to jump in the episode. |
| `SettingsPanel.tsx` | The Playback sheet: speed, sleep, chapters and transcript; loop, audio and the rest behind "More settings". |
| `SleepTimerControl.tsx` | Sleep timer choices (5–90 min), End of episode, time left, Cancel — in three layouts. |
| `swipe-close.ts` | The player's swipe down: a downward drag on its top area closes the player. |
| `MoonButton.tsx` | The player's moon button: opens the sleep timer and shows its time left. |
| `SpeedControl.tsx` | Play speed: − big number +, quick choices and the default link; the slider and "This show only" in More settings. |
| `TranscriptExtras.tsx` | The player's two transcript lines (now and next) with ⤢, and the sheet to report a wrong line. |
| `TranscriptPane.tsx` | Episode transcript: follows the audio, tap a line to jump, long-press to share lines or report a mistake. |
| `VideoStage.tsx` | Shows the video picture for video episodes; sound comes from the audio. |
| `mini-player-swipe.ts` | Hides the mini player early on swipe-back, so it never shows under tabs. |
| `palette.ts` | Player colours, with a light tint of the show's own colour at the top. |
| `QuoteShare.tsx` | Shares lines picked from the transcript as a picture made by the server, or as a short video. |

### `ui/queue/` — The list of episodes waiting to play

| File | What it does |
|---|---|
| `QueueButtons.tsx` | "Add to queue" and "Play next" buttons, as tiles in the episode menu. |
| `QueueChooser.tsx` | The sheet that asks which playlist to keep when this phone and another changed it. |
| `QueueList.tsx` | The queue's rows: play, move up/down, remove, drag to reorder. |
| `QueueSheet.tsx` | The playlist as a sheet over any page: playing now first, then the queue, with an Edit mode. |
| `QueueSheetHost.tsx` | Holds the one playlist sheet at the root, so the mini player and the player open the same one. |

### `ui/comments/` — Comments on an episode: read, write, report

| File | What it does |
|---|---|
| `CommentPreview.tsx` | Two newest comments on the episode page, then "All N comments". |
| `CommentRow.tsx` | One comment card: picture, name, badge, time and region, moment chip, text, likes, replies; a tap opens its menu. |
| `CommentsButton.tsx` | Comment icon with the comment count under an Updates row. |
| `Composer.tsx` | The box where you write a comment or reply, with its moment in time. |
| `EpisodeCard.tsx` | The episode with play/pause at the top of the comments page. |
| `MomentSheet.tsx` | Sheet with the comments at one moment; reply, delete or report. |
| `Placeholder.tsx` | Short text shown instead of a deleted, removed, blocked or reported comment. |
| `ReportSheet.tsx` | Sheet to report a comment: pick a reason, add a note, send. |
| `RulesSheet.tsx` | Sheet with the community rules, shown once before a first comment: Accept or Not now. |
| `VoiceComment.tsx` | A voice comment's row: a play/stop disc, a thin bar and its length; pauses the episode. |
| `VoiceRecord.tsx` | The mic beside a comment box: tap to record a voice comment up to 60 s, then post it. |
| `VoiceTextReview.tsx` | After a voice recording: the text the phone heard, editable, with Post and Cancel. |
| `CommentImage.tsx` | A comment's picture: a small one in the row, tap for the full one; hidden in teen mode until tapped. |

### `ui/clips/` — Short parts of an episode that listeners save and share

| File | What it does |
|---|---|
| `ClipCard.tsx` | One clip: caption, who made it, time range, play and share buttons. |
| `ClipComposer.tsx` | Make a clip: set start and end while listening, preview, add caption, save. |
| `ClipList.tsx` | The episode's clips, sending ones first, then newest first. |
| `ShareChooser.tsx` | The app's share panel: chat apps on this phone, share this moment, a picture, Copy link, More. |
| `share-targets.ts` | Chat apps the share panel can send to directly, how to tell they are installed, and the link that opens each. |

### `ui/chat/` — Chat messages between two people

| File | What it does |
|---|---|
| `MessageBubble.tsx` | One chat message: yours on the right in yellow, theirs on the left in white; an episode as a card. |

### `ui/social/` — People: follow, block, profiles and activity

| File | What it does |
|---|---|
| `BlockButton.tsx` | Block or Unblock a person, asking first. |
| `FeedItem.tsx` | One activity row: who commented, clipped or listened, and on which episode. |
| `FollowButton.tsx` | Follow or Following button on a profile. |
| `FollowList.tsx` | Page-by-page list of a person's followers or who they follow. |
| `LikeCard.tsx` | One liked episode: who liked it, their note as a quote, and the episode row to open or play. |
| `LikeSheet.tsx` | After you like an episode: add a short note (up to 140 characters), or skip. |
| `NoticeCards.tsx` | Top of Notifications: System and From hosts open their pages; a switch between Interactions and People. |
| `SystemNoticeCard.tsx` | One message from SocialNet: title, text, time, and at most one button that opens a page in the app. |
| `ProfileStatRow.tsx` | A profile's numbers in one row: following, followers, shows, listening time. |
| `RecentCard.tsx` | One of a person's recent public actions on their profile: a white card with the show's cover. |
| `StatsBlock.tsx` | Listening numbers for last 7 days and all time: time, finished, top shows. |
| `VoicePosts.tsx` | Short voice and text statuses from you and people you follow; tap to play or read, post new. |
| `MutedThreads.tsx` | The notice threads you muted, each with Unmute, for Settings › Privacy. |
| `StatusViewer.tsx` | Full-screen status viewer: plays on open, taps on the right or left third move, swipe down closes. |
| `MoreSheet.tsx` | A small "More" sheet: a title, a few rows (Report, Stop suggesting…) and Cancel. |
| `StatusReplies.tsx` | Replies and reactions under a status: a text box, hold to record a voice reply, six reactions, the owner's list. |
| `StatusComposerItems.tsx` | Add up to 10 episode cards and photos to a new status, from history, the queue, search or the photo library. |
| `OftenListened.tsx` | A profile's "Often listened" row: the six shows they listened to most in the last 90 days. |

### `ui/episode/` — Parts of episode rows and the episode page

| File | What it does |
|---|---|
| `CardSheet.tsx` | The episode-row sheet for a Discover / search / chart card: finds the episode, then opens the sheet. |
| `DownloadButton.tsx` | Download button showing every state: waiting, percent, done, failed, remove. |
| `EpisodeRow.tsx` | One episode in a list: cover, title, show, length and date. |
| `HeroArtwork.tsx` | Big cover with soft shadow at the top of episode and show pages. |
| `RelatedEpisodes.tsx` | Up to 5 related episodes at the bottom of the episode page, as a sideways row of cards. |
| `ShowNotes.tsx` | Episode notes; lines starting with a time become rows that play from there. |
| `UpdateEpisodeRow.tsx` | One episode card on Updates: notes, plays, comments, small buttons, Play. |
| `WatchTile.tsx` | "Download to Watch" in the episode ⋯ sheet: sends the episode to the paired Apple Watch. |
| `PictureViewer.tsx` | Full-screen pictures from show notes: pinch or double-tap to zoom, swipe between them, swipe down or ✕ to close. |

### `ui/show/` — Parts of the show page

| File | What it does |
|---|---|
| `AnnouncementCard.tsx` | The host's newest announcement as a card; tap to read it all. |
| `CuratorLine.tsx` | "Hosted by" line and "Shared by" line linking to who shared the show. |
| `EpisodeMeta.tsx` | Small line under a show's episode: length, how long ago, plays, comments. |
| `ShowExtras.tsx` | What the host added: announcements, polls, hosts, links and contacts. |
| `order.ts` | Sorts the show's episodes: newest, oldest, unplayed only, or most played. |
| `show-page.ts` | Show page rules: the subscriber line, the Host picks list, and Add all to the queue. |
| `ShowSales.tsx` | On a show page: the show's paid episodes (buy once, then play), Gift this series, and the Tip button, Android only. |

### `ui/discover/` — The Discover (home) page and its sections

| File | What it does |
|---|---|
| `DiscoverSections.tsx` | Discover's main sections: picks, then episode lists, with an old-data note. |
| `FullPager.tsx` | Whole-screen pages swiped left and right (chart, search tabs, categories), kept in step with their tabs. |
| `Plaza.tsx` | The new-shows plaza: a wall of covers dragged in any direction with one finger; tap a cover for its show. |
| `TheirLikes.tsx` | "Their likes" on Discover: recent likes with notes from people you follow, each opening its like post. |
| `TopicLists.tsx` | Topic lists on Discover: the editors' collections as cards, each opening its full list. |
| `TreasureHunt.tsx` | Treasure hunt on Discover: three lesser-heard episodes from shows you don't follow, with Shuffle. |
| `NotInterested.tsx` | The For You "⋯" sheet (not interested in this episode, or this show) and the "Hidden · Undo" line. |
| `PickCard.tsx` | One editor's pick: the episode plus a short quote on why. |
| `parts.tsx` | Small Discover pieces: section title, round play button, episode line, pager, search box. |
| `sections.tsx` | Each Discover section: shortcuts, editor picks, For You, the chart, and more. |
| `RecFeedback.tsx` | "Not liking these?" under For You, its form, and the category tiles the interests page shares. |
| `InterestsGate.tsx` | Opens the interests page once on the first open after sign-in, when no categories are saved yet. |

### `ui/search/` — Search for shows and episodes

| File | What it does |
|---|---|
| `SearchOverlay.tsx` | Opens search on top of the tabs, in place, not as a new page. |
| `SearchPage.tsx` | Search box, your shows first, then catalogue results; recent searches and categories. |
| `TellEditors.tsx` | "Can't find it? Tell us": under an empty search, sends the search words to the editors. |

### `ui/me/` — The Me tab and your own lists

| File | What it does |
|---|---|
| `EpisodeExtras.tsx` | Favourite, "Save moment" (with a note) and "Add to playlist" buttons in the episode menu. |
| `FilterBar.tsx` | Search box above History, Favourites, Subscriptions; History's "Only finished" choice. |
| `PlaylistCard.tsx` | One playlist as a white card: cover, name, number of episodes, public or private. |
| `SignOut.tsx` | Sign out button that asks first. |
| `country.ts` | Turns a country code like "MY" into its name, "Malaysia". |
| `parts.tsx` | Me page pieces: a menu row with icon and arrow, and an empty-page picture. |
| `PlusCard.tsx` | The PLUS card in Wallet: what PLUS gives, its price, Subscribe, and Restore purchases. |
| `StickerCanvas.tsx` | The sticker canvas: drag, pinch and turn your stickers on a copy of your profile header (our own design). |
| `StickerLayer.tsx` | Draws a listener's placed stickers over the top of their profile header, for every viewer; touches pass through. |

### `ui/settings/` — Parts of the settings pages

| File | What it does |
|---|---|
| `AudioRows.tsx` | Voice boost, "Play with other apps" with its warning, and the audio-output button and row. |
| `NotifyShows.tsx` | One "new episodes" alert switch for each show you follow. |
| `rows.tsx` | Settings rows: icon, label, optional value, then an arrow or switch. |
| `OftenListenedSwitch.tsx` | Privacy switch: hide the "Often listened" row on your profile from other people. |

### `ui/auth/` — Sign-in and sign-up pages

| File | What it does |
|---|---|
| `AgeConfirm.tsx` | The "I am 14 or older" tick box on the new-account step, and the "I am under 14" way out. |
| `ArtWall.tsx` | A row of words-only tiles moving slowly on the sign-in page. |
| `AuthShell.tsx` | Shared frame for sign-in pages: close ✕, big title, form, bottom button. |
| `Consent.tsx` | The "I agree" tick box under sign-in, and the ask if not ticked. |
| `OtherWays.tsx` | The Google / Facebook sign-in buttons — drawn only for a way in that is built (none today). |
| `PendingDeletion.tsx` | After signing in during the 15-day deletion wait: a sheet saying the date, with Keep my account and Continue. |
| `age.ts` | The minimum age to make an account, and the record that the new listener confirmed it. |
| `art.ts` | The words-only tiles that move along the sign-in page. |
| `display.ts` | The large serif title style on sign-in pages. |
| `errors.ts` | Turns a sign-in error into a short message for the user. |
| `methods.ts` | The other sign-in ways (Google, Facebook): listed here, shown only once they are built. |
| `navigate.ts` | Where you go after signing in or out. |
| `rules.ts` | Rules for the sign-in button and checking an email looks right. |

### `ui/lib/` — gluestack-ui building blocks (Text, Box, Pressable, sheets…) — generated, rarely edited
