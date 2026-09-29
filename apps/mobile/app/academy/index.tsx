/** Creator academy (M12 FR-103): help for show owners, opened in the app. */
import { useRouter } from 'expo-router';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Pressable } from '../../src/ui/lib/pressable';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { size } from '../../src/design';
import { Icon } from '../../src/ui/Icon';
import { useColours } from '../../src/ui/useColours';
import { useStores } from '../../src/ui/providers';
import { ARTICLES } from '../../src/academy/articles';

const ROW = { minHeight: size.row };

export default function Academy(): React.ReactElement {
  const router = useRouter();
  const c = useColours(useStores().settings);
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-section pb-24">
      {ARTICLES.map((a, i) => (
        <Pressable key={a.slug} onPress={() => router.push({ pathname: '/academy/[slug]', params: { slug: a.slug } })} accessibilityRole="button" accessibilityLabel={`${a.title}. ${a.summary}`}
          className="flex-row items-center gap-row py-row border-b-hairline border-separator" style={ROW}>
          <Text className="text-accent text-base font-bold w-8">{String(i + 1).padStart(2, '0')}</Text>
          <Box className="flex-1">
            <Text className="text-text text-sm font-semibold">{a.title}</Text>
            <Text className="text-muted text-xs">{a.summary}</Text>
          </Box>
          <Icon name="chevron-forward" size={18} color={c.muted} />
        </Pressable>
      ))}
    </ScrollView>
  );
}
