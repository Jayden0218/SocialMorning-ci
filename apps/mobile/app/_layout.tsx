/**
 * Root layout: open the database, build the player, mount the mini bar and
 * the toast host (FR-015). Everything else is a screen.
 */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { AppProviders } from '../src/ui/providers';
import { SocialProvider } from '../src/social/context';
import { GraphProvider } from '../src/graph/context';
import { MiniBar } from '../src/ui/MiniBar';

export default function RootLayout(): React.ReactElement {
  return (
    <AppProviders>
      <SocialProvider>
      <GraphProvider>
      <SafeAreaView style={styles.fill}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerBackTitle: 'Back' }}>
          <Stack.Screen name="index" options={{ title: 'Library' }} />
          <Stack.Screen name="search" options={{ title: 'Search' }} />
          <Stack.Screen name="show/[feedUrl]" options={{ title: 'Show' }} />
          <Stack.Screen name="episode/[id]" options={{ title: 'Episode' }} />
          <Stack.Screen name="player" options={{ title: 'Now Playing' }} />
          <Stack.Screen name="auth/sign-in" options={{ title: 'Sign in' }} />
          <Stack.Screen name="auth/sign-up" options={{ title: 'Create account' }} />
          <Stack.Screen name="account" options={{ title: 'Account' }} />
          <Stack.Screen name="downloads" options={{ title: 'Downloads' }} />
          <Stack.Screen name="queue" options={{ title: 'Queue' }} />
          <Stack.Screen name="inbox" options={{ title: 'Inbox' }} />
          <Stack.Screen name="clip/new" options={{ title: 'New clip' }} />
          <Stack.Screen name="clip/[id]" options={{ title: 'Clip' }} />
          <Stack.Screen name="following" options={{ title: 'Following' }} />
          <Stack.Screen name="discover" options={{ title: 'Discover' }} />
          <Stack.Screen name="profile/[id]" options={{ title: 'Profile' }} />
          <Stack.Screen name="profile/[id]/followers" options={{ title: 'Followers' }} />
          <Stack.Screen name="profile/[id]/following" options={{ title: 'Following' }} />
        </Stack>
        <MiniBar />
      </SafeAreaView>
      </GraphProvider>
      </SocialProvider>
    </AppProviders>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
