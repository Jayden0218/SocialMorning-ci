// One help article for show owners, in numbered sections.
/**
 * One academy article (M12 FR-103).
 *
 * M17 T078 (`AcademyLesson-B`): the Editorial article — the back row alone, then an accent
 * eyebrow ("Creator academy · 01"), the title as a large serif, the summary as a serif standfirst,
 * a hairline, and each section numbered in the accent beside a serif heading and its body.
 */
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { EmptyPicture } from '@/ui/me/parts';
import { useAcademy } from '@/config/content';
import { MarkdownBlocks } from '@/ui/content/Markdown';
import { PageHeader } from '@/ui/kit/PageHeader';

const CAPS = { letterSpacing: 1.3, textTransform: 'uppercase' as const };
const NUMBER = { width: 36 };

export default function ArticleScreen(): React.ReactElement {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  // M25 A8: the server's article (Admin › Content), else the bundled one; bodies drawn as text runs.
  const articles = useAcademy();
  const a = articles.find((x) => x.slug === String(slug));
  if (!a) return <><PageHeader title="Article" /><Box className="flex-1 bg-background"><EmptyPicture icon="document-text-outline" line="This article has moved" /></Box></>;
  const n = String(articles.findIndex((x) => x.slug === a.slug) + 1).padStart(2, '0');
  return (
    <>
    {/* The back row only: the page draws its own eyebrow above the title. */}
    <PageHeader middle={<Box />} />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-2 pb-24 gap-section">
      <Box className="gap-2">
        <Text className="text-accent text-micro font-bold" style={CAPS}>{`Creator academy · ${n}`}</Text>
        <Text className="text-text text-display font-display" accessibilityRole="header">{a.title}</Text>
        <Text className="text-muted text-base font-display-semibold">{a.summary}</Text>
      </Box>
      <Box className="border-b-hairline border-separator" />
      {a.sections.map((s, i) => (
        <Box key={`${i}-${s.heading}`} className="flex-row gap-2">
          <Text className="text-accent text-lg font-display" style={NUMBER}>{s.heading ? String(a.sections.slice(0, i + 1).filter((x) => x.heading).length) : ''}</Text>
          <Box className="flex-1 gap-1">
            {s.heading ? <Text className="text-text text-title font-display" accessibilityRole="header">{s.heading}</Text> : null}
            <MarkdownBlocks blocks={s.blocks} />
          </Box>
        </Box>
      ))}
    </ScrollView>
    </>
  );
}
