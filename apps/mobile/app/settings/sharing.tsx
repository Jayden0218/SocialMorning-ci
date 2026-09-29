/**
 * Third-party sharing list (第三方信息共享清单, M10): every outside party that receives
 * something because you use SocialNet — written from what the app and server actually
 * call. No advertising or analytics SDK is in the app.
 */
import { Stack } from 'expo-router';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';

const PARTIES: { name: string; who: string; what: string; why: string }[] = [
  { name: 'Podcast publishers', who: 'Each show’s own feed and audio host', what: 'Your IP address and app name, when a feed or episode is fetched', why: 'To play and download episodes — SocialNet never hosts audio' },
  { name: 'Apple Podcasts directory', who: 'Apple Inc. (iTunes Search API)', what: 'Your search terms and the charts requested, sent by our server (not your phone)', why: 'Search, charts and categories' },
  { name: 'Vercel', who: 'Vercel Inc.', what: 'Requests to the SocialNet server (IP address, the request)', why: 'Runs the SocialNet server' },
  { name: 'Neon', who: 'Neon Inc. (Singapore region)', what: 'Your account, comments, follows, subscriptions and listening stats', why: 'Stores SocialNet’s database' },
  { name: 'Google (Gmail)', who: 'Google LLC', what: 'Your email address and the sign-in code sent to it', why: 'Emailing your one-time sign-in code' },
];

export default function SharingScreen(): React.ReactElement {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-section gap-row">
      <Stack.Screen options={{ title: 'Third-party sharing' }} />
      <Text className="text-muted text-sm mb-row">No advertising or analytics companies receive anything from SocialNet.</Text>
      {PARTIES.map((p) => (
        <Box key={p.name} className="bg-surface rounded-artwork p-section gap-1" accessible accessibilityLabel={`${p.name}. ${p.who}. Shared: ${p.what}. Why: ${p.why}`}>
          <Text className="text-text text-sm font-bold">{p.name}</Text>
          <Text className="text-muted text-xs">{p.who}</Text>
          <Text className="text-muted text-xs mt-1">Shared: {p.what}</Text>
          <Text className="text-muted text-xs">Why: {p.why}</Text>
        </Box>
      ))}
    </ScrollView>
  );
}
