/**
 * Root layout: open the database, build the player, mount the mini player and
 * the toast host (FR-015). Everything else is a screen.
 */
import '../global.css';
import '../src/design/tailwind';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import { SafeAreaView } from '../src/ui/lib/safe-area-view';
import { colourDark, fontSize } from '../src/design';
import { AppProviders, useStores } from '../src/ui/providers';
import { useColours } from '../src/ui/useColours';
import { SocialProvider } from '../src/social/context';
import { GraphProvider } from '../src/graph/context';
import { SafetyProvider } from '../src/safety/context';
import { CarLibrarySync } from '../src/outside/CarLibrarySync';
import { MiniPlayer } from '../src/ui/MiniPlayer';
import { GluestackUIProvider } from '../src/ui/lib/gluestack-ui-provider';

// Owner, 2026-09-27: no warning bar over the app in Debug builds. Warnings still print
// in the Metro terminal; Release builds never show the bar.
LogBox.ignoreAllLogs(true);

// Owner, 2026-09-29: one launch screen, then the first page — no white page between. The
// native launch screen stays until AppProviders has that page drawn and hides it (providers).
void SplashScreen.preventAutoHideAsync();

export default function RootLayout(): React.ReactElement {
  return (
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
  );
}

/** The stack and its chrome. Its own component so it sits inside <AppProviders> and can read the palette. */
function RootStack(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        {/* M10b: the clock and battery follow the page (light words on the dark palette). */}
        <StatusBar style={c.background === colourDark.background ? 'light' : 'dark'} />
        <CarLibrarySync />
        {/*
          * M7: one place decides the chrome for every screen in the stack — the dark
          * background, the large white title, the accent back arrow. Setting
          * `contentStyle` here is what stops a screen that has not been touched yet
          * from flashing white underneath the new header.
          */}
        <Stack
          screenOptions={{
            headerBackTitle: 'Back',
            headerStyle: { backgroundColor: c.background },
            headerTintColor: c.accent,
            headerTitleStyle: { color: c.text, fontSize: fontSize.base, fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.background },
          }}
        >
          {/* The tab group draws its own header and its own bar (M7 T012). */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* M10: Search draws its own box + Cancel at the top, like the reference. */}
          <Stack.Screen name="search" options={{ title: 'Search', headerShown: false }} />
          {/* The scanner draws its own close button and title over the camera (owner, 2026-09-27). */}
          <Stack.Screen name="scan" options={{ title: 'Scan a QR code', headerShown: false }} />
          {/* The show, episode and player pages draw their own bar (owner reference, 2026-09-27). */}
          <Stack.Screen name="show/[feedUrl]" options={{ title: 'Show', headerShown: false }} />
          <Stack.Screen name="episode/[id]" options={{ title: 'Episode', headerShown: false }} />
          <Stack.Screen name="player" options={{ title: 'Now Playing', headerShown: false }} />
          {/* The auth pages draw their own close ✕ and title (owner's reference, 2026-09-27). */}
          {/* No slide: after Accept the landing page must appear at once, with nothing of
              the home page showing on the way (owner, 2026-09-27; see providers). */}
          {/* Signing in is required (owner, 2026-09-27): no swipe back off this page. */}
          <Stack.Screen name="auth/sign-in" options={{ title: 'Sign in', headerShown: false, animation: 'none', gestureEnabled: false }} />
          <Stack.Screen name="auth/email" options={{ title: 'Sign in with email', headerShown: false }} />
          <Stack.Screen name="auth/sign-up" options={{ title: 'Create account', headerShown: false }} />
          <Stack.Screen name="account" options={{ title: 'Account' }} />
          <Stack.Screen name="downloads" options={{ title: 'Downloads' }} />
          <Stack.Screen name="queue" options={{ title: 'Queue' }} />
          <Stack.Screen name="inbox" options={{ title: 'Inbox' }} />
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
          <Stack.Screen name="category/[id]" options={{ title: 'Category' }} />
          <Stack.Screen name="clip/new" options={{ title: 'New clip' }} />
          <Stack.Screen name="clip/[id]" options={{ title: 'Clip' }} />
          <Stack.Screen name="profile/[id]" options={{ title: 'Profile' }} />
          <Stack.Screen name="profile/[id]/followers" options={{ title: 'Followers' }} />
          <Stack.Screen name="profile/[id]/following" options={{ title: 'Following' }} />
        </Stack>
        <MiniPlayer />
      </SafeAreaView>
  );
}
