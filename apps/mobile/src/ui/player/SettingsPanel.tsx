// The player's settings as a full-screen panel: loop, skip silence, speed, sleep, chapters and transcript.
/**
 * M21 US2 (spec story 2, scenario 2), after 小宇宙's player ⚙: the "Playback" sheet becomes a panel
 * over the whole player — the warm paper under a light blur — with, top to bottom:
 *   Loop · Route (AirPlay; US11, hidden until T120) · Skip silence · Voice boost (US11, hidden
 *   until T113) · Speed · Sleep, then whatever the player passes in (Chapters, Transcript, Done).
 * Tapping the empty area above the content closes it ("Close", a button to a screen reader).
 *
 * Our own views, not a native sheet (guard G-M21-11): an absolute layer over the page. It is
 * rendered only while open, so its timers and slider cost nothing when closed.
 */
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Toggle } from '@/ui/kit/Toggle';
import { SpeedControl } from '@/ui/player/SpeedControl';
import { SleepTimerControl } from '@/ui/player/SleepTimerControl';
import { usePlayerPalette } from '@/ui/player/palette';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** How much of the screen stays empty above the content, so there is somewhere to tap to close. */
const TOP_GAP = 96;
const ROW = { minHeight: hit.min };

/** One switch row: an icon, the name and a line under it, the switch. */
function SwitchRow(props: { icon: IconName; title: string; detail: string; value: boolean; onChange: (v: boolean) => void; colour: string }): React.ReactElement {
  return (
    <Box className="flex-row items-center gap-section" style={ROW}>
      <Icon name={props.icon} size={20} color={props.colour} />
      <Box className="flex-1">
        <Text className="text-body font-bold text-text">{props.title}</Text>
        <Text className="text-xs text-muted">{props.detail}</Text>
      </Box>
      <Toggle value={props.value} onChange={props.onChange} label={props.title} />
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
  /** US11 (T120): the AirPlay / output route button. Absent = the row is hidden. */
  routeSlot?: ReactNode;
  /** US11 (T113): the voice boost switch. Absent = the row is hidden. */
  voiceBoostSlot?: ReactNode;
  /** The player's own rows under Sleep: Chapters, Transcript, Done. */
  children?: ReactNode;
}): React.ReactElement | null {
  const c = usePlayerPalette();
  const insets = useSafeAreaInsets();
  if (!props.open) return null;
  return (
    <Box className="absolute inset-0">
      <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
      <Box className="absolute inset-0 bg-veil" />
      <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close the player settings" style={{ height: TOP_GAP + insets.top }} />
      <Box className="flex-1 bg-background rounded-t-row border-t border-border">
        <Text className="text-hero font-display text-text px-screen-x pt-row" accessibilityRole="header">Player settings</Text>
        <ScrollView className="flex-1" contentContainerClassName="px-screen-x pt-row gap-section" contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
          <SwitchRow icon="repeat-outline" title="Loop this episode" detail="Starts again from 0:00 at its end, instead of moving on" value={props.looping} onChange={props.onLoop} colour={c.accent} />
          {props.routeSlot ?? null}
          <SwitchRow icon="play-forward-outline" title="Skip silence" detail="Shortens the quiet gaps between words" value={props.skipSilence} onChange={props.onSkipSilence} colour={c.accent} />
          {props.voiceBoostSlot ?? null}
          <Box className="h-px bg-border" />
          <SpeedControl />
          <Box className="h-px bg-border" />
          <SleepTimerControl />
          {props.children}
        </ScrollView>
      </Box>
    </Box>
  );
}
