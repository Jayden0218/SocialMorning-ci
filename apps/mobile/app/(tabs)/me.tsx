// Me tab: your picture and name, four tiles, Continue listening, then every other place as a pill.
/**
 * Spec 039 US2 (`specs/039-layout-system/design/B-Me.dc.html`, D2): the page is a `Page` (tab, one 20 gutter, a foot that clears the tab
 * bar and the now bar) with no sideways label. Top row: the picture (72, the hot ring), your name in the title step, the Settings button
 * (44). Under it "N following · N followers", then "View profile" and Stickers. Four equal tiles in a `TileGrid`: Saved moments (hot,
 * with its count), Downloads (count), History, Favourites. "Continue listening" shows the player's episode and is absent when there is
 * none. Every other place the page opens is a pill that wraps. The destinations are the 038 set (src/ui/me/__tests__/destinations.test.tsx).
 * Signed out: the title reads "Sign in" with "Keep your listening across phones" under it (as the old title bar did), and the "Sign in" button takes the place of View profile. Pressing the tab again scrolls to the top (`Page`'s `scrollToTopOnTabPress`). Where PLUS is on sale (`storeReady`) a PLUS pill opens
 * Wallet; while purchases are off, Wallet says so first (M17 FR-015).
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useContext, useMemo, useState } from 'react';
import { initialWindowMetrics, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { colour, spacing } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { createFeed } from '@/graph/feed';
import { listMoments } from '@/me/moments';
import { useSocial } from '@/social/context';
import { useComingSoon } from '@/ui/kit/ComingSoon';
import { readStoreReady } from '@/social/store-ready';
import { useStores } from '@/ui/shell/providers';
import { lastMonth, monthName } from '@/social/m19-api';
import { Avatar } from '@/ui/kit/Avatar';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { Page, TileGrid } from '@/ui/kit/layout';
import { ContinueCard } from '@/ui/me/ContinueCard';
import { MeTile } from '@/ui/me/MeTile';
import { MePill } from '@/ui/me/MePill';
import { useDownloadCount, useFollowCounts } from '@/ui/me/useMeStats';
import { useMyAvatar } from '@/me/my-avatar';
import { useProfileApi } from '@/social/profile-api';
import { usePlayerSelector, selectIdle } from '@/playback/store';
import { nowMs as clockMs } from '@/ui/kit/clock';

/** The picture: 72 pt, with the hot ring drawn 3 outside it (`0 0 0 3px void, 0 0 0 5px hot`). */
const AVATAR = 72;
const RING = { gap: 3, width: 2 };
const RING_SIZE = AVATAR + 2 * (RING.gap + RING.width);
const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };
const WRAP = { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.gap } as const;

export default function MeScreen(): React.ReactElement {
  const stores = useStores();
  // The same source as src/ui/lib/safe-area-view: the context, else the window's own metrics (a render with no provider gets zero insets).
  const insets = useContext(SafeAreaInsetsContext) ?? initialWindowMetrics?.insets ?? NO_INSETS;
  const idle = usePlayerSelector(selectIdle);
  // M17 (FR-015, T113): while purchases are not switched on, Wallet says so first; the page stays one tap on.
  const [comingSoon, comingSoonDialog] = useComingSoon();
  const openWallet = (): void => {
    comingSoon({
      feature: 'Wallet',
      mark: 'wallet-outline',
      line: 'SocialNet PLUS and paid shows will be bought here, through the App Store or Google Play. Listening stays free.',
      second: { label: 'Open Wallet', onPress: () => router.push('/wallet') },
    });
  };
  const { api, listener } = useSocial();
  const profileApi = useProfileApi();
  const avatarUrl = useMyAvatar(stores.settings, listener !== undefined, profileApi.me);
  const plusOnSale = readStoreReady(stores.settings);
  const feed = useMemo(() => createFeed({ api, cache: stores.feedCache, settings: stores.settings, now: clockMs }), [api, stores]);
  const [counts, setCounts] = useState({ unread: 0, moments: 0 });
  useFocusEffect(useCallback(() => {
    setCounts({ unread: listener ? feed.unread(feed.cached()?.items ?? []) : 0, moments: listMoments(stores.settings).length });
  }, [feed, listener, stores]));
  const follow = useFollowCounts();
  const downloads = useDownloadCount();
  const openProfile = (): void => { if (listener) router.push({ pathname: '/profile/[id]', params: { id: listener.listenerId } }); };
  const [month] = useState(() => lastMonth(new Date()));

  const avatar = listener ? (
    <Box style={{ width: AVATAR, height: AVATAR, margin: RING.gap + RING.width }}>
      <Avatar url={avatarUrl} name={listener.displayName} size={AVATAR} />
      <Box pointerEvents="none" testID="avatar-ring" className="absolute border-hot" style={{ left: -(RING.gap + RING.width), top: -(RING.gap + RING.width), width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2, borderWidth: RING.width }} />
    </Box>
  ) : (
    <Box className="rounded-pill bg-raise2 items-center justify-center" style={{ width: AVATAR, height: AVATAR }} accessible={false}>
      <Icon name="person-outline" size={spacing.region - spacing.section} color={colour.idle} />
    </Box>
  );

  return (
    <SafeAreaInsetsContext.Provider value={insets}>
    <Box className="flex-1 bg-void">
      <Page
        title={listener ? listener.displayName : 'Sign in'}
        scrollToTopOnTabPress
        nameTitle
        tabs
        now={!idle}
        leading={avatar}
        trailing={<Link href="/account" asChild accessibilityLabel="Account and settings"><IconButton icon="settings-outline" label="Account and settings" fill onPress={() => router.push('/account')} /></Link>}
      >
        {!listener ? <Type step="small" className="text-text2" style={{ marginTop: -spacing.row }}>Keep your listening across phones</Type> : null}
        {follow ? <Type step="small" className="text-text2" style={{ marginTop: -spacing.row }}>{`${follow.following} following · ${follow.followers} followers`}</Type> : null}
        <Box className="flex-row" style={{ gap: spacing.gap }}>
          {listener ? <PulseButton kind="hot" label="View profile" onPress={openProfile} /> : null}
          {listener ? null : <Link href="/auth/sign-in" asChild accessibilityLabel="Sign in"><PulseButton kind="hot" label="Sign in" onPress={() => router.push('/auth/sign-in')} /></Link>}
          <Link href="/stickers" asChild accessibilityLabel="Stickers"><PulseButton kind="quiet" icon="medal-outline" label="Stickers" onPress={() => router.push('/stickers')} /></Link>
        </Box>
        <TileGrid>
          <Link href="/moments" asChild accessibilityLabel="Saved moments"><MeTile accent icon="bookmark-outline" label="Saved moments" count={counts.moments} spoken={`Saved moments, ${counts.moments}. Save a moment while listening and add a note`} /></Link>
          <Link href="/downloads" asChild accessibilityLabel="Downloads"><MeTile icon="download-outline" label="Downloads" count={downloads} /></Link>
          <Link href="/history" asChild accessibilityLabel="Listening history"><MeTile icon="time-outline" label="History" spoken="Listening history" /></Link>
          <Link href="/favourites" asChild accessibilityLabel="Favourites"><MeTile icon="star-outline" label="Favourites" /></Link>
        </TileGrid>
        <ContinueCard />
        <Box style={WRAP}>
          <Link href="/notifications" asChild accessibilityLabel="Notifications"><MePill label="Notifications" {...(counts.unread > 0 ? { badge: counts.unread } : {})} /></Link>
          <Link href="/queue" asChild accessibilityLabel="Queue"><MePill label="Queue" /></Link>
          <Link href="/my-comments" asChild accessibilityLabel="My comments"><MePill label="My comments" /></Link>
          {listener ? <Link href="/likes" asChild accessibilityLabel="Likes"><MePill label="Likes" /></Link> : null}
          {listener ? <Link href="/creator" asChild accessibilityLabel="Creator centre"><MePill label="Creator centre" /></Link> : null}
          {listener ? <Link href="/playlists" asChild accessibilityLabel="Playlists"><MePill label="Playlists" /></Link> : null}
          <Link href={{ pathname: '/report/[month]', params: { month } }} asChild accessibilityLabel={`Your ${monthName(month)}: your month in listening`}><MePill label={`Your ${monthName(month)}`} spoken={`Your ${monthName(month)}: your month in listening`} /></Link>
          {listener && plusOnSale ? <Link href="/wallet" asChild accessibilityLabel="SocialNet PLUS"><MePill label="SocialNet PLUS" icon="crown" spoken="SocialNet PLUS: see what it adds. Listening stays free" /></Link> : null}
          {/* M12 FR-105, FR-106: read-only; the stores hold the money. M17 T113: Coming soon until the store is on. */}
          {listener && plusOnSale ? <Link href="/wallet" asChild accessibilityLabel="Wallet"><MePill href="/wallet" label="Wallet" icon="wallet-outline" /></Link> : null}
          {listener && !plusOnSale ? <MePill button href="/wallet" label="Wallet" icon="wallet-outline" onPress={openWallet} /> : null}
          {listener ? <Link href="/tips" asChild accessibilityLabel="Tips I gave"><MePill label="Tips I gave" /></Link> : null}
          {/* M12 FR-091: feedback is one tap from Me. */}
          <Link href="/settings/feedback" asChild accessibilityLabel="Feedback"><MePill label="Feedback" /></Link>
        </Box>
      </Page>
      {comingSoonDialog}
    </Box>
    </SafeAreaInsetsContext.Provider>
  );
}
