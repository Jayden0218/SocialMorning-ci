// Says which files must already follow the Pulse token rules, wave by wave.
/**
 * M31 (T021): the Pulse rules are strict, but the app is redrawn wave by wave (spec 033), so the
 * rules start with the files a wave has redrawn and grow with each wave. `scripts/token-check.mjs`
 * reads this file; edit it here, never in the check.
 *
 * The rules in a wave file (the colour rule — no hex or rgba outside src/design — already holds
 * for every file):
 *   - no arbitrary text size: `text-[15px]`, `leading-[22px]`, `tracking-[2px]`;
 *   - no number spacing: `p-3`, `px-4`, `gap-2`, `mt-[13px]` — spacing is named
 *     (`p-gap`, `px-screen-x`, `gap-row`, `mt-block`; scale in `src/design/tokens.ts`).
 *
 * WAVE_FILES: path prefixes (a folder ends with `/`) or whole files, relative to apps/mobile.
 * PENDING: files inside a wave that have not been redrawn yet and still break a rule. It only
 * shrinks. A file listed here that no longer breaks a rule FAILS the check ("remove it") — so the
 * list cannot go stale and hide a regression. `node scripts/token-check.mjs --list-pending` prints
 * the violating wave files to paste here.
 */

/** Wave 1 (T021–T029): the kit, the player, Discover/Home and the shell. */
export const WAVE_FILES = [
  'src/ui/kit/',
  'src/ui/player/',
  'src/ui/discover/',
  'src/ui/search/',
  'app/search.tsx',
  'src/ui/shell/',
  'app/player.tsx',
  'app/(tabs)/index.tsx',
  'app/comments/',
  'src/ui/comments/',
  'app/(tabs)/me.tsx',
  'app/(tabs)/chat.tsx',
  'src/ui/chat/ChatRow.tsx',
  'src/ui/chat/EmptyBlock.tsx',
  'src/ui/me/Panel.tsx',
  'src/ui/me/mosaic.ts',
  'src/ui/me/useTabTitle.ts',
  'src/ui/me/TileText.tsx',
  // W3-D: the listen sheets moved onto the kit ActionSheet.
  'src/ui/clips/ShareChooser.tsx',
  'src/ui/social/LikeSheet.tsx',
  'src/ui/social/MoreSheet.tsx',
  // W3-A (T040): the Episode page, its sheets and parts, and Show info.
  'app/episode/',
  // D-A (T031): the Updates tab, My subscriptions and the parts only they use.
  'app/(tabs)/library.tsx',
  'app/subscriptions.tsx',
  // W6-C (T072): Manage order.
  'app/subscriptions/manage.tsx',
  'src/ui/library/',
  'src/ui/episode/',
  'app/show-info/',
  // W3-A2 (D-B): the Show screen, its Hot moments tab and the parts it uses.
  'app/show/[feedUrl].tsx',
  'src/ui/show/',
  'src/ui/show/InfoGroup.tsx',
  'src/ui/show/ShowSales.tsx',
  'src/ui/show/ShowExtras.tsx',
  'src/ui/show/AnnouncementCard.tsx',
  'src/ui/show/CuratorLine.tsx',
  'src/ui/show/EpisodeMeta.tsx',
  // W3-C (T041): the Me tab's list pages — History, Favourites, Likes, Saved moments, My comments, Playlists, Listening data.
  'app/history.tsx',
  'app/favourites.tsx',
  'app/likes.tsx',
  // F3: the Like page (design-pulse2 `like--screen`).
  'app/like/',
  'app/moments.tsx',
  'app/my-comments.tsx',
  'app/playlists/',
  'app/me/',
  'src/ui/me/lists.tsx',
  'src/ui/me/measures.ts',
  'src/ui/me/ListeningBars.tsx',
  // W3-B (T041): the queue page, Downloads, the clip pages, the transcript page and the voice status page.
  'app/queue.tsx',
  'src/ui/queue/',
  'app/downloads.tsx',
  'src/ui/downloads/',
  'app/clip/',
  'src/ui/clips/ClipComposer.tsx',
  'src/ui/clips/ClipRing.tsx',
  'src/ui/clips/measures.ts',
  'app/transcript/',
  'app/voice/',
  'src/ui/voice/',
  // W4-A (T050): profile lists, edit profile, stickers.
  'app/profile/edit.tsx',
  'app/profile/[id]/',
  'app/stickers.tsx',
  'app/stickers/',
  'src/ui/profile/',
  'src/ui/social/FollowList.tsx',
  'src/ui/social/FollowButton.tsx',
  'src/ui/social/LikeCard.tsx',
  'src/ui/social/ProfileStatRow.tsx',
  'src/ui/social/OftenListened.tsx',
  'src/ui/social/RecentCard.tsx',
  'src/ui/me/StickerCanvas.tsx',
  'src/ui/me/StickerLayer.tsx',
  // W4-B (T051): the Stage (a status), the text status page, the composer's items, and the shared status parts.
  'app/status/',
  'src/ui/status/',
  'src/ui/social/StatusViewer.tsx',
  'src/ui/social/StatusReplies.tsx',
  'src/ui/social/StatusComposerItems.tsx',
  // W4-D (T053): the Clips deck, the Follow / Block pills, the status rail and the muted-threads group.
  'src/ui/clips/ClipCard.tsx',
  'src/ui/clips/ClipList.tsx',
  'src/ui/social/FollowButton.tsx',
  'src/ui/social/BlockButton.tsx',
  'src/ui/social/VoicePosts.tsx',
  'src/ui/social/MutedThreads.tsx',
  // W4-C (T052): chat threads, New chat, Notifications (+ hosts, system), Friends listening.
  'app/chat/',
  'app/notifications.tsx',
  'app/notifications/',
  'app/friends-listening.tsx',
  'src/ui/chat/',
  'src/ui/notifications/',
  'src/ui/social/NoticeCards.tsx',
  'src/ui/social/FeedItem.tsx',
  'src/ui/social/SystemNoticeCard.tsx',
  // S-B (T060 part 2): settings pages N–Z (Network … Widgets) and the parts only they use.
  'app/settings/network.tsx',
  'app/settings/not-interested.tsx',
  'app/settings/opml.tsx',
  'app/settings/playback.tsx',
  'app/settings/privacy.tsx',
  'app/settings/push.tsx',
  'app/settings/queue-backups.tsx',
  'app/settings/sharing.tsx',
  'app/settings/updates.tsx',
  'app/settings/widgets.tsx',
  'src/ui/settings/panel.tsx',
  'src/ui/settings/measures.ts',
  'src/ui/settings/AudioRows.tsx',
  'src/ui/settings/NotifyShows.tsx',
  'src/ui/settings/OftenListenedSwitch.tsx',
  // S-A (T060 part 1): the Settings hub and settings pages A–M (About … More) and the parts only they use.
  'app/account.tsx',
  'app/settings/about.tsx',
  'app/settings/account-email.tsx',
  'app/settings/account-more.tsx',
  'app/settings/account.tsx',
  'app/settings/appearance.tsx',
  'app/settings/background.tsx',
  'app/settings/blocked.tsx',
  'app/settings/collected.tsx',
  'app/settings/devices.tsx',
  'app/settings/downloads.tsx',
  'app/settings/feedback.tsx',
  'app/settings/help.tsx',
  'app/settings/how-for-you.tsx',
  'app/settings/licences.tsx',
  'app/settings/minor.tsx',
  'app/settings/more.tsx',
  'src/ui/settings/hub-parts.tsx',
  'src/ui/settings/hub-measures.ts',
  'src/ui/me/SignOut.tsx',
  // S-C (T061/T062): sign-in, email sign-in, onboarding, the first-launch Terms and legal documents, the rate sheet.
  'src/ui/auth/',
  'app/auth/',
  'app/onboarding/',
  // W5-D (T064): the rest of the discover group.
  'app/categories.tsx',
  'app/chart.tsx',
  'app/chart-rules.tsx',
  'app/topic/',
  'app/academy/',
  'app/picks/',
  'app/issues.tsx',
  'app/issue/',
  'app/digest/',
  'app/report/',
  'app/plaza.tsx',
  'app/play-latest.tsx',
  // D-C (T050, T060): the profile page, the category page. Their parts live in src/ui/profile/ and src/ui/discover/ (already listed).
  'app/profile/[id].tsx',
  'app/category/[id].tsx',
  // W6-B (T071): appeal, maintenance, scan, the crashed-screen page and their parts.
  'app/appeal.tsx',
  'app/maintenance.tsx',
  'app/scan.tsx',
  'src/ui/appeal/',
  'src/ui/paused/',
  'src/ui/scan/',
  // W6-A (T070 part 1): the Creator centre, Wallet, Tips, Gift and Redeem and the parts only they use.
  'app/creator.tsx',
  'app/wallet.tsx',
  'app/tips.tsx',
  'app/gift/',
  'app/redeem.tsx',
  'src/ui/creator/',
  'src/ui/wallet/',
  'src/ui/tips/',
  'src/ui/gift/',
  'src/ui/me/PlusCard.tsx',
  // T097 (converge round 1, G15): the files outside every wave that held number classes.
  'app/lists/',
  'src/ui/content/Markdown.tsx',
  'src/ui/me/EpisodeExtras.tsx',
  'src/ui/me/FilterBar.tsx',
  'src/ui/me/parts.tsx',
  'src/ui/settings/rows.tsx',
  'src/ui/social/StatsBlock.tsx',
];

/**
 * Wave files not redrawn yet (`--list-pending` prints them). EMPTY since T097 (2026-10-28): the last
 * entry, `src/ui/shell/ListDetail.tsx` (`pb-24`), now uses the named scale. A clean file left here
 * still fails the check ("remove it"), so the list only shrinks.
 */
export const PENDING = [];

const LITERAL_STRING = /'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g;
const SPACE = '(?:p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y)';
const NUM_SPACING = new RegExp(`^(?:[a-z0-9-]+:)*-?${SPACE}-(?:\\d+(?:\\.\\d+)?|\\[-?[\\d.]+(?:px|rem|em)?\\])$`);
const ARB_TEXT = /^(?:[a-z0-9-]+:)*(?:text|leading|tracking)-\[[^\]]*\]$/;
/** Class strings in `lines` (a wave file's text) that break the Pulse rules: `"file:line message"` each. */
export function waveFindings(file, lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const bare = lines[i].trim();
    if (bare.startsWith('*') || bare.startsWith('//') || bare.startsWith('/*')) continue;
    for (const m of lines[i].matchAll(LITERAL_STRING)) {
      for (const tok of (m[1] ?? m[2] ?? m[3] ?? '').split(/\s+/)) {
        if (ARB_TEXT.test(tok)) out.push(`${file}:${i + 1} "${tok}" is an arbitrary text size — use the type scale (text-pulse-…)`);
        else if (NUM_SPACING.test(tok)) out.push(`${file}:${i + 1} "${tok}" is a number spacing — use the named scale (p-gap, px-screen-x, gap-row …)`);
      }
    }
  }
  return out;
}

/**
 * Wave-2 fix (verifier, 2026-10-28): the checks above read class names and hex only, so
 * `style={{ fontSize: 17 }}` passed. In these files a number written for `fontSize`, `lineHeight` or
 * `letterSpacing` inside a style is refused: use a type step, or a named size from `src/design/type-px.ts`
 * (`drawnType.count`) or a feature's `measures.ts`. These are the files waves 1 and 2 finished; ADD A WAVE'S
 * FILES HERE WHEN ITS LANE FINISHES (a wave still in flight is not listed, so it is not broken meanwhile).
 * Spacing props (margin, padding, gap, top, left, width, height …) are not checked: 177 literals in these files
 * are the drawing's own dimensions, and a check that loud would be switched off.
 */
export const STRICT_STYLE_FILES = [
  'src/ui/kit/',
  'src/ui/player/',
  'src/ui/discover/',
  'src/ui/search/',
  'app/search.tsx',
  'src/ui/shell/LaunchScreen.tsx',
  'src/ui/shell/TabBar.tsx',
  'app/player.tsx',
  'app/(tabs)/index.tsx',
  'app/(tabs)/me.tsx',
  'app/(tabs)/chat.tsx',
  'app/comments/',
  'src/ui/comments/',
  'src/ui/chat/',
  'src/ui/me/',
  // W3-C (T041)
  'app/history.tsx',
  'app/favourites.tsx',
  'app/likes.tsx',
  'app/moments.tsx',
  'app/my-comments.tsx',
  'app/playlists/',
  'app/me/',
  // W3-A (T040): the Episode page and Show info.
  'app/episode/',
  // D-A (T031): the Updates tab, My subscriptions and the parts only they use.
  'app/(tabs)/library.tsx',
  'app/subscriptions.tsx',
  'app/subscriptions/manage.tsx',
  'src/ui/library/',
  'src/ui/episode/',
  'app/show-info/',
  'app/show/[feedUrl].tsx',
  'src/ui/show/',
  'src/ui/show/InfoGroup.tsx',
  'src/ui/show/ShowSales.tsx',
  'src/ui/show/ShowExtras.tsx',
  'src/ui/show/AnnouncementCard.tsx',
  'src/ui/show/CuratorLine.tsx',
  'src/ui/show/EpisodeMeta.tsx',
  // W3-B (T041): the queue page, Downloads, the clip pages, the transcript page and the voice status page.
  'app/queue.tsx',
  'src/ui/queue/',
  'app/downloads.tsx',
  'src/ui/downloads/',
  'app/clip/',
  'src/ui/clips/ClipComposer.tsx',
  'src/ui/clips/ClipRing.tsx',
  'src/ui/clips/measures.ts',
  'app/transcript/',
  'app/voice/',
  'src/ui/voice/',
  // W4-A (T050): profile lists, edit profile, stickers.
  'app/profile/edit.tsx',
  'app/profile/[id]/',
  'app/stickers.tsx',
  'app/stickers/',
  'src/ui/profile/',
  'src/ui/social/FollowList.tsx',
  'src/ui/social/FollowButton.tsx',
  'src/ui/social/LikeCard.tsx',
  'src/ui/social/ProfileStatRow.tsx',
  'src/ui/social/OftenListened.tsx',
  'src/ui/social/RecentCard.tsx',
  'src/ui/me/StickerCanvas.tsx',
  'src/ui/me/StickerLayer.tsx',
  // W4-B (T051): the Stage (a status), the text status page, the composer's items, and the shared status parts.
  'app/status/',
  'src/ui/status/',
  'src/ui/social/StatusViewer.tsx',
  'src/ui/social/StatusReplies.tsx',
  'src/ui/social/StatusComposerItems.tsx',
  // W4-D (T053): the Clips deck, the Follow / Block pills, the status rail and the muted-threads group.
  'src/ui/clips/ClipCard.tsx',
  'src/ui/clips/ClipList.tsx',
  'src/ui/social/FollowButton.tsx',
  'src/ui/social/BlockButton.tsx',
  'src/ui/social/VoicePosts.tsx',
  'src/ui/social/MutedThreads.tsx',
  // W4-C (T052): chat threads, New chat, Notifications (+ hosts, system), Friends listening.
  'app/chat/',
  'app/notifications.tsx',
  'app/notifications/',
  'app/friends-listening.tsx',
  'src/ui/notifications/',
  'src/ui/social/NoticeCards.tsx',
  'src/ui/social/FeedItem.tsx',
  'src/ui/social/SystemNoticeCard.tsx',
  // S-B (T060 part 2): settings pages N–Z (Network … Widgets) and the parts only they use.
  'app/settings/network.tsx',
  'app/settings/not-interested.tsx',
  'app/settings/opml.tsx',
  'app/settings/playback.tsx',
  'app/settings/privacy.tsx',
  'app/settings/push.tsx',
  'app/settings/queue-backups.tsx',
  'app/settings/sharing.tsx',
  'app/settings/updates.tsx',
  'app/settings/widgets.tsx',
  'src/ui/settings/panel.tsx',
  'src/ui/settings/measures.ts',
  'src/ui/settings/AudioRows.tsx',
  'src/ui/settings/NotifyShows.tsx',
  'src/ui/settings/OftenListenedSwitch.tsx',
  // S-A (T060 part 1): the Settings hub and settings pages A–M (About … More) and the parts only they use.
  'app/account.tsx',
  'app/settings/about.tsx',
  'app/settings/account-email.tsx',
  'app/settings/account-more.tsx',
  'app/settings/account.tsx',
  'app/settings/appearance.tsx',
  'app/settings/background.tsx',
  'app/settings/blocked.tsx',
  'app/settings/collected.tsx',
  'app/settings/devices.tsx',
  'app/settings/downloads.tsx',
  'app/settings/feedback.tsx',
  'app/settings/help.tsx',
  'app/settings/how-for-you.tsx',
  'app/settings/licences.tsx',
  'app/settings/minor.tsx',
  'app/settings/more.tsx',
  'src/ui/settings/hub-parts.tsx',
  'src/ui/settings/hub-measures.ts',
  'src/ui/me/SignOut.tsx',
  // S-C (T061/T062): sign-in, email sign-in, onboarding, the first-launch Terms and legal documents, the rate sheet.
  'src/ui/auth/',
  'app/auth/',
  'app/onboarding/',
  'src/ui/shell/Terms.tsx',
  'src/ui/shell/LegalDoc.tsx',
  'src/ui/shell/RateSheet.tsx',
  // W5-D (T064): the rest of the discover group.
  'app/categories.tsx',
  'app/chart.tsx',
  'app/chart-rules.tsx',
  'app/topic/',
  'app/academy/',
  'app/picks/',
  'app/issues.tsx',
  'app/issue/',
  'app/digest/',
  'app/report/',
  'app/plaza.tsx',
  'app/play-latest.tsx',
  // D-C (T050, T060): the profile page, the category page. Their parts live in src/ui/profile/ and src/ui/discover/ (already listed).
  'app/profile/[id].tsx',
  'app/category/[id].tsx',
  // W6-B (T071): appeal, maintenance, scan, the crashed-screen page and their parts.
  'app/appeal.tsx',
  'app/maintenance.tsx',
  'app/scan.tsx',
  'src/ui/appeal/',
  'src/ui/paused/',
  'src/ui/scan/',
  // W6-A (T070 part 1): the Creator centre, Wallet, Tips, Gift and Redeem and the parts only they use.
  'app/creator.tsx',
  'app/wallet.tsx',
  'app/tips.tsx',
  'app/gift/',
  'app/redeem.tsx',
  'src/ui/creator/',
  'src/ui/wallet/',
  'src/ui/tips/',
  'src/ui/gift/',
  'src/ui/me/PlusCard.tsx',
  // T097 (converge round 1, G15): the files outside every wave that held number classes.
  'app/lists/',
  'src/ui/content/Markdown.tsx',
  'src/ui/me/EpisodeExtras.tsx',
  'src/ui/me/FilterBar.tsx',
  'src/ui/me/parts.tsx',
  'src/ui/settings/rows.tsx',
  'src/ui/social/StatsBlock.tsx',
];
const STYLE_NUMBER = /\b(fontSize|lineHeight|letterSpacing)\s*:\s*-?\d/;
const STYLE_HOME = /(^|\/)(measures\.ts|type-px\.ts)$/;
/** Numbers written for type in a strict file's styles: `"file:line message"` each. */
export function styleFindings(file, lines) {
  if (STYLE_HOME.test(file.split('\\').join('/'))) return [];
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const bare = lines[i].trim();
    if (bare.startsWith('*') || bare.startsWith('//') || bare.startsWith('/*')) continue;
    const m = STYLE_NUMBER.exec(lines[i]);
    if (m) out.push(`${file}:${i + 1} ${m[1]} is a number written in a style — use a type step, drawnType (src/design/type-px.ts) or the feature's measures.ts`);
  }
  return out;
}
