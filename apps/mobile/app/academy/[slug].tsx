/** One academy article (M12 FR-103). */
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { EmptyPicture } from '../../src/ui/me/parts';
import { articleBySlug } from '../../src/academy/articles';
import { PageHeader } from '../../src/ui/PageHeader';

export default function ArticleScreen(): React.ReactElement {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const a = articleBySlug(String(slug));
  if (!a) return <><PageHeader title="Article" /><Box className="flex-1 bg-background"><EmptyPicture icon="document-text-outline" line="This article has moved" /></Box></>;
  return (
    <>
    <PageHeader title={a.title} />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-section pb-24 gap-section">
      <Text className="text-text text-xl font-bold" accessibilityRole="header">{a.title}</Text>
      <Text className="text-muted text-sm">{a.summary}</Text>
      {a.sections.map((s) => (
        <Box key={s.heading} className="gap-1">
          <Text className="text-text text-base font-semibold" accessibilityRole="header">{s.heading}</Text>
          <Text selectable className="text-text text-sm leading-[21px]">{s.body}</Text>
        </Box>
      ))}
    </ScrollView>
    </>
  );
}
