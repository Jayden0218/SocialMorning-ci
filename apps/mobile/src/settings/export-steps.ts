/**
 * M12 FR-095: how to get an OPML file out of other podcast apps. Each entry was read on
 * 2026-09-29 (Principle III); `source` is where. Two are the apps' own step pages (Pocket
 * Casts, Castro). Castbox's help article names the menu item but its page has since moved;
 * Overcast's export is on its website only (secondary sources — no official page answered).
 * Apple Podcasts and Spotify have no export at all, and saying so is the useful answer.
 */
export type ExportSteps = { app: string; steps: readonly string[]; note?: string; source: string };

export const EXPORT_STEPS: readonly ExportSteps[] = [
  {
    app: 'Pocket Casts',
    steps: ['Tap Profile', 'Tap Settings', 'Tap Import & Export OPML', 'Tap Send email or Save file'],
    source: 'support.pocketcasts.com/knowledge-base/exporting-an-opml',
  },
  {
    app: 'Castro',
    steps: ['Tap the Settings cog at the top of any main tab', 'Tap User Data', 'Tap Export Subscriptions', 'Pick where to send the OPML file'],
    source: 'castro.fm/support/export-subscriptions',
  },
  {
    app: 'Castbox',
    steps: ['Open the Personal tab', 'Tap Settings', 'Tap OPML Export'],
    note: 'From Castbox’s Android help; the iPhone app may differ.',
    source: 'helpcenter.castbox.fm (Android settings article)',
  },
  {
    app: 'Overcast',
    steps: ['On a computer, sign in at overcast.fm', 'Open Account', 'Choose the OPML export'],
    note: 'Overcast exports from its website, not from the app.',
    source: 'secondary: thesweetsetup.com; overcast.fm has no help page for it',
  },
  {
    app: 'Apple Podcasts',
    steps: [],
    note: 'Apple Podcasts cannot export OPML. Search for each show here and tap Subscribe.',
    source: 'discussions.apple.com (no Apple support page offers an export)',
  },
  {
    app: 'Spotify',
    steps: [],
    note: 'Spotify cannot export podcasts. Search for each show here and tap Subscribe.',
    source: 'community.spotify.com',
  },
];
