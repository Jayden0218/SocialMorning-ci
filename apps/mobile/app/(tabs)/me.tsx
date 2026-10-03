/**
 * Me (个人, M10, owner 2026-09-27): the third tab, laid out after the reference — a
 * Stickers chip, your name (opens your profile) and picture, the saved-moments card
 * (the reference's PLUS feature, free here), then the menu.
 *
 * M17 (`Me-B`, T040): the Editorial layout. The Stickers pill sits top right; the picture is a
 * large centred circle with the name under it in the serif and "My profile →" below; saved
 * moments is a yellow card with its count in the serif; the eight destinations are a
 * two-column grid of white tiles (`MenuTile`), and Wallet · Tips · Feedback · Account sit in one
 * white `Card` of rows. Every link, name and destination is the one Me had before.
 *
 * Signed out, the top is a Sign in link instead of a name; the menu still opens what works
 * without an account (downloads, history, favourites, moments, queue). Sign out is here,
 * one tap away (owner, 2026-09-27: it was hard to find inside Account alone).
 */
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { useColours } from '@/ui/kit/useColours';
import { Icon } from '@/ui/kit/Icon';
import { createFeed } from '@/graph/feed';
import { inboxIds } from '@/me/inbox';
import { listMoments } from '@/me/moments';
import { useSocial } from '@/social/context';
import { Card, CardDivider } from '@/ui/kit/Card';
import { MenuRow, MenuTile } from '@/ui/me/parts';
import { useComingSoon } from '@/ui/kit/ComingSoon';
import { readStoreReady } from '@/social/store-ready';
import { useStores } from '@/ui/shell/providers';
import { BOTTOM_INSET } from '@/ui/kit/Screen';

const TAP = { minHeight: hit.min };
/** The picture: 96 pt, as in `Me-B`. A size, so it stays a style. */
const AVATAR = { width: 96, height: 96 };

export default function MeScreen(): React.ReactElement {
  const stores = useStores();
  // M17 (FR-015, T113): while purchases are not switched on, Wallet says so first; the page stays one tap on.
  const [comingSoon, comingSoonDialog] = useComingSoon();
  const openWallet = readStoreReady(stores.settings) ? undefined : () => comingSoon({
    feature: 'Wallet',
    line: 'SocialNet PLUS and paid shows will be bought here, through the App Store or Google Play. Listening stays free.',
    second: { label: 'Open Wallet', onPress: () => router.push('/wallet') },
  });
  const c = useColours(stores.settings);
  const { api, listener } = useSocial();
  const feed = useMemo(() => createFeed({ api, cache: stores.feedCache, settings: stores.settings, now: () => Date.now() }), [api, stores]);
  const [counts, setCounts] = useState({ unread: 0, moments: 0, inbox: 0 });
  useFocusEffect(useCallback(() => {
    setCounts({ unread: listener ? feed.unread(feed.cached()?.items ?? []) : 0, moments: listMoments(stores.settings).length, inbox: inboxIds(stores).length });
  }, [feed, listener, stores]));

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-screen-x pt-section" contentContainerStyle={{ paddingBottom: BOTTOM_INSET }}>
        <Link href="/stickers" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel="Stickers" className="self-end flex-row items-center gap-2 bg-surface border border-border rounded-pill px-section" style={TAP}>
            <Icon name="medal-outline" size={18} color={c.text} />
            <Text className="text-accent text-meta font-bold">Stickers</Text>
          </Pressable>
        </Link>

        <Box className="items-center mt-2">
          <Box className="rounded-pill bg-accentTint items-center justify-center" style={AVATAR} accessible={false}>
            {listener
              ? <Text className="font-display text-display text-text">{listener.displayName.slice(0, 1).toUpperCase()}</Text>
              : <Icon name="person-outline" size={40} color={c.accent} />}
          </Box>
          {listener ? (
            <>
              <Link href={{ pathname: '/profile/[id]', params: { id: listener.listenerId } }} asChild>
                <Pressable accessibilityRole="link" accessibilityLabel={`${listener.displayName}, open your profile`} className="items-center justify-center mt-2 self-stretch" style={TAP}>
                  <Text className="font-display text-hero text-text text-center" numberOfLines={1}>
                    {listener.displayName}
                  </Text>
                </Pressable>
              </Link>
              <Link href={`/profile/${listener.listenerId}`} asChild>
                <Pressable accessibilityRole="link" accessibilityLabel="My profile" className="items-center justify-center px-section" style={TAP}>
                  <Text className="text-accent text-meta font-semibold">My profile →</Text>
                </Pressable>
              </Link>
            </>
          ) : (
            <Link href="/auth/sign-in" asChild>
              <Pressable accessibilityRole="link" accessibilityLabel="Sign in" className="items-center justify-center mt-2 px-section" style={TAP}>
                <Text className="font-display text-hero text-text">Sign in →</Text>
              </Pressable>
            </Link>
          )}
        </Box>

        <Link href="/moments" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`Saved moments, ${counts.moments}. Save a moment while listening and add a note`} className="bg-primary rounded-row p-section flex-row items-center gap-row mt-section">
            <Box className="w-11 h-11 rounded-pill bg-track items-center justify-center"><Icon name="bookmark-outline" size={22} color={c.onPrimary} /></Box>
            <Box className="flex-1">
              <Text className="font-display text-title text-onPrimary">Saved moments</Text>
              <Text className="text-onPrimary text-xs mt-1">Save a moment while listening, and add a note</Text>
            </Box>
            {counts.moments > 0
              ? <Text className="font-display text-hero text-onPrimary">{counts.moments}</Text>
              : <Icon name="chevron-forward" size={20} color={c.onPrimary} />}
          </Pressable>
        </Link>

        <Box className="gap-gap mt-section">
          <Box className="flex-row gap-gap">
            <Link href="/notifications" asChild accessibilityLabel="Notifications"><MenuTile icon="notifications-outline" label="Notifications" {...(counts.unread > 0 ? { badge: counts.unread } : {})} /></Link>
            <Link href="/inbox" asChild accessibilityLabel="Inbox"><MenuTile icon="file-tray-outline" label="Inbox" {...(counts.inbox > 0 ? { badge: counts.inbox } : {})} /></Link>
          </Box>
          <Box className="flex-row gap-gap">
            <Link href="/downloads" asChild accessibilityLabel="Downloads"><MenuTile icon="download-outline" label="Downloads" /></Link>
            <Link href="/history" asChild accessibilityLabel="Listening history"><MenuTile icon="time-outline" label="Listening history" /></Link>
          </Box>
          <Box className="flex-row gap-gap">
            <Link href="/favourites" asChild accessibilityLabel="Favourites"><MenuTile icon="star-outline" label="Favourites" /></Link>
            <Link href="/my-comments" asChild accessibilityLabel="My comments"><MenuTile icon="chatbubble-outline" label="My comments" /></Link>
          </Box>
          <Box className="flex-row gap-gap">
            <Link href="/queue" asChild accessibilityLabel="Queue"><MenuTile icon="list-outline" label="Queue" /></Link>
            {listener ? <Link href="/creator" asChild accessibilityLabel="Creator centre"><MenuTile icon="mic-outline" label="Creator centre" /></Link> : <Box className="flex-1" />}
          </Box>
        </Box>

        <Card className="mt-row">
          {/* M12 FR-105, FR-106: read-only; the stores hold the money. M17 T113: Coming soon until the store is on. */}
          {listener ? <><MenuRow href="/wallet" icon="wallet-outline" label="Wallet" {...(openWallet ? { onPress: openWallet } : {})} /><CardDivider /></> : null}
          {listener ? <><MenuRow href="/tips" icon="heart-outline" label="Tips I gave" /><CardDivider /></> : null}
          {/* M12 FR-091: feedback is one tap from Me. */}
          <MenuRow href="/settings/feedback" icon="chatbox-ellipses-outline" label="Feedback" />
          <CardDivider />
          <MenuRow href="/account" icon="settings-outline" label="Account and settings" />
          {/* M12 FR-090: Sign out lives once, in Settings (it was on Me as well). */}
        </Card>
      </ScrollView>
      {comingSoonDialog}
    </SafeAreaView>
  );
}
