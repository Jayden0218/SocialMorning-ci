// The genre chips on Discover, the way to hide one, and the Hidden row that brings hidden ones back.
/**
 * M31 T030 (design-pulse2 `home--fold-b`, `home--hidden-categories`). "Genres" is a cloud of chips —
 * each 36 tall, a pill, the genre's icon (16), its name, and a "×" (14) at the right edge that hides it.
 * "All ›" ends the cloud (it opens the first genre). Hidden genres are not in the cloud; with any hidden
 * the "Hidden" section lists them as dashed chips with a "+" (a tap shows the genre again) under the
 * "Explore more categories ›" link and the line "Tap a hidden genre to show it again."; with none the
 * link alone ends the page. The chips wrap (a row of them is 8 apart), left lane 28, right margin 16.
 */
import { useEffect } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, gutter, spacing } from '@/design';
import { useWindowDimensions } from 'react-native';
import { useStores } from '@/ui/shell/providers';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { GENRES } from '@/discover/genres';
import { listSize } from '@/config/store'; // M25 A7: how many genres Discover shows (default 8)
import { warmCategories } from '@/discover/category-cache';
import { visibleGenres } from '@/discover/hidden-categories';
import { useSocial } from '@/social/context';
import { DECK, DeckLink, DeckSection, PX, useEdge } from './Deck';

/** How long after Discover appears the category lists start loading. */
const WARM_AFTER_MS = 1500;
/** Drawn: a chip is 36 tall, 14 of padding at the left and 6 at the right of its ×, 8 between chips. */
const CHIP = { height: 36, left: 14, right: 6, gap: 8 } as const;
/** The × is 14 wide; with its slop it is touched 48 x 48 (36 + 12) without growing the chip. */
const HIDE_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

/** Genres — chips in a cloud; each opens that genre's top shows, its × hides it. */
export function CategoryStrip(props: { onGenre: (id: number) => void; onAll: () => void; /** M21: genre ids hidden with ×. */ hidden?: readonly number[]; onHide?: (id: number) => void }): React.ReactElement {
  const stores = useStores();
  const { api } = useSocial();
  const { width } = useWindowDimensions();
  const edge = useEdge('Explore by category', 'Genres');
  // Owner, 2026-10-04: the genres' lists (and first covers) load in the background once
  // Discover has drawn, so a tapped category opens full (src/discover/category-cache.ts).
  useEffect(() => {
    const t = setTimeout(() => warmCategories({ api, cache: stores.feedCache, now: () => Date.now() }, GENRES.slice(0, listSize('discoverCategories')).map((g) => g.id)), WARM_AFTER_MS);
    return () => clearTimeout(t);
  }, [api, stores]);
  return (
    <DeckSection {...edge}>
      <Box className="flex-row flex-wrap" style={{ marginLeft: DECK.lane, marginRight: gutter(width) - spacing.hair, gap: CHIP.gap }}>
        {visibleGenres(GENRES, props.hidden ?? [], listSize('discoverCategories')).map((g) => (
          <Box key={g.id} className="flex-row items-center bg-raise border border-line rounded-pill" style={{ height: CHIP.height, paddingLeft: CHIP.left, paddingRight: CHIP.right }}>
            <Pressable onPress={() => props.onGenre(g.id)} accessibilityRole="button" accessibilityLabel={g.name} hitSlop={{ top: 6, bottom: 6, left: 4, right: 0 }} className="flex-row items-center" style={{ gap: PX.six }}>
              <Icon name={g.icon} size={16} color={colour.text} />
              <Type step="caption" className="text-text font-semibold" numberOfLines={1}>{g.name}</Type>
            </Pressable>
            {props.onHide ? (
              <Pressable onPress={() => props.onHide?.(g.id)} accessibilityRole="button" accessibilityLabel={`Hide ${g.name}`} hitSlop={HIDE_SLOP} className="items-center justify-center" style={{ marginLeft: PX.two, padding: PX.two }}>
                <Icon name="close" size={14} color={colour.idle} />
              </Pressable>
            ) : null}
          </Box>
        ))}
        <Pressable onPress={props.onAll} accessibilityRole="link" accessibilityLabel="All" hitSlop={6} className="flex-row items-center bg-raise border border-line rounded-pill" style={{ height: CHIP.height, paddingHorizontal: CHIP.left }}>
          <Type step="caption" className="text-hotText font-semibold">All ›</Type>
        </Pressable>
      </Box>
    </DeckSection>
  );
}

/** With genres hidden, a Hidden section lists them, each tapped to show it again; the link ends the page either way. */
export function MoreCategories(props: { onPress: () => void; hidden?: readonly number[]; onShow?: (id: number) => void }): React.ReactElement {
  const hidden = GENRES.filter((g) => (props.hidden ?? []).includes(g.id));
  if (!props.onShow || hidden.length === 0) {
    return (
      <Box style={{ marginTop: PX.six }}>
        <DeckLink label="Explore more categories" onPress={props.onPress} />
      </Box>
    );
  }
  return (
    <DeckSection label="Hidden">
      <Box style={{ marginLeft: DECK.lane, gap: PX.ten }}>
        <Pressable onPress={props.onPress} accessibilityRole="link" accessibilityLabel="Explore more categories" hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }} className="self-start">
          <Type step="caption" className="text-hotText font-semibold">Explore more categories ›</Type>
        </Pressable>
        <Box className="flex-row flex-wrap" style={{ gap: CHIP.gap }}>
          {hidden.map((g) => (
            <Pressable
              key={g.id}
              onPress={() => props.onShow?.(g.id)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${g.name} again`}
              hitSlop={6}
              className="flex-row items-center border border-dashed border-switchOff rounded-pill"
              style={{ height: CHIP.height, paddingHorizontal: CHIP.left, gap: PX.six }}
            >
              <Icon name="add" size={16} color={colour.text2} />
              <Type step="caption" className="text-text2 font-semibold">{g.name}</Type>
            </Pressable>
          ))}
        </Box>
        <Type step="mono" className="text-text3">Tap a hidden genre to show it again.</Type>
      </Box>
    </DeckSection>
  );
}
