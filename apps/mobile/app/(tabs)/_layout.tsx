/**
 * The three tabs (M7 T012): **Library · Discover · Following**, with the mini player
 * floating above the bar.
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
import { View, StyleSheet } from 'react-native';
import { colour } from '../../src/design';
import { createFeed } from '../../src/graph/feed';
import { useSocial } from '../../src/social/context';
import { MiniPlayer } from '../../src/ui/MiniPlayer';
import { useStores } from '../../src/ui/providers';
import { TabBar, type TabItem } from '../../src/ui/TabBar';

export const TABS: readonly TabItem[] = [
  { key: 'index', label: 'Library' },
  { key: 'discover', label: 'Discover' },
  { key: 'following', label: 'Following' },
];

/**
 * Route name → the path the app has always answered on. Navigating by **path** rather
 * than by the navigator's own `navigate(name)` is deliberate: it is the same string a
 * `socialmorning://…` link carries, so a tab and a deep link cannot drift apart (G3).
 */
export const TAB_HREF: Record<string, '/' | '/discover' | '/following'> = {
  index: '/',
  discover: '/discover',
  following: '/following',
};

export default function TabsLayout(): React.ReactElement {
  const router = useRouter();
  const stores = useStores();
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

  const items = TABS.map((t) => (t.key === 'following' && unread > 0 ? { ...t, badge: unread } : t));

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => {
        const active = props.state.routes[props.state.index]?.name ?? 'index';
        return (
          <View style={styles.dock}>
            <MiniPlayer context="tabs" />
            <TabBar
              items={items}
              activeKey={active}
              onSelect={(key) => {
                if (key === active) return;
                setVisit((n) => n + 1);
                router.navigate(TAB_HREF[key] ?? '/');
              }}
            />
          </View>
        );
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Library' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="following" options={{ title: 'Following' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({ dock: { backgroundColor: colour.background } });
