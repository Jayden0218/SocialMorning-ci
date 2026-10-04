// No screen: starts the app, database and player; shows an error page if something breaks.
/**
 * Root layout: open the database, build the player, mount the mini player and
 * the toast host (FR-015). Everything else is a screen.
 */
import '../global.css';
import '@/design/tailwind';
import { Stack, useSegments, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { LogBox } from 'react-native';
import { SafeAreaListener } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { hit } from '@/design';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/lib/text';
import { Pressable } from '@/ui/lib/pressable';
import { AppProviders, useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { SocialProvider } from '@/social/context';
import { GraphProvider } from '@/graph/context';
import { SafetyProvider } from '@/safety/context';
import { CarLibrarySync } from '@/outside/CarLibrarySync';
import { MiniPlayer } from '@/ui/player/MiniPlayer';
import { leavingToTabs, rootBarHidden, type LeavingToTabs } from '@/ui/player/mini-player-swipe';
import { GluestackUIProvider } from '@/ui/lib/gluestack-ui-provider';
import { RateSheet } from '@/ui/shell/RateSheet';
import { consentGiven } from '@/ui/shell/consent';

// Owner, 2026-09-27: no warning bar over the app in Debug builds. Warnings still print
// in the Metro terminal; Release builds never show the bar.
LogBox.ignoreAllLogs(true);

// Owner, 2026-09-29: one launch screen, then the first page — no white page between. The
// native launch screen stays until AppProviders has that page drawn and hides it (providers).
void SplashScreen.preventAutoHideAsync();

/**
 * M12 T004 (Principle IV, degrade partially): an error anywhere in the app shows this screen
 * with a way back, instead of a blank white app (found on the iPhone 2026-09-29 as NEW-1 — a
 * layout that collapsed, but a thrown error would have looked the same). It sits outside every
 * provider, so it uses only plain parts and token classes.
 *
 * M17 T111 (`ErrorScreen-B`): left-aligned under a drawn accent waveform with a gap in it, a
 * 40 pt serif title, the line in 17 pt muted, and Try again as the full-width yellow pill at the
 * foot (it was a small centred pill). Same words, same `props.retry()`.
 */
const WAVE = [10, 18, 28, 16, 34, 22, 12, 0, 0, 14, 30, 20, 38, 24, 14, 8];
export function ErrorBoundary(props: ErrorBoundaryProps): React.ReactElement {
  if (__DEV__) console.error(props.error);
  return (
    <Box className="flex-1 bg-background px-screen-x pb-10">
      <Box className="flex-1 pt-[120px]">
        <Box className="flex-row items-center gap-[5px] h-12" accessible={false} importantForAccessibility="no-hide-descendants">
          {WAVE.map((h, i) => <Box key={i} className={h > 0 ? 'bg-accent rounded' : 'rounded'} style={{ width: 8, height: h }} />)}
        </Box>
        <Text className="text-text font-display text-[40px] leading-[52px] mt-7" accessibilityRole="header">Something went wrong</Text>
        <Text className="text-muted text-title leading-[25px] mt-[14px]">This screen stopped working. Your listening and downloads are safe.</Text>
      </Box>
      <Pressable onPress={() => void props.retry()} accessibilityRole="button" accessibilityLabel="Try again" className="bg-primary rounded-pill px-section items-center justify-center w-full" style={{ minHeight: Math.max(hit.min, 52) }}>
        <Text className="text-onPrimary text-[15px] font-bold">Try again</Text>
      </Pressable>
    </Box>
  );
}

export default function RootLayout(): React.ReactElement {
  return (
    // M16a T014 (FR-009, gluestack audit P0): UniWind's free engine learns the safe-area insets
    // only from this listener (docs.uniwind.dev/faq; the upstream starter does the same). Without
    // it every `pb-safe` — ActionsheetContent's base class among them — resolved to 0, and the
    // sheets carried guessed `pb-10` / `pb-24` instead.
    <SafeAreaListener onChange={({ insets }) => Uniwind.updateInsets(insets)}>
    <AppProviders>
      <SocialProvider>
      <SafetyProvider>
      <GraphProvider>
      {/* Innermost (found on the iPhone 2026-09-29): gluestack draws sheets, dialogs and toasts
          in a portal at this provider, so it must sit inside every data provider — outside
          AppProviders the episode ⋯ sheet threw "useStores must be used inside <AppProviders>",
          which a Release build turns into a crash. */}
      <GluestackUIProvider>
      <RootStack />
      </GluestackUIProvider>
      </GraphProvider>
      </SafetyProvider>
      </SocialProvider>
    </AppProviders>
    </SafeAreaListener>
  );
}

/** The stack and its chrome. Its own component so it sits inside <AppProviders> and can read the palette. */
function RootStack(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  // M16a bug 5: which page, if any, is being swiped back onto the tabs (src/ui/player/mini-player-swipe.ts).
  const [leaving, setLeaving] = useState<LeavingToTabs>(undefined);
  // Owner, 2026-10-04: on the tabs the home-bar strip below the white tab bar is white too, so
  // the bar reaches the bottom of the screen; on every other page it stays the page colour.
  const onTabs = useSegments()[0] === '(tabs)';
  return (
      <SafeAreaView className={`flex-1 ${onTabs ? 'bg-surface' : 'bg-background'}`} edges={['bottom']}>
        {/* M10b: the clock and battery follow the page (light words on the dark palette). */}
        <StatusBar style="dark" />
        <CarLibrarySync />
        {/*
          * M16a T002 (FR-012, owner 2026-10-02, said twice): no iOS-native header on any page.
          * Every page draws the app's own bar (src/ui/kit/PageHeader.tsx, or TopBar on the show,
          * episode and player pages); the titles below stay for the screen name a screen reader
          * and the app switcher use. `gestureEnabled` is untouched, so edge-swipe back works as
          * before on every page. Guard G-N1: __tests__/no-native-ui.test.ts.
          * `contentStyle` still stops an untouched screen flashing white (M7).
          */}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: c.background },
          }}
          screenListeners={({ navigation, route }) => ({
            // M16a bug 5: a back-swipe onto the tabs hides the root bar as it starts, not after.
            transitionStart: (e) => {
              const routes = navigation.getState().routes;
              const i = routes.findIndex((r: { key: string }) => r.key === route.key);
              const below = i > 0 ? routes[i - 1]?.name : undefined;
              setLeaving((s) => leavingToTabs(s, { type: 'transitionStart', key: route.key, closing: e.data.closing, below, name: route.name }));
            },
            gestureCancel: () => setLeaving((s) => leavingToTabs(s, { type: 'gestureCancel', key: route.key })),
          })}
        >
          {/* The tab group draws its own header and its own bar (M7 T012). */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* M10: Search draws its own box + Cancel at the top, like the reference. Owner,
              2026-10-01: no slide and no swipe — it fades. M17 (phone walk 2026-10-02): NOT a
              modal of any kind. Every route pushed after a modal is presented as a modal sheet
              (expo-router getModalRouteKeys), so an episode opened from Search had no edge swipe.
              From Discover, Search is drawn in place (src/ui/search/SearchOverlay.tsx); this
              route is the other ways in. Guard G-S2: __tests__/search-in-place.test.ts. */}
          <Stack.Screen name="search" options={{ title: 'Search', headerShown: false, animation: 'fade', animationDuration: 200, gestureEnabled: false }} />
          {/* The scanner draws its own close button and title over the camera (owner, 2026-09-27). */}
          <Stack.Screen name="scan" options={{ title: 'Scan a QR code', headerShown: false }} />
          {/* The show, episode and player pages draw their own bar (owner reference, 2026-09-27). */}
          <Stack.Screen name="show/[feedUrl]" options={{ title: 'Show', headerShown: false }} />
          <Stack.Screen name="episode/[id]" options={{ title: 'Episode', headerShown: false }} />
          {/* M12 US2: comments on their own page, opened from the player and the episode page. */}
          <Stack.Screen name="comments/[episodeId]" options={{ title: 'Comments' }} />
          <Stack.Screen name="player" options={{ title: 'Now Playing', headerShown: false }} />
          {/* The auth pages draw their own close ✕ and title (owner's reference, 2026-09-27). */}
          {/* No slide: after Accept the landing page must appear at once, with nothing of
              the home page showing on the way (owner, 2026-09-27; see providers). */}
          {/* Signing in is required (owner, 2026-09-27): no swipe back off this page. */}
          <Stack.Screen name="auth/sign-in" options={{ title: 'Sign in', headerShown: false, animation: 'none', gestureEnabled: false }} />
          {/* No slide either (owner, 2026-10-04): the page opens at once, and the keyboard is
              not drawn over the half-slid page, which made it flash dark then light. */}
          <Stack.Screen name="auth/email" options={{ title: 'Sign in with email', headerShown: false, animation: 'none' }} />
          <Stack.Screen name="auth/sign-up" options={{ title: 'Create account', headerShown: false }} />
          <Stack.Screen name="account" options={{ title: 'Account' }} />
          <Stack.Screen name="downloads" options={{ title: 'Downloads' }} />
          <Stack.Screen name="queue" options={{ title: 'Queue' }} />
          {/* Owner, 2026-10-04: /inbox only redirects to Updates. */}
          <Stack.Screen name="inbox" options={{ title: 'Updates' }} />
          <Stack.Screen name="categories" options={{ title: 'Categories' }} />
          {/* M10: the Me tab's pages. */}
          <Stack.Screen name="subscriptions" options={{ title: 'My subscriptions' }} />
          <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
          <Stack.Screen name="history" options={{ title: 'Listening history' }} />
          <Stack.Screen name="favourites" options={{ title: 'Favourites' }} />
          <Stack.Screen name="moments" options={{ title: 'Saved moments' }} />
          <Stack.Screen name="my-comments" options={{ title: 'My comments' }} />
          <Stack.Screen name="creator" options={{ title: 'Creator centre' }} />
          <Stack.Screen name="play-latest" options={{ title: 'Play latest' }} />
          <Stack.Screen name="stickers" options={{ title: 'Stickers' }} />
          <Stack.Screen name="category/[id]" options={{ title: 'Categories' }} />
          <Stack.Screen name="picks/past" options={{ title: 'Past picks' }} />
          <Stack.Screen name="chart" options={{ title: 'Talked about' }} />
          <Stack.Screen name="issues" options={{ title: 'Issues' }} />
          <Stack.Screen name="issue/[id]" options={{ title: 'Issue' }} />
          <Stack.Screen name="friends-listening" options={{ title: 'Friends listening' }} />
          <Stack.Screen name="academy/index" options={{ title: 'Creator academy' }} />
          <Stack.Screen name="academy/[slug]" options={{ title: 'Article' }} />
          <Stack.Screen name="wallet" options={{ title: 'Wallet' }} />
          <Stack.Screen name="tips" options={{ title: 'Tips I gave' }} />
          <Stack.Screen name="voice/new" options={{ title: 'Voice status', presentation: 'modal' }} />
          <Stack.Screen name="clip/new" options={{ title: 'New clip' }} />
          <Stack.Screen name="clip/[id]" options={{ title: 'Clip' }} />
          <Stack.Screen name="profile/[id]" options={{ title: 'Profile' }} />
          {/* Chat (owner, 2026-10-04): a conversation and the friend picker. */}
          <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
          <Stack.Screen name="chat/new" options={{ title: 'New chat' }} />
          <Stack.Screen name="profile/[id]/followers" options={{ title: 'Followers' }} />
          <Stack.Screen name="profile/[id]/following" options={{ title: 'Following' }} />
        </Stack>
        {rootBarHidden(leaving) ? null : <MiniPlayer />}
        {/* Owner, 2026-10-04: "Enjoying SocialNet?" — on the tabs, after the terms are agreed. */}
        <RateSheet ready={onTabs && consentGiven(stores.settings, stores.auth.get() !== undefined)} />
      </SafeAreaView>
  );
}
