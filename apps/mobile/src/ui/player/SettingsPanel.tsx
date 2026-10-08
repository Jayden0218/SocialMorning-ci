// The Playback sheet: speed, sleep, chapters and transcript; loop, audio and the rest behind "More settings".
/**
 * M21 US2 (spec story 2, scenario 2), after 小宇宙's player ⚙: the player's settings in one place —
 * Loop · Route (AirPlay; US11) · Skip silence · Voice boost (US11) · Speed · Sleep, then whatever
 * the player passes in (Chapters, Transcript, Done).
 *
 * M24 US19 (`PlaybackSheet-B`; the iPhone showed a full-screen "Player settings" page): it is B's
 * SHORT bottom sheet again — "Playback", speed (− 1.2× +, presets, the default link), the Sleep
 * tiles with End of episode, then the player's Chapters / Transcript cards and Done — over a dark
 * scrim, paper colour, 24 pt top corners, a handle. Every M21 extra (Loop, Audio output, Skip
 * silence, Voice boost, the fine speed slider, "This show only", 90 min, the fade note) is one tap
 * away behind a "More settings" row, on a second page of the same sheet with a way back. Nothing
 * was removed.
 *
 * Our own views, not a native sheet (guard G-M21-11): an absolute layer over the page. It is
 * rendered only while open, so its timers and slider cost nothing when closed. Tapping the scrim
 * closes it ("Close the player settings", a button to a screen reader).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Toggle } from '@/ui/kit/Toggle';
import { SpeedControl, SpeedMore } from '@/ui/player/SpeedControl';
import { SleepTimerControl } from '@/ui/player/SleepTimerControl';
import { usePlayerPalette } from '@/ui/player/palette';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** At least this much of the page stays visible above the sheet, so there is somewhere to tap to close. */
const TOP_GAP = 64;
const ROW = { minHeight: hit.min };
/** B's handle: 40 × 5. */
const HANDLE = { width: 40, height: 5 };

/** One switch row: an icon, the name and a line under it, the switch. */
function SwitchRow(props: { icon: IconName; title: string; detail: string; value: boolean; onChange: (v: boolean) => void; colour: string; disabled?: boolean }): React.ReactElement {
  return (
    <Box className="flex-row items-center gap-section" style={ROW}>
      <Icon name={props.icon} size={20} color={props.colour} />
      <Box className="flex-1">
        <Text className="text-body font-bold text-text">{props.title}</Text>
        <Text className="text-xs text-muted">{props.detail}</Text>
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
  /** The player's own rows under Sleep: Chapters, Transcript, Done. */
  children?: ReactNode;
}): React.ReactElement | null {
  const c = usePlayerPalette();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  // M24 US19: the sheet's two pages — B's short "Playback", and "More settings".
  const [page, setPage] = useState<'playback' | 'more'>('playback');
  useEffect(() => { if (!props.open) setPage('playback'); }, [props.open]);
  if (!props.open) return null;
  return (
    <Box className="absolute inset-0 justify-end">
      <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close the player settings" className="absolute inset-0 bg-scrim" />
      <Box className="bg-background rounded-t-[24px] overflow-hidden" style={{ maxHeight: screen.height - insets.top - TOP_GAP }} accessibilityViewIsModal>
        <Box className="items-center pt-2 pb-1" accessible={false}>
          <Box className="rounded-pill bg-bar opacity-50" style={HANDLE} />
        </Box>
        <ScrollView style={{ flexGrow: 0 }} bounces={false} contentContainerClassName="px-screen-x pt-1 gap-section" contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
          {page === 'playback' ? (
            <>
              <Text className="text-hero font-display text-text" accessibilityRole="header">Playback</Text>
              <SpeedControl />
              <SleepTimerControl variant="sheet" />
              <Pressable onPress={() => setPage('more')} accessibilityRole="button" accessibilityLabel="More settings: loop, audio output, skip silence, voice boost" className="flex-row items-center gap-row border-t-hairline border-separator" style={ROW}>
                <Icon name="options-outline" size={20} color={c.accent} />
                <Box className="flex-1">
                  <Text className="text-body font-bold text-text">More settings</Text>
                  <Text className="text-xs text-muted" numberOfLines={1}>Loop, audio output, skip silence, voice boost</Text>
                </Box>
                <Icon name="chevron-forward" size={18} color={c.muted} />
              </Pressable>
              {props.children}
            </>
          ) : (
            <>
              <Pressable onPress={() => setPage('playback')} accessibilityRole="button" accessibilityLabel="Back to Playback" className="flex-row items-center gap-1 self-start" style={ROW}>
                <Icon name="chevron-back" size={20} color={c.accent} />
                <Text className="text-body font-bold text-accent">Playback</Text>
              </Pressable>
              <Text className="text-hero font-display text-text" accessibilityRole="header">More settings</Text>
              <SwitchRow icon="repeat-outline" title="Loop this episode" detail="Starts again from 0:00 at its end, instead of moving on" value={props.looping} onChange={props.onLoop} colour={c.accent} />
              {props.routeSlot ?? null}
              <SwitchRow icon="play-forward-outline" title="Skip silence" detail={props.skipSilenceDisabled ? 'Not available for this live stream' : 'Shortens the quiet gaps between words'} value={props.skipSilence} onChange={props.onSkipSilence} colour={c.accent} disabled={props.skipSilenceDisabled === true} />
              {props.voiceBoostSlot ?? null}
              <Box className="h-px bg-border" />
              <SpeedMore />
              <Box className="h-px bg-border" />
              <SleepTimerControl variant="more" />
              <Pressable onPress={() => setPage('playback')} accessibilityRole="button" accessibilityLabel="Back to Playback" className="items-center justify-center rounded-pill bg-surface border border-border" style={ROW}>
                <Text className="text-sm font-bold text-text">Back</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </Box>
    </Box>
  );
}
