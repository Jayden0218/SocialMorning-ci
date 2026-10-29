// The Playback sheet: the speed dial and the sleep rings; loop, audio and the rest behind "More settings".
/**
 * Round 2 (owner, 2026-10-28): the blocks are 14 apart (they were 16), the tiles radius 20 with the drawn 14 / 12 padding and 11 radius
 * icon chips, the rows of the first tile are 1 px apart as drawn, "More settings" wraps its line instead of cutting it, the back link is
 * the drawn one line (48 to the finger by `hitSlop`), the page-two title is Unbounded 24, and page two has no close circle (the
 * drawing has Back and the scrim). The More settings glyph is the gear (`settings-outline`).
 *
 * M21 US2 (spec story 2, scenario 2), after 小宇宙's player ⚙: the player's settings in one place —
 * Loop · Route (AirPlay; US11) · Skip silence · Voice boost (US11) · Speed · Sleep.
 *
 * M31 T024 (design-pulse2 `player--playback-sheet`, `player--playback-more-settings`): the kit
 * `ActionSheet` — raise2, 32 corners, the grabber — titled "Playback" (Unbounded 20, with a 36 close
 * circle named "Close the player settings"). Page one: the speed dial block (`SpeedControl`), a rule,
 * the sleep rings (`SleepTimerControl`), a "More settings" tile, and Done (a light pill, "Close").
 * Page two ("‹ Playback", then "More settings" in Unbounded 24): one tile with Loop this episode, Audio
 * output (the route picker; hidden when the phone offers none), Skip silence (greyed with the reason
 * on a live stream) and Voice boost; then "Speed, finer" and "Sleep, longer"; then Back. The second page
 * replaces the first at once (the drawing slides it in over 240 ms; fades only is what the kit's sheet does).
 * Chapters and Transcript are no longer here: they moved to the More sheet (design action map).
 * Everything M21 added is still one tap away. It is rendered only while open, so its timers cost nothing closed.
 */
import { useContext, useEffect, useState, type ReactNode } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { bars, hit } from '@/design';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { Toggle } from '@/ui/kit/Toggle';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { useColours } from '@/ui/kit/useColours';
import { SpeedControl, SpeedMore } from '@/ui/player/SpeedControl';
import { SleepTimerControl } from '@/ui/player/SleepTimerControl';
import { PLAYER } from '@/ui/player/measures';

const ROW = { minHeight: hit.min };
/** The back link is one drawn line (18); the finger gets 48. */
const BACK_SLOP = { top: 15, bottom: 15, left: 8, right: 16 };
const RULE = { borderTopWidth: 1, borderTopColor: PLAYER.rowRule };
const PANEL = { borderRadius: PLAYER.panelRadius };
const CHIP = { width: PLAYER.panelIcon, height: PLAYER.panelIcon, borderRadius: PLAYER.panelIconRadius };
const PAD = { minHeight: PLAYER.panelRow, paddingVertical: PLAYER.panelRowPadY, paddingHorizontal: PLAYER.panelPad, gap: PLAYER.rowGap };

/** One switch row: an icon chip, the name and a line under it, the switch. */
function SwitchRow(props: { icon: IconName; title: string; detail: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }): React.ReactElement {
  const c = useColours();
  return (
    <Box className="flex-row items-center" style={PAD}>
      <Box className="items-center justify-center bg-raise2" style={CHIP}><Icon name={props.icon} size={PLAYER.panelIconGlyph} color={c.hotText} /></Box>
      <Box className="flex-1">
        <Type step="row" className="text-text">{props.title}</Type>
        <Type step="caption" className="text-text2" style={{ fontSize: PLAYER.panelDetail, lineHeight: PLAYER.panelDetailLine, marginTop: PLAYER.detailGap }}>{props.detail}</Type>
      </Box>
      <Toggle value={props.value} onChange={props.onChange} label={props.title} disabled={props.disabled === true} />
    </Box>
  );
}

export function SettingsPanel(props: {
  open: boolean;
  onClose: () => void;
  looping: boolean;
  onLoop: (on: boolean) => void;
  skipSilence: boolean;
  onSkipSilence: (on: boolean) => void;
  /** M21 US11: true on iPhone for an HLS episode — the audio tap gets nothing, so the switch is greyed out. */
  skipSilenceDisabled?: boolean;
  /** US11 (T120): the AirPlay / output route button. Absent = the row is hidden. */
  routeSlot?: ReactNode;
  /** US11 (T113): the voice boost switch. Absent = the row is hidden. */
  voiceBoostSlot?: ReactNode;
}): React.ReactElement | null {
  const c = useColours();
  const screen = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext);
  // The sheet's two pages — "Playback", and "More settings".
  const [page, setPage] = useState<'playback' | 'more'>('playback');
  useEffect(() => { if (!props.open) setPage('playback'); }, [props.open]);
  if (!props.open) return null;
  const close = (
    <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close the player settings" hitSlop={(hit.min - bars.sheetClose) / 2} className="items-center justify-center rounded-pill bg-raise" style={{ width: bars.sheetClose, height: bars.sheetClose }}>
      <Icon name="close" size={PLAYER.panelIconGlyph} color={c.text} />
    </Pressable>
  );
  // M31 F13 (widths W10): on a short window the sheet (grabber zone 27 above the body, the home inset + 12 below, the pinned Done row and its gap) must
  // fit under the status bar + 20, so "More settings" scrolls into reach and Done is always on screen. On a tall one the old 80 % holds.
  const pinned = page === 'playback';
  const chrome = 27 + (insets?.bottom ?? 0) + 12 + (pinned ? hit.min + bars.sheetGap : 0);
  const bodyMax = Math.min(screen.height * 0.8, screen.height - Math.max(insets?.top ?? 0, 50) - 20 - chrome);
  const done = (
    <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center rounded-pill bg-text" style={[ROW, { marginTop: bars.sheetGap }]}>
      <Type step="row" className="text-void">Done</Type>
    </Pressable>
  );
  return (
    <ActionSheet open={props.open} onClose={props.onClose} label="Playback">
      <ScrollView style={{ flexGrow: 0, maxHeight: bodyMax }} bounces={false} contentContainerStyle={{ gap: bars.sheetGap }} showsVerticalScrollIndicator={false}>
        {page === 'playback' ? (
          <>
            <Box className="flex-row items-center justify-between">
              <Type step="heading" className="text-text flex-1" accessibilityRole="header">Playback</Type>
              {close}
            </Box>
            <SpeedControl />
            <Box className="bg-line" style={{ height: 1 }} />
            <SleepTimerControl variant="sheet" />
            <Pressable onPress={() => setPage('more')} accessibilityRole="button" accessibilityLabel="More settings: loop, audio output, skip silence, voice boost" className="flex-row items-center bg-raise" style={[PAD, PANEL]}>
              <Box className="items-center justify-center bg-raise2" style={CHIP}><Icon name="settings-outline" size={PLAYER.panelIconGlyph} color={c.hotText} /></Box>
              <Box className="flex-1">
                <Type step="row" className="text-text">More settings</Type>
                <Type step="caption" className="text-text2" style={{ fontSize: PLAYER.panelDetail, lineHeight: PLAYER.panelDetailLine, marginTop: PLAYER.detailGap }}>Loop, audio output, skip silence, voice boost</Type>
              </Box>
              <Icon name="chevron-forward" size={PLAYER.panelIconGlyph} color={c.text3} />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable onPress={() => setPage('playback')} accessibilityRole="button" accessibilityLabel="Back to Playback" hitSlop={BACK_SLOP} className="flex-row items-center gap-hair self-start">
              <Icon name="chevron-back" size={PLAYER.panelIconGlyph} color={c.hotText} />
              <Type step="row" className="text-hotText">Playback</Type>
            </Pressable>
            <Type step="statement" className="text-text" accessibilityRole="header" style={{ lineHeight: PLAYER.moreTitleLine }}>More settings</Type>
            <Box testID="settings-tile" className="bg-raise overflow-hidden" style={PANEL}>
              {[
                <SwitchRow key="loop" icon="repeat-outline" title="Loop this episode" detail="Starts again from 0:00 at its end, instead of moving on" value={props.looping} onChange={props.onLoop} />,
                props.routeSlot,
                <SwitchRow key="skip" icon="play-forward-outline" title="Skip silence" detail={props.skipSilenceDisabled ? 'Not available for this live stream' : 'Shortens the quiet gaps between words'} value={props.skipSilence} onChange={props.onSkipSilence} disabled={props.skipSilenceDisabled === true} />,
                props.voiceBoostSlot,
              ].filter((row) => row != null).map((row, k) => (
                <Box key={k} style={k > 0 ? RULE : undefined}>{row}</Box>
              ))}
            </Box>
            <SpeedMore />
            <SleepTimerControl variant="more" />
            <Pressable onPress={() => setPage('playback')} accessibilityRole="button" accessibilityLabel="Back to Playback" className="items-center justify-center rounded-pill bg-raise" style={ROW}>
              <Type step="row" className="text-text">Back</Type>
            </Pressable>
          </>
        )}
      </ScrollView>
      {pinned ? done : null}
    </ActionSheet>
  );
}
