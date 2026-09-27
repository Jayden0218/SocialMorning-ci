/**
 * All categories (M10): Apple's top-level podcast genres; each opens that genre's top
 * shows. The list is on the phone (`src/discover/genres.ts`), so it draws offline.
 */
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { hit } from '../src/design';
import { GENRES } from '../src/discover/genres';
import { Screen } from '../src/ui/Screen';

const TAP = { minHeight: hit.min };

export default function CategoriesScreen(): React.ReactElement {
  const router = useRouter();
  return (
    <Screen scroll className="pt-section">
      <View className="flex-row flex-wrap gap-row">
        {GENRES.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => router.push({ pathname: '/category/[id]', params: { id: String(g.id) } })}
            accessibilityRole="button"
            accessibilityLabel={g.name}
            className="bg-surface rounded-row flex-row items-center gap-2 px-row"
            style={TAP}
          >
            <Text className="text-text text-sm">{g.emoji}</Text>
            <Text className="text-text text-sm font-semibold">{g.name}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
