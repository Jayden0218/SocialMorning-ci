// Every podcast category as a two-column grid of cards.
/**
 * All categories (M10): Apple's top-level podcast genres; each opens that genre's top
 * shows. The list is on the phone (`src/discover/genres.ts`), so it draws offline.
 *
 * M17 T057 (`Categories-B`): a two-column grid of white cards — the genre's icon in a tinted
 * rounded tile at the top, its name as a serif label at the bottom. The design's per-genre
 * pastel tiles are one token tint here (the palette has no per-genre colours). Same genres,
 * same names, same destination.
 */
import { useRouter } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { Icon } from '@/ui/kit/Icon';
import { GENRES, type Genre } from '@/discover/genres';
import { useAppConfig } from '@/config/store';
import { Screen } from '@/ui/kit/Screen';
import { PageHeader } from '@/ui/kit/PageHeader';

/** A card is at least 96 pt high (`Categories-B`) — well over the 48 pt tap floor. */
const CARD = { minHeight: Math.max(96, hit.min) };

/** The genres two to a row. M25 A7: worked out when drawn, so the admin's order, names and hides apply. */
function pairs(): Genre[][] {
  const rows: Genre[][] = [];
  for (let i = 0; i < GENRES.length; i += 2) rows.push(GENRES.slice(i, i + 2));
  return rows;
}

export default function CategoriesScreen(): React.ReactElement {
  useAppConfig();
  const ROWS = pairs();
  const stores = useStores();
  const c = useColours(stores.settings);
  const router = useRouter();
  return (
    <>
    <PageHeader title="Categories" />
    <Screen scroll>
      <Box className="gap-2.5">
        {ROWS.map((pair) => (
          <Box key={pair.map((g) => g.id).join('-')} className="flex-row gap-2.5">
            {pair.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => router.push({ pathname: '/category/[id]', params: { id: String(g.id) } })}
                accessibilityRole="button"
                accessibilityLabel={g.name}
                className="flex-1 bg-surface border border-border rounded-row p-row justify-between"
                style={CARD}
              >
                <Box className="w-10 h-10 rounded-row bg-accentTint items-center justify-center">
                  <Icon name={g.icon} size={20} color={c.text} />
                </Box>
                <Text className="text-text text-sm font-display-semibold mt-row" numberOfLines={2}>{g.name}</Text>
              </Pressable>
            ))}
            {pair.length === 1 ? <Box className="flex-1" /> : null}
          </Box>
        ))}
      </Box>
    </Screen>
    </>
  );
}
