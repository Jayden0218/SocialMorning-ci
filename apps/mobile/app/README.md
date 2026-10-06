# apps/mobile/app — screen map

One file = one screen (Expo Router). The file path is the route: `show/[feedUrl].tsx` opens at `/show/<feedUrl>`.
`(tabs)/` holds the 4 bottom tabs. `_layout.tsx` wraps the screens in its folder. Code they use is in [`../src/`](../src/README.md).

Keep this file up to date: when you add, move or delete a screen, change its line here. Each screen file also starts with the same sentence as a `//` comment — change both together.


### Top level

| File | Route | What the user sees |
|---|---|---|
| `_layout.tsx` | (wraps every screen) | No screen: starts the app, database and player; shows an error page if something breaks. |
| `account.tsx` | `/account` | Settings: account card, everyday settings tiles, info pages, Sign out. From Me. |
| `categories.tsx` | `/categories` | Every podcast category as a two-column grid of cards. |
| `chart.tsx` | `/chart` | Full "Talked about" ranking for 7 days: top three as cards, then rows. |
| `creator.tsx` | `/creator` | Creator centre: claim a show you publish with a code, then see its numbers. |
| `downloads.tsx` | `/downloads` | Downloaded episodes, space used, size limit and mobile-data switch. |
| `favourites.tsx` | `/favourites` | Starred episodes and starred comments, in two tabs, with search. |
| `friends-listening.tsx` | `/friends-listening` | Episodes people you follow played this week, with who and when. |
| `history.tsx` | `/history` | Listening history by day, with where you stopped; filter to finished only. |
| `inbox.tsx` | `/inbox` | No screen: old link, sends you to Updates. |
| `issues.tsx` | `/issues` | All curated issues, newest first; each opens its list of picks. |
| `likes.tsx` | `/likes` | Likes: episodes people you follow liked, newest first, with their notes; tap to open or play. |
| `moments.tsx` | `/moments` | Saved moments as a timeline; tap to play from there, edit note, delete. |
| `my-comments.tsx` | `/my-comments` | Every comment you wrote, with its episode and time; tap to open. |
| `notifications.tsx` | `/notifications` | Notifications: System messages, People (what listeners you follow did) and From hosts. |
| `play-latest.tsx` | `/play-latest` | Plays your next queued or newest episode and opens the player. |
| `player.tsx` | `/player` | The full player: artwork, the heat curve as the seek bar, transcript lines, controls, and a settings panel. |
| `queue.tsx` | `/queue` | Your queue: "Up next" card, then numbered episodes to reorder or remove. |
| `scan.tsx` | `/scan` | Camera window to scan a QR code; asks for camera permission first. |
| `search.tsx` | `/search` | Search page for shows and episodes, opened from links or other screens. |
| `stickers.tsx` | `/stickers` | Listening badges: earned ones in a grid, the rest with progress bars. |
| `subscriptions.tsx` | `/subscriptions` | Shows you follow: starred strip on top, then all shows with sort and search. |
| `tips.tsx` | `/tips` | Tips you gave to shows; today says tipping is not available yet. |
| `wallet.tsx` | `/wallet` | Your App Store / Google Play purchases, read only; link to manage them. |

### `(tabs)/` — the bottom tabs

| File | Route | What the user sees |
|---|---|---|
| `(tabs)/_layout.tsx` | (wraps the tabs) | The bottom bar: Discover, Updates, Chat, Me, with the mini player above it. |
| `(tabs)/chat.tsx` | `/chat` | Chat tab: your conversations, newest first, with unread counts; start a new chat. |
| `(tabs)/discover.tsx` | `/discover` | No screen: old link, sends you to Discover at `/`. |
| `(tabs)/following.tsx` | `/following` | No screen: old link, sends you to Notifications. |
| `(tabs)/index.tsx` | `/` | Discover, the first screen: search box, shortcuts, picks, For You, charts, categories. |
| `(tabs)/library.tsx` | `/library` | Updates tab: friends' voice posts, newest episodes from your shows. |
| `(tabs)/me.tsx` | `/me` | Me tab: your picture and name, saved moments, menu tiles, Sign out. |

### `academy/`

| File | Route | What the user sees |
|---|---|---|
| `academy/[slug].tsx` | `/academy/<slug>` | One help article for show owners, in numbered sections. |
| `academy/index.tsx` | `/academy` | Creator academy: list of help articles for show owners, as cards. |

### `auth/`

| File | Route | What the user sees |
|---|---|---|
| `auth/email.tsx` | `/auth/email` | Sign in with email: enter email, then 6-digit code, then your name if new. |
| `auth/sign-in.tsx` | `/auth/sign-in` | Sign-in start page: app name, moving word tiles, ways to sign in, consent box. |
| `auth/sign-up.tsx` | `/auth/sign-up` | No screen: old link, sends you to the email sign-in page. |

### `category/`

| File | Route | What the user sees |
|---|---|---|
| `category/[id].tsx` | `/category/<id>` | Top shows in one category, with a category strip, sort, filter, subscribe buttons. |

### `chat/`

| File | Route | What the user sees |
|---|---|---|
| `chat/[id].tsx` | `/chat/<id>` | One conversation: messages oldest to newest, new ones every 5 seconds, write and send. |
| `chat/new.tsx` | `/chat/new` | Pick who to chat with: the people who follow you back; can carry an episode to send. |

### `clip/`

| File | Route | What the user sees |
|---|---|---|
| `clip/[id].tsx` | `/clip/<id>` | A shared clip opened from a link: quote card, play, open player, share. |
| `clip/new.tsx` | `/clip/new` | Make a clip from the player: pick start and end, add caption, save. |

### `comments/`

| File | Route | What the user sees |
|---|---|---|
| `comments/[episodeId].tsx` | `/comments/<episodeId>` | An episode's comments: four sort orders either way round, likes, who is listening now, write box with the current time and a mic. |
| `comments/thread/[commentId].tsx` | `/comments/thread/<commentId>` | A comment's replies: the comment on top, All or Newest replies under it, a reply box with a mic. |

### `episode/`

| File | Route | What the user sees |
|---|---|---|
| `episode/[id].tsx` | `/episode/<id>` | One episode: artwork, title, play, subscribe, queue, show notes with clickable times. |

### `issue/`

| File | Route | What the user sees |
|---|---|---|
| `issue/[id].tsx` | `/issue/<id>` | One curated issue: editor's intro, then numbered picks with the editor's notes. |

### `picks/`

| File | Route | What the user sees |
|---|---|---|
| `picks/past.tsx` | `/picks/past` | Editor's picks from earlier days, grouped by date, with notes and Play. |

### `playlists/`

| File | Route | What the user sees |
|---|---|---|
| `playlists/[id].tsx` | `/playlists/<id>` | One playlist: its episodes in order, Play all; yours can be renamed, reordered, made public or deleted. |
| `playlists/index.tsx` | `/playlists` | Your playlists: each with its count and public or private; make a new one by name. |

### `profile/`

| File | Route | What the user sees |
|---|---|---|
| `profile/[id].tsx` | `/profile/<id>` | A listener's profile: name, counts, listening time, recent activity, Follow, Block, Report. |
| `profile/[id]/followers.tsx` | `/profile/<id>/followers` | List of people who follow this listener. |
| `profile/[id]/following.tsx` | `/profile/<id>/following` | List of people this listener follows. |
| `profile/edit.tsx` | `/profile/edit` | Edit profile: photo, name, short bio, optional age range and gender, and whether likes are public. |

### `report/`

| File | Route | What the user sees |
|---|---|---|
| `report/[month].tsx` | `/report/<month>` | Your month in listening: minutes, shows, episodes, comments, clips, top 3 shows and episodes; Share. |

### `settings/`

| File | Route | What the user sees |
|---|---|---|
| `settings/about.tsx` | `/settings/about` | About the app: version, service agreement, privacy policy, community rules. |
| `settings/account-more.tsx` | `/settings/account-more` | Delete your account: email a code, enter it, confirm delete. |
| `settings/account.tsx` | `/settings/account` | Account and security: how you sign in, masked email, link to More. |
| `settings/appearance.tsx` | `/settings/appearance` | Pick the app's accent colour. |
| `settings/blocked.tsx` | `/settings/blocked` | Listeners you blocked, each with an Unblock button. |
| `settings/collected.tsx` | `/settings/collected` | List of personal data the app keeps, with counts; tap for details. |
| `settings/downloads.tsx` | `/settings/downloads` | Download settings: space used, clear all, auto-download and mobile-data switches. |
| `settings/feedback.tsx` | `/settings/feedback` | Send feedback with type, text and up to 3 images; see what you sent. |
| `settings/help.tsx` | `/settings/help` | Help: send feedback, contact support, common questions filtered by topic. |
| `settings/how-for-you.tsx` | `/settings/how-for-you` | Questions and answers about how For You recommendations work. |
| `settings/minor.tsx` | `/settings/minor` | Minor mode switch: hides explicit episodes; a 4-digit passcode guards turning it off. |
| `settings/not-interested.tsx` | `/settings/not-interested` | Episodes and shows you marked "Not interested", each with a Restore button. |
| `settings/more.tsx` | `/settings/more` | More settings: import/export shows, queue and playback options, recommendations on/off. |
| `settings/opml.tsx` | `/settings/opml` | Export your shows as an OPML file, or paste OPML to import them. |
| `settings/privacy.tsx` | `/settings/privacy` | Privacy: keep your listening private switch, and a link to blocked listeners. |
| `settings/push.tsx` | `/settings/push` | Push notification settings: phone permission, new episodes, popular content, per show. |
| `settings/sharing.tsx` | `/settings/sharing` | Which outside companies get your data, what they get, and why. |

### `show/`

| File | Route | What the user sees |
|---|---|---|
| `show/[feedUrl].tsx` | `/show/<feedUrl>` | One show: artwork, title, Subscribe, episodes list and About tab with similar shows. |

### `transcript/`

| File | Route | What the user sees |
|---|---|---|
| `transcript/[episodeId].tsx` | `/transcript/<episodeId>` | The episode's transcript full screen: follows the audio, tap a line to jump, long-press to share or report it. |

### `show-info/`

| File | Route | What the user sees |
|---|---|---|
| `show-info/[feedUrl].tsx` | `/show-info/<feedUrl>` | Show info: who stands behind the show, the owner's country, and the feed address to copy. |

### `voice/`

| File | Route | What the user sees |
|---|---|---|
| `voice/new.tsx` | `/voice/new` | Record a voice post up to 60 seconds for followers; deleted after 24 hours. |
