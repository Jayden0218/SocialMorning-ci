# apps/studio/src — file map

Every code file in the Studio website, one plain line each. Each file also starts with the same
sentence as a `//` comment — change both together. A check in the cloud tests fails if a file is
missing here or a line does not match its file.

- Pages are in `pages/` (one file per page); the owner-only Admin pages are in `pages/admin/`.
- Parts many pages share (sidebar, tables, cards, dialogs) are in `shell/`.

### Top level — start-up, routes, talking to the server, formats

| File | What it does |
|---|---|
| `api.ts` | Sends every Studio request to the server and handles sign-in and errors. |
| `App.tsx` | The Studio's route table: which page opens at each web address. |
| `categories.ts` | Lists the allowed podcast categories and show languages. |
| `format.ts` | Formats numbers, percents, times and dates for display. |
| `main.tsx` | Starts the Studio website: applies colours and mounts the app. |
| `session.tsx` | Keeps track of who is signed in, their shows, and admin status. |
| `tokens.ts` | The Studio's only colour file: light and dark palettes applied to the page. |
| `upload.ts` | Uploads audio and image files from the browser straight to storage. |
| `useLoad.ts` | A hook that loads one block's data and tracks loading, error and retry. |

### `pages/` — one file per Studio page

| File | What it does |
|---|---|
| `Announcements.tsx` | Page where a creator writes announcements and sends them to listeners. |
| `Comments.tsx` | Page listing all comments on a show, with reply, hide and mute. |
| `Data.tsx` | Page with a show's numbers, trends and an episode table to download. |
| `Episode.tsx` | One episode's page: its numbers, reaction curve, comments and take-down button. |
| `Episodes.tsx` | Page listing every episode of the show with its numbers. |
| `Home.tsx` | The Studio home page: totals, a trend chart and the latest activity. |
| `Invite.tsx` | Page an invite link opens, where a person accepts becoming a show host. |
| `Media.tsx` | Page listing the show's stored audio and image files, with delete. |
| `NewEpisode.tsx` | Page to upload episode audio, then publish, schedule or save as draft. |
| `NoShow.tsx` | Page for a signed-in person with no show: create one or claim a feed. |
| `Pending.tsx` | Lists draft and scheduled episodes that are not in the feed yet. |
| `Polls.tsx` | Page where a creator makes polls for listeners and sees the results. |
| `Settings.tsx` | Show settings page: how the show looks, contacts, hosts, and giving it up. |
| `SignIn.tsx` | The Studio sign-in page, by password or by emailed code. |
| `Subscribers.tsx` | Page listing subscribers and trends, and muting listeners from commenting. |
| `Tips.tsx` | Page showing tips received, with a switch to allow or stop tips. |
| `types.ts` | Shared data shapes for episode rows and pages of episodes. |

### `pages/settings/` — parts of the show Settings page

| File | What it does |
|---|---|
| `Contacts.tsx` | Settings section for the show's contact links and the 100-hour message. |
| `Hosts.tsx` | Settings section to invite hosts by a one-use link and remove them. |

### `pages/admin/` — the owner-only Admin pages

| File | What it does |
|---|---|
| `Accounts.tsx` | Admin page to create accounts, act as them, and name show curators. |
| `Activity.tsx` | Admin page showing every admin change, newest first, read only. |
| `AdminLayout.tsx` | The Admin section's frame: its side menu, banner and sign-in-again rule. |
| `common.tsx` | Shared Admin helpers: error text, an episode search box, and reorder buttons. |
| `Curated.tsx` | Admin page to create, edit, order and retire curated episode collections. |
| `Dashboard.tsx` | Admin dashboard with app-wide numbers and charts over a chosen date range. |
| `Discover.tsx` | Admin page controlling the app's Discover sections, pins, hides and featured shows. |
| `Launch.tsx` | Admin page to manage promotion images shown on the app's launch screen. |
| `PhonePreview.tsx` | Shows a day's picks the way the phone app will draw them. |
| `Picks.tsx` | Admin page with a calendar to choose and order each day's episode picks. |
| `Reports.tsx` | Admin page for the reports queue: dismiss, remove, hide or suspend. |
| `Users.tsx` | Admin page to find an account, rename it, and suspend or restore it. |

### `shell/` — parts many pages share

| File | What it does |
|---|---|
| `ActingBanner.tsx` | Banner shown while the owner acts as another account, with a way back. |
| `ConfirmDialog.tsx` | An in-page "are you sure?" dialog; Escape or clicking outside cancels. |
| `DropZone.tsx` | A box to drop or choose an image file, showing the current one. |
| `Icons.tsx` | The Studio's own simple line icons. |
| `Layout.tsx` | The page frame for a show: side menu, top bar and content area. |
| `Page.tsx` | A page header with title, short purpose, an action and sub-tabs. |
| `Sidebar.tsx` | The Studio side menu listing each section, marking unbuilt ones "Soon". |
| `Sparkline.tsx` | Draws a tiny 14-day line under a number. |
| `StatCard.tsx` | A card showing one number with its label, note and small line. |
| `States.tsx` | Loading, empty and failed-with-retry blocks, so nothing is ever blank. |
| `Table.tsx` | A data table with keyboard-friendly sortable headers and page buttons. |
| `Unsaved.tsx` | Save bar and warning before leaving a page with unsaved changes. |

### `charts/` — the charts

| File | What it does |
|---|---|
| `HeatCurve.tsx` | Draws an episode's reaction curve and per-minute bars. |
| `Small.tsx` | Small charts: daily subscribes and unsubscribes, and listening by hour. |
| `TrendChart.tsx` | Draws a number over time as a line chart, plus a screen-reader table. |
