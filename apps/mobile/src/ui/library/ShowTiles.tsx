// The tiles of My subscriptions: a starred show (1 x 2 cover), a show (2 x 1 row) and a cover in the grid.
/**
 * M31 D-A (T031; design-pulse2 `listen.html#subscriptions--screen`, `--grid`; layout pattern Mosaic). Measures are `SUBS` / `LIB_TYPE`:
 *
 *  - `StarredTile`: the cover fills a 1 x 2 tile (178 tall, radius 22) with a fade to void at the foot; at the foot the warn star (14), the
 *    title in Unbounded 700 17 and "Starred" in 11 (the drawing's "Starred · 2 new": the count of new episodes is not in the app).
 *  - `ShowTile`: a 2 x 1 raise tile (84, radius 22, padding 12): the cover 56 (radius 14), the title Geist 600 14, "Updated 2d ago" in mono 11 text3,
 *    and the ··· (More for …, 48 touched) at the end. A press opens the show; a long press opens the same menu as ···.
 *  - `GridTile`: a square cover (radius 18) with the warn star at the top left (starred); a long press opens the menu.
 * The spoken names are the ones the rows always had ("<title>, starred. Newest: …", "More for <title>").
 */
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { colour } from '@/design';
import { ArtTile } from '@/ui/me/lists';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { ME_TYPE } from '@/ui/me/measures';
import { PAGE_TYPE } from '@/ui/discover/measures';
import { Cover } from './parts';
import { LIB_TYPE, SUBS } from './measures';

export type ShowTileRow = { feedUrl: string; title: string; imageUrl?: string | undefined; starred: boolean };

export function StarredTile(props: { item: ShowTileRow; width: number; /** The spoken name. */ label: string; onOpen: () => void; onMenu: () => void }): React.ReactElement {
  const { item } = props;
  return (
    <Pressable onPress={props.onOpen} onLongPress={props.onMenu} accessibilityRole="button" accessibilityLabel={props.label}>
      <ArtTile url={item.imageUrl} name={item.title} width={props.width} height={SUBS.starredHeight} testID="starred-tile">
        <Icon name="star" size={SUBS.grid.star} color={colour.warn} />
        <Type step="lede" className="text-text font-bold" style={PAGE_TYPE.tile17} numberOfLines={3}>{item.title}</Type>
        <Type step="caption" className="text-quote" style={ME_TYPE.show11}>Starred</Type>
      </ArtTile>
    </Pressable>
  );
}

export function ShowTile(props: { item: ShowTileRow; /** "Updated 2d ago" / "No episodes yet", with any note. */ line: string; label: string; onOpen: () => void; onMenu: () => void }): React.ReactElement {
  const { item } = props;
  return (
    <Box testID="show-tile" className="flex-row items-center bg-raise" style={{ height: ME_MOSAIC.row, borderRadius: ME_MOSAIC.radius, paddingHorizontal: SUBS.tilePad, gap: SUBS.tilePad }}>
      <Pressable onPress={props.onOpen} onLongPress={props.onMenu} accessibilityRole="button" accessibilityLabel={props.label} className="flex-1 flex-row items-center" style={{ gap: SUBS.tilePad }}>
        <Cover url={item.imageUrl} name={item.title} size={SUBS.cover} radius={SUBS.coverRadius} />
        <Box className="flex-1 min-w-0">
          <Type step="compact" className="text-text" style={LIB_TYPE.tile14} numberOfLines={2}>{item.title}</Type>
          <Type step="tag" className="text-text3" style={{ ...LIB_TYPE.mono11, marginTop: 4 }} numberOfLines={1}>{props.line}</Type>
        </Box>
      </Pressable>
      <Pressable onPress={props.onMenu} accessibilityRole="button" accessibilityLabel={`More for ${item.title}`} hitSlop={SUBS.tilePad} className="items-center justify-center" style={{ width: SUBS.more + 2 * SUBS.tilePad, height: 48 }}>
        <Icon name="ellipsis-horizontal" size={SUBS.more} color={colour.text2} />
      </Pressable>
    </Box>
  );
}

export function GridTile(props: { item: ShowTileRow; size: number; label: string; onOpen: () => void; onMenu: () => void }): React.ReactElement {
  const { item } = props;
  return (
    <Pressable onPress={props.onOpen} onLongPress={props.onMenu} accessibilityRole="button" accessibilityLabel={props.label} testID="grid-tile">
      <Cover url={item.imageUrl} name={item.title} size={props.size} radius={SUBS.grid.radius} />
      {item.starred ? (
        <Box className="absolute" style={{ left: SUBS.grid.starInset, top: SUBS.grid.starInset }} accessible={false} importantForAccessibility="no-hide-descendants">
          <Icon name="star" size={SUBS.grid.star} color={colour.warn} />
        </Box>
      ) : null}
    </Pressable>
  );
}
