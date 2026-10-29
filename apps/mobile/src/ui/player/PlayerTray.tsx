// The player's tray: Comments (with the count), React, Clip, Playlist and Share in one raised bar.
/**
 * Round 2: the five items are as wide as their glyphs (22; Comments 22 + 6 + the count) and spread with the drawing's
 * `space-around`, so they sit where it puts them; each still has a 48 tap area (`hitSlop`). The ink is the drawing's
 * white at 85 % (`player.trayInk`) for the icons and the count; the Comments bubble is the drawing's rectangle with
 * a tail (`chatbox-outline`).
 *
 * M31 T024 (design-pulse2 `player--screen`): a 60 tall raise bar, radius 22, 12 from each edge, five
 * 48 pt targets spread evenly with 22 pt icons — Comments + the count in mono 12, React (the
 * heart fills hot when reacted, and the name flips with it: never colour alone), Clip the last
 * 30 seconds (scissors), Playlist (opens the one queue sheet) and Share. It stays at the end of an
 * episode, so you can still comment, react, clip or share the finished one.
 *
 * It reads the comment count and whether this moment is reacted; neither changes per TICK.
 */
import { router } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { hit } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { useQueueSheet } from '@/ui/queue/QueueSheetHost';
import { useSocial } from '@/social/context';
import { PLAYER } from './measures';
import { useClip, useOpenComments } from './useClipAndComments';
import { useReaction } from './useReaction';

/** Each item is its glyph's size; the finger gets 48 × 48 round it. */
const GLYPH = { height: PLAYER.trayIcon };
const COMMENTS = { height: PLAYER.trayIcon, gap: PLAYER.trayCountGap };
const SLOP = { top: (hit.min - PLAYER.trayIcon) / 2, bottom: (hit.min - PLAYER.trayIcon) / 2, left: (hit.min - PLAYER.trayIcon) / 2, right: (hit.min - PLAYER.trayIcon) / 2 };

export function PlayerTray(props: { episodeId: string; onShare: () => void }): React.ReactElement {
  const c = useColours();
  const queueSheet = useQueueSheet();
  const { useEpisodeSocial, listener } = useSocial();
  const { cached } = useEpisodeSocial(props.episodeId);
  const { reacted, toggle } = useReaction(props.episodeId);
  const clip = useClip(props.episodeId);
  const openComments = useOpenComments(props.episodeId);
  const commentCount = (cached?.social.comments ?? []).reduce((n, cm) => n + (cm.deleted ? 0 : 1) + (cm.replies ?? []).filter((r) => !r.deleted).length, 0);
  const idle = PLAYER.trayInk;
  return (
    <Box testID="player-tray" className="flex-row items-center justify-around bg-raise rounded-artwork-lg" style={{ height: PLAYER.tray }}>
      <Pressable onPress={openComments} accessibilityRole="button" accessibilityLabel={`Comments, ${commentCount}`} hitSlop={SLOP} className="flex-row items-center justify-center" style={COMMENTS}>
        <Icon name="chatbox-outline" size={PLAYER.trayIcon} color={idle} />
        <Type step="mono" className="text-text" style={{ color: idle }}>{String(commentCount)}</Type>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={reacted ? 'Remove your reaction here' : 'React at this moment'}
        accessibilityState={{ selected: reacted }}
        hitSlop={SLOP}
        className="items-center justify-center"
        style={GLYPH}
        onPress={() => { if (!listener) { router.push('/auth/sign-in'); return; } toggle(); }}
      >
        {/* Filled vs outline, and the name — never hue alone (FR-016). */}
        <Icon name={reacted ? 'heart' : 'heart-outline'} size={PLAYER.trayIcon} color={reacted ? c.hot : idle} />
      </Pressable>
      <Pressable onPress={clip} accessibilityRole="button" accessibilityLabel="Clip the last 30 seconds" hitSlop={SLOP} className="items-center justify-center" style={GLYPH}>
        <Icon name="cut-outline" size={PLAYER.trayIcon} color={idle} />
      </Pressable>
      <Pressable onPress={() => queueSheet.open()} accessibilityRole="button" accessibilityLabel="Playlist" hitSlop={SLOP} className="items-center justify-center" style={GLYPH}>
        <Icon name="list" size={PLAYER.trayIcon} color={idle} />
      </Pressable>
      <Pressable onPress={props.onShare} accessibilityRole="button" accessibilityLabel="Share this episode" hitSlop={SLOP} className="items-center justify-center" style={GLYPH}>
        <Icon name="share-outline" size={PLAYER.trayIcon} color={idle} />
      </Pressable>
    </Box>
  );
}
