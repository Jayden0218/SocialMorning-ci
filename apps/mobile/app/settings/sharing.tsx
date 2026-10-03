/**
 * Third-party sharing list (第三方信息共享清单, M10): every outside party that receives
 * something because you use SocialNet — written from what the app and server actually
 * call. No advertising or analytics SDK is in the app.
 *
 * M17 T095 (`SettingsSharing-B`): the "no advertising" sentence leads as a serif statement;
 * the parties are a numbered list (serif accent numbers, hairlines between) with "Shared" and
 * "Why" side by side under each name. Same parties, same words, same spoken labels.
 */
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { PageHeader } from '../../src/ui/PageHeader';

const PARTIES: { name: string; who: string; what: string; why: string }[] = [
  { name: 'Podcast publishers', who: 'Each show’s own feed and audio host', what: 'Your IP address and app name, when a feed or episode is fetched', why: 'To play and download episodes — SocialNet never hosts audio' },
  { name: 'Apple Podcasts directory', who: 'Apple Inc. (iTunes Search API)', what: 'Your search terms and the charts requested, sent by our server (not your phone)', why: 'Search, charts and categories' },
  { name: 'Vercel', who: 'Vercel Inc.', what: 'Requests to the SocialNet server (IP address, the request)', why: 'Runs the SocialNet server' },
  { name: 'Neon', who: 'Neon Inc. (Singapore region)', what: 'Your account, comments, follows, subscriptions and listening stats', why: 'Stores SocialNet’s database' },
  { name: 'Google (Gmail)', who: 'Google LLC', what: 'Your email address and the sign-in code sent to it', why: 'Emailing your one-time sign-in code' },
];

/** The small capitals over "Shared" and "Why" (decoration: the row speaks as one label). */
const CAPS = { letterSpacing: 1.1, textTransform: 'uppercase' as const };

export default function SharingScreen(): React.ReactElement {
  return (
    <>
    <PageHeader title="Third-party sharing" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section">
      <Text className="text-text text-lg font-display">No advertising or analytics companies receive anything from SocialNet.</Text>
      <Text className="text-muted text-meta mt-gap mb-section">{`The ${PARTIES.length} parties that do, and why:`}</Text>
      {PARTIES.map((p, i) => (
        <Box key={p.name} className="flex-row gap-row border-t-hairline border-separator py-section" accessible accessibilityLabel={`${p.name}. ${p.who}. Shared: ${p.what}. Why: ${p.why}`}>
          <Text className="text-accent text-base font-display w-6">{String(i + 1)}</Text>
          <Box className="flex-1 gap-gap">
            <Text className="text-muted text-meta">
              <Text className="text-text text-sm font-bold">{p.name}</Text>
              {` · ${p.who}`}
            </Text>
            <Box className="flex-row gap-row">
              <Box className="flex-1 gap-0.5">
                <Text className="text-text text-micro font-bold" style={CAPS}>Shared</Text>
                <Text className="text-muted text-meta">{p.what}</Text>
              </Box>
              <Box className="flex-1 gap-0.5">
                <Text className="text-text text-micro font-bold" style={CAPS}>Why</Text>
                <Text className="text-muted text-meta">{p.why}</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      ))}
    </ScrollView>
    </>
  );
}
