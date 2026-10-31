// The player's More sheet: Clip, Share, Favourite, About, Transcript and Chapters as tiles, with the chapter list.
/**
 * M31 T024 (design-pulse2 `player--screen`, the right-hand phone): opened by the ··· circle. The kit
 * `Sheet` (an overlay, not a native modal, so the iOS share sheet can still open over it) at 62 %,
 * dragging to 92 %. The head is the episode — a 56 cover, the show in hot-text, the title in Unbounded
 * 700 16 — then a 2 × 3 mosaic of 84 tall tiles (raise, radius 20; the icon in hot-text top left, the
 * name 14 / 600 and a mono detail below):
 *     Clip (the last 30 seconds) · Share (this episode) · Add to favourites (light fill when on,
 *     "Remove from favourites") · About (this episode) · Transcript (Follows the audio; hot outline) ·
 *     Chapters (n chapters; light fill while the list is open).
 * Tiles that do not apply (no transcript, no chapters) are hidden, as the old page did. Chapters expands
 * the chapter list under the tiles. This is where Chapters and Transcript MOVED to: they were on the
 * Playback sheet (the drawing's action map; recorded in m31/moves.json).
 */
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { plural } from '@socialmorning/social-core';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { bars, hit } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { IconButton } from '@/ui/kit/PulseButton';
import { Sheet } from '@/ui/kit/Sheet';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { getPref } from '@/settings/prefs';
import { isFavourite, toggleFavourite } from '@/me/favourites';
import type { Extras } from '@/feeds/fetch-extras';
import type { CachedEpisode, CachedShow } from '@/storage/types';
import { sameClock, selectClock, usePlayer, usePlayerSelector } from '@/playback/store';
import { useStores } from '@/ui/shell/providers';
import { ChapterList } from './ChapterList';
import { PLAYER } from './measures';

/** How many chapter rows the sheet's first height has room for (the drawing's four). */
export const OPEN_CHAPTERS = 4;
/** The tallest the sheet drags to. */
const TALLEST = 0.92;

/**
 * The sheet's first height as a share of the window: what the drawing's content adds up to — grabber zone 8 + 5, the
 * title row 36, the head 56, the tiles (84 each, 10 apart, two a row), the chapter card when it is open (10 + a row
 * of 36 + 2 between each + 10) — 14 between each part and 44 at the foot. 647 for the drawn six tiles and four chapters.
 */
export function moreSheetFraction(windowHeight: number, tiles: number, chapterCount: number): number {
  // The drawing shows four chapters of the "6 chapters" tile and ends there: the sheet opens that tall and the list scrolls
  // (drag the sheet up for more), so an episode with thirty chapters opens at the same height as one with four.
  const chapters = Math.min(chapterCount, OPEN_CHAPTERS);
  const rows = Math.ceil(tiles / 2);
  const grid = rows * PLAYER.tileHeight + (rows - 1) * PLAYER.tileGap;
  const list = chapters > 0 ? bars.sheetGap + PLAYER.chapterPadY * 2 + chapters * PLAYER.chapterRow + (chapters - 1) * PLAYER.chapterRowGap : 0;
  const total = PLAYER.sheetTop + bars.dot + bars.sheetGap + bars.sheetClose + bars.sheetGap + PLAYER.headCover + bars.sheetGap + grid + list + PLAYER.sheetFoot;
  return Math.min(TALLEST, total / windowHeight);
}

/** One tile of the mosaic: icon, name, detail. `on` fills it light; `outlined` rings it hot (Transcript when there is one). */
function MoreTile(props: { icon: IconName; label: string; detail?: string; on?: boolean; outlined?: boolean; accessibilityLabel?: string; accessibilityState?: { selected?: boolean; expanded?: boolean }; onPress: () => void }): React.ReactElement {
  const c = useColours();
  const on = props.on === true;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      {...(props.accessibilityState ? { accessibilityState: props.accessibilityState } : {})}
      className={`justify-between ${on ? 'bg-text' : 'bg-raise'}`}
      style={{ width: '48.5%', height: PLAYER.tileHeight, borderRadius: PLAYER.panelRadius, paddingVertical: PLAYER.tilePadY, paddingHorizontal: PLAYER.tilePadX, borderWidth: props.outlined && !on ? PLAYER.tileOutline : 0, borderColor: c.hot }}
    >
      <Icon name={props.icon} size={PLAYER.tileIcon} color={on ? c.void : c.hotText} />
      <Box>
        <Type step="compact" className={on ? 'text-void' : 'text-text'}>{props.label}</Type>
        {props.detail ? <Type step="mono" className={on ? 'text-void' : 'text-text3'} style={{ fontSize: PLAYER.tileDetail, lineHeight: PLAYER.tileDetailLine, ...(on ? { color: PLAYER.tileOnDetail } : null) }}>{props.detail}</Type> : null}
      </Box>
    </Pressable>
  );
}

/** The chapter list under the tiles, following the audio. */
function LiveChapters(props: { chapters: NonNullable<Extras['chapters']> }): React.ReactElement {
  const player = usePlayer();
  const clock = usePlayerSelector(selectClock, sameClock);
  return <ChapterList chapters={props.chapters} positionMs={clock.positionMs} {...(clock.durationMs !== undefined ? { durationMs: clock.durationMs } : {})} onSeek={(ms) => player.seek(ms)} />;
}

export function PlayerMoreSheet(props: {
  open: boolean;
  onClose: () => void;
  episodeId: string;
  episode: CachedEpisode | undefined;
  show: CachedShow | undefined;
  extras: Extras | undefined;
  onClip: () => void;
  onShare: () => void;
  onTranscript: () => void;
}): React.ReactElement | null {
  const stores = useStores();
  // The drawn state: the Chapters tile is on and the list is open under the tiles.
  const [chaptersFolded, setChaptersFolded] = useState(false);
  const [, setTick] = useState(0);
  const screen = useWindowDimensions();
  const { extras, episode, show } = props;
  const favourite = isFavourite(stores.settings, props.episodeId);
  // M10b US4 (FR-015): "Show transcript entry" off → no transcript tile.
  const showTranscript = getPref(stores.settings, 'transcriptEntry') && extras?.transcript !== undefined;
  const chapters = extras?.chapters && extras.chapters.length > 0 ? extras.chapters : undefined;
  const chaptersOpen = chapters !== undefined && !chaptersFolded;
  const tiles = 4 + (showTranscript ? 1 : 0) + (chapters ? 1 : 0);
  const snaps = [moreSheetFraction(screen.height, tiles, chaptersOpen ? chapters.length : 0), TALLEST] as const;
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      label="More"
      snapPoints={snaps}
      header={
        <Box className="px-screen-x" style={{ gap: bars.sheetGap, paddingBottom: bars.sheetGap }}>
          <Box className="flex-row items-center justify-between">
            <Type step="heading" className="text-text flex-1" accessibilityRole="header">More</Type>
            <IconButton icon="close" label="Close" onPress={props.onClose} fill size={PLAYER.panelIconGlyph} diameter={bars.sheetClose} />
          </Box>
          <Box testID="more-head" className="flex-row items-center gap-row">
            <Artwork url={episode?.imageUrl ?? show?.imageUrl} size={PLAYER.headCover} name={show?.title} />
            <Box className="flex-1">
              <Type step="caption" className="text-hotText font-semibold" style={{ fontSize: PLAYER.headShow }} numberOfLines={1}>{show?.title ?? ''}</Type>
              <Type step="lede" className="text-text" style={{ fontSize: PLAYER.headTitle, lineHeight: PLAYER.headTitleLine }} numberOfLines={2} accessibilityRole="header">{episode?.title ?? 'Now playing'}</Type>
            </Box>
          </Box>
        </Box>
      }
    >
      <ScrollView contentContainerClassName="px-screen-x" contentContainerStyle={{ gap: bars.sheetGap }} style={{ paddingBottom: PLAYER.sheetFoot }} showsVerticalScrollIndicator={false}>
        <Box testID="more-tiles" className="flex-row flex-wrap justify-between" style={{ rowGap: PLAYER.tileGap }}>
          <MoreTile icon="cut-outline" label="Clip" detail="the last 30 seconds" accessibilityLabel="Clip the last 30 seconds" onPress={props.onClip} />
          <MoreTile icon="share-outline" label="Share" detail="this episode" accessibilityLabel="Share this episode" onPress={props.onShare} />
          <MoreTile
            icon={favourite ? 'star' : 'star-outline'}
            label={favourite ? 'Remove from favourites' : 'Add to favourites'}
            on={favourite}
            accessibilityState={{ selected: favourite }}
            onPress={() => { toggleFavourite(stores.settings, props.episodeId, Date.now()); setTick((n) => n + 1); }}
          />
          <MoreTile icon="information-circle-outline" label="About" detail="this episode" accessibilityLabel="About this episode" onPress={() => { props.onClose(); router.push({ pathname: '/episode/[id]', params: { id: props.episodeId } }); }} />
          {showTranscript ? <MoreTile icon="document-text-outline" label="Transcript" detail="Follows the audio" outlined onPress={props.onTranscript} /> : null}
          {chapters ? (
            <MoreTile icon="list" label="Chapters" detail={plural(chapters.length, 'chapter')} on={chaptersOpen} accessibilityLabel={`Chapters (${chapters.length})`} accessibilityState={{ expanded: chaptersOpen }} onPress={() => setChaptersFolded((v) => !v)} />
          ) : null}
        </Box>
        {extras?.error ? <Type step="caption" className="text-text3">{`Couldn't load ${extras.error.includes('chapters') ? 'chapters' : 'the transcript'}`}</Type> : null}
        {chapters && chaptersOpen ? <LiveChapters chapters={chapters} /> : null}
        <Box style={{ height: hit.min }} />
      </ScrollView>
    </Sheet>
  );
}
