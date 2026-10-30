// How the three charts are ranked and how often they update, in plain words.
/**
 * M21 US7 (T084, FR-062, acceptance 5). The same rules as the server's
 * apps/api/src/db/repos/discover/explore.ts — if one changes, change the other.
 */
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card } from '@/ui/kit/Card';

const RULES: { title: string; lines: string[] }[] = [
  {
    title: 'Talked about',
    lines: [
      'Episodes ranked by what listeners here did with them in the last 7 days.',
      'A listener counts 3, a comment 2, a clip 2 and a reaction 1. Private listening is never counted.',
    ],
  },
  {
    title: 'New shows',
    lines: [
      'Shows whose first episode is the newest, newest first, each with its latest episode.',
      'We can only see episodes this app has met, so an older show we found late can look new for a while.',
    ],
  },
  {
    title: 'Rising',
    lines: [
      'Episodes whose listens and comments grew the most: the last 7 days minus the 7 days before.',
      'Only episodes that grew are on it.',
    ],
  },
];

export default function ChartRulesScreen(): React.ReactElement {
  return (
    <>
      <PageHeader title="How the charts work" />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-24 gap-row">
        {RULES.map((r) => (
          <Card key={r.title}>
            <Text className="text-text text-title font-display" accessibilityRole="header">{r.title}</Text>
            {r.lines.map((l) => <Text key={l} className="text-text text-body mt-gap">{l}</Text>)}
          </Card>
        ))}
        <Box className="mt-row">
          <Text className="text-text text-body font-bold">How often they update</Text>
          <Text className="text-muted text-body mt-1">Every chart is worked out again at most every 5 minutes. The time under each chart says when it last was.</Text>
          <Text className="text-muted text-body mt-gap">Shows you hid, and shows taken down, never appear on any chart.</Text>
        </Box>
      </ScrollView>
    </>
  );
}
