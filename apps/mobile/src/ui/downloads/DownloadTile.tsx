// One download as a 1 x 2 mosaic tile: the cover, a progress ring or alert, the title, the state in mono.
/**
 * M31 W3-B (T041; design-pulse2 `downloads--screen`, `downloads--select-mode`; "Layout: Mosaic"). A tile is 178 tall
 * (two 84 rows and the 10 between), radius 22, the raise fill, 14 of padding: the cover (56) top left; top right the
 * 40 progress ring (running or paused), a green check ring (done) or a hot-text alert mark (failed); at the foot the
 * title (Geist 600 13, two lines) and the state in mono 11 — text3, or hot-text when it asks for attention — and,
 * on a failed tile, a quiet "Retry" pill (32 tall). Tap = the episode's page; long-press = the Remove / Cancel menu
 * (`onMenu`); in select mode the whole tile is a checkbox with a 24 tick at its foot (hot with a void check when
 * ticked).
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, radius } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import type { DownloadRow } from '@/storage/types';
import { DownloadRing } from './DownloadRing';
import { DOWNLOAD_TILE, downloadsType } from './measures';

export type TileKind = 'progress' | 'attention' | 'done';

/** Which of the page's three groups a row belongs to. */
export function kindOf(r: Pick<DownloadRow, 'state'>): TileKind {
  return r.state === 'complete' ? 'done' : r.state === 'failed' ? 'attention' : 'progress';
}

export function DownloadTile(props: {
  row: DownloadRow;
  title: string;
  art: string | undefined;
  artName: string;
  /** "Downloading · 42 %", "Failed · network lost", "Downloaded · 46 MB". */
  state: string;
  percent: number | undefined;
  width: number;
  /** Select mode: `chosen` is whether this tile is ticked. */
  select?: { chosen: boolean; onToggle: () => void };
  onOpen: () => void;
  onMenu: () => void;
  onRetry: () => void;
}): React.ReactElement {
  const kind = kindOf(props.row);
  const attention = kind === 'attention';
  const ring = kind === 'done' ? <DownloadRing state="done" /> : kind === 'progress' ? <DownloadRing state={props.row.state === 'paused' ? 'paused' : 'running'} percent={props.percent} /> : <Icon name="alert-circle-outline" size={22} color={colour.hotText} />;
  const face = (
    <>
      <Box className="flex-row justify-between items-start">
        <Artwork url={props.art} size={DOWNLOAD_TILE.cover} name={props.artName} />
        <Box accessible={false} importantForAccessibility="no-hide-descendants">{ring}</Box>
      </Box>
      <Box className="absolute" style={{ left: DOWNLOAD_TILE.pad, right: DOWNLOAD_TILE.pad, bottom: DOWNLOAD_TILE.foot + (attention && !props.select ? DOWNLOAD_TILE.retry + DOWNLOAD_TILE.retryGap : 0) }}>
        <Type step="compact" className="text-text" style={downloadsType.title} numberOfLines={2}>{props.title}</Type>
        <Type step="tag" className={attention ? 'text-hotText' : 'text-text3'} style={{ marginTop: 4 }} numberOfLines={2}>{props.state}</Type>
      </Box>
    </>
  );
  return (
    <Box testID="download-tile" className="bg-raise overflow-hidden" style={{ width: props.width, height: DOWNLOAD_TILE.height, borderRadius: radius.artworkLarge }}>
      {props.select ? (
        <Pressable onPress={props.select.onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: props.select.chosen }} accessibilityLabel={`Select ${props.title}`} className="flex-1" style={{ padding: DOWNLOAD_TILE.pad }}>
          {face}
          <Box className="absolute items-center justify-center rounded-pill" style={{ right: DOWNLOAD_TILE.foot, bottom: DOWNLOAD_TILE.foot, width: DOWNLOAD_TILE.tick, height: DOWNLOAD_TILE.tick, backgroundColor: props.select.chosen ? colour.hot : undefined, borderWidth: props.select.chosen ? 0 : 2, borderColor: colour.text }}>
            {props.select.chosen ? <Icon name="checkmark" size={14} color={colour.void} /> : null}
          </Box>
        </Pressable>
      ) : (
        <>
          <Pressable onPress={props.onOpen} onLongPress={props.onMenu} delayLongPress={350} accessibilityRole="button" accessibilityLabel={`Open ${props.title}, ${props.state}`} accessibilityHint="Long-press for Remove or Cancel" className="flex-1" style={{ padding: DOWNLOAD_TILE.pad }}>
            {face}
          </Pressable>
          {attention ? (
            <Pressable onPress={props.onRetry} accessibilityRole="button" accessibilityLabel="Retry" hitSlop={8} className="absolute items-center justify-center bg-raise2 rounded-pill" style={{ left: DOWNLOAD_TILE.pad, bottom: DOWNLOAD_TILE.foot, height: DOWNLOAD_TILE.retry, paddingHorizontal: DOWNLOAD_TILE.retryPad }}>
              <Type step="chip" className="text-text">Retry</Type>
            </Pressable>
          ) : null}
        </>
      )}
    </Box>
  );
}
