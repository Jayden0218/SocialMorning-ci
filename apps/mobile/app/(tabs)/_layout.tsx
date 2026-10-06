// The bottom bar: Discover, Updates, Chat, Me, with the mini player above it.
/**
 * The four tabs (M7 T012; reordered M10; Chat added 2026-10-04): **Discover · Updates · Chat · Me** (the list is in
 * `src/ui/shell/tabs.ts`), with the mini player floating above the bar. `/discover` and
 * `/following` are hidden routes that redirect.
 *
 * Why only these three: they are the destinations a listener returns to. Inbox, Queue,
 * Downloads and Account stay links on the Library, which keeps them at **2 taps** —
 * exactly what they cost before (research R5, guard G4: nothing may get further away).
 *
 * Why our own bar: `tabBar` is handed a plain render function, so the bar is `TabBar`,
 * a component of ours with real roles, real states and no fixed height. The default
 * bar would have meant trusting a library with the accessibility work M6 spent four
 * device builds earning.
 *
 * Every other route stays in the stack above, at its present path, so every
 * `socialmorning://…` link M1–M6 uses still resolves (FR-010b, guard G3).
 */
import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { useColours } from '@/ui/kit/useColours';
import { createFeed } from '@/graph/feed';
import { useSocial } from '@/social/context';
import { useChatApi } from '@/social/chat-api';
import { TabsMiniPlayer } from '@/ui/player/MiniPlayer';
import { useStores } from '@/ui/shell/providers';
import { TabBar } from '@/ui/shell/TabBar';
import { TABS, TAB_HREF } from '@/ui/shell/tabs';
import { SearchOverlayHost } from '@/ui/search/SearchOverlay';


export default function TabsLayout(): React.ReactElement {
  const router = useRouter();
  const stores = useStores();
  const c = useColours(stores.settings);
  const { api, listener } = useSocial();
  // M4's unread count followed the Following *link* off the Library. It lives on the
  // *tab* now, so the feature did not leave with the link. Recomputed whenever the
  // listener changes, plus on every tab switch (the `active` dependency below).
  const [unread, setUnread] = useState(0);
  const [visit, setVisit] = useState(0);
  useEffect(() => {
    if (listener === undefined) {
      setUnread(0);
      return;
    }
    let live = true;
    const feed = createFeed({ api, cache: stores.feedCache, settings: stores.settings, now: () => Date.now() });
    setUnread(feed.unread(feed.cached()?.items ?? []));
    void feed.refresh().then((v) => {
      if (live) setUnread(feed.unread(v.items));
    });
    return () => {
      live = false;
    };
  }, [api, stores, listener, visit]);

  // Chat (owner, 2026-10-04): unread messages badge the Chat tab — read on every tab switch and
  // once a minute while signed in (there is no push channel for chat).
  const chat = useChatApi();
  const [unreadChat, setUnreadChat] = useState(0);
  useEffect(() => {
    if (listener === undefined) {
      setUnreadChat(0);
      return;
    }
    let live = true;
    const read = () => void chat.unread().then((n) => { if (live) setUnreadChat(n); }, () => undefined);
    read();
    const timer = setInterval(read, 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [chat, listener, visit]);

  // M10: the unread count now badges Me, where Notifications holds the feed.
  const items = TABS.map((t) => (t.key === 'me' && unread > 0 ? { ...t, badge: unread } : t.key === 'chat' && unreadChat > 0 ? { ...t, badge: unreadChat } : t));

  return (
    // M17: Discover's Search is drawn in place over the tabs and their bar, so result pages push
    // on the root stack with the normal edge swipe (src/ui/search/SearchOverlay.tsx).
    <SearchOverlayHost>
    <Tabs
      screenOptions={{
        // M16a T002 (FR-012): no system header here either — Discover, Updates and Me draw their
        // own titles; the two hidden routes only redirect.
        headerShown: false,
        sceneStyle: { backgroundColor: c.background },
      }}
      tabBar={(props) => {
        const active = props.state.routes[props.state.index]?.name ?? 'index';
        return (
          <Box className="bg-surface">
            <TabsMiniPlayer />
            <TabBar
              items={items}
              activeKey={active}
              onSelect={(key) => {
                // M21 T082 (FR-060): tell the tab it was pressed, as the stock bar does — a tab's
                // `useScrollToTop` scrolls its list to the top when it is pressed again.
                const target = props.state.routes.find((r) => r.name === key)?.key;
                if (target) props.navigation.emit({ type: 'tabPress', target, canPreventDefault: true });
                if (key === active) return;
                setVisit((n) => n + 1);
                router.navigate(TAB_HREF[key] ?? '/');
              }}
            />
          </Box>
        );
      }}
    >
      {/* M10: Discover draws its own large title, so it has no bar. */}
      <Tabs.Screen name="index" options={{ title: 'Discover', headerShown: false }} />
      {/* M10: Updates and Me draw their own large titles, like Discover. */}
      <Tabs.Screen name="library" options={{ title: 'Updates', headerShown: false }} />
      {/* Owner, 2026-10-04: Chat draws its own large title too. */}
      <Tabs.Screen name="chat" options={{ title: 'Chat', headerShown: false }} />
      <Tabs.Screen name="me" options={{ title: 'Me', headerShown: false }} />
      {/* Not in the bar: only so old `/following` links land (they redirect to Notifications). */}
      <Tabs.Screen name="following" options={{ title: 'Following' }} />
      {/* Not in the bar (TABS drives the bar): only here so old `/discover` links land. */}
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
    </Tabs>
    </SearchOverlayHost>
  );
}
