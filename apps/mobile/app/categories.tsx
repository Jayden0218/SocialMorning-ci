/**
 * All categories (M10): Apple's top-level podcast genres; each opens that genre's top
 * shows. The list is on the phone (`src/discover/genres.ts`), so it draws offline.
 */
import { useRouter } from 'expo-router';
import { Pressable } from '../src/ui/lib/pressable';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { colour, hit } from '../src/design';
import { useStores } from '../src/ui/providers';
import { useColours } from '../src/ui/useColours';
import { Icon } from '../src/ui/Icon';
import { GENRES } from '../src/discover/genres';
import { Screen } from '../src/ui/Screen';
import { PageHeader } from '../src/ui/PageHeader';

const TAP = { minHeight: hit.min };

export default function CategoriesScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const router = useRouter();
  return (
    <>
    <PageHeader title="Categories" />
    <Screen scroll className="pt-section">
      <Box className="flex-row flex-wrap gap-row">
        {GENRES.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => router.push({ pathname: '/category/[id]', params: { id: String(g.id) } })}
            accessibilityRole="button"
            accessibilityLabel={g.name}
            className="bg-surface rounded-row flex-row items-center gap-2 px-row"
            style={TAP}
          >
            <Icon name={g.icon} size={20} color={c.text} />
            <Text className="text-text text-sm font-semibold">{g.name}</Text>
          </Pressable>
        ))}
      </Box>
    </Screen>
    </>
  );
}
