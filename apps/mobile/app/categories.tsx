// Every podcast category as a Mosaic of tiles of different sizes.
/**
 * All categories (M10): Apple's top-level podcast genres; each opens that genre's top
 * shows. The list is on the phone (`src/discover/genres.ts`), so it draws offline.
 *
 * M31 W5-D (T064; design-pulse2 `discover.html` `categories--screen`, layout pattern Mosaic): a pushed page, the title bar low
 * ("Categories", "19 genres"), the genres as a Mosaic (two columns in the 28 lane, rows 84, 10 apart, tiles radius 22): the sizes
 * vary by place so the wall reads — every fifth tile is two columns wide, every third two rows tall — and each has a cover-coloured
 * square in its corner (110 on the tall ones, 60 on the rest), the genre's icon (24) and its name in Unbounded 700 (17 on a tall
 * tile, 13 on the rest). A tile opens `/category/[id]` on that genre. Same genres, same names, same destination.
 *
 * Spec 039 (Feed lane, design B): a `FeedScroll`; the genres are equal tiles in the `TileGrid` (two columns on the 20 gutter, 12 apart, radius `radius.card`), no tall or
 * wide places; each keeps the cover-coloured corner square (60), the icon (24) and the name. Same genres, names and destination.
 *
 * Not as drawn: the corner square is the genre name's own cover colour (the drawing's are sample gradients); the icons are the
 * Ionicons the genres already carry.
 */
import { useRouter } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, radius } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { TileGrid } from '@/ui/kit/layout';
import { FeedScroll } from '@/ui/feed/FeedPage';
import { FIXED_TYPE, Type } from '@/ui/kit/Type';
import { GENRES } from '@/discover/genres';
import { useAppConfig } from '@/config/store';
import { CornerSquare } from '@/ui/discover/Mosaic';
import { PAGE, PAGE_TYPE } from '@/ui/discover/measures';
import { ME_MOSAIC } from '@/ui/me/mosaic';

export default function CategoriesScreen(): React.ReactElement {
  useAppConfig();
  const router = useRouter();
  return (
    <FeedScroll title="Categories" subtitle={`${GENRES.length} genres`}>
      <TileGrid>
        {GENRES.map((g) => (
          <Box key={g.id} testID="genre-tile" className="overflow-hidden bg-raise" style={{ minHeight: ME_MOSAIC.row + PAGE.pad * 2, borderRadius: radius.card }}>
            <Pressable
              onPress={() => router.push({ pathname: '/category/[id]', params: { id: String(g.id) } })}
              accessibilityRole="button"
              accessibilityLabel={g.name}
              className="flex-1"
              style={{ padding: PAGE.pad }}
            >
              <CornerSquare name={g.name} size={60} />
              <Icon name={g.icon} size={24} color={colour.text} />
              <Type step="lede" className="text-text" style={{ ...PAGE_TYPE.tile13, marginTop: PAGE.gap - 2, zIndex: 2 }} numberOfLines={2} maxFontSizeMultiplier={FIXED_TYPE}>{g.name}</Type>
            </Pressable>
          </Box>
        ))}
      </TileGrid>
    </FeedScroll>
  );
}
