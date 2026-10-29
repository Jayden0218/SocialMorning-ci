// The Episode page's thumb zone: back, the show link, the title, then Play and Subscribe.
/**
 * M31 W3-A (T040; design-pulse2 `epTitle`): low and reachable, 112 from the bottom (60 tray + 12 + 40). One row: the 44
 * Back circle (raise) beside the show link — "Morning Notes ›", Geist 600 13 in hot-text — and the title, Unbounded
 * 800 28/1.03, bottom-aligned with the circle, up to four lines. Under it one row, 10 apart: Play this episode (the
 * light pill, flexible, the play glyph before the words; "Pause" while it plays) and Subscribe (the ring pill, 18 of
 * side padding; "Subscribed" quiet once on). Long-pressing the title copies it ("Title copied.", also a screen reader's
 * "Copy title" action). Same names as before: "Show: …", "Play this episode" / "Pause", "Subscribe to this show" /
 * "Unsubscribe from this show".
 *
 * The title's line height is the font's own (35); the drawn 1.03 (29) would crop Unbounded on Android (`FACE_LEADING`).
 */
import { useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { EPISODE } from './measures';

/** The show link is the drawn 13-pt line; its tap area is 48. */
const SHOW_SLOP = { top: 15, bottom: 15, left: 4, right: 12 };

export function EpisodeTitleBlock(props: {
  title: string;
  showTitle: string | undefined;
  playing: boolean;
  subscribed: boolean;
  onBack: () => void;
  onShow: (() => void) | undefined;
  onPlay: () => void;
  onSubscribe: () => void;
  onCopyTitle: () => void;
  /** "120 listened · 4 comments · 2 clips" (empty: no line). In the column, above the show link, so a long title grows upward and never covers it. */
  counts?: string;
  /** "resumes at 12:10", when the episode has been started. */
  resume?: string | undefined;
}): React.ReactElement {
  return (
    <Box testID="episode-title-block" style={{ gap: EPISODE.titleGap }}>
      {/* M31 F13 (widths W5): the stats were drawn at a fixed top over the cover, so a 3-line title covered them at 320 and they ran together at 430.
          In the column's own flow (the block is anchored at its foot, so the title and buttons stay where they were) they cannot be covered. */}
      {(props.counts ?? '') !== '' || props.resume !== undefined ? (
        <Box testID="episode-counts" className="flex-row flex-wrap" style={{ columnGap: EPISODE.pillGap * 2, rowGap: 2 }}>
          {(props.counts ?? '') !== '' ? <Type step="mono" className="text-text2" numberOfLines={2}>{props.counts}</Type> : null}
          {props.resume !== undefined ? <Type step="mono" className="text-hotText" numberOfLines={1}>{props.resume}</Type> : null}
        </Box>
      ) : null}
      <Box className="flex-row items-end gap-row">
        <IconButton icon="chevron-back" label="Back" onPress={props.onBack} fill size={22} />
        <Box className="flex-1 min-w-0">
          {props.showTitle !== undefined && props.onShow !== undefined ? (
            <Pressable onPress={props.onShow} accessibilityRole="link" accessibilityLabel={`Show: ${props.showTitle}`} hitSlop={SHOW_SLOP} className="self-start max-w-full">
              <Type step="caption" className="text-hotText font-semibold" style={{ fontSize: EPISODE.showLine }} numberOfLines={1}>{`${props.showTitle} ›`}</Type>
            </Pressable>
          ) : null}
          {/* M22 US17 item 7: long-press the title to copy it. */}
          <Type
            step="hero"
            className="text-text mt-hair"
            style={{ fontSize: EPISODE.title, lineHeight: EPISODE.titleLine }}
            numberOfLines={useWindowDimensions().fontScale > 1.3 ? 3 : 4}
            accessibilityRole="header"
            accessibilityHint="Long-press to copy the title"
            accessibilityActions={[{ name: 'longpress', label: 'Copy title' }]}
            onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') props.onCopyTitle(); }}
            onLongPress={props.onCopyTitle}
          >
            {props.title}
          </Type>
        </Box>
      </Box>
      <Box className="flex-row" style={{ gap: EPISODE.buttonsGap }}>
        <PulseButton label={props.playing ? 'Pause' : 'Play this episode'} icon={props.playing ? 'pause' : 'play'} kind="light" onPress={props.onPlay} className="flex-1" />
        <PulseButton
          label={props.subscribed ? 'Subscribed' : 'Subscribe'}
          accessibilityLabel={props.subscribed ? 'Unsubscribe from this show' : 'Subscribe to this show'}
          kind={props.subscribed ? 'quiet' : 'ring'}
          selected={props.subscribed}
          padX={EPISODE.ringPadX}
          onPress={props.onSubscribe}
        />
      </Box>
    </Box>
  );
}
