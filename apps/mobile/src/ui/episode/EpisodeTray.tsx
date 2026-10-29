// The Episode page's tray: Add to queue, Comments, Like, Share and More in one raised bar.
/**
 * M31 W3-A (T040; design-pulse2 `epTray`, the same bar as the player's): 60 tall, raise fill, radius 22, 12 in from each
 * side, 40 up; five items spread with `space-around`, glyphs 22 in the text colour at 85 %, each with a 48 tap area
 * (`hitSlop`). In order: Add to queue (the queue glyph), Comments + the count in mono 12, Like (the heart; filled hot when
 * liked, the name flips with it — never colour alone; the first like opens the Like sheet), Share, More (···: play
 * next, download, save a moment, favourite …). Favourite moved to the More sheet (the drawing's action map).
 */
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { hit } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { TRAY } from './measures';

const GLYPH = { height: TRAY.trayIcon };
const COMMENTS = { height: TRAY.trayIcon, gap: TRAY.trayCountGap };
const PAD = (hit.min - TRAY.trayIcon) / 2;
const SLOP = { top: PAD, bottom: PAD, left: PAD, right: PAD };

export function EpisodeTray(props: {
  commentCount: number;
  liked: boolean;
  onQueue: () => void;
  onComments: () => void;
  onLike: () => void;
  onShare: () => void;
  onMore: () => void;
}): React.ReactElement {
  const c = useColours();
  const ink = TRAY.trayInk;
  return (
    <Box testID="episode-tray" className="flex-row items-center justify-around bg-raise rounded-artwork-lg" style={{ height: TRAY.tray }}>
      <Pressable onPress={props.onQueue} accessibilityRole="button" accessibilityLabel="Add to queue" hitSlop={SLOP} className="items-center justify-center" style={GLYPH}>
        <Icon name="list-outline" size={TRAY.trayIcon} color={ink} />
      </Pressable>
      <Pressable onPress={props.onComments} accessibilityRole="button" accessibilityLabel={`Comments, ${props.commentCount}`} hitSlop={SLOP} className="flex-row items-center justify-center" style={COMMENTS}>
        <Icon name="chatbox-outline" size={TRAY.trayIcon} color={ink} />
        <Type step="mono" className="text-text" style={{ color: ink }}>{String(props.commentCount)}</Type>
      </Pressable>
      <Pressable onPress={props.onLike} accessibilityRole="button" accessibilityLabel={props.liked ? 'Unlike this episode' : 'Like this episode'} accessibilityState={{ selected: props.liked }} hitSlop={SLOP} className="items-center justify-center" style={GLYPH}>
        <Icon name={props.liked ? 'heart' : 'heart-outline'} size={TRAY.trayIcon} color={props.liked ? c.hot : ink} />
      </Pressable>
      <Pressable onPress={props.onShare} accessibilityRole="button" accessibilityLabel="Share this episode" hitSlop={SLOP} className="items-center justify-center" style={GLYPH}>
        <Icon name="share-outline" size={TRAY.trayIcon} color={ink} />
      </Pressable>
      <Pressable onPress={props.onMore} accessibilityRole="button" accessibilityLabel="More: play next, download, save a moment" hitSlop={SLOP} className="items-center justify-center" style={GLYPH}>
        <Icon name="ellipsis-horizontal" size={TRAY.trayIcon} color={ink} />
      </Pressable>
    </Box>
  );
}
