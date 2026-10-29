// Me tab: your picture, saved moments, menu tiles, a panel of four rows; your name sits low in the title bar.
/**
 * Me (个人, M10, owner 2026-09-27): the fourth tab — a Stickers chip, your picture, the saved-moments
 * tile (the reference's PLUS feature, free here), then the menu.
 *
 * M31 T033 (design-pulse2 `me--screen`, `me--signed-out`, `me--plus`, `me--wallet-coming-soon`; layout
 * pattern Mosaic): the page is dark and follows the drawing. A stage on top — the 96 picture with a 2
 * hot ring, the Stickers chip (36) at the top right — then the mosaic under the edge label "Me": two
 * columns, rows 84, 10 apart. Where PLUS is on sale a 2 x 1 PLUS tile leads (violet only as fill and
 * border); Saved moments is the 1 x 2 hot tile with the count (Unbounded 800 40) and beside it
 * Notifications (with the unread badge) and Downloads; then Listening history, Favourites, My
 * comments, Queue, and signed in Creator centre, Likes, Playlists; last, "Your <month>" (2 wide when
 * Playlists is not drawn). Under the mosaic: a Panel of rows (56) — Wallet and Tips I gave signed in,
 * Feedback, Account and settings. The title bar is low (rule 1): your name (Unbounded 30, opens your
 * profile), "My profile ›" and a gear for Account and settings; signed out, "Sign in ›" opens
 * sign-in with "Keep your listening across phones" under it. Same destinations as before; the name,
 * "My profile ›" and "Sign in ›" moved into the title bar (m31/moves.json).
 *
 * Signed out, the menu still opens what works without an account (downloads, history, favourites,
 * moments, queue). Sign out is in Settings (M12 FR-090). M21 US8 (FR-073): the picture is your profile
 * photo when you set one (src/me/my-avatar.ts); a PLUS banner, opening Wallet, shows while PLUS is on
 * sale (`storeReady`). M17 (FR-015): while purchases are not switched on, Wallet says so first.
 *
 * Not as drawn (gate log): the Notifications tile's badge is the unread count (the drawing's 3 is
 * sample data); the picture is the app's Avatar (photo, else the first letter), not cover art.
 */
import { Link, router, useFocusEffect, useScrollToTop } from 'expo-router';
import { useCallback, useMemo, useState, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { LinearGradient } from '@/design/tailwind';
import { bars, colour, gutter, spacing } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { createFeed } from '@/graph/feed';
import { listMoments } from '@/me/moments';
import { useSocial } from '@/social/context';
import { MenuRow, MenuTile } from '@/ui/me/parts';
import { PanelGroup } from '@/ui/me/Panel';
import { ME_MOSAIC, TALL_TILE, HALF } from '@/ui/me/mosaic';
import { tabTitleReserve, useTabTitleBottom } from '@/ui/me/useTabTitle';
import { useComingSoon } from '@/ui/kit/ComingSoon';
import { readStoreReady } from '@/social/store-ready';
import { useStores } from '@/ui/shell/providers';
import { lastMonth, monthName } from '@/social/m19-api';
import { Avatar } from '@/ui/kit/Avatar';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { Fade } from '@/ui/kit/Fade';
import { TitleBar } from '@/ui/kit/TitleBar';
import { Type } from '@/ui/kit/Type';
import { TileText } from '@/ui/me/TileText';
import { useMyAvatar } from '@/me/my-avatar';
import { useProfileApi } from '@/social/profile-api';
import { drawnType } from '@/design/type-px';

/** The picture: 96 pt, with the hot ring drawn 3 outside it (`0 0 0 3px void, 0 0 0 5px hot`). */
const AVATAR = 96;
const RING = { gap: 3, width: 2 };
const RING_SIZE = AVATAR + 2 * (RING.gap + RING.width);
/** The stage: 6 above the picture, 18 under it (drawing `padding:6px 0 18px`). */
const STAGE = { paddingTop: 6, paddingBottom: 18 };
/** The Stickers chip is 36 tall, 6 below the stage's top and 16 from the right edge. */
const CHIP = { height: bars.chip, paddingHorizontal: bars.chipPad, gap: 6 };
/** The mosaic section: 2 above, 18 below, at least 120 tall so the edge label fits (drawing `sec`). */
const SECTION = { paddingTop: 2, paddingBottom: 18, minHeight: 120 };
/** The count on Saved moments: Unbounded 800 40 (the `figure` step is 34; the drawing's number is bigger). */
const COUNT = drawnType.count;
/** The PLUS tile: a 120-degree wash from Premium's brown-violet to raise2, a violet 1 px border. */
const PLUS_WASH = [colour.premiumTint, colour.raise2] as const;

export default function MeScreen(): React.ReactElement {
  const top = useRef(null); useScrollToTop(top); // M21 T082: pressing this tab again scrolls to the top.
  const { width } = useWindowDimensions();
  const stores = useStores();
  // M17 (FR-015, T113): while purchases are not switched on, Wallet says so first; the page stays one tap on.
  const [comingSoon, comingSoonDialog] = useComingSoon();
  const openWallet = readStoreReady(stores.settings) ? undefined : () => comingSoon({
    feature: 'Wallet',
    mark: 'wallet-outline',
    line: 'SocialNet PLUS and paid shows will be bought here, through the App Store or Google Play. Listening stays free.',
    second: { label: 'Open Wallet', onPress: () => router.push('/wallet') },
  });
  const { api, listener } = useSocial();
  const profileApi = useProfileApi();
  const avatarUrl = useMyAvatar(stores.settings, listener !== undefined, profileApi.me);
  const plusOnSale = readStoreReady(stores.settings);
  const feed = useMemo(() => createFeed({ api, cache: stores.feedCache, settings: stores.settings, now: () => Date.now() }), [api, stores]);
  const [counts, setCounts] = useState({ unread: 0, moments: 0 });
  useFocusEffect(useCallback(() => {
    setCounts({ unread: listener ? feed.unread(feed.cached()?.items ?? []) : 0, moments: listMoments(stores.settings).length });
  }, [feed, listener, stores]));
  const titleBottom = useTabTitleBottom();
  const openProfile = (): void => { if (listener) router.push({ pathname: '/profile/[id]', params: { id: listener.listenerId } }); };

  return (
    <SafeAreaView className="flex-1 bg-void">
      <ScrollView ref={top} contentContainerStyle={{ paddingTop: spacing.gap, paddingBottom: tabTitleReserve(titleBottom) }}>
        {/* The stage: the picture, with the Stickers chip pinned top right. */}
        <Box className="items-center" style={STAGE}>
          <Box style={{ width: AVATAR, height: AVATAR }}>
            {listener ? <Avatar url={avatarUrl} name={listener.displayName} size={AVATAR} /> : (
              <Box className="rounded-pill bg-raise2 items-center justify-center" style={{ width: AVATAR, height: AVATAR }} accessible={false}>
                <Icon name="person-outline" size={44} color={colour.idle} />
              </Box>
            )}
            {listener ? (
              <Box pointerEvents="none" testID="avatar-ring" className="absolute border-hot" style={{ left: -(RING.gap + RING.width), top: -(RING.gap + RING.width), width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2, borderWidth: RING.width }} />
            ) : null}
          </Box>
          <Box className="absolute" style={{ right: ME_MOSAIC.right, top: STAGE.paddingTop }}>
            <Link href="/stickers" asChild accessibilityLabel="Stickers">
              <Pressable accessibilityRole="link" accessibilityLabel="Stickers" hitSlop={spacing.hair} className="flex-row items-center bg-raise border border-line rounded-pill" style={CHIP}>
                <Icon name="medal-outline" size={16} color={colour.text} />
                <Type step="caption" className="text-text font-semibold">Stickers</Type>
              </Pressable>
            </Link>
          </Box>
        </Box>

        {/* The mosaic, under the edge label "Me". */}
        <Box style={SECTION}>
          <EdgeLabel label="Me" top={4} />
          <Box style={{ marginLeft: ME_MOSAIC.lane, marginRight: gutter(width) - spacing.hair, gap: ME_MOSAIC.gap }}>
            {/* M21 US8 (FR-073): PLUS is on sale → a banner to Wallet, where it is bought through the store. */}
            {listener && plusOnSale ? (
              <Link href="/wallet" asChild>
                <Pressable accessibilityRole="link" accessibilityLabel="SocialNet PLUS: see what it adds. Listening stays free" className="flex-row items-center border" style={{ minHeight: ME_MOSAIC.row, borderRadius: ME_MOSAIC.radius, padding: ME_MOSAIC.pad, gap: ME_MOSAIC.rowGap, borderColor: colour.plusLine, overflow: 'hidden' }}>
                  <LinearGradient colors={PLUS_WASH} start={{ x: 0, y: 0.25 }} end={{ x: 1, y: 0.75 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" />
                  <Icon name="crown" size={28} color={colour.plusMark} />
                  <Box className="flex-1">
                    <TileText step="lede" className="text-text font-bold" style={drawnType.unbounded[16]} numberOfLines={1}>SocialNet PLUS</TileText>
                    <Type step="caption" className="text-text2" style={drawnType.tileNote} numberOfLines={2}>Extras for supporters. Listening stays free.</Type>
                  </Box>
                  <Icon name="chevron-forward" size={20} color={colour.text} />
                </Pressable>
              </Link>
            ) : null}

            <Box className="flex-row" style={{ gap: ME_MOSAIC.gap }}>
              <Link href="/moments" asChild>
                <Pressable accessibilityRole="link" accessibilityLabel={`Saved moments, ${counts.moments}. Save a moment while listening and add a note`} className="bg-hot" style={{ minHeight: TALL_TILE, borderRadius: ME_MOSAIC.radius, ...HALF }}>
                  {/* The padding sits on an inner box: a `flex: 1` item's share starts from its own padding (28), so a padded tile
                      beside an unpadded column came out 182 wide and the column 154 (drawn 168 / 168; found by the wave-2 capture). */}
                  <Box className="flex-1" style={{ padding: ME_MOSAIC.pad }}>
                    <TileText step="lede" className="text-void font-bold" style={drawnType.unbounded[17]} numberOfLines={2}>Saved moments</TileText>
                    <Type step="caption" className="text-void" style={{ ...drawnType.tileNote, marginTop: spacing.hair + 2 }} numberOfLines={3}>Save a moment while listening, and add a note</Type>
                    <Type step="figure" className="text-void mt-auto" style={COUNT} testID="moments-count">{String(counts.moments)}</Type>
                  </Box>
                </Pressable>
              </Link>
              <Box style={{ gap: ME_MOSAIC.gap, ...HALF }}>
                <Link href="/notifications" asChild accessibilityLabel="Notifications"><MenuTile size="mosaic" icon="notifications-outline" label="Notifications" {...(counts.unread > 0 ? { badge: counts.unread } : {})} /></Link>
                {/* Owner, 2026-10-04: no Inbox tile — it showed what the Updates tab shows; the tiles move up one. */}
                <Link href="/downloads" asChild accessibilityLabel="Downloads"><MenuTile size="mosaic" icon="download-outline" label="Downloads" /></Link>
              </Box>
            </Box>
            <Box className="flex-row" style={{ gap: ME_MOSAIC.gap }}>
              <Link href="/history" asChild accessibilityLabel="Listening history"><MenuTile size="mosaic" icon="time-outline" label="Listening history" /></Link>
              <Link href="/favourites" asChild accessibilityLabel="Favourites"><MenuTile size="mosaic" icon="star-outline" label="Favourites" /></Link>
            </Box>
            <Box className="flex-row" style={{ gap: ME_MOSAIC.gap }}>
              <Link href="/my-comments" asChild accessibilityLabel="My comments"><MenuTile size="mosaic" icon="chatbubble-outline" label="My comments" /></Link>
              <Link href="/queue" asChild accessibilityLabel="Queue"><MenuTile size="mosaic" icon="list-outline" label="Queue" /></Link>
            </Box>
            {listener ? (
              <Box className="flex-row" style={{ gap: ME_MOSAIC.gap }}>
                <Link href="/creator" asChild accessibilityLabel="Creator centre"><MenuTile size="mosaic" icon="mic-outline" label="Creator centre" /></Link>
                {/* M19 T031: likes (with notes) from people you follow. */}
                <Link href="/likes" asChild accessibilityLabel="Likes"><MenuTile size="mosaic" icon="heart-outline" label="Likes" /></Link>
              </Box>
            ) : null}
            <Box className="flex-row" style={{ gap: ME_MOSAIC.gap }}>
              {/* M19 T041: your playlists (public ones also show on your profile). */}
              {listener ? <Link href="/playlists" asChild accessibilityLabel="Playlists"><MenuTile size="mosaic" icon="list" label="Playlists" /></Link> : null}
              {/* M19 T081 (US8): last month's listening report; 2 wide when it is the row's only tile. */}
              <Link href={{ pathname: '/report/[month]', params: { month: lastMonth(new Date()) } }} asChild>
                <Pressable accessibilityRole="link" accessibilityLabel={`Your ${monthName(lastMonth(new Date()))}: your month in listening`} className="bg-raise2" style={{ minHeight: ME_MOSAIC.row, borderRadius: ME_MOSAIC.radius, padding: ME_MOSAIC.pad, gap: spacing.hair + 2, ...HALF }}>
                  <TileText step="lede" className="text-text font-bold" style={drawnType.unbounded[15]} numberOfLines={2}>{`Your ${monthName(lastMonth(new Date()))}`}</TileText>
                  <Type step="caption" className="text-text2" style={drawnType.tileNote} numberOfLines={2}>Your month in listening</Type>
                </Pressable>
              </Link>
            </Box>
          </Box>
        </Box>

        {/* The panel, below the fold: one rounded group of rows. */}
        <Box style={{ marginLeft: ME_MOSAIC.lane, marginRight: gutter(width) - spacing.hair }}>
          <PanelGroup>
            {/* M12 FR-105, FR-106: read-only; the stores hold the money. M17 T113: Coming soon until the store is on. */}
            {listener ? <MenuRow panel href="/wallet" icon="wallet-outline" label="Wallet" {...(openWallet ? { onPress: openWallet } : {})} /> : null}
            {listener ? <MenuRow panel href="/tips" icon="heart-outline" label="Tips I gave" /> : null}
            {/* M12 FR-091: feedback is one tap from Me. */}
            <MenuRow panel href="/settings/feedback" icon="chatbox-ellipses-outline" label="Feedback" />
            <MenuRow panel href="/account" icon="settings-outline" label="Account and settings" />
            {/* M12 FR-090: Sign out lives once, in Settings (it was on Me as well). */}
          </PanelGroup>
        </Box>
      </ScrollView>
      <Fade bottom={0} height={300} />
      {listener ? (
        <TitleBar
          title={listener.displayName}
          titleLabel={`${listener.displayName}, open your profile`}
          onTitle={openProfile}
          subtitle="My profile ›"
          onSubtitle={openProfile}
          actions={[{ icon: 'settings-outline', label: 'Account and settings', onPress: () => router.push('/account') }]}
          bottom={titleBottom}
        />
      ) : (
        <TitleBar
          title="Sign in ›"
          titleLabel="Sign in"
          onTitle={() => router.push('/auth/sign-in')}
          subtitle="Keep your listening across phones"
          actions={[{ icon: 'settings-outline', label: 'Account and settings', onPress: () => router.push('/account') }]}
          bottom={titleBottom}
        />
      )}
      {comingSoonDialog}
    </SafeAreaView>
  );
}
