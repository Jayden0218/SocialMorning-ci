/**
 * Creator academy (M12 FR-103): help for show owners, opened in the app.
 *
 * M17 T077 (`Academy-B`): the Editorial page — the first article as a yellow "Start here" card
 * with a large number behind it, the rest as white cards two to a row, each with its number in a
 * tinted badge, a serif title and the summary. Every article still opens `/academy/[slug]`.
 */
import { useRouter } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit, spacing } from '@/design';
import { ARTICLES } from '@/settings/academy';
import { PageHeader } from '@/ui/kit/PageHeader';

const CAPS = { letterSpacing: 1.3, textTransform: 'uppercase' as const };
const GHOST = { fontSize: 112, lineHeight: 112, right: -6, top: -10 };
const TAP = { minHeight: hit.min };

export default function Academy(): React.ReactElement {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const half = { minHeight: hit.min, width: Math.floor((width - spacing.screenX * 2 - spacing.row) / 2) };
  return (
    <>
    <PageHeader title="Creator academy" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-row pb-24 flex-row flex-wrap gap-row">
      {ARTICLES.map((a, i) => {
        const n = String(i + 1).padStart(2, '0');
        const lead = i === 0;
        return (
          <Pressable key={a.slug} onPress={() => router.push({ pathname: '/academy/[slug]', params: { slug: a.slug } })} accessibilityRole="button" accessibilityLabel={`${a.title}. ${a.summary}`}
            className={lead ? 'w-full bg-primary rounded-row p-section gap-2 overflow-hidden' : 'bg-surface border border-border rounded-row p-section gap-2'} style={lead ? TAP : half}>
            {lead ? (
              <>
                <Text className="absolute text-onPrimary font-display opacity-10" style={GHOST} accessible={false} importantForAccessibility="no">{n}</Text>
                <Text className="text-onPrimary text-micro font-bold" style={CAPS}>{`Start here · ${n}`}</Text>
                <Text className="text-onPrimary text-lg font-display">{a.title}</Text>
                <Text className="text-onPrimary text-body">{a.summary}</Text>
              </>
            ) : (
              <>
                <Box className="self-start bg-accentTint rounded-row px-2 py-1">
                  <Text className="text-text text-sm font-display">{n}</Text>
                </Box>
                <Text className="text-text text-title font-display">{a.title}</Text>
                <Text className="text-muted text-meta">{a.summary}</Text>
              </>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
    </>
  );
}
