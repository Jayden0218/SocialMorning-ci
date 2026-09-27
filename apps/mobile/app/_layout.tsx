/**
 * Root layout: open the database, build the player, mount the mini player and
 * the toast host (FR-015). Everything else is a screen.
 */
import '../global.css';
import '../src/design/tailwind';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox, SafeAreaView } from 'react-native';
import { colour, fontSize } from '../src/design';
import { AppProviders } from '../src/ui/providers';
import { SocialProvider } from '../src/social/context';
import { GraphProvider } from '../src/graph/context';
import { SafetyProvider } from '../src/safety/context';
import { MiniPlayer } from '../src/ui/MiniPlayer';

// Owner, 2026-09-27: no warning bar over the app in Debug builds. Warnings still print
// in the Metro terminal; Release builds never show the bar.
LogBox.ignoreAllLogs(true);

export default function RootLayout(): React.ReactElement {
  return (
    <AppProviders>
      <SocialProvider>
      <SafetyProvider>
      <GraphProvider>
      <SafeAreaView className="flex-1 bg-background">
        <StatusBar style="dark" />
        {/*
          * M7: one place decides the chrome for every screen in the stack — the dark
          * background, the large white title, the accent back arrow. Setting
          * `contentStyle` here is what stops a screen that has not been touched yet
          * from flashing white underneath the new header.
          */}
        <Stack
          screenOptions={{
            headerBackTitle: 'Back',
            headerStyle: { backgroundColor: colour.background },
            headerTintColor: colour.accent,
            headerTitleStyle: { color: colour.text, fontSize: fontSize.base, fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colour.background },
          }}
        >
          {/* The tab group draws its own header and its own bar (M7 T012). */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* M10: Search draws its own box + Cancel at the top, like the reference. */}
          <Stack.Screen name="search" options={{ title: 'Search', headerShown: false }} />
          <Stack.Screen name="scan" options={{ title: 'Scan a QR code' }} />
          <Stack.Screen name="show/[feedUrl]" options={{ title: 'Show' }} />
          <Stack.Screen name="episode/[id]" options={{ title: 'Episode' }} />
          <Stack.Screen name="player" options={{ title: 'Now Playing' }} />
          {/* The auth pages draw their own close ✕ and title (owner's reference, 2026-09-27). */}
          <Stack.Screen name="auth/sign-in" options={{ title: 'Sign in', headerShown: false }} />
          <Stack.Screen name="auth/sign-up" options={{ title: 'Create account', headerShown: false }} />
          <Stack.Screen name="account" options={{ title: 'Account' }} />
          <Stack.Screen name="downloads" options={{ title: 'Downloads' }} />
          <Stack.Screen name="queue" options={{ title: 'Queue' }} />
          <Stack.Screen name="inbox" options={{ title: 'Inbox' }} />
          <Stack.Screen name="categories" options={{ title: 'Categories' }} />
          <Stack.Screen name="category/[id]" options={{ title: 'Category' }} />
          <Stack.Screen name="clip/new" options={{ title: 'New clip' }} />
          <Stack.Screen name="clip/[id]" options={{ title: 'Clip' }} />
          <Stack.Screen name="profile/[id]" options={{ title: 'Profile' }} />
          <Stack.Screen name="profile/[id]/followers" options={{ title: 'Followers' }} />
          <Stack.Screen name="profile/[id]/following" options={{ title: 'Following' }} />
        </Stack>
        <MiniPlayer />
      </SafeAreaView>
      </GraphProvider>
      </SafetyProvider>
      </SocialProvider>
    </AppProviders>
  );
}
