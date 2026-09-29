/**
 * Me (个人, M10, owner 2026-09-27): the third tab, laid out after the reference — a
 * Stickers chip, your name (opens your profile) and picture, the saved-moments card
 * (the reference's PLUS feature, free here), then the menu.
 *
 * Signed out, the top is a Sign in row instead of a name; the menu still opens what works
 * without an account (downloads, history, favourites, moments, queue). Sign out is here,
 * one tap away (owner, 2026-09-27: it was hard to find inside Account alone).
 */
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable } from '../../src/ui/lib/pressable';
import { SafeAreaView } from '../../src/ui/lib/safe-area-view';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { SignOut } from '../../src/ui/SignOut';
import { colour, hit } from '../../src/design';
import { useColours } from '../../src/ui/useColours';
import { Icon } from '../../src/ui/Icon';
import { createFeed } from '../../src/graph/feed';
import { inboxIds } from '../../src/inbox';
import { listMoments } from '../../src/me/moments';
import { useSocial } from '../../src/social/context';
import { MenuRow } from '../../src/ui/me/parts';
import { useStores } from '../../src/ui/providers';
import { BOTTOM_INSET } from '../../src/ui/Screen';

const TAP = { minHeight: hit.min };

export default function MeScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { api, listener, auth } = useSocial();
  const feed = useMemo(() => createFeed({ api, cache: stores.feedCache, settings: stores.settings, now: () => Date.now() }), [api, stores]);
  const [counts, setCounts] = useState({ unread: 0, moments: 0, inbox: 0 });
  useFocusEffect(useCallback(() => {
    setCounts({ unread: listener ? feed.unread(feed.cached()?.items ?? []) : 0, moments: listMoments(stores.settings).length, inbox: inboxIds(stores).length });
  }, [feed, listener, stores]));

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-screen-x pt-section" contentContainerStyle={{ paddingBottom: BOTTOM_INSET }}>
        <Link href="/stickers" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel="Stickers" className="self-start flex-row items-center gap-2 border border-separator rounded-row px-row" style={TAP}>
            <Icon name="medal-outline" size={18} color={c.text} />
            <Text className="text-accent text-sm font-semibold">Stickers</Text>
          </Pressable>
        </Link>

        <Box className="flex-row items-center justify-between mt-section mb-section">
          {listener ? (
            <Link href={{ pathname: '/profile/[id]', params: { id: listener.listenerId } }} asChild>
              <Pressable accessibilityRole="link" accessibilityLabel={`${listener.displayName}, open your profile`} className="flex-1 flex-row items-center gap-2" style={TAP}>
                <Text className="text-text text-lg font-bold" numberOfLines={1}>{listener.displayName}</Text>
                <Text className="text-accent text-lg">›</Text>
              </Pressable>
            </Link>
          ) : (
            <Link href="/auth/sign-in" asChild>
              <Pressable accessibilityRole="link" accessibilityLabel="Sign in" className="flex-1 flex-row items-center gap-2" style={TAP}>
                <Text className="text-text text-lg font-bold">Sign in</Text>
                <Text className="text-accent text-lg">›</Text>
              </Pressable>
            </Link>
          )}
          <Box className="w-20 h-20 rounded-pill bg-surface items-center justify-center" accessible={false}>
            {listener
              ? <Text className="text-muted text-lg">{listener.displayName.slice(0, 1).toUpperCase()}</Text>
              : <Icon name="person-outline" size={32} color={c.muted} />}
          </Box>
        </Box>

        <Link href="/moments" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`Saved moments, ${counts.moments}. Save a moment while listening and add a note`} className="bg-surface border border-separator rounded-artwork p-section flex-row items-center justify-between mb-section">
            <Box className="flex-1">
              <Box className="flex-row items-center gap-1"><Icon name="bookmark-outline" size={16} color={c.accent} /><Text className="text-accent text-sm font-bold">Saved moments</Text></Box>
              <Text className="text-muted text-xs mt-1">Save a moment while listening, and add a note</Text>
            </Box>
            <Text className="text-accent text-sm font-semibold">{counts.moments > 0 ? `${counts.moments} ›` : 'Open ›'}</Text>
          </Pressable>
        </Link>

        {listener ? <MenuRow href={`/profile/${listener.listenerId}`} icon="id-card-outline" label="My profile" /> : null}
        <Box className="border-b-hairline border-separator my-row" />
        <MenuRow href="/notifications" icon="notifications-outline" label="Notifications" {...(counts.unread > 0 ? { badge: counts.unread } : {})} />
        <MenuRow href="/inbox" icon="file-tray-outline" label="Inbox" {...(counts.inbox > 0 ? { badge: counts.inbox } : {})} />
        <MenuRow href="/downloads" icon="download-outline" label="Downloads" />
        <MenuRow href="/history" icon="time-outline" label="Listening history" />
        <MenuRow href="/favourites" icon="star-outline" label="Favourites" />
        <MenuRow href="/my-comments" icon="chatbubble-outline" label="My comments" />
        <MenuRow href="/queue" icon="list-outline" label="Queue" />
        {listener ? <MenuRow href="/creator" icon="mic-outline" label="Creator centre" /> : null}
        <Box className="border-b-hairline border-separator my-row" />
        <MenuRow href="/account" icon="settings-outline" label="Account and settings" />
        {listener ? (
          <SignOut onSignOut={() => void auth.signOut()} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
